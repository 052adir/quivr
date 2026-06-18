"use strict";

const TOKEN_KEY = "mentor_token";
let token = localStorage.getItem(TOKEN_KEY) || "";

// One-click login: ?token=... logs the user straight in (no typing). Used by
// magic links and the desktop watcher onboarding. The token is then persisted
// and the URL cleaned so it isn't left in history.
{
  const _urlToken = new URLSearchParams(location.search).get("token");
  if (_urlToken && _urlToken.trim()) {
    token = _urlToken.trim();
    localStorage.setItem(TOKEN_KEY, token);
    history.replaceState(null, "", location.pathname);
  }
}
let equityChart = null;

// --------------------------------------------------------------------------
// API helper
// --------------------------------------------------------------------------
async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch("/api" + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    logout();
    throw new Error("נדרשת התחברות מחדש");
  }
  if (res.status === 402) {
    showUpgrade();
    throw new Error("subscription_required");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail : "שגיאה";
    throw new Error(detail);
  }
  return data;
}

function showUpgrade() {
  document.getElementById("upgrade").classList.remove("hidden");
}

async function startCheckout() {
  const note = document.getElementById("upgrade-note");
  try {
    const { url } = await api("/billing/checkout", { method: "POST" });
    location.href = url;
  } catch (e) {
    if (note) note.textContent = "החיוב עדיין לא מחובר (מצב ניסיון). פנה אלינו להפעלה.";
    else toast("החיוב עדיין לא מחובר");
  }
}
window.startCheckout = startCheckout;

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
}

// --------------------------------------------------------------------------
// Auth
// --------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

async function handleAuth() {
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  const err = $("auth-error");
  err.textContent = "";
  if (!email || password.length < 6) {
    err.textContent = "אימייל וסיסמה (6+ תווים) נדרשים";
    return;
  }
  try {
    let data;
    try {
      data = await api("/auth/login", { method: "POST", body: { email, password } });
    } catch {
      // No account yet (or wrong password) — try to register.
      data = await api("/auth/register", { method: "POST", body: { email, password } });
    }
    token = data.token;
    localStorage.setItem(TOKEN_KEY, token);
    showApp();
  } catch (e) {
    err.textContent = e.message;
  }
}

function logout() {
  token = "";
  localStorage.removeItem(TOKEN_KEY);
  $("app").style.display = "none";
  $("auth").classList.remove("hidden");
}

async function showApp() {
  $("auth").classList.add("hidden");
  $("app").style.display = "block";
  handleBillingReturn();
  // loadMe drives the trial banner / upgrade wall; the rest may 402 gracefully.
  await loadMe();
  loadDashboard().catch(() => {});
  loadConnections().catch(() => {});
}

function handleBillingReturn() {
  const p = new URLSearchParams(location.search);
  const b = p.get("billing");
  if (!b) return;
  history.replaceState({}, "", "/app");
  document.getElementById("upgrade").classList.add("hidden");
  if (b === "success") {
    toast("התשלום התקבל! המנוי פעיל 🎉");
    setTimeout(() => loadMe().catch(() => {}), 1500); // give the webhook a moment
  } else if (b === "cancel") {
    toast("התשלום בוטל");
  }
}

// --------------------------------------------------------------------------
// Navigation
// --------------------------------------------------------------------------
const loaders = {
  dashboard: loadDashboard,
  journal: loadJournal,
  alerts: loadAlerts,
  lessons: loadLessons,
  tutor: loadTutor,
  settings: loadConnections,
};

document.getElementById("nav").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if (!btn) return;
  const view = btn.dataset.view;
  document.querySelectorAll("#nav button").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  $("view-" + view).classList.add("active");
  loaders[view] && loaders[view]();
});

