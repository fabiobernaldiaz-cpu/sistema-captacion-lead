// @include common/util.js
const cfg = $('Config').first().json;
const aviso = texto($('Interpretar orden').first().json.aviso);
const lineas = [];
if (aviso) lineas.push('⚠️ ' + escHtml(aviso), '');
lineas.push(
  '🤖 <b>Captación RedesiaNet</b>',
  '',
  '/enviar ID — envía el email (y te prepara el DM si hay Instagram/Facebook)',
  '/rechazar ID — descarta el borrador',
  '/dm_ok ID — marca que ya enviaste el DM',
  '/pendientes — lista lo que falta por revisar',
  '',
  'También puedes usar los botones de cada borrador.',
  `📄 <a href="${escHtml(cfg.sheet_url)}">Abrir CRM</a>`,
);
return [{ json: { texto: lineas.join('\n') } }];
