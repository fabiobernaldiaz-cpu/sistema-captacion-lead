// @include common/util.js
// @include common/web.js
// Analiza la página de inicio: emails, redes, señales técnicas, texto y
// enlaces a "contacto" y "aviso legal" (que se descargan en los nodos siguientes).
const lead = $('Filtrar y deduplicar').item.json;
const html = typeof $json.data === 'string' ? $json.data : '';
const errorWeb = $json.error ? texto($json.error.message || JSON.stringify($json.error)).slice(0, 200) : '';

const textoHome = htmlATexto(html, 6000);
const meta = metaDe(html);
const enlaces = buscarEnlaces(html, lead.web);

return {
  json: {
    ...lead,
    web_error: errorWeb,
    emails_home: extraerEmails(html),
    redes_home: extraerRedes(html),
    senales: detectarSenales(html, lead.web, textoHome),
    meta,
    texto_home: textoHome,
    contacto_url: enlaces.contacto,
    legal_url: enlaces.legal,
  },
};
