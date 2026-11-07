// @include common/util.js
// Llega aquí tras enviar el email con Gmail, o directamente si el lead no
// tiene email (solo DM). Prepara la actualización del CRM.
const o = $('Validar orden').first().json;
const lead = o.lead;
const g = $json || {};
const emailEnviado = Boolean(g.id && g.threadId);
const hayRedes = Boolean(texto(lead.instagram) || texto(lead.facebook));
const ahora = ahoraMadrid();

return [{
  json: {
    lead_id: lead.lead_id,
    estado: emailEnviado ? 'enviado' : 'dm_pendiente',
    fecha_decision: ahora,
    fecha_envio: emailEnviado ? ahora : '',
    canal_enviado: emailEnviado ? (hayRedes ? 'email+dm' : 'email') : 'dm',
    gmail_message_id: g.id || '',
    gmail_thread_id: g.threadId || '',
    dm_estado: hayRedes ? 'pendiente' : '',
    // campos auxiliares (no son columnas del Sheet; se ignoran al guardar)
    _email_enviado: emailEnviado,
    _hay_redes: hayRedes,
  },
}];
