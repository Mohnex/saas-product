// ====== تكامل بوابة البطاقات (Express Router) ======
// ⚠️ هيكل (scaffold) وليس تكاملاً فعلياً - لا تزال بحاجة لوثيقة API حقيقية
// من Blue أو NASS Pay. أرسلها لي فور حصولك عليها لأكمل هذا الملف فعلياً.

const express = require('express');
const { requireAuth } = require('./authMiddleware');

const router = express.Router();
const SUBSCRIPTION_PRICE_USD = 10; // ⚠️ عدّل لسعرك الفعلي

/** POST /api/create-card-payment (محمي) */
router.post('/create-card-payment', requireAuth, async (req, res) => {
    // TODO: استبدل هذا بالاستدعاء الفعلي لواجهة Blue أو NASS Pay، مثال متوقّع:
    //
    //   const response = await axios.post('https://api.<gateway>.iq/v1/subscriptions', {
    //       amount: SUBSCRIPTION_PRICE_USD, currency: 'USD', interval: 'monthly',
    //       customerReference: req.customerId, successUrl: req.body.redirectUrl,
    //       webhookUrl: `${process.env.BACKEND_BASE_URL}/card-payment-webhook`
    //   }, { headers: { Authorization: `Bearer ${process.env.CARD_GATEWAY_API_KEY}` } });
    //   return res.json({ paymentUrl: response.data.checkoutUrl });

    res.status(501).json({ error: 'الدفع بالبطاقة غير مفعّل بعد - يحتاج وثيقة API فعلية من Blue أو NASS Pay أولاً.' });
});

/** POST /card-payment-webhook (عام - تستدعيه بوابة البطاقة مباشرة) */
router.post('/card-payment-webhook', async (req, res) => {
    // TODO: تحقق من توقيع الطلب حسب توثيق بوابتك (HMAC غالباً)، مثال:
    //   const signature = req.headers['x-gateway-signature'];
    //   const expected = crypto.createHmac('sha256', process.env.CARD_GATEWAY_WEBHOOK_SECRET)
    //       .update(JSON.stringify(req.body)).digest('hex');
    //   if (signature !== expected) return res.status(400).send('توقيع غير صالح');
    //
    // ثم فعّل الاشتراك فعلياً (نفس نمط zaincash.js):
    //   const { activateOrExtendSubscription, recordPayment } = require('./subscriptions');
    //   await activateOrExtendSubscription(customerId, { paymentMethod: 'card', paymentId: transactionId });

    res.status(501).send('هذا الـ webhook غير مفعّل بعد - أكمل التحقق من التوقيع أولاً.');
});

module.exports = { router, SUBSCRIPTION_PRICE_USD };
