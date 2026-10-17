<?php
/* ══════════════════════════════════════════════════════════════
   RedesiaNet API · núcleo compartido
   Base de datos propia (SQLite, un único fichero en esta carpeta
   privada), avisos instantáneos (correo + Telegram opcional) y
   utilidades de seguridad. Lo incluyen los endpoints de /api.
   PHP 8.0 o superior.
   ══════════════════════════════════════════════════════════════ */
declare(strict_types=1);

if (!defined('RN_API')) {
    http_response_code(404);
    exit;
}

const RN_VERSION = '1.0.0';
const RN_SCHEMA = 1;
const RN_LEAD_STATUSES = ['nuevo', 'contactado', 'propuesta', 'cliente', 'descartado'];

date_default_timezone_set('Europe/Madrid');
mb_internal_encoding('UTF-8');

/* ── Configuración ────────────────────────────────────────── */
function rn_config_path(): string
{
    return __DIR__ . '/config.php';
}

function rn_config(): array
{
    static $cfg = null;
    if ($cfg === null) {
        if (!is_file(rn_config_path())) {
            rn_json(['ok' => false, 'error' => 'La API aún no está instalada. Abre /api/setup.php.'], 503);
        }
        $cfg = require rn_config_path();
    }
    return $cfg;
}

/* ── Respuestas ───────────────────────────────────────────── */
function rn_headers(): void
{
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
}

function rn_json(array $data, int $status = 200): void
{
    rn_headers();
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function rn_no_content(): void
{
    rn_headers();
    http_response_code(204);
    exit;
}

/* Responde ya al navegador y sigue trabajando (avisos por correo, etc.)
   para que el visitante no espere al servidor de correo. */
function rn_respond_then_continue(array $data, int $status = 200): void
{
    ignore_user_abort(true);
    rn_headers();
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    $body = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    header('Content-Length: ' . strlen($body));
    header('Connection: close');
    echo $body;
    if (function_exists('litespeed_finish_request')) {
        litespeed_finish_request();
    } elseif (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } else {
        @ob_end_flush();
        flush();
    }
}

function rn_only_post(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        header('Allow: POST');
        rn_json(['ok' => false, 'error' => 'Método no permitido'], 405);
    }
}

/* Cuerpo JSON (también llega como text/plain desde sendBeacon) */
function rn_input(int $max = 32768): array
{
    $raw = file_get_contents('php://input', false, null, 0, $max + 1);
    if ($raw === false || $raw === '') {
        return [];
    }
    if (strlen($raw) > $max) {
        rn_json(['ok' => false, 'error' => 'Petición demasiado grande'], 413);
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/* Solo aceptamos peticiones del propio sitio (los navegadores envían
   Origin en los POST). Las que no traen Origin pasan, pero siguen
   sujetas a la trampa anti-bots y al límite de envíos. */
function rn_check_origin(): void
{
    if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
        rn_json(['ok' => false, 'error' => 'Origen no permitido'], 403);
    }
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') {
        return;
    }
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $allowed = array_merge(rn_config()['allowed_origins'] ?? [], ['https://' . $host, 'http://' . $host]);
    if (!in_array(rtrim($origin, '/'), $allowed, true)) {
        rn_json(['ok' => false, 'error' => 'Origen no permitido'], 403);
    }
}

/* ── Base de datos ────────────────────────────────────────── */
function rn_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $cfg = rn_config();
    $path = $cfg['db_path'] ?? (__DIR__ . '/data/redesianet.sqlite');
    $pdo = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA busy_timeout = 5000');
    $pdo->exec('PRAGMA foreign_keys = ON');
    rn_migrate($pdo);
    if (random_int(1, 50) === 1) {
        rn_housekeeping($pdo);
    }
    return $pdo;
}

