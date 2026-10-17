/* ══════════════════════════════════════════════════════════════
   Vigilante: pregunta a la API cada N segundos qué hay de nuevo
   (leads, visitas, suscriptores) y decide qué avisos mostrar.
   No sabe nada de Electron: recibe un cliente y emite eventos, así se
   puede probar con Node a secas (test/poller.test.js).
   ══════════════════════════════════════════════════════════════ */
"use strict";

const { EventEmitter } = require("node:events");

const MAX_BACKOFF_MS = 120000;

class Poller extends EventEmitter {
  /**
   * @param {object} o
   * @param {() => ({call: Function}|null)} o.getClient
   * @param {() => object} o.getSettings  — { pollSeconds, notifyLeads, notifySubs, notifyVisits, pausedUntil }
   * @param {() => object|null} o.loadIds
   * @param {(ids: object) => void} o.saveIds
   */
  constructor({ getClient, getSettings, loadIds, saveIds, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now }) {
    super();
    Object.assign(this, { getClient, getSettings, loadIds, saveIds, setTimer, clearTimer, now });
    this.timer = null;
    this.failures = 0;
    this.status = "idle";
    this.running = false;
    this.busy = false;
  }

  start() {
    this.running = true;
    this.schedule(0);
  }

  stop() {
    this.running = false;
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
  }

  /* Reinicia (p. ej. tras cambiar la URL o el token en Ajustes) */
  restart({ resetIds = false } = {}) {
    if (resetIds) this.saveIds(null);
    this.failures = 0;
    this.stop();
    this.start();
  }

  schedule(ms) {
    if (!this.running) return;
    if (this.timer) this.clearTimer(this.timer);
    this.timer = this.setTimer(() => this.tick(), ms);
  }

  setStatus(status, detail) {
    detail = detail || "";
    if (this.status === status && this.detail === detail) return;
    this.status = status;
    this.detail = detail;
    this.emit("status", { status, detail, at: this.now() });
  }

  interval() {
    const s = Number(this.getSettings().pollSeconds) || 15;
    return Math.max(5, Math.min(300, s)) * 1000;
  }

  async tick() {
    if (this.busy) return;
    const client = this.getClient();
    if (!client) {
      this.setStatus("unconfigured");
      return; // se reanuda con restart() cuando haya ajustes
    }
    this.busy = true;
    try {
      const ids = this.loadIds();
      const params = ids
        ? { after_lead: ids.lead, after_hit: ids.hit, after_sub: ids.sub }
        : {}; // primera vez: solo aprendemos dónde estamos, sin avisar de lo antiguo
      const data = await client.call("events", { params });
      this.failures = 0;
      this.setStatus("online");
      const next = {
        lead: Math.max(ids ? ids.lead : 0, data.last_lead || 0),
        hit: Math.max(ids ? ids.hit : 0, data.last_hit || 0),
        sub: Math.max(ids ? ids.sub : 0, data.last_sub || 0),
      };
      // si los ids retroceden (base de datos nueva), volvemos a empezar sin avisar
      if (ids && (data.last_lead < ids.lead || data.last_hit < ids.hit || data.last_sub < ids.sub)) {
        next.lead = data.last_lead; next.hit = data.last_hit; next.sub = data.last_sub;
        data.leads = []; data.hits = []; data.subscribers = [];
      }
      this.saveIds(next);
      const fresh = { leads: data.leads || [], hits: data.hits || [], subscribers: data.subscribers || [] };
      if (fresh.leads.length || fresh.hits.length || fresh.subscribers.length) {
        this.emit("events", fresh);
        for (const n of this.notificationsFor(fresh)) this.emit("notify", n);
      }
      this.schedule(this.interval());
    } catch (err) {
      if (err && err.status === 401) {
        this.setStatus("auth_error", err.message);
        this.stop(); // con un token malo no insistimos: la API bloquearía la IP
      } else {
        this.failures++;
        this.setStatus("offline", err && err.message);
        const backoff = Math.min(MAX_BACKOFF_MS, this.interval() * Math.pow(2, Math.min(this.failures, 4)));
        this.schedule(backoff);
      }
    } finally {
      this.busy = false;
    }
  }

  /* Convierte novedades en avisos, agrupando para no saturar */
  notificationsFor({ leads, hits, subscribers }) {
    const s = this.getSettings();
    if (s.pausedUntil && this.now() < s.pausedUntil) return [];
    const out = [];
    if (s.notifyLeads !== false && leads.length) {
      if (leads.length <= 3) {
        for (const l of leads) {
          const plan = l.plan ? l.plan + (l.billing === "anual" ? " · 12 meses" : "") : "Plan sin decidir";
          out.push({
            kind: "lead", id: l.id, urgent: true,
            title: "Nuevo lead · " + l.company,
            body: l.name + " — " + plan + "\n" + truncate(l.process, 110),
          });
        }
      } else {
        out.push({ kind: "leads", urgent: true, title: leads.length + " leads nuevos", body: leads.map((l) => l.company).slice(0, 5).join(", ") });
      }
    }
    if (s.notifySubs !== false && subscribers.length) {
      out.push({
        kind: "subs",
        title: subscribers.length === 1 ? "Nueva suscripción a la newsletter" : subscribers.length + " suscripciones nuevas",
        body: subscribers.length === 1 ? "Pendiente de confirmar por correo" : "Pendientes de confirmar por correo",
      });
    }
    const mode = s.notifyVisits || "new";
    if (mode !== "off") {
      const views = hits.filter((h) => h.type === "pageview" && (mode === "all" || Number(h.is_new) === 1));
      if (views.length === 1) {
        const h = views[0];
        out.push({
          kind: "visit",
          title: mode === "all" ? "Visita en " + h.path : "Alguien ha entrado en la web",
          body: h.path + " · " + sourceOf(h) + " · " + (h.device || "") + (h.browser ? " · " + h.browser : ""),
        });
      } else if (views.length > 1) {
        out.push({
          kind: "visits",
          title: views.length + (mode === "all" ? " páginas vistas" : " visitantes nuevos"),
          body: "Entradas desde " + uniq(views.map(sourceOf)).slice(0, 3).join(", "),
        });
      }
    }
    return out;
  }
}

function sourceOf(h) {
  return h.utm_source || h.ref_host || "directo";
}

function uniq(a) {
  return Array.from(new Set(a));
}

function truncate(s, n) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

module.exports = { Poller, truncate };
