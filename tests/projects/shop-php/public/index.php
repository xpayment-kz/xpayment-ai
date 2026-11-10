<?php

declare(strict_types=1);

require __DIR__ . '/../src/Shop.php';

$shop = new Shop(__DIR__ . '/../var/orders.json');

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
$rawBody = file_get_contents('php://input') ?: '';

[$status, $body] = $shop->handle($method, $path, $rawBody);

http_response_code($status);
header('Content-Type: application/json');
echo json_encode($body, JSON_UNESCAPED_UNICODE);
