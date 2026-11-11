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


def env(filas, gmail_falla_para=''):
    """Enviador: el disparador de Sheets se sustituye por las filas dadas."""
    wf = json.loads((REPO / 'n8n/workflow_enviador.json').read_text())
    nodes = [{'id': 'start', 'name': 'Inicio', 'type': 'n8n-nodes-base.manualTrigger', 'typeVersion': 1, 'position': [-200, 0], 'parameters': {}}]
    for n in wf['nodes']:
        name = n['name']
        if name == 'Sheet: estado cambiado':
            n = stub(n, f"return {json.dumps([{'json': f} for f in filas])};")
        elif name == 'Gmail: enviar email':
            js = (f"if ($json.lead.email.includes({json.dumps(gmail_falla_para or '@@nunca@@')})) throw new Error('Invalid To header');\n"
                  "if (!$json.lead.asunto || !$json.lead.cuerpo_email) throw new Error('faltan datos');\n"
                  "return {json: {id: 'm-' + $json.lead_id, threadId: 't-' + $json.lead_id, labelIds: ['SENT']}};")
            n = stub(n, js, per_item=True)
            n['onError'] = 'continueErrorOutput'
        elif n['type'] in ('n8n-nodes-base.googleSheets', 'n8n-nodes-base.telegram'):
            n = passthrough(n)
        nodes.append(n)
    wf['nodes'] = nodes
    wf['connections']['Inicio'] = {'main': [[{'node': 'Sheet: estado cambiado', 'type': 'main', 'index': 0}]]}
    return wf


fila = {'row_number': 2, 'lead_id': 'K7Q2MX', 'estado': 'aprobado', 'empresa': 'Clínica Dental Sonrisas', 'email': 'info@clinicadentalsonrisas.es', 'instagram': 'https://www.instagram.com/dentalsonrisas_torrejon/', 'facebook': '', 'asunto': 'citas', 'cuerpo_email': 'Hola...', 'mensaje_dm': 'Hola, soy Fabio', 'dm_estado': ''}

OUT.mkdir(parents=True, exist_ok=True)
cases = {
    'gen': gen(),
    # 3 aprobados a la vez + 1 fila que el propio workflow puso en "enviado" (se ignora)
    'env_lote': env([
        fila,
        {**fila, 'row_number': 3, 'lead_id': 'DMSOLO', 'empresa': 'Reformas Henares', 'email': '', 'asunto': '', 'cuerpo_email': ''},
        {**fila, 'row_number': 4, 'lead_id': 'MALEMA', 'empresa': 'Taller Mal', 'email': 'info@@x'},
        {**fila, 'row_number': 5, 'lead_id': 'YAENVI', 'estado': 'enviado'},
    ]),
    'env_gmail_falla': env([{**fila, 'email': 'rebota@nadie.es'}], gmail_falla_para='rebota'),
    'env_nada': env([{**fila, 'estado': 'enviado'}]),
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
