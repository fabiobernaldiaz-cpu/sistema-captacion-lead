// @include common/util.js
const { anthropic_body, ...r } = $('Preparar clasificación').item.json;
const res = $json || {};

let c = null;
if (!res.error && Array.isArray(res.content)) {
  const tool = res.content.find((b) => b.type === 'tool_use' && b.name === 'clasificar_respuesta');
  if (tool) c = typeof tool.input === 'string' ? (() => { try { return JSON.parse(tool.input); } catch (e) { return null; } })() : tool.input;
}
const clasificacion = (c && texto(c.clasificacion)) || 'sin_clasificar';
const resumen = (c && texto(c.resumen)) || '';

let estado = 'respondido';
if (clasificacion === 'rebote') estado = 'rebotado';
if (clasificacion === 'baja' || r.estado_actual === 'baja') estado = 'baja';

const EMOJI = { interesado: '🔥', pide_info: '❓', no_interesado: '🙅', baja: '⛔', fuera_oficina: '🏖️', rebote: '📭', otro: '📩', sin_clasificar: '📩' };
const enlace = `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(r.thread_id)}`;
const msg = [
  `${EMOJI[clasificacion] || '📩'} <b>Respuesta de ${escHtml(r.empresa)}</b> · <code>${escHtml(r.lead_id)}</code>`,
  `Clasificación: <b>${escHtml(clasificacion)}</b>${resumen ? ' — ' + escHtml(resumen) : ''}`,
  `<i>«${escHtml(r.extracto)}»</i>`,
  `<a href="${escHtml(enlace)}">Abrir en Gmail</a>`,
].join('\n');

return {
  json: {
    lead_id: r.lead_id,
    estado,
    fecha_respuesta: ahoraMadrid(),
    clasificacion_respuesta: clasificacion,
    respuesta: (resumen ? resumen + ' — ' : '') + '«' + r.extracto + '»',
    _baja: clasificacion === 'baja',
    _email: r.email_lead || r.de,
    _texto: msg,
  },
};
