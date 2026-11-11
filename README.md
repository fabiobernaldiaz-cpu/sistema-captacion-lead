# Sistema de captación B2B · RedesiaNet

Captación automática de pymes del Corredor del Henares (Arganda del Rey, Alcalá de Henares, Torrejón de Ardoz y Coslada) con **n8n cloud + Claude + Telegram + Gmail + Google Sheets**. Nada sale sin tu aprobación: lees el borrador en Telegram y lo apruebas en el Sheet.

👉 **Para ponerlo en marcha:** [`docs/PASOS_FABIO.md`](docs/PASOS_FABIO.md) (solo los pasos que necesitan tu clic, unos 25 minutos).

📊 **CRM:** [CRM Captación B2B · RedesiaNet](https://docs.google.com/spreadsheets/d/1-l1Axsib6LDIm6TDv07FCAO13vpuQe_7240CvW3BPfk/edit) (ya creado en tu Drive).

```
 L-V 9:00                                                         Telegram (tú)
┌──────────────────────── 1 · GENERADOR ───────────────────────┐   ┌──────────────┐
│ Busquedas (Sheet) → Google Maps → filtra/deduplica →         │   │ resumen      │
│ web (inicio + contacto + aviso legal) → emails, redes,       │──▶│ borrador     │
│ señales → Claude: dolor + servicio + email + DM → CRM        │   │ (para leer)  │
└──────────────────────────────────────────────────────────────┘   └──────────────┘
                     Tú, en el Sheet: estado = aprobado
┌───────────────────── 2 · ENVIADOR (cada minuto) ─────────────┐
│ detecta filas aprobadas → Gmail (texto plano, sin firma de   │──▶ 📤 aviso + DM
│ n8n) → CRM: enviado                                          │
└──────────────────────────────────────────────────────────────┘
┌──────────────────── 3 · SEGUIMIENTO (15 min) ────────────────┐
│ Respuestas en Gmail → cruce por hilo/remitente → Claude      │──▶ 🔥 aviso
│ clasifica → CRM (+ Bloqueados si piden la baja)              │
└──────────────────────────────────────────────────────────────┘
```

## Archivos

| Ruta | Qué es |
|---|---|
| `n8n/workflow_generador.json` | **1 · Generador**: búsqueda, análisis con IA, redacción y envío del borrador a Telegram. No envía nada a las empresas. |
| `n8n/workflow_enviador.json` | **2 · Enviador**: vigila el Sheet y envía con Gmail los leads que marcas como `aprobado`. |
| `n8n/workflow_respuestas.json` | **3 · Seguimiento**: registra y clasifica las respuestas, y gestiona las bajas. |
| `docs/PASOS_FABIO.md` | Puesta en marcha (lo único que tienes que hacer tú). |
| `sheets/build_sheet.py` · `.xlsx` | Plantilla del CRM (el Sheet ya está creado; esto sirve para recrearlo). |
| `src/code/**.js` | Código de los nodos Code (se incrusta en los JSON al compilar). |
| `src/build_workflows.py` | Genera los 3 JSON de `n8n/`. |
| `tests/` | Pruebas de la lógica y herramientas de prueba en un n8n local. |

> **Sobre tus workflows anteriores:** `C:\Users\fabio\.openclaw\workspace\redesianet\n8n\workflow_generador.json` y `workflow_enviador.json` están en tu PC y no estaban accesibles desde este entorno (ni en el repositorio ni en tu Drive). Este sistema se ha construido desde cero a partir de tu especificación, con los mismos nombres. Si quieres que incorpore algo concreto de ellos, súbelos al repositorio o a Drive.

## Cómo funciona

### 1 · Generador (lunes a viernes, 9:00, hora de Madrid)

1. **Elige 3 búsquedas** de la pestaña `Busquedas` (18 sectores × 4 municipios = 72), las que hace más tiempo que no se usan. Así rota sola.
2. **Google Places API (New)**: hasta 20 negocios por búsqueda, con web, teléfono, valoración y estado.
3. **Filtra**: solo negocios operativos, con web propia (fuera las que solo tienen Facebook, Doctoralia, etc.), sin repetir lo que ya hay en el CRM y sin lo que esté en `Bloqueados`. Como mucho 15 por día.
4. **Lee su web**: inicio, página de contacto y aviso legal (en España el aviso legal suele incluir el email). Extrae:
   - **Emails**, incluidos los ocultos por Cloudflare y los escritos como `info [at] dominio.es`. Prioriza los del propio dominio y los genéricos (`info@`, `contacto@`) frente a `rgpd@` o `rrhh@`.
   - **Instagram, Facebook y LinkedIn.**
   - **Señales técnicas:** CMS, chat web, WhatsApp, reserva online, newsletter, blog, tienda, analítica, píxel de Meta, año del copyright y si la web está caída.
5. **Claude** (`claude-sonnet-4-6`, configurable) recibe todo eso y devuelve un JSON estructurado:
   - si la empresa encaja (descarta cadenas, organismos públicos, agencias y webs rotas);
   - un dolor concreto con su evidencia;
   - el servicio de RedesiaNet (Agentes IA, Automatizaciones n8n, SEO, Email marketing o Seguridad IA), el agente del catálogo más cercano y un plan orientativo;
   - el asunto, el email de 4-5 líneas con llamada a la acción de 20 minutos, y el DM.

   La firma y la despedida las añade el sistema, así que siempre son exactamente `Fabio Bernal | RedesiaNet | fabiobernaldiaz@gmail.com`.
6. **Guarda** cada lead en `Leads` y te manda a Telegram un resumen y cada borrador para que lo leas.

### 2 · Enviador (siempre activo, mira el Sheet cada minuto)

Se dispara cuando cambia la columna `estado` de la pestaña `Leads` y solo actúa sobre las filas que ahora dicen **`aprobado`**:

- **Si hay email:** lo envía desde tu Gmail en texto plano (mejor entregabilidad, parece escrito a mano) y sin el pie de n8n. La fila pasa a `enviado` y Telegram te lo confirma.
- **Si hay Instagram/Facebook:** te manda a Telegram el DM listo para copiar y un enlace que abre el chat (`ig.me` / `m.me`). Cuando lo envías, pones `dm_estado` = `enviado`.
- **Si no hay email pero sí redes:** solo DM (estado `dm_pendiente`).
- **Si falta algo** (email mal escrito, sin asunto) **o Gmail lo rechaza:** la fila pasa a `error_envio` con el motivo, y te avisa. Corriges y vuelves a poner `aprobado`.
- **No hay envíos dobles:** al enviar, la fila deja de estar en `aprobado`, así que nunca se procesa otra vez.
- **Se envía lo que haya en el Sheet en ese momento:** para retocar un email, edita la celda y después aprueba.
- Puedes aprobar varias filas a la vez.
- Para descartar un lead, pon `estado` = `rechazado`. No hace falta ningún workflow.

Telegram solo se usa para **enviar avisos**, así que puedes usar un bot que ya tengas (por ejemplo Ricky) sin que deje de funcionar para lo demás.

### 3 · Seguimiento de respuestas (cada 15 minutos)

- Lee las respuestas nuevas de Gmail y las cruza con los leads por hilo de Gmail o por remitente.
  - Para no gastar ejecuciones de n8n con todo tu correo, solo mira emails con `Re:` en el asunto y avisos de rebote. Puedes ampliar el filtro en el nodo *Gmail: respuestas*.
- Claude clasifica cada respuesta: `interesado`, `pide_info`, `no_interesado`, `baja`, `fuera_oficina`, `rebote` u `otro`.
- Actualiza `estado`, `fecha_respuesta`, `clasificacion_respuesta` y `respuesta`, y te avisa por Telegram con un enlace al hilo.
- **Si piden la baja**, su email pasa a `Bloqueados` y no se vuelve a contactar nunca.

## CRM (Google Sheets)

| Pestaña | Para qué |
|---|---|
| `Leads` | Una fila por empresa (40 columnas): datos, análisis IA, textos, fechas, canal, ids de Gmail, respuesta. **No renombres las cabeceras.** |
| `Busquedas` | Qué se busca en Google Maps. Añade o desactiva filas libremente. |
| `Bloqueados` | Emails o dominios que nunca se contactan. Un dominio genérico como `gmail.com` no bloquea a todos sus usuarios: pon el email completo. |
| `Leyenda` | Estados y cómo aprobar. |

Estados: `pendiente_aprobacion` → (tú) `aprobado` / `rechazado` → `enviado` / `dm_pendiente` → `respondido` / `rebotado` / `baja`. También: `descartado_ia`, `sin_canal` (sin email ni redes, para llamar) y `error_ia` / `error_envio`.

Los datos se escriben como texto literal, así que un teléfono `+34…` o un texto con `=` de una web no se convierten en fórmulas.

## Ajustes (nodo *Config* de cada workflow)

| Campo | Por defecto |
|---|---|
| `modelo_claude` | `claude-sonnet-4-6`. Si pasas a un modelo 5.x (por ejemplo `claude-sonnet-5-5`) funciona sin más cambios. |
| `max_leads_por_ejecucion` / `busquedas_por_ejecucion` | 15 / 3 |
| `confianza_minima` | 40. Por debajo, el lead se descarta. |
| `despedida`, `firma`, `linea_baja` | `Un saludo,` · tu firma · P. D. de baja. Déjalos vacíos para quitarlos. |
| `servicios_redesianet`, `planes`, `agentes_catalogo` | El texto que Claude usa para elegir servicio. Los planes son solo para uso interno y nunca aparecen en los emails. |

## Instagram / Facebook: por qué el DM es "asistido"

Meta **no permite iniciar conversaciones en frío por API**. Las APIs oficiales de Instagram y Messenger solo dejan responder a quien te ha escrito antes, dentro de una ventana de 24 horas. Los bots no oficiales que simulan un navegador incumplen sus condiciones y acaban con la cuenta bloqueada, un riesgo absurdo para una agencia que vende seguridad IA.

Por eso el sistema:

- detecta el perfil en la web de la empresa;
- redacta el DM con Claude;
- al aprobar, te lo da listo para copiar, con un enlace que abre directamente el chat (`ig.me/m/usuario` o `m.me/página`);
- lo registras poniendo `dm_estado` = `enviado` en el CRM.

Unos 10 segundos por DM, sin riesgo para tus cuentas.

## Costes orientativos

- **Claude Sonnet 4.6** ($3 / $15 por millón de tokens de entrada / salida, con caché del prompt de sistema): unos 2 céntimos por empresa analizada. Con 15 al día y 22 días al mes, unos 5-7 $/mes. Clasificar respuestas cuesta menos de 1 céntimo cada una.
- **Google Places:** unas 65 búsquedas al mes. Google da un cupo gratuito mensual; pon la alerta de presupuesto del paso 2.
- **n8n:**
  - Generador: 1 ejecución por día laborable.
  - Enviador: solo cuando cambia la columna `estado` (unas 2 ejecuciones por envío: tu aprobación y el cambio a `enviado`, que se ignora). Las comprobaciones de cada minuto sin cambios no cuentan como ejecuciones.
  - Seguimiento: solo cuando llegan respuestas.

## Límites y avisos

- **Legal (LSSI/RGPD):** en España el artículo 21 de la LSSI exige consentimiento previo para comunicaciones comerciales por email, también entre empresas. El sistema está diseñado para reducir el riesgo:
  - un email personalizado uno a uno y aprobado por ti, sin envíos masivos;
  - volumen bajo;
  - solo datos de contacto profesionales publicados por la empresa;
  - opción de baja en cada email y lista de bloqueo automática.

  No elimina el riesgo legal: revísalo con tu asesor, y documenta el interés legítimo en tu registro de actividades de tratamiento.
- **Entregabilidad:** desde una cuenta de Gmail personal, no pases de 20-30 emails en frío al día. A medio plazo, un buzón `fabio@redesianet.com` con SPF, DKIM y DMARC mejora mucho la tasa de llegada a la bandeja de entrada.
- **Google Maps:** el sistema guarda el `place_id`, el teléfono y la web para no repetir empresas. Revisa las condiciones de Google Maps Platform si vas a reutilizar esos datos para otra cosa.

## Desarrollo

```bash
python3 sheets/build_sheet.py          # plantilla del CRM (.xlsx)
python3 src/build_workflows.py         # genera n8n/*.json desde src/code/
node --test tests/run_tests.mjs        # 14 grupos de pruebas de la lógica
```

`tests/run_tests.mjs` ejecuta el código **tal cual queda compilado en los JSON**, con un entorno que imita al de n8n. Oculta `URL`, `structuredClone`, `fetch`, `require`, `process` y `Buffer`, que no existen en el sandbox de los nodos Code de n8n 2.x (comprobado: un primer borrador que usaba `URL` habría dejado el Generador sin leads).

**Validación en un n8n 2.46 local** (la que se hizo antes de entregar):

1. `tests/e2e_validate_params.cjs` pasa el validador de parámetros del propio n8n a los 58 nodos. Solo avisa del campo *Sheet* del disparador del Enviador, que se elige a mano.
2. `n8n import:workflow` con credenciales de prueba con los nombres de la guía comprueba que se enlazan solas.
3. `tests/e2e_make_variants.py` crea copias en las que solo los servicios externos (Sheets, Maps, webs, Claude, Gmail y Telegram) se sustituyen por datos fijos. Se ejecutan con `n8n execute` y se revisan con `tests/e2e_dump_execution.cjs`.

   Escenarios cubiertos: generación completa; varios leads aprobados a la vez (con email, solo DM, email inválido y una fila ya enviada que se ignora); fallo de Gmail; cambio sin aprobados; y seguimiento de respuestas con baja.

**No se ha probado contra los servicios reales** (Google Places, Anthropic, Gmail y Telegram), porque requiere tus credenciales. Esa es la prueba del paso 5 de `docs/PASOS_FABIO.md`.
