// @include common/util.js
const r = $('Procesar clasificación').item.json;
return { json: { valor: texto(r._email).toLowerCase(), motivo: 'pidió la baja respondiendo al email (' + r.lead_id + ')', fecha: ahoraMadrid() } };
