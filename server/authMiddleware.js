// ====== التحقق من هوية العميل ======
// الواجهة الأمامية ترسل رمز دخول Firebase (ID Token) مع كل طلب محمي، بدل
// الاعتماد على request.auth التلقائي في Cloud Functions. هذا middleware
// يتحقق من صحة الرمز مع فايربيس نفسها (وليس فقط بفك تشفيره محلياً) قبل
// السماح بتنفيذ أي طلب.

const { initFirebaseAdmin } = require('./firebaseAdmin');

async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) {
        return res.status(401).json({ error: 'يجب تسجيل الدخول (رمز الدخول مفقود).' });
    }

    try {
        const admin = initFirebaseAdmin();
        const decoded = await admin.auth().verifyIdToken(match[1]);
        req.customerId = decoded.uid;
        req.customerEmail = decoded.email || null;
        next();
    } catch (e) {
        console.error('Token verification failed:', e.message);
        return res.status(401).json({ error: 'رمز الدخول غير صالح أو منتهي - سجّل الدخول مجدداً.' });
    }
}

module.exports = { requireAuth };
