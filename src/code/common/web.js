// ---- análisis de HTML (se incrusta en los nodos Code al compilar) ----
const ENTIDADES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', euro: '€',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü',
  iexcl: '¡', iquest: '¿', ordf: 'ª', ordm: 'º', middot: '·', laquo: '«', raquo: '»',
  ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ccedil: 'ç',
};

function decodificarEntidades(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch (e) { return ''; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return ''; } })
    .replace(/&([a-z]+);/gi, (m, name) => (ENTIDADES[name] !== undefined ? ENTIDADES[name] : m));
}

function htmlATexto(html, maxLen) {
  const t = decodificarEntidades(
    String(html || '')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return maxLen && t.length > maxLen ? t.slice(0, maxLen) + ' […]' : t;
}

function metaDe(html) {
  const h = String(html || '');
  const titulo = (h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const desc =
    (h.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || [])[1] ||
    (h.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i) || [])[1] ||
    (h.match(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["']/i) || [])[1] ||
    '';
  const encabezados = [];
  const re = /<h([12])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(h)) && encabezados.length < 12) {
    const t = htmlATexto(m[2]).replace(/\s+/g, ' ');
    if (t && t.length < 160 && !encabezados.includes(t)) encabezados.push(t);
  }
  return {
    titulo: htmlATexto(titulo).replace(/\s+/g, ' ').slice(0, 200),
    descripcion: decodificarEntidades(desc).replace(/\s+/g, ' ').trim().slice(0, 400),
    encabezados,
  };
}

// --- emails ---------------------------------------------------------------
const EMAIL_RE = /[a-z0-9][a-z0-9._%+-]{0,63}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}/gi;
const EMAIL_DOMINIOS_FALSOS = /(^|\.)(example\.(com|es|org)|domain\.com|dominio\.(com|es)|email\.com|correo\.com|tuempresa\.(com|es)|tudominio\.(com|es)|yourdomain\.com|sentry\.io|sentry-next\.wixpress\.com|wixpress\.com|sentry\.wixpress\.com|ingest\.sentry\.io|mysite\.com|test\.com|godaddy\.com|wordpress\.(com|org)|w3\.org|schema\.org|sitio\.(com|es)|empresa\.(com|es))$/i;
const EMAIL_LOCALES_FALSOS = /^(nombre|name|tuemail|tucorreo|email|correo|usuario|user|your|yourname|youremail|info@info|test|ejemplo|example|noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster)$/i;
const PROVEEDORES_GRATIS = /^(gmail\.com|googlemail\.com|hotmail\.(com|es)|outlook\.(com|es)|live\.(com|es)|yahoo\.(com|es)|icloud\.com|me\.com|msn\.com|telefonica\.net|movistar\.es|ono\.com|terra\.es|aol\.com|protonmail\.com|proton\.me)$/i;
const LOCALES_BUENOS = /^(info|informacion|contacto|contact|hola|hello|comercial|ventas|sales|administracion|admin|oficina|gerencia|direccion|recepcion|citas|clinica|reservas|atencioncliente|atencion|clientes|central)$/i;
const LOCALES_MALOS = /(rgpd|lopd|privacidad|privacy|protecciondedatos|proteccion\.datos|protecciondatos|dpo|legal|empleo|rrhh|trabajaconnosotros|curriculum|cv|facturas?|facturacion|proveedores|abuse|webmaster|hostmaster)/i;

function descifrarCloudflare(hex) {
  try {
    const key = parseInt(hex.substr(0, 2), 16);
    let s = '';
    for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.substr(i, 2), 16) ^ key);
    return s;
  } catch (e) {
    return '';
  }
}