// --------------------------------------------------------------------------
// Dashboard
// --------------------------------------------------------------------------
function money(n) {
  const v = Number(n || 0);
  return (v >= 0 ? "$" : "-$") + Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

async function loadDashboard() {
  const [d, review] = await Promise.all([api("/dashboard"), api("/review/weekly")]);
  const s = d.stats;
  loadDiagnosis().catch(() => {});

  const cards = [
    { label: "עסקאות סגורות", value: s.trades },
    { label: "אחוז הצלחה", value: s.win_rate + "%" },
    { label: "רווח/הפסד מצטבר", value: money(s.total_pnl), cls: s.total_pnl >= 0 ? "pos" : "neg" },
    { label: "Profit Factor", value: s.profit_factor },
    { label: "רווח ממוצע", value: money(s.avg_win), cls: "pos" },
    { label: "הפסד ממוצע", value: money(s.avg_loss), cls: "neg" },
  ];
  $("stat-cards").innerHTML = cards
    .map(
      (c) =>
        `<div class="card"><div class="label">${c.label}</div>
         <div class="value ${c.cls || ""}">${c.value}</div></div>`
    )
    .join("");

  $("weekly-summary").textContent = review.summary;

  // Alert dot if unread.
  $("alert-dot").classList.toggle("hidden", !d.has_unread);

  // Recent alerts.
  $("recent-alerts").innerHTML = d.recent_alerts.length
    ? d.recent_alerts.map(alertHTML).join("")
    : '<div class="empty">אין עדיין התראות. חבר חשבון או טען נתוני דמו.</div>';

  drawEquity(d.equity);
}

function drawEquity(points) {
  const canvas = $("equity-chart");
  if (typeof Chart === "undefined") {
    canvas.replaceWith(Object.assign(document.createElement("div"), {
      className: "empty",
      textContent: "טוען גרף…",
    }));
    return;
  }
  const labels = points.map((p) => new Date(p.time).toLocaleDateString("he-IL"));
  const data = points.map((p) => p.cum_pnl);
  if (equityChart) equityChart.destroy();
  equityChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data,
          borderColor: "#4f8cff",
          backgroundColor: "rgba(79,140,255,0.12)",
          fill: true,
          tension: 0.3,
          pointRadius: 0,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#8b96b5" }, grid: { color: "#283153" } },
        y: { ticks: { color: "#8b96b5" }, grid: { color: "#283153" } },
      },
    },
  });
}

async function loadDiagnosis() {
  const dx = await api("/diagnosis");
  const el = $("diagnosis-card");
  if (dx.kind === "empty") {
    el.innerHTML =
      `<div class="dx-head">🔍 ${dx.headline}</div><div class="dx-money">${dx.money}</div>`;
    return;
  }
  const steps = (dx.steps || [])
    .map((s, i) => `<div class="dx-step"><div class="num">${i + 1}</div><div class="txt">${s}</div></div>`)
    .join("");
  el.innerHTML =
    `<div class="dx-head">🎯 ${dx.headline}</div>` +
    (dx.good_news ? `<div class="dx-good">👍 ${dx.good_news}</div>` : "") +
    `<div class="dx-money">${dx.money}</div>` +
    (dx.problem ? `<div class="dx-problem">${dx.problem}</div>` : "") +
    (dx.analogy ? `<div class="dx-analogy">${dx.analogy}</div>` : "") +
    `<div class="dx-action-title">${dx.action_title}</div>` +
    steps;
}

function alertHTML(a) {
  const icon = { warning: "⚠️", success: "✅", info: "💡" }[a.severity] || "•";
  return `<div class="alert ${a.severity}">
    <div class="icon">${icon}</div>
    <div>
      <div class="a-title">${a.title}</div>
      <div class="a-msg">${a.message}</div>
      ${a.symbol ? `<div class="a-sym">${a.symbol}</div>` : ""}
    </div>
  </div>`;
}

