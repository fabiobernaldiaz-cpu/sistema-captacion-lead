"""Compila los 3 workflows de n8n a partir del código de src/code/.

Uso:  python3 src/build_workflows.py
Salida: n8n/workflow_generador.json, n8n/workflow_enviador.json, n8n/workflow_respuestas.json

El JavaScript de cada nodo Code vive en src/code/<workflow>/<nodo>.js para poder
probarlo fuera de n8n (tests/). Las líneas `// @include common/x.js` se sustituyen
por el contenido de ese fichero al compilar.
"""
import json
import re
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CODE = ROOT / "src" / "code"
OUT = ROOT / "n8n"

# --- Datos fijos del sistema --------------------------------------------------
SHEET_ID = "1-l1Axsib6LDIm6TDv07FCAO13vpuQe_7240CvW3BPfk"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit"
TELEGRAM_CHAT_ID = "5246096132"
MODELO = "claude-sonnet-4-6"
ANTHROPIC_VERSION = "2026-10-21"

# Credenciales: n8n las enlaza por NOMBRE + tipo al importar si el id no existe.
# Crea las credenciales con estos nombres exactos antes de importar.
CRED = {
    "sheets": {"googleSheetsOAuth2Api": {"id": "cred-google-sheets", "name": "Google Sheets RedesiaNet"}},
    "gmail": {"gmailOAuth2": {"id": "cred-gmail", "name": "Gmail Fabio"}},
    "telegram": {"telegramApi": {"id": "cred-telegram", "name": "Telegram Bot Captación"}},
    "anthropic": {"httpHeaderAuth": {"id": "cred-anthropic", "name": "Anthropic API Key"}},
    "places": {"httpHeaderAuth": {"id": "cred-google-places", "name": "Google Places API Key"}},
}

SERVICIOS = """- Agentes IA: agentes que atienden, cualifican y responden por la empresa 24/7 (web, WhatsApp, email) y escriben en su CRM o ERP; escalan a una persona cuando dudan.
- Automatizaciones n8n: conectan las herramientas que ya usan (formularios, email, hojas de cálculo, CRM, facturación) para eliminar tareas manuales repetitivas.
- SEO: posicionamiento local y en Google para que les encuentren los clientes que ya buscan lo que venden.
- Email marketing: campañas y secuencias automáticas que reactivan clientes y convierten contactos en ventas.
- Seguridad IA: uso seguro de la IA en la empresa (datos, accesos, RGPD) para adoptarla sin riesgos.
Siempre con una primera auditoría gratuita y sin permanencia (cancelación con 30 días de aviso)."""

PLANES = """- Starter: 890 €/mes. Un servicio o un agente para empezar. Encaja con pymes pequeñas.
- Transformación Total: 9.890 €/mes. Varios agentes, automatizaciones y SEO coordinados para toda la empresa.
(Entre ambos hay planes intermedios según el número de servicios.)"""

AGENTES = """- Cualificador de leads: investiga, puntúa y enruta cada lead en menos de 1 minuto · 3,4× conversión
- Router de emails: clasifica la bandeja compartida y responde lo rutinario · −78% de bandeja, 4 h/día ahorradas
- Soporte tier 1: resuelve el 68% de las consultas sin humano, 24/7, en 6 idiomas
- Optimizador SEO: audita, prioriza y redacta meta tags; el cliente aprueba cada cambio · +47% de tráfico en 6 semanas
- Captura de facturas: lee PDFs, valida IVA y NIF y escribe en el ERP · −92% de tiempo
- Generador de reportes: informe semanal de KPIs automático · 14 h/semana ahorradas
- Onboarding de clientes: acompaña los primeros 30 días · −34% de bajas a los 90 días
- Prospector outbound: investiga cuentas y redacta el primer mensaje · 2,8× respuestas"""

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
PLACES_FIELDS = ",".join([
    "places.id", "places.displayName", "places.formattedAddress", "places.nationalPhoneNumber",
    "places.internationalPhoneNumber", "places.websiteUri", "places.primaryTypeDisplayName",
    "places.rating", "places.userRatingCount", "places.googleMapsUri", "places.businessStatus",
])


# --- Utilidades de construcción -----------------------------------------------
def uid(*parts):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "redesianet/" + "/".join(parts)))


