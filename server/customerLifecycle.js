// ====== دورة حياة حساب العميل (Express Router) ======

const express = require('express');
const { requireAuth } = require('./authMiddleware');
const { initFirebaseAdmin } = require('./firebaseAdmin');

const router = express.Router();
const TRIAL_DAYS = 7; // ⚠️ عدّل مدة الفترة التجريبية المجانية حسب استراتيجيتك

/** POST /api/initialize-customer (محمي) - يُستدعى مرة واحدة بعد إنشاء حساب جديد */
router.post('/initialize-customer', requireAuth, async (req, res) => {
    const admin = initFirebaseAdmin();
    const db = admin.firestore();
    const customerRef = db.collection('customers').doc(req.customerId);

    const existing = await customerRef.get();
    if (existing.exists) {
        return res.json({ alreadyExists: true }); // لا تُعِد تصفير اشتراك موجود مسبقاً
    }

    const now = Date.now();
    await customerRef.set({
        email: req.customerEmail,
        displayName: (req.body && req.body.displayName) || '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        subscription: {
            status: 'trial',
            plan: 'monthly',
            paymentMethod: null,
            trialEndsAt: now + TRIAL_DAYS * 24 * 60 * 60 * 1000,
            currentPeriodEnd: now + TRIAL_DAYS * 24 * 60 * 60 * 1000,
            lastPaymentId: null
        },
        settings: null // يملؤها العميل بنفسه في معالج الإعداد الأولي
    });

    res.json({ alreadyExists: false });
});

/**
 * GET /api/cron/check-expiring?token=CRON_SECRET
 * محمي برمز سرّي بسيط في الرابط نفسه (وليس بتسجيل دخول عميل، لأن من يستدعيه
 * خدمة جدولة خارجية مجانية مثل cron-job.org وليس متصفح عميل). اربط هذا
 * الرابط في تلك الخدمة ليعمل مرة يومياً - راجع README.md.
 */
router.get('/cron/check-expiring', async (req, res) => {
    if (req.query.token !== process.env.CRON_SECRET) {
        return res.status(403).send('رمز الجدولة غير صحيح.');
    }

    const admin = initFirebaseAdmin();
    const db = admin.firestore();
    const now = Date.now();
    const reminderWindowMs = 3 * 24 * 60 * 60 * 1000; // تذكير قبل ٣ أيام من الانتهاء

    const activeSnap = await db.collection('customers')
        .where('subscription.status', 'in', ['active', 'trial'])
        .get();

    const batch = db.batch();
    let expiredCount = 0;
    let reminderCount = 0;

    activeSnap.forEach((docSnap) => {
        const sub = docSnap.data().subscription || {};
        const periodEnd = sub.currentPeriodEnd || 0;

        if (periodEnd <= now) {
            batch.update(docSnap.ref, { 'subscription.status': 'expired' });
            expiredCount++;
        } else if (periodEnd - now <= reminderWindowMs && sub.paymentMethod === 'zaincash') {
            batch.update(docSnap.ref, { 'subscription.renewalReminderNeeded': true });
            reminderCount++;
        }
    });

    await batch.commit();
    const summary = `فحص الاشتراكات: ${expiredCount} منتهي، ${reminderCount} بحاجة تذكير.`;
    console.log(summary);
    res.status(200).send(summary);
});

module.exports = { router, TRIAL_DAYS };
