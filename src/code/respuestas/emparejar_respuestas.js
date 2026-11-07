// @include common/util.js
// Cruza los emails recibidos con los leads contactados (por hilo de Gmail
// y, si no, por dirección del remitente).
const correos = $('Gmail: respuestas').all().map((i) => i.json || {});
const leads = $input.all().map((i) => i.json || {}).filter((r) => texto(r.lead_id));

const porHilo = new Map();
const porEmail = new Map();
for (const l of leads) {
  if (texto(l.gmail_thread_id)) porHilo.set(texto(l.gmail_thread_id), l);
  if (texto(l.email) && texto(l.fecha_envio)) porEmail.set(texto(l.email).toLowerCase(), l);
}

function direccion(from) {
  const f = texto(from);
  const m = f.match(/<([^>]+)>/);
  return (m ? m[1] : f).trim().toLowerCase();
}

const vistos = new Set();
const salida = [];
for (const c of correos) {
  const de = direccion(c.From || c.from);
  const lead = porHilo.get(texto(c.threadId)) || porEmail.get(de);
  if (!lead || vistos.has(c.id)) continue;
  vistos.add(c.id);
  salida.push({
    json: {
      lead_id: lead.lead_id,
      empresa: lead.empresa,
      email_lead: lead.email,
      estado_actual: lead.estado,
      de,
      asunto: texto(c.Subject || c.subject),
      extracto: texto(c.snippet),
      thread_id: texto(c.threadId),
      message_id: texto(c.id),
    },
  });
}
return salida;
