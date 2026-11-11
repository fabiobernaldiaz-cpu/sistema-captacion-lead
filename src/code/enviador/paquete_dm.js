// @include common/util.js
// Meta no permite iniciar DMs en frío por API: te preparamos el mensaje
// listo para copiar y los enlaces que abren el chat directamente.
const lead = $('Leads aprobados').item.json.lead;
const cfg = $('Config').first().json;
const attr = (v) => escHtml(v).replace(/"/g, '&quot;');

function handleInstagram(url) {
  const m = texto(url).match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
  return m ? m[1] : '';
}
function paginaFacebook(url) {
  const m = texto(url).match(/facebook\.com\/([A-Za-z0-9.\-]+)\/?$/i);
  return m ? m[1] : '';
}

const enlaces = [];
const ig = handleInstagram(lead.instagram);
if (ig) enlaces.push(`📸 <a href="https://ig.me/m/${attr(ig)}">Abrir chat de Instagram (@${escHtml(ig)})</a>`);
const fb = paginaFacebook(lead.facebook);
if (fb) enlaces.push(`📘 <a href="https://m.me/${attr(fb)}">Abrir Messenger (${escHtml(fb)})</a>`);
else if (texto(lead.facebook)) enlaces.push(`📘 <a href="${attr(lead.facebook)}">Abrir página de Facebook</a> (pulsa «Enviar mensaje»)`);

const t = [
  `💬 <b>DM para ${escHtml(lead.empresa)}</b> · <code>${escHtml(lead.lead_id)}</code>`,
  '',
  'Mantén pulsado para copiar:',
  `<pre>${escHtml(lead.mensaje_dm)}</pre>`,
  ...enlaces,
  '',
  `Cuando lo hayas enviado, en el <a href="${attr(cfg.sheet_url)}">CRM</a> pon <b>dm_estado = enviado</b> en la fila <code>${escHtml(lead.lead_id)}</code>.`,
].join('\n');

return { json: { lead_id: lead.lead_id, texto: t } };
