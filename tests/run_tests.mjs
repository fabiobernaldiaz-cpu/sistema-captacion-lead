// Pruebas de la lógica de los nodos Code, ejecutando EXACTAMENTE el código
// compilado en n8n/*.json con un entorno que imita al de n8n.
//
// Uso:  python3 src/build_workflows.py && node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fx = (f) => fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', f), 'utf8');
const wf = (k) => JSON.parse(fs.readFileSync(path.join(ROOT, 'n8n', `workflow_${k}.json`), 'utf8'));
const WF = { generador: wf('generador'), enviador: wf('enviador'), respuestas: wf('respuestas') };

// Sustituto mínimo de Luxon (solo lo que usamos)
const DateTime = { now: () => ({ setZone: () => ({ toFormat: () => '2026-11-09 09:00' }) }) };
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function codeOf(k, nodeName) {
  const n = WF[k].nodes.find((x) => x.name === nodeName);
  assert.ok(n, `no existe el nodo ${nodeName}`);
  return { code: n.parameters.jsCode, perItem: n.parameters.mode === 'runOnceForEachItem' };
}
const wrap = (arr) => arr.map((j) => (j && j.json ? j : { json: j }));

// refs: { 'Nodo': [json, json...] }  — emparejado por índice, como en n8n 1:1
async function run(k, nodeName, input, refs = {}) {
  const { code, perItem } = codeOf(k, nodeName);
  const items = wrap(input);
  const ref = (i) => (name) => {
    assert.ok(name in refs, `el test no proporciona $('${name}')`);
    const list = wrap(refs[name]);
    return { all: () => list, first: () => list[0], item: list[i] ?? list[0], itemMatching: (j) => list[j] };
  };
  // Globals que NO existen en el sandbox de n8n 2.x: se ocultan para que un uso
  // accidental falle aquí también (comprobado con un workflow de sonda).
  const OCULTOS = ['URL', 'URLSearchParams', 'structuredClone', 'fetch', 'require', 'process', 'Buffer'];
  const fn = new AsyncFunction('$input', '$json', '$', 'DateTime', ...OCULTOS, code);
  const sinGlobals = OCULTOS.map(() => undefined);
  if (!perItem) {
    const $input = { all: () => items, first: () => items[0], item: items[0] };
    const out = await fn($input, items[0] && items[0].json, ref(0), DateTime, ...sinGlobals);
    return wrap(out || []).map((x) => x.json);
  }
  const res = [];
  for (let i = 0; i < items.length; i++) {
    const $input = { all: () => items, first: () => items[0], item: items[i] };
    const out = await fn($input, items[i].json, ref(i), DateTime, ...sinGlobals);
    res.push(...wrap(Array.isArray(out) ? out : [out]).map((x) => x.json));
  }
  return res;
}

// Validador de HTML de Telegram: solo etiquetas permitidas y bien anidadas.
function assertTelegramHtml(t) {
  assert.ok(t.length <= 4096, 'mensaje demasiado largo para Telegram');
  const ok = new Set(['b', 'i', 'u', 's', 'a', 'code', 'pre', 'blockquote']);
  const stack = [];
  for (const m of t.matchAll(/<(\/?)([a-z]+)[^>]*>/g)) {
    assert.ok(ok.has(m[2]), `etiqueta no permitida en Telegram: <${m[2]}>`);
    if (m[1]) assert.equal(stack.pop(), m[2], 'etiquetas mal anidadas');
    else stack.push(m[2]);
  }
  assert.equal(stack.length, 0, 'etiquetas sin cerrar');
  assert.ok(!/&(?!amp;|lt;|gt;|quot;)/.test(t), '& sin escapar');
}

const cfgGen = () => WF.generador.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments
  .reduce((o, a) => ({ ...o, [a.name]: a.value }), {});
const cfgEnv = () => WF.enviador.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments
  .reduce((o, a) => ({ ...o, [a.name]: a.value }), {});

