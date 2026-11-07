# Pasos que tienes que hacer tú

Solo lo que necesita tu clic o tu autorización. El resto ya está hecho:

- El Google Sheet ya está creado en tu Drive: **[CRM Captación B2B · RedesiaNet](https://docs.google.com/spreadsheets/d/1-l1Axsib6LDIm6TDv07FCAO13vpuQe_7240CvW3BPfk/edit)**.
- Los tres workflows ya llevan dentro el ID del Sheet y tu chat de Telegram (5246096132).

Tiempo total: unos 25 minutos.

---

## 1. Bot de Telegram nuevo, solo para esto (3 min)

> **Por qué uno nuevo:** el nodo de n8n que escucha Telegram registra un *webhook*, y un bot solo puede tener uno. Si reutilizas un bot que ya usas en otra cosa (OpenClaw, otro workflow…), uno de los dos dejará de recibir mensajes.

1. En Telegram, abre **@BotFather** → `/newbot` → ponle un nombre (por ejemplo *RedesiaNet Captación*) y un usuario que acabe en `bot`.
2. Copia el **token** que te da (algo como `123456:ABC...`).
3. Abre tu bot nuevo y pulsa **Iniciar** (`/start`). **Imprescindible:** un bot no puede escribirte hasta que tú le hablas primero.

## 2. Clave de Google Places API (5 min)

1. Entra en <https://console.cloud.google.com/> con tu cuenta y crea un proyecto (o usa uno existente).
2. **Facturación:** Google la exige activada aunque te quedes dentro del uso gratuito mensual.
3. **APIs y servicios → Biblioteca** → busca **Places API (New)** → **Habilitar**.
4. **APIs y servicios → Credenciales → Crear credenciales → Clave de API**.
5. Edita la clave → **Restricciones de API** → marca solo *Places API (New)* → Guardar.
6. Recomendado: **Facturación → Presupuestos y alertas** → crea una alerta de 10 €. Con 3 búsquedas al día (unas 65 al mes) el consumo es pequeño, pero así no hay sorpresas.

## 3. Credenciales en n8n (5 min)

En n8n: **Overview → Credentials → Create credential**. Usa **exactamente estos nombres**: al importar los workflows, n8n enlaza solo cada nodo con la credencial que se llama igual (comprobado con la versión 2.46 de n8n).

| Nombre exacto | Tipo de credencial | Qué rellenar |
|---|---|---|
| `Google Sheets RedesiaNet` | Google Sheets OAuth2 API | Botón **Sign in with Google** con fabiobernaldiaz@gmail.com |
| `Gmail Fabio` | Gmail OAuth2 API | Ya la tienes: **renómbrala** a este nombre (o, tras importar, elígela a mano en los 2 nodos de Gmail) |
| `Telegram Bot Captación` | Telegram API | El token del paso 1 |
| `Anthropic API Key` | Header Auth | **Name:** `x-api-key` · **Value:** tu clave `sk-ant-...` |
| `Google Places API Key` | Header Auth | **Name:** `X-Goog-Api-Key` · **Value:** la clave del paso 2 |

> Si ya tienes otra credencial con el mismo nombre y tipo, n8n no sabrá cuál elegir: deja solo una con ese nombre.

## 4. Importar los 3 workflows (3 min)

Descarga de este repositorio (rama `claude/redesianet-b2b-lead-automation-kl05fn`, carpeta `n8n/`) los ficheros:

- `workflow_generador.json`
- `workflow_enviador.json`
- `workflow_respuestas.json`

(En GitHub: abre cada fichero → botón **Download raw file**.)

En n8n, para cada uno: **Create workflow → menú ⋯ (arriba a la derecha) → Import from File** → elige el JSON → **Save**.

Comprueba que ningún nodo tiene un triángulo rojo. Si alguno lo tiene, ábrelo y elige la credencial en el desplegable.

## 5. Primera prueba controlada (5 min)

1. Abre **RedesiaNet · 1 · Generador** → nodo **Config** → cambia `max_leads_por_ejecucion` a `3` → **Execute workflow**.
2. Deberías recibir en Telegram un resumen y hasta 3 borradores con botones ✅ Enviar / ❌ Rechazar, y ver las filas en la pestaña **Leads** del Sheet.
3. Abre **RedesiaNet · 2 · Enviador** y **actívalo** (interruptor *Active* o botón *Publish*, según tu versión de n8n). Si no está activo, los botones de Telegram no hacen nada.
4. **Envío de prueba a ti mismo:** en el Sheet, en la fila de un borrador, cambia la celda `email` por tu propio email. Después pulsa ✅ Enviar en Telegram. Te llegará el email tal y como lo recibiría la empresa.
5. Si todo está bien, vuelve a poner `max_leads_por_ejecucion` en `15` (o lo que prefieras).

## 6. Activar (1 min)

Activa también **RedesiaNet · 1 · Generador** (se ejecuta de lunes a viernes a las 9:00, hora de Madrid) y **RedesiaNet · 3 · Seguimiento de respuestas** (mira Gmail cada 15 minutos).

---

## Opcional

- **Prospectos que ya contactaste:** si ya escribiste a las empresas de tu hoja `RedesiaNet_correos_mejorados_v2`, pega sus dominios en la pestaña **Bloqueados** (columna `valor`) para que el sistema no las vuelva a contactar. La lista está lista para copiar en [`bloqueados_sugeridos.txt`](bloqueados_sugeridos.txt).
- **Planes intermedios:** en el nodo **Config** del Generador, campo `planes`, añade tus planes entre Starter y Transformación Total. La IA los usa solo como orientación interna y nunca los menciona en los emails.
- **Más zonas o sectores:** añade filas en la pestaña **Busquedas** (id único, `activa` = SI y la consulta tal cual la escribirías en Google Maps).

## Uso diario

| Quieres… | Haz… |
|---|---|
| Enviar un borrador | Botón ✅ o `/enviar ID` |
| Descartarlo | Botón ❌ o `/rechazar ID` |
| Retocar el texto antes de enviar | Edita `asunto` / `cuerpo_email` en el Sheet y luego pulsa ✅: se envía lo que haya en el Sheet |
| Mandar el DM de Instagram/Facebook | Tras ✅ te llega el texto listo para copiar y un enlace que abre el chat. Pégalo, envíalo y pulsa ✅ *Ya envié el DM* |
| Ver qué tienes pendiente | `/pendientes` |
| Que no se contacte a alguien | Añade su email o dominio a **Bloqueados** |