def load_code(rel):
    src = (CODE / rel).read_text(encoding="utf-8")

    def repl(m):
        return (CODE / m.group(1)).read_text(encoding="utf-8").rstrip() + "\n"

    return re.sub(r"^// @include (\S+)\s*$", repl, src, flags=re.M)


class WF:
    def __init__(self, key, name):
        self.key = key
        self.name = name
        self.nodes = []
        self.connections = {}

    def add(self, name, type_, version, params, pos, **extra):
        node = {
            "parameters": params,
            "id": uid(self.key, name),
            "name": name,
            "type": type_,
            "typeVersion": version,
            "position": list(pos),
        }
        node.update(extra)
        self.nodes.append(node)
        return name

    def link(self, src, dst, out=0, inp=0):
        main = self.connections.setdefault(src, {"main": []})["main"]
        while len(main) <= out:
            main.append([])
        main[out].append({"node": dst, "type": "main", "index": inp})

    def chain(self, *names):
        for a, b in zip(names, names[1:]):
            self.link(a, b)

    def note(self, name, content, pos, w=480, h=300, color=7):
        self.add(name, "n8n-nodes-base.stickyNote", 1,
                 {"content": content, "height": h, "width": w, "color": color}, pos)

    def to_json(self):
        names = {n["name"] for n in self.nodes}
        assert len(names) == len(self.nodes), "nombres de nodo duplicados"
        for src, c in self.connections.items():
            assert src in names, src
            for outs in c["main"]:
                for l in outs:
                    assert l["node"] in names, l["node"]
        return {
            "name": self.name,
            "nodes": self.nodes,
            "connections": self.connections,
            "pinData": {},
            "settings": {
                "executionOrder": "v1",
                "timezone": "Europe/Madrid",
                "saveManualExecutions": True,
                "callerPolicy": "workflowsFromSameOwner",
            },
            "active": False,
            "meta": {"templateCredsSetupCompleted": False},
        }


def code(wf, name, rel, pos, per_item=False, **extra):
    params = {"jsCode": load_code(rel)}
    if per_item:
        params["mode"] = "runOnceForEachItem"
    return wf.add(name, "n8n-nodes-base.code", 2, params, pos, **extra)


def config(wf, pos, fields):
    assignments = []
    for k, v in fields.items():
        t = "number" if isinstance(v, (int, float)) and not isinstance(v, bool) else "string"
        assignments.append({"id": uid(wf.key, "cfg", k), "name": k, "value": v, "type": t})
    return wf.add("Config", "n8n-nodes-base.set", 3.4,
                  {"mode": "manual", "assignments": {"assignments": assignments},
                   "includeOtherFields": False, "options": {}}, pos,
                  notesInFlow=True, notes="Edita aquí los ajustes")


def _doc():
    return {"__rl": True, "value": SHEET_ID, "mode": "id",
            "cachedResultUrl": SHEET_URL, "cachedResultName": "CRM Captación B2B · RedesiaNet"}


def _tab(t):
    return {"__rl": True, "value": t, "mode": "name"}


def sheets_read(wf, name, tab, pos, filters=None, once=True):
    params = {"operation": "read", "documentId": _doc(), "sheetName": _tab(tab), "options": {}}
    if filters:
        params["filtersUI"] = {"values": [{"lookupColumn": c, "lookupValue": v} for c, v in filters]}
    extra = {"alwaysOutputData": True, "credentials": CRED["sheets"]}
    if once:
        extra["executeOnce"] = True
    return wf.add(name, "n8n-nodes-base.googleSheets", 4.7, params, pos, **extra)


def sheets_write(wf, name, tab, pos, op="append", match=None):
    columns = {"mappingMode": "autoMapInputData", "value": {}, "matchingColumns": match or [],
               "schema": [], "attemptToConvertTypes": False, "convertFieldsToString": False}
    params = {"operation": op, "documentId": _doc(), "sheetName": _tab(tab), "columns": columns,
              "options": {"cellFormat": "RAW", "handlingExtraData": "ignoreIt"}}
    return wf.add(name, "n8n-nodes-base.googleSheets", 4.7, params, pos, credentials=CRED["sheets"])


