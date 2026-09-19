// ====== تكامل زين كاش (Express Router) ======
// ⚠️ نفس التحفظ السابق: مبني وفق النمط الموثّق علناً، وليس وثيقة API كاملة
// مباشرة (تتطلب حساب تاجر فعّال). راجع لوحة تاجرك فور تفعيلها وتأكد من
// مطابقة أسماء الحقول ونقاط النهاية تماماً.
//
// تذكير: زين كاش لا تدعم على الأغلب اشتراكاً تلقائياً متكرراً - كل معاملة
// دفعة واحدة. التجديد الشهري عبرها يتم بتذكير العميل ليدفع يدوياً كل شهر.

const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { requireAuth } = require('./authMiddleware');
const { activateOrExtendSubscription, recordPayment } = require('./subscriptions');

const router = express.Router();

// ====== إعدادات الحساب التجاري (من متغيّرات بيئة على Render، وليست
// مكتوبة هنا أبداً كنص صريح) ======
// اضبطها في لوحة Render: Environment → Add Environment Variable
//   ZAINCASH_MERCHANT_ID
//   ZAINCASH_MSISDN  (رقم محفظة التاجر)
//   ZAINCASH_SECRET
const ZAINCASH_IS_PRODUCTION = false; // بدّلها إلى true بعد اعتماد حسابك من زين كاش لبيئة الإنتاج
const ZAINCASH_BASE_URL = ZAINCASH_IS_PRODUCTION ? 'https://api.zaincash.iq' : 'https://test.zaincash.iq';
const SUBSCRIPTION_PRICE_IQD = 15000; // ⚠️ عدّل هذا الرقم لسعر اشتراكك الشهري الفعلي

function getZainCashConfig() {
    const merchantId = process.env.ZAINCASH_MERCHANT_ID;
    const msisdn = process.env.ZAINCASH_MSISDN;
    const secret = process.env.ZAINCASH_SECRET;
    if (!merchantId || !msisdn || !secret) {
        throw new Error('إعدادات زين كاش غير مكتملة على الخادم (تحقق من متغيرات البيئة على Render).');
    }
    return { merchantId, msisdn, secret };
}

/** POST /api/create-zaincash-payment (محمي) - يبدأ عملية دفع جديدة */
router.post('/create-zaincash-payment', requireAuth, async (req, res) => {
    const { redirectUrl } = req.body || {};
    if (!redirectUrl) {
        return res.status(400).json({ error: 'redirectUrl مطلوب.' });
    }

    let config;
    try {
        config = getZainCashConfig();
    } catch (e) {
        console.error(e.message);
        return res.status(500).json({ error: 'الخادم غير جاهز لمعالجة دفعات زين كاش بعد.' });
    }

    const orderId = `${req.customerId}_${Date.now()}`;
    const payload = {
        amount: SUBSCRIPTION_PRICE_IQD,
        serviceType: 'اشتراك شهري - مخطط الادخار',
        msisdn: config.msisdn,
        orderId,
        redirectUrl
    };
    const token = jwt.sign(payload, config.secret, { algorithm: 'HS256', expiresIn: '4h' });

    try {
        const response = await axios.post(`${ZAINCASH_BASE_URL}/transaction/init`, {
            token,
            merchantId: config.merchantId,
            lang: 'ar'
        });

        const transactionId = response.data && response.data.id;
        if (!transactionId) {
            throw new Error('لم تُعِد زين كاش معرّف معاملة صالحاً: ' + JSON.stringify(response.data));
        }

        await recordPayment({
            customerId: req.customerId,
            gateway: 'zaincash',
            amount: SUBSCRIPTION_PRICE_IQD,
            currency: 'IQD',
            status: 'pending',
            gatewayTransactionId: transactionId
        });

        res.json({
            paymentUrl: `${ZAINCASH_BASE_URL}/transaction/pay?id=${transactionId}`,
            transactionId
        });
    } catch (err) {
        console.error('ZainCash init failed:', err.response ? err.response.data : err.message);
        res.status(500).json({ error: 'تعذر بدء عملية الدفع مع زين كاش.' });
    }
});

/**
 * GET/POST /zaincash-callback (عام - تستدعيها زين كاش مباشرة، وليس متصفح
 * العميل عبر تسجيل دخول، لذا لا يوجد requireAuth هنا؛ الحماية تأتي من
 * التحقق من توقيع JWT بالسرّ الخاص بك أدناه).
 */
router.all('/zaincash-callback', async (req, res) => {
    const token = req.query.token || (req.body && req.body.token);
    if (!token) {
        return res.status(400).send('رمز التحقق مفقود.');
    }

    let config;
    try {
        config = getZainCashConfig();
    } catch (e) {
        console.error(e.message);
        return res.status(500).send('الخادم غير مهيّأ بشكل صحيح.');
    }

    let decoded;
    try {
        decoded = jwt.verify(token, config.secret, { algorithms: ['HS256'] });
    } catch (err) {
        console.error('ZainCash callback: invalid token signature:', err.message);
        return res.status(400).send('توقيع غير صالح - تم رفض الطلب.');
    }

    const orderId = decoded.orderId || '';
    const customerId = orderId.split('_')[0];
    if (!customerId) {
        return res.status(400).send('لم يمكن استخراج هوية العميل من المعاملة.');
    }

    const frontendBaseUrl = process.env.FRONTEND_BASE_URL || '';

    if (decoded.status === 'success') {
        try {
            await activateOrExtendSubscription(customerId, {
                paymentMethod: 'zaincash',
                paymentId: decoded.id || decoded.operationid
            });
            await recordPayment({
                customerId,
                gateway: 'zaincash',
                amount: SUBSCRIPTION_PRICE_IQD,
                currency: 'IQD',
                status: 'completed',
                gatewayTransactionId: decoded.id || decoded.operationid,
                rawResponse: decoded
            });
            res.redirect(302, `${frontendBaseUrl}/billing.html?status=success`);
        } catch (err) {
            console.error('Failed to activate subscription after ZainCash success:', err);
            res.status(500).send('تم الدفع لكن تعذّر تفعيل الاشتراك - تواصل مع الدعم.');
        }
    } else {
        await recordPayment({
            customerId,
            gateway: 'zaincash',
            amount: SUBSCRIPTION_PRICE_IQD,
            currency: 'IQD',
            status: 'failed',
            gatewayTransactionId: decoded.id,
            rawResponse: decoded
        });
        res.redirect(302, `${frontendBaseUrl}/billing.html?status=failed`);
    }
});

module.exports = { router, SUBSCRIPTION_PRICE_IQD };
