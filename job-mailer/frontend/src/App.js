import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";

const TABS = ["الإعداد", "الرسالة", "الإرسال", "التتبع", "دليل التثبيت"];

export default function App() {
  const [tab, setTab] = useState(0);

  // Setup state
  const [contacts, setContacts] = useState([]);
  const [excelName, setExcelName] = useState("");
  const [cvFile, setCvFile] = useState(null);
  const [smtpService, setSmtpService] = useState("gmail");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");

  // Compose state
  const [subject, setSubject] = useState("Application for a Position at {{CompanyName}}");
  const [body, setBody] = useState(
    "Dear Hiring Team at {{CompanyName}},\n\nI am writing to express my interest in joining your organization. Please find my CV attached.\n\nBest regards,\n{{SenderName}}"
  );
  const [senderName, setSenderName] = useState("");
  const [dailyLimit, setDailyLimit] = useState(50);
  const [delaySeconds, setDelaySeconds] = useState(30);
  const [serverUrl, setServerUrl] = useState("http://localhost:3001");

  // Send state
  const [sending, setSending] = useState(false);
  const [sendLog, setSendLog] = useState([]);
  const [progress, setProgress] = useState(0);
  const [statusLabel, setStatusLabel] = useState("جاهز");

  // Track state
  const [trackFilter, setTrackFilter] = useState("all");

  const bodyRef = useRef();

  const handleExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setExcelName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      setContacts(rows);
    };
    reader.readAsArrayBuffer(file);
  };

  const insertVar = (v) => {
    const ta = bodyRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const newVal = body.substring(0, s) + v + body.substring(ta.selectionEnd);
    setBody(newVal);
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + v.length; ta.focus(); }, 0);
  };

  const startSend = async () => {
    if (!contacts.length) { alert("ارفع ملف Excel أولاً"); setTab(0); return; }
    if (!cvFile) { alert("ارفع السيفي أولاً"); setTab(1); return; }
    if (!body) { alert("اكتب نص الرسالة"); setTab(1); return; }
    if (!smtpUser || !smtpPass) { alert("أدخل بيانات SMTP"); setTab(0); return; }

    setSending(true);
    setSendLog([]);
    setProgress(0);
    setStatusLabel("جارٍ الإرسال...");

    const formData = new FormData();
    formData.append("subject", subject);
    formData.append("body", body);
    formData.append("smtpUser", smtpUser);
    formData.append("smtpPass", smtpPass);
    formData.append("smtpService", smtpService);
    formData.append("smtpHost", smtpHost);
    formData.append("smtpPort", smtpPort);
    formData.append("senderName", senderName);
    formData.append("dailyLimit", Math.min(dailyLimit, 200));
    formData.append("delaySeconds", delaySeconds);
    formData.append("serverUrl", serverUrl);

    // Add excel blob
    const limit = Math.min(dailyLimit, 200);
    const ws = XLSX.utils.json_to_sheet(contacts.slice(0, limit));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "contacts");
    const excelBuf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    formData.append("excel", new Blob([excelBuf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "contacts.xlsx");
    formData.append("cv", cvFile, cvFile.name);

    try {
      const res = await fetch(`${serverUrl}/send`, { method: "POST", body: formData });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let total = Math.min(contacts.length, limit);
      let done = 0;

      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        const lines = decoder.decode(value).split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const item = JSON.parse(line);
            done++;
            setSendLog((prev) => [...prev, { ...item, opens: 0 }]);
            setProgress(Math.round((done / total) * 100));
          } catch {}
        }
      }
      setStatusLabel("اكتمل ✓");
    } catch (err) {
      setStatusLabel("خطأ في الاتصال بالسيرفر");
      alert("تعذر الاتصال بالسيرفر: " + err.message);
    }
    setSending(false);
  };

  // Counts
  const sent = sendLog.filter((r) => r.status === "sent").length;
  const failed = sendLog.filter((r) => r.status === "failed").length;
  const opened = sendLog.filter((r) => r.opens > 0).length;
  const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;

  const filteredTrack =
    trackFilter === "all" ? sendLog :
    trackFilter === "sent" ? sendLog.filter((r) => r.status === "sent") :
    trackFilter === "opened" ? sendLog.filter((r) => r.opens > 0) :
    sendLog.filter((r) => r.status === "failed");

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Header */}
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "16px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 32, height: 32, background: "var(--text)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "var(--surface)", fontSize: 16 }}>✉</span>
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>مرسل طلبات التوظيف</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>أرسل CV لمئات الشركات — حتى 200 إيميل يومياً</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "0 24px", display: "flex", gap: 2 }}>
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setTab(i)} style={{
            padding: "11px 16px", border: "none", background: "transparent",
            fontWeight: tab === i ? 600 : 400,
            color: tab === i ? "var(--text)" : "var(--text-muted)",
            borderBottom: tab === i ? "2px solid var(--text)" : "2px solid transparent",
            cursor: "pointer", fontSize: 13, borderRadius: 0
          }}>{t}</button>
        ))}
      </div>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "24px 20px" }}>

        {/* ── TAB 0: الإعداد ─────────────────────────────────── */}
        {tab === 0 && (
          <>
            <div className="card">
              <div className="card-title">رفع قائمة الإيميلات (Excel)</div>
              <div className={`upload-zone ${excelName ? "done" : ""}`} onClick={() => document.getElementById("xl-input").click()}>
                {excelName ? <>✅ {excelName} — {contacts.length} جهة اتصال</> : <>📂 اضغط لرفع ملف Excel أو CSV</>}
              </div>
              <input id="xl-input" type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleExcel} />
              <p className="tip">أعمدة مطلوبة: Email — اختيارية: Company, ContactName</p>

              {contacts.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>معاينة جهات الاتصال <span className="badge blue">{contacts.length}</span></div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th style={{ width: "40%" }}>الإيميل</th><th style={{ width: "35%" }}>الشركة</th><th style={{ width: "25%" }}>الاسم</th></tr></thead>
                      <tbody>
                        {contacts.slice(0, 8).map((c, i) => (
                          <tr key={i}>
                            <td>{c.Email || c.email || "—"}</td>
                            <td>{c.Company || c.company || "—"}</td>
                            <td>{c.ContactName || c.contact_name || "—"}</td>
                          </tr>
                        ))}
                        {contacts.length > 8 && <tr><td colSpan={3} style={{ color: "var(--text-faint)", fontSize: 12 }}>و {contacts.length - 8} آخرين...</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-title">إعدادات SMTP (خادم الإيميل)</div>
              <div className="grid2">
                <div className="field">
                  <label>خدمة الإيميل</label>
                  <select value={smtpService} onChange={(e) => setSmtpService(e.target.value)}>
                    <option value="gmail">Gmail</option>
                    <option value="outlook">Outlook / Hotmail</option>
                    <option value="yahoo">Yahoo</option>
                    <option value="custom">خادم مخصص</option>
                  </select>
                </div>
                <div className="field">
                  <label>إيميلك المُرسِل</label>
                  <input type="email" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="your@gmail.com" />
                </div>
              </div>
              {smtpService === "custom" && (
                <div className="grid2">
                  <div className="field"><label>SMTP Host</label><input type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com" /></div>
                  <div className="field"><label>SMTP Port</label><input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" /></div>
                </div>
              )}
              <div className="field">
                <label>App Password (كلمة مرور التطبيق)</label>
                <input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" />
                <p className="tip">Gmail: الإعدادات ← الأمان ← كلمات مرور التطبيقات (يحتاج تفعيل 2FA)</p>
              </div>
              <div className="field">
                <label>رابط السيرفر (Backend URL)</label>
                <input type="text" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="http://localhost:3001 أو رابط Railway" />
              </div>
            </div>
          </>
        )}

        {/* ── TAB 1: الرسالة ─────────────────────────────────── */}
        {tab === 1 && (
          <>
            <div className="card">
              <div className="card-title">رفع السيفي (PDF)</div>
              <div className={`upload-zone ${cvFile ? "done" : ""}`} onClick={() => document.getElementById("cv-input").click()}>
                {cvFile ? <>✅ {cvFile.name}</> : <>📄 اضغط لرفع السيفي (PDF فقط)</>}
              </div>
              <input id="cv-input" type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => setCvFile(e.target.files[0])} />
            </div>

            <div className="card">
              <div className="card-title">عنوان الإيميل</div>
              <div className="field">
                <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div className="card-title">نص الرسالة</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)", alignSelf: "center" }}>أدرج:</span>
                {["{{CompanyName}}", "{{ContactName}}", "{{SenderName}}", "{{Email}}"].map((v) => (
                  <span key={v} className="chip" onClick={() => insertVar(v)}>{v}</span>
                ))}
              </div>
              <div className="field">
                <textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 160 }} />
              </div>
            </div>

            <div className="card">
              <div className="card-title">إعدادات الإرسال</div>
              <div className="grid2">
                <div className="field">
                  <label>التأخير بين الرسائل (ثانية)</label>
                  <input type="number" value={delaySeconds} onChange={(e) => setDelaySeconds(e.target.value)} min={5} max={300} />
                </div>
                <div className="field">
                  <label>الحد اليومي (أقصى 200)</label>
                  <input type="number" value={dailyLimit} onChange={(e) => setDailyLimit(Math.min(e.target.value, 200))} min={1} max={200} />
                </div>
              </div>
              <div className="field">
                <label>اسمك الكامل (يظهر كمُرسِل)</label>
                <input type="text" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="محمد العمري" />
              </div>
              <div className="warn-box">⚠ نوصي بـ 30 ثانية تأخير على الأقل — لا تتجاوز 200 إيميل يومياً لتجنب الحظر</div>
            </div>
          </>
        )}

        {/* ── TAB 2: الإرسال ─────────────────────────────────── */}
        {tab === 2 && (
          <>
            <div className="stats-row">
              <div className="stat-card"><div className="stat-num">{contacts.length}</div><div className="stat-lbl">إجمالي</div></div>
              <div className="stat-card"><div className="stat-num" style={{ color: "var(--green)" }}>{sent}</div><div className="stat-lbl">وصل</div></div>
              <div className="stat-card"><div className="stat-num" style={{ color: "var(--purple)" }}>{opened}</div><div className="stat-lbl">فُتح</div></div>
              <div className="stat-card"><div className="stat-num" style={{ color: "var(--red)" }}>{failed}</div><div className="stat-lbl">فشل</div></div>
            </div>

            <div className="progress-wrap"><div className="progress-fill" style={{ width: progress + "%" }} /></div>

            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div className="card-title" style={{ margin: 0 }}>سجل الإرسال</div>
                <span className={`badge ${sending ? "amber" : sent > 0 ? "green" : "gray"}`}>{statusLabel}</span>
              </div>
              {sendLog.length === 0 && !sending && (
                <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--text-faint)", fontSize: 13 }}>اضغط "ابدأ الإرسال" للبدء</div>
              )}
              {sendLog.length > 0 && (
                <div className="table-wrap">
                  <table>
                    <thead><tr>
                      <th style={{ width: "36%" }}>الإيميل</th>
                      <th style={{ width: "22%" }}>الشركة</th>
                      <th style={{ width: "18%" }}>الحالة</th>
                      <th style={{ width: "12%" }}>وصل؟</th>
                      <th style={{ width: "12%" }}>فُتح؟</th>
                    </tr></thead>
                    <tbody>
                      {sendLog.map((r, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: 12 }}>{r.email}</td>
                          <td>{r.company || "—"}</td>
                          <td><span className={`dot ${r.status === "sent" ? "sent" : "failed"}`} />{r.status === "sent" ? "تم" : "فشل"}</td>
                          <td><span className={`badge ${r.status === "sent" ? "green" : "red"}`}>{r.status === "sent" ? "✓" : "✗"}</span></td>
                          <td><span className={`badge ${r.opens > 0 ? "purple" : "gray"}`}>{r.opens > 0 ? "فُتح" : "لا"}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="info-box">الإرسال يتم عبر السيرفر — تأكد أن السيرفر يعمل قبل البدء</div>
            <button className="primary" style={{ width: "100%", padding: "12px" }} disabled={sending} onClick={startSend}>
              {sending ? "جارٍ الإرسال..." : "ابدأ الإرسال"}
            </button>
          </>
        )}

        {/* ── TAB 3: التتبع ─────────────────────────────────── */}
        {tab === 3 && (
          <>
            <div className="stats-row">
              <div className="stat-card"><div className="stat-num">{sendLog.length}</div><div className="stat-lbl">إجمالي</div></div>
              <div className="stat-card"><div className="stat-num" style={{ color: "var(--green)" }}>{sent}</div><div className="stat-lbl">وصل</div></div>
              <div className="stat-card"><div className="stat-num" style={{ color: "var(--purple)" }}>{opened}</div><div className="stat-lbl">فُتح</div></div>
              <div className="stat-card"><div className="stat-num" style={{ color: "var(--blue)" }}>{openRate}%</div><div className="stat-lbl">معدل الفتح</div></div>
            </div>

            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div className="card-title" style={{ margin: 0 }}>تفاصيل التتبع</div>
                <div className="filter-row" style={{ margin: 0 }}>
                  {[["all", "الكل"], ["sent", "وصل"], ["opened", "فُتح"], ["failed", "فشل"]].map(([f, l]) => (
                    <button key={f} className={`filter-btn ${trackFilter === f ? "active" : ""}`} onClick={() => setTrackFilter(f)}>{l}</button>
                  ))}
                </div>
              </div>
              {filteredTrack.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--text-faint)", fontSize: 13 }}>
                  {sendLog.length === 0 ? "لا توجد بيانات بعد — ابدأ الإرسال أولاً" : "لا توجد نتائج لهذا الفلتر"}
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr>
                      <th style={{ width: "34%" }}>الإيميل</th>
                      <th style={{ width: "22%" }}>الشركة</th>
                      <th style={{ width: "14%" }}>وصل؟</th>
                      <th style={{ width: "14%" }}>فُتح؟</th>
                      <th style={{ width: "8%" }}>مرات</th>
                      <th style={{ width: "8%" }}>خطأ</th>
                    </tr></thead>
                    <tbody>
                      {filteredTrack.map((r, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: 12 }}>{r.email}</td>
                          <td>{r.company || "—"}</td>
                          <td><span className={`badge ${r.status === "sent" ? "green" : "red"}`}>{r.status === "sent" ? "✓ وصل" : "✗ فشل"}</span></td>
                          <td><span className={`badge ${r.opens > 0 ? "purple" : "gray"}`}>{r.opens > 0 ? "فُتح" : "لا"}</span></td>
                          <td style={{ textAlign: "center", color: "var(--text-muted)" }}>{r.opens || 0}</td>
                          <td style={{ fontSize: 11, color: "var(--red)" }}>{r.error ? "!" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-title">كيف يعمل التتبع؟</div>
              <div style={{ fontSize: 13, lineHeight: 2, color: "var(--text-muted)" }}>
                <div><span className="dot sent" style={{ verticalAlign: "middle" }} /> <strong>وصل</strong> — تأكيد SMTP بأن الإيميل قُبل من سيرفر المستلم</div>
                <div><span className="dot opened" style={{ verticalAlign: "middle" }} /> <strong>فُتح</strong> — بكسل تتبع 1×1px مخفي يُرسل إشارة عند فتح الإيميل</div>
                <div><span className="dot failed" style={{ verticalAlign: "middle" }} /> <strong>فشل</strong> — رُفض الإيميل أو العنوان غير صحيح</div>
                <p className="tip" style={{ marginTop: 8 }}>ملاحظة: بعض عملاء الإيميل يحجبون الصور تلقائياً — قد لا يُسجَّل الفتح</p>
              </div>
            </div>
          </>
        )}

        {/* ── TAB 4: دليل التثبيت ────────────────────────────── */}
        {tab === 4 && (
          <>
            <div className="card">
              <div className="card-title">الخطوة 1 — تثبيت Node.js</div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}>حمّل Node.js من nodejs.org (نسخة LTS) وثبّته.</p>
              <div className="code-block">node --version   # يجب أن يكون v18+
npm --version</div>
            </div>

            <div className="card">
              <div className="card-title">الخطوة 2 — تحميل المشروع من GitHub</div>
              <div className="code-block">git clone https://github.com/YOUR_USERNAME/job-mailer.git
cd job-mailer/backend
npm install</div>
            </div>

            <div className="card">
              <div className="card-title">الخطوة 3 — تشغيل السيرفر محلياً</div>
              <div className="code-block">node server.js
# ✅ Server running on port 3001</div>
              <p className="tip" style={{ marginTop: 8 }}>اترك هذا النافذة مفتوحة أثناء الإرسال. الرابط سيكون: http://localhost:3001</p>
            </div>

            <div className="card">
              <div className="card-title">الخطوة 4 — رفع السيرفر على الإنترنت (مجاناً عبر Railway)</div>
              <div style={{ fontSize: 13, lineHeight: 2, color: "var(--text-muted)" }}>
                <div>1. اذهب إلى <strong>railway.app</strong> وسجّل دخول بـ GitHub</div>
                <div>2. اضغط "New Project" ← "Deploy from GitHub repo"</div>
                <div>3. اختر مجلد <code style={{ background: "var(--bg)", padding: "1px 5px", borderRadius: 3 }}>backend</code></div>
                <div>4. Railway سيعطيك رابطاً عاماً مثل: <code style={{ background: "var(--bg)", padding: "1px 5px", borderRadius: 3 }}>https://job-mailer-xxxx.railway.app</code></div>
                <div>5. ضع هذا الرابط في حقل "رابط السيرفر" في تبويب الإعداد</div>
              </div>
            </div>

            <div className="card">
              <div className="card-title">الخطوة 5 — نصائح تجنب الحظر</div>
              <div style={{ fontSize: 13, lineHeight: 2, color: "var(--text-muted)" }}>
                ✓ تأخير 30 ثانية بين كل رسالة على الأقل<br />
                ✓ لا تتجاوز 200 إيميل يومياً (Gmail يوقف أكثر)<br />
                ✓ استخدم App Password وليس كلمة المرور الأصلية<br />
                ✓ خصّص كل رسالة باسم الشركة ({'{{CompanyName}}'})<br />
                ✓ تأكد من صحة SPF وDKIM إذا كنت تستخدم دومين خاص
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