def telegram_send(wf, name, pos, text="={{ $json.texto }}", buttons=None, **extra):
    params = {
        "resource": "message",
        "operation": "sendMessage",
        "chatId": "={{ $('Config').first().json.telegram_chat_id }}",
        "text": text,
        "additionalFields": {"appendAttribution": False, "parse_mode": "HTML", "disable_web_page_preview": True},
    }
    if buttons:
        params["replyMarkup"] = "inlineKeyboard"
        params["inlineKeyboard"] = {"rows": [
            {"row": {"buttons": [{"text": t, "additionalFields": {"callback_data": d}} for t, d in row]}}
            for row in buttons
        ]}
    return wf.add(name, "n8n-nodes-base.telegram", 1.2, params, pos, credentials=CRED["telegram"], **extra)


def cond(left, op_type, operation, right="", single=False):
    c = {"id": uid("cond", left, operation, str(right)), "leftValue": left, "rightValue": right,
         "operator": {"type": op_type, "operation": operation}}
    if single:
        c["operator"]["singleValue"] = True
    return c


def conditions(*conds):
    return {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
            "conditions": list(conds), "combinator": "and"}


def if_node(wf, name, pos, *conds):
    return wf.add(name, "n8n-nodes-base.if", 2.2,
                  {"conditions": conditions(*conds), "looseTypeValidation": True, "options": {}}, pos)


def switch_node(wf, name, pos, rules, fallback=None):
    values = [{"conditions": conditions(c), "renameOutput": True, "outputKey": key} for key, c in rules]
    options = {}
    if fallback:
        options = {"fallbackOutput": "extra", "renameFallbackOutput": fallback}
    return wf.add(name, "n8n-nodes-base.switch", 3.2,
                  {"rules": {"values": values}, "looseTypeValidation": True, "options": options}, pos)


def http_anthropic(wf, name, pos):
    return wf.add(name, "n8n-nodes-base.httpRequest", 4.2, {
        "method": "POST",
        "url": "https://api.anthropic.com/v1/messages",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": True,
        "headerParameters": {"parameters": [{"name": "anthropic-version", "value": ANTHROPIC_VERSION}]},
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify($json.anthropic_body) }}",
        "options": {"timeout": 120000, "batching": {"batch": {"batchSize": 1, "batchInterval": 1000}}},
    }, pos, credentials=CRED["anthropic"], retryOnFail=True, maxTries=3, waitBetweenTries=5000,
        onError="continueRegularOutput")


def http_web(wf, name, url_expr, pos):
    return wf.add(name, "n8n-nodes-base.httpRequest", 4.2, {
        "url": url_expr,
        "sendHeaders": True,
        "headerParameters": {"parameters": [
            {"name": "User-Agent", "value": UA},
            {"name": "Accept-Language", "value": "es-ES,es;q=0.9"},
        ]},
        "options": {
            "allowUnauthorizedCerts": True,
            "timeout": 15000,
            "batching": {"batch": {"batchSize": 5, "batchInterval": 300}},
            "response": {"response": {"neverError": True, "responseFormat": "text", "outputPropertyName": "data"}},
        },
    }, pos, onError="continueRegularOutput")


