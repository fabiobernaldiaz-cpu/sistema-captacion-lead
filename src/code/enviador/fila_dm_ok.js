// @include common/util.js
const lead = $json.lead;
const ahora = ahoraMadrid();
const fila = { lead_id: lead.lead_id, dm_estado: 'enviado', fecha_dm: ahora };
if (texto(lead.estado) === 'dm_pendiente') {
  fila.estado = 'enviado';
  fila.fecha_envio = ahora;
}
return [{ json: fila }];
