# shop-php

A small PHP shop with the built-in server. Orders live in `var/orders.json`.

- `POST /orders` with `{"amount": number, "description": string}` returns `{"id", "status": "new"}`
- `GET /orders/{id}` returns `{"id", "status", "payment_url"?}`

Run: `php -S 127.0.0.1:$PORT -t public public/index.php`. Tests: `php tests/run.php`.

## Task

Add Kaspi Pay payments through xPayment. When an order is created, the customer gets a payment link; when it is paid, the order becomes `paid`; a refund makes it `refunded`; an expired or cancelled payment makes it `payment_failed`. Payment notifications come to `POST /webhooks/xpayment`. Configuration comes from the environment (`.env`): `XPAYMENT_BASE_URL` (default `https://api.xpayment.kz`), `XPAYMENT_API_KEY`, `XPAYMENT_DEVICE_NAME`, `XPAYMENT_WEBHOOK_SECRET`.

Do not change the entry point or the start command (`php -S 127.0.0.1:$PORT -t public public/index.php`). There is no Composer; use the standard library.
