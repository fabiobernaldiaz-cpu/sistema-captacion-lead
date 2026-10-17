/* ══════════════════════════════════════════════════════════════
   RedesiaNet · v3 — interacción de todas las páginas.
   Sin dependencias. Cada bloque comprueba si su HTML existe en la
   página y, si no, no hace nada.
   ══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var CFG = window.RN_CONFIG || {};
  var API = (CFG.api || "api").replace(/\/$/, "");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var fmt = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
  var fmtEUR = function (n) { return fmt.format(Math.round(n)) + " €"; };

  /* ── Analítica propia (solo con consentimiento) ───────────── */
  function consented() { return !!(window.RNConsent && window.RNConsent.allows("analytics")); }

  function attribution() {
    try { return JSON.parse(sessionStorage.getItem("rn_attr")) || {}; } catch (e) { return {}; }
  }
  function captureAttribution() {
    if (!consented()) return;
    try {
      if (sessionStorage.getItem("rn_attr")) return;
      var q = new URLSearchParams(location.search);
      var ref = document.referrer && document.referrer.indexOf(location.host) === -1 ? document.referrer : "";
      sessionStorage.setItem("rn_attr", JSON.stringify({
        landing: location.pathname,
        ref: ref.slice(0, 300),
        utm_source: (q.get("utm_source") || "").slice(0, 80),
        utm_medium: (q.get("utm_medium") || "").slice(0, 80),
        utm_campaign: (q.get("utm_campaign") || "").slice(0, 120)
      }));
    } catch (e) { /* sin almacenamiento */ }
  }

  function track(type, label) {
    if (!consented()) return;
    var a = attribution();
    var q = new URLSearchParams(location.search);
    var body = JSON.stringify({
      t: type,
      p: location.pathname,
      l: label ? String(label).slice(0, 120) : "",
      r: document.referrer && document.referrer.indexOf(location.host) === -1 ? document.referrer.slice(0, 300) : "",
      us: q.get("utm_source") || a.utm_source || "",
      um: q.get("utm_medium") || a.utm_medium || "",
      uc: q.get("utm_campaign") || a.utm_campaign || "",
      w: window.innerWidth,
      lg: (navigator.language || "").slice(0, 12)
    });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(API + "/hit.php", new Blob([body], { type: "text/plain" }));
      else fetch(API + "/hit.php", { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "text/plain" } });
    } catch (e) { /* la medición nunca debe romper la página */ }
  }

  var pageviewSent = false;
  function onConsent() {
    if (consented()) {
      captureAttribution();
      if (!pageviewSent) { pageviewSent = true; track("pageview"); }
    }
  }
  document.addEventListener("rn:consent", onConsent);
  onConsent();

  // clics en llamadas a la acción
  document.addEventListener("click", function (e) {
    var a = e.target.closest("a.btn, [data-track]");
    if (!a) return;
    var label = a.getAttribute("data-track") || (a.textContent || "").trim().slice(0, 60);
    var href = a.getAttribute("href") || "";
    if (href.indexOf("contacto.html") !== -1 || a.hasAttribute("data-track")) track("cta", label);
  });

  /* ── Navegación ───────────────────────────────────────────── */
  var nav = $("#nav");
  if (nav) {
    var onScrollNav = function () { nav.classList.toggle("is-scrolled", window.scrollY > 8); };
    onScrollNav();
    window.addEventListener("scroll", onScrollNav, { passive: true });
  }
  var burger = $("#burger");
  var menu = $("#mobile-menu");
  if (burger && menu) {
    var setMenu = function (open) {
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      burger.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
      menu.hidden = !open;
      document.body.classList.toggle("menu-open", open);
    };
    burger.addEventListener("click", function () { setMenu(menu.hidden); });
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menu.hidden) { setMenu(false); burger.focus(); } });
    window.addEventListener("resize", function () { if (window.innerWidth >= 980 && !menu.hidden) setMenu(false); });
  }

  /* ── Barra de promoción ───────────────────────────────────── */
  var promo = $("[data-promo]");
  if (promo) {
    var expired = CFG.promoEndsAt && new Date() > new Date(CFG.promoEndsAt + "T23:59:59");
    var closed = false;
    try { closed = sessionStorage.getItem("rn_promo") === "1"; } catch (e) {}
    if (expired || closed) promo.hidden = true;
    var close = $(".promo-close", promo);
    if (close) close.addEventListener("click", function () {
      promo.hidden = true;
      try { sessionStorage.setItem("rn_promo", "1"); } catch (e) {}
    });
  }

  /* ── Aparición al hacer scroll ────────────────────────────── */
  $$("[data-words]").forEach(function (host) {
    var i = 0;
    var word = function (text) {
      var s = document.createElement("span");
      s.className = "w";
      s.style.setProperty("--i", i++);
      s.textContent = text;
      return s;
    };
    var walk = function (node) {
      [].slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          var after = child.previousSibling && child.previousSibling.nodeType === 1;
          var frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(function (chunk, idx) {
            if (!chunk) return;
            if (/^\s+$/.test(chunk)) { frag.appendChild(document.createTextNode(chunk)); return; }
            // Puntuación justo después de un <em>: va en línea (no inline-block),
            // así el navegador nunca parte la línea antes del punto o la coma.
            var m = idx === 0 && after ? /^[.,;:!?»)…]+/.exec(chunk) : null;
            if (m) {
              var pnc = document.createElement("span");
              pnc.className = "wp";
              pnc.style.setProperty("--i", Math.max(0, i - 1));
              pnc.textContent = m[0];
              frag.appendChild(pnc);
              chunk = chunk.slice(m[0].length);
              if (!chunk) return;
            }
            frag.appendChild(word(chunk));
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1 && child.tagName !== "BR") {
          walk(child); // las palabras del <em> también entran una a una
        }
      });
    };
    walk(host);
    host.classList.add("reveal-words");
  });

  var revealables = $$(".reveal, .reveal-words");
  if (!reduced && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add("is-in");
        io.unobserve(en.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    revealables.forEach(function (el) { io.observe(el); });
  } else {
    revealables.forEach(function (el) { el.classList.add("is-in"); });
  }

  /* ── Contadores ───────────────────────────────────────────── */
  var counters = $$("[data-count]");
  if (counters.length && "IntersectionObserver" in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        cio.unobserve(en.target);
        var el = en.target;
        var to = parseFloat(el.getAttribute("data-count"));
        var suffix = el.getAttribute("data-suffix") || "";
        if (reduced) { el.textContent = fmt.format(to) + suffix; return; }
        var t0 = performance.now(), dur = 1400;
        var step = function (now) {
          var k = Math.min(1, (now - t0) / dur);
          var e = 1 - Math.pow(1 - k, 3);
          el.textContent = fmt.format(Math.round(to * e)) + suffix;
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* ── Marquesina: duplicamos el contenido para un bucle continuo ── */
  $$(".marquee-track").forEach(function (track) {
    var copy = track.cloneNode(true);
    [].slice.call(copy.children).forEach(function (c) { c.setAttribute("aria-hidden", "true"); track.appendChild(c); });
  });

  /* ── Vídeos 3D (Remotion): fuente según pantalla, pausa fuera de vista ── */
  $$("video[data-src-small]").forEach(function (v) {
    var small = window.innerWidth < 760 || (navigator.connection && navigator.connection.saveData);
    // MP4 (H.264) pesa menos; WebM (VP9) para los navegadores sin H.264
    var webm = !v.canPlayType('video/mp4; codecs="avc1.640028"') && v.canPlayType('video/webm; codecs="vp9"') && v.getAttribute("data-webm");
    var src = webm ? v.getAttribute(small ? "data-webm-small" : "data-webm") : v.getAttribute(small ? "data-src-small" : "data-src");
    if (reduced) { v.removeAttribute("autoplay"); return; } // solo el póster
    v.src = src;
    v.muted = true;
    var play = function () { var p = v.play(); if (p && p.catch) p.catch(function () {}); };
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) play(); else v.pause();
      }, { threshold: 0.05 }).observe(v);
    } else { play(); }
    document.addEventListener("visibilitychange", function () { if (document.hidden) v.pause(); else play(); });
  });

  /* Hero: parallax con el scroll e inclinación 3D con el ratón */
  var heroMedia = $(".hero-media");
  var heroTilt = $(".hero-tilt");
  if (heroMedia && !reduced) {
    var ticking = false;
    var onHeroScroll = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var y = Math.min(window.scrollY, window.innerHeight * 1.2);
        heroMedia.style.transform = "translate3d(0," + (y * 0.22).toFixed(1) + "px,0) scale(" + (1 + y / 5000).toFixed(4) + ")";
        heroMedia.style.opacity = String(Math.max(0, 1 - y / (window.innerHeight * 1.1)));
      });
    };
    window.addEventListener("scroll", onHeroScroll, { passive: true });
    if (heroTilt && canHover) {
      var hero = $(".hero");
      hero.addEventListener("pointermove", function (e) {
        var r = hero.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var yy = (e.clientY - r.top) / r.height - 0.5;
        heroTilt.style.transform = "perspective(1200px) rotateY(" + (x * 10).toFixed(2) + "deg) rotateX(" + (-yy * 8).toFixed(2) + "deg)";
      }, { passive: true });
      hero.addEventListener("pointerleave", function () { heroTilt.style.transform = ""; });
    }
  }

  /* ── Tarjetas con inclinación 3D ──────────────────────────── */
  if (canHover && !reduced) {
    $$(".tilt").forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width;
        var y = (e.clientY - r.top) / r.height;
        card.classList.add("is-tilting");
        card.style.setProperty("--ry", ((x - 0.5) * 7).toFixed(2) + "deg");
        card.style.setProperty("--rx", (-(y - 0.5) * 7).toFixed(2) + "deg");
        card.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
        card.style.setProperty("--my", (y * 100).toFixed(1) + "%");
      });
      card.addEventListener("pointerleave", function () {
        card.classList.remove("is-tilting");
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
      });
    });
  }

  /* ── Modalidad de pago: sin permanencia / 12 meses ────────── */
  var billingMode = (new URLSearchParams(location.search).get("modalidad") === "anual") ? "anual" : "mensual";
  function applyBilling(mode, animate) {
    billingMode = mode;
    var annual = mode === "anual";
    $$("[data-billing]").forEach(function (group) {
      $$("[data-billing-opt]", group).forEach(function (b) {
        b.setAttribute("aria-checked", b.getAttribute("data-billing-opt") === mode ? "true" : "false");
      });
      var ind = $(".billing-ind", group);
      var on = $('[aria-checked="true"]', group);
      if (ind && on) {
        ind.style.setProperty("--w", on.offsetWidth + "px");
        ind.style.setProperty("--x", on.offsetLeft + "px");
      }
    });
    $$("[data-price]").forEach(function (el) {
      var v = el.getAttribute(annual ? "data-a" : "data-m");
      if (!animate || reduced) { el.textContent = v; return; }
      el.classList.add("is-swapping");
      setTimeout(function () { el.textContent = v; el.classList.remove("is-swapping"); }, 180);
    });
    $$("[data-annual-only]").forEach(function (el) { el.hidden = !annual; });
    $$("[data-monthly-only]").forEach(function (el) { el.hidden = annual; });
    $$("a[data-plan-link]").forEach(function (a) {
      var url = new URL(a.getAttribute("href"), location.href);
      url.searchParams.set("modalidad", mode);
      a.setAttribute("href", url.pathname.split("/").pop() + url.search);
    });
  }
  if ($("[data-billing]")) {
    $$("[data-billing]").forEach(function (group) {
      group.addEventListener("click", function (e) {
        var b = e.target.closest("[data-billing-opt]");
        if (!b) return;
        applyBilling(b.getAttribute("data-billing-opt"), true);
        track("billing", b.getAttribute("data-billing-opt"));
      });
      group.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        var next = billingMode === "anual" ? "mensual" : "anual";
        applyBilling(next, true);
        var nb = $('[data-billing-opt="' + next + '"]', group);
        if (nb) nb.focus();
      });
    });
    applyBilling(billingMode, false);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { applyBilling(billingMode, false); });
    window.addEventListener("resize", function () { applyBilling(billingMode, false); });
  }

  /* ── Calculadora de ahorro ────────────────────────────────── */
  var calc = $("[data-calc]");
  if (calc) {
    var hours = $('[name="hours"]', calc);
    var rate = $('[name="rate"]', calc);
    var PLANS = [
      { name: "Esencial", m: 149, a: 119, setup: 390, max: 6 },
      { name: "Profesional", m: 390, a: 312, setup: 990, max: 20 },
      { name: "Empresa", m: 990, a: 792, setup: 2490, max: Infinity }
    ];
    var paint = function () {
      var h = +hours.value, r = +rate.value;
      [hours, rate].forEach(function (inp) {
        var pct = (inp.value - inp.min) / (inp.max - inp.min) * 100;
        inp.style.setProperty("--fill", pct + "%");
      });
      $('[data-out="hours"]', calc).textContent = h + " h/semana";
      $('[data-out="rate"]', calc).textContent = r + " €/h";
      var month = h * 4.33 * r;
      var plan = PLANS.filter(function (p) { return h <= p.max; })[0];
      var fee = billingMode === "anual" ? plan.a : plan.m;
      // supuesto prudente: se recupera el 60 % de esas horas
      var net = month * 0.6 - fee;
      $('[data-res="month"]', calc).textContent = fmtEUR(month);
      $('[data-res="year"]', calc).textContent = fmtEUR(month * 12);
      $('[data-res="plan"]', calc).innerHTML = plan.name + " <small>· " + fee + " €/mes</small>";
      var netEl = $('[data-res="net"]', calc);
      var payEl = $('[data-res="payback"]', calc);
      if (net > 0) {
        netEl.textContent = "+" + fmtEUR(net) + " /mes";
        var months = Math.max(1, Math.ceil(plan.setup / net));
        payEl.textContent = months === 1 ? "el primer mes" : "en " + months + " meses";
      } else {
        netEl.textContent = "No compensa todavía";
        payEl.textContent = "te lo diremos gratis";
      }
      var link = $("[data-res-link]", calc);
      if (link) link.setAttribute("href", "contacto.html?plan=" + plan.name + "&modalidad=" + billingMode);
    };
    hours.addEventListener("input", paint);
    rate.addEventListener("input", paint);
    $$("[data-billing]").forEach(function (g) { g.addEventListener("click", function () { setTimeout(paint, 0); }); });
    paint();
  }

  /* ── Servicios: conmutador agentes / automatizaciones ─────── */
  (function serviceSwitch() {
    var sw = $("#svcSwitch");
    if (!sw) return;
    var btns = $$(".switch-btn", sw);
    var ind = $(".switch-ind", sw);
    var panels = $$("[data-svc-panel]");
    var move = function (btn) {
      if (!ind || !btn) return;
      ind.style.setProperty("--w", btn.offsetWidth + "px");
      ind.style.setProperty("--x", btn.offsetLeft + "px");
    };
    var select = function (name, focus) {
      var btn = btns.filter(function (b) { return b.dataset.svc === name; })[0];
      if (!btn) return;
      btns.forEach(function (b) {
        var on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
      });
      panels.forEach(function (p) {
        var on = p.dataset.svcPanel === name;
        p.hidden = !on;
        if (on && !reduced) {
          $$(".card", p).forEach(function (c, i) { c.style.setProperty("--i", Math.min(i, 12)); });
          p.classList.remove("is-entering");
          void p.offsetWidth;
          p.classList.add("is-entering");
        }
      });
      move(btn);
      if (focus) btn.focus();
      history.replaceState(null, "", "#" + name);
    };
    sw.addEventListener("click", function (e) {
      var b = e.target.closest(".switch-btn");
      if (b) select(b.dataset.svc);
    });
    sw.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      var idx = btns.indexOf(document.activeElement);
      if (idx < 0) return;
      var next = e.key === "ArrowRight" ? (idx + 1) % btns.length : (idx - 1 + btns.length) % btns.length;
      select(btns[next].dataset.svc, true);
    });
    var hash = location.hash.replace("#", "");
    select(hash === "automatizaciones" ? "automatizaciones" : "agentes");
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { move($(".switch-btn.is-active", sw)); });
    window.addEventListener("resize", function () { move($(".switch-btn.is-active", sw)); });
  })();

  var filters = $("#filters");
  var catalog = $("#catalog");
  if (filters && catalog) {
    filters.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-filter]");
      if (!btn) return;
      $$("button", filters).forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
        b.setAttribute("aria-pressed", b === btn ? "true" : "false");
      });
      var f = btn.dataset.filter;
      $$(".card", catalog).forEach(function (card) {
        card.classList.toggle("is-hidden", f !== "all" && card.dataset.cat !== f);
      });
    });
  }

  /* ── FAQ: una abierta a la vez dentro de cada grupo ───────── */
  $$("[data-faq-group]").forEach(function (group) {
    var items = $$(".faq", group);
    items.forEach(function (faq) {
      faq.addEventListener("toggle", function () {
        if (!faq.open) return;
        items.forEach(function (o) { if (o !== faq) o.open = false; });
      });
    });
  });

  /* ── Método: la línea de fases se rellena con el scroll ───── */
  var phases = $("[data-phases]");
  if (phases) {
    var items = $$(".phase", phases);
    var paintPhases = function () {
      var r = phases.getBoundingClientRect();
      var vh = window.innerHeight;
      var p = Math.min(1, Math.max(0, (vh * 0.6 - r.top) / r.height));
      phases.style.setProperty("--progress", p.toFixed(3));
      items.forEach(function (it) {
        var ir = it.getBoundingClientRect();
        it.classList.toggle("is-on", ir.top < vh * 0.6);
      });
    };
    paintPhases();
    window.addEventListener("scroll", function () { requestAnimationFrame(paintPhases); }, { passive: true });
    window.addEventListener("resize", paintPhases);
  }

  /* ── Carrusel de testimonios ──────────────────────────────── */
  $$("[data-rail]").forEach(function (wrap) {
    var rail = $(".rail", wrap);
    var step = function (dir) {
      var card = rail.firstElementChild;
      var w = card ? card.getBoundingClientRect().width + 14 : 320;
      rail.scrollBy({ left: dir * w, behavior: reduced ? "auto" : "smooth" });
    };
    var prev = $("[data-rail-prev]", wrap), next = $("[data-rail-next]", wrap);
    if (prev) prev.addEventListener("click", function () { step(-1); });
    if (next) next.addEventListener("click", function () { step(1); });
  });

  /* ── CTA fija en móvil ────────────────────────────────────── */
  var sticky = $("[data-sticky-cta]");
  if (sticky) {
    sticky.hidden = false;
    var footer = $(".footer");
    var paintSticky = function () {
      var past = window.scrollY > window.innerHeight * 0.7;
      var nearEnd = footer && footer.getBoundingClientRect().top < window.innerHeight;
      var banner = document.querySelector(".cc-banner");
      sticky.classList.toggle("is-visible", past && !nearEnd && !banner);
    };
    window.addEventListener("scroll", paintSticky, { passive: true });
    document.addEventListener("rn:consent", paintSticky);
    paintSticky();
  }

  /* ══════════════════════════════════════════════════════════════
     FORMULARIOS — van a la API propia (api/lead.php). Ya no se usa
     Google Sheets: los datos se guardan en tu servidor y te llega el
     aviso al momento (correo + app de escritorio).
     ══════════════════════════════════════════════════════════════ */
  function postJSON(url, data) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "same-origin"
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (!res.ok || !j.ok) {
          var err = new Error(j.error || "HTTP " + res.status);
          err.field = j.field;
          throw err;
        }
        return j;
      });
    });
  }

  function fieldError(form, name, msg) {
    var input = form.querySelector('[name="' + name + '"]');
    if (!input) return;
    var field = input.closest(".field") || input.closest(".check");
    if (!field) return;
    field.classList.add("has-error");
    var e = document.createElement("span");
    e.className = "field-error";
    e.textContent = msg;
    field.appendChild(e);
    input.setAttribute("aria-invalid", "true");
  }
  function clearErrors(form) {
    $$(".has-error", form).forEach(function (f) { f.classList.remove("has-error"); });
    $$(".field-error", form).forEach(function (e) { e.remove(); });
    $$("[aria-invalid]", form).forEach(function (i) { i.removeAttribute("aria-invalid"); });
  }

  var auditForm = $("#auditForm");
  if (auditForm) {
    var opened = Date.now();
    var params = new URLSearchParams(location.search);
    var planSel = $('[name="plan"]', auditForm);
    var billSel = $('[name="modalidad"]', auditForm);
    if (planSel && params.get("plan")) {
      var want = params.get("plan").toLowerCase();
      $$("option", planSel).forEach(function (o) { if (o.value.toLowerCase() === want) planSel.value = o.value; });
    }
    if (billSel && params.get("modalidad")) billSel.value = params.get("modalidad") === "anual" ? "anual" : "mensual";

    var started = false;
    auditForm.addEventListener("input", function () { if (!started) { started = true; track("form_start", "auditoria"); } });

    auditForm.addEventListener("submit", function (e) {
      e.preventDefault();
      clearErrors(auditForm);
      var status = $(".form-status", auditForm);
      status.textContent = "";
      status.classList.remove("is-error");

      var get = function (n) { var el = auditForm.querySelector('[name="' + n + '"]'); return el ? (el.type === "checkbox" ? el.checked : el.value.trim()) : ""; };
      var data = {
        type: "auditoria",
        nombre: get("nombre"), empresa: get("empresa"), email: get("email"), telefono: get("telefono"),
        empleados: get("empleados"), plan: get("plan"), modalidad: get("modalidad"), proceso: get("proceso"),
        privacidad: get("privacidad"), comerciales: get("comerciales"),
        website: get("website"), elapsed: Date.now() - opened,
        page: location.pathname, attr: attribution()
      };

      var bad = false;
      if (!data.nombre) { fieldError(auditForm, "nombre", "Dinos cómo te llamas."); bad = true; }
      if (!data.empresa) { fieldError(auditForm, "empresa", "¿De qué empresa nos escribes?"); bad = true; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) { fieldError(auditForm, "email", "Revisa el email."); bad = true; }
      if (!data.proceso) { fieldError(auditForm, "proceso", "Cuéntanos qué quieres automatizar."); bad = true; }
      if (!data.privacidad) { fieldError(auditForm, "privacidad", "Necesitamos que aceptes la política de privacidad para responderte."); bad = true; }
      if (bad) { var first = $(".has-error input, .has-error textarea, .has-error select", auditForm); if (first) first.focus(); return; }

      var btn = $('button[type="submit"]', auditForm);
      var label = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = "Enviando…";

      postJSON(API + "/lead.php", data).then(function () {
        track("lead", data.plan || "auditoria");
        if (window.fbq && window.RNConsent && window.RNConsent.allows("marketing")) window.fbq("track", "Lead");
        $(".form-body", auditForm).hidden = true;
        var ok = $(".form-success", auditForm);
        ok.hidden = false;
        ok.setAttribute("tabindex", "-1");
        ok.focus();
      }).catch(function (err) {
        btn.disabled = false;
        btn.innerHTML = label;
        if (err.field) { fieldError(auditForm, err.field, err.message); return; }
        status.classList.add("is-error");
        status.innerHTML = "No hemos podido enviar el formulario. Escríbenos a " +
          "<a href=\"mailto:redesianet.contact@gmail.com\">redesianet.contact@gmail.com</a> o llama al 642 619 256.";
      });
    });
  }

  $$("[data-nl-form]").forEach(function (form) {
    var opened = Date.now();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = $('input[type="email"]', form);
      var consent = $('input[name="nl_consent"]', form);
      var hp = $('input[name="website"]', form);
      var status = $(".nl-status", form.parentNode) || $(".nl-status", form);
      var btn = $("button", form);
      if (consent && !consent.checked) { status.textContent = "Marca la casilla para poder suscribirte."; consent.focus(); return; }
      btn.disabled = true;
      postJSON(API + "/lead.php", {
        type: "newsletter", email: email.value.trim(), privacidad: true, comerciales: true,
        website: hp ? hp.value : "", elapsed: Date.now() - opened, page: location.pathname
      }).then(function (j) {
        status.textContent = j.message || "Listo. Revisa tu correo para confirmar la suscripción.";
        email.value = "";
        if (consent) consent.checked = false;
        track("newsletter");
      }).catch(function (err) {
        status.textContent = err.message && err.message.indexOf("HTTP") !== 0 ? err.message : "No se ha podido suscribir. Inténtalo más tarde.";
      }).then(function () { btn.disabled = false; });
    });
  });

  /* ══════════════════════════════════════════════════════════════
     TEXTO LÍQUIDO — el titular se llena de azul con el scroll.
     Máscara SVG + dos olas que suben con el avance y se bambolean
     con la inercia del gesto. Sin JS se ve el titular normal.
     ══════════════════════════════════════════════════════════════ */
  (function initLiquidText() {
    var stage = $(".liquid-stage");
    if (!stage) return;
    var section = stage.closest(".liquid");
    var NS = "http://www.w3.org/2000/svg";
    var UID = "rnliq-" + Math.random().toString(36).slice(2, 8);
    var VB_W = 1200, PAD_X = 40, LEAD = 1.04, AMP = 15;
    var FONT = "'Fraunces', Georgia, serif";
    var meas = document.createElement("canvas").getContext("2d");
    var vbH = 0, liq = null, slosh = null, built = false, visible = false;
    var fill = 0, target = 0, sx = 0, sv = 0;
    var lastY = window.scrollY;
    var raf = null, idle = 0;

    function el(name, attrs) {
      var n = document.createElementNS(NS, name);
      for (var k in attrs) n.setAttribute(k, attrs[k]);
      return n;
    }
    function isNarrow() { return window.innerWidth < 760; }
    function textWidth(str, size) { meas.font = "600 " + size + "px " + FONT; return meas.measureText(str).width; }
    function wavePath(width, amp, periods, depth, y0) {
      var seg = width / periods, d = "M 0 " + y0;
      for (var i = 0; i < periods; i++) {
        d += " q " + (seg * 0.25) + " " + (-amp) + " " + (seg * 0.5) + " 0";
        d += " q " + (seg * 0.25) + " " + amp + " " + (seg * 0.5) + " 0";
      }
      return d + " L " + width + " " + depth + " L 0 " + depth + " Z";
    }
    function build() {
      var lines = (isNarrow() ? stage.dataset.liquidNarrow : stage.dataset.liquidWide).split("|");
      var BASE = 100, widest = 0;
      lines.forEach(function (l) { widest = Math.max(widest, textWidth(l, BASE)); });
      if (!widest) return;
      var size = (VB_W - PAD_X * 2) / widest * BASE;
      vbH = Math.round(size * LEAD * (lines.length - 1) + size * 1.02);
      stage.textContent = "";
      var svg = el("svg", { viewBox: "0 0 " + VB_W + " " + vbH, preserveAspectRatio: "xMidYMid meet", focusable: "false" });
      var defs = el("defs");
      var gA = el("linearGradient", { id: UID + "-a", x1: "0", y1: "0", x2: "0", y2: "1" });
      gA.appendChild(el("stop", { offset: "0", "stop-color": "#9BF0FF" }));
      gA.appendChild(el("stop", { offset: "0.14", "stop-color": "#00D4FF" }));
      gA.appendChild(el("stop", { offset: "1", "stop-color": "#0086B3" }));
      defs.appendChild(gA);
      var gB = el("linearGradient", { id: UID + "-b", x1: "0", y1: "0", x2: "0", y2: "1" });
      gB.appendChild(el("stop", { offset: "0", "stop-color": "#00D4FF", "stop-opacity": "0.5" }));
      gB.appendChild(el("stop", { offset: "1", "stop-color": "#004E73", "stop-opacity": "0.5" }));
      defs.appendChild(gB);
      var mask = el("mask", { id: UID + "-m", maskUnits: "userSpaceOnUse", x: 0, y: 0, width: VB_W, height: vbH });
      lines.forEach(function (line, i) {
        var t = el("text", {
          x: VB_W / 2, y: (size * 0.8 + i * size * LEAD).toFixed(1), "text-anchor": "middle",
          "font-family": FONT, "font-size": size.toFixed(1), "font-weight": "600",
          "letter-spacing": (-size * 0.022).toFixed(2), fill: "#fff"
        });
        t.textContent = line;
        mask.appendChild(t);
      });
      defs.appendChild(mask);
      svg.appendChild(defs);
      var scene = el("g", { mask: "url(#" + UID + "-m)" });
      scene.appendChild(el("rect", { x: 0, y: 0, width: VB_W, height: vbH, fill: "#1c1c22" }));
      liq = el("g");
      slosh = el("g");
      var depth = vbH * 2 + AMP * 2;
      // 3 anchos de lienzo: cubre el vaivén y el avance continuo sin dejar huecos.
      // Periodos de 1200 y 600 → los dos encajan con un avance de VB_W.
      slosh.appendChild(el("path", { d: wavePath(VB_W * 3, AMP * 0.72, 3, depth, AMP * 0.5), fill: "url(#" + UID + "-b)" }));
      slosh.appendChild(el("path", { d: wavePath(VB_W * 3, AMP, 6, depth, 0), fill: "url(#" + UID + "-a)" }));
      liq.appendChild(slosh);
      scene.appendChild(liq);
      svg.appendChild(scene);
      stage.appendChild(svg);
      section.classList.add("is-built");
      built = true;
      apply(reduced ? 1 : fill, 0);
    }
    function progress() {
      var r = section.getBoundingClientRect();
      var vh = window.innerHeight;
      var start = vh * 0.95, end = vh * 0.25;
      var p = (start - r.top) / (start - end);
      return p < 0 ? 0 : (p > 1 ? 1 : p);
    }
    function apply(f, x) {
      if (!liq) return;
      var y = vbH + AMP - f * (vbH + AMP * 2);
      liq.setAttribute("transform", "translate(0 " + y.toFixed(2) + ")");
      var drift = reduced ? 0 : VB_W * ((performance.now() / 12000) % 1);
      slosh.setAttribute("transform", "translate(" + (x - VB_W * 0.5 - drift).toFixed(2) + " 0)");
    }
    function frame() {
      target = progress();
      fill += (target - fill) * 0.11;
      sv *= 0.86; sx += sv; sx *= 0.9;
      apply(fill, sx);
      var moving = Math.abs(target - fill) > 0.0004 || Math.abs(sv) > 0.04 || Math.abs(sx) > 0.04;
      idle = moving ? 0 : idle + 1;
      raf = (idle > 90 && !visible) ? null : requestAnimationFrame(frame);
    }
    function kick() { if (!raf && built && !reduced) { idle = 0; raf = requestAnimationFrame(frame); } }
    function onScroll() {
      var y = window.scrollY;
      sv += (lastY - y) * 0.22;
      sv = Math.max(-38, Math.min(38, sv));
      lastY = y;
      if (visible) kick();
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) {
        visible = en[0].isIntersecting;
        if (visible) kick();
      }, { rootMargin: "120px 0px" }).observe(section);
    } else { visible = true; }
    var rt = null, wasNarrow = isNarrow();
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (isNarrow() !== wasNarrow) { wasNarrow = isNarrow(); build(); } kick(); }, 180);
    });
    function start() {
      build();
      if (reduced) { apply(1, 0); return; }
      window.addEventListener("scroll", onScroll, { passive: true });
      kick();
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(start);
    else window.addEventListener("load", start);
  })();
})();
