"""Prueba E2E en un n8n local (ver README, sección Desarrollo).

Uso: python3 tests/e2e_make_variants.py <carpeta_salida>

Crea variantes de prueba de los workflows sustituyendo SOLO los servicios
externos por nodos Code con datos fijos. Lógica, IF/Switch y expresiones se
mantienen tal cual."""
import json, sys, copy
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1])
FX = REPO / 'tests' / 'fixtures'


def stub(node, js, per_item=False):
    n = {k: v for k, v in node.items() if k in ('id', 'name', 'position', 'executeOnce', 'alwaysOutputData')}
    n['type'] = 'n8n-nodes-base.code'
    n['typeVersion'] = 2
    n['parameters'] = {'jsCode': js}
    if per_item:
        n['parameters']['mode'] = 'runOnceForEachItem'
    return n


def passthrough(node):
    if node['type'] == 'n8n-nodes-base.telegram':
        # Evalúa las MISMAS expresiones que el nodo Telegram real
        p = node['parameters']
        fields = {k: p[k] for k in ('chatId', 'text', 'queryId') if k in p}
        for i, row in enumerate(p.get('inlineKeyboard', {}).get('rows', [])):
            for j, b in enumerate(row['row']['buttons']):
                fields[f'boton_{i}_{j}'] = b['additionalFields']['callback_data']
        n = {k: v for k, v in node.items() if k in ('id', 'name', 'position')}
        n.update({'type': 'n8n-nodes-base.set', 'typeVersion': 3.4, 'parameters': {
            'mode': 'manual', 'includeOtherFields': False, 'options': {},
            'assignments': {'assignments': [{'id': k, 'name': k, 'value': v, 'type': 'string'} for k, v in fields.items()]}}})
        return n
    return stub(node, 'return $input.all();')


def gen():
    wf = json.loads((REPO / 'n8n/workflow_generador.json').read_text())
    html = {
        'https://www.clinicadentalsonrisas.es/': (FX / 'dental_home.html').read_text(),
        'https://clinicadentalsonrisas.es/contacto/': (FX / 'dental_contacto.html').read_text(),
        'https://www.clinicadentalsonrisas.es/aviso-legal/': (FX / 'dental_legal.html').read_text(),
        'https://reformashenares.es/': (FX / 'reformas_home.html').read_text(),
    }
    places = {'places': [
        {'id': 'P1', 'displayName': {'text': 'Clínica Dental Sonrisas'}, 'websiteUri': 'https://www.clinicadentalsonrisas.es/', 'nationalPhoneNumber': '916 00 00 00', 'rating': 4.7, 'userRatingCount': 120, 'businessStatus': 'OPERATIONAL', 'formattedAddress': 'C. Mayor 10, Torrejón', 'googleMapsUri': 'https://maps.google.com/?cid=1', 'primaryTypeDisplayName': {'text': 'Dentista'}},
        {'id': 'P2', 'displayName': {'text': 'Web caída SL'}, 'websiteUri': 'https://webcaida.es/', 'businessStatus': 'OPERATIONAL'},
        {'id': 'P3', 'displayName': {'text': 'Reformas Henares'}, 'websiteUri': 'https://reformashenares.es/', 'businessStatus': 'OPERATIONAL'},
    ]}
    tool = {'empresa_valida': True, 'motivo_descarte': '', 'resumen_empresa': 'Clínica dental.', 'nombre_contacto': '', 'pain_point': 'Citas solo por teléfono.', 'evidencia': 'Sin reserva online.', 'servicio_propuesto': 'Agentes IA', 'agente_catalogo': 'Soporte tier 1', 'plan_sugerido': 'Starter', 'confianza': 80, 'asunto': 'citas fuera de horario', 'cuerpo_email': 'Hola,\n\nLínea 1.\nLínea 2.\n¿Te encaja una llamada de 20 minutos?', 'mensaje_dm': 'Hola, soy Fabio, de RedesiaNet.'}
    nodes = []
    for n in wf['nodes']:
        name = n['name']
        if name == 'Cada día laborable 9:00':
            continue
        if name == 'Leer Leads':
            n = stub(n, "return [{json: {lead_id: 'ZZZZZZ', place_id: 'PX', web: 'https://otra.es'}}];")
        elif name == 'Leer Bloqueados':
            n = stub(n, "return [{json: {valor: 'redesianet.com'}}];")
        elif name == 'Leer Búsquedas':
            n = stub(n, "return [{json:{id:'B001',activa:'SI',sector:'Salud · Dental',zona:'Torrejón de Ardoz',consulta:'clínica dental en Torrejón de Ardoz',ultima_ejecucion:'',veces_ejecutada:0}},{json:{id:'B002',activa:'NO',sector:'x',zona:'y',consulta:'z'}}];")
        elif name == 'Google Places: buscar':
            n = stub(n, f"return {{json: {json.dumps(places)}}};", per_item=True)
        elif name.startswith('Web: '):
            expr = n['parameters']['url'].strip('={} ')
            js = f"const H = {json.dumps(html)};\nconst url = {expr};\nif (url.includes('webcaida')) return {{json: {{error: {{message: 'getaddrinfo ENOTFOUND webcaida.es'}}}}}};\nreturn {{json: {{data: H[url] || ''}}}};"
            n = stub(n, js, per_item=True)
        elif name == 'Claude: analizar y redactar':
            js = ("const b = $json.anthropic_body; if (!b || !b.tools || b.messages[0].role !== 'user') throw new Error('body mal formado');\n"
                  f"return {{json: {{stop_reason: 'tool_use', content: [{{type: 'tool_use', name: 'registrar_analisis', input: {json.dumps(tool)}}}]}}}};")
            n = stub(n, js, per_item=True)
        elif n['type'] in ('n8n-nodes-base.googleSheets', 'n8n-nodes-base.telegram'):
            n = passthrough(n)
        nodes.append(n)
    wf['nodes'] = nodes
    wf['connections'].pop('Cada día laborable 9:00', None)
    wf['name'] = 'E2E generador'
    return wf


