// @include common/util.js
// Traduce el mensaje o botón de Telegram a una orden: enviar | rechazar | dm_ok | pendientes | ayuda
const cfg = $('Config').first().json;
const u = $('Telegram: órdenes').first().json || {};

let txt = '';
let chatId = '';
let callbackId = '';
if (u.callback_query) {
  txt = texto(u.callback_query.data);
  chatId = texto(u.callback_query.message && u.callback_query.message.chat && u.callback_query.message.chat.id);
  callbackId = texto(u.callback_query.id);
} else if (u.message) {
  txt = texto(u.message.text);
  chatId = texto(u.message.chat && u.message.chat.id);
}

// Seguridad: solo se obedece al chat de Fabio (el trigger ya filtra, esto es doble control).
if (!chatId || chatId !== texto(cfg.telegram_chat_id)) return [];

const ALIAS = {
  enviar: 'enviar', envia: 'enviar', send: 'enviar',
  rechazar: 'rechazar', rechaza: 'rechazar', descartar: 'rechazar',
  dm_ok: 'dm_ok', dmok: 'dm_ok',
  pendientes: 'pendientes',
  ayuda: 'ayuda', start: 'ayuda', help: 'ayuda',
};
const m = txt.match(/^\/?([a-zñ_]+)(?:@\w+)?(?:[\s:]+([a-z0-9]{4,12}))?/i);
let accion = (m && ALIAS[m[1].toLowerCase()]) || 'ayuda';
const leadId = m && m[2] ? m[2].toUpperCase() : '';
let aviso = '';
if (['enviar', 'rechazar', 'dm_ok'].includes(accion) && !leadId) {
  aviso = `Falta el ID del lead. Ejemplo: /${accion} K7Q2MX`;
  accion = 'ayuda';
}

return [{ json: { accion, lead_id: leadId, chat_id: chatId, callback_id: callbackId, aviso } }];
