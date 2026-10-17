<?php
/* GET /api/confirm.php?t=… — confirma la suscripción a la newsletter (doble opt-in) */
declare(strict_types=1);
define('RN_API', true);
require __DIR__ . '/private/lib.php';

$token = preg_replace('/[^a-f0-9]/', '', (string) ($_GET['t'] ?? ''));
$site = rn_e(rtrim(rn_config()['site_url'] ?? '/', '/') . '/');
if (strlen($token) !== 32) {
    rn_page('Enlace no válido', 'Este enlace de confirmación no es correcto o ha caducado.', 400, '<a href="' . $site . '">Ir a la web</a>');
}
$db = rn_db();
$st = $db->prepare('SELECT id, status FROM subscribers WHERE token = ?');
$st->execute([$token]);
$row = $st->fetch();
if (!$row) {
    rn_page('Enlace no válido', 'Este enlace de confirmación no es correcto o ha caducado.', 404, '<a href="' . $site . '">Ir a la web</a>');
}
if ($row['status'] !== 'activo') {
    $db->prepare("UPDATE subscribers SET status = 'activo', confirmed_at = ?, unsubscribed_at = NULL WHERE id = ?")->execute([time(), $row['id']]);
}
rn_page('Suscripción confirmada', 'Gracias. Te enviaremos una idea al mes que puedas usar el lunes. Sin humo. Puedes darte de baja desde cualquier envío.', 200,
        '<a href="' . $site . '">Volver a RedesiaNet</a>');