def env(update, lead_row, gmail_fails=False):
    wf = json.loads((REPO / 'n8n/workflow_enviador.json').read_text())
    nodes = [{'id': 'start', 'name': 'Inicio', 'type': 'n8n-nodes-base.manualTrigger', 'typeVersion': 1, 'position': [-200, 0], 'parameters': {}}]
    for n in wf['nodes']:
        name = n['name']
        if name == 'Telegram: órdenes':
            n = stub(n, f"return [{{json: {json.dumps(update)}}}];")
        elif name in ('Buscar lead', 'Leer CRM'):
            n = stub(n, f"return [{{json: {json.dumps(lead_row)}}}];")
        elif name == 'Gmail: enviar email':
            if gmail_fails:
                n = stub(n, "throw new Error('Invalid To header');")
                n['onError'] = 'continueErrorOutput'
            else:
                n = stub(n, "if (!$json.lead.email || !$json.lead.cuerpo_email) throw new Error('faltan datos'); return {json: {id: 'm1', threadId: 't1', labelIds: ['SENT']}};", per_item=True)
        elif n['type'] in ('n8n-nodes-base.googleSheets', 'n8n-nodes-base.telegram'):
            n = passthrough(n)
        nodes.append(n)
    wf['nodes'] = nodes
    wf['connections']['Inicio'] = {'main': [[{'node': 'Telegram: órdenes', 'type': 'main', 'index': 0}]]}
    return wf


lead = {'row_number': 2, 'lead_id': 'K7Q2MX', 'estado': 'pendiente_aprobacion', 'empresa': 'Clínica Dental Sonrisas', 'email': 'info@clinicadentalsonrisas.es', 'instagram': 'https://www.instagram.com/dentalsonrisas_torrejon/', 'facebook': '', 'asunto': 'citas', 'cuerpo_email': 'Hola...', 'mensaje_dm': 'Hola, soy Fabio', 'dm_estado': ''}
boton = lambda d: {'update_id': 1, 'callback_query': {'id': 'cb1', 'data': d, 'message': {'chat': {'id': 5246096132}}}}
texto = lambda t: {'update_id': 1, 'message': {'chat': {'id': 5246096132}, 'text': t}}

