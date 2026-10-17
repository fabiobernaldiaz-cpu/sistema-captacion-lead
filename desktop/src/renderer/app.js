/* ══════════════════════════════════════════════════════════════
   RedesiaNet Monitor · panel
   Todo el texto que viene de la web (nombres, procesos, notas) se
   pinta con textContent: nunca se interpreta como HTML.
   ══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var rn = window.rn;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var nf = new Intl.NumberFormat("es-ES");
  var dShort = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" });
  var dLong = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  var tHM = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  var STATUS = { nuevo: "Nuevo", contactado: "Contactado", propuesta: "Propuesta", cliente: "Cliente", descartado: "Descartado" };
  var SUB = { activo: "Activo", pendiente: "Pendiente", baja: "Baja" };

  var state = {
    settings: null, view: "summary", status: "idle", days: 30,
    summary: null, leads: [], leadsTotal: 0, leadFilter: { status: "", q: "" },
    current: null, hits: [], subs: [], newLeadIds: new Set(), live: 0,
  };

  /* ── Utilidades ─────────────────────────────────────────── */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "text") el.textContent = v;
      else if (k === "class") el.className = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    }
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function n(x) { return x === null || x === undefined ? "—" : nf.format(x); }
  function when(ts) { return dLong.format(new Date(ts * 1000)); }
  function ago(ts) {
    var s = Math.max(0, Math.round(Date.now() / 1000 - ts));
    if (s < 60) return "hace " + s + " s";
    if (s < 3600) return "hace " + Math.round(s / 60) + " min";
    if (s < 86400) return "hace " + Math.round(s / 3600) + " h";
    return dShort.format(new Date(ts * 1000));
  }
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function pill(cls, label) { return h("span", { class: "pill " + cls, text: label }); }
  function planLabel(l) {
    return (l.plan || "Sin decidir") + (l.billing === "anual" ? " · 12 meses" : "");
  }
  async function api(action, opts) {
    var r = await rn.api(action, opts);
    if (!r || r.ok === false) throw new Error((r && r.error) || "Error");
    return r;
  }

  /* ── Navegación ─────────────────────────────────────────── */
  var TITLES = {
    summary: ["Resumen", "Así va redesianet.com"],
    leads: ["Leads", "Solicitudes de auditoría desde la web"],
    live: ["En vivo", "Lo que está pasando ahora en la web"],
    subs: ["Suscriptores", "Newsletter con doble confirmación"],
    settings: ["Ajustes", "Conexión y avisos"],
  };
  function go(view) {
    state.view = view;
    $$(".menu button").forEach(function (b) { b.classList.toggle("is-active", b.dataset.view === view); });
    $$(".view").forEach(function (v) { v.hidden = v.id !== "view-" + view; });
    $("#view-title").textContent = TITLES[view][0];
    $("#view-sub").textContent = TITLES[view][1];
    renderTopActions();
    if (view === "summary") loadSummary();
    if (view === "leads") loadLeads(true);
    if (view === "live") loadHits();
    if (view === "subs") loadSubs();
    if (view === "settings") fillSettings();
  }
  $$(".menu button").forEach(function (b) { b.addEventListener("click", function () { go(b.dataset.view); }); });

  function renderTopActions() {
    var box = clear($("#top-actions"));
    if (state.view === "summary") {
      var seg = h("div", { class: "seg", role: "group", "aria-label": "Periodo" });
      [7, 30, 90].forEach(function (d) {
        seg.appendChild(h("button", { type: "button", class: d === state.days ? "is-active" : "", text: d + " días",
          onclick: function () { state.days = d; rn.saveSettings({ rangeDays: d }); renderTopActions(); loadSummary(); } }));
      });
      box.appendChild(seg);
      box.appendChild(h("button", { type: "button", class: "btn", text: "Actualizar", onclick: function () { loadSummary(); rn.checkNow(); } }));
    }
    if (state.view === "leads") box.appendChild(h("button", { type: "button", class: "btn", text: "Exportar CSV", onclick: function () { exportCsv("leads"); } }));
    if (state.view === "subs") box.appendChild(h("button", { type: "button", class: "btn", text: "Exportar CSV", onclick: function () { exportCsv("subscribers"); } }));
    if (state.view !== "settings") {
      box.appendChild(h("button", { type: "button", class: "btn primary", text: "Abrir la web",
        onclick: function () { rn.openExternal(state.settings.site); } }));
    }
  }

  async function exportCsv(type) {
    var r = await rn.exportCsv(type);
    if (r.ok) toast("CSV guardado");
    else if (!r.canceled) toast(r.error || "No se pudo exportar");
  }

  /* ── Resumen ────────────────────────────────────────────── */
  async function loadSummary() {
    try {
      state.summary = await api("summary", { params: { days: state.days } });
      state.live = state.summary.today.live;
      renderSummary();
      updateLive();
    } catch (e) { renderSummaryError(e.message); }
  }

  function kpi(label, value, note, cls) {
    return h("div", { class: "kpi " + (cls || "") }, h("p", { text: label }), h("b", { text: value }), note ? h("small", { text: note }) : null);
  }

  function renderSummary() {
    var s = state.summary;
    var k = clear($("#kpis"));
    k.appendChild(kpi("Visitantes hoy", n(s.today.visitors), n(s.today.pageviews) + " páginas vistas"));
    k.appendChild(kpi("En la web ahora", n(s.today.live), "últimos 5 minutos", s.today.live ? "accent" : ""));
    k.appendChild(kpi("Leads hoy", n(s.today.leads), s.today.subscribers ? n(s.today.subscribers) + " suscripciones" : "solicitudes de auditoría", s.today.leads ? "accent" : ""));
    k.appendChild(kpi("Sin atender", n(s.range.new_leads), "leads en estado «nuevo»", s.range.new_leads ? "alert" : ""));
    k.appendChild(kpi("Visitantes " + s.days + " d", n(s.range.visitors), n(s.range.pageviews) + " páginas vistas"));
    k.appendChild(kpi("Leads " + s.days + " d", n(s.range.leads), "solicitudes recibidas"));
    k.appendChild(kpi("Conversión", s.range.conversion === null ? "—" : String(s.range.conversion).replace(".", ",") + " %", "leads / visitantes medidos"));
    k.appendChild(kpi("Suscriptores", n(s.range.subscribers), "activos en la newsletter"));
    renderChart(s.series);
    bars("#top-pages", s.top_pages);
    bars("#top-sources", s.top_sources);
    bars("#devices", s.devices);
    bars("#ctas", s.cta);
    bars("#plans", s.leads_by_plan);
    renderLastLeads();
    $("#consent-note").textContent = "Las visitas solo incluyen a quienes aceptan la analítica en el banner de cookies" +
      (s.range.consent_rate === null ? "." : " (en este periodo, el " + String(s.range.consent_rate).replace(".", ",") + " %).");
  }
  function renderSummaryError(msg) {
    var k = clear($("#kpis"));
    k.appendChild(h("div", { class: "kpi alert" }, h("p", { text: "No se pudieron cargar los datos" }), h("small", { text: msg })));
  }

  function bars(sel, rows) {
    var ul = clear($(sel));
    if (!rows || !rows.length) { ul.appendChild(h("li", { class: "empty-row", text: "Sin datos todavía" })); return; }
    var max = Math.max.apply(null, rows.map(function (r) { return +r.n; }));
    rows.forEach(function (r) {
      var bar = h("i");
      bar.style.setProperty("--w", Math.max(3, (r.n / max) * 100) + "%");
      ul.appendChild(h("li", null, h("span", { text: r.label || "—", title: r.label || "" }), h("b", { text: n(+r.n) }), bar));
    });
  }

  async function renderLastLeads() {
    var ul = clear($("#last-leads"));
    try {
      var r = await api("leads", { params: { limit: 5 } });
      if (!r.leads.length) { ul.appendChild(h("li", { class: "empty-row", text: "Aún no hay leads. Llegarán aquí al instante." })); return; }
      r.leads.forEach(function (l) {
        ul.appendChild(h("li", { onclick: function () { go("leads"); openLead(l.id); } },
          h("div", null, h("b", { text: l.company }), h("small", { text: l.name + " · " + ago(l.created_at) })),
          pill(l.status, STATUS[l.status] || l.status)));
      });
    } catch (e) { ul.appendChild(h("li", { class: "empty-row", text: e.message })); }
  }

  /* Gráfico SVG: barras = visitantes, línea = leads (eje propio) */
  function renderChart(series) {
    var NS = "http://www.w3.org/2000/svg";
    var W = 900, H = 230, P = { l: 34, r: 34, t: 12, b: 26 };
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Visitantes y leads por día");
    function el(name, attrs, parent) {
      var x = document.createElementNS(NS, name);
      Object.keys(attrs).forEach(function (k) { x.setAttribute(k, attrs[k]); });
      (parent || svg).appendChild(x);
      return x;
    }
    var maxV = Math.max(4, Math.max.apply(null, series.map(function (d) { return d.visitors; })));
    var maxL = Math.max(2, Math.max.apply(null, series.map(function (d) { return d.leads; })));
    var cw = (W - P.l - P.r) / series.length;
    var y = function (v) { return P.t + (H - P.t - P.b) * (1 - v / maxV); };
    var yl = function (v) { return P.t + (H - P.t - P.b) * (1 - v / maxL); };
    var grid = el("g", { class: "grid" });
    var axis = el("g", { class: "axis" });
    [0, 0.5, 1].forEach(function (f) {
      var yy = P.t + (H - P.t - P.b) * (1 - f);
      el("line", { x1: P.l, x2: W - P.r, y1: yy, y2: yy }, grid);
      el("text", { x: P.l - 8, y: yy + 3, "text-anchor": "end" }, axis).textContent = nf.format(Math.round(maxV * f));
      el("text", { x: W - P.r + 8, y: yy + 3 }, axis).textContent = nf.format(Math.round(maxL * f * 10) / 10);
    });
    var last = series.length - 1;
    var pts = [];
    series.forEach(function (d, i) {
      var x = P.l + i * cw;
      var bh = (H - P.t - P.b) - (y(d.visitors) - P.t);
      var rect = el("rect", { class: "bar" + (i === last ? " today" : ""), x: x + cw * 0.18, width: Math.max(1, cw * 0.64),
        y: y(d.visitors), height: Math.max(0, bh), rx: Math.min(3, cw * 0.2) });
      var label = new Date(d.day + "T12:00:00");
      el("title", {}, rect).textContent = dShort.format(label) + ": " + d.visitors + " visitantes, " + d.pageviews + " páginas, " + d.leads + " leads";
      pts.push([x + cw / 2, yl(d.leads)]);
      var every = series.length > 40 ? 10 : series.length > 14 ? 5 : 1;
      if ((last - i) % every === 0) {
        el("text", { x: x + cw / 2, y: H - 8, "text-anchor": "middle" }, axis).textContent = i === last ? "hoy" : dShort.format(label);
      }
    });
    el("path", { class: "line", d: pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ") });
    series.forEach(function (d, i) { if (d.leads) el("circle", { class: "dot", cx: pts[i][0], cy: pts[i][1], r: 3.5 }); });
    clear($("#chart")).appendChild(svg);
  }

  /* ── Leads ──────────────────────────────────────────────── */
  async function loadLeads(reset) {
    if (reset) { state.leads = []; }
    try {
      var r = await api("leads", { params: { status: state.leadFilter.status, q: state.leadFilter.q, limit: 50, offset: state.leads.length } });
      state.leads = state.leads.concat(r.leads);
      state.leadsTotal = r.total;
      renderLeads();
    } catch (e) { toast(e.message); }
  }
  function renderLeads() {
    var tb = clear($("#leads-table tbody"));
    state.leads.forEach(function (l) {
      tb.appendChild(h("tr", { class: state.newLeadIds.has(l.id) ? "is-new" : "", onclick: function () { openLead(l.id); } },
        h("td", null, h("span", { class: "sub", text: when(l.created_at) })),
        h("td", { class: "main-cell" }, h("b", { text: l.company }), h("small", { text: l.name + " · " + l.email })),
        h("td", { text: planLabel(l) }),
        h("td", null, h("span", { class: "sub", text: l.source })),
        h("td", null, pill(l.status, STATUS[l.status] || l.status))));
    });
    $("#leads-empty").hidden = state.leads.length > 0;
    $("#leads-more").hidden = state.leads.length >= state.leadsTotal;
    updateLeadBadge();
  }
  $("#leads-more").addEventListener("click", function () { loadLeads(false); });
  var qTimer = null;
  $("#lead-q").addEventListener("input", function (e) {
    clearTimeout(qTimer);
    qTimer = setTimeout(function () { state.leadFilter.q = e.target.value.trim(); loadLeads(true); }, 250);
  });
  $("#lead-status").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    $$("#lead-status button").forEach(function (x) { x.classList.toggle("is-active", x === b); });
    state.leadFilter.status = b.dataset.status;
    loadLeads(true);
  });

  async function updateLeadBadge() {
    try {
      var r = await api("leads", { params: { status: "nuevo", limit: 1 } });
      var b = $("#badge-leads");
      b.textContent = r.total;
      b.hidden = !r.total;
    } catch (e) { /* sin conexión: se queda como estaba */ }
  }

  /* Ficha */
  async function openLead(id) {
    try {
      var r = await api("lead", { params: { id: id } });
      state.current = r.lead;
      state.newLeadIds.delete(id);
      fillDrawer(r.lead);
      $("#drawer").hidden = false;
      $("#drawer-back").hidden = false;
      $("#d-close").focus();
    } catch (e) { toast(e.message); }
  }
  function closeDrawer() {
    $("#drawer").hidden = true;
    $("#drawer-back").hidden = true;
    state.current = null;
  }
  function fillDrawer(l) {
    $("#d-date").textContent = when(l.created_at) + " · " + ago(l.created_at);
    $("#d-company").textContent = l.company;
    $("#d-name").textContent = l.name;
    $("#d-status").value = l.status;
    $("#d-process").textContent = l.process || "—";
    $("#d-notes").value = l.notes || "";
    var dl = clear($("#d-fields"));
    [["Email", l.email], ["Teléfono", l.phone || "—"], ["Tamaño", l.employees ? l.employees + " personas" : "—"],
     ["Plan", l.plan || "Sin decidir"], ["Modalidad", l.billing === "anual" ? "Permanencia 12 meses (−20 %)" : "Sin permanencia"],
     ["Origen", l.source], ["Entró por", l.landing || "—"], ["Envió desde", l.page || "—"],
     ["Newsletter", l.consent_marketing ? "Sí, la pidió" : "No"]].forEach(function (row) {
      dl.appendChild(h("dt", { text: row[0] }));
      dl.appendChild(h("dd", { text: row[1] }));
    });
    $("#d-call").disabled = !l.phone;
  }
  $("#d-close").addEventListener("click", closeDrawer);
  $("#drawer-back").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("#drawer").hidden) closeDrawer(); });
  $("#d-status").addEventListener("change", async function (e) {
    try {
      var r = await api("lead_update", { body: { id: state.current.id, status: e.target.value } });
      state.current = r.lead;
      patchLead(r.lead);
      toast("Estado: " + STATUS[r.lead.status]);
    } catch (err) { toast(err.message); }
  });
  $("#d-save").addEventListener("click", async function () {
    try {
      var r = await api("lead_update", { body: { id: state.current.id, notes: $("#d-notes").value } });
      state.current = r.lead;
      patchLead(r.lead);
      toast("Notas guardadas");
    } catch (err) { toast(err.message); }
  });
  $("#d-mail").addEventListener("click", function () {
    var l = state.current;
    var subject = encodeURIComponent("Tu auditoría gratuita con RedesiaNet");
    var body = encodeURIComponent("Hola " + l.name.split(" ")[0] + ":\n\nGracias por escribirnos. ¿Te viene bien una videollamada esta semana? Con una sola llamada hacemos tu auditoría y ves qué compensa automatizar.\n\nUn saludo,\nFabio — RedesiaNet");
    rn.openExternal("mailto:" + l.email + "?subject=" + subject + "&body=" + body);
    if (l.status === "nuevo") { $("#d-status").value = "contactado"; $("#d-status").dispatchEvent(new Event("change")); }
  });
  $("#d-call").addEventListener("click", function () { if (state.current.phone) rn.openExternal("tel:" + state.current.phone.replace(/\s+/g, "")); });
  $("#d-copy").addEventListener("click", function () { navigator.clipboard.writeText(state.current.email).then(function () { toast("Email copiado"); }); });
  $("#d-delete").addEventListener("click", async function () {
    var l = state.current;
    if (!window.confirm("¿Eliminar el lead de " + l.company + "? Esta acción no se puede deshacer.")) return;
    try {
      await api("lead_delete", { body: { id: l.id } });
      state.leads = state.leads.filter(function (x) { return x.id !== l.id; });
      state.leadsTotal = Math.max(0, state.leadsTotal - 1);
      closeDrawer();
      renderLeads();
      toast("Lead eliminado");
    } catch (err) { toast(err.message); }
  });
  function patchLead(lead) {
    state.leads = state.leads.map(function (x) { return x.id === lead.id ? lead : x; });
    if (state.view === "leads") renderLeads();
  }

  /* ── En vivo ────────────────────────────────────────────── */
  async function loadHits() {
    try {
      var r = await api("hits", { params: { limit: 150 } });
      state.hits = r.hits;
      renderFeed();
      refreshLive();
    } catch (e) { toast(e.message); }
  }
  var EV = { pageview: "Vio", cta: "Pulsó", form_start: "Empezó el formulario", lead: "Envió una solicitud", newsletter: "Se suscribió", billing: "Cambió la modalidad a" };
  function feedItem(x, flash) {
    var cls = x.type === "lead" ? "lead" : x.type === "cta" || x.type === "form_start" ? "cta" : (+x.is_new ? "new" : "");
    var what = x.type === "pageview" ? x.path : (x.label || x.path);
    var meta = [x.utm_source || x.ref_host || "directo", x.device, x.browser, x.os].filter(Boolean).join(" · ");
    return h("li", { class: flash ? "flash" : "" },
      h("time", { text: tHM.format(new Date(x.created_at * 1000)) }),
      h("span", { class: "ev " + cls }),
      h("div", { class: "what" }, h("b", { text: (EV[x.type] || x.type) + " " + what }), h("small", { text: meta })),
      +x.is_new ? h("span", { class: "tag", text: "nuevo" }) : h("span"));
  }
  function renderFeed() {
    var ol = clear($("#feed"));
    state.hits.forEach(function (x) { ol.appendChild(feedItem(x, false)); });
    $("#feed-empty").hidden = state.hits.length > 0;
  }
  function updateLive() {
    var live = state.live || 0;
    $("#live-count").textContent = nf.format(live);
    $("#live-dot").hidden = !live;
  }
  async function refreshLive() {
    try { var r = await api("summary", { params: { days: 7 } }); state.live = r.today.live; } catch (e) { /* sin conexión */ }
    updateLive();
  }

  /* ── Suscriptores ───────────────────────────────────────── */
  async function loadSubs() {
    try {
      var r = await api("subscribers", { params: { limit: 500 } });
      state.subs = r.subscribers;
      var tb = clear($("#subs-table tbody"));
      r.subscribers.forEach(function (s) {
        tb.appendChild(h("tr", null,
          h("td", { class: "main-cell" }, h("b", { text: s.email })),
          h("td", null, pill(s.status, SUB[s.status] || s.status)),
          h("td", null, h("span", { class: "sub", text: s.source || "—" })),
          h("td", null, h("span", { class: "sub", text: when(s.created_at) })),
          h("td", null, h("button", { type: "button", class: "icon-btn", title: "Eliminar", "aria-label": "Eliminar " + s.email, text: "×",
            onclick: async function (e) {
              e.stopPropagation();
              if (!window.confirm("¿Eliminar a " + s.email + " de la lista?")) return;
              try { await api("subscriber_delete", { body: { id: s.id } }); loadSubs(); toast("Eliminado"); } catch (err) { toast(err.message); }
            } }))));
      });
      $("#subs-empty").hidden = r.subscribers.length > 0;
    } catch (e) { toast(e.message); }
  }

  /* ── Ajustes ────────────────────────────────────────────── */
  function fillSettings() {
    var s = state.settings, f = $("#settings-form");
    f.site.value = s.site || "";
    f.token.value = "";
    $("#token-hint").textContent = s.hasToken ? "(guardado: " + s.tokenHint + ")" : "(sin configurar)";
    ["notifyLeads", "notifySubs", "sound", "openAtLogin", "minimizeToTray"].forEach(function (k) { f[k].checked = !!s[k]; });
    f.notifyVisits.value = s.notifyVisits || "new";
    f.pollSeconds.value = String(s.pollSeconds || 15);
    $("#about").textContent = "RedesiaNet Monitor " + s.version + (s.encrypted ? " · token cifrado con Windows" : "");
    $("#settings-msg").textContent = "";
  }
  $("#settings-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = e.target, msg = $("#settings-msg");
    msg.className = "form-msg";
    msg.textContent = "Guardando…";
    var patch = {
      site: f.site.value, notifyVisits: f.notifyVisits.value, pollSeconds: +f.pollSeconds.value,
      notifyLeads: f.notifyLeads.checked, notifySubs: f.notifySubs.checked, sound: f.sound.checked,
      openAtLogin: f.openAtLogin.checked, minimizeToTray: f.minimizeToTray.checked,
    };
    if (f.token.value.trim()) patch.token = f.token.value.trim();
    var r = await rn.saveSettings(patch);
    if (r.ok) {
      state.settings = Object.assign(state.settings, r.settings);
      fillSettings();
      msg.className = "form-msg ok";
      msg.textContent = "Guardado ✓";
    } else {
      msg.className = "form-msg bad";
      msg.textContent = r.error;
    }
  });
  $("#btn-test").addEventListener("click", async function () {
    var msg = $("#settings-msg");
    msg.className = "form-msg";
    msg.textContent = "Probando…";
    var r = await rn.test();
    msg.className = "form-msg " + (r.ok ? "ok" : "bad");
    msg.textContent = r.ok ? "Conectado ✓ · " + n(r.counts.leads) + " leads · API " + r.version : r.error;
  });

  /* ── Bienvenida ─────────────────────────────────────────── */
  $("#onboard-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = e.target, msg = $("#onboard-msg");
    msg.className = "form-msg";
    msg.textContent = "Conectando…";
    var r = await rn.saveSettings({ site: f.site.value, token: f.token.value });
    if (!r.ok) { msg.className = "form-msg bad"; msg.textContent = r.error; return; }
    state.settings = Object.assign(state.settings, r.settings);
    $("#onboard").hidden = true;
    go("summary");
  });

  /* ── Estado y eventos en directo ────────────────────────── */
  var LABELS = { online: "Conectado", offline: "Sin conexión, reintentando…", auth_error: "Token no válido", unconfigured: "Sin configurar", idle: "Conectando…" };
  function setStatus(s, detail) {
    state.status = s;
    var c = $("#conn");
    c.dataset.status = s;
    $("span", c).textContent = LABELS[s] || s;
    c.title = detail || "";
    if (s === "auth_error") { toast("El token no es válido: revísalo en Ajustes"); go("settings"); }
  }
  rn.onStatus(function (p) { setStatus(p.status, p.detail); });
  rn.onEvents(function (e) {
    if (e.leads.length) {
      e.leads.forEach(function (l) { state.newLeadIds.add(l.id); });
      updateLeadBadge();
      if (state.view === "leads") loadLeads(true);
    }
    if (e.hits.length) {
      state.hits = e.hits.slice().reverse().concat(state.hits).slice(0, 300);
      if (state.view === "live") {
        var ol = $("#feed");
        e.hits.forEach(function (x) { ol.insertBefore(feedItem(x, true), ol.firstChild); });
        while (ol.children.length > 300) ol.removeChild(ol.lastChild);
        $("#feed-empty").hidden = true;
      }
    }
    if (e.subscribers.length && state.view === "subs") loadSubs();
    if (state.view === "summary") loadSummary();
    else if (e.hits.length) refreshLive();
  });
  rn.onNavigate(function (p) {
    go(p.view);
    if (p.leadId) openLead(p.leadId);
  });

  // refresco suave del resumen y del contador "en vivo"
  setInterval(function () {
    if (state.status !== "online") return;
    if (state.view === "summary") loadSummary(); else refreshLive();
  }, 60000);

  /* ── Inicio ─────────────────────────────────────────────── */
  rn.getSettings().then(function (s) {
    state.settings = s;
    state.days = s.rangeDays || 30;
    setStatus(s.status || "idle");
    if (!s.hasToken) { $("#onboard").hidden = false; $("input[name=token]", $("#onboard")).focus(); return; }
    go("summary");
    updateLeadBadge();
  });
})();
