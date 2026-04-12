# ✉ مرسل طلبات التوظيف — Job Mailer

تطبيق ويب يتيح إرسال طلبات التوظيف (CV) لمئات الشركات بضغطة واحدة، مع تتبع الوصول والفتح.

## المميزات
- 📂 رفع قائمة إيميلات من Excel
- 📄 إرفاق CV تلقائياً مع كل رسالة
- 🎯 تخصيص الرسالة لكل شركة ({{CompanyName}} وغيرها)
- ✅ تتبع وصول كل إيميل
- 👁 تتبع فتح الإيميلات (Tracking Pixel)
- 🛡 حماية من الحظر (تأخير قابل للضبط + حد يومي)
- 📊 إحصائيات لحظية

---

## هيكل المشروع

```
job-mailer/
├── backend/        ← Node.js + Express (خادم الإرسال)
│   ├── server.js
│   └── package.json
└── frontend/       ← React (واجهة المستخدم)
    ├── src/
    │   ├── App.js
    │   └── index.css
    └── package.json
```

---

## التشغيل المحلي

### Backend
```bash
cd backend
npm install
node server.js
# ✅ Server running on port 3001
```

### Frontend
```bash
cd frontend
npm install
npm start
# يفتح المتصفح على http://localhost:3000
```

---

## النشر على الإنترنت

### Backend → Railway (مجاني)
1. اذهب إلى [railway.app](https://railway.app)
2. New Project ← Deploy from GitHub repo
3. اختر مجلد `backend`
4. ستحصل على رابط عام تلقائياً

### Frontend → Vercel (مجاني)
1. اذهب إلى [vercel.com](https://vercel.com)
2. New Project ← Import from GitHub
3. اختر مجلد `frontend`
4. Build Command: `npm run build`
5. Output Directory: `build`

---

## متطلبات Gmail
- فعّل التحقق بخطوتين (2FA)
- أنشئ App Password من: الإعدادات ← الأمان ← كلمات مرور التطبيقات
- الحد اليومي لـ Gmail: ~500 (نوصي بـ 200 كحد أقصى)

---

## نصائح تجنب الحظر
- ✓ تأخير 30 ثانية+ بين كل رسالة
- ✓ لا تتجاوز 200 إيميل/يوم
- ✓ خصّص كل رسالة باسم الشركة
- ✓ استخدم App Password دائماً