// ---------------------------------------------------------------------------
// GENERADOR
// ---------------------------------------------------------------------------
test('elegir búsquedas: activas, las más antiguas primero, N por ejecución', async () => {
  const filas = [
    { id: 'B001', activa: 'SI', sector: 'Dental', zona: 'Coslada', consulta: 'clínica dental en Coslada', ultima_ejecucion: '2026-11-05 09:00', veces_ejecutada: 1 },
    { id: 'B002', activa: 'NO', sector: 'Dental', zona: 'Alcalá', consulta: 'x', ultima_ejecucion: '' },
    { id: 'B003', activa: 'SI', sector: 'Legal', zona: 'Alcalá', consulta: 'abogados en Alcalá', ultima_ejecucion: '' },
    { id: 'B004', activa: 'si', sector: 'Taller', zona: 'Arganda', consulta: 'taller en Arganda', ultima_ejecucion: '2026-10-01 09:00' },
    { id: 'B005', activa: 'SI', sector: 'Gym', zona: 'Torrejón', consulta: 'gimnasio en Torrejón', ultima_ejecucion: '2026-11-06 09:00' },
  ];
  const out = await run('generador', 'Elegir búsquedas', filas, { Config: [cfgGen()] });
  assert.deepEqual(out.map((o) => o.id), ['B003', 'B004', 'B001']);
  await assert.rejects(run('generador', 'Elegir búsquedas', [{}], { Config: [cfgGen()] }), /no tiene filas activas/);
});

test('filtrar y deduplicar resultados de Google Places', async () => {
  const busquedas = [
    { id: 'B1', sector: 'Salud · Dental', zona: 'Torrejón de Ardoz', consulta: 'clínica dental en Torrejón de Ardoz' },
    { id: 'B2', sector: 'Construcción / Reformas', zona: 'Coslada', consulta: 'empresa de reformas en Coslada' },
  ];
  const places = [
    { places: [
      { id: 'P1', displayName: { text: 'Clínica Dental Sonrisas' }, websiteUri: 'https://www.clinicadentalsonrisas.es/', nationalPhoneNumber: '916 00 00 00', rating: 4.7, userRatingCount: 120, businessStatus: 'OPERATIONAL', formattedAddress: 'C. Mayor 10, Torrejón', googleMapsUri: 'https://maps.google.com/?cid=1', primaryTypeDisplayName: { text: 'Dentista' } },
      { id: 'P2', displayName: { text: 'Sin web' }, businessStatus: 'OPERATIONAL' },
      { id: 'P3', displayName: { text: 'Solo Facebook' }, websiteUri: 'https://facebook.com/algo', businessStatus: 'OPERATIONAL' },
      { id: 'P4', displayName: { text: 'Cerrada' }, websiteUri: 'https://cerrada.es', businessStatus: 'CLOSED_PERMANENTLY' },
      { id: 'P5', displayName: { text: 'Ya en CRM' }, websiteUri: 'https://yaenCRM.es', businessStatus: 'OPERATIONAL' },
      { id: 'P6', displayName: { text: 'Bloqueada' }, websiteUri: 'https://www.bloqueada.com/inicio', businessStatus: 'OPERATIONAL' },
    ] },
    { places: [
      { id: 'P1', displayName: { text: 'Clínica Dental Sonrisas' }, websiteUri: 'https://clinicadentalsonrisas.es', businessStatus: 'OPERATIONAL' },
      { id: 'P7', displayName: { text: 'Reformas Henares' }, websiteUri: 'https://reformashenares.wixsite.com/inicio', businessStatus: 'OPERATIONAL' },
    ] },
  ];
  const out = await run('generador', 'Filtrar y deduplicar', places, {
    Config: [cfgGen()],
    'Elegir búsquedas': busquedas,
    'Leer Leads': [{ lead_id: 'AAAAAA', place_id: 'PX', web: 'https://yaencrm.es/' }],
    'Leer Bloqueados': [{ valor: 'bloqueada.com' }, { valor: 'redesianet.com' }],
  });
  assert.deepEqual(out.map((o) => o.place_id), ['P1', 'P7']);
  assert.equal(out[0].dominio, 'clinicadentalsonrisas.es');
  assert.equal(out[0].sector, 'Salud · Dental');
  assert.equal(out[1].zona, 'Coslada');
  assert.match(out[0].lead_id, /^[A-Z][A-Z2-9]{5}$/);
  assert.notEqual(out[0].lead_id, out[1].lead_id);

  // límite de leads por ejecución
  const pocos = await run('generador', 'Filtrar y deduplicar', places, {
    Config: [{ ...cfgGen(), max_leads_por_ejecucion: 1 }],
    'Elegir búsquedas': busquedas, 'Leer Leads': [{}], 'Leer Bloqueados': [{}],
  });
  assert.equal(pocos.length, 1);

  // si Places falla en todas las búsquedas, error visible
  await assert.rejects(
    run('generador', 'Filtrar y deduplicar', [{ error: { message: '403 API key not valid' } }], {
      Config: [cfgGen()], 'Elegir búsquedas': busquedas, 'Leer Leads': [{}], 'Leer Bloqueados': [{}],
    }),
    /Google Places falló/,
  );
});