OUT.mkdir(parents=True, exist_ok=True)
cases = {
    'gen': gen(),
    'env_enviar': env(boton('enviar:K7Q2MX'), lead),
    'env_enviar_sin_email': env(texto('/enviar K7Q2MX'), {**lead, 'email': ''}),
    'env_gmail_falla': env(texto('/enviar K7Q2MX'), lead, gmail_fails=True),
    'env_rechazar': env(texto('/rechazar k7q2mx'), lead),
    'env_doble_envio': env(texto('/enviar K7Q2MX'), {**lead, 'estado': 'enviado'}),
    'env_dm_ok': env(boton('dm_ok:K7Q2MX'), {**lead, 'estado': 'dm_pendiente', 'dm_estado': 'pendiente'}),
    'env_pendientes': env(texto('/pendientes'), lead),
    'env_ayuda': env(texto('hola'), lead),
}
for i, (k, w) in enumerate(cases.items()):
    w['name'] = 'E2E ' + k
    w['id'] = f'e2e{i:04d}AAAAAAAAAA'[:16]
    (OUT / f'{k}.json').write_text(json.dumps(w, ensure_ascii=False))
    print(k, w['id'])


def resp():
    wf = json.loads((REPO / 'n8n/workflow_respuestas.json').read_text())
    correos = [
        {'id': 'a', 'threadId': 't1', 'From': 'Laura <laura@clinicadentalsonrisas.es>', 'Subject': 'Re: citas', 'snippet': 'Me interesa, ¿el jueves a las 12?'},
        {'id': 'b', 'threadId': 't9', 'From': 'spam@tienda.com', 'Subject': 'Re: oferta', 'snippet': 'x'},
        {'id': 'c', 'threadId': 't2', 'From': 'taller@gmail.com', 'Subject': 'RE: hola', 'snippet': 'Por favor, no me escribáis más'},
    ]
    leads = [
        {'lead_id': 'K7Q2MX', 'empresa': 'Sonrisas', 'email': 'info@clinicadentalsonrisas.es', 'estado': 'enviado', 'gmail_thread_id': 't1', 'fecha_envio': '2026-11-09 10:00'},
        {'lead_id': 'B2B2B2', 'empresa': 'Taller', 'email': 'taller@gmail.com', 'estado': 'enviado', 'gmail_thread_id': 't2', 'fecha_envio': '2026-11-09 10:00'},
    ]
    nodes = [{'id': 'start', 'name': 'Inicio', 'type': 'n8n-nodes-base.manualTrigger', 'typeVersion': 1, 'position': [-200, 0], 'parameters': {}}]
    for n in wf['nodes']:
        name = n['name']
        if name == 'Gmail: respuestas':
            n = stub(n, f"return {json.dumps([{'json': c} for c in correos])};")
        elif name == 'Leer Leads':
            n = stub(n, f"return {json.dumps([{'json': l} for l in leads])};")
        elif name == 'Claude: clasificar':
            n = stub(n, "const c = $json.anthropic_body.messages[0].content.includes('no me escrib') ? 'baja' : 'interesado';\nreturn {json: {content: [{type: 'tool_use', name: 'clasificar_respuesta', input: {clasificacion: c, resumen: 'resumen ' + c}}]}};", per_item=True)
        elif n['type'] in ('n8n-nodes-base.googleSheets', 'n8n-nodes-base.telegram'):
            n = passthrough(n)
        nodes.append(n)
    wf['nodes'] = nodes
    wf['connections']['Inicio'] = {'main': [[{'node': 'Gmail: respuestas', 'type': 'main', 'index': 0}]]}
    wf['name'] = 'E2E resp'
    wf['id'] = 'e2e0009AAAAAAAAA'
    (OUT / 'resp.json').write_text(json.dumps(wf, ensure_ascii=False))
    print('resp', wf['id'])


resp()
