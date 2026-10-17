<?php
/* ══════════════════════════════════════════════════════════════
   /api/setup.php — instalación en un paso (como el instalador de
   WordPress). Crea la base de datos, guarda la configuración y te
   enseña UNA vez el token para la app de escritorio.
   Ábrelo justo después de subir la web. Cuando existe
   private/config.php deja de funcionar; para generar un token nuevo,
   borra ese fichero desde el Administrador de archivos y vuelve aquí
   (los datos no se pierden).
   ══════════════════════════════════════════════════════════════ */
declare(strict_types=1);
define('RN_API', true);
require __DIR__ . '/private/lib.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');

function page(string $title, string $html): void
{
    echo '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<meta name="robots" content="noindex"><title>' . rn_e($title) . ' · RedesiaNet</title><style>'
        . 'body{margin:0;background:#000;color:#fff;font:16px/1.6 Inter,system-ui,Arial,sans-serif;padding:32px 18px}'
        . 'main{max-width:680px;margin:0 auto}h1{font-family:Georgia,serif;font-weight:500;font-size:2.2rem;margin:0 0 8px}'
        . 'h2{font-size:1.05rem;margin:28px 0 8px}p,li{color:#b6b6be}label{display:block;margin:14px 0 6px;font-weight:600}'
        . 'small{color:#8a8a92;font-weight:400}input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:1px solid #333;background:#0d0d10;color:#fff;font:inherit}'
        . '.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ok{color:#00E68A}.bad{color:#ff8a80}'
        . 'button,.btn{margin-top:26px;background:#00D4FF;color:#000;border:0;border-radius:999px;padding:14px 26px;font:600 1rem Inter,system-ui,sans-serif;cursor:pointer;text-decoration:none;display:inline-block}'
        . '.token{user-select:all;-webkit-user-select:all;cursor:text;font-family:ui-monospace,Consolas,monospace;font-size:1.05rem;background:#0d0d10;border:1px solid #00D4FF;border-radius:12px;padding:16px;word-break:break-all;color:#fff}'
        . '.box{border:1px solid #2a2a30;border-radius:16px;padding:16px 18px;margin:18px 0;background:#08080a}code{color:#00D4FF}'
        . '</style></head><body><main>' . $html . '</main></body></html>';
    exit;
}

if (is_file(rn_config_path())) {
    http_response_code(403);
    page('Ya instalado', '<h1>Ya está instalado</h1><p>La API de RedesiaNet ya está configurada. Si has perdido el token de la app de escritorio, borra <code>api/private/config.php</code> desde el Administrador de archivos de Hostinger y vuelve a abrir esta página: se genera un token nuevo y los datos se conservan.</p>');
}

/* ── Comprobaciones del servidor ──────────────────────────── */
$dataDir = __DIR__ . '/private/data';
$checks = [
    ['PHP 8.0 o superior', version_compare(PHP_VERSION, '8.0.0', '>='), 'Tienes PHP ' . PHP_VERSION . '. Cámbialo en hPanel → Avanzado → Configuración de PHP.'],
    ['Extensión pdo_sqlite', extension_loaded('pdo_sqlite'), 'Actívala en hPanel → Avanzado → Configuración de PHP → Extensiones.'],
    ['Carpeta private/ con permiso de escritura', is_writable(__DIR__ . '/private'), 'Dale permisos 755 a api/private desde el Administrador de archivos.'],
    ['Carpeta private/data/ con permiso de escritura', is_dir($dataDir) && is_writable($dataDir), 'Crea api/private/data (si no existe) con permisos 755.'],
];
$allOk = array_reduce($checks, fn ($c, $x) => $c && $x[1], true);

$host = $_SERVER['HTTP_HOST'] ?? 'redesianet.com';
$siteDefault = 'https://' . preg_replace('/^www\./', '', $host);

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || !$allOk) {
    $list = '';
    foreach ($checks as [$label, $ok, $help]) {
        $list .= '<li>' . ($ok ? '<span class="ok">✓</span> ' : '<span class="bad">✗</span> ') . rn_e($label) . ($ok ? '' : ' — ' . rn_e($help)) . '</li>';
    }
    $form = $allOk ? '<form method="post" autocomplete="off">
      <h2>Avisos</h2>
      <label>Email donde recibir los avisos de nuevos leads</label>
      <input type="email" name="notify_email" required value="redesianet.contact@gmail.com">
      <label>Remitente de los correos <small>(debe ser un buzón de tu dominio creado en Hostinger → Correos)</small></label>
      <input type="email" name="mail_from" required value="contact@' . rn_e(preg_replace('/^www\./', '', $host)) . '">
      <label>Dirección de la web</label>
      <input type="url" name="site_url" required value="' . rn_e($siteDefault) . '">
      <h2>SMTP <small>(opcional, recomendado: los correos llegan mejor)</small></h2>
      <p>Usa los datos del buzón de Hostinger: servidor <code>smtp.hostinger.com</code>, puerto <code>465</code>, tu email y su contraseña. Si lo dejas vacío se usa la función mail() de PHP.</p>
      <div class="row"><div><label>Servidor SMTP</label><input name="smtp_host" placeholder="smtp.hostinger.com"></div><div><label>Puerto</label><input name="smtp_port" value="465"></div></div>
      <div class="row"><div><label>Usuario</label><input name="smtp_user" placeholder="contact@' . rn_e(preg_replace('/^www\./', '', $host)) . '"></div><div><label>Contraseña</label><input type="password" name="smtp_pass"></div></div>
      <h2>Telegram <small>(opcional: aviso instantáneo en el móvil, sin datos personales)</small></h2>
      <div class="row"><div><label>Token del bot</label><input name="tg_token" placeholder="123456:ABC…"></div><div><label>Chat ID</label><input name="tg_chat" placeholder="123456789"></div></div>
      <button type="submit">Instalar y generar el token</button>
    </form>' : '<p class="bad">Corrige lo marcado en rojo y recarga esta página.</p>';
    page('Instalación', '<h1>Instalar la API de RedesiaNet</h1><p>Esto crea tu base de datos propia (sustituye a Google Sheets) y genera el token para la app de escritorio <b>RedesiaNet Monitor</b>.</p><h2>Comprobaciones</h2><ul>' . $list . '</ul>' . $form);
}