// --------------------------------------------------------------------------
// Journal
// --------------------------------------------------------------------------
async function loadJournal() {
  const trips = await api("/trades");
  if (!trips.length) {
    $("journal-table").innerHTML = '<div class="empty">אין עדיין עסקאות סגורות.</div>';
    return;
  }
  const rows = trips
    .map(
      (t) => `<tr>
        <td><span class="tag">${t.symbol}</span></td>
        <td>${new Date(t.exit_time).toLocaleString("he-IL")}</td>
        <td>${t.entry_price}</td>
        <td>${t.exit_price}</td>
        <td>${money(t.notional)}</td>
        <td class="${t.pnl >= 0 ? "pos" : "neg"}">${money(t.pnl)}</td>
        <td class="${t.pnl >= 0 ? "pos" : "neg"}">${t.pnl_pct}%</td>
        <td>${t.hold_hours} ש'</td>
      </tr>`
    )
    .join("");
  $("journal-table").innerHTML = `<table>
    <thead><tr>
      <th>נכס</th><th>נסגרה</th><th>כניסה</th><th>יציאה</th>
      <th>גודל</th><th>רווח/הפסד</th><th>%</th><th>החזקה</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

// --------------------------------------------------------------------------
// Alerts
// --------------------------------------------------------------------------
async function loadAlerts() {
  const list = await api("/alerts");
  $("alerts-list").innerHTML = list.length
    ? list.map(alertHTML).join("")
    : '<div class="empty">אין עדיין התראות.</div>';
}

$("mark-read").addEventListener("click", async () => {
  await api("/alerts/read", { method: "POST" });
  $("alert-dot").classList.add("hidden");
  toast("סומן כנקרא");
});

// --------------------------------------------------------------------------
// Lessons
// --------------------------------------------------------------------------
async function loadLessons() {
  const lessons = await api("/lessons");
  $("lessons-list").innerHTML = lessons
    .map(
      (l) => `<div class="lesson">
        <div class="head" onclick="this.parentElement.classList.toggle('open')">
          <div>
            <div class="l-title">${l.title}</div>
            <div class="l-sub">${l.summary}</div>
          </div>
          <span class="level-pill">שלב ${l.level}</span>
        </div>
        <div class="body">${l.content}</div>
      </div>`
    )
    .join("");
}

// --------------------------------------------------------------------------
// Tutor chat
// --------------------------------------------------------------------------
async function loadTutor() {
  const history = await api("/chat/history");
  const log = $("chat-log");
  if (!history.length) {
    log.innerHTML =
      '<div class="msg assistant">שלום! אני המורה־AI שלך. שאל אותי כל דבר על מסחר, ' +
      "ניהול סיכון או פסיכולוגיה. אני כאן כדי ללמד — לא לתת ייעוץ.</div>";
  } else {
    log.innerHTML = history.map((m) => `<div class="msg ${m.role}">${escapeHTML(m.content)}</div>`).join("");
  }
  log.scrollTop = log.scrollHeight;
}

function escapeHTML(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

async function sendChat() {
  const input = $("chat-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  const log = $("chat-log");
  log.insertAdjacentHTML("beforeend", `<div class="msg user">${escapeHTML(text)}</div>`);
  log.insertAdjacentHTML("beforeend", `<div class="msg assistant" id="pending">…</div>`);
  log.scrollTop = log.scrollHeight;
  try {
    const { reply } = await api("/chat", { method: "POST", body: { message: text } });
    $("pending").textContent = reply;
    $("pending").id = "";
  } catch (e) {
    $("pending").textContent = "שגיאה: " + e.message;
    $("pending").id = "";
  }
  log.scrollTop = log.scrollHeight;
}

$("chat-send").addEventListener("click", sendChat);
$("chat-input").addEventListener("keydown", (e) => e.key === "Enter" && sendChat());

// --------------------------------------------------------------------------
// Settings / connections
// --------------------------------------------------------------------------
async function loadMe() {
  const me = await api("/me");
  $("set-account").value = me.account_size;
  $("set-telegram").value = me.telegram_chat_id || "";
  renderTrialBanner(me.access);
  renderTelegramStatus(me.telegram_linked);
}

function renderTelegramStatus(linked) {
  const el = $("tg-status");
  if (!el) return;
  el.innerHTML = linked
    ? '<span class="pill-demo">✓ מחובר — תקבל התראות בטלגרם</span>'
    : '<span class="note">לא מחובר עדיין.</span>';
  $("tg-connect").textContent = linked ? "חבר טלגרם אחר" : "חבר טלגרם";
}

async function connectTelegram() {
  const out = $("tg-result");
  out.innerHTML = "טוען…";
  try {
    const r = await api("/telegram/connect", { method: "POST" });
    if (!r.bot_configured) {
      out.innerHTML =
        '<div class="note">בוט הטלגרם עדיין לא הופעל בצד השרת ' +
        "(נדרש TELEGRAM_BOT_TOKEN). לאחר הפעלה — חזור לכאן.</div>";
      return;
    }
    const linkBtn = r.deep_link
      ? `<a class="btn small" href="${r.deep_link}" target="_blank">פתח בטלגרם וחבר בלחיצה</a>`
      : "";
    out.innerHTML =
      `<div class="note">פתח את הבוט בטלגרם ושלח את ההודעה:</div>` +
      `<div class="msg assistant" style="max-width:100%;margin:8px 0">/link ${r.code}</div>` +
      linkBtn;
  } catch (e) {
    out.innerHTML = '<div class="error-msg">' + e.message + "</div>";
  }
}

function renderTrialBanner(a) {
  const banner = $("trial-banner");
  if (!a) return;
  if (a.status === "trialing") {
    banner.classList.remove("hidden", "expired");
    banner.innerHTML =
      `🎁 ניסיון חינם — נותרו <b>${a.trial_days_left}</b> ימים` +
      `<div class="spacer"></div>` +
      `<button class="btn small" onclick="startCheckout()">שדרג ל-₪79/חודש</button>`;
  } else if (a.status === "active") {
    banner.classList.add("hidden");
  } else {
    banner.classList.add("hidden");
    showUpgrade();
  }
}

const PROVIDER_LABELS = { demo: "דמו", binance: "Binance", ccxt: "קריפטו", mt5: "MT5" };

async function loadConnections() {
  const conns = await api("/connections");
  $("conn-list").innerHTML = conns.length
    ? conns
        .map(
          (c) => `<div class="alert info">
            <div class="icon">🔗</div>
            <div style="flex:1">
              <div class="a-title">${c.label}
                <span class="pill-demo">${PROVIDER_LABELS[c.provider] || c.provider}</span></div>
              <div class="a-msg">${c.symbols} ·
                ${c.last_synced_at ? "סונכרן " + new Date(c.last_synced_at).toLocaleString("he-IL") : "טרם סונכרן"}</div>
            </div>
            <button class="btn ghost" onclick="deleteConn(${c.id})">הסר</button>
          </div>`
        )
        .join("")
    : '<div class="empty">אין עדיין חיבורים. בחר "דמו" לטעינת נתוני הדגמה.</div>';
}

window.deleteConn = async (id) => {
  await api("/connections/" + id, { method: "DELETE" });
  toast("החיבור הוסר");
  loadConnections();
};

// Show only the fields relevant to the chosen platform.
function updateConnFields() {
  const p = $("conn-provider").value;
  $("grp-crypto").classList.toggle("hidden", !(p === "binance" || p === "ccxt"));
  $("grp-exchange").classList.toggle("hidden", p !== "ccxt");
  $("grp-mt5").classList.toggle("hidden", p !== "mt5");
}
$("conn-provider").addEventListener("change", updateConnFields);
updateConnFields();

$("conn-save").addEventListener("click", async () => {
  const err = $("conn-error");
  err.textContent = "";
  const provider = $("conn-provider").value;
  const body = { provider };
  if (provider === "binance" || provider === "ccxt") {
    body.api_key = $("conn-key").value.trim();
    body.api_secret = $("conn-secret").value.trim();
    body.symbols = $("conn-symbols").value.trim();
    if (provider === "ccxt") body.exchange = $("conn-exchange").value.trim();
    if (!body.api_key) { err.textContent = "הזן API key"; return; }
  } else if (provider === "mt5") {
    body.login = $("conn-login").value.trim();
    body.server = $("conn-server").value.trim();
    body.password = $("conn-password").value.trim();
    if (!body.password || !body.server) { err.textContent = "נדרשים Server וסיסמת משקיע"; return; }
  }
  try {
    const r = await api("/connections", { method: "POST", body });
    toast(`סונכרן! ${r.new_trades} עסקאות, ${r.new_alerts} התראות חדשות.`);
    ["conn-key", "conn-secret", "conn-password"].forEach((id) => { if ($(id)) $(id).value = ""; });
    await Promise.all([loadConnections(), loadDashboard()]);
  } catch (e) {
    err.textContent = e.message;
  }
});

$("set-save").addEventListener("click", async () => {
  await api("/settings", {
    method: "PUT",
    body: {
      account_size: parseFloat($("set-account").value) || 1000,
      telegram_chat_id: $("set-telegram").value.trim(),
    },
  });
  toast("ההגדרות נשמרו");
});

// --------------------------------------------------------------------------
// Boot
// --------------------------------------------------------------------------
$("auth-submit").addEventListener("click", handleAuth);
$("auth-password").addEventListener("keydown", (e) => e.key === "Enter" && handleAuth());
$("logout").addEventListener("click", logout);
$("upgrade-btn").addEventListener("click", startCheckout);
$("upgrade-logout").addEventListener("click", logout);
$("tg-connect").addEventListener("click", connectTelegram);
const _dlWatcherBtn = $("dl-watcher");
if (_dlWatcherBtn) _dlWatcherBtn.addEventListener("click", downloadWatcher);

async function downloadWatcher() {
  const note = $("dl-watcher-note");
  note.textContent = "מכין הורדה…";
  try {
    const res = await fetch("/api/download/ea", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) {
      note.textContent = "ההורדה לא זמינה בשרת הזה כרגע.";
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "MentorGuard.ex5";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    note.textContent = "ירד! העתק אותו ל-MQL5\\Experts ב-MT5, וגרור אותו על הגרף (ראה השלבים למעלה).";
  } catch (e) {
    note.textContent = "שגיאה בהורדה: " + e.message;
  }
}

if (token) {
  showApp().catch(() => logout());
}

// --------------------------------------------------------------------------
// EA connection helper: surface the user's token + backend URL so a trader can
// configure the MT5 bot without DevTools. Purely additive (reads existing state).
// --------------------------------------------------------------------------
function fillEaConnect() {
  const tok = localStorage.getItem(TOKEN_KEY) || token || "";
  const origin = window.location.origin;
  const tokEl = $("ea-token");
  const urlEl = $("ea-url");
  const orEl = $("ea-origin");
  if (tokEl) tokEl.value = tok;
  if (urlEl) urlEl.value = origin + "/api/mt5/trades";
  if (orEl) orEl.textContent = origin;
}

async function copyToClipboard(value, btn) {
  try {
    await navigator.clipboard.writeText(value);
  } catch (e) {
    /* clipboard blocked — the value is still visible/selectable in the field */
  }
  const original = btn.textContent;
  btn.textContent = "הועתק ✓";
  setTimeout(() => (btn.textContent = original), 1500);
}

const _copyTokenBtn = $("copy-token");
if (_copyTokenBtn) {
  _copyTokenBtn.addEventListener("click", () => {
    fillEaConnect();
    copyToClipboard($("ea-token").value, _copyTokenBtn);
  });
}
const _copyUrlBtn = $("copy-url");
if (_copyUrlBtn) {
  _copyUrlBtn.addEventListener("click", () => {
    fillEaConnect();
    copyToClipboard($("ea-url").value, _copyUrlBtn);
  });
}
fillEaConnect();
