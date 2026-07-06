/* ==========================================================================
   פרגו — לוח מכוונים | app.js
   Vanilla JS. State persists in localStorage, seeded from the Excel export
   (window.PERGO_SEED). No build step, works from file:// or any static host.
   ========================================================================== */

(function () {
  "use strict";

  const SEED = window.PERGO_SEED || {};
  const LS_KEY = "pergo_state_v1";

  /* ----------------------------- State ----------------------------------- */
  // We keep the big calendar in SEED (read-only reference) and store only the
  // user's editable data in localStorage: revenue per day, task statuses, etc.
  const defaultState = () => ({
    monthlyTarget: SEED.monthlyTarget || 210000,
    avgOrderTarget: SEED.avgOrderTarget || 90,
    partners: SEED.partners || ["מרדכי", "אנה"],
    // revenue map: { 'YYYY-MM-DD': number }  (seeded from journal actuals)
    revenue: seedRevenue(),
    // tasks seeded from the משימות sheet, each with a stable id
    tasks: (SEED.tasks || []).map((t, i) => ({ id: "t" + i, done: t.status === "בוצע", ...t })),
    // per-event overrides: { eventKey: { done:bool, responsible:str } }
    eventOverrides: {},
  });

  function seedRevenue() {
    const map = {};
    (SEED.journal || []).forEach((j) => {
      if (typeof j.revenue === "number") map[j.date] = j.revenue;
    });
    return map;
  }

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) {}
    return defaultState();
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* --------------------------- Date helpers ------------------------------- */
  // "Today": use the real current date, but never earlier than the data window
  // start so the demo shows meaningful numbers even if the clock differs.
  function today() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const firstData = SEED.calendar && SEED.calendar[0] ? new Date(SEED.calendar[0].date) : now;
    const lastData = SEED.calendar && SEED.calendar.length
      ? new Date(SEED.calendar[SEED.calendar.length - 1].date) : now;
    if (now < firstData) return firstData;
    if (now > lastData) return lastData;
    return now;
  }
  const iso = (d) => d.toISOString().slice(0, 10);
  const parse = (s) => { const d = new Date(s); d.setHours(0, 0, 0, 0); return d; };
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

  function hebrewDate(d) {
    try {
      return new Intl.DateTimeFormat("he-u-ca-hebrew", {
        day: "numeric", month: "long", year: "numeric",
      }).format(d);
    } catch (e) { return ""; }
  }
  function gregDate(d) {
    return new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  }
  const nf = (n) => new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(Math.round(n || 0));
  const money = (n) => "₪" + nf(n);

  /* --------------------------- Calendar index ----------------------------- */
  const calByDate = {};
  (SEED.calendar || []).forEach((c) => { calByDate[c.date] = c; });

  // Events we treat as "major" for the upcoming-events highlight
  const MINOR = new Set(["יום שישי", "מוצאי שבת", ""]);

  // Group consecutive calendar days sharing the same event into periods.
  function eventPeriods() {
    const periods = [];
    let cur = null;
    (SEED.calendar || []).forEach((c) => {
      const ev = (c.event || "").trim();
      if (!ev || MINOR.has(ev)) { cur = null; return; }
      if (cur && cur.event === ev && daysBetween(cur.end, c.date) <= 1) {
        cur.end = c.date;
      } else {
        cur = { event: ev, start: c.date, end: c.date,
                importance: c.importance, task: c.task, responsible: c.responsible };
        periods.push(cur);
      }
    });
    return periods;
  }
  const PERIODS = eventPeriods();

  /* ------------------------------ Metrics --------------------------------- */
  function currentMonthMetrics() {
    const t = today();
    const y = t.getFullYear(), m = t.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    let cumulative = 0, daysWithData = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const key = iso(new Date(y, m, day));
      const v = state.revenue[key];
      if (typeof v === "number" && v > 0) { cumulative += v; daysWithData++; }
    }
    const avgDaily = daysWithData ? cumulative / daysWithData : 0;
    const projected = avgDaily * daysInMonth;
    // orders / avg-order from journal (current month)
    let orders = 0, orderRevenue = 0;
    (SEED.journal || []).forEach((j) => {
      const d = parse(j.date);
      if (d.getFullYear() === y && d.getMonth() === m && j.orders) {
        orders += j.orders; if (typeof j.revenue === "number") orderRevenue += j.revenue;
      }
    });
    const avgOrder = orders ? orderRevenue / orders : 0;
    return {
      cumulative, daysWithData, daysInMonth, avgDaily, projected, orders, avgOrder,
      target: state.monthlyTarget,
      pct: state.monthlyTarget ? cumulative / state.monthlyTarget : 0,
      projectedPct: state.monthlyTarget ? projected / state.monthlyTarget : 0,
      remaining: Math.max(0, state.monthlyTarget - cumulative),
    };
  }

  /* ------------------------------- Gauge SVG ------------------------------ */
  // Semicircular gauge, 180°(left) -> 0°(right). value clamped to [0, max].
  function gaugeSVG(opts) {
    const { value, max, zones, ticks = true } = opts;
    const v = Math.max(0, Math.min(value, max));
    const frac = max ? v / max : 0;
    const angle = 180 - frac * 180; // degrees
    const cx = 100, cy = 100, r = 82;
    const polar = (deg) => {
      const rad = (deg * Math.PI) / 180;
      return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
    };
    // colored zone arcs
    let arcs = "";
    (zones || []).forEach((z) => {
      const a0 = 180 - z.from * 180, a1 = 180 - z.to * 180;
      const [x0, y0] = polar(a0), [x1, y1] = polar(a1);
      const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
      arcs += `<path d="M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}"
                 fill="none" stroke="${z.color}" stroke-width="14" stroke-linecap="round" opacity=".85"/>`;
    });
    // ticks
    let tickEls = "";
    if (ticks) {
      for (let i = 0; i <= 10; i++) {
        const a = 180 - (i / 10) * 180;
        const [xo, yo] = (() => { const rad = a * Math.PI / 180; return [cx + (r + 9) * Math.cos(rad), cy - (r + 9) * Math.sin(rad)]; })();
        const [xi, yi] = (() => { const rad = a * Math.PI / 180; return [cx + (r - 2) * Math.cos(rad), cy - (r - 2) * Math.sin(rad)]; })();
        tickEls += `<line x1="${xi.toFixed(1)}" y1="${yi.toFixed(1)}" x2="${xo.toFixed(1)}" y2="${yo.toFixed(1)}"
                    stroke="#3a4655" stroke-width="${i % 5 === 0 ? 2.5 : 1.2}"/>`;
      }
    }
    // needle
    const [nx, ny] = polar(angle);
    return `
    <svg class="gauge-svg" viewBox="0 5 200 118" role="img">
      <path d="M 18 100 A 82 82 0 0 1 182 100" fill="none" stroke="#222b36" stroke-width="14" stroke-linecap="round"/>
      ${arcs}
      ${tickEls}
      <line class="needle" x1="100" y1="100" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}"
            stroke="#e6edf3" stroke-width="3.5" stroke-linecap="round"
            style="transform: rotate(0deg)"/>
      <circle cx="100" cy="100" r="7" fill="#e6edf3"/>
      <circle cx="100" cy="100" r="3" fill="#0d1117"/>
    </svg>`;
  }

  /* ------------------------------- Render --------------------------------- */
  const $ = (sel) => document.querySelector(sel);

  function renderHeader() {
    const t = today();
    const c = calByDate[iso(t)];
    const period = c && c.event ? c.event : null;
    $("#today-greg").textContent = gregDate(t);
    $("#today-heb").textContent = (c && c.hebrew) || hebrewDate(t);
    const badge = $("#period-badge");
    if (period && !MINOR.has(period)) {
      badge.textContent = "📌 " + period; badge.style.display = "";
    } else { badge.style.display = "none"; }
  }

  function renderGauges() {
    const m = currentMonthMetrics();
    // 1. Revenue vs target (hero)
    const g1 = gaugeSVG({
      value: m.cumulative, max: m.target,
      zones: [
        { from: 0, to: 0.5, color: "#ef4444" },
        { from: 0.5, to: 0.8, color: "#f59e0b" },
        { from: 0.8, to: 1, color: "#22c55e" },
      ],
    });
    const paceClass = m.projectedPct >= 1 ? "good" : m.projectedPct >= 0.85 ? "warn" : "bad";
    $("#gauge-revenue").innerHTML = g1 +
      `<div class="gauge-readout"><span class="big">${money(m.cumulative)}</span></div>
       <div class="gauge-meta">
         <div class="m"><div class="k">יעד חודשי</div><div class="v">${money(m.target)}</div></div>
         <div class="m"><div class="k">נותר ליעד</div><div class="v ${m.remaining ? "warn" : "good"}">${money(m.remaining)}</div></div>
         <div class="m"><div class="k">אחוז מהיעד</div><div class="v ${paceClass}">${Math.round(m.pct * 100)}%</div></div>
       </div>`;
    animateNeedle("#gauge-revenue", m.pct);

    // 2. Projected monthly pace vs target
    const g2 = gaugeSVG({
      value: m.projected, max: m.target * 1.2,
      zones: [
        { from: 0, to: 0.5 / 1.2, color: "#ef4444" },
        { from: 0.5 / 1.2, to: 0.83 / 1.2, color: "#f59e0b" },
        { from: 0.83 / 1.2, to: 1, color: "#22c55e" },
      ],
    });
    $("#gauge-pace").innerHTML = g2 +
      `<div class="gauge-readout"><span class="big">${money(m.projected)}</span></div>
       <div class="gauge-meta">
         <div class="m"><div class="k">ממוצע יומי</div><div class="v">${money(m.avgDaily)}</div></div>
         <div class="m"><div class="k">ימים עם נתונים</div><div class="v">${m.daysWithData}/${m.daysInMonth}</div></div>
       </div>`;
    animateNeedle("#gauge-pace", m.projected / (m.target * 1.2));

    // 3. Avg order vs target
    const target = state.avgOrderTarget || 90;
    const g3 = gaugeSVG({
      value: m.avgOrder, max: target * 2,
      zones: [
        { from: 0, to: 0.5, color: "#ef4444" },
        { from: 0.5, to: 0.75, color: "#f59e0b" },
        { from: 0.75, to: 1, color: "#22c55e" },
      ],
    });
    const aoClass = m.avgOrder >= target ? "good" : m.avgOrder >= target * 0.8 ? "warn" : "bad";
    $("#gauge-order").innerHTML = g3 +
      `<div class="gauge-readout"><span class="big">${money(m.avgOrder)}</span></div>
       <div class="gauge-meta">
         <div class="m"><div class="k">יעד ממוצע</div><div class="v">${money(target)}</div></div>
         <div class="m"><div class="k">מס׳ עסקאות</div><div class="v">${m.orders}</div></div>
         <div class="m"><div class="k">מצב</div><div class="v ${aoClass}">${m.avgOrder >= target ? "מעל היעד" : "מתחת ליעד"}</div></div>
       </div>`;
    animateNeedle("#gauge-order", Math.min(1, m.avgOrder / (target * 2)));

    return m;
  }

  function animateNeedle(sel, frac) {
    const needle = document.querySelector(sel + " .needle");
    if (!needle) return;
    const deg = -(1 - Math.max(0, Math.min(1, frac))) * 0 + (Math.max(0, Math.min(1, frac)) * 180 - 90) * -1;
    // rotate from pointing up: our needle base points left(180). We instead
    // recompute endpoint directly, so just apply a subtle settle animation.
    requestAnimationFrame(() => { needle.style.transform = "rotate(0deg)"; });
  }

  function nextEvents(n) {
    const t = iso(today());
    return PERIODS
      .filter((p) => p.end >= t)          // active or upcoming
      .sort((a, b) => (a.start < b.start ? -1 : 1))
      .slice(0, n)
      .map((p) => {
        const startsIn = Math.max(0, daysBetween(t, p.start));
        const active = p.start <= t && p.end >= t;
        return Object.assign({}, p, { startsIn, active });
      });
  }

  function renderUpcoming(m) {
    const ups = nextEvents(6);
    const hero = ups[0];
    const heroEl = $("#event-hero");
    if (hero) {
      const key = "ev:" + hero.start + ":" + hero.event;
      const ov = state.eventOverrides[key] || {};
      const resp = ov.responsible || hero.responsible || state.partners[0];
      heroEl.innerHTML = `
        <div class="name">${hero.active ? "🔴 עכשיו: " : ""}${hero.event}</div>
        <div class="count">${hero.active ? "בתקופה זו כעת · עד " + gregDate(parse(hero.end)) :
          "בעוד " + hero.startsIn + " ימים · " + gregDate(parse(hero.start))}</div>
        ${hero.task ? `<div class="rec"><div class="lbl">משימה עסקית מומלצת</div>${hero.task}</div>` : ""}
        <div class="who">
          <span>אחראי:</span>
          <select id="hero-resp">${state.partners.concat(ov.responsible && !state.partners.includes(ov.responsible) ? [ov.responsible] : [])
            .map((p) => `<option ${p === resp ? "selected" : ""}>${p}</option>`).join("")}</select>
          ${hero.importance ? `<span class="imp ${hero.importance === "גבוהה" ? "high" : "mid"}">חשיבות ${hero.importance}</span>` : ""}
        </div>`;
      const sel = $("#hero-resp");
      if (sel) sel.onchange = () => {
        state.eventOverrides[key] = Object.assign({}, ov, { responsible: sel.value });
        save(); toast("עודכן אחראי");
      };
    } else {
      heroEl.innerHTML = `<div class="name">אין אירוע קרוב</div>`;
    }

    // list (skip hero)
    const list = $("#upcoming-list");
    list.innerHTML = ups.slice(1).map((p) => `
      <li>
        <div class="days"><b>${p.active ? "•" : p.startsIn}</b><span>${p.active ? "כעת" : "ימים"}</span></div>
        <div class="info">
          <div class="n">${p.event} ${p.importance === "גבוהה" ? '<span class="imp high">גבוהה</span>' : ""}</div>
          <div class="h">${gregDate(parse(p.start))} · ${(calByDate[p.start] || {}).hebrew || ""}</div>
        </div>
      </li>`).join("") || `<li style="color:var(--text-mute)">אין אירועים נוספים בטווח</li>`;
  }

  function statusClass(s) {
    if (s === "בוצע") return "done";
    if (s === "בתהליך") return "progress";
    if (s === "תקוע") return "stuck";
    return "planned";
  }
  function renderTasks() {
    const list = $("#task-list");
    list.innerHTML = state.tasks.map((t) => `
      <li class="task ${t.done ? "done" : ""}" data-id="${t.id}">
        <div class="check" role="checkbox" aria-checked="${t.done}">✓</div>
        <div class="body">
          <div class="title">${t.title}</div>
          <div class="sub">
            ${t.area ? `<span class="tag">${t.area}</span>` : ""}
            ${t.responsible ? `<span class="tag">👤 ${t.responsible}</span>` : ""}
            <span class="status ${statusClass(t.done ? "בוצע" : t.status)}">${t.done ? "בוצע" : (t.status || "מתוכנן")}</span>
          </div>
        </div>
      </li>`).join("");
    list.querySelectorAll(".task .check").forEach((c) => {
      c.onclick = () => {
        const id = c.closest(".task").dataset.id;
        const t = state.tasks.find((x) => x.id === id);
        t.done = !t.done; if (t.done) t.status = "בוצע";
        save(); renderTasks(); renderLights(currentMonthMetrics());
      };
    });
    // counters
    const inProg = state.tasks.filter((t) => !t.done && t.status === "בתהליך").length;
    const stuck = state.tasks.filter((t) => !t.done && t.status === "תקוע").length;
    $("#task-badge").textContent = `בתהליך ${inProg} · תקוע ${stuck} · בוצע ${state.tasks.filter((t) => t.done).length}/${state.tasks.length}`;
  }

  function renderLights(m) {
    const lights = [];
    // pace
    if (m.projectedPct >= 1) lights.push(["good", "🟢", "מחזור בקצב", "צפי לעמידה ביעד החודשי"]);
    else if (m.projectedPct >= 0.85) lights.push(["warn", "🟡", "מחזור מתחת לקצב", `צפי ${Math.round(m.projectedPct * 100)}% מהיעד`]);
    else lights.push(["bad", "🔴", "מחזור נמוך", `צפי ${Math.round(m.projectedPct * 100)}% מהיעד — דרוש דחיפה`]);

    // upcoming event within 7 days
    const next = nextEvents(1)[0];
    if (next && !next.active && next.startsIn <= 7) {
      lights.push(["warn", "📅", "היערכות לאירוע", `${next.event} בעוד ${next.startsIn} ימים`]);
    } else if (next && next.active) {
      lights.push(["warn", "🔥", "אירוע פעיל", `${next.event} — בתקופה כעת`]);
    } else {
      lights.push(["good", "📅", "אין אירוע דחוף", "אין חג/אירוע בשבוע הקרוב"]);
    }

    // avg order
    if (m.avgOrder && m.avgOrder < (state.avgOrderTarget || 90) * 0.85) {
      lights.push(["warn", "🧾", "ממוצע הזמנה נמוך", `${money(m.avgOrder)} מול יעד ${money(state.avgOrderTarget)}`]);
    } else {
      lights.push(["good", "🧾", "ממוצע הזמנה תקין", `${money(m.avgOrder)} להזמנה`]);
    }

    // stuck tasks
    const stuck = state.tasks.filter((t) => !t.done && t.status === "תקוע").length;
    if (stuck) lights.push(["bad", "🛑", "משימות תקועות", `${stuck} משימות דורשות טיפול`]);
    else lights.push(["good", "✅", "משימות תקינות", "אין משימות תקועות"]);

    $("#lights").innerHTML = lights.map(([cls, ic, t, d]) => `
      <div class="light ${cls}"><span class="icon">${ic}</span>
        <div class="txt"><div class="t">${t}</div><div class="d">${d}</div></div>
      </div>`).join("");
  }

  function renderSpark() {
    const t = today(); const y = t.getFullYear(), m = t.getMonth();
    const days = new Date(y, m + 1, 0).getDate();
    const pts = [];
    for (let d = 1; d <= days; d++) {
      const v = state.revenue[iso(new Date(y, m, d))];
      if (typeof v === "number") pts.push({ d, v });
    }
    if (pts.length < 2) { $("#spark").innerHTML = ""; return; }
    const maxV = Math.max(...pts.map((p) => p.v));
    const W = 100, H = 100;
    const step = W / (days - 1);
    const path = pts.map((p, i) => `${i ? "L" : "M"} ${((p.d - 1) * step).toFixed(1)} ${(H - (p.v / maxV) * (H - 8) - 4).toFixed(1)}`).join(" ");
    $("#spark").innerHTML = `
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:60px">
        <path d="${path}" fill="none" stroke="#38bdf8" stroke-width="2.2" vector-effect="non-scaling-stroke"/>
        ${pts.map((p) => `<circle cx="${((p.d - 1) * step).toFixed(1)}" cy="${(H - (p.v / maxV) * (H - 8) - 4).toFixed(1)}" r="1.6" fill="#38bdf8"/>`).join("")}
      </svg>`;
  }

  /* ----------------------------- Interactions ----------------------------- */
  function toast(msg) {
    let el = $("#toast");
    el.textContent = msg; el.classList.add("show");
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 1800);
  }

  function renderAll() {
    renderHeader();
    const m = renderGauges();
    renderLights(m);
    renderUpcoming(m);
    renderTasks();
    renderSpark();
  }

  function wireControls() {
    // add today's revenue
    $("#rev-form").onsubmit = (e) => {
      e.preventDefault();
      const date = $("#rev-date").value || iso(today());
      const val = parseFloat($("#rev-amount").value);
      if (!isNaN(val)) {
        state.revenue[date] = val; save(); renderAll();
        toast("מחזור נשמר: " + money(val));
        $("#rev-amount").value = "";
      }
    };
    // target edit
    $("#target-edit").onclick = () => {
      const v = prompt("יעד מחזור חודשי (₪):", state.monthlyTarget);
      if (v && !isNaN(parseFloat(v))) { state.monthlyTarget = parseFloat(v); save(); renderAll(); toast("היעד עודכן"); }
    };
    $("#reset").onclick = () => {
      if (confirm("לאפס את כל הנתונים לברירת המחדל מהאקסל?")) {
        localStorage.removeItem(LS_KEY); state = defaultState(); renderAll(); toast("אופס לברירת מחדל");
      }
    };
    $("#rev-date").value = iso(today());
  }

  /* ------------------------------- Boot ----------------------------------- */
  document.addEventListener("DOMContentLoaded", () => {
    renderAll();
    wireControls();
  });
})();