/* ── Instalación ──────────────────────────────────────────── */
$notify = filter_var(trim((string) ($_POST['notify_email'] ?? '')), FILTER_VALIDATE_EMAIL) ?: '';
$from = filter_var(trim((string) ($_POST['mail_from'] ?? '')), FILTER_VALIDATE_EMAIL) ?: '';
$site = rtrim(filter_var(trim((string) ($_POST['site_url'] ?? '')), FILTER_VALIDATE_URL) ?: $siteDefault, '/');
$siteHost = (string) parse_url($site, PHP_URL_HOST);
$bare = preg_replace('/^www\./', '', $siteHost);
$token = bin2hex(random_bytes(24));

$config = [
    'admin_token_sha256' => hash('sha256', $token),
    'site_url' => $site,
    'allowed_origins' => array_values(array_unique(['https://' . $bare, 'https://www.' . $bare])),
    'db_path' => '__DIR__/data/redesianet.sqlite',
    'notify_email' => $notify,
    'notify_newsletter' => true,
    'mail_from' => $from,
    'mail_from_name' => 'RedesiaNet',
    'smtp' => [
        'host' => rn_clean($_POST['smtp_host'] ?? '', 120),
        'port' => (int) ($_POST['smtp_port'] ?? 465) ?: 465,
        'user' => rn_clean($_POST['smtp_user'] ?? '', 160),
        'pass' => (string) ($_POST['smtp_pass'] ?? ''),
        'secure' => ((int) ($_POST['smtp_port'] ?? 465)) === 587 ? 'tls' : 'ssl',
    ],
    'telegram' => ['bot_token' => rn_clean($_POST['tg_token'] ?? '', 120), 'chat_id' => rn_clean($_POST['tg_chat'] ?? '', 40)],
    'newsletter_double_optin' => true,
    'trust_proxy_header' => '',
];
$php = "<?php\n// Generado por setup.php el " . date('d/m/Y H:i') . ". Contiene secretos: no lo compartas ni lo subas a un repositorio.\n"
    . 'return ' . str_replace("'__DIR__/data/redesianet.sqlite'", "__DIR__ . '/data/redesianet.sqlite'", var_export($config, true)) . ";\n";

if (file_put_contents(rn_config_path(), $php, LOCK_EX) === false) {
    page('Error', '<h1>No se pudo guardar</h1><p class="bad">No se puede escribir api/private/config.php. Revisa los permisos de la carpeta.</p>');
}
@chmod(rn_config_path(), 0640);

try {
    $db = rn_db();
    $db->exec('SELECT 1');
} catch (Throwable $e) {
    @unlink(rn_config_path());
    page('Error', '<h1>No se pudo crear la base de datos</h1><p class="bad">' . rn_e($e->getMessage()) . '</p>');
}

/* ¿La carpeta privada es accesible desde fuera? No debería. */
$probe = $site . '/api/private/data/.probe';
@file_put_contents($dataDir . '/.probe', 'x');
$ctx = stream_context_create(['http' => ['timeout' => 5, 'ignore_errors' => true], 'ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]);
$res = @file_get_contents($probe, false, $ctx);
@unlink($dataDir . '/.probe');
$exposed = $res === 'x';

$warn = $exposed
    ? '<div class="box"><p class="bad"><b>Atención:</b> la carpeta api/private es accesible desde internet. Comprueba que se subieron los ficheros .htaccess (en el Administrador de archivos, activa «Mostrar ficheros ocultos»).</p></div>'
    : '<div class="box"><p class="ok">✓ La carpeta privada está protegida.</p></div>';

page('Instalado', '<h1>¡Instalado!</h1><p>La base de datos está lista y los formularios de la web ya guardan aquí sus datos.</p>'
    . '<h2>Tu token para RedesiaNet Monitor</h2><p>Cópialo ahora: <b>no se volverá a mostrar</b>. Pégalo en la app junto con la dirección <code>' . rn_e($site) . '</code>.</p>'
    . '<div class="token">' . rn_e($token) . '</div><p><small>Un clic sobre el token lo selecciona entero; cópialo con Ctrl+C.</small></p>'
    . $warn
    . '<h2>Siguientes pasos</h2><ul><li>Envía una solicitud de prueba desde <a style="color:#00D4FF" href="' . rn_e($site) . '/contacto.html">el formulario de contacto</a>: debería llegarte el correo y aparecer en la app.</li>'
    . '<li>Si quieres máxima seguridad, borra <code>api/setup.php</code> del servidor (si lo necesitas otra vez, vuelve a subirlo).</li></ul>');
