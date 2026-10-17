"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Poller, truncate } = require("../src/poller");

function setup(responses, settings) {
  let ids = null;
  const timers = [];
  const calls = [];
  const client = {
    call: async (action, opts) => {
      calls.push(opts.params);
      const r = responses.shift();
      if (r instanceof Error) throw r;
      return r;
    },
  };
  const p = new Poller({
    getClient: () => client,
    getSettings: () => Object.assign({ pollSeconds: 15, notifyVisits: "new" }, settings || {}),
    loadIds: () => ids,
    saveIds: (x) => { ids = x; },
    setTimer: (fn, ms) => { timers.push(ms); return timers.length; },
    clearTimer: () => {},
  });
  const notes = [];
  const statuses = [];
  p.on("notify", (n) => notes.push(n));
  p.on("status", (s) => statuses.push(s.status));
  p.running = true;
  return { p, notes, statuses, timers, calls, ids: () => ids };
}

const lead = (id, extra) => Object.assign({ id, company: "Empresa " + id, name: "Ana", plan: "Profesional", billing: "anual", process: "Facturas" }, extra);

test("la primera consulta solo aprende la posición, sin avisar de lo antiguo", async () => {
  const t = setup([{ ok: true, last_lead: 7, last_hit: 120, last_sub: 3, leads: [], hits: [], subscribers: [] }]);
  await t.p.tick();
  assert.deepEqual(t.calls[0], {});
  assert.deepEqual(t.ids(), { lead: 7, hit: 120, sub: 3 });
  assert.equal(t.notes.length, 0);
  assert.deepEqual(t.statuses, ["online"]);
  assert.equal(t.timers.at(-1), 15000);
});

test("avisa de cada lead nuevo con empresa, plan y modalidad", async () => {
  const t = setup([
    { ok: true, last_lead: 1, last_hit: 0, last_sub: 0, leads: [], hits: [], subscribers: [] },
    { ok: true, last_lead: 3, last_hit: 0, last_sub: 0, leads: [lead(2), lead(3, { plan: "", billing: "mensual" })], hits: [], subscribers: [] },
  ]);
  await t.p.tick();
  await t.p.tick();
  assert.deepEqual(t.calls[1], { after_lead: 1, after_hit: 0, after_sub: 0 });
  assert.equal(t.notes.length, 2);
  assert.equal(t.notes[0].title, "Nuevo lead · Empresa 2");
  assert.match(t.notes[0].body, /Profesional · 12 meses/);
  assert.match(t.notes[1].body, /Plan sin decidir/);
  assert.deepEqual(t.ids(), { lead: 3, hit: 0, sub: 0 });
});

test("agrupa muchos leads en un solo aviso", async () => {
  const t = setup([
    { ok: true, last_lead: 0, last_hit: 0, last_sub: 0, leads: [], hits: [], subscribers: [] },
    { ok: true, last_lead: 5, last_hit: 0, last_sub: 0, leads: [1, 2, 3, 4, 5].map((i) => lead(i)), hits: [], subscribers: [] },
  ]);
  await t.p.tick();
  await t.p.tick();
  assert.equal(t.notes.length, 1);
  assert.equal(t.notes[0].title, "5 leads nuevos");
});

test("visitas: por defecto solo visitantes nuevos; 'off' no avisa", async () => {
  const hits = [
    { id: 11, type: "pageview", path: "/", is_new: 1, ref_host: "google.com", device: "móvil", browser: "Chrome" },
    { id: 12, type: "pageview", path: "/precio.html", is_new: 0 },
    { id: 13, type: "cta", path: "/precio.html", is_new: 0 },
  ];
  const t = setup([
    { ok: true, last_lead: 0, last_hit: 10, last_sub: 0, leads: [], hits: [], subscribers: [] },
    { ok: true, last_lead: 0, last_hit: 13, last_sub: 0, leads: [], hits, subscribers: [] },
  ]);
  await t.p.tick();
  await t.p.tick();
  assert.equal(t.notes.length, 1);
  assert.equal(t.notes[0].kind, "visit");
  assert.match(t.notes[0].body, /google\.com/);
  const off = setup([], { notifyVisits: "off" });
  assert.equal(off.p.notificationsFor({ leads: [], hits, subscribers: [] }).length, 0);
  const all = setup([], { notifyVisits: "all" });
  assert.equal(all.p.notificationsFor({ leads: [], hits, subscribers: [] })[0].title, "2 páginas vistas");
});

test("con avisos en pausa no se muestra nada, pero se siguen leyendo eventos", async () => {
  const t = setup([], { pausedUntil: Date.now() + 60000 });
  assert.equal(t.p.notificationsFor({ leads: [lead(1)], hits: [], subscribers: [] }).length, 0);
});

test("token no válido: para y avisa; sin red: reintenta con espera creciente", async () => {
  const e401 = Object.assign(new Error("Token no válido"), { status: 401 });
  const t = setup([e401]);
  await t.p.tick();
  assert.deepEqual(t.statuses, ["auth_error"]);
  assert.equal(t.p.running, false);

  const eNet = Object.assign(new Error("Sin conexión"), { status: 0 });
  const u = setup([eNet, eNet]);
  await u.p.tick();
  await u.p.tick();
  assert.deepEqual(u.statuses, ["offline"]);
  assert.equal(u.timers[0], 30000);
  assert.equal(u.timers[1], 60000);
});

test("si la base de datos se reinicia (ids menores), recoloca sin avisar", async () => {
  const t = setup([
    { ok: true, last_lead: 50, last_hit: 900, last_sub: 9, leads: [], hits: [], subscribers: [] },
    { ok: true, last_lead: 2, last_hit: 4, last_sub: 0, leads: [lead(1), lead(2)], hits: [], subscribers: [] },
  ]);
  await t.p.tick();
  await t.p.tick();
  assert.equal(t.notes.length, 0);
  assert.deepEqual(t.ids(), { lead: 2, hit: 4, sub: 0 });
});

test("truncate recorta y limpia espacios", () => {
  assert.equal(truncate("hola   mundo\n\nadiós", 50), "hola mundo adiós");
  assert.equal(truncate("abcdefghij", 6), "abcde…");
});
