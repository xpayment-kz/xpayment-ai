# Code: the client and the webhook handler

Step 7 of `integrate`, code mode (in chat mode you hand over the same files complete). Write for the project's own stack, framework and style; the examples below show the parts that must be right, not a layout to copy. Before you call an endpoint, read it with `describe_endpoint` (`version`, `method`, `path`) and the section «Webhooks» with `get_doc_section`. On API facts (endpoints, fields, statuses, error codes, limits, cabinet paths) the documentation wins over this file: follow it and tell the person what differs. It never loosens «Confirmation» or «Secrets» of `rules.md`.

## 1. Read the project first

- The stack and the framework (`package.json`, `requirements.txt`/`pyproject.toml`, `composer.json`), the entry point and the start command, where orders are created and stored, how settings are read, the tests.
- A task or a contract in the README (variable names, the webhook path, order statuses, a start command that must not change) is binding: follow it exactly.
- Never open `.env`. `.env.example` is fine to read and to update (names only, empty values).

## 2. Configuration

- Read everything from the environment. The usual names (use the project's own names if it already has them):
  - `XPAYMENT_BASE_URL` — `https://api.xpayment.kz` when not set; the same for the sandbox and live (the key picks the environment);
  - `XPAYMENT_API_KEY` — `xapi_…` for v2 (`xapi_test_…` in the sandbox), or the cashbox key `xdev_…` for v1;
  - `XPAYMENT_DEVICE_NAME` — v2 only: `test` in the sandbox, the live cashbox's `device_name` on live;
  - `XPAYMENT_WEBHOOK_SECRET` — the secret of the webhook subscription.
- **Load `.env` at start without overriding variables that are already set** (hosting, CI and test runs set them in the environment, and those must win): Node `process.loadEnvFile('.env')` when the file exists (Node ≥ 20.12; it keeps existing variables); Python `load_dotenv()` of python-dotenv (it does not override by default) or the small loader below; PHP the loader below — never `putenv` over a variable that is already set.
- No hard-coded keys, secrets or fallback values for them. Without a webhook secret the handler refuses every event.
- `.env` is in `.gitignore`; `.env.example` lists the names with empty values.

### Writing `.env` (never with Read, Edit or Write)

Set one variable — add it, or replace its line — with a command that prints nothing:

```sh
node -e 'const fs=require("fs");const [k,v]=process.argv.slice(1);const f=".env";let t=fs.existsSync(f)?fs.readFileSync(f,"utf8"):"";const re=new RegExp("^"+k+"=.*$","m");t=re.test(t)?t.replace(re,()=>k+"="+v):t+(t&&!t.endsWith("\n")?"\n":"")+k+"="+v+"\n";fs.writeFileSync(f,t)' XPAYMENT_DEVICE_NAME test
```

Then confirm, printing only `set` or `missing`:

```sh
node -e 'const t=require("fs").readFileSync(".env","utf8");for(const k of process.argv.slice(1))console.log(k,new RegExp("^"+k+"=.+$","m").test(t)?"set":"missing")' XPAYMENT_BASE_URL XPAYMENT_API_KEY XPAYMENT_DEVICE_NAME XPAYMENT_WEBHOOK_SECRET
```

Without Node, the same with `python3 -c` (`re.sub` with a function as the replacement). Only test values go into `.env` this way; live values reach the server through the person (a one-time link, «go-live.md»).

## 3. The client

- `Authorization: Bearer <XPAYMENT_API_KEY>`, JSON, a timeout (10 s) on every request; never log the key or the request headers.
- Create a payment with `POST /v2/payments/link` (a link) or `POST /v2/payments` (an invoice to `payer_phone`), with `device_name`, `amount` and `merchant_order_id` = the shop's order id.
- Send `X-Idempotency-Key` with every create request: a UUID made once per order (or per payment attempt) and kept with it, so a retry after a timeout returns the payment already made instead of a second one. The documentation defines it for `POST /payments`; it does no harm on `/payments/link`, where `merchant_order_id` also guards against duplicates.
- Keep `payment_id` with the order; for a link, `qr_token` is the URL the customer opens (the order's payment URL).
- Errors come as `{"error": CODE, "message": …}`: show the shop's own error to its customer, log the code, never the key.

## 4. The webhook handler, in this order

1. **Raw body.** Take the request body as bytes before any JSON parsing. xPayment signs these exact bytes; a re-serialised body never matches (spacing and key order differ).
2. **Secret.** No secret configured → refuse (401 or 500), never accept an unsigned event.
3. **Signature.** `X-xPayment-Signature` = HMAC-SHA256 of the raw body with the secret, lowercase hex, **no** `sha256=` prefix. Compare in constant time (`crypto.timingSafeEqual`, `hmac.compare_digest`, `hash_equals`). Missing or wrong → **401**, and nothing else happens.
4. **Parse** the JSON: `event`, `delivery_id`, `payment_id`, `merchant_order_id` (only if it was sent at creation), `environment`. The body has no amount and no status.
5. **Repeat?** A `delivery_id` already processed → answer 2xx at once and stop: do **not** fetch the payment again. All attempts of one delivery share its `delivery_id`. Keep processed ids in storage (a table with a unique key; a set in memory only for a demo). Mark an id processed after it was handled.
6. **Read the payment**: `GET /v2/payments/{payment_id}` and take its `status` — after every event, never from the event's name. Map it to the order:
   - `COMPLETED` → paid;
   - `REFUNDED`, `PARTIALLY_REFUNDED` → refunded (or partly refunded, if the shop has that);
   - `EXPIRED`, `CANCELLED`, `FAILED` → the order's failed status (e.g. `payment_failed`);
   - `PENDING`, `WAITING_FOR_PAYER`, `QR_TOKEN_CREATED` → no change.
   Events: `payment.completed`, `payment.expired`, `payment.cancelled`, `payment.failed`, `payment.refunded`, `payment.refund_failed` (a refund failed: the payment keeps its status; log it). Deliveries may come out of order: the status you read decides.
7. **Answer** 2xx within 10 seconds, and only when the read answered 200 (the order is updated) or 404 (a payment that is not found, e.g. the made-up payment of `test_webhook`: 2xx, nothing changes). **Every other outcome of the read** — a network error, a timeout, 5xx, and also 401, 403 or 400 (a wrong or revoked key, a key of the other API version) — gets 5xx, and the delivery is not marked processed: xPayment tries 3 times (at once, after 1 minute, after 5 minutes), and an answered 2xx would end the delivery with the order still unpaid. Mark the delivery processed only after a 200 or a 404.

## 5. Examples

### Node (Express)

```js
// server.js, first lines: variables already in the environment win over .env
if (require('node:fs').existsSync('.env')) process.loadEnvFile('.env');

// xpayment.js
const BASE = (process.env.XPAYMENT_BASE_URL || 'https://api.xpayment.kz').replace(/\/+$/, '');
async function xpayment(method, path, { body, idempotencyKey } = {}) {
  const headers = { Authorization: `Bearer ${process.env.XPAYMENT_API_KEY}`, Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;
  const res = await fetch(BASE + path, { method, headers, body: body && JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(`xPayment ${res.status} ${data?.error ?? ''}`), { status: res.status });
  return data;
}
const createLink = (order) => xpayment('POST', '/v2/payments/link', {
  body: { device_name: process.env.XPAYMENT_DEVICE_NAME, amount: order.amount, merchant_order_id: order.id },
  idempotencyKey: order.idempotencyKey, // crypto.randomUUID(), made once and kept with the order
}); // → { payment_id, qr_token, … }

// webhook.js — mount it BEFORE app.use(express.json())
const crypto = require('node:crypto');
const ORDER_STATUS = { COMPLETED: 'paid', REFUNDED: 'refunded', PARTIALLY_REFUNDED: 'refunded',
  EXPIRED: 'payment_failed', CANCELLED: 'payment_failed', FAILED: 'payment_failed' };
const processed = new Set(); // a table with a unique key in production

function signatureOk(raw, header) {
  const secret = process.env.XPAYMENT_WEBHOOK_SECRET;
  if (!secret || !Buffer.isBuffer(raw) || !/^[0-9a-f]{64}$/.test(header ?? '')) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(header, 'hex'));
}

app.post('/webhooks/xpayment', express.raw({ type: () => true }), async (req, res) => {
  if (!signatureOk(req.body, req.get('X-xPayment-Signature'))) return res.sendStatus(401);
  let event;
  try { event = JSON.parse(req.body.toString('utf8')); } catch { return res.sendStatus(400); }
  if (processed.has(event.delivery_id)) return res.sendStatus(200); // a repeat: no second GET
  try {
    const payment = await xpayment('GET', `/v2/payments/${encodeURIComponent(event.payment_id)}`);
    const order = findOrderByPaymentId(event.payment_id); // the shop's own lookup
    if (order && ORDER_STATUS[payment.status]) order.status = ORDER_STATUS[payment.status];
  } catch (err) {
    // only a 404 goes on; anything else (network, 5xx, 401/403 of a wrong key) → 500, xPayment delivers it again
    if (err.status !== 404) return res.sendStatus(500);
  }
  processed.add(event.delivery_id);
  res.sendStatus(200);
});
```

### Python (FastAPI)

```python
import hashlib, hmac, json, os
from pathlib import Path
import httpx
from fastapi import Request, Response

def load_env(path=".env"):
    """Loads .env; variables already in the environment win (like python-dotenv's load_dotenv())."""
    if not Path(path).exists():
        return
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))

load_env()
BASE = os.environ.get("XPAYMENT_BASE_URL", "https://api.xpayment.kz").rstrip("/")
ORDER_STATUS = {"COMPLETED": "paid", "REFUNDED": "refunded", "PARTIALLY_REFUNDED": "refunded",
                "EXPIRED": "payment_failed", "CANCELLED": "payment_failed", "FAILED": "payment_failed"}
processed: set[str] = set()  # a table with a unique key in production

async def xpayment(method, path, body=None, idempotency_key=None):
    headers = {"Authorization": f"Bearer {os.environ.get('XPAYMENT_API_KEY', '')}"}
    if idempotency_key:
        headers["X-Idempotency-Key"] = idempotency_key
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.request(method, BASE + path, json=body, headers=headers)
    r.raise_for_status()
    return r.json()

# a link: await xpayment("POST", "/v2/payments/link", {"device_name": os.environ["XPAYMENT_DEVICE_NAME"],
#          "amount": amount, "merchant_order_id": order_id}, idempotency_key=order_idempotency_key)

@app.post("/webhooks/xpayment")
async def xpayment_webhook(request: Request):
    raw = await request.body()  # the bytes xPayment signed
    secret = os.environ.get("XPAYMENT_WEBHOOK_SECRET", "")
    expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    if not secret or not hmac.compare_digest(expected.encode(), request.headers.get("X-xPayment-Signature", "").encode()):
        return Response(status_code=401)
    event = json.loads(raw)
    if event["delivery_id"] in processed:
        return Response(status_code=200)  # a repeat: no second GET
    try:
        payment = await xpayment("GET", f"/v2/payments/{event['payment_id']}")
    except httpx.HTTPStatusError as err:
        # only a 404 goes on; anything else (5xx, 401/403 of a wrong key) → 500, xPayment delivers it again
        if err.response.status_code != 404:
            return Response(status_code=500)
        payment = None
    except httpx.HTTPError:
        return Response(status_code=500)
    order = find_order_by_payment_id(event["payment_id"])  # the shop's own lookup
    if payment and order and payment["status"] in ORDER_STATUS:
        order["status"] = ORDER_STATUS[payment["status"]]
    processed.add(event["delivery_id"])
    return Response(status_code=200)
```

### PHP (no Composer)

```php
function load_env(string $file): void {
    if (!is_readable($file)) return;
    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) continue;
        [$key, $value] = array_map('trim', explode('=', $line, 2));
        if (getenv($key) !== false) continue; // already set: the environment wins
        putenv($key . '=' . trim($value, "\"'"));
    }
}
load_env(__DIR__ . '/../.env');

function xpayment(string $method, string $path, ?array $body = null, ?string $idempotencyKey = null): array {
    $base = rtrim(getenv('XPAYMENT_BASE_URL') ?: 'https://api.xpayment.kz', '/');
    $headers = ['Authorization: Bearer ' . getenv('XPAYMENT_API_KEY'), 'Accept: application/json', 'Content-Type: application/json'];
    if ($idempotencyKey !== null) $headers[] = 'X-Idempotency-Key: ' . $idempotencyKey;
    $context = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $headers),
        'content' => $body === null ? '' : json_encode($body), 'timeout' => 10, 'ignore_errors' => true]]);
    $raw = @file_get_contents($base . $path, false, $context);
    preg_match('/\s(\d{3})/', $http_response_header[0] ?? '', $m);
    return [(int)($m[1] ?? 0), json_decode($raw ?: 'null', true)];
}

// POST /webhooks/xpayment
$raw = file_get_contents('php://input') ?: '';
$secret = getenv('XPAYMENT_WEBHOOK_SECRET') ?: '';
$signature = $_SERVER['HTTP_X_XPAYMENT_SIGNATURE'] ?? '';
if ($secret === '' || !hash_equals(hash_hmac('sha256', $raw, $secret), $signature)) {
    http_response_code(401);
    exit;
}
$event = json_decode($raw, true);
if (delivery_processed($event['delivery_id'])) { http_response_code(200); exit; } // a repeat: no second GET
[$status, $payment] = xpayment('GET', '/v2/payments/' . rawurlencode($event['payment_id']));
// only 200 or 404 go on; anything else (network, 5xx, 401/403 of a wrong key) → 500, xPayment delivers it again
if ($status !== 200 && $status !== 404) { http_response_code(500); exit; }
$map = ['COMPLETED' => 'paid', 'REFUNDED' => 'refunded', 'PARTIALLY_REFUNDED' => 'refunded',
        'EXPIRED' => 'payment_failed', 'CANCELLED' => 'payment_failed', 'FAILED' => 'payment_failed'];
if ($status === 200 && isset($map[$payment['status']])) set_order_status_by_payment($event['payment_id'], $map[$payment['status']]);
mark_delivery_processed($event['delivery_id']); // stored, e.g. next to the orders
http_response_code(200);
```

`delivery_processed`, `mark_delivery_processed`, `set_order_status_by_payment`, `findOrderByPaymentId`, `find_order_by_payment_id` stand for the shop's own storage.

## 6. No public address

xPayment must reach the handler over the internet. On a developer's computer:

- **A tunnel** (recommended for development): a tunnel tool gives a public HTTPS address that forwards to the local port (for example `cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000`; the person runs it). The test subscription points at `https://<tunnel>/webhooks/xpayment`; when the address changes, `update_webhook` changes `url` and the secret stays.
- **No tunnel for now**: the handler is written and checked all the same, with locally signed events (below). Its secret still comes from a test subscription: created on the planned production address (or a placeholder the person confirms) and paused at once («sandbox-cycle.md», step 2). When a tunnel or the server is up, `update_webhook` sets the real `url` and `is_active: true`.
- **Polling**, as well, where webhooks cannot reach the code at all: for each open order, `GET /v2/payments/{payment_id}` every few seconds while the customer is paying, then less often, until a final status (`COMPLETED`, `CANCELLED`, `EXPIRED`, `FAILED`, `REFUNDED`, `PARTIALLY_REFUNDED`); same status mapping. Production should still use webhooks on a public HTTPS address.

## 7. Checking without showing a value

Every check that needs the key or the secret runs as a script on the project's stack that loads `.env` itself and prints only the outcome. Never `cat`/`grep`/`printenv` the values, never `curl -v` or print request headers, never echo the key.

### Does the key work?

```sh
node --input-type=module -e '
import fs from "node:fs";
if (fs.existsSync(".env")) process.loadEnvFile(".env");
const key = process.env.XPAYMENT_API_KEY ?? "";
const base = (process.env.XPAYMENT_BASE_URL || "https://api.xpayment.kz").replace(/\/+$/, "");
if (!key) { console.log("XPAYMENT_API_KEY: missing"); process.exit(1); }
const kind = key.startsWith("xapi_test_") ? "v2 sandbox" : key.startsWith("xapi_") ? "v2 live" : key.startsWith("xdev_test_") ? "v1 sandbox" : key.startsWith("xdev_") ? "v1 live" : "not an xPayment payments key";
const path = key.startsWith("xapi_") ? "/v2/devices" : "/v1/payments";
try {
  const res = await fetch(base + path, { headers: { Authorization: "Bearer " + key }, signal: AbortSignal.timeout(10000) });
  const body = await res.json().catch(() => ({}));
  console.log(kind, "HTTP", res.status, res.ok ? (body.devices ?? []).map((d) => d.device_name).join(", ") : (body.error ?? ""));
} catch (err) { console.log(kind, "request failed:", err.cause?.code ?? err.cause?.message ?? err.message); }'
```

200 → the key works (v2: the cashboxes it can use; check that `XPAYMENT_DEVICE_NAME` is among them). 401 → the key is wrong, revoked, or of the other API version. A network failure → the API could not be reached from here; say so, don't guess. A variable already set in the shell wins over `.env` here too: say which one was checked if that may differ.

### Checking the handler locally

With the project running, send one event signed like xPayment's (pretty-printed on purpose, so a handler that re-serialises fails) and print only the HTTP status. `good` must give 2xx; `bad` must give 401 and change nothing. It signs with `XPAYMENT_WEBHOOK_SECRET` of `.env`, the secret of the test subscription («sandbox-cycle.md», step 2); if that is missing, the script stops — get the subscription first, never sign with an empty secret:

```sh
node --input-type=module -e '
import fs from "node:fs"; import crypto from "node:crypto";
if (fs.existsSync(".env")) process.loadEnvFile(".env");
const [url, paymentId, mode] = process.argv.slice(1);
if (!process.env.XPAYMENT_WEBHOOK_SECRET) { console.log("XPAYMENT_WEBHOOK_SECRET: missing"); process.exit(1); }
const body = JSON.stringify({ event: "payment.completed", event_version: "1", delivery_id: crypto.randomUUID(), attempt_number: 1, source: "xpayment", payment_id: paymentId, created_at: new Date().toISOString(), environment: "sandbox" }, null, 2) + "\n";
const sig = mode === "bad" ? "0".repeat(64) : crypto.createHmac("sha256", process.env.XPAYMENT_WEBHOOK_SECRET).update(body).digest("hex");
const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-xPayment-Signature": sig }, body });
console.log(mode, "HTTP", res.status);' http://127.0.0.1:3000/webhooks/xpayment <payment_id> good
```

Run the project's own tests too, and add tests for the handler (valid signature, wrong signature, repeated `delivery_id`) in the project's test framework.
