# RedesiaNet · web v3 + base de datos propia + app de escritorio

Todo lo necesario para la nueva redesianet.com:

| Carpeta | Qué es |
|---|---|
| [`web/`](web/) | La web completa, lista para subir a Hostinger (12 páginas, vídeos 3D, banner de cookies, textos legales) y la **API propia en PHP + SQLite** que sustituye a Google Sheets. |
| [`desktop/`](desktop/) | **RedesiaNet Monitor**, la app de Windows que te avisa al momento de cada lead y de cada visita. |
| [`remotion/`](remotion/) | El proyecto de **Remotion** con el que se renderizan las escenas 3D (vídeo de portada, vídeo de Método e imagen para redes). |
| [`.github/workflows/entregables.yml`](.github/workflows/entregables.yml) | Genera automáticamente el ZIP de la web y el instalador `.exe`. |

---

## 1. Precios y promoción

Modelo nuevo: un **alta** pequeña (pago único al empezar, cubre diseño y puesta en marcha) y una **cuota mensual**, que es el ingreso principal. Todos los precios sin IVA.

| Plan | Incluye | Alta | Cuota | Con permanencia 12 meses (−20 %) |
|---|---|---|---|---|
| **Esencial** | 1 automatización | 390 € | 149 €/mes | 119 €/mes · ahorra 360 €/año |
| **Profesional** ★ | 1 agente de IA + 2 automatizaciones | 990 € | 390 €/mes | 312 €/mes · ahorra 936 €/año |
| **Empresa** | 3 agentes + 6 automatizaciones + 1 a medida | 2.490 € | 990 €/mes | 792 €/mes · ahorra 2.376 €/año |
| **A medida** | 5+ agentes, SLA, SSO | según proyecto | desde 1.990 €/mes | desde 1.592 €/mes |

- **Ampliaciones**: +1 automatización 99 €/mes (79 € con permanencia) · +1 agente 290 €/mes (232 €).
- **Promoción**: −20 % en la cuota con permanencia de 12 meses. El alta no se descuenta. Si el cliente cancela antes, solo devuelve el descuento disfrutado (cláusula proporcional, en `condiciones.html`).
- La cuota empieza cuando el servicio entra en producción; la auditoría sigue siendo gratis.

**Para cambiar un precio**: está escrito en `index.html`, `precio.html` (atributos `data-m` = mensual y `data-a` = 12 meses), en la calculadora (`PLANS` dentro de `web/js/main.js`), en `faq.html`, `condiciones.html` y en los textos `149 €/mes` de la cabecera/pie. Busca y reemplaza el número en la carpeta `web/`.
**Para ocultar la barra de la promoción en una fecha**: `promoEndsAt: "2026-12-31"` en `web/js/config.js`.

## 2. Publicar la web en Hostinger

1. **Copia de seguridad**: en hPanel → *Archivos* → *Copias de seguridad* (o descarga la carpeta `public_html` actual).
2. **Descarga el paquete**: en GitHub → pestaña *Actions* → última ejecución de «Entregables» → artefacto **redesianet-web** (o en *Releases*, si hay una versión publicada). Dentro está `redesianet-web.zip`.
   *Alternativa*: botón verde *Code → Download ZIP* del repositorio y usa el contenido de la carpeta `web/`.
3. **Sube y descomprime**: hPanel → *Administrador de archivos* → `public_html` → *Subir* el ZIP → clic derecho → *Extraer*. Sustituye los ficheros antiguos (`index.html`, `css/`, `js/`…). Activa «Mostrar archivos ocultos» y comprueba que están los `.htaccess`.
4. **Instala la API**: abre **https://redesianet.com/api/setup.php**.
   - Comprueba que todo sale en verde (si `pdo_sqlite` aparece en rojo: hPanel → *Avanzado* → *Configuración de PHP* → *Extensiones* → actívala).
   - Email de avisos: `redesianet.contact@gmail.com` (o el que quieras).
   - Remitente: un buzón **de tu dominio** creado en hPanel → *Correos* (p. ej. `contact@redesianet.com`).
   - **SMTP (recomendado)**: servidor `smtp.hostinger.com`, puerto `465`, ese buzón y su contraseña. Así los avisos no van a spam.
   - Pulsa *Instalar* y **copia el token** que aparece (solo se muestra una vez).
5. **Prueba**: envía una solicitud desde `/contacto.html`. Debe llegarte el correo y aparecer en la app de escritorio.
6. Opcional: borra `api/setup.php` del servidor. Si algún día pierdes el token, borra `api/private/config.php` y vuelve a subir/abrir `setup.php`: se genera otro y **los datos se conservan**.

La integración antigua con Google Sheets (Apps Script) ya no se usa: puedes desactivarla en tu cuenta de Google cuando compruebes que todo funciona.

## 3. App de escritorio (Windows)

1. Descarga **RedesiaNet-Monitor-Setup-1.0.0.exe** (GitHub → *Actions* → «Entregables» → artefacto *RedesiaNet-Monitor-Windows*, o desde *Releases*).
2. Ábrelo. Como la app no está firmada con un certificado de pago, Windows puede mostrar «Windows protegió tu PC»: pulsa **Más información → Ejecutar de todas formas**.
3. Pega la dirección (`https://redesianet.com`) y el **token** de `setup.php`. El token se guarda cifrado con tu usuario de Windows.

