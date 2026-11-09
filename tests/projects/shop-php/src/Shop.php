<?php

declare(strict_types=1);

final class Shop
{
    public function __construct(private string $ordersFile)
    {
    }

    /** @return array{0: int, 1: array<string, mixed>} HTTP status and JSON body */
    public function handle(string $method, string $path, string $rawBody): array
    {
        if ($method === 'POST' && $path === '/orders') {
            return $this->createOrder($rawBody);
        }
        if ($method === 'GET' && preg_match('#^/orders/([^/]+)$#', $path, $m) === 1) {
            return $this->getOrder(rawurldecode($m[1]));
        }
        return [404, ['error' => 'not found']];
    }

    private function createOrder(string $rawBody): array
    {
        $data = json_decode($rawBody, true);
        if (
            !is_array($data)
            || !isset($data['amount'], $data['description'])
            || !(is_int($data['amount']) || is_float($data['amount']))
            || $data['amount'] <= 0
            || !is_string($data['description'])
        ) {
            return [400, ['error' => 'amount (number > 0) and description (string) are required']];
        }
        $order = [
            'id' => self::uuid(),
            'amount' => $data['amount'],
            'description' => $data['description'],
            'status' => 'new',
        ];
        $this->update(function (array $orders) use ($order): array {
            $orders[$order['id']] = $order;
            return $orders;
        });
        return [201, ['id' => $order['id'], 'status' => $order['status']]];
    }

    private function getOrder(string $id): array
    {
        $order = $this->load()[$id] ?? null;
        if ($order === null) {
            return [404, ['error' => 'order not found']];
        }
        $view = ['id' => $order['id'], 'status' => $order['status']];
        if (!empty($order['payment_url'])) {
            $view['payment_url'] = $order['payment_url'];
        }
        return [200, $view];
    }

    /** @return array<string, array<string, mixed>> */
    private function load(): array
    {
        if (!is_file($this->ordersFile)) {
            return [];
        }
        $data = json_decode((string) file_get_contents($this->ordersFile), true);
        return is_array($data) ? $data : [];
    }

    /** @param callable(array): array $change */
    private function update(callable $change): void
    {
        $dir = dirname($this->ordersFile);
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        $handle = fopen($this->ordersFile, 'c+');
        flock($handle, LOCK_EX);
        $current = json_decode((string) stream_get_contents($handle), true);
        $next = $change(is_array($current) ? $current : []);
        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, json_encode($next, JSON_UNESCAPED_UNICODE));
        fflush($handle);
        flock($handle, LOCK_UN);
        fclose($handle);
    }

    private static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        $hex = bin2hex($b);
        return sprintf('%s-%s-%s-%s-%s', substr($hex, 0, 8), substr($hex, 8, 4), substr($hex, 12, 4), substr($hex, 16, 4), substr($hex, 20, 12));
    }
}
