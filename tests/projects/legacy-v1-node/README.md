# legacy-v1-node

A small Express shop that takes Kaspi Pay payments through xPayment API v1. Orders live in memory.

- `POST /orders` with `{"amount": number, "description": string}` returns `{"id", "status": "new", "payment_url"}`
- `GET /orders/:id` returns `{"id", "status", "payment_url"}`
- `POST /webhooks/xpayment` receives payment notifications

Configuration (`.env`): `XPAYMENT_BASE_URL`, `XPAYMENT_DEVICE_KEY`, `XPAYMENT_WEBHOOK_SECRET`.

Run: `npm ci && node server.js` (the port comes from `PORT`). Tests: `node --test`.

## Task

Migrate to API v2.

Do not change the entry point or the start command (`node server.js`).
