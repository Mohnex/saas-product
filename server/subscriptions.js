// ====== إدارة الاشتراكات - المنطق المشترك ======
const { initFirebaseAdmin } = require('./firebaseAdmin');

const PLAN_DURATION_DAYS = 30; // اشتراك شهري

/**
 * يفعّل أو يمدّد اشتراك عميل بعد التحقق الفعلي من نجاح دفعة حقيقية.
 * لا يُستدعى هذا أبداً إلا بعد تأكيد الدفع من بوابة الدفع نفسها.
 */
async function activateOrExtendSubscription(customerId, { paymentMethod, paymentId }) {
    const admin = initFirebaseAdmin();
    const db = admin.firestore();
    const customerRef = db.collection('customers').doc(customerId);

    return db.runTransaction(async (tx) => {
        const customerSnap = await tx.get(customerRef);
        if (!customerSnap.exists) {
            throw new Error(`Customer ${customerId} not found during activation`);
        }

        const now = Date.now();
        const currentSub = customerSnap.data().subscription || {};
        // إن كان الاشتراك ما زال فعّالاً (تجديد مبكر)، مدّد من تاريخ انتهائه
        // الحالي بدل اليوم، حتى لا يخسر العميل أياماً مدفوعة مسبقاً.
        const baseTimestamp = (currentSub.currentPeriodEnd && currentSub.currentPeriodEnd > now)
            ? currentSub.currentPeriodEnd
            : now;
        const newPeriodEnd = baseTimestamp + PLAN_DURATION_DAYS * 24 * 60 * 60 * 1000;

        tx.update(customerRef, {
            'subscription.status': 'active',
            'subscription.paymentMethod': paymentMethod,
            'subscription.currentPeriodEnd': newPeriodEnd,
            'subscription.lastPaymentId': paymentId,
            'subscription.lastPaymentAt': now,
            'subscription.renewalReminderNeeded': false,
            'subscription.updatedAt': admin.firestore.FieldValue.serverTimestamp()
        });

        return { newPeriodEnd };
    });
}

/** يسجّل عملية دفع (ناجحة أو فاشلة) في سجل التدقيق المستقل. */
async function recordPayment({ customerId, gateway, amount, currency, status, gatewayTransactionId, rawResponse }) {
    const admin = initFirebaseAdmin();
    const db = admin.firestore();
    const paymentRef = db.collection('payments').doc();
    await paymentRef.set({
        customerId,
        gateway,
        amount,
        currency,
        status,
        gatewayTransactionId: gatewayTransactionId || null,
        rawResponse: rawResponse || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return paymentRef.id;
}

module.exports = { activateOrExtendSubscription, recordPayment, PLAN_DURATION_DAYS };
