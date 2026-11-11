// @include common/util.js
// Mensaje de aprobación para Telegram (parse_mode HTML).
const r = $('Procesar respuesta IA').item.json;
const cfg = $('Config').first().json;
const attr = (v) => escHtml(v).replace(/"/g, '&quot;');

const canales = [];
if (r.email) canales.push('📧 ' + escHtml(r.email));
if (r.instagram) canales.push(`📸 <a href="${attr(r.instagram)}">Instagram</a>`);
if (r.facebook) canales.push(`📘 <a href="${attr(r.facebook)}">Facebook</a>`);
const valoracion = r.rating !== '' && r.rating !== undefined ? ` · ⭐ ${escHtml(r.rating)} (${escHtml(r.num_resenas || 0)})` : '';

const cabecera = [
  `🆕 <b>${escHtml(r.empresa)}</b> · <code>${escHtml(r.lead_id)}</code>`,
  `${escHtml(r.sector)} · ${escHtml(r.zona)}${valoracion}`,
  `🌐 ${escHtml(r.web)}`,
  canales.join('   '),
  '',
  `🎯 <b>Dolor:</b> ${escHtml(r.pain_point)}`,
  `🛠 <b>Propuesta:</b> ${escHtml(r.servicio_propuesto)}${r.agente_catalogo ? ' · ' + escHtml(r.agente_catalogo) : ''} · plan ${escHtml(r.plan_sugerido)} · confianza ${escHtml(r.confianza_ia)}/100`,
  '',
].join('\n');

let cuerpo = r.email
  ? `✉️ <b>Asunto:</b> ${escHtml(r.asunto)}\n<blockquote>${escHtml(r.cuerpo_email)}</blockquote>\n`
  : '✉️ <i>No hay email: solo se puede contactar por DM.</i>\n';
const dm = r.instagram || r.facebook ? `\n💬 <b>DM:</b> <i>${escHtml(r.mensaje_dm)}</i>\n` : '';
const pie = `\n👉 Para enviarlo: en el <a href="${attr(cfg.sheet_url)}">CRM</a>, fila <code>${escHtml(r.lead_id)}</code>, pon <b>estado = aprobado</b> (o <b>rechazado</b> para descartarlo).\n✏️ Si quieres retocar el texto, edita asunto/cuerpo_email antes de aprobar.`;

let t = cabecera + cuerpo + dm + pie;
if (t.length > 4000) {
  cuerpo = `✉️ <b>Asunto:</b> ${escHtml(r.asunto)}\n<i>(email demasiado largo para Telegram: míralo en el CRM)</i>\n`;
  t = cabecera + cuerpo + dm + pie;
}

return { json: { lead_id: r.lead_id, texto: t } };
