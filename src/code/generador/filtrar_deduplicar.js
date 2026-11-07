// @include common/util.js
// Convierte los resultados de Google Places en leads nuevos:
//  - solo negocios operativos y con web propia
//  - sin repetir place_id ni dominio ya presentes en el CRM
//  - sin dominios de la pestaña Bloqueados
//  - como máximo max_leads_por_ejecucion
const cfg = $('Config').first().json;
const maxLeads = Number(cfg.max_leads_por_ejecucion) || 15;
const busquedas = $('Elegir búsquedas').all();
const existentes = $('Leer Leads').all().map((i) => i.json || {});
const bloqueados = $('Leer Bloqueados')
  .all()
  .map((i) => texto(i.json && i.json.valor).toLowerCase())
  .filter(Boolean);

const placeIds = new Set(existentes.map((r) => texto(r.place_id)).filter(Boolean));
const dominios = new Set(existentes.map((r) => dominioDe(r.web)).filter(Boolean));
const idsUsados = new Set(existentes.map((r) => texto(r.lead_id)).filter(Boolean));

const NO_ES_WEB_PROPIA = /(^|\.)(facebook\.com|instagram\.com|fb\.com|fb\.me|linktr\.ee|wa\.me|whatsapp\.com|business\.site|google\.com|goo\.gl|g\.page|sites\.google\.com|tiktok\.com|youtube\.com|linkedin\.com|twitter\.com|x\.com|doctoralia\.es|treatwell\.es|booksy\.com|milanuncios\.com|idealista\.com|fotocasa\.es|paginasamarillas\.es)$/i;

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function nuevoId() {
  let id;
  do {
    id = ALFABETO[Math.floor(Math.random() * 24)]; // primera letra siempre alfabética
    for (let k = 0; k < 5; k++) id += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  } while (idsUsados.has(id));
  idsUsados.add(id);
  return id;
}

const entradas = $input.all();
const errores = entradas.filter((it) => it.json && it.json.error);
if (entradas.length && errores.length === entradas.length) {
  const e = errores[0].json.error;
  throw new Error('Google Places falló en todas las búsquedas: ' + (e.message || JSON.stringify(e)).slice(0, 400));
}

const salida = [];
entradas.forEach((item, i) => {
  const b = (busquedas[i] && busquedas[i].json) || {};
  const places = Array.isArray(item.json && item.json.places) ? item.json.places : [];
  for (const p of places) {
    if (salida.length >= maxLeads) return;
    if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue;
    const web = texto(p.websiteUri);
    const dom = dominioDe(web);
    if (!web || !dom || NO_ES_WEB_PROPIA.test(dom)) continue;
    if (placeIds.has(texto(p.id)) || dominios.has(dom)) continue;
    if (estaBloqueado(dom, bloqueados)) continue;
    placeIds.add(texto(p.id));
    dominios.add(dom);
    salida.push({
      json: {
        lead_id: nuevoId(),
        empresa: texto(p.displayName && p.displayName.text),
        sector: b.sector || '',
        zona: b.zona || '',
        web,
        dominio: dom,
        telefono: texto(p.nationalPhoneNumber || p.internationalPhoneNumber),
        direccion: texto(p.formattedAddress),
        google_maps_url: texto(p.googleMapsUri),
        place_id: texto(p.id),
        rating: p.rating ?? '',
        num_resenas: p.userRatingCount ?? '',
        categoria_google: texto(p.primaryTypeDisplayName && p.primaryTypeDisplayName.text),
        busqueda_origen: b.consulta || '',
      },
    });
  }
});

return salida;
