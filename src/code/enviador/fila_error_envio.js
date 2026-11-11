// @include common/util.js
// Sirve para dos casos: el lead aprobado no se puede enviar (faltan datos) o
// Gmail ha rechazado el envío. En ambos el lead pasa a "error_envio".
const lead = $('Leads aprobados').item.json.lead;
const e = $json.error;
const detalle = texto((e && (e.message || e.description)) || e || 'error desconocido').slice(0, 300);
// Los errores de validación llegan con ok = false. Los de Gmail llegan con el item
// original (ok = true) o solo con {error}, según el nodo: ambos casos son de Gmail.
const porGmail = $json.ok !== false;
const motivo = (porGmail ? 'Gmail: ' : 'No enviado: ') + detalle;

return {
  json: {
    lead_id: lead.lead_id,
    estado: 'error_envio',
    fecha_decision: ahoraMadrid(),
    motivo_descarte: motivo,
    _texto: `⚠️ <b>No se ha enviado</b> a ${escHtml(lead.empresa)} (<code>${escHtml(lead.lead_id)}</code>)\n${escHtml(motivo)}\n\nCorrígelo en el CRM y vuelve a poner <b>estado = aprobado</b> en esa fila.`,
  },
};
