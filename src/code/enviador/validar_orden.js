// @include common/util.js
// Comprueba que la orden tiene sentido para el estado actual del lead
// (evita envíos dobles si pulsas dos veces).
const o = $('Interpretar orden').first().json;
const filas = $input.all().map((i) => i.json || {});
const lead = filas.find((r) => texto(r.lead_id).toUpperCase() === o.lead_id);

let error = '';
if (!lead) {
  error = `No encuentro el lead ${o.lead_id} en el CRM.`;
} else {
  const nombre = `${texto(lead.empresa)} (${o.lead_id})`;
  const estado = texto(lead.estado);
  if (o.accion === 'enviar') {
    const email = texto(lead.email);
    if (estado !== 'pendiente_aprobacion') error = `${nombre} está en estado «${estado}»: no lo vuelvo a enviar.`;
    else if (!email && !texto(lead.instagram) && !texto(lead.facebook)) error = `${nombre} no tiene email ni redes.`;
    else if (email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) error = `El email de ${nombre} no parece válido: ${email}. Corrígelo en el CRM y repite /enviar.`;
    else if (email && (!texto(lead.asunto) || !texto(lead.cuerpo_email))) error = `Falta asunto o cuerpo del email de ${nombre} en el CRM.`;
  } else if (o.accion === 'rechazar') {
    if (!['pendiente_aprobacion', 'dm_pendiente', 'error_ia', 'error_envio'].includes(estado)) error = `${nombre} está en estado «${estado}»: ya no se puede rechazar.`;
  } else if (o.accion === 'dm_ok') {
    if (texto(lead.dm_estado) !== 'pendiente') error = `El DM de ${nombre} no estaba pendiente (dm_estado: «${texto(lead.dm_estado) || 'vacío'}»).`;
  }
}

const { row_number, ...limpio } = lead || {};
return [{ json: { ...o, ok: !error, error, lead: limpio } }];
