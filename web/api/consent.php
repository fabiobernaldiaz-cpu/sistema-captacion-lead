<?php
/* ══════════════════════════════════════════════════════════════
   POST /api/consent.php — registro de decisiones del banner de
   cookies, para poder demostrar el consentimiento (art. 7.1 RGPD).
   Solo se guarda un identificador aleatorio, la elección, la versión,
   la página y el navegador (sin versión ni IP).
   ══════════════════════════════════════════════════════════════ */
declare(strict_types=1);
define('RN_API', true);
require __DIR__ . '/private/lib.php';

rn_only_post();
rn_check_origin();
$in = rn_input(2048);
if (!rn_throttle('consent:' . rn_ip_hash(), 40, 3600)) {
    rn_no_content();
}
$id = preg_replace('/[^a-zA-Z0-9\-]/', '', (string) ($in['id'] ?? ''));
$action = in_array($in['action'] ?? '', ['accept_all', 'reject_all', 'custom'], true) ? $in['action'] : '';
if ($id === '' || strlen($id) > 64 || $action === '') {
    rn_no_content();
}
[$browser] = rn_ua_info((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''));
rn_db()->prepare('INSERT INTO consents (created_at, consent_id, action, analytics, marketing, version, page, browser) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
   ->execute([time(), $id, $action, empty($in['analytics']) ? 0 : 1, empty($in['marketing']) ? 0 : 1,
              rn_clean($in['version'] ?? '', 20), rn_clean($in['page'] ?? '', 200), $browser]);
rn_no_content();
