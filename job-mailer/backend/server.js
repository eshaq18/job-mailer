require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const multer = require("multer");
const XLSX = require("xlsx");
const cors = require("cors");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

const trackingStore = {};

const getEmail = (c) =>
  c.Email || c.email || c.EMAIL ||
  c["الإيميل"] || c["البريد الإلكتروني"] || c["البريد"] || "";

const getCompany = (c) =>
  c.Company || c.company || c["الشركة"] || c["اسم الشركة"] || "";

const getContact = (c) =>
  c.ContactName || c.contact_name || c["الاسم"] || c["اسم التواصل"] || "Hiring Manager";

const getCity = (c) =>
  c.City || c.city || c["المدينة"] || c["المنطقة"] || "";

const makeTransporter = (smtpPass) => nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: "a89334001@smtp-brevo.com",
    pass: smtpPass
  },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 15000,
});

// ─── Test SMTP connection ──────────────────────────────────────────────────
app.post("/test-smtp", async (req, res) => {
  const { smtpPass } = req.body;
  if (!smtpPass) return res.status(400).json({ success: false, error: "أدخل الـ SMTP Key" });
  try {
    const transporter = makeTransporter(smtpPass);
    await transporter.verify();
    res.json({ success: true, message: "تم الاتصال بنجاح ✅" });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ─── Tracking pixel ────────────────────────────────────────────────────────
app.get("/pixel/:id", (req, res) => {
  const id = req.params.id;
  if (!trackingStore[id]) trackingStore[id] = { opens: 0, times: [] };
  trackingStore[id].opens++;
  trackingStore[id].times.push(new Date().toISOString());
  const pixel = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  res.set("Content-Type", "image/gif");
  res.set("Cache-Control", "no-store, no-cache");
  res.send(pixel);
});

app.get("/tracking", (req, res) => res.json(trackingStore));

// ─── Send emails ───────────────────────────────────────────────────────────
app.post("/send", upload.fields([{ name: "excel" }, { name: "cv" }]), async (req, res) => {
  const { subject, body, smtpUser, smtpPass, senderName, dailyLimit, delaySeconds, serverUrl } = req.body;

  if (!req.files?.excel || !req.files?.cv)
    return res.status(400).json({ error: "Excel and CV files are required" });

  const wb = XLSX.read(req.files["excel"][0].buffer);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const limit = Math.min(parseInt(dailyLimit) || 50, 200);
  const contacts = rows.slice(0, limit);
  const cvBuffer = req.files["cv"][0].buffer;
  const cvName = req.files["cv"][0].originalname || "CV.pdf";

  const transporter = makeTransporter(smtpPass);

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Transfer-Encoding", "chunked");

  const fill = (str, c) =>
    str
      .replace(/\{\{CompanyName\}\}/g, getCompany(c))
      .replace(/\{\{ContactName\}\}/g, getContact(c))
      .replace(/\{\{Email\}\}/g, getEmail(c))
      .replace(/\{\{City\}\}/g, getCity(c))
      .replace(/\{\{SenderName\}\}/g, senderName || "");

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    const email = getEmail(c);
    if (!email) continue;

    const trackId = `${Date.now()}_${i}_${Math.random().toString(36).slice(2)}`;
    const pixelUrl = `${serverUrl}/pixel/${trackId}`;
    const trackImg = `<img src="${pixelUrl}" width="1" height="1" style="display:none;opacity:0" alt="">`;
    const htmlBody = fill(body, c).replace(/\n/g, "<br>") + trackImg;

    try {
      await transporter.sendMail({
        from: `"${senderName}" <${smtpUser}>`,
        to: email,
        subject: fill(subject, c),
        text: fill(body, c),
        html: htmlBody,
        attachments: [{ filename: cvName, content: cvBuffer }],
      });
      trackingStore[trackId] = { email, company: getCompany(c), opens: 0, times: [], sentAt: new Date().toISOString() };
      res.write(JSON.stringify({ email, company: getCompany(c), city: getCity(c), status: "sent", trackId, index: i }) + "\n");
    } catch (err) {
      res.write(JSON.stringify({ email, company: getCompany(c), city: getCity(c), status: "failed", error: err.message, index: i }) + "\n");
    }

    if (i < contacts.length - 1) {
      await new Promise((r) => setTimeout(r, Math.max(parseInt(delaySeconds) || 30, 5) * 1000));
    }
  }
  res.end();
});

app.get("/", (req, res) => res.send("Job Mailer API is running ✅"));
app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
