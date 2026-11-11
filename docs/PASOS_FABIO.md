# Pasos que tienes que hacer tú

Solo lo que necesita tu clic o tu autorización. El resto ya está hecho:

- El Google Sheet ya está creado en tu Drive: **[CRM Captación B2B · RedesiaNet](https://docs.google.com/spreadsheets/d/1-l1Axsib6LDIm6TDv07FCAO13vpuQe_7240CvW3BPfk/edit)**.
- Los tres workflows ya llevan dentro el ID del Sheet y tu chat de Telegram (5246096132).

**Cómo funciona la aprobación:** cada borrador te llega a Telegram para que lo leas. Para enviarlo, en el Sheet cambias su columna **estado** a **aprobado**, también desde la app de Google Sheets del móvil. En 1-2 minutos n8n lo envía, cambia la fila a **enviado** y te avisa por Telegram.

Telegram solo se usa para avisarte. No hace falta un bot nuevo: puedes usar **Ricky** sin que deje de funcionar para lo demás, porque enviar mensajes no choca con nada.

Tiempo total: unos 25 minutos.

---

## 1. Bot de Telegram (1 min)

1. Si usas **Ricky**: en Telegram, abre **@BotFather** → `/mybots` → Ricky → **API Token** y cópialo.
2. Abre el chat con Ricky y pulsa **Iniciar** (`/start`) si nunca le has escrito. Un bot no puede escribirte hasta que tú le hablas primero.

## 2. Clave de Google Places API (5 min)

1. Entra en <https://console.cloud.google.com/> con tu cuenta y crea un proyecto (o usa uno existente).
2. **Facturación:** Google la exige activada aunque te quedes dentro del uso gratuito mensual.
3. **APIs y servicios → Biblioteca** → busca **Places API (New)** → **Habilitar**.
4. **APIs y servicios → Credenciales → Crear credenciales → Clave de API**.
5. Edita la clave → **Restricciones de API** → marca solo *Places API (New)* → Guardar.
6. Recomendado: **Facturación → Presupuestos y alertas** → crea una alerta de 10 €. Con 3 búsquedas al día (unas 65 al mes) el consumo es pequeño, pero así no hay sorpresas.

## 3. Credenciales en n8n (5 min)

En n8n: **Descripción general → Credenciales → Crear credencial**. Usa **exactamente estos nombres**: al importar los workflows, n8n enlaza solo cada nodo con la credencial que se llama igual (comprobado con la versión 2.46 de n8n).

| Nombre exacto | Tipo de credencial | Qué rellenar |
|---|---|---|
| `Google Sheets RedesiaNet` | Google Sheets OAuth2 API | Botón **Iniciar sesión con Google** con fabiobernaldiaz@gmail.com |
| `Google Sheets Trigger RedesiaNet` | Google Sheets Trigger OAuth2 API | Igual: **Iniciar sesión con Google** (es la que vigila el Sheet) |
| `Gmail Fabio` | Gmail OAuth2 API | Ya la tienes: **renómbrala** a este nombre (o, tras importar, elígela a mano en los 2 nodos de Gmail) |
| `Telegram Bot Captación` | Telegram API | El token de Ricky (paso 1). Si ya tienes "Telegram account" con ese token, renómbrala |
| `Anthropic API Key` | Header Auth | **Name:** `x-api-key` · **Value:** tu clave `sk-ant-...` |
| `Google Places API Key` | Header Auth | **Name:** `X-Goog-Api-Key` · **Value:** la clave del paso 2 |

> El nombre se cambia arriba del todo en la ventana de la credencial, donde pone algo como "Header Auth account".
> Si tienes dos credenciales con el mismo nombre y tipo, n8n no sabrá cuál elegir: deja solo una.

## 4. Importar los 3 workflows (3 min)

Descarga de este repositorio (rama `claude/redesianet-b2b-lead-automation-kl05fn`, carpeta `n8n/`) estos ficheros:

- `workflow_generador.json`
- `workflow_enviador.json`
- `workflow_respuestas.json`

Si ya importaste versiones anteriores, borra esos workflows en n8n e importa estos. **El Enviador ha cambiado:** ya no usa Telegram para aprobar.

En n8n, para cada uno: **Crear workflow → menú ⋯ (arriba a la derecha) → Importar → Desde archivo** → elige el JSON → **Guardar**.

**Solo en el Enviador:** abre el primer nodo, **Sheet: estado cambiado**, y en el campo **Sheet** elige **Leads** en el desplegable. Es el único dato que no se puede dejar puesto de antemano.

Comprueba que ningún nodo tiene un triángulo rojo. Si alguno lo tiene, ábrelo y elige la credencial en el desplegable.

## 5. Primera prueba controlada (5 min)

1. Abre **RedesiaNet · 2 · Enviador** y pulsa **Publicar** (arriba a la derecha). Desde ese momento vigila el Sheet cada minuto.
2. Abre **RedesiaNet · 1 · Generador** → nodo **Config** → cambia `max_leads_por_ejecucion` a `3` → **Ejecutar flujo de trabajo**.
3. Te llegarán a Telegram un resumen y hasta 3 borradores, y verás las filas en la pestaña **Leads** del Sheet.
4. **Envío de prueba a ti mismo:** en el Sheet, en la fila de un borrador:
   1. cambia la celda `email` por tu propio email;
   2. después cambia `estado` a **aprobado**.

   En 1-2 minutos te llegará el email tal y como lo recibiría la empresa, la fila pasará a **enviado** y Telegram te lo confirmará.
5. Si todo está bien, vuelve a poner `max_leads_por_ejecucion` en `15` (o lo que prefieras).

> Si la celda `estado` te marca **aprobado** como valor no válido, funciona igual. Para tenerlo en el desplegable: selecciona la columna `estado` → **Datos → Validación de datos** → añade `aprobado` a la lista.

## 6. Activar (1 min)

Pulsa **Publicar** también en **RedesiaNet · 1 · Generador** (se ejecuta de lunes a viernes a las 9:00, hora de Madrid) y en **RedesiaNet · 3 · Seguimiento de respuestas** (mira Gmail cada 15 minutos).

---

## Opcional

- **Prospectos que ya contactaste:** si ya escribiste a las empresas de tu hoja `RedesiaNet_correos_mejorados_v2`, pega sus dominios en la pestaña **Bloqueados** (columna `valor`) para que el sistema no las vuelva a contactar. La lista está lista para copiar en [`bloqueados_sugeridos.txt`](bloqueados_sugeridos.txt).
- **Planes intermedios:** en el nodo **Config** del Generador, campo `planes`, añade tus planes entre Starter y Transformación Total. La IA los usa solo como orientación interna y nunca los menciona en los emails.
- **Más zonas o sectores:** añade filas en la pestaña **Busquedas** (id único, `activa` = SI y la consulta tal cual la escribirías en Google Maps).

## Uso diario (todo desde el Sheet)

| Quieres… | En la fila del lead… |
|---|---|
| Enviar un borrador | `estado` = **aprobado**. En 1-2 minutos se envía y pasa a **enviado** |
| Descartarlo | `estado` = **rechazado** |
| Retocar el texto antes de enviar | Edita `asunto` / `cuerpo_email` y **después** pon `estado` = **aprobado** |
| Mandar el DM de Instagram/Facebook | Al aprobar, te llega a Telegram el texto listo para copiar y un enlace que abre el chat. Envíalo y pon `dm_estado` = **enviado** |
| Ver qué tienes pendiente | Filtra la columna `estado` por **pendiente_aprobacion** |
| Reintentar un envío que falló (`error_envio`) | Corrige el dato que indica `motivo_descarte` y vuelve a poner **aprobado** |
| Que no se contacte a alguien | Añade su email o dominio a la pestaña **Bloqueados** |

Puedes aprobar varias filas a la vez: se envían todas en la misma pasada.
