/* ══════════════════════════════════════════════════════════════
   CONSENTIMIENTO DE COOKIES
   - Nada opcional se carga hasta que el visitante decide.
   - "Aceptar" y "Rechazar" tienen el mismo peso visual y están en la
     primera capa (guía de cookies de la AEPD, 2023).
   - La elección se guarda 12 meses; al cambiar consentVersion se pide
     de nuevo. Cada decisión se registra (sin datos personales) en
     api/consent.php para poder demostrar el consentimiento (art. 7 RGPD).
   - Con Global Privacy Control activado se respeta como rechazo.
   Lo que se usa está descrito en cookies.html (si añades algo, añádelo allí).
   API pública: window.RNConsent.get() · .allows('analytics') · .open()
   Evento: document 'rn:consent' con el estado en event.detail.
   ══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var CFG = window.RN_CONFIG || {};
  var KEY = "rn_consent";
  var VERSION = CFG.consentVersion || "1";
  var MAX_AGE = (CFG.consentDays || 365) * 864e5;
  var HAS_MARKETING = !!CFG.metaPixelId;

  function read() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY));
      if (c && c.v === VERSION && c.date && Date.now() - Date.parse(c.date) < MAX_AGE) return c;
    } catch (e) { /* almacenamiento bloqueado: se trata como sin decidir */ }
    return null;
  }
  function write(c) {
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* sin almacenamiento */ }
  }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  var gpc = navigator.globalPrivacyControl === true;
  var state = read();
  if (!state && gpc) {
    state = { v: VERSION, id: null, date: new Date().toISOString(), analytics: false, marketing: false, gpc: true };
  }

  function emit() {
    document.dispatchEvent(new CustomEvent("rn:consent", { detail: state }));
  }

  function log(action) {
    var api = (CFG.api || "api") + "/consent.php";
    var body = JSON.stringify({
      id: state.id, action: action, analytics: state.analytics, marketing: state.marketing,
      version: VERSION, page: location.pathname
    });
    try {
      if (navigator.sendBeacon) { navigator.sendBeacon(api, new Blob([body], { type: "text/plain" })); return; }
      fetch(api, { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "text/plain" } });
    } catch (e) { /* el registro es complementario: no bloquea la navegación */ }
  }

  function decide(analytics, marketing, action) {
    var prev = state;
    state = {
      v: VERSION,
      id: (prev && prev.id) || uid(),
      date: new Date().toISOString(),
      analytics: !!analytics,
      marketing: !!(marketing && HAS_MARKETING)
    };
    write(state);
    log(action);
    if (!state.analytics) { try { sessionStorage.removeItem("rn_attr"); } catch (e) {} }
    if (prev && prev.marketing && !state.marketing) {
      // retirar el consentimiento no puede borrar cookies de terceros desde aquí:
      // recargamos para que el pixel deje de ejecutarse en esta pestaña
      setTimeout(function () { location.reload(); }, 150);
    }
    applyMarketing();
    hideBanner();
    closeModal();
    emit();
  }

  /* ── Pixel de Meta: solo con consentimiento de marketing ── */
  var pixelLoaded = false;
  function applyMarketing() {
    if (!state || !state.marketing || !HAS_MARKETING || pixelLoaded) return;
    pixelLoaded = true;
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */
    window.fbq("init", CFG.metaPixelId);
    window.fbq("track", "PageView");
  }

  /* ── Interfaz ───────────────────────────────────────────── */
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k]; // solo textos estáticos de este fichero
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function button(label, action, cls) {
    return el("button", { type: "button", "class": "btn " + cls, "data-cc": action, text: label });
  }

  var banner = null;
  function showBanner() {
    if (banner) return;
    banner = el("div", { "class": "cc-banner", role: "region", "aria-label": "Aviso de cookies" }, [
      el("h2", { text: "Tu privacidad, tus reglas" }),
      el("p", { html: "Usamos almacenamiento técnico para que la web funcione y, solo si lo aceptas, una analítica propia " +
        "(sin terceros ni publicidad) para saber qué páginas sirven. Puedes aceptar, rechazar o elegir. " +
        "<a href=\"/cookies.html\">Política de cookies</a>." }),
      el("div", { "class": "cc-actions" }, [
        button("Rechazar", "reject", "cc-btn"),
        button("Configurar", "config", "cc-btn-ghost"),
        button("Aceptar", "accept", "cc-btn")
      ])
    ]);
    banner.addEventListener("click", onAction);
    document.body.appendChild(banner);
  }
  function hideBanner() {
    if (banner) { banner.remove(); banner = null; }
  }

  var modal = null, lastFocus = null;
  function category(id, title, desc, locked, checked) {
    var control = locked
      ? el("span", { "class": "cc-always", text: "Siempre activas" })
      : el("label", { "class": "toggle" }, [
          el("input", { type: "checkbox", "data-cat": id, "aria-label": title }),
          el("span", { "aria-hidden": "true" })
        ]);
    if (!locked && checked) control.querySelector("input").checked = true;
    return el("div", { "class": "cc-cat" }, [
      el("div", { "class": "cc-cat-head" }, [el("h3", { text: title }), control]),
      el("p", { text: desc })
    ]);
  }
  function openModal() {
    if (modal) return;
    lastFocus = document.activeElement;
    var cur = state || { analytics: false, marketing: false };
    var cats = [
      category("necessary", "Técnicas",
        "Imprescindibles para que la web funcione y para recordar tu elección. No necesitan consentimiento.", true),
      category("analytics", "Analítica propia",
        "Nos dice qué páginas se visitan y de dónde llegan las solicitudes. Los datos se quedan en nuestro servidor: sin Google Analytics ni otros terceros.", false, cur.analytics)
    ];
    if (HAS_MARKETING) {
      cats.push(category("marketing", "Marketing",
        "Pixel de Meta para medir nuestros anuncios en Facebook e Instagram. Lo gestiona Meta Platforms Ireland Ltd.", false, cur.marketing));
    }
    var dialog = el("div", { "class": "cc-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "cc-title" }, [
      el("h2", { id: "cc-title", text: "Preferencias de cookies" }),
      el("p", { html: "Elige qué permites. Puedes cambiarlo cuando quieras desde «Configurar cookies», al pie de cada página. " +
        "Más detalle en la <a href=\"/cookies.html\">Política de cookies</a>." })
    ].concat(cats).concat([
      el("div", { "class": "cc-actions" }, [
        button("Rechazar todo", "reject", "cc-btn"),
        button("Guardar selección", "save", "cc-btn-ghost"),
        button("Aceptar todo", "accept", "cc-btn")
      ])
    ]));
    modal = el("div", { "class": "cc-modal" }, [dialog]);
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
      else onAction(e);
    });
    modal.addEventListener("keydown", trapKeys);
    document.body.appendChild(modal);
    var first = dialog.querySelector("input, button");
    if (first) first.focus();
  }
  function closeModal() {
    if (!modal) return;
    modal.remove();
    modal = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function trapKeys(e) {
    if (e.key === "Escape") { closeModal(); return; }
    if (e.key !== "Tab") return;
    var f = modal.querySelectorAll("button, input, a[href]");
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function onAction(e) {
    var b = e.target.closest("[data-cc]");
    if (!b) return;
    var a = b.getAttribute("data-cc");
    if (a === "accept") decide(true, true, "accept_all");
    else if (a === "reject") decide(false, false, "reject_all");
    else if (a === "config") { hideBanner(); openModal(); }
    else if (a === "save") {
      var an = modal.querySelector('[data-cat="analytics"]');
      var mk = modal.querySelector('[data-cat="marketing"]');
      decide(an && an.checked, mk && mk.checked, "custom");
    }
  }

  /* cookies.html describe en HTML todo lo que se usa; las filas de
     marketing solo se muestran si hay un Pixel configurado. */
  function syncPolicy() {
    [].slice.call(document.querySelectorAll("[data-if-marketing]")).forEach(function (n) { n.hidden = !HAS_MARKETING; });
  }

  window.RNConsent = {
    get: function () { return state; },
    allows: function (cat) { return !!(state && state[cat]); },
    open: function () { hideBanner(); openModal(); }
  };

  function init() {
    syncPolicy();
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-cookie-settings]")) { e.preventDefault(); window.RNConsent.open(); }
    });
    if (!state) showBanner();
    applyMarketing();
    emit();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
