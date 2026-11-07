// Elige las N búsquedas activas que hace más tiempo que no se ejecutan.
// Entrada: filas de la pestaña Busquedas.
const cfg = $('Config').first().json;
const n = Number(cfg.busquedas_por_ejecucion) || 3;

const filas = $input
  .all()
  .map((i) => i.json)
  .filter((r) => r && String(r.consulta || '').trim() && /^s/i.test(String(r.activa ?? 'SI').trim()));

if (!filas.length) {
  throw new Error('La pestaña "Busquedas" no tiene filas activas (activa = SI). Añade al menos una búsqueda.');
}

filas.sort(
  (a, b) =>
    String(a.ultima_ejecucion || '').localeCompare(String(b.ultima_ejecucion || '')) ||
    String(a.id || '').localeCompare(String(b.id || '')),
);

return filas.slice(0, n).map((r) => ({
  json: {
    id: String(r.id || ''),
    sector: String(r.sector || ''),
    zona: String(r.zona || ''),
    consulta: String(r.consulta).trim(),
    veces_ejecutada: Number(r.veces_ejecutada) || 0,
  },
}));
