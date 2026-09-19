// ====== الخادم الخلفي المجاني - نقطة الدخول الرئيسية ======
const express = require('express');
const cors = require('cors');

const zaincashRoutes = require('./zaincash');
const cardGatewayRoutes = require('./cardGateway');
const customerLifecycleRoutes = require('./customerLifecycle');

const app = express();
app.use(express.json());

// ====== CORS ======
// الواجهة الأمامية (Firebase Hosting) والخادم الخلفي (Render) على نطاقين
// مختلفين تماماً، لذا لا بد من هذا الإعداد صراحة وإلا رفض المتصفح كل طلب.
// ⚠️ عدّل FRONTEND_BASE_URL في متغيرات البيئة على Render لرابط موقعك الفعلي
// بعد نشره على Firebase Hosting (مثال: https://your-project.web.app).
const allowedOrigin = process.env.FRONTEND_BASE_URL || '*';
app.use(cors({ origin: allowedOrigin }));

// ====== نقطة فحص الصحة (Health Check) ======
// تُستخدم لاختبار أن الخادم يعمل، ويمكن أيضاً استخدامها مع خدمة "ping"
// مجانية خارجية لتقليل فترات سكون الخادم (اختياري - راجع README.md).
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api', zaincashRoutes.router);
app.use('/', zaincashRoutes.router); // يسمح بمسار /zaincash-callback المباشر (بدون بادئة /api) لأنه رابط ثابت يُعطى لزين كاش
app.use('/api', cardGatewayRoutes.router);
app.use('/', cardGatewayRoutes.router); // لنفس سبب /card-payment-webhook أعلاه
app.use('/api', customerLifecycleRoutes.router);

app.use((req, res) => {
    res.status(404).json({ error: 'المسار غير موجود.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ error: 'خطأ داخلي غير متوقع في الخادم.' });
});

const PORT = process.env.PORT || 3000;

// ====== فحص إعدادات أساسية عند بدء التشغيل ======
// يفشل بوضوح فوراً بدل أن يعمل بصمت وتظهر الأخطاء لاحقاً بشكل غامض عند أول
// طلب حقيقي من عميل.
const REQUIRED_ENV_VARS = ['FIREBASE_SERVICE_ACCOUNT_BASE64'];
const missingVars = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
if (missingVars.length > 0) {
    console.warn(`⚠️ متغيرات بيئة إلزامية مفقودة: ${missingVars.join(', ')} - راجع README.md.`);
}
if (!process.env.ZAINCASH_MERCHANT_ID) {
    console.warn('⚠️ إعدادات زين كاش غير مضبوطة بعد - الدفع عبرها سيفشل حتى تضبطها.');
}
if (!process.env.CRON_SECRET) {
    console.warn('⚠️ CRON_SECRET غير مضبوط - نقطة فحص الاشتراكات اليومية غير محمية بعد.');
}

app.listen(PORT, () => {
    console.log(`✅ الخادم يعمل على المنفذ ${PORT}`);
});
