<?php
/* ══════════════════════════════════════════════════════════════
   /api/admin.php — API privada para RedesiaNet Monitor (escritorio).
   Autenticación: cabecera X-RN-Token (o Authorization: Bearer) con el
   token que muestra setup.php. Se guarda solo su huella SHA-256.
   Acciones (?action=): ping · summary · events · leads · lead ·
   lead_update · lead_delete · subscribers · subscriber_delete · hits ·
   export
   ══════════════════════════════════════════════════════════════ */
declare(strict_types=1);
define('RN_API', true);
require __DIR__ . '/private/lib.php';

$cfg = rn_config();

/* ── Autenticación ────────────────────────────────────────── */
$token = (string) ($_SERVER['HTTP_X_RN_TOKEN'] ?? '');
if ($token === '') {
    $auth = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (stripos($auth, 'Bearer ') === 0) {
        $token = trim(substr($auth, 7));
    }
}
$failKey = 'auth:' . rn_ip_hash();
$db = rn_db();
$st = $db->prepare('SELECT n, reset_at FROM throttle WHERE k = ?');
$st->execute([$failKey]);
$fails = $st->fetch();
if ($fails && (int) $fails['reset_at'] > time() && (int) $fails['n'] >= 10) {
    rn_json(['ok' => false, 'error' => 'Demasiados intentos fallidos. Espera 15 minutos.'], 429);
}
if ($token === '' || !hash_equals((string) ($cfg['admin_token_sha256'] ?? ''), hash('sha256', $token))) {
    rn_throttle($failKey, 10, 900);
    usleep(400000);
    rn_json(['ok' => false, 'error' => 'Token no válido'], 401);
}

$action = (string) ($_GET['action'] ?? 'ping');
$isPost = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST';
$body = $isPost ? rn_input() : [];

function q_int(string $k, int $def, int $min, int $max): int
{
    $v = isset($_GET[$k]) ? (int) $_GET[$k] : $def;
    return max($min, min($max, $v));
}

function scalar(PDO $db, string $sql, array $args = [])
{
    $st = $db->prepare($sql);
    $st->execute($args);
    return $st->fetchColumn();
}

function rows(PDO $db, string $sql, array $args = []): array
{
    $st = $db->prepare($sql);
    $st->execute($args);
    return $st->fetchAll();
}

function lead_out(array $l): array
{
    $l['id'] = (int) $l['id'];
    $l['created_at'] = (int) $l['created_at'];
    $l['consent_privacy'] = (bool) $l['consent_privacy'];
    $l['consent_marketing'] = (bool) $l['consent_marketing'];
    $l['source'] = rn_lead_source($l);
    return $l;
}

