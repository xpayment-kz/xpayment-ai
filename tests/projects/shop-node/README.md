# shop-node

A small Express shop. Orders live in memory.

- `POST /orders` with `{"amount": number, "description": string}` returns `{"id", "status": "new"}`
- `GET /orders/:id` returns `{"id", "status", "payment_url"?}`

Run: `npm ci && node server.js` (the port comes from `PORT`). Tests: `node --test`.

## Task

Add Kaspi Pay payments through xPayment. When an order is created, the customer gets a payment link; when it is paid, the order becomes `paid`; a refund makes it `refunded`; an expired or cancelled payment makes it `payment_failed`. Payment notifications come to `POST /webhooks/xpayment`. Configuration comes from the environment (`.env`): `XPAYMENT_BASE_URL` (default `https://api.xpayment.kz`), `XPAYMENT_API_KEY`, `XPAYMENT_DEVICE_NAME`, `XPAYMENT_WEBHOOK_SECRET`.

Do not change the entry point or the start command (`node server.js`).
