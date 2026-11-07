// @include common/util.js
// Lead sin email ni redes: se guarda como "sin_canal" (útil para llamar) sin gastar IA.
const l = $json;
return {
  json: {
    lead_id: l.lead_id,
    estado: 'sin_canal',
    fecha_alta: ahoraMadrid(),
    empresa: l.empresa,
    sector: l.sector,
    zona: l.zona,
    web: l.web,
    telefono: l.telefono,
    linkedin: l.linkedin,
    direccion: l.direccion,
    google_maps_url: l.google_maps_url,
    place_id: l.place_id,
    rating: l.rating,
    num_resenas: l.num_resenas,
    motivo_descarte: l.web_error ? 'web inaccesible: ' + l.web_error : 'sin email ni redes en la web',
    busqueda_origen: l.busqueda_origen,
  },
};