const leadDental = {
  lead_id: 'K7Q2MX', empresa: 'Clínica Dental Sonrisas', sector: 'Salud · Dental', zona: 'Torrejón de Ardoz',
  web: 'https://www.clinicadentalsonrisas.es/', dominio: 'clinicadentalsonrisas.es', telefono: '916 00 00 00',
  direccion: 'C. Mayor 10, Torrejón', google_maps_url: 'https://maps.google.com/?cid=1', place_id: 'P1',
  rating: 4.7, num_resenas: 120, categoria_google: 'Dentista', busqueda_origen: 'clínica dental en Torrejón de Ardoz',
};

async function pipelineWeb(lead, home, contacto, legal) {
  const [ext] = await run('generador', 'Extraer datos de la web', [{ data: home }], { 'Filtrar y deduplicar': [lead] });
  const [cons] = await run('generador', 'Consolidar datos web', [{ data: legal }], {
    'Extraer datos de la web': [ext],
    'Web: contacto': [{ data: contacto }],
    'Leer Bloqueados': [{ valor: 'redesianet.com' }],
  });
  return { ext, cons };
}

test('extraer datos de la web: emails Cloudflare, redes, señales y enlaces', async () => {
  const { ext, cons } = await pipelineWeb(leadDental, fx('dental_home.html'), fx('dental_contacto.html'), fx('dental_legal.html'));
  assert.deepEqual(ext.emails_home, ['info@clinicadentalsonrisas.es']);
  assert.equal(ext.redes_home.instagram, 'https://www.instagram.com/dentalsonrisas_torrejon/');
  assert.equal(ext.redes_home.facebook, 'https://www.facebook.com/ClinicaDentalSonrisasTorrejon');
  assert.equal(ext.contacto_url, 'https://clinicadentalsonrisas.es/contacto/');
  assert.equal(ext.legal_url, 'https://www.clinicadentalsonrisas.es/aviso-legal/');
  assert.equal(ext.senales.cms, 'WordPress');
  assert.equal(ext.senales.analytics, true);
  assert.equal(ext.senales.chat_web, false);
  assert.equal(ext.senales.reserva_online, false);
  assert.equal(ext.senales.anio_copyright, 2019);
  assert.match(ext.meta.titulo, /Clínica Dental Sonrisas/);
  assert.ok(ext.meta.encabezados.includes('Implantes dentales & ortodoncia invisible'));
  assert.ok(!/<script|Sentry|wp-content/.test(ext.texto_home));
  // consolidado: info@ primero; citas@ (ofuscado) después; rgpd@ al final
  assert.equal(cons.email, 'info@clinicadentalsonrisas.es');
  assert.equal(cons.emails_alternativos, 'citas@clinicadentalsonrisas.es, rgpd@clinicadentalsonrisas.es');
  assert.equal(cons.tiene_canal, true);
  assert.match(cons.texto_contacto, /Laura Gómez/);
  assert.equal(cons.emails_home, undefined, 'no arrastra campos internos');
});

