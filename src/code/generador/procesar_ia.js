// @include common/util.js
// Lee la respuesta de Claude y construye la fila del CRM (pestaña Leads).
const cfg = $('Config').first().json;
const { anthropic_body, ...l } = $('Preparar petición Claude').item.json;
const r = $json || {};

let a = null;
let error = '';
if (r.error) {
  error = 'API Anthropic: ' + texto(r.error.message || JSON.stringify(r.error)).slice(0, 300);
} else if (r.stop_reason === 'refusal') {
  error = 'El modelo rechazó la petición';
} else {
  const bloques = Array.isArray(r.content) ? r.content : [];
  const tool = bloques.find((c) => c.type === 'tool_use' && c.name === 'registrar_analisis');
  if (tool) {
    if (typeof tool.input === 'string') { try { a = JSON.parse(tool.input); } catch (e) { a = null; } } else a = tool.input;
  } else {
    const txt = bloques.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    const mm = txt.match(/\{[\s\S]*\}/);
    if (mm) { try { a = JSON.parse(mm[0]); } catch (e) { a = null; } }
  }
  if (!a) error = 'Respuesta sin análisis (stop_reason: ' + texto(r.stop_reason) + ')';
  else if (!texto(a.cuerpo_email) && a.empresa_valida !== false) error = 'La IA no redactó el email';
}

// Quita despedidas/firmas que la IA haya añadido por su cuenta: la firma la pone el sistema.
function limpiarCuerpo(t) {
  const lineas = texto(t).replace(/\r/g, '').split('\n');
  const esCierre = (x) => /^(un saludo|saludos|un abrazo|gracias|atentamente|fabio\b|—|--)/i.test(x.trim()) || /fabiobernaldiaz|redesianet\s*\|/i.test(x);
  while (lineas.length && (!lineas[lineas.length - 1].trim() || esCierre(lineas[lineas.length - 1]))) lineas.pop();
  return lineas.join('\n').trim();
}

let cuerpo = '';
if (a && texto(a.cuerpo_email)) {
  cuerpo = limpiarCuerpo(a.cuerpo_email);
  const desp = texto(cfg.despedida);
  cuerpo += '\n\n' + (desp ? desp + '\n' : '') + texto(cfg.firma);
  if (texto(cfg.linea_baja)) cuerpo += '\n\n' + texto(cfg.linea_baja);
}

const confianza = a ? Number(a.confianza) || 0 : '';
const minConf = Number(cfg.confianza_minima) || 0;
let estado = 'pendiente_aprobacion';
let motivo = '';
if (error) { estado = 'error_ia'; motivo = error; }
else if (a.empresa_valida === false) { estado = 'descartado_ia'; motivo = texto(a.motivo_descarte) || 'sin encaje'; }
else if (confianza < minConf) { estado = 'descartado_ia'; motivo = `confianza baja (${confianza} < ${minConf})`; }

const resumen = a ? [texto(a.resumen_empresa), a.evidencia ? 'Evidencia: ' + texto(a.evidencia) : ''].filter(Boolean).join(' · ') : '';

return {
  json: {
    lead_id: l.lead_id,
    estado,
    fecha_alta: ahoraMadrid(),
    empresa: l.empresa,
    sector: l.sector,
    zona: l.zona,
    web: l.web,
    email: l.email,
    emails_alternativos: l.emails_alternativos,
    telefono: l.telefono,
    instagram: l.instagram,
    facebook: l.facebook,
    linkedin: l.linkedin,
    direccion: l.direccion,
    google_maps_url: l.google_maps_url,
    place_id: l.place_id,
    rating: l.rating,
    num_resenas: l.num_resenas,
    resumen_empresa: resumen,
    pain_point: a ? texto(a.pain_point) : '',
    servicio_propuesto: a ? texto(a.servicio_propuesto) : '',
    agente_catalogo: a ? texto(a.agente_catalogo) : '',
    plan_sugerido: a ? texto(a.plan_sugerido) : '',
    confianza_ia: confianza,
    asunto: a ? texto(a.asunto) : '',
    cuerpo_email: cuerpo,
    mensaje_dm: a ? texto(a.mensaje_dm) : '',
    motivo_descarte: motivo,
    busqueda_origen: l.busqueda_origen,
  },
};
