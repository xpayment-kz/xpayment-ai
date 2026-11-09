<?php

declare(strict_types=1);

// Contract test of the shop: php tests/run.php

require __DIR__ . '/../src/Shop.php';

$failures = 0;
$checks = 0;

function check(string $name, bool $ok): void
{
    global $failures, $checks;
    $checks++;
    if (!$ok) {
        $failures++;
        fwrite(STDERR, "FAIL  $name\n");
    } else {
        echo "ok    $name\n";
    }
}

$file = sys_get_temp_dir() . '/shop-php-test-' . bin2hex(random_bytes(4)) . '.json';
$shop = new Shop($file);

[$status, $created] = $shop->handle('POST', '/orders', json_encode(['amount' => 1500, 'description' => 'Two coffees']));
check('POST /orders -> 201', $status === 201);
check('POST /orders -> id and status new', is_string($created['id'] ?? null) && ($created['status'] ?? null) === 'new');

[$status, $order] = $shop->handle('GET', '/orders/' . $created['id'], '');
check('GET /orders/:id -> 200', $status === 200);
check('GET /orders/:id -> same id, status new', ($order['id'] ?? null) === $created['id'] && ($order['status'] ?? null) === 'new');

[$status] = $shop->handle('GET', '/orders/nope', '');
check('GET unknown order -> 404', $status === 404);

[$status] = $shop->handle('POST', '/orders', json_encode(['amount' => 'a lot']));
check('POST bad body -> 400', $status === 400);

[$status] = $shop->handle('POST', '/orders', 'not json');
check('POST not json -> 400', $status === 400);

check('orders are stored in a file', is_file($file));
@unlink($file);

echo $failures === 0 ? "all $checks checks passed\n" : "$failures of $checks checks failed\n";
exit($failures === 0 ? 0 : 1);
