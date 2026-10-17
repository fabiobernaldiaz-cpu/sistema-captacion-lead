/* ══════════════════════════════════════════════════════════════
   Cliente de la API privada de redesianet.com (/api/admin.php).
   Lo usa solo el proceso principal: el token nunca llega a la ventana.
   ══════════════════════════════════════════════════════════════ */
"use strict";

const ACTIONS = new Set([
  "ping", "summary", "events", "leads", "lead", "lead_update", "lead_delete",
  "subscribers", "subscriber_delete", "hits", "export",
]);

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function normalizeSite(url) {
  let u = String(url || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  const parsed = new URL(u);
  return parsed.origin + parsed.pathname.replace(/\/+$/, "").replace(/\/api(\/admin\.php)?$/, "");
}

function createClient({ site, token, fetchImpl, timeoutMs = 12000 }) {
  const base = normalizeSite(site);
  const endpoint = base + "/api/admin.php";
  const doFetch = fetchImpl || globalThis.fetch;

  async function call(action, { params = {}, body } = {}) {
    if (!ACTIONS.has(action)) throw new ApiError("Acción no permitida", 0);
    const url = new URL(endpoint);
    url.searchParams.set("action", action);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await doFetch(url.toString(), {
        method: body ? "POST" : "GET",
        headers: Object.assign(
          { "X-RN-Token": token, Accept: action === "export" ? "text/csv" : "application/json" },
          body ? { "Content-Type": "application/json" } : {}
        ),
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      if (action === "export") {
        if (!res.ok) throw new ApiError("No se pudo exportar (HTTP " + res.status + ")", res.status);
        // bytes en bruto: res.text() se come el BOM y Excel mostraría mal los acentos
        return { ok: true, csv: Buffer.from(await res.arrayBuffer()).toString("utf8") };
      }
      let data;
      try { data = await res.json(); } catch (e) { data = null; }
      if (!data) throw new ApiError("Respuesta no válida del servidor (HTTP " + res.status + "). ¿Está bien la dirección?", res.status);
      if (!res.ok || !data.ok) throw new ApiError(data.error || "HTTP " + res.status, res.status);
      return data;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      if (e && e.name === "AbortError") throw new ApiError("El servidor tarda demasiado en responder", 0);
      throw new ApiError("Sin conexión con " + new URL(endpoint).host, 0);
    } finally {
      clearTimeout(timer);
    }
  }

  return { call, endpoint, site: base };
}

module.exports = { createClient, normalizeSite, ApiError, ACTIONS };
