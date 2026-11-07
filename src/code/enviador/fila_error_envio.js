// @include common/util.js
const lead = $('Validar orden').first().json.lead;
const e = $json.error;
const detalle = texto((e && (e.message || e.description)) || e || 'error desconocido').slice(0, 300);
return [{
  json: {
    lead_id: lead.lead_id,
    estado: 'error_envio',
    fecha_decision: ahoraMadrid(),
    motivo_descarte: 'Gmail: ' + detalle,
    _texto: `⚠️ <b>No se pudo enviar el email</b> a ${escHtml(lead.empresa)} (<code>${escHtml(lead.lead_id)}</code>)\n${escHtml(detalle)}\n\nCorrige el email en el CRM, cambia el estado a pendiente_aprobacion y repite /enviar ${escHtml(lead.lead_id)}`,
  },
}];