function rn_migrate(PDO $db): void
{
    $db->exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)');
    $ver = (int) ($db->query("SELECT v FROM meta WHERE k = 'schema'")->fetchColumn() ?: 0);
    if ($ver >= RN_SCHEMA) {
        return;
    }
    $db->beginTransaction();
    $db->exec("CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        day TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        company TEXT NOT NULL,
        phone TEXT,
        employees TEXT,
        plan TEXT,
        billing TEXT,
        process TEXT,
        page TEXT,
        landing TEXT,
        ref_host TEXT,
        utm_source TEXT,
        utm_medium TEXT,
        utm_campaign TEXT,
        consent_privacy INTEGER NOT NULL DEFAULT 0,
        consent_marketing INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'nuevo',
        notes TEXT,
        updated_at INTEGER
    )");
    $db->exec('CREATE INDEX IF NOT EXISTS leads_day ON leads(day)');
    $db->exec('CREATE INDEX IF NOT EXISTS leads_status ON leads(status)');
    $db->exec("CREATE TABLE IF NOT EXISTS subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pendiente',
        source TEXT,
        token TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        day TEXT NOT NULL,
        confirmed_at INTEGER,
        unsubscribed_at INTEGER,
        consent_text TEXT
    )");
    $db->exec('CREATE INDEX IF NOT EXISTS subs_token ON subscribers(token)');
    $db->exec("CREATE TABLE IF NOT EXISTS hits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        day TEXT NOT NULL,
        type TEXT NOT NULL,
        path TEXT,
        label TEXT,
        ref_host TEXT,
        utm_source TEXT,
        utm_medium TEXT,
        utm_campaign TEXT,
        device TEXT,
        browser TEXT,
        os TEXT,
        lang TEXT,
        visitor TEXT NOT NULL,
        is_new INTEGER NOT NULL DEFAULT 0
    )");
    $db->exec('CREATE INDEX IF NOT EXISTS hits_day ON hits(day, type)');
    $db->exec('CREATE INDEX IF NOT EXISTS hits_visitor ON hits(day, visitor)');
    $db->exec("CREATE TABLE IF NOT EXISTS consents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        consent_id TEXT NOT NULL,
        action TEXT NOT NULL,
        analytics INTEGER NOT NULL DEFAULT 0,
        marketing INTEGER NOT NULL DEFAULT 0,
        version TEXT,
        page TEXT,
        browser TEXT
    )");
    $db->exec('CREATE INDEX IF NOT EXISTS consents_created ON consents(created_at)');
    $db->exec('CREATE TABLE IF NOT EXISTS throttle (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset_at INTEGER NOT NULL)');
    $db->exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('schema', '" . RN_SCHEMA . "')");
    $db->commit();
}

/* Plazos de conservación de la política de privacidad, aplicados solos */
function rn_housekeeping(PDO $db): void
{
    $now = time();
    $db->prepare('DELETE FROM hits WHERE created_at < ?')->execute([$now - 425 * 86400]);              // 14 meses
    $db->prepare('DELETE FROM consents WHERE created_at < ?')->execute([$now - 3 * 365 * 86400]);     // 3 años
    $db->prepare("DELETE FROM leads WHERE created_at < ? AND status IN ('nuevo','contactado','descartado')")
       ->execute([$now - 365 * 86400]);                                                              // 12 meses sin relación
    $db->prepare("DELETE FROM subscribers WHERE status = 'pendiente' AND created_at < ?")->execute([$now - 30 * 86400]);
    $db->prepare("DELETE FROM subscribers WHERE status = 'baja' AND unsubscribed_at < ?")->execute([$now - 3 * 365 * 86400]);
    $db->prepare('DELETE FROM throttle WHERE reset_at < ?')->execute([$now]);
    $db->prepare("DELETE FROM meta WHERE k LIKE 'salt:%' AND k < ?")->execute(['salt:' . date('Y-m-d', $now - 86400)]);
}