test('extraer datos: web Wix con gmail y solo WhatsApp/Instagram; web caída', async () => {
  const lead = { ...leadDental, lead_id: 'R3FORM', web: 'https://reformashenares.es', dominio: 'reformashenares.es' };
  const { ext, cons } = await pipelineWeb(lead, fx('reformas_home.html'), '', '');
  assert.equal(ext.senales.cms, 'Wix');
  assert.equal(ext.senales.whatsapp, true);
  assert.equal(ext.senales.anio_copyright, 2024);
  assert.equal(cons.email, 'reformashenares@gmail.com');
  assert.equal(cons.instagram, 'https://www.instagram.com/reformas.henares/');
  assert.equal(ext.contacto_url, 'https://reformashenares.es/pages/contacta.html?ref=menu', 'enlace relativo resuelto sin URL()');
  assert.equal(ext.legal_url, 'https://reformashenares.es/legal');

  const caida = await pipelineWeb(lead, undefined, undefined, undefined);
  assert.equal(caida.ext.senales.problema_web, 'la web no responde');
  assert.equal(caida.cons.tiene_canal, false);

  const bloqueado = await run('generador', 'Consolidar datos web', [{ data: '' }], {
    'Extraer datos de la web': [ext], 'Web: contacto': [{ data: '' }], 'Leer Bloqueados': [{ valor: 'reformashenares@gmail.com' }],
  });
  assert.equal(bloqueado[0].email, '', 'respeta la pestaña Bloqueados');
  const generico = await run('generador', 'Consolidar datos web', [{ data: '' }], {
    'Extraer datos de la web': [ext], 'Web: contacto': [{ data: '' }], 'Leer Bloqueados': [{ valor: 'gmail.com' }],
  });
  assert.equal(generico[0].email, 'reformashenares@gmail.com', 'bloquear gmail.com no bloquea a todos los gmail');
});

test('preparar petición Claude: cuerpo válido, caché y herramienta según modelo', async () => {
  const { cons } = await pipelineWeb(leadDental, fx('dental_home.html'), fx('dental_contacto.html'), fx('dental_legal.html'));
  const [p] = await run('generador', 'Preparar petición Claude', [cons], { Config: [cfgGen()] });
  const b = p.anthropic_body;
  assert.equal(b.model, 'claude-sonnet-4-6');
  assert.equal(b.system[0].cache_control.type, 'ephemeral');
  assert.deepEqual(b.tool_choice, { type: 'tool', name: 'registrar_analisis' });
  assert.equal(b.tools[0].input_schema.additionalProperties, false);
  assert.ok(b.temperature === undefined && b.top_p === undefined, 'sin parámetros de muestreo');
  assert.match(b.system[0].text, /Fabio Bernal \| RedesiaNet \| fabiobernaldiaz@gmail\.com/);
  assert.match(b.system[0].text, /20 minutos/);
  assert.match(b.messages[0].content, /email_detectado: sí/);
  assert.match(b.messages[0].content, /cms: WordPress/);
  assert.ok(b.system[0].text.length > 4000, 'prompt de sistema por encima del mínimo cacheable');
  JSON.stringify(b);
  const [p5] = await run('generador', 'Preparar petición Claude', [cons], { Config: [{ ...cfgGen(), modelo_claude: 'claude-sonnet-5-5' }] });
  assert.deepEqual(p5.anthropic_body.tool_choice, { type: 'auto' });
});

