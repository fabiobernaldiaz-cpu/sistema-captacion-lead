// @include common/util.js
const cfg = $('Config').first().json;
const filas = $input.all().map((i) => i.json || {}).filter((r) => texto(r.lead_id));
const pend = filas.filter((r) => texto(r.estado) === 'pendiente_aprobacion');
const dms = filas.filter((r) => texto(r.dm_estado) === 'pendiente');

const lineas = [`📋 <b>${pend.length} borradores pendientes</b>`];
pend.slice(0, 30).forEach((r) => {
  const extra = [r.zona, r.servicio_propuesto].map(texto).filter(Boolean).map(escHtml).join(' · ');
  lineas.push(`• <code>${escHtml(r.lead_id)}</code> ${escHtml(r.empresa)}${extra ? ' · ' + extra : ''}`);
});
if (pend.length > 30) lineas.push(`… y ${pend.length - 30} más (míralos en el CRM)`);
if (dms.length) {
  lineas.push('', `💬 <b>${dms.length} DMs por enviar</b>`);
  dms.slice(0, 15).forEach((r) => lineas.push(`• <code>${escHtml(r.lead_id)}</code> ${escHtml(r.empresa)}`));
}
lineas.push('', `📄 <a href="${escHtml(cfg.sheet_url)}">Abrir CRM</a>`);
return [{ json: { texto: lineas.join('\n') } }];
