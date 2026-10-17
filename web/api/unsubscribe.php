<?php
/* /api/unsubscribe.php?t=… — baja de la newsletter.
   GET muestra un botón (para que los antivirus que abren enlaces no den
   de baja a nadie); POST la ejecuta. Admite la baja en un clic de los
   gestores de correo (List-Unsubscribe-Post, RFC 8058). */
declare(strict_types=1);
define('RN_API', true);
require __DIR__ . '/private/lib.php';

$token = preg_replace('/[^a-f0-9]/', '', (string) ($_REQUEST['t'] ?? ''));
$site = rn_e(rtrim(rn_config()['site_url'] ?? '/', '/') . '/');
if (strlen($token) !== 32) {
    rn_page('Enlace no válido', 'Este enlace de baja no es correcto.', 400, '<a href="' . $site . '">Ir a la web</a>');
}
$db = rn_db();
$st = $db->prepare('SELECT id, status FROM subscribers WHERE token = ?');
$st->execute([$token]);
$row = $st->fetch();
if (!$row) {
    rn_page('Enlace no válido', 'No encontramos ninguna suscripción con este enlace.', 404, '<a href="' . $site . '">Ir a la web</a>');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $db->prepare("UPDATE subscribers SET status = 'baja', unsubscribed_at = ? WHERE id = ?")->execute([time(), $row['id']]);
    rn_page('Baja completada', 'No volverás a recibir la newsletter de RedesiaNet. Si fue un error, puedes suscribirte de nuevo desde la web.', 200,
            '<a href="' . $site . '">Ir a la web</a>');
}
if ($row['status'] === 'baja') {
    rn_page('Ya estabas de baja', 'Esta dirección ya no recibe la newsletter.', 200, '<a href="' . $site . '">Ir a la web</a>');
}
rn_page('¿Darte de baja?', 'Dejarás de recibir la newsletter de RedesiaNet.', 200,
        '<form method="post"><input type="hidden" name="t" value="' . rn_e($token) . '"><button type="submit">Confirmar la baja</button></form>');