switch ($action) {

    case 'ping':
        rn_json(['ok' => true, 'version' => RN_VERSION, 'time' => time(), 'tz' => date_default_timezone_get(),
                 'site' => $cfg['site_url'] ?? '',
                 'counts' => ['leads' => (int) scalar($db, 'SELECT COUNT(*) FROM leads'),
                              'hits' => (int) scalar($db, 'SELECT COUNT(*) FROM hits'),
                              'subscribers' => (int) scalar($db, "SELECT COUNT(*) FROM subscribers WHERE status = 'activo'")]]);

    case 'summary':
        $days = q_int('days', 30, 7, 365);
        $today = date('Y-m-d');
        $from = date('Y-m-d', strtotime("-" . ($days - 1) . " days"));
        $series = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $d = date('Y-m-d', strtotime("-$i days"));
            $series[$d] = ['day' => $d, 'pageviews' => 0, 'visitors' => 0, 'leads' => 0];
        }
        foreach (rows($db, "SELECT day, COUNT(*) pv, COUNT(DISTINCT visitor) uv FROM hits WHERE type = 'pageview' AND day >= ? GROUP BY day", [$from]) as $r) {
            if (isset($series[$r['day']])) {
                $series[$r['day']]['pageviews'] = (int) $r['pv'];
                $series[$r['day']]['visitors'] = (int) $r['uv'];
            }
        }
        foreach (rows($db, 'SELECT day, COUNT(*) n FROM leads WHERE day >= ? GROUP BY day', [$from]) as $r) {
            if (isset($series[$r['day']])) {
                $series[$r['day']]['leads'] = (int) $r['n'];
            }
        }
        $visitors = array_sum(array_column($series, 'visitors'));
        $leads = array_sum(array_column($series, 'leads'));
        $consents = rows($db, 'SELECT COUNT(*) total, SUM(analytics) yes FROM consents WHERE created_at >= ?', [strtotime($from)])[0];
        rn_json(['ok' => true, 'days' => $days, 'today' => [
                'pageviews' => (int) scalar($db, "SELECT COUNT(*) FROM hits WHERE day = ? AND type = 'pageview'", [$today]),
                'visitors' => (int) scalar($db, "SELECT COUNT(DISTINCT visitor) FROM hits WHERE day = ? AND type = 'pageview'", [$today]),
                'leads' => (int) scalar($db, 'SELECT COUNT(*) FROM leads WHERE day = ?', [$today]),
                'subscribers' => (int) scalar($db, 'SELECT COUNT(*) FROM subscribers WHERE day = ?', [$today]),
                'live' => (int) scalar($db, 'SELECT COUNT(DISTINCT visitor) FROM hits WHERE created_at >= ?', [time() - 300]),
            ],
            'range' => [
                'pageviews' => array_sum(array_column($series, 'pageviews')),
                'visitors' => $visitors,
                'leads' => $leads,
                'conversion' => $visitors > 0 ? round($leads / $visitors * 100, 2) : null,
                'subscribers' => (int) scalar($db, "SELECT COUNT(*) FROM subscribers WHERE status = 'activo'"),
                'consent_rate' => ((int) $consents['total']) > 0 ? round(((int) $consents['yes']) / ((int) $consents['total']) * 100, 1) : null,
                'new_leads' => (int) scalar($db, "SELECT COUNT(*) FROM leads WHERE status = 'nuevo'"),
            ],
            'series' => array_values($series),
            // GROUP BY 1: «label» también es una columna de hits y SQLite la preferiría al alias
            'top_pages' => rows($db, "SELECT path label, COUNT(*) n FROM hits WHERE type = 'pageview' AND day >= ? GROUP BY 1 ORDER BY n DESC LIMIT 8", [$from]),
            'top_sources' => rows($db, "SELECT COALESCE(NULLIF(utm_source, ''), NULLIF(ref_host, ''), 'Directo') label, COUNT(*) n FROM hits WHERE is_new = 1 AND day >= ? GROUP BY 1 ORDER BY n DESC LIMIT 8", [$from]),
            'devices' => rows($db, "SELECT device label, COUNT(*) n FROM hits WHERE is_new = 1 AND day >= ? GROUP BY 1 ORDER BY n DESC", [$from]),
            'cta' => rows($db, "SELECT label, COUNT(*) n FROM hits WHERE type = 'cta' AND day >= ? GROUP BY label ORDER BY n DESC LIMIT 6", [$from]),
            'leads_by_plan' => rows($db, "SELECT COALESCE(NULLIF(plan, ''), 'Sin decidir') label, COUNT(*) n FROM leads WHERE day >= ? GROUP BY 1 ORDER BY n DESC", [$from]),
            'leads_by_status' => rows($db, 'SELECT status label, COUNT(*) n FROM leads GROUP BY 1'),
        ]);

    case 'events':
        // Primera llamada (after_* = -1): solo devuelve los últimos id, para no
        // inundar de avisos al abrir la app.
        $aL = (int) ($_GET['after_lead'] ?? -1);
        $aH = (int) ($_GET['after_hit'] ?? -1);
        $aS = (int) ($_GET['after_sub'] ?? -1);
        $out = ['ok' => true,
            'last_lead' => (int) scalar($db, 'SELECT COALESCE(MAX(id), 0) FROM leads'),
            'last_hit' => (int) scalar($db, 'SELECT COALESCE(MAX(id), 0) FROM hits'),
            'last_sub' => (int) scalar($db, 'SELECT COALESCE(MAX(id), 0) FROM subscribers'),
            'leads' => [], 'hits' => [], 'subscribers' => []];
        if ($aL >= 0) {
            $out['leads'] = array_map('lead_out', rows($db, 'SELECT * FROM leads WHERE id > ? ORDER BY id LIMIT 50', [$aL]));
        }
        if ($aH >= 0) {
            $out['hits'] = rows($db, 'SELECT id, created_at, type, path, label, ref_host, utm_source, device, browser, os, is_new FROM hits WHERE id > ? ORDER BY id LIMIT 200', [$aH]);
        }
        if ($aS >= 0) {
            $out['subscribers'] = rows($db, 'SELECT id, email, status, source, created_at FROM subscribers WHERE id > ? ORDER BY id LIMIT 50', [$aS]);
        }
        rn_json($out);

    case 'leads':
        $where = [];
        $args = [];
        $status = (string) ($_GET['status'] ?? '');
        if (in_array($status, RN_LEAD_STATUSES, true)) {
            $where[] = 'status = ?';
            $args[] = $status;
        }
        $q = rn_clean($_GET['q'] ?? '', 80);
        if ($q !== '') {
            $where[] = "(name LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR process LIKE ? ESCAPE '\\')";
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $q) . '%';
            array_push($args, $like, $like, $like, $like);
        }
        $sqlWhere = $where ? ' WHERE ' . implode(' AND ', $where) : '';
        $limit = q_int('limit', 50, 1, 500);
        $offset = q_int('offset', 0, 0, 1000000);
        $total = (int) scalar($db, 'SELECT COUNT(*) FROM leads' . $sqlWhere, $args);
        $list = rows($db, 'SELECT * FROM leads' . $sqlWhere . " ORDER BY created_at DESC, id DESC LIMIT $limit OFFSET $offset", $args);
        rn_json(['ok' => true, 'total' => $total, 'leads' => array_map('lead_out', $list)]);

    case 'lead':
        $r = rows($db, 'SELECT * FROM leads WHERE id = ?', [q_int('id', 0, 0, PHP_INT_MAX)]);
        if (!$r) {
            rn_json(['ok' => false, 'error' => 'No existe'], 404);
        }
        rn_json(['ok' => true, 'lead' => lead_out($r[0])]);

    case 'lead_update':
        if (!$isPost) {
            rn_json(['ok' => false, 'error' => 'Usa POST'], 405);
        }
        $id = (int) ($body['id'] ?? 0);
        $sets = ['updated_at = ?'];
        $args = [time()];
        if (isset($body['status'])) {
            if (!in_array($body['status'], RN_LEAD_STATUSES, true)) {
                rn_json(['ok' => false, 'error' => 'Estado no válido'], 422);
            }
            $sets[] = 'status = ?';
            $args[] = $body['status'];
        }
        if (isset($body['notes'])) {
            $sets[] = 'notes = ?';
            $args[] = rn_clean($body['notes'], 5000, true);
        }
        $args[] = $id;
        $st = $db->prepare('UPDATE leads SET ' . implode(', ', $sets) . ' WHERE id = ?');
        $st->execute($args);
        if (!$st->rowCount()) {
            rn_json(['ok' => false, 'error' => 'No existe'], 404);
        }
        rn_json(['ok' => true, 'lead' => lead_out(rows($db, 'SELECT * FROM leads WHERE id = ?', [$id])[0])]);

    case 'lead_delete':
        if (!$isPost) {
            rn_json(['ok' => false, 'error' => 'Usa POST'], 405);
        }
        $db->prepare('DELETE FROM leads WHERE id = ?')->execute([(int) ($body['id'] ?? 0)]);
        rn_json(['ok' => true]);

    case 'subscribers':
        $status = (string) ($_GET['status'] ?? '');
        $args = [];
        $w = '';
        if (in_array($status, ['pendiente', 'activo', 'baja'], true)) {
            $w = ' WHERE status = ?';
            $args[] = $status;
        }
        $limit = q_int('limit', 200, 1, 2000);
        $base = rtrim($cfg['site_url'] ?? '', '/');
        $list = array_map(function ($s) use ($base) {
            $s['id'] = (int) $s['id'];
            $s['unsubscribe_url'] = $base . '/api/unsubscribe.php?t=' . $s['token'];
            unset($s['token']);
            return $s;
        }, rows($db, 'SELECT * FROM subscribers' . $w . " ORDER BY id DESC LIMIT $limit", $args));
        rn_json(['ok' => true, 'total' => (int) scalar($db, 'SELECT COUNT(*) FROM subscribers' . $w, $args), 'subscribers' => $list]);

    case 'subscriber_delete':
        if (!$isPost) {
            rn_json(['ok' => false, 'error' => 'Usa POST'], 405);
        }
        $db->prepare('DELETE FROM subscribers WHERE id = ?')->execute([(int) ($body['id'] ?? 0)]);
        rn_json(['ok' => true]);

    case 'hits':
        $limit = q_int('limit', 100, 1, 500);
        rn_json(['ok' => true, 'hits' => rows($db, "SELECT id, created_at, type, path, label, ref_host, utm_source, device, browser, os, is_new FROM hits ORDER BY created_at DESC, id DESC LIMIT $limit")]);

    case 'export':
        $type = ($_GET['type'] ?? '') === 'subscribers' ? 'subscribers' : 'leads';
        rn_headers();
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="redesianet-' . $type . '-' . date('Y-m-d') . '.csv"');
        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF"); // BOM: Excel abre bien los acentos
        if ($type === 'leads') {
            fputcsv($out, ['ID', 'Fecha', 'Estado', 'Nombre', 'Empresa', 'Email', 'Teléfono', 'Tamaño', 'Plan', 'Modalidad', 'Proceso', 'Origen', 'Newsletter', 'Notas'], ';');
            foreach (rows($db, 'SELECT * FROM leads ORDER BY id DESC') as $l) {
                fputcsv($out, [$l['id'], date('d/m/Y H:i', (int) $l['created_at']), $l['status'], $l['name'], $l['company'], $l['email'],
                    $l['phone'], $l['employees'], $l['plan'], $l['billing'], $l['process'], rn_lead_source($l),
                    $l['consent_marketing'] ? 'sí' : 'no', $l['notes']], ';');
            }
        } else {
            fputcsv($out, ['ID', 'Email', 'Estado', 'Origen', 'Alta', 'Confirmado', 'Enlace de baja'], ';');
            $base = rtrim($cfg['site_url'] ?? '', '/');
            foreach (rows($db, 'SELECT * FROM subscribers ORDER BY id DESC') as $s) {
                fputcsv($out, [$s['id'], $s['email'], $s['status'], $s['source'], date('d/m/Y H:i', (int) $s['created_at']),
                    $s['confirmed_at'] ? date('d/m/Y H:i', (int) $s['confirmed_at']) : '', $base . '/api/unsubscribe.php?t=' . $s['token']], ';');
            }
        }
        fclose($out);
        exit;

    default:
        rn_json(['ok' => false, 'error' => 'Acción desconocida'], 400);
}