/* ── Identificadores sin datos personales ─────────────────── */
function rn_client_ip(): string
{
    $hdr = rn_config()['trust_proxy_header'] ?? '';
    if ($hdr !== '' && !empty($_SERVER[$hdr])) {
        return trim(explode(',', (string) $_SERVER[$hdr])[0]);
    }
    return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

/* Sal aleatoria que cambia cada día y se borra al siguiente: el código
   de visitante no se puede relacionar entre días ni revertir a la IP. */
function rn_day_salt(?string $day = null): string
{
    $day = $day ?? date('Y-m-d');
    $db = rn_db();
    $k = 'salt:' . $day;
    $st = $db->prepare('SELECT v FROM meta WHERE k = ?');
    $st->execute([$k]);
    $salt = $st->fetchColumn();
    if (!$salt) {
        $salt = bin2hex(random_bytes(32));
        $db->prepare('INSERT OR IGNORE INTO meta (k, v) VALUES (?, ?)')->execute([$k, $salt]);
        $st->execute([$k]);
        $salt = $st->fetchColumn();
    }
    return (string) $salt;
}

function rn_visitor_hash(): string
{
    $ua = (string) ($_SERVER['HTTP_USER_AGENT'] ?? '');
    return substr(hash_hmac('sha256', 'v|' . rn_client_ip() . '|' . $ua, rn_day_salt()), 0, 20);
}

function rn_ip_hash(): string
{
    return substr(hash_hmac('sha256', 'ip|' . rn_client_ip(), rn_day_salt()), 0, 20);
}

/* Límite de peticiones por ventana de tiempo. true = permitido */
function rn_throttle(string $key, int $max, int $window): bool
{
    $db = rn_db();
    $now = time();
    $st = $db->prepare('SELECT n, reset_at FROM throttle WHERE k = ?');
    $st->execute([$key]);
    $row = $st->fetch();
    if (!$row || (int) $row['reset_at'] < $now) {
        $db->prepare('INSERT OR REPLACE INTO throttle (k, n, reset_at) VALUES (?, 1, ?)')->execute([$key, $now + $window]);
        return true;
    }
    if ((int) $row['n'] >= $max) {
        return false;
    }
    $db->prepare('UPDATE throttle SET n = n + 1 WHERE k = ?')->execute([$key]);
    return true;
}

/* ── Limpieza de entradas ─────────────────────────────────── */
function rn_clean($value, int $max, bool $multiline = false): string
{
    if (!is_string($value) && !is_numeric($value)) {
        return '';
    }
    $s = (string) $value;
    if (!mb_check_encoding($s, 'UTF-8')) {
        $s = mb_convert_encoding($s, 'UTF-8', 'UTF-8');
    }
    $s = $multiline
        ? preg_replace('/[^\P{C}\n\t]/u', '', $s)
        : preg_replace('/\p{C}/u', ' ', $s);
    $s = trim(preg_replace($multiline ? '/[ \t]+/u' : '/\s+/u', ' ', (string) $s));
    return mb_substr($s, 0, $max);
}

function rn_host_of(string $url): string
{
    $h = parse_url($url, PHP_URL_HOST);
    if (!is_string($h)) {
        return '';
    }
    return mb_substr(preg_replace('/^www\./i', '', strtolower($h)), 0, 120);
}

function rn_is_bot(string $ua): bool
{
    return $ua === '' || (bool) preg_match('/bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|pagespeed|pingdom|uptime|monitor|python|curl|wget|httpclient|java\/|go-http|node-fetch|axios|preview|scan/i', $ua);
}

function rn_ua_info(string $ua): array
{
    $b = 'Otro';
    if (strpos($ua, 'Edg/') !== false) $b = 'Edge';
    elseif (preg_match('/OPR\/|Opera/', $ua)) $b = 'Opera';
    elseif (strpos($ua, 'SamsungBrowser') !== false) $b = 'Samsung';
    elseif (strpos($ua, 'Firefox/') !== false) $b = 'Firefox';
    elseif (strpos($ua, 'Chrome/') !== false) $b = 'Chrome';
    elseif (strpos($ua, 'Safari/') !== false) $b = 'Safari';
    $o = 'Otro';
    if (strpos($ua, 'Windows') !== false) $o = 'Windows';
    elseif (strpos($ua, 'Android') !== false) $o = 'Android';
    elseif (preg_match('/iPhone|iPad|iPod/', $ua)) $o = 'iOS';
    elseif (preg_match('/Macintosh|Mac OS X/', $ua)) $o = 'macOS';
    elseif (strpos($ua, 'Linux') !== false) $o = 'Linux';
    return [$b, $o];
}

/* ── Correo ───────────────────────────────────────────────── */
function rn_header_safe(string $s): string
{
    return trim(str_replace(["\r", "\n"], ' ', $s));
}

function rn_mime_header(string $s): string
{
    return preg_match('/[^\x20-\x7e]/', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
}

/* Envía un correo por SMTP (si está configurado) o con mail().
   Devuelve true si el servidor lo aceptó. */
function rn_mail(string $to, string $subject, string $text, ?string $html = null, array $extra = []): bool
{
    $cfg = rn_config();
    $from = rn_header_safe($cfg['mail_from'] ?? '');
    $fromName = rn_header_safe($cfg['mail_from_name'] ?? 'RedesiaNet');
    $to = rn_header_safe($to);
    if (!filter_var($to, FILTER_VALIDATE_EMAIL) || !filter_var($from, FILTER_VALIDATE_EMAIL)) {
        return false;
    }
    // saltos de línea reales (CRLF) antes de codificar: si no, quedarían como =0A
    $crlf = fn (string $s): string => str_replace(["\r\n", "\r", "\n"], ["\n", "\n", "\r\n"], $s);
    $text = $crlf($text);
    $html = $html === null ? null : $crlf($html);
    $domain = substr(strrchr($from, '@') ?: '@redesianet.com', 1);
    $headers = [
        'Date' => date('r'),
        'From' => rn_mime_header($fromName) . ' <' . $from . '>',
        'Message-ID' => '<' . bin2hex(random_bytes(12)) . '@' . $domain . '>',
        'MIME-Version' => '1.0',
    ];
    foreach ($extra as $k => $v) {
        $headers[rn_header_safe((string) $k)] = rn_header_safe((string) $v);
    }
    if ($html !== null) {
        $boundary = 'rn-' . bin2hex(random_bytes(10));
        $headers['Content-Type'] = 'multipart/alternative; boundary="' . $boundary . '"';
        $body = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n"
            . quoted_printable_encode($text) . "\r\n--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: quoted-printable\r\n\r\n" . quoted_printable_encode($html) . "\r\n--$boundary--\r\n";
    } else {
        $headers['Content-Type'] = 'text/plain; charset=UTF-8';
        $headers['Content-Transfer-Encoding'] = 'quoted-printable';
        $body = quoted_printable_encode($text);
    }
    $smtp = $cfg['smtp'] ?? [];
    if (!empty($smtp['host']) && !empty($smtp['user'])) {
        return rn_smtp_send($smtp, $from, $to, rn_mime_header($subject), $headers, $body);
    }
    $lines = [];
    foreach ($headers as $k => $v) {
        $lines[] = "$k: $v";
    }
    return @mail($to, rn_mime_header($subject), $body, implode("\r\n", $lines), '-f' . $from);
}

/* Cliente SMTP mínimo (SSL en 465 o STARTTLS en 587), sin dependencias */
function rn_smtp_send(array $smtp, string $from, string $to, string $subject, array $headers, string $body): bool
{
    $secure = $smtp['secure'] ?? 'ssl';
    $remote = ($secure === 'ssl' ? 'ssl://' : 'tcp://') . $smtp['host'] . ':' . (int) ($smtp['port'] ?? 465);
    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
    $fp = @stream_socket_client($remote, $errno, $errstr, 12, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) {
        error_log("RedesiaNet SMTP: no conecta ($errstr)");
        return false;
    }
    stream_set_timeout($fp, 12);
    $read = function () use ($fp): string {
        $data = '';
        while (($line = fgets($fp, 1024)) !== false) {
            $data .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') {
                break;
            }
        }
        return $data;
    };
    $cmd = function (?string $c, array $ok) use ($fp, $read): string {
        if ($c !== null) {
            fwrite($fp, $c . "\r\n");
        }
        $r = $read();
        if (!in_array((int) substr($r, 0, 3), $ok, true)) {
            throw new RuntimeException(trim($r));
        }
        return $r;
    };
    try {
        $me = preg_replace('/[^a-z0-9.\-]/i', '', $_SERVER['SERVER_NAME'] ?? 'localhost') ?: 'localhost';
        $cmd(null, [220]);
        $cmd('EHLO ' . $me, [250]);
        if ($secure === 'tls') {
            $cmd('STARTTLS', [220]);
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT)) {
                throw new RuntimeException('STARTTLS falló');
            }
            $cmd('EHLO ' . $me, [250]);
        }
        $cmd('AUTH LOGIN', [334]);
        $cmd(base64_encode((string) $smtp['user']), [334]);
        $cmd(base64_encode((string) $smtp['pass']), [235]);
        $cmd('MAIL FROM:<' . $from . '>', [250]);
        $cmd('RCPT TO:<' . $to . '>', [250, 251]);
        $cmd('DATA', [354]);
        $msg = 'To: ' . $to . "\r\nSubject: " . $subject . "\r\n";
        foreach ($headers as $k => $v) {
            $msg .= "$k: $v\r\n";
        }
        $msg .= "\r\n" . preg_replace('/^\./m', '..', str_replace(["\r\n", "\n"], ["\n", "\r\n"], $body));
        $cmd($msg . "\r\n.", [250]);
        $cmd('QUIT', [221]);
        fclose($fp);
        return true;
    } catch (Throwable $e) {
        error_log('RedesiaNet SMTP: ' . $e->getMessage());
        fclose($fp);
        return false;
    }
}