function respuestaClaude(input, extra = {}) {
  return {
    id: 'msg_1', type: 'message', role: 'assistant', stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'registrar_analisis', input }], ...extra,
  };
}
const analisisOk = {
  empresa_valida: true, motivo_descarte: '', resumen_empresa: 'Clínica dental familiar en Torrejón.',
  nombre_contacto: 'Laura', pain_point: 'Las citas solo se piden por teléfono en horario de oficina.',
  evidencia: 'La web solo ofrece teléfono de 10 a 20h, sin reserva online ni chat.',
  servicio_propuesto: 'Agentes IA', agente_catalogo: 'Soporte tier 1', plan_sugerido: 'Starter', confianza: 78,
  asunto: 'citas fuera de horario en Sonrisas',
  cuerpo_email: 'Hola, Laura:\n\nHe visto que en Sonrisas las citas se piden solo por teléfono de 10 a 20h.\nCada llamada fuera de horario es un paciente que acaba en otra clínica.\nMontamos un agente que contesta y agenda 24/7 por web y WhatsApp; en otros clientes resuelve el 68% de consultas sin nadie.\n¿Te encaja una llamada de 20 minutos esta semana o la que viene?\n\nUn saludo,\nFabio Bernal | RedesiaNet | fabiobernaldiaz@gmail.com',
  mensaje_dm: 'Hola, soy Fabio, de RedesiaNet. He visto que las citas en Sonrisas van solo por teléfono. ¿Os ayudaría que un agente las agende 24/7?',
};

async function procesar(respuesta, cfg = cfgGen(), lead = { ...leadDental, email: 'info@clinicadentalsonrisas.es', instagram: 'https://www.instagram.com/dentalsonrisas_torrejon/', facebook: '' }) {
  const [p] = await run('generador', 'Procesar respuesta IA', [respuesta], {
    Config: [cfg], 'Preparar petición Claude': [{ ...lead, anthropic_body: { x: 1 } }],
  });
  return p;
}