# =============================================================================
# 1) GENERADOR
# =============================================================================
def build_generador():
    wf = WF("generador", "RedesiaNet · 1 · Generador de leads (Maps → IA → Telegram)")
    wf.note("Nota", (
        "## Generador de leads\n"
        "Lunes a viernes a las 9:00 busca pymes en Google Maps (pestaña **Busquedas**), "
        "lee su web, Claude elige dolor + servicio y redacta email y DM, guarda todo en el CRM "
        "y te manda cada borrador a Telegram para aprobar.\n\n"
        "**Ajustes:** nodo *Config*.\n**No envía nada**: el envío lo hace el workflow 2 cuando pulsas Enviar."
    ), (-40, -520), w=520, h=260, color=5)

    wf.add("Cada día laborable 9:00", "n8n-nodes-base.scheduleTrigger", 1.2,
           {"rule": {"interval": [{"field": "cronExpression", "expression": "0 9 * * 1-5"}]}}, (0, 0))
    wf.add("Ejecutar manualmente", "n8n-nodes-base.manualTrigger", 1, {}, (0, 200))
    config(wf, (240, 100), {
        "modelo_claude": MODELO,
        "max_leads_por_ejecucion": 15,
        "busquedas_por_ejecucion": 3,
        "confianza_minima": 40,
        "telegram_chat_id": TELEGRAM_CHAT_ID,
        "sheet_url": SHEET_URL,
        "nombre_remitente": "Fabio Bernal",
        "despedida": "Un saludo,",
        "firma": "Fabio Bernal | RedesiaNet | fabiobernaldiaz@gmail.com",
        "linea_baja": "P. D.: Si prefieres que no te vuelva a escribir, responde «baja» y no lo haré.",
        "servicios_redesianet": SERVICIOS,
        "planes": PLANES,
        "agentes_catalogo": AGENTES,
    })
    wf.link("Cada día laborable 9:00", "Config")
    wf.link("Ejecutar manualmente", "Config")

    sheets_read(wf, "Leer Leads", "Leads", (480, 100))
    sheets_read(wf, "Leer Bloqueados", "Bloqueados", (720, 100))
    sheets_read(wf, "Leer Búsquedas", "Busquedas", (960, 100))
    code(wf, "Elegir búsquedas", "generador/elegir_busquedas.js", (1200, 100))
    wf.chain("Config", "Leer Leads", "Leer Bloqueados", "Leer Búsquedas", "Elegir búsquedas")

    wf.add("Google Places: buscar", "n8n-nodes-base.httpRequest", 4.2, {
        "method": "POST",
        "url": "https://places.googleapis.com/v1/places:searchText",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": True,
        "headerParameters": {"parameters": [{"name": "X-Goog-FieldMask", "value": PLACES_FIELDS}]},
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ textQuery: $json.consulta, languageCode: 'es', regionCode: 'ES', pageSize: 20 }) }}",
        "options": {"timeout": 30000},
    }, (1440, 0), credentials=CRED["places"], retryOnFail=True, maxTries=2, waitBetweenTries=3000,
        onError="continueRegularOutput")
    code(wf, "Filtrar y deduplicar", "generador/filtrar_deduplicar.js", (1680, 0))
    http_web(wf, "Web: inicio", "={{ $json.web }}", (1920, 0))
    code(wf, "Extraer datos de la web", "generador/extraer_home.js", (2160, 0), per_item=True)
    http_web(wf, "Web: contacto", "={{ $json.contacto_url }}", (2400, 0))
    http_web(wf, "Web: aviso legal", "={{ $('Extraer datos de la web').item.json.legal_url }}", (2640, 0))
    code(wf, "Consolidar datos web", "generador/consolidar_web.js", (2880, 0), per_item=True)
    if_node(wf, "¿Tiene email o redes?", (3120, 0),
            cond("={{ $json.tiene_canal }}", "boolean", "true", single=True))
    wf.chain("Elegir búsquedas", "Google Places: buscar", "Filtrar y deduplicar", "Web: inicio",
             "Extraer datos de la web", "Web: contacto", "Web: aviso legal", "Consolidar datos web",
             "¿Tiene email o redes?")

    code(wf, "Preparar petición Claude", "generador/preparar_claude.js", (3360, -100), per_item=True)
    http_anthropic(wf, "Claude: analizar y redactar", (3600, -100))
    code(wf, "Procesar respuesta IA", "generador/procesar_ia.js", (3840, -100), per_item=True)
    sheets_write(wf, "Guardar en CRM", "Leads", (4080, -100))
    wf.link("¿Tiene email o redes?", "Preparar petición Claude", out=0)
    wf.chain("Preparar petición Claude", "Claude: analizar y redactar", "Procesar respuesta IA", "Guardar en CRM")

    code(wf, "Resumen del lote", "generador/resumen_lote.js", (4320, -300), executeOnce=True)
    telegram_send(wf, "Telegram: resumen", (4560, -300))
    wf.chain("Guardar en CRM", "Resumen del lote", "Telegram: resumen")

    if_node(wf, "¿Pendiente de aprobación?", (4320, -100),
            cond("={{ $('Procesar respuesta IA').item.json.estado }}", "string", "equals", "pendiente_aprobacion"))
    code(wf, "Preparar mensaje Telegram", "generador/mensaje_telegram.js", (4560, -120), per_item=True)
    telegram_send(wf, "Telegram: borrador", (4800, -120), buttons=[[
        ("✅ Enviar", "=enviar:{{ $json.lead_id }}"),
        ("❌ Rechazar", "=rechazar:{{ $json.lead_id }}"),
    ]])
    wf.link("Guardar en CRM", "¿Pendiente de aprobación?")
    wf.chain("¿Pendiente de aprobación?", "Preparar mensaje Telegram", "Telegram: borrador")

    code(wf, "Preparar fila sin canal", "generador/fila_sin_canal.js", (3360, 220), per_item=True)
    sheets_write(wf, "Guardar sin canal", "Leads", (3600, 220))
    wf.link("¿Tiene email o redes?", "Preparar fila sin canal", out=1)
    wf.link("Preparar fila sin canal", "Guardar sin canal")

    code(wf, "Preparar marca de búsquedas", "generador/marcar_busquedas.js", (1440, 320), executeOnce=True)
    sheets_write(wf, "Actualizar Búsquedas", "Busquedas", (1680, 320), op="update", match=["id"])
    wf.link("Elegir búsquedas", "Preparar marca de búsquedas")
    wf.link("Preparar marca de búsquedas", "Actualizar Búsquedas")
    return wf


