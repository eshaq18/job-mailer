import React, { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";

const TABS = ["الإعداد", "الرسالة", "الإرسال", "التتبع", "دليل التثبيت"];
const STORAGE_KEY = "job_mailer_progress";

export default function App() {
  const [tab, setTab] = useState(0);
  const [allContacts, setAllContacts] = useState([]);
  const [excelName, setExcelName] = useState("");
  const [cvFile, setCvFile] = useState(null);
  const [smtpService, setSmtpService] = useState("gmail");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [availableCities, setAvailableCities] = useState([]);
  const [selectedCities, setSelectedCities] = useState([]);
  const [lastSentIndex, setLastSentIndex] = useState(0);
  const [totalSentAllTime, setTotalSentAllTime] = useState(0);
  const [progressFileName, setProgressFileName] = useState("");
  const [subject, setSubject] = useState("Application for a Position at {{CompanyName}}");
  const [body, setBody] = useState("Dear Hiring Team at {{CompanyName}},\n\nI am writing to express my interest in joining your organization. Please find my CV attached.\n\nBest regards,\n{{SenderName}}");
  const [senderName, setSenderName] = useState("");
  const [dailyLimit, setDailyLimit] = useState(200);
  const [delaySeconds, setDelaySeconds] = useState(30);
  const [serverUrl, setServerUrl] = useState("http://localhost:3001");
  const [sending, setSending] = useState(false);
  const [sendLog, setSendLog] = useState([]);
  const [progress, setProgress] = useState(0);
  const [statusLabel, setStatusLabel] = useState("جاهز");
  const [trackFilter, setTrackFilter] = useState("all");
  const bodyRef = useRef();

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      setLastSentIndex(data.lastSentIndex || 0);
      setTotalSentAllTime(data.totalSentAllTime || 0);
      setProgressFileName(data.fileName || "");
    }
  }, []);

  const saveProgress = (index, total, fileName) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lastSentIndex: index, totalSentAllTime: total, fileName, updatedAt: new Date().toISOString() }));
  };

  const resetProgress = () => {
    localStorage.removeItem(STORAGE_KEY);
    setLastSentIndex(0);
    setTotalSentAllTime(0);
    setProgressFileName("");
  };

  const handleExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setExcelName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: "array" });

      // قراءة كل الـ sheets ودمجها — اسم الـ sheet = المدينة
      let allRows = [];
      wb.SheetNames.forEach(sheetName => {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
        rows.forEach(r => {
          // استخدم اسم الـ sheet كمدينة إذا ما في عمود City
          const city = r.City || r.city || r.CITY || r["المدينة"] || sheetName;
          allRows.push({ ...r, City: city });
        });
      });

      setAllContacts(allRows);

      // المدن = أسماء الـ sheets
      const cities = wb.SheetNames;
      setAvailableCities(cities);
      setSelectedCities([]);

      if (progressFileName && progressFileName !== file.name) {
        if (window.confirm(`عندك تقدم محفوظ للملف "${progressFileName}".\nاضغط OK لإعادة التعيين والبدء من أول`)) resetProgress();
      } else if (!progressFileName) {
        setProgressFileName(file.name);
        saveProgress(0, 0, file.name);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const filteredContacts = selectedCities.length === 0
    ? allContacts
    : allContacts.filter(c => selectedCities.includes(c.City || c.city || c.CITY || c["المدينة"] || ""));

  const toggleCity = (city) => setSelectedCities(prev => prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city]);
  const insertVar = (v) => {
    const ta = bodyRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    setBody(body.substring(0, s) + v + body.substring(ta.selectionEnd));
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + v.length; ta.focus(); }, 0);
  };

  const startSend = async () => {
    if (!filteredContacts.length) { alert("لا توجد جهات اتصال"); setTab(0); return; }
    if (!cvFile) { alert("ارفع السيفي أولاً"); setTab(1); return; }
    if (!smtpUser || !smtpPass) { alert("أدخل بيانات SMTP"); setTab(0); return; }
    const startIndex = lastSentIndex;
    const toSendToday = filteredContacts.slice(startIndex, startIndex + Math.min(dailyLimit, 200));
    if (!toSendToday.length) { alert("تم الإرسال لكل جهات الاتصال! اضغط إعادة تعيين للبدء من جديد."); return; }

    setSending(true); setSendLog([]); setProgress(0);
    setStatusLabel(`جارٍ الإرسال... (${startIndex + 1}–${startIndex + toSendToday.length} من ${filteredContacts.length})`);

    const formData = new FormData();
    ["subject","body","smtpUser","smtpPass","smtpService","smtpHost","smtpPort","senderName","serverUrl"].forEach(k => formData.append(k, eval(k)));
    formData.append("dailyLimit", toSendToday.length);
    formData.append("delaySeconds", delaySeconds);
    const ws = XLSX.utils.json_to_sheet(toSendToday);
    const wb2 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb2, ws, "contacts");
    formData.append("excel", new Blob([XLSX.write(wb2, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "contacts.xlsx");
    formData.append("cv", cvFile, cvFile.name);

    let doneCount = 0;
    try {
      const res = await fetch(`${serverUrl}/send`, { method: "POST", body: formData });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done: sd } = await reader.read();
        if (sd) break;
        decoder.decode(value).split("\n").filter(Boolean).forEach(line => {
          try {
            const item = JSON.parse(line);
            doneCount++;
            const newIdx = startIndex + doneCount;
            const newTotal = totalSentAllTime + doneCount;
            setSendLog(prev => [...prev, { ...item, opens: 0 }]);
            setProgress(Math.round((doneCount / toSendToday.length) * 100));
            setLastSentIndex(newIdx);
            setTotalSentAllTime(newTotal);
            saveProgress(newIdx, newTotal, excelName);
          } catch {}
        });
      }
      const rem = filteredContacts.length - (startIndex + doneCount);
      setStatusLabel(`اكتمل ✓ — ${doneCount} اليوم — ${rem > 0 ? rem + " باقي" : "انتهى الملف كاملاً 🎉"}`);
    } catch (err) {
      setStatusLabel("خطأ في الاتصال");
      alert("تعذر الاتصال بالسيرفر: " + err.message);
    }
    setSending(false);
  };

  const sent = sendLog.filter(r => r.status === "sent").length;
  const failed = sendLog.filter(r => r.status === "failed").length;
  const opened = sendLog.filter(r => r.opens > 0).length;
  const openRate = sent > 0 ? Math.round(opened / sent * 100) : 0;
  const remainingCount = Math.max(0, filteredContacts.length - lastSentIndex);
  const filteredTrack = trackFilter === "all" ? sendLog : trackFilter === "sent" ? sendLog.filter(r => r.status === "sent") : trackFilter === "opened" ? sendLog.filter(r => r.opens > 0) : sendLog.filter(r => r.status === "failed");

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "16px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 32, height: 32, background: "var(--text)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "var(--surface)", fontSize: 16 }}>✉</span>
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>مرسل طلبات التوظيف</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>أرسل CV لمئات الشركات — حتى 200 إيميل يومياً</div>
        </div>
      </div>

      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "0 24px", display: "flex", gap: 2 }}>
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setTab(i)} style={{ padding: "11px 16px", border: "none", background: "transparent", fontWeight: tab === i ? 600 : 400, color: tab === i ? "var(--text)" : "var(--text-muted)", borderBottom: tab === i ? "2px solid var(--text)" : "2px solid transparent", cursor: "pointer", fontSize: 13, borderRadius: 0 }}>{t}</button>
        ))}
      </div>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "24px 20px" }}>

        {tab === 0 && (<>
          {lastSentIndex > 0 && progressFileName && (
            <div style={{ background: "var(--green-bg)", border: "1px solid #a7f3d0", borderRadius: "var(--radius)", padding: "14px 16px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "var(--green)" }}>تقدم محفوظ — {progressFileName}</div>
                <div style={{ fontSize: 13, color: "var(--green)", marginTop: 3 }}>أُرسل {totalSentAllTime} — سيكمل من رقم {lastSentIndex + 1}</div>
              </div>
              <button onClick={resetProgress} style={{ fontSize: 12, padding: "5px 12px", color: "var(--red)", borderColor: "var(--red)", background: "transparent" }}>إعادة تعيين</button>
            </div>
          )}

          <div className="card">
            <div className="card-title">رفع قائمة الإيميلات (Excel)</div>
            <div className={`upload-zone ${excelName ? "done" : ""}`} onClick={() => document.getElementById("xl-input").click()}>
              {excelName ? <>✅ {excelName} — {allContacts.length} جهة اتصال</> : <>📂 اضغط لرفع ملف Excel أو CSV</>}
            </div>
            <input id="xl-input" type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleExcel} />
            <p className="tip">أعمدة: Email (مطلوب) — Company, ContactName, City (اختيارية)</p>
          </div>

          {availableCities.length > 0 && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div className="card-title" style={{ margin: 0 }}>فلتر المدن</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ fontSize: 12, padding: "3px 10px" }} onClick={() => setSelectedCities(availableCities)}>تحديد الكل</button>
                  <button style={{ fontSize: 12, padding: "3px 10px" }} onClick={() => setSelectedCities([])}>إلغاء الكل</button>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {availableCities.map(city => (
                  <button key={city} onClick={() => toggleCity(city)} style={{ padding: "5px 14px", fontSize: 13, borderRadius: 999, border: `1px solid ${selectedCities.includes(city) ? "var(--green)" : "var(--border)"}`, background: selectedCities.includes(city) ? "var(--green-bg)" : "transparent", color: selectedCities.includes(city) ? "var(--green)" : "var(--text-muted)", fontWeight: selectedCities.includes(city) ? 600 : 400 }}>{city}</button>
                ))}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {selectedCities.length === 0 ? `كل المدن — ${allContacts.length} جهة` : `${filteredContacts.length} جهة من: ${selectedCities.join("، ")}`}
              </div>
            </div>
          )}

          {filteredContacts.length > 0 && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div className="card-title" style={{ margin: 0 }}>معاينة جهات الاتصال</div>
                <span className="badge blue">{filteredContacts.length} جهة</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th style={{ width: "36%" }}>الإيميل</th><th style={{ width: "26%" }}>الشركة</th><th style={{ width: "20%" }}>المدينة</th><th style={{ width: "18%" }}>الاسم</th></tr></thead>
                  <tbody>
                    {filteredContacts.slice(0, 8).map((c, i) => (
                      <tr key={i}><td style={{ fontSize: 12 }}>{c.Email || c.email || "—"}</td><td>{c.Company || c.company || "—"}</td><td>{c.City || c.city || c["المدينة"] || "—"}</td><td>{c.ContactName || "—"}</td></tr>
                    ))}
                    {filteredContacts.length > 8 && <tr><td colSpan={4} style={{ color: "var(--text-faint)", fontSize: 12 }}>و {filteredContacts.length - 8} آخرين...</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-title">إعدادات SMTP</div>
            <div className="grid2">
              <div className="field"><label>خدمة الإيميل</label>
                <select value={smtpService} onChange={e => setSmtpService(e.target.value)}>
                  <option value="gmail">Gmail</option><option value="outlook">Outlook</option><option value="yahoo">Yahoo</option><option value="custom">خادم مخصص</option>
                </select>
              </div>
              <div className="field"><label>إيميلك المُرسِل</label><input type="email" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} placeholder="your@gmail.com" /></div>
            </div>
            {smtpService === "custom" && <div className="grid2"><div className="field"><label>SMTP Host</label><input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} /></div><div className="field"><label>Port</label><input type="number" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} /></div></div>}
            <div className="field"><label>App Password</label><input type="password" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" /><p className="tip">Gmail: الإعدادات ← الأمان ← كلمات مرور التطبيقات</p></div>
            <div className="field"><label>رابط السيرفر (Backend URL)</label><input type="text" value={serverUrl} onChange={e => setServerUrl(e.target.value)} /></div>
          </div>
        </>)}

        {tab === 1 && (<>
          <div className="card">
            <div className="card-title">رفع السيفي (PDF)</div>
            <div className={`upload-zone ${cvFile ? "done" : ""}`} onClick={() => document.getElementById("cv-input").click()}>
              {cvFile ? <>✅ {cvFile.name}</> : <>📄 اضغط لرفع السيفي</>}
            </div>
            <input id="cv-input" type="file" accept=".pdf" style={{ display: "none" }} onChange={e => setCvFile(e.target.files[0])} />
          </div>
          <div className="card">
            <div className="field"><label>عنوان الإيميل</label><input type="text" value={subject} onChange={e => setSubject(e.target.value)} /></div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)", alignSelf: "center" }}>أدرج:</span>
              {["{{CompanyName}}", "{{ContactName}}", "{{SenderName}}", "{{City}}"].map(v => <span key={v} className="chip" onClick={() => insertVar(v)}>{v}</span>)}
            </div>
            <div className="field"><label>نص الرسالة</label><textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)} style={{ minHeight: 160 }} /></div>
          </div>
          <div className="card">
            <div className="card-title">إعدادات الإرسال</div>
            <div className="grid2">
              <div className="field"><label>التأخير (ثانية)</label><input type="number" value={delaySeconds} onChange={e => setDelaySeconds(e.target.value)} min={5} max={300} /></div>
              <div className="field"><label>الحد اليومي (أقصى 200)</label><input type="number" value={dailyLimit} onChange={e => setDailyLimit(Math.min(Number(e.target.value), 200))} min={1} max={200} /></div>
            </div>
            <div className="field"><label>اسمك الكامل</label><input type="text" value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="محمد العمري" /></div>
            <div className="warn-box">⚠ نوصي بـ 30 ثانية تأخير — لا تتجاوز 200 إيميل يومياً</div>
          </div>
        </>)}

        {tab === 2 && (<>
          {filteredContacts.length > 0 && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)" }}>التقدم الإجمالي</div>
                  <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>
                    {totalSentAllTime} / {filteredContacts.length}
                    <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text-muted)", marginRight: 8 }}>({remainingCount} باقي)</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {selectedCities.length > 0 && <span className="badge green">{selectedCities.join("، ")}</span>}
                  <button onClick={resetProgress} style={{ fontSize: 12, padding: "5px 12px", color: "var(--red)", borderColor: "var(--red)", background: "transparent" }}>إعادة تعيين</button>
                </div>
              </div>
              <div className="progress-wrap" style={{ marginTop: 12, marginBottom: 0 }}>
                <div className="progress-fill" style={{ width: filteredContacts.length > 0 ? Math.round(totalSentAllTime / filteredContacts.length * 100) + "%" : "0%", background: "var(--green)" }} />
              </div>
            </div>
          )}

          <div className="stats-row">
            <div className="stat-card"><div className="stat-num">{filteredContacts.length}</div><div className="stat-lbl">إجمالي الملف</div></div>
            <div className="stat-card"><div className="stat-num" style={{ color: "var(--green)" }}>{sent}</div><div className="stat-lbl">أُرسل اليوم</div></div>
            <div className="stat-card"><div className="stat-num" style={{ color: "var(--purple)" }}>{opened}</div><div className="stat-lbl">فُتح</div></div>
            <div className="stat-card"><div className="stat-num" style={{ color: "var(--red)" }}>{failed}</div><div className="stat-lbl">فشل</div></div>
          </div>

          <div className="progress-wrap"><div className="progress-fill" style={{ width: progress + "%" }} /></div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div className="card-title" style={{ margin: 0 }}>سجل الإرسال اليوم</div>
              <span className={`badge ${sending ? "amber" : sent > 0 ? "green" : "gray"}`}>{statusLabel}</span>
            </div>
            {sendLog.length === 0 && !sending && (
              <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--text-faint)", fontSize: 13 }}>
                {lastSentIndex > 0 ? `سيكمل من رقم ${lastSentIndex + 1}` : 'اضغط "ابدأ الإرسال"'}
              </div>
            )}
            {sendLog.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead><tr><th style={{ width: "32%" }}>الإيميل</th><th style={{ width: "20%" }}>الشركة</th><th style={{ width: "14%" }}>المدينة</th><th style={{ width: "17%" }}>وصل؟</th><th style={{ width: "17%" }}>فُتح؟</th></tr></thead>
                  <tbody>
                    {sendLog.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: 12 }}>{r.email}</td><td>{r.company || "—"}</td><td>{r.city || "—"}</td>
                        <td><span className={`badge ${r.status === "sent" ? "green" : "red"}`}>{r.status === "sent" ? "✓ وصل" : "✗ فشل"}</span></td>
                        <td><span className={`badge ${r.opens > 0 ? "purple" : "gray"}`}>{r.opens > 0 ? "فُتح" : "لا"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="info-box">
            {lastSentIndex > 0 ? `سيُرسل من رقم ${lastSentIndex + 1} — ${Math.min(remainingCount, dailyLimit)} رسالة اليوم` : "تأكد أن السيرفر يعمل قبل البدء"}
          </div>
          <button className="primary" style={{ width: "100%", padding: "12px" }} disabled={sending} onClick={startSend}>
            {sending ? "جارٍ الإرسال..." : lastSentIndex > 0 ? `استكمال الإرسال (من رقم ${lastSentIndex + 1})` : "ابدأ الإرسال"}
          </button>
        </>)}

        {tab === 3 && (<>
          <div className="stats-row">
            <div className="stat-card"><div className="stat-num">{sendLog.length}</div><div className="stat-lbl">اليوم</div></div>
            <div className="stat-card"><div className="stat-num" style={{ color: "var(--green)" }}>{sent}</div><div className="stat-lbl">وصل</div></div>
            <div className="stat-card"><div className="stat-num" style={{ color: "var(--purple)" }}>{opened}</div><div className="stat-lbl">فُتح</div></div>
            <div className="stat-card"><div className="stat-num" style={{ color: "var(--blue)" }}>{openRate}%</div><div className="stat-lbl">معدل الفتح</div></div>
          </div>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div className="card-title" style={{ margin: 0 }}>تفاصيل التتبع</div>
              <div className="filter-row" style={{ margin: 0 }}>
                {[["all","الكل"],["sent","وصل"],["opened","فُتح"],["failed","فشل"]].map(([f,l]) => (
                  <button key={f} className={`filter-btn ${trackFilter === f ? "active" : ""}`} onClick={() => setTrackFilter(f)}>{l}</button>
                ))}
              </div>
            </div>
            {filteredTrack.length === 0
              ? <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--text-faint)", fontSize: 13 }}>{sendLog.length === 0 ? "ابدأ الإرسال أولاً" : "لا توجد نتائج"}</div>
              : <div className="table-wrap"><table>
                  <thead><tr><th style={{ width: "30%" }}>الإيميل</th><th style={{ width: "20%" }}>الشركة</th><th style={{ width: "16%" }}>المدينة</th><th style={{ width: "14%" }}>وصل؟</th><th style={{ width: "12%" }}>فُتح؟</th><th style={{ width: "8%" }}>مرات</th></tr></thead>
                  <tbody>
                    {filteredTrack.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: 12 }}>{r.email}</td><td>{r.company || "—"}</td><td>{r.city || "—"}</td>
                        <td><span className={`badge ${r.status === "sent" ? "green" : "red"}`}>{r.status === "sent" ? "✓ وصل" : "✗ فشل"}</span></td>
                        <td><span className={`badge ${r.opens > 0 ? "purple" : "gray"}`}>{r.opens > 0 ? "فُتح" : "لا"}</span></td>
                        <td style={{ textAlign: "center" }}>{r.opens || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
            }
          </div>
        </>)}

        {tab === 4 && (<>
          <div className="card">
            <div className="card-title">هيكل ملف Excel</div>
            <div className="table-wrap"><table>
              <thead><tr><th>Email</th><th>Company</th><th>ContactName</th><th>City</th></tr></thead>
              <tbody>
                <tr><td>hr@google.com</td><td>Google</td><td>Ahmed</td><td>الرياض</td></tr>
                <tr><td>jobs@meta.com</td><td>Meta</td><td>Sara</td><td>جدة</td></tr>
                <tr><td>talent@amazon.com</td><td>Amazon</td><td></td><td>الدمام</td></tr>
              </tbody>
            </table></div>
            <p className="tip" style={{ marginTop: 8 }}>City اختياري — لكن لازم يكون موجود لاستخدام فلتر المدن</p>
          </div>
          <div className="card">
            <div className="card-title">ميزة الاستكمال اليومي</div>
            <div style={{ fontSize: 13, lineHeight: 2, color: "var(--text-muted)" }}>
              ✓ ارفع نفس الملف كل يوم — التطبيق يتذكر وين وقفت<br />
              ✓ اضغط "استكمال الإرسال" وسيبدأ من حيث توقف<br />
              ✓ لما ينتهي الملف يظهر لك إشعار 🎉<br />
              ✓ اضغط "إعادة تعيين" للبدء من الأول
            </div>
          </div>
          <div className="card">
            <div className="card-title">نصائح تجنب الحظر</div>
            <div style={{ fontSize: 13, lineHeight: 2, color: "var(--text-muted)" }}>
              ✓ تأخير 30 ثانية بين كل رسالة<br />
              ✓ لا تتجاوز 200 إيميل يومياً<br />
              ✓ استخدم App Password<br />
              ✓ خصّص كل رسالة بـ {"{{CompanyName}}"}
            </div>
          </div>
        </>)}

      </div>
    </div>
  );
}