test('procesar respuesta IA: fila de CRM, firma única y estados', async () => {
  const p = await procesar(respuestaClaude(analisisOk));
  assert.equal(p.estado, 'pendiente_aprobacion');
  assert.equal(p.lead_id, 'K7Q2MX');
  assert.equal((p.cuerpo_email.match(/fabiobernaldiaz@gmail\.com/g) || []).length, 1, 'firma una sola vez');
  assert.match(p.cuerpo_email, /la que viene\?\n\nUn saludo,\nFabio Bernal \| RedesiaNet \| fabiobernaldiaz@gmail\.com\n\nP\. D\./);
  assert.equal(p.anthropic_body, undefined);
  assert.equal(p.servicio_propuesto, 'Agentes IA');
  assert.match(p.resumen_empresa, /Evidencia:/);

  assert.equal((await procesar(respuestaClaude({ ...analisisOk, empresa_valida: false, motivo_descarte: 'franquicia nacional' }))).estado, 'descartado_ia');
  const baja = await procesar(respuestaClaude({ ...analisisOk, confianza: 20 }));
  assert.equal(baja.estado, 'descartado_ia');
  assert.match(baja.motivo_descarte, /confianza baja/);
  const err = await procesar({ error: { message: '401 invalid x-api-key' } });
  assert.equal(err.estado, 'error_ia');
  assert.match(err.motivo_descarte, /401/);
  assert.equal((await procesar({ stop_reason: 'refusal', content: [] })).estado, 'error_ia');
  // modelos 5.x con tool_choice auto: puede venir texto + tool_use
  const auto = await procesar({ stop_reason: 'tool_use', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Analizo.' }, { type: 'tool_use', name: 'registrar_analisis', input: analisisOk }] });
  assert.equal(auto.estado, 'pendiente_aprobacion');
  // sin línea de baja ni despedida
  const sin = await procesar(respuestaClaude(analisisOk), { ...cfgGen(), linea_baja: '', despedida: '' });
  assert.ok(sin.cuerpo_email.endsWith('\n\nFabio Bernal | RedesiaNet | fabiobernaldiaz@gmail.com'));
});

test('mensajes de Telegram del generador: HTML válido e instrucciones de aprobación', async () => {
  const fila = await procesar(respuestaClaude({ ...analisisOk, asunto: 'citas <24h> & más' }));
  const [m] = await run('generador', 'Preparar mensaje Telegram', [fila], { 'Procesar respuesta IA': [fila], Config: [cfgGen()] });
  assertTelegramHtml(m.texto);
  assert.match(m.texto, /fila <code>K7Q2MX<\/code>, pon <b>estado = aprobado<\/b>/);
  assert.ok(!/\/enviar/.test(m.texto), 'ya no se aprueba con comandos de Telegram');
  assert.match(m.texto, /citas &lt;24h&gt; &amp; más/);
  assert.match(m.texto, /<blockquote>/);

  const soloDm = { ...fila, email: '', cuerpo_email: '' };
  const [m2] = await run('generador', 'Preparar mensaje Telegram', [soloDm], { 'Procesar respuesta IA': [soloDm], Config: [cfgGen()] });
  assertTelegramHtml(m2.texto);
  assert.match(m2.texto, /solo se puede contactar por DM/);

  const filas = [fila, { ...fila, estado: 'descartado_ia' }, { ...fila, estado: 'error_ia' }];
  const [r] = await run('generador', 'Resumen del lote', [{}], {
    'Procesar respuesta IA': filas, 'Consolidar datos web': [{}, {}, {}, {}, {}],
    'Elegir búsquedas': [{ consulta: 'dentista en Coslada' }],
  });
  assertTelegramHtml(r.texto);
  assert.match(r.texto, /1 borradores/);
  assert.match(r.texto, /2 sin email ni redes/);
  assert.match(r.texto, /1 con error de IA/);
});

test('fila sin canal y marca de búsquedas', async () => {
  const [f] = await run('generador', 'Preparar fila sin canal', [{ ...leadDental, web_error: '' }]);
  assert.equal(f.estado, 'sin_canal');
  assert.equal(f.telefono, '916 00 00 00');
  const m = await run('generador', 'Preparar marca de búsquedas', [{}], { 'Elegir búsquedas': [{ id: 'B1', veces_ejecutada: 2 }, { id: 'B2' }] });
  assert.deepEqual(m, [{ id: 'B1', ultima_ejecucion: '2026-11-09 09:00', veces_ejecutada: 3 }, { id: 'B2', ultima_ejecucion: '2026-11-09 09:00', veces_ejecutada: 1 }]);
});

// ---------------------------------------------------------------------------
// ENVIADOR
// ---------------------------------------------------------------------------
// El disparador de Google Sheets entrega las filas cuyo "estado" cambió (valores sin formato).
const filaSheet = {
  row_number: 5, lead_id: 'K7Q2MX', estado: 'aprobado', empresa: 'Clínica Dental Sonrisas',
  email: 'info@clinicadentalsonrisas.es', instagram: 'https://www.instagram.com/dentalsonrisas_torrejon/', facebook: '',
  asunto: 'citas fuera de horario', cuerpo_email: 'Hola...', mensaje_dm: 'Hola, soy Fabio <de RedesiaNet>',
  dm_estado: '', rating: 4.7, num_resenas: 120,
};
const aprobados = (filas) => run('enviador', 'Leads aprobados', [{}], { 'Sheet: estado cambiado': filas });

test('leads aprobados: solo "aprobado", sin duplicados y con validación', async () => {
  const out = await aprobados([
    filaSheet,
    { ...filaSheet },                                         // duplicado (dos cambios de la misma fila)
    { ...filaSheet, lead_id: 'ENV123', estado: 'enviado' },   // el propio workflow lo cambió: se ignora
    { ...filaSheet, lead_id: 'PEN123', estado: 'pendiente_aprobacion' },
    { ...filaSheet, lead_id: 'MAY123', estado: ' Aprobado ' }, // mayúsculas y espacios
    { ...filaSheet, lead_id: 'MAL123', email: 'info@@x' },
    { ...filaSheet, lead_id: 'SIN123', asunto: '' },
    { ...filaSheet, lead_id: 'DMS123', email: '', asunto: '', cuerpo_email: '' }, // solo DM: vale
    { ...filaSheet, lead_id: 'NAD123', email: '', instagram: '', facebook: '' },
  ]);
  assert.deepEqual(out.map((o) => [o.lead_id, o.ok]), [
    ['K7Q2MX', true], ['MAY123', true], ['MAL123', false], ['SIN123', false], ['DMS123', true], ['NAD123', false],
  ]);
  assert.equal(out[0].lead.row_number, undefined);
  assert.equal(out[0].lead.rating, '4.7', 'todo a texto');
  assert.match(out[2].error, /no parece válido/);
  assert.match(out[3].error, /falta el asunto/);
  assert.match(out[5].error, /ni Instagram/);
  assert.deepEqual(await aprobados([{ ...filaSheet, estado: 'enviado' }]), [], 'nada que hacer');
});

test('resultado del envío, paquete DM y errores', async () => {
  const [v] = await aprobados([filaSheet]);
  const [env] = await run('enviador', 'Resultado del envío', [{ id: 'm1', threadId: 't1', labelIds: ['SENT'] }], { 'Leads aprobados': [v] });
  assert.deepEqual(
    { estado: env.estado, canal: env.canal_enviado, t: env.gmail_thread_id, dm: env.dm_estado, r: env._hay_redes },
    { estado: 'enviado', canal: 'email+dm', t: 't1', dm: 'pendiente', r: true },
  );
  assertTelegramHtml(env._texto);
  assert.match(env._texto, /Email enviado/);

  const [v2] = await aprobados([{ ...filaSheet, email: '' }]);
  const [sinEmail] = await run('enviador', 'Resultado del envío', [v2], { 'Leads aprobados': [v2] });
  assert.equal(sinEmail.estado, 'dm_pendiente');
  assert.equal(sinEmail.canal_enviado, 'dm');
  assertTelegramHtml(sinEmail._texto);

  const [pq] = await run('enviador', 'Preparar paquete DM', [env], { 'Leads aprobados': [v], Config: [cfgEnv()] });
  assertTelegramHtml(pq.texto);
  assert.match(pq.texto, /https:\/\/ig\.me\/m\/dentalsonrisas_torrejon/);
  assert.match(pq.texto, /<pre>Hola, soy Fabio &lt;de RedesiaNet&gt;<\/pre>/);
  assert.match(pq.texto, /dm_estado = enviado/);

  // error de Gmail (llega {error: 'mensaje'}) y error de validación (llega el item con lead)
  const [er] = await run('enviador', 'Preparar error', [{ error: 'Invalid To header' }], { 'Leads aprobados': [v] });
  assert.equal(er.estado, 'error_envio');
  assert.equal(er.motivo_descarte, 'Gmail: Invalid To header');
  assertTelegramHtml(er._texto);
  const [er2] = await run('enviador', 'Preparar error', [{ ...v, error: 'Invalid To header' }], { 'Leads aprobados': [v] });
  assert.equal(er2.motivo_descarte, 'Gmail: Invalid To header', 'error de Gmail que conserva el item original');
  const [mal] = await aprobados([{ ...filaSheet, email: 'info@@x' }]);
  const [ev] = await run('enviador', 'Preparar error', [mal], { 'Leads aprobados': [mal] });
  assert.match(ev.motivo_descarte, /^No enviado: el email/);
  assert.match(ev._texto, /estado = aprobado/);
});

// ---------------------------------------------------------------------------
// RESPUESTAS
// ---------------------------------------------------------------------------
test('emparejar respuestas y clasificar', async () => {
  const leads = [
    { lead_id: 'K7Q2MX', empresa: 'Sonrisas', email: 'info@clinicadentalsonrisas.es', estado: 'enviado', gmail_thread_id: 't1', fecha_envio: '2026-11-09 10:00' },
    { lead_id: 'B2', empresa: 'Taller', email: 'taller@gmail.com', estado: 'enviado', gmail_thread_id: 't2', fecha_envio: '2026-11-09 10:00' },
    { lead_id: 'C3', empresa: 'No enviado', email: 'otro@x.es', estado: 'pendiente_aprobacion' },
  ];
  const correos = [
    { id: 'a', threadId: 't1', From: 'Laura <laura@clinicadentalsonrisas.es>', Subject: 'Re: citas', snippet: 'Hola Fabio, el jueves a las 12 me va bien' },
    { id: 'b', threadId: 'zz', From: 'taller@gmail.com', Subject: 'RE: hola', snippet: 'No me interesa, gracias' },
    { id: 'c', threadId: 'yy', From: 'otro@x.es', Subject: 'Re: algo', snippet: 'no debería emparejar' },
    { id: 'd', threadId: 'qq', From: 'newsletter@tienda.com', Subject: 'Re: oferta', snippet: 'spam' },
  ];
  const out = await run('respuestas', 'Emparejar con leads', leads, { 'Gmail: respuestas': correos });
  assert.deepEqual(out.map((o) => o.lead_id), ['K7Q2MX', 'B2']);
  assert.equal(out[0].de, 'laura@clinicadentalsonrisas.es');

  const cfgR = WF.respuestas.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments.reduce((o, a) => ({ ...o, [a.name]: a.value }), {});
  const [prep] = await run('respuestas', 'Preparar clasificación', [out[0]], { Config: [cfgR] });
  assert.equal(prep.anthropic_body.tool_choice.name, 'clasificar_respuesta');

  const resp = { content: [{ type: 'tool_use', name: 'clasificar_respuesta', input: { clasificacion: 'interesado', resumen: 'Propone el jueves a las 12' } }] };
  const [c] = await run('respuestas', 'Procesar clasificación', [resp], { 'Preparar clasificación': [prep] });
  assert.equal(c.estado, 'respondido');
  assert.equal(c.clasificacion_respuesta, 'interesado');
  assertTelegramHtml(c._texto);
  assert.match(c._texto, /mail\.google\.com\/mail\/u\/0\/#inbox\/t1/);

  const baja = { content: [{ type: 'tool_use', name: 'clasificar_respuesta', input: { clasificacion: 'baja', resumen: 'Pide no recibir más' } }] };
  const [cb] = await run('respuestas', 'Procesar clasificación', [baja], { 'Preparar clasificación': [prep] });
  assert.equal(cb.estado, 'baja');
  assert.equal(cb._baja, true);
  const [fb] = await run('respuestas', 'Fila Bloqueados', [cb], { 'Procesar clasificación': [cb] });
  assert.equal(fb.valor, 'info@clinicadentalsonrisas.es');

  const [ce] = await run('respuestas', 'Procesar clasificación', [{ error: { message: 'timeout' } }], { 'Preparar clasificación': [prep] });
  assert.equal(ce.clasificacion_respuesta, 'sin_clasificar');
  assert.equal(ce.estado, 'respondido');
});

// ---------------------------------------------------------------------------
// ESTRUCTURA DE LOS WORKFLOWS
// ---------------------------------------------------------------------------
test('estructura: conexiones válidas, credenciales y columnas del CRM', () => {
  const columnas = fs.readFileSync(path.join(ROOT, 'sheets', 'build_sheet.py'), 'utf8').match(/\("([a-z_]+)", \d+\)/g).map((s) => s.match(/"([a-z_]+)"/)[1]);
  for (const [k, w] of Object.entries(WF)) {
    const names = new Set(w.nodes.map((n) => n.name));
    for (const [src, c] of Object.entries(w.connections)) {
      assert.ok(names.has(src), `${k}: ${src}`);
      c.main.flat().forEach((l) => assert.ok(names.has(l.node), `${k}: ${l.node}`));
    }
    for (const n of w.nodes) {
      if (n.type === 'n8n-nodes-base.googleSheets') {
        assert.equal(n.parameters.documentId.value, '1-l1Axsib6LDIm6TDv07FCAO13vpuQe_7240CvW3BPfk');
        assert.ok(n.credentials.googleSheetsOAuth2Api.name);
      }
      if (n.type === 'n8n-nodes-base.telegram' && n.parameters.operation === 'sendMessage') {
        assert.equal(n.parameters.additionalFields.appendAttribution, false, `${n.name} sin firma de n8n`);
      }
      if (n.type === 'n8n-nodes-base.gmail') assert.equal(n.parameters.options.appendAttribution, false);
    }
  }
  // Las filas que se escriben en Leads solo usan columnas existentes
  const escritos = ['K7Q2MX'];
  assert.ok(escritos.length);
  return procesar(respuestaClaude(analisisOk)).then((fila) => {
    for (const key of Object.keys(fila)) assert.ok(columnas.includes(key), `columna inexistente en Leads: ${key}`);
  });
});
