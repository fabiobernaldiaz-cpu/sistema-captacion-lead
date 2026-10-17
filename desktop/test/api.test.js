"use strict";
/* Pruebas del cliente contra una API real. Se activan con:
   RN_TEST_SITE=http://127.0.0.1:8080 RN_TEST_TOKEN=… npm test
   (por ejemplo, con `php -S` sirviendo la carpeta web/). */
const test = require("node:test");
const assert = require("node:assert/strict");
const { createClient, normalizeSite, ApiError } = require("../src/api");

test("normalizeSite acepta lo que pegaría una persona", () => {
  assert.equal(normalizeSite("redesianet.com"), "https://redesianet.com");
  assert.equal(normalizeSite("https://redesianet.com/"), "https://redesianet.com");
  assert.equal(normalizeSite("https://redesianet.com/api/admin.php"), "https://redesianet.com");
  assert.equal(normalizeSite(" http://127.0.0.1:8080/api "), "http://127.0.0.1:8080");
});

test("rechaza acciones fuera de la lista", async () => {
  const c = createClient({ site: "https://example.com", token: "x", fetchImpl: async () => { throw new Error("no debería llamar"); } });
  await assert.rejects(c.call("drop_tables"), ApiError);
});

test("traduce errores de red y respuestas no JSON", async () => {
  const offline = createClient({ site: "https://example.com", token: "x", fetchImpl: async () => { throw new TypeError("fetch failed"); } });
  await assert.rejects(offline.call("ping"), /Sin conexión con example\.com/);
  const html = createClient({ site: "https://example.com", token: "x",
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("x"); } }) });
  await assert.rejects(html.call("ping"), /Respuesta no válida/);
});

const SITE = process.env.RN_TEST_SITE;
const TOKEN = process.env.RN_TEST_TOKEN;

test("integración con la API PHP", { skip: !SITE || !TOKEN ? "sin RN_TEST_SITE/RN_TEST_TOKEN" : false }, async () => {
  const c = createClient({ site: SITE, token: TOKEN });
  const ping = await c.call("ping");
  assert.equal(ping.ok, true);
  const sum = await c.call("summary", { params: { days: 7 } });
  assert.equal(sum.series.length, 7);
  const ev = await c.call("events");
  assert.ok(ev.last_lead >= 0 && Array.isArray(ev.leads) && ev.leads.length === 0);
  const leads = await c.call("leads", { params: { limit: 5 } });
  assert.ok(Array.isArray(leads.leads));
  const csv = await c.call("export", { params: { type: "leads" } });
  assert.match(csv.csv, /^﻿ID;Fecha;Estado/);
  const bad = createClient({ site: SITE, token: "0".repeat(48) });
  await assert.rejects(bad.call("ping"), (e) => e.status === 401);
});
