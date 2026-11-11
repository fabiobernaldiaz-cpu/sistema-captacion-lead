// @include common/util.js
// Un único mensaje de resumen al principio del lote de borradores.
const filas = $('Procesar respuesta IA').all().map((i) => i.json);
const total = $('Consolidar datos web').all().length;
const sinCanal = Math.max(0, total - filas.length);
const cuenta = (e) => filas.filter((f) => f.estado === e).length;
const busquedas = $('Elegir búsquedas').all().map((i) => escHtml(i.json.consulta));

const lineas = [
  '🤖 <b>Captación de hoy</b>',
  `• ${cuenta('pendiente_aprobacion')} borradores para revisar (te llegan ahora; apruébalos en el CRM con estado = aprobado)`,
  `• ${cuenta('descartado_ia')} descartados por la IA`,
  `• ${sinCanal} sin email ni redes (guardados como sin_canal para llamar)`,
];
if (cuenta('error_ia')) lineas.push(`• ⚠️ ${cuenta('error_ia')} con error de IA (revisa la columna motivo_descarte)`);
lineas.push('', '🔎 ' + busquedas.join(' · '));

return [{ json: { texto: lineas.join('\n') } }];
