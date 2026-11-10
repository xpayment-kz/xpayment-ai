# broken-python

A FastAPI shop that takes Kaspi Pay payments through xPayment API v2. Orders live in memory.

- `POST /orders` with `{"amount": number, "description": string}` returns `{"id", "status": "new", "payment_url"}`
- `GET /orders/{id}` returns `{"id", "status", "payment_url"?}`
- `POST /webhooks/xpayment` receives payment notifications

Run: `pip install -r requirements.txt && uvicorn main:app --host 127.0.0.1 --port $PORT`. Tests: `pytest`.

## Task

Check my xPayment integration.
