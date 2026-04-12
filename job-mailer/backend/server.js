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

// In-memory tracking store
const trackingStore = {};

// ─── Tracking pixel endpoint ───────────────────────────────────────────────
app.get("/pixel/:id", (req, res) => {
  const id = req.params.id;
  if (!trackingStore[id]) trackingStore[id] = { opens: 0, times: [] };
  trackingStore[id].opens++;
  trackingStore[id].times.push(new Date().toISOString());

  const pixel = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64"
  );
  res.set("Content-Type", "image/gif");
  res.set("Cache-Control", "no-store, no-cache");
  res.send(pixel);
});

// ─── Get tracking data ─────────────────────────────────────────────────────
app.get("/tracking", (req, res) => {
  res.json(trackingStore);
});

// ─── Send emails ───────────────────────────────────────────────────────────
app.post("/send", upload.fields([{ name: "excel" }, { name: "cv" }]), async (req, res) => {
  const {
    subject, body, smtpUser, smtpPass,
    smtpService, smtpHost, smtpPort,
    senderName, dailyLimit, delaySeconds, serverUrl
  } = req.body;

  if (!req.files?.excel || !req.files?.cv) {
    return res.status(400).json({ error: "Excel and CV files are required" });
  }

  // Parse Excel
  const wb = XLSX.read(req.files["excel"][0].buffer);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const limit = Math.min(parseInt(dailyLimit) || 50, 200);
  const contacts = rows.slice(0, limit);
  const cvBuffer = req.files["cv"][0].buffer;
  const cvName = req.files["cv"][0].originalname || "CV.pdf";

  // Setup transporter
  const transportConfig =
    smtpService && smtpService !== "custom"
      ? { service: smtpService, auth: { user: smtpUser, pass: smtpPass } }
      : { host: smtpHost, port: parseInt(smtpPort) || 587, secure: false, auth: { user: smtpUser, pass: smtpPass } };

  const transporter = nodemailer.createTransport(transportConfig);

  // Stream results back
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Transfer-Encoding", "chunked");

  const fill = (str, c) =>
    str
      .replace(/\{\{CompanyName\}\}/g, c.Company || c.company || "")
      .replace(/\{\{ContactName\}\}/g, c.ContactName || c.contact_name || "Hiring Manager")
      .replace(/\{\{Email\}\}/g, c.Email || c.email || "")
      .replace(/\{\{SenderName\}\}/g, senderName || "");

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    const email = c.Email || c.email || c.EMAIL;
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

      trackingStore[trackId] = { email, company: c.Company || "", opens: 0, times: [], sentAt: new Date().toISOString() };
      res.write(JSON.stringify({ email, company: c.Company || "", status: "sent", trackId, index: i }) + "\n");
    } catch (err) {
      res.write(JSON.stringify({ email, company: c.Company || "", status: "failed", error: err.message, index: i }) + "\n");
    }

    if (i < contacts.length - 1) {
      const delay = Math.max(parseInt(delaySeconds) || 30, 5) * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  res.end();
});

// ─── Health check ──────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