/* Telegram opcional: aviso al móvil. Nunca lleva datos personales. */
function rn_telegram(string $text): void
{
    $t = rn_config()['telegram'] ?? [];
    if (empty($t['bot_token']) || empty($t['chat_id'])) {
        return;
    }
    $url = 'https://api.telegram.org/bot' . $t['bot_token'] . '/sendMessage';
    $payload = http_build_query(['chat_id' => $t['chat_id'], 'text' => $text, 'disable_web_page_preview' => 'true']);
    $ctx = stream_context_create(['http' => [
        'method' => 'POST', 'timeout' => 5, 'ignore_errors' => true,
        'header' => "Content-Type: application/x-www-form-urlencoded\r\n", 'content' => $payload,
    ]]);
    @file_get_contents($url, false, $ctx);
}

function rn_e(?string $s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/* Aviso de lead nuevo: correo completo (con «Responder» directo al
   cliente) y, si está configurado, un toque en Telegram sin datos. */
function rn_notify_lead(array $lead): void
{
    $cfg = rn_config();
    $to = $cfg['notify_email'] ?? '';
    $plan = $lead['plan'] !== '' ? $lead['plan'] : 'sin decidir';
    $billing = $lead['billing'] === 'anual' ? 'permanencia 12 meses (−20 %)' : 'sin permanencia';
    $rows = [
        'Nombre' => $lead['name'], 'Empresa' => $lead['company'], 'Email' => $lead['email'],
        'Teléfono' => $lead['phone'] ?: '—', 'Tamaño' => $lead['employees'] ?: '—',
        'Plan' => $plan, 'Modalidad' => $billing, 'Origen' => rn_lead_source($lead),
        'Newsletter' => $lead['consent_marketing'] ? 'Sí' : 'No',
    ];
    $text = "Nueva solicitud de auditoría en redesianet.com\n\n";
    $html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#111;max-width:560px">'
        . '<p style="font-size:18px;margin:0 0 14px"><b>Nueva solicitud de auditoría</b></p><table style="border-collapse:collapse;width:100%">';
    foreach ($rows as $k => $v) {
        $text .= str_pad($k . ':', 12) . $v . "\n";
        $html .= '<tr><td style="padding:6px 10px 6px 0;color:#666;white-space:nowrap">' . rn_e($k) . '</td><td style="padding:6px 0">' . rn_e((string) $v) . '</td></tr>';
    }
    $text .= "\nQué quiere automatizar:\n" . $lead['process'] . "\n\nResponde a este correo para escribirle directamente. Gestiona el lead en RedesiaNet Monitor.\n";
    $html .= '</table><p style="margin:18px 0 6px;color:#666">Qué quiere automatizar</p><p style="margin:0;white-space:pre-wrap;background:#f4f4f4;padding:12px 14px;border-radius:8px">'
        . rn_e($lead['process']) . '</p><p style="color:#666;font-size:13px;margin-top:18px">Responde a este correo para escribirle directamente. Gestiona el lead en RedesiaNet Monitor.</p></div>';
    if ($to) {
        rn_mail($to, 'Nuevo lead: ' . $lead['company'] . ' · ' . $plan, $text, $html, ['Reply-To' => $lead['email']]);
    }
    rn_telegram('🔔 Nueva solicitud de auditoría en redesianet.com (plan: ' . $plan . '). Ábrela en RedesiaNet Monitor.');
}

function rn_lead_source(array $l): string
{
    if (!empty($l['utm_source'])) {
        return $l['utm_source'] . (!empty($l['utm_campaign']) ? ' / ' . $l['utm_campaign'] : '');
    }
    return !empty($l['ref_host']) ? $l['ref_host'] : 'Directo o sin medir';
}

/* ── Newsletter con doble confirmación ────────────────────── */
function rn_subscribe(string $email, string $source): string
{
    $db = rn_db();
    $cfg = rn_config();
    $st = $db->prepare('SELECT * FROM subscribers WHERE email = ?');
    $st->execute([$email]);
    $row = $st->fetch();
    if ($row && $row['status'] === 'activo') {
        return 'Ya estabas suscrito. ¡Gracias!';
    }
    $token = bin2hex(random_bytes(16));
    $now = time();
    $consent = 'Acepto recibir la newsletter de RedesiaNet (' . $source . ')';
    if ($row) {
        $db->prepare("UPDATE subscribers SET status = 'pendiente', token = ?, source = ?, created_at = ?, day = ?, consent_text = ?, unsubscribed_at = NULL WHERE id = ?")
           ->execute([$token, $source, $now, date('Y-m-d'), $consent, $row['id']]);
    } else {
        $db->prepare("INSERT INTO subscribers (email, status, source, token, created_at, day, consent_text) VALUES (?, 'pendiente', ?, ?, ?, ?, ?)")
           ->execute([$email, $source, $token, $now, date('Y-m-d'), $consent]);
    }
    if (empty($cfg['newsletter_double_optin'])) {
        $db->prepare("UPDATE subscribers SET status = 'activo', confirmed_at = ? WHERE token = ?")->execute([$now, $token]);
        return 'Suscripción confirmada. Una idea al mes, sin humo.';
    }
    $base = rtrim($cfg['site_url'] ?? '', '/');
    $link = $base . '/api/confirm.php?t=' . $token;
    $text = "Hola:\n\nPara confirmar tu suscripción a la newsletter de RedesiaNet, abre este enlace:\n$link\n\n"
        . "Si no la has pedido tú, ignora este correo y no volverás a saber de nosotros.\n\nRedesiaNet · redesianet.com";
    $html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#111;max-width:520px"><p>Hola:</p>'
        . '<p>Para confirmar tu suscripción a la newsletter de RedesiaNet, pulsa el botón:</p>'
        . '<p><a href="' . rn_e($link) . '" style="display:inline-block;background:#000;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none">Confirmar suscripción</a></p>'
        . '<p style="color:#666;font-size:13px">Si no la has pedido tú, ignora este correo y no volverás a saber de nosotros.</p></div>';
    $sent = rn_mail($email, 'Confirma tu suscripción a RedesiaNet', $text, $html);
    return $sent
        ? 'Te hemos enviado un correo para confirmar la suscripción.'
        : 'Suscripción registrada. Si no te llega el correo de confirmación, escríbenos.';
}

/* Página HTML mínima para confirmación y baja */
function rn_page(string $title, string $message, int $status = 200, string $extra = ''): void
{
    rn_headers();
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<meta name="robots" content="noindex"><title>' . rn_e($title) . ' | RedesiaNet</title>'
        . '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#fff;font-family:Inter,system-ui,Arial,sans-serif;padding:24px}'
        . 'main{max-width:520px;text-align:center}h1{font-family:Georgia,serif;font-weight:500;font-size:2.4rem;margin:0 0 12px}p{color:#b0b0b8;line-height:1.6}'
        . 'a,button{display:inline-block;margin-top:18px;background:#00D4FF;color:#000;padding:13px 24px;border-radius:999px;text-decoration:none;font-weight:600;border:0;font-size:1rem;cursor:pointer}</style></head>'
        . '<body><main><h1>' . rn_e($title) . '</h1><p>' . $message . '</p>' . $extra . '</main></body></html>';
    exit;
}
