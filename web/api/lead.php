<?php
/* ══════════════════════════════════════════════════════════════
   POST /api/lead.php — formularios de la web.
   type = auditoria  → guarda el lead y avisa al momento
   type = newsletter → alta con doble confirmación por correo
   ══════════════════════════════════════════════════════════════ */
declare(strict_types=1);
define('RN_API', true);
require __DIR__ . '/private/lib.php';

rn_only_post();
rn_check_origin();
$in = rn_input();

// Trampa anti-bots: campo oculto relleno o envío en menos de 2,5 s.
// Se responde "ok" para no dar pistas, pero no se guarda nada.
if (!empty($in['website']) || (int) ($in['elapsed'] ?? 0) < 2500) {
    rn_json(['ok' => true, 'message' => 'Recibido.']);
}
if (!rn_throttle('lead:' . rn_ip_hash(), 8, 3600)) {
    rn_json(['ok' => false, 'error' => 'Demasiados envíos seguidos. Prueba de nuevo en un rato.'], 429);
}

$email = strtolower(rn_clean($in['email'] ?? '', 160));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    rn_json(['ok' => false, 'error' => 'Revisa el email.', 'field' => 'email'], 422);
}

$type = ($in['type'] ?? '') === 'newsletter' ? 'newsletter' : 'auditoria';

if ($type === 'newsletter') {
    if (empty($in['privacidad'])) {
        rn_json(['ok' => false, 'error' => 'Marca la casilla para poder suscribirte.'], 422);
    }
    $msg = rn_subscribe($email, 'web:' . rn_clean($in['page'] ?? '', 80));
    if (!empty(rn_config()['notify_newsletter'])) {
        rn_telegram('📬 Nueva suscripción a la newsletter de redesianet.com.');
    }
    rn_json(['ok' => true, 'message' => $msg]);
}

$lead = [
    'name' => rn_clean($in['nombre'] ?? '', 120),
    'company' => rn_clean($in['empresa'] ?? '', 160),
    'email' => $email,
    'phone' => rn_clean($in['telefono'] ?? '', 40),
    'employees' => rn_clean($in['empleados'] ?? '', 20),
    'plan' => rn_clean($in['plan'] ?? '', 40),
    'billing' => ($in['modalidad'] ?? '') === 'anual' ? 'anual' : 'mensual',
    'process' => rn_clean($in['proceso'] ?? '', 2000, true),
    'page' => rn_clean($in['page'] ?? '', 200),
    'consent_privacy' => empty($in['privacidad']) ? 0 : 1,
    'consent_marketing' => empty($in['comerciales']) ? 0 : 1,
];
$attr = is_array($in['attr'] ?? null) ? $in['attr'] : [];
$lead['landing'] = rn_clean($attr['landing'] ?? '', 200);
$lead['ref_host'] = rn_host_of((string) ($attr['ref'] ?? ''));
$lead['utm_source'] = rn_clean($attr['utm_source'] ?? '', 80);
$lead['utm_medium'] = rn_clean($attr['utm_medium'] ?? '', 80);
$lead['utm_campaign'] = rn_clean($attr['utm_campaign'] ?? '', 120);

foreach (['name' => ['nombre', 'Dinos cómo te llamas.'], 'company' => ['empresa', '¿De qué empresa nos escribes?'],
          'process' => ['proceso', 'Cuéntanos qué quieres automatizar.']] as $k => [$field, $msg]) {
    if ($lead[$k] === '') {
        rn_json(['ok' => false, 'error' => $msg, 'field' => $field], 422);
    }
}
if (!$lead['consent_privacy']) {
    rn_json(['ok' => false, 'error' => 'Necesitamos que aceptes la política de privacidad para responderte.', 'field' => 'privacidad'], 422);
}

$db = rn_db();
$now = time();
$db->prepare('INSERT INTO leads (created_at, day, name, email, company, phone, employees, plan, billing, process, page, landing,
    ref_host, utm_source, utm_medium, utm_campaign, consent_privacy, consent_marketing, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'nuevo\', ?)')
   ->execute([$now, date('Y-m-d'), $lead['name'], $lead['email'], $lead['company'], $lead['phone'], $lead['employees'],
              $lead['plan'], $lead['billing'], $lead['process'], $lead['page'], $lead['landing'], $lead['ref_host'],
              $lead['utm_source'], $lead['utm_medium'], $lead['utm_campaign'], $lead['consent_privacy'],
              $lead['consent_marketing'], $now]);

// El visitante ya tiene su respuesta; los avisos salen después.
rn_respond_then_continue(['ok' => true, 'message' => 'Solicitud recibida.']);
if ($lead['consent_marketing']) {
    rn_subscribe($lead['email'], 'formulario de auditoría');
}
rn_notify_lead($lead);
