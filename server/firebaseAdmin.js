// ====== تهيئة Firebase Admin SDK ======
// بخلاف Cloud Functions (التي تحصل على صلاحياتها تلقائياً)، هذا خادم خارجي
// (Render) يحتاج مفتاح حساب خدمة (Service Account Key) صريحاً لإثبات هويته
// لمشروع فايربيس. يُقرأ من متغيّر بيئة (Environment Variable) وليس من ملف
// مرفق بالكود - هذا مهم جداً أمنياً، لا تضع هذا المفتاح أبداً في أي ملف
// يُرفع لـ GitHub.
//
// كيف تحصل عليه: console.firebase.google.com → ⚙️ Project Settings →
// Service Accounts → Generate new private key (يُنزَّل ملف JSON).
// حوّله لسطر واحد Base64 (انظر README.md لطريقة ذلك بالضبط)، وضعه في متغيّر
// بيئة اسمه FIREBASE_SERVICE_ACCOUNT_BASE64 على Render.

const admin = require('firebase-admin');

function initFirebaseAdmin() {
    if (admin.apps.length > 0) return admin; // مُهيَّأ مسبقاً (مثلاً بعد إعادة تحميل ساخن)

    const base64Key = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!base64Key) {
        throw new Error(
            'متغيّر البيئة FIREBASE_SERVICE_ACCOUNT_BASE64 غير مضبوط. ' +
            'راجع README.md لمعرفة كيفية الحصول عليه وضبطه على Render.'
        );
    }

    let serviceAccount;
    try {
        const jsonStr = Buffer.from(base64Key, 'base64').toString('utf-8');
        serviceAccount = JSON.parse(jsonStr);
    } catch (e) {
        throw new Error('تعذّر قراءة FIREBASE_SERVICE_ACCOUNT_BASE64 - تأكد أنه Base64 صحيح لملف JSON كامل.');
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    return admin;
}

module.exports = { initFirebaseAdmin };