Qué hace:
- **Avisos nativos de Windows** al momento: cada lead (con empresa, plan y qué quiere automatizar), cada suscripción a la newsletter y, si quieres, cada visitante nuevo o cada página vista.
- **Resumen**: visitantes, gente en la web ahora, leads, conversión, gráfico de 7/30/90 días, páginas más vistas, de dónde llega la gente, dispositivos, clics en los botones y leads por plan.
- **Leads**: buscador, estados (nuevo → contactado → propuesta → cliente / descartado), notas internas, responder por email o llamar con un clic, eliminar (para peticiones de supresión) y exportar a Excel (CSV).
- **En vivo**: lo que pasa en la web en tiempo real.
- Vive en la **bandeja del sistema**, arranca con Windows en segundo plano y se puede pausar una hora.

Para avisos también en el **móvil** (opcional): crea un bot con [@BotFather](https://t.me/BotFather) en Telegram, copia su token, escríbele un mensaje y consulta tu *chat id* (por ejemplo con @userinfobot). Ponlos en `setup.php`. Los mensajes de Telegram no llevan datos personales.

## 4. Base de datos propia

- Un único fichero SQLite en `api/private/data/` de tu hosting. Esa carpeta está bloqueada para internet (`.htaccess`) y `setup.php` comprueba que lo esté.
- Tablas: `leads`, `subscribers` (newsletter con doble confirmación por correo), `hits` (visitas), `consents` (registro de decisiones del banner).
- Se aplican solos los plazos de la política de privacidad: visitas 14 meses, leads sin relación 12 meses, consentimientos 3 años, suscripciones sin confirmar 30 días.
- No se guardan IPs: los visitantes se cuentan con un código que cambia cada día.
- API privada (`api/admin.php`) protegida por token, con bloqueo tras 10 intentos fallidos.

## 5. Legal: qué se ha implantado

- **Aviso legal** (art. 10 LSSI-CE) con los datos del titular, **política de privacidad** (RGPD + LOPDGDD: finalidades, bases legales, plazos, encargados, transferencias, derechos y AEPD), **política de cookies** y **condiciones de contratación** (alta, cuota, permanencia y cancelación, encargo de tratamiento, responsabilidad).
- **Banner de cookies** conforme a la guía de la AEPD (2023): «Aceptar» y «Rechazar» con el mismo peso en la primera capa, configuración por categorías, nada opcional se carga antes de decidir, elección revocable desde «Configurar cookies» en el pie, renovación a los 12 meses, respeto a *Global Privacy Control* y registro del consentimiento.
- Sin Google Analytics, sin Google Fonts (las tipografías se sirven desde tu dominio) y sin terceros.
- Formularios con información básica de protección de datos por capas, casilla de privacidad y casilla **separada y opcional** para comunicaciones comerciales; newsletter con **doble opt-in** y baja en un clic.
- Si activas el **Pixel de Meta** (`metaPixelId` en `web/js/config.js`), el banner añade la categoría *Marketing* y la política de cookies muestra sus cookies automáticamente; solo se carga con consentimiento.

**Pendiente por tu parte** (no lo puede resolver la web):
- Para cobrar altas y cuotas necesitas **facturar**: date de alta como autónomo (modelo 036/037 + RETA) o constituye una sociedad. Cuando lo hagas, actualiza los datos del titular en `aviso-legal.html`, `privacidad.html` y `condiciones.html` (y, si es una SL, añade el CIF y los datos del Registro Mercantil).
- Firma con cada cliente el **contrato de encargo de tratamiento** (art. 28 RGPD) cuando trates sus datos.
- Revisa que puedes **demostrar** las cifras y testimonios de la web (por ejemplo, «seis años de operación», «12.000 facturas»): la publicidad engañosa está prohibida también entre empresas.
- Los **emails comerciales en frío** necesitan consentimiento previo también cuando el destinatario es una empresa (art. 21 LSSI-CE). Para prospección, mejor teléfono o LinkedIn, o un primer contacto que pida permiso.

## 6. Escenas 3D (Remotion)

```bash
cd remotion
npm install
npm run studio          # editor visual en el navegador
npm run render          # vuelve a generar vídeos e imágenes en out/
```
Después, convierte los masters a los ficheros web de `web/assets/video/` (MP4 H.264 + WebM VP9). Los comandos exactos de `ffmpeg` están en `remotion/README.md`. Remotion es gratuito para particulares y empresas de hasta 3 personas.

## 7. Mantenimiento

- La cabecera y el pie están repetidos en cada página (HTML plano, como antes): si cambias un enlace, cámbialo en todas.
- Si modificas `css/styles.css` o un fichero de `js/`, sube el número `?v=3.0` en los `<link>`/`<script>` de las páginas para que los navegadores no usen la versión vieja.
- **Enlace de descarga permanente**: los artefactos de *Actions* caducan a los 30 días. Para tener la web y el instalador siempre a mano, en GitHub ve a *Releases → Draft a new release*, escribe una etiqueta nueva (p. ej. `v3.0.0`), elige la rama con estos cambios y pulsa *Publish*: el workflow «Entregables» adjunta solo `redesianet-web.zip` y el `.exe` a esa Release en unos minutos.
- Para una versión nueva de la app, sube `version` en `desktop/package.json` antes de publicar la Release.
