// @include common/util.js
const lead = $json.lead;
return [{
  json: {
    lead_id: lead.lead_id,
    estado: 'rechazado',
    fecha_decision: ahoraMadrid(),
    dm_estado: texto(lead.dm_estado) === 'pendiente' ? 'descartado' : texto(lead.dm_estado),
  },
}];