function extraerEmails(html) {
  let h = String(html || '');
  const extra = [];
  // Emails protegidos por Cloudflare (muy habitual en webs de pymes)
  h.replace(/data-cfemail=["']([0-9a-f]+)["']/gi, (_, hex) => { extra.push(descifrarCloudflare(hex)); return _; });
  h.replace(/\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/gi, (_, hex) => { extra.push(descifrarCloudflare(hex)); return _; });
  // mailto: con codificación URL
  h.replace(/mailto:([^"'?\s>]+)/gi, (_, m) => { try { extra.push(decodeURIComponent(m)); } catch (e) { extra.push(m); } return _; });
  h = decodificarEntidades(h)
    .replace(/\s*[\[(]\s*(at|arroba)\s*[\])]\s*/gi, '@')
    .replace(/\s+arroba\s+/gi, '@')
    .replace(/\s*[\[(]\s*(dot|punto)\s*[\])]\s*/gi, '.');
  const encontrados = (h.match(EMAIL_RE) || []).concat(extra.join(' ').match(EMAIL_RE) || []);
  const vistos = new Set();
  const res = [];
  for (let e of encontrados) {
    e = e.toLowerCase().replace(/^[._%+-]+/, '').replace(/[.]+$/, '');
    const [local, dom] = e.split('@');
    if (!local || !dom) continue;
    if (/\.(png|jpe?g|gif|webp|svg|bmp|ico|css|js|mp4|pdf)$/i.test(e)) continue;
    if (EMAIL_DOMINIOS_FALSOS.test(dom) || EMAIL_LOCALES_FALSOS.test(local)) continue;
    if (/^[0-9a-f]{20,}$/i.test(local)) continue; // claves de Sentry y similares
    if (vistos.has(e)) continue;
    vistos.add(e);
    res.push(e);
  }
  return res;
}

function puntuarEmail(email, dominioWeb) {
  const [local, dom] = email.split('@');
  let p = 10;
  if (dominioWeb && (dom === dominioWeb || dom.endsWith('.' + dominioWeb) || dominioWeb.endsWith('.' + dom))) p += 100;
  else if (PROVEEDORES_GRATIS.test(dom)) p += 50;
  if (LOCALES_BUENOS.test(local)) p += 20;
  if (LOCALES_MALOS.test(local)) p -= 40;
  return p;
}

function ordenarEmails(emails, dominioWeb) {
  return [...new Set(emails)]
    .map((e) => ({ e, p: puntuarEmail(e, dominioWeb) }))
    .sort((a, b) => b.p - a.p)
    .map((x) => x.e);
}

// --- redes sociales -------------------------------------------------------
const IG_EXCLUIR = /^(p|reel|reels|explore|accounts|stories|tv|share|sharer|direct|about|developer|legal|privacy|web|embed|static|instagram)$/i;
const FB_EXCLUIR = /^(sharer|sharer\.php|share|share\.php|plugins|dialog|tr|login|login\.php|policies|privacy|help|groups|events|watch|photo|photo\.php|media|hashtag|pages|business|ads|legal|terms|l\.php|v\d+\.\d+|connect|facebook|home\.php|story\.php|permalink\.php|\d{1,4})$/i;

function extraerRedes(html) {
  const h = decodificarEntidades(String(html || '')).replace(/\\\//g, '/');
  let instagram = '';
  let facebook = '';
  let linkedin = '';
  const reIg = /instagram\.com\/([A-Za-z0-9_.]{2,30})/gi;
  let m;
  while ((m = reIg.exec(h))) {
    const handle = m[1].replace(/\.+$/, '');
    if (/\.(js|css|png|jpe?g|svg|webp|php|html?)$/i.test(handle)) continue;
    if (!IG_EXCLUIR.test(handle)) { instagram = 'https://www.instagram.com/' + handle + '/'; break; }
  }
  const reFb = /(?:facebook|fb)\.com\/((?:profile\.php\?id=\d+)|(?:people\/[^"'\s<>?#]+\/\d+)|(?:[A-Za-z0-9.\-]{2,80}))/gi;
  while ((m = reFb.exec(h))) {
    const path = m[1].replace(/\/+$/, '');
    const first = path.split(/[/?]/)[0];
    if (!FB_EXCLUIR.test(first) || /^profile\.php\?id=/.test(path)) { facebook = 'https://www.facebook.com/' + path; break; }
  }
  const reLi = /linkedin\.com\/(company|in|school)\/([A-Za-z0-9\-_%.]{2,100})/i;
  const li = h.match(reLi);
  if (li) linkedin = 'https://www.linkedin.com/' + li[1] + '/' + li[2].replace(/\/+$/, '') + '/';
  return { instagram, facebook, linkedin };
}

// --- enlaces internos (contacto / aviso legal) ----------------------------
function buscarEnlaces(html, baseUrl) {
  // Requiere partesUrl / resolverUrl / dominioDe de common/util.js (sin clase URL).
  const res = { contacto: '', legal: '' };
  const base = partesUrl(baseUrl);
  if (!base) return res;
  const dominioBase = dominioDe(baseUrl);
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  let legalPrioridad = 0;
  while ((m = re.exec(String(html || '')))) {
    const href = decodificarEntidades(m[1].trim());
    if (/^(mailto|tel|javascript|whatsapp|data):/i.test(href)) continue;
    const abs = resolverUrl(href, baseUrl);
    if (!abs || dominioDe(abs) !== dominioBase) continue;
    const p = partesUrl(abs);
    const clave = (p.ruta + ' ' + htmlATexto(m[2])).toLowerCase();
    if (!res.contacto && /contact/.test(clave)) res.contacto = abs;
    const pr = /aviso[- _]?legal/.test(clave) ? 3 : /legal/.test(clave) ? 2 : /privacidad|privacy/.test(clave) ? 1 : 0;
    if (pr > legalPrioridad) { res.legal = abs; legalPrioridad = pr; }
  }
  if (!res.contacto) res.contacto = base.origen + '/contacto/';
  if (!res.legal) res.legal = base.origen + '/aviso-legal/';
  return res;
}

// --- señales técnicas -----------------------------------------------------
function detectarSenales(html, url, textoPlano) {
  const h = String(html || '').toLowerCase();
  const si = (re) => re.test(h);
  let cms = 'desconocido';
  if (si(/wp-content|wp-includes/)) cms = 'WordPress';
  else if (si(/wixstatic|wix\.com/)) cms = 'Wix';
  else if (si(/cdn\.shopify|shopify\.com/)) cms = 'Shopify';
  else if (si(/prestashop/)) cms = 'PrestaShop';
  else if (si(/squarespace/)) cms = 'Squarespace';
  else if (si(/webflow/)) cms = 'Webflow';
  else if (si(/jimdo/)) cms = 'Jimdo';
  else if (si(/joomla/)) cms = 'Joomla';
  const anios = [...h.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(20\d{2})/g)].map((x) => Number(x[1]));
  const t = String(textoPlano || '').toLowerCase();
  let problema = '';
  if (!h) problema = 'la web no responde';
  else if (t.length < 200) problema = 'web casi vacía';
  else if (/dominio (en venta|está a la venta)|domain (is )?for sale|parked|en construcci[oó]n|under construction|coming soon|próximamente/.test(t.slice(0, 1500))) problema = 'web aparcada o en construcción';
  return {
    cms,
    https: /^https:/i.test(String(url || '')),
    chat_web: si(/tawk\.to|crisp\.chat|tidio|livechat|zendesk|intercom|hs-scripts|drift\.com|manychat|smartsupp|jivosite|userlike|chatbot|landbot/),
    whatsapp: si(/wa\.me\/|api\.whatsapp\.com|web\.whatsapp\.com|whatsapp/),
    // Solo reserva ONLINE real ("pide cita llamando" no cuenta: es justo un dolor).
    reserva_online: si(/reserva(r)? online|reservas online|cita online|pedir cita online|reservar cita online|agenda online|calendly|doctoralia|treatwell|bookitit|booksy|simplybook|clinicminds|reservio|timify|setmore/),
    newsletter: si(/newsletter|suscr[ií]bete|mailchimp|mailerlite|sendinblue|brevo|acumbamail|mailrelay/),
    blog: si(/href=["'][^"']*\/(blog|noticias|actualidad|articulos)[/"']/),
    tienda_online: si(/woocommerce|add-to-cart|añadir al carrito|anadir al carrito|cdn\.shopify|prestashop/),
    formulario: si(/<form\b/),
    analytics: si(/googletagmanager|gtag\(|google-analytics|analytics\.js/),
    pixel_meta: si(/fbq\(|connect\.facebook\.net/),
    multidioma: si(/hreflang=/),
    anio_copyright: anios.length ? Math.max(...anios) : '',
    problema_web: problema,
  };
}