# =============================================================================
# 2) ENVIADOR (órdenes de Telegram)
# =============================================================================
def build_enviador():
    wf = WF("enviador", "RedesiaNet · 2 · Enviador (aprobación por Telegram)")
    wf.note("Nota", (
        "## Enviador\n"
        "Escucha tu bot de Telegram. Solo obedece al chat de Fabio.\n\n"
        "- **/enviar ID** o botón ✅ → envía el email con Gmail y, si hay Instagram/Facebook, te pasa el DM listo para copiar\n"
        "- **/rechazar ID** o botón ❌\n- **/dm_ok ID** → marca el DM como enviado\n- **/pendientes**, **/ayuda**\n\n"
        "Se envía lo que haya en el Sheet en ese momento: si retocas el email en el CRM, se manda la versión retocada."
    ), (-40, -560), w=560, h=300, color=5)

    wf.add("Telegram: órdenes", "n8n-nodes-base.telegramTrigger", 1.5,
           {"updates": ["message", "callback_query"], "additionalFields": {"chatIds": TELEGRAM_CHAT_ID}},
           (0, 0), webhookId=uid("enviador", "webhook"), credentials=CRED["telegram"])
    config(wf, (220, 0), {
        "telegram_chat_id": TELEGRAM_CHAT_ID,
        "sheet_url": SHEET_URL,
        "nombre_remitente": "Fabio Bernal",
    })
    code(wf, "Interpretar orden", "enviador/interpretar_orden.js", (440, 0))
    wf.chain("Telegram: órdenes", "Config", "Interpretar orden")

    if_node(wf, "¿Es un botón?", (660, -200), cond("={{ $json.callback_id }}", "string", "notEmpty", single=True))
    wf.add("Telegram: cerrar botón", "n8n-nodes-base.telegram", 1.2, {
        "resource": "callback", "operation": "answerQuery", "queryId": "={{ $json.callback_id }}",
        "additionalFields": {"text": "Recibido ✅"},
    }, (880, -220), credentials=CRED["telegram"], onError="continueRegularOutput")
    wf.link("Interpretar orden", "¿Es un botón?")
    wf.link("¿Es un botón?", "Telegram: cerrar botón", out=0)

    switch_node(wf, "Según orden", (660, 100), [
        ("ayuda", cond("={{ $json.accion }}", "string", "equals", "ayuda")),
        ("pendientes", cond("={{ $json.accion }}", "string", "equals", "pendientes")),
        ("lead", cond("={{ $json.accion }}", "string", "regex", "^(enviar|rechazar|dm_ok)$")),
    ])
    wf.link("Interpretar orden", "Según orden")

    code(wf, "Mensaje de ayuda", "enviador/mensaje_ayuda.js", (900, -40))
    telegram_send(wf, "Telegram: ayuda", (1120, -40))
    wf.link("Según orden", "Mensaje de ayuda", out=0)
    wf.link("Mensaje de ayuda", "Telegram: ayuda")

    sheets_read(wf, "Leer CRM", "Leads", (900, 120))
    code(wf, "Listar pendientes", "enviador/listar_pendientes.js", (1120, 120))
    telegram_send(wf, "Telegram: pendientes", (1340, 120))
    wf.link("Según orden", "Leer CRM", out=1)
    wf.chain("Leer CRM", "Listar pendientes", "Telegram: pendientes")

    sheets_read(wf, "Buscar lead", "Leads", (900, 320),
                filters=[("lead_id", "={{ $json.lead_id }}")])
    code(wf, "Validar orden", "enviador/validar_orden.js", (1120, 320))
    wf.link("Según orden", "Buscar lead", out=2)
    wf.link("Buscar lead", "Validar orden")

    switch_node(wf, "Según acción", (1340, 320), [
        ("error", cond("={{ $json.ok }}", "boolean", "false", single=True)),
        ("rechazar", cond("={{ $json.accion }}", "string", "equals", "rechazar")),
        ("dm_ok", cond("={{ $json.accion }}", "string", "equals", "dm_ok")),
        ("enviar", cond("={{ $json.accion }}", "string", "equals", "enviar")),
    ])
    wf.link("Validar orden", "Según acción")

    telegram_send(wf, "Telegram: aviso", (1580, 160), text="={{ '⚠️ ' + $json.error }}")
    wf.link("Según acción", "Telegram: aviso", out=0)

    code(wf, "Preparar rechazo", "enviador/fila_rechazo.js", (1580, 320))
    sheets_write(wf, "CRM: rechazado", "Leads", (1800, 320), op="update", match=["lead_id"])
    telegram_send(wf, "Telegram: rechazado", (2020, 320),
                  text="={{ '❌ Rechazado: ' + $('Validar orden').first().json.lead.empresa + ' (' + $('Validar orden').first().json.lead_id + ')' }}")
    wf.link("Según acción", "Preparar rechazo", out=1)
    wf.chain("Preparar rechazo", "CRM: rechazado", "Telegram: rechazado")

    code(wf, "Preparar DM enviado", "enviador/fila_dm_ok.js", (1580, 480))
    sheets_write(wf, "CRM: DM enviado", "Leads", (1800, 480), op="update", match=["lead_id"])
    telegram_send(wf, "Telegram: DM registrado", (2020, 480),
                  text="={{ '✅ DM registrado: ' + $('Validar orden').first().json.lead.empresa }}")
    wf.link("Según acción", "Preparar DM enviado", out=2)
    wf.chain("Preparar DM enviado", "CRM: DM enviado", "Telegram: DM registrado")

    if_node(wf, "¿Tiene email?", (1580, 700), cond("={{ $json.lead.email }}", "string", "notEmpty", single=True))
    wf.link("Según acción", "¿Tiene email?", out=3)
    wf.add("Gmail: enviar email", "n8n-nodes-base.gmail", 2.1, {
        "resource": "message",
        "operation": "send",
        "sendTo": "={{ $json.lead.email }}",
        "subject": "={{ $json.lead.asunto }}",
        "emailType": "text",
        "message": "={{ $json.lead.cuerpo_email }}",
        "options": {"appendAttribution": False, "senderName": "={{ $('Config').first().json.nombre_remitente }}"},
    }, (1800, 640), credentials=CRED["gmail"], onError="continueErrorOutput")
    code(wf, "Resultado del envío", "enviador/resultado_envio.js", (2040, 760))
    wf.link("¿Tiene email?", "Gmail: enviar email", out=0)
    wf.link("¿Tiene email?", "Resultado del envío", out=1)
    wf.link("Gmail: enviar email", "Resultado del envío", out=0)

    code(wf, "Preparar error de envío", "enviador/fila_error_envio.js", (2040, 600))
    sheets_write(wf, "CRM: error de envío", "Leads", (2260, 600), op="update", match=["lead_id"])
    telegram_send(wf, "Telegram: error de envío", (2480, 600),
                  text="={{ $('Preparar error de envío').first().json._texto }}")
    wf.link("Gmail: enviar email", "Preparar error de envío", out=1)
    wf.chain("Preparar error de envío", "CRM: error de envío", "Telegram: error de envío")

    sheets_write(wf, "CRM: enviado", "Leads", (2260, 760), op="update", match=["lead_id"])
    telegram_send(wf, "Telegram: confirmación", (2480, 700), text=(
        "={{ ($('Resultado del envío').first().json._email_enviado"
        " ? '📤 Email enviado a ' + $('Validar orden').first().json.lead.empresa + ' (' + $('Validar orden').first().json.lead.email + ')'"
        " : '📭 ' + $('Validar orden').first().json.lead.empresa + ' no tiene email: te paso el DM.') }}"
    ))
    if_node(wf, "¿Hay DM que preparar?", (2480, 880),
            cond("={{ $('Resultado del envío').first().json._hay_redes }}", "boolean", "true", single=True))
    code(wf, "Preparar paquete DM", "enviador/paquete_dm.js", (2700, 880))
    telegram_send(wf, "Telegram: paquete DM", (2920, 880), buttons=[[
        ("✅ Ya envié el DM", "=dm_ok:{{ $json.lead_id }}"),
    ]])
    wf.link("Resultado del envío", "CRM: enviado")
    wf.link("CRM: enviado", "Telegram: confirmación")
    wf.link("CRM: enviado", "¿Hay DM que preparar?")
    wf.link("¿Hay DM que preparar?", "Preparar paquete DM", out=0)
    wf.link("Preparar paquete DM", "Telegram: paquete DM")
    return wf


