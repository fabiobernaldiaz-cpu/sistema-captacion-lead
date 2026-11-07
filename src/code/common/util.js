// ---- utilidades comunes (se incrustan en los nodos Code al compilar) ----
function ahoraMadrid() {
  return DateTime.now().setZone('Europe/Madrid').toFormat('yyyy-MM-dd HH:mm');
}

function texto(v) {
  return v === undefined || v === null ? '' : String(v).trim();
}

// Escapa texto para mensajes de Telegram con parse_mode = HTML
function escHtml(v) {
  return texto(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// OJO: el sandbox de los nodos Code de n8n NO tiene la clase URL. Usamos regex.
function partesUrl(url) {
  const u = texto(url);
  const m = (/^https?:\/\//i.test(u) ? u : 'http://' + u).match(/^(https?:)\/\/([^/?#:@\s]+)(?::(\d+))?([^?#\s]*)/i);
  if (!m || !/\./.test(m[2])) return null;
  const host = m[2].toLowerCase();
  return { protocolo: m[1].toLowerCase(), host, origen: m[1].toLowerCase() + '//' + host + (m[3] ? ':' + m[3] : ''), ruta: m[4] || '/' };
}

function dominioDe(url) {
  const p = partesUrl(url);
  return p ? p.host.replace(/^www\d?\./, '') : '';
}

// Resuelve un href (absoluto, //host, /ruta o relativo) contra la URL base.
function resolverUrl(href, base) {
  const h = texto(href);
  const b = partesUrl(base);
  if (!h || !b) return '';
  if (/^https?:\/\//i.test(h)) return h;
  if (h.startsWith('//')) return b.protocolo + h;
  let ruta = h.startsWith('/') ? h : b.ruta.replace(/[^/]*$/, '') + h;
  const [camino, resto = ''] = ruta.split(/(?=[?#])/);
  const segs = [];
  for (const s of camino.split('/')) {
    if (s === '..') segs.pop();
    else if (s !== '.') segs.push(s);
  }
  ruta = segs.join('/');
  return b.origen + (ruta.startsWith('/') ? '' : '/') + ruta + resto;
}

// ¿El dominio o el email está en la pestaña Bloqueados? (acepta emails y dominios)
// Un dominio genérico (gmail.com, hotmail.com…) nunca bloquea a todos sus usuarios:
// para esos solo cuenta el email exacto.
const DOMINIOS_GENERICOS = /^(gmail\.com|googlemail\.com|hotmail\.(com|es)|outlook\.(com|es)|live\.(com|es)|yahoo\.(com|es)|icloud\.com|me\.com|msn\.com|telefonica\.net|movistar\.es|ono\.com|terra\.es|aol\.com|protonmail\.com|proton\.me)$/i;
function estaBloqueado(valor, bloqueados) {
  const v = texto(valor).toLowerCase();
  if (!v) return false;
  const dom = v.includes('@') ? v.split('@').pop() : v;
  return bloqueados.some((b) => b === v || (!DOMINIOS_GENERICOS.test(b) && (b === dom || dom.endsWith('.' + b))));
}
