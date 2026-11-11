// @include common/util.js
// Entrada: filas de la pestaña Leads cuyo "estado" acaba de cambiar.
// Solo se actúa sobre las que ahora están en "aprobado". Cuando el workflow
// cambia el estado a "enviado", el disparador vuelve a saltar, pero esas filas
// se ignoran aquí, así que nunca se envía dos veces.
const APROBADO = /^(aprobado|aprobada|aprobar|enviar)$/i;
const filas = $('Sheet: estado cambiado').all().map((i) => i.json || {});

const vistos = new Set();
const salida = [];
for (const r of filas) {
  const id = texto(r.lead_id);
  if (!id || vistos.has(id.toUpperCase()) || !APROBADO.test(texto(r.estado))) continue;
  vistos.add(id.toUpperCase());

  const lead = {};
  for (const [k, v] of Object.entries(r)) if (k !== 'row_number') lead[k] = texto(v);

  let error = '';
  const email = lead.email;
  if (!email && !lead.instagram && !lead.facebook) error = 'no tiene email ni Instagram/Facebook';
  else if (email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) error = `el email «${email}» no parece válido`;
  else if (email && (!lead.asunto || !lead.cuerpo_email)) error = 'falta el asunto o el cuerpo del email';

  salida.push({ json: { lead_id: id, ok: !error, error, lead } });
}
return salida;
