<?php
/* ══════════════════════════════════════════════════════════════
   POST /api/hit.php — analítica propia. La web solo llama aquí si el
   visitante ha aceptado la analítica en el banner de cookies.
   No se guarda la IP ni nada en el dispositivo: el visitante se cuenta
   con un código que cambia cada día (ver rn_visitor_hash).
   ══════════════════════════════════════════════════════════════ */
declare(strict_types=1);
define('RN_API', true);
require __DIR__ . '/private/lib.php';

rn_only_post();
rn_check_origin();
$ua = (string) ($_SERVER['HTTP_USER_AGENT'] ?? '');
if (rn_is_bot($ua)) {
    rn_no_content();
}
$in = rn_input(4096);
$visitor = rn_visitor_hash();
if (!rn_throttle('hit:' . $visitor, 120, 60)) {
    rn_no_content();
}

$types = ['pageview', 'cta', 'form_start', 'lead', 'newsletter', 'billing'];
$type = in_array($in['t'] ?? '', $types, true) ? $in['t'] : 'event';
$path = rn_clean($in['p'] ?? '/', 200);
if ($path === '' || $path[0] !== '/') {
    $path = '/';
}
$w = (int) ($in['w'] ?? 0);
$device = $w <= 0 ? 'desconocido' : ($w < 760 ? 'móvil' : ($w < 1100 ? 'tablet' : 'escritorio'));
[$browser, $os] = rn_ua_info($ua);

$db = rn_db();
$day = date('Y-m-d');
$isNew = 0;
if ($type === 'pageview') {
    $st = $db->prepare("SELECT 1 FROM hits WHERE day = ? AND visitor = ? AND type = 'pageview' LIMIT 1");
    $st->execute([$day, $visitor]);
    $isNew = $st->fetchColumn() ? 0 : 1;
}
$db->prepare('INSERT INTO hits (created_at, day, type, path, label, ref_host, utm_source, utm_medium, utm_campaign, device, browser, os, lang, visitor, is_new)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
   ->execute([time(), $day, $type, $path, rn_clean($in['l'] ?? '', 120), rn_host_of((string) ($in['r'] ?? '')),
              rn_clean($in['us'] ?? '', 80), rn_clean($in['um'] ?? '', 80), rn_clean($in['uc'] ?? '', 120),
              $device, $browser, $os, rn_clean($in['lg'] ?? '', 12), $visitor, $isNew]);
rn_no_content();
