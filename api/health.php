<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$config = require dirname(__DIR__) . '/config/app.php';
date_default_timezone_set($config['timezone']);

http_response_code(200);
echo json_encode([
    'status' => 'ok',
    'application' => $config['app_name'],
    'environment' => $config['environment'],
    'timestamp' => date(DATE_ATOM),
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