# =============================================================================
# 3) SEGUIMIENTO DE RESPUESTAS
# =============================================================================
def build_respuestas():
    wf = WF("respuestas", "RedesiaNet · 3 · Seguimiento de respuestas (Gmail → CRM)")
    wf.note("Nota", (
        "## Seguimiento de respuestas\n"
        "Cada 15 min mira respuestas nuevas en Gmail, las cruza con los leads contactados "
        "(por hilo o remitente), Claude las clasifica (interesado, pide info, no, baja, ausencia, rebote) "
        "y actualiza el CRM. Si piden la baja, el email pasa a **Bloqueados**. Te avisa por Telegram."
    ), (-40, -460), w=520, h=240, color=5)

    wf.add("Gmail: respuestas", "n8n-nodes-base.gmailTrigger", 1.3, {
        "pollTimes": {"item": [{"mode": "everyX", "value": 15, "unit": "minutes"}]},
        "simple": True,
        "filters": {
            "q": "in:inbox -from:me (subject:re OR subject:\"delivery status notification\" OR from:mailer-daemon OR from:postmaster)",
            "readStatus": "both",
        },
    }, (0, 0), credentials=CRED["gmail"])
    config(wf, (220, 0), {"modelo_claude": MODELO, "telegram_chat_id": TELEGRAM_CHAT_ID})
    sheets_read(wf, "Leer Leads", "Leads", (440, 0))
    code(wf, "Emparejar con leads", "respuestas/emparejar_respuestas.js", (660, 0))
    code(wf, "Preparar clasificación", "respuestas/preparar_clasificacion.js", (880, 0), per_item=True)
    http_anthropic(wf, "Claude: clasificar", (1100, 0))
    code(wf, "Procesar clasificación", "respuestas/procesar_clasificacion.js", (1320, 0), per_item=True)
    sheets_write(wf, "CRM: guardar respuesta", "Leads", (1540, 0), op="update", match=["lead_id"])
    telegram_send(wf, "Telegram: aviso respuesta", (1760, -100),
                  text="={{ $('Procesar clasificación').item.json._texto }}")
    if_node(wf, "¿Pide la baja?", (1760, 120),
            cond("={{ $('Procesar clasificación').item.json._baja }}", "boolean", "true", single=True))
    code(wf, "Fila Bloqueados", "respuestas/fila_bloqueados.js", (1980, 120), per_item=True)
    sheets_write(wf, "Añadir a Bloqueados", "Bloqueados", (2200, 120))
    wf.chain("Gmail: respuestas", "Config", "Leer Leads", "Emparejar con leads", "Preparar clasificación",
             "Claude: clasificar", "Procesar clasificación", "CRM: guardar respuesta")
    wf.link("CRM: guardar respuesta", "Telegram: aviso respuesta")
    wf.link("CRM: guardar respuesta", "¿Pide la baja?")
    wf.link("¿Pide la baja?", "Fila Bloqueados", out=0)
    wf.link("Fila Bloqueados", "Añadir a Bloqueados")
    return wf


def main():
    OUT.mkdir(exist_ok=True)
    for filename, builder in [
        ("workflow_generador.json", build_generador),
        ("workflow_enviador.json", build_enviador),
        ("workflow_respuestas.json", build_respuestas),
    ]:
        data = builder().to_json()
        (OUT / filename).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{filename}: {len(data['nodes'])} nodos")


if __name__ == "__main__":
    main()
