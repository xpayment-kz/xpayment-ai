# The sandbox cycle

Step 6 of `integrate`. The whole payment path runs in the sandbox before anything goes live: no Kaspi, no tariff, no money. Read the documentation sections «Песочница (тестовый режим)», «Исход платежа», «Возвраты, тестовые телефоны, вебхуки» and «Лимиты, хранение, переход на бой» (`get_doc_section` with these titles) and follow them where they differ from this file.

Every tool call here has `environment: "sandbox"`. If a tool answers `SANDBOX_UNAVAILABLE`, the sandbox is switched off: tell the person and stop; never test on live instead.

## What the sandbox gives

- The test cashbox: one per person, `device_name: "test"` (`list_devices` with `environment: "sandbox"`). It is not added, renamed or removed.
- Test keys: `xapi_test_…` (API v2) and `xdev_test_…` (API v1, bound to the test cashbox). Same base URL `https://api.xpayment.kz` and the same requests as live; the key selects the environment.
- Test webhook subscriptions, separate from live ones: test payments notify only the person's test subscriptions.
- Limits: 60 test writes a minute and 1000 a day per person (payments, links, outcomes, refunds) → `RATE_LIMITED` with `retry_after` («Errors» of the rules). Test payments are kept 30 days.

## 1. Test key

`create_api_key` with `environment: "sandbox"`, `version` (`"v2"`, or `"v1"` if step 4 chose v1), `name` (e.g. the project's name and «sandbox»). The answer has `key` — shown this once.

- Code mode: check that `.env` is in `.gitignore` (add it if not), then write into `.env` with a command that prints nothing («Writing `.env`» of the rules; the commands are in «code.md»): `XPAYMENT_API_KEY` (or the project's own name for it), `XPAYMENT_BASE_URL=https://api.xpayment.kz`, `XPAYMENT_DEVICE_NAME=test` (v2). Confirm with the `set`/`missing` script. In your reply say «written to `.env`»; don't print the key.
- Chat mode: give the test key once, marked as a test key, with the variable it goes into.
- `API_KEY_LIMIT` (at most 10 active test keys): `list_api_keys` with `environment: "sandbox"` and offer to revoke an unused one (with a yes).

## 2. Test webhook subscription

On every path the code needs a test subscription and its secret in `.env`: the handler refuses every event without a secret, and the local checks sign with it. The secret only comes from a subscription (`create_webhook` answers it once), so make one even when deliveries cannot reach the handler yet.

The handler must be reachable from the internet. In code mode it usually runs on the person's computer: ask one question — a tunnel (recommended: real webhooks reach the handler, so the whole cycle is tested) or, for now, locally signed checks and polling («code.md», «No public address»).

- With a public URL (a tunnel or a deployed server): `create_webhook` with `environment: "sandbox"`, `url` = the handler's full address (e.g. `https://<tunnel>/webhooks/xpayment`), `events` left out (all) or the `payment.*` events. The answer has `secret` — shown this once. Write it into `.env` as `XPAYMENT_WEBHOOK_SECRET`, as for the key. The URL can change later with `update_webhook` (the secret stays).
- Without a public URL yet: ask one question — which address the test subscription should carry until there is one: the planned production address of the handler (recommended, e.g. `https://<their domain>/webhooks/xpayment`: it becomes right once the shop is deployed) or the placeholder `https://example.invalid/webhooks/xpayment` (never reachable). Then, one call after another: `create_webhook` with `environment: "sandbox"` and that `url`; write its `secret` into `.env` as `XPAYMENT_WEBHOOK_SECRET`; at once `update_webhook` with the `subscription_id` and `is_active: false`, so that no delivery goes to an address that cannot answer. Say what you did in one line. When a tunnel or the server is up: `update_webhook` with the real `url` and `is_active: true` — the secret stays the same — and run the delivery checks of the cycle.
- Already have a test subscription (`list_webhooks` with `environment: "sandbox"`) for that URL: reuse it; its secret is not shown again — `rotate_webhook_secret` (after a yes) makes a new one.
- There is no subscription without a secret: xPayment makes one for every subscription and signs every delivery with it. The handler checks it; never offer to skip it.

## 3. The cycle

Code mode — the person's code makes the payment, so the test checks their integration:

1. Run the project's tests. Start the project with the sandbox `.env` (and the tunnel, if chosen).
2. Make a payment the way their customers will (create an order through the project's endpoint, or call its code). Find it: `list_payments` with `environment: "sandbox"` and `merchant_order_id`.
3. `simulate_test_payment` with `payment_id` and `outcome: "paid"` → `COMPLETED`, `payment.completed` a few seconds later.
4. Check that the delivery succeeded (`list_webhook_deliveries` with the `subscription_id`: `SUCCESS`, `response_code` 2xx) and that the order is paid in the project.
5. A wrong signature must get 401: send the handler one request with a made-up `X-xPayment-Signature` (a script that prints only the HTTP status) and check the order did not change.
6. Refund: `refund_payment` with `environment: "sandbox"`, the `payment_id` and an `amount` (no `confirmed` needed in the sandbox), or through the project's own refund code if it has one. The refund goes `PENDING` → `PROCESSING` → `COMPLETED` within seconds, then `payment.refunded`; check the order is refunded.
7. The other outcomes, each on a new payment: `declined` → `CANCELLED`, `expired` → `EXPIRED`, `failed` → `FAILED`; the order must end in the project's failed status.
8. Report a short table: each check, passed or not, and what you fixed.

Without a tunnel (the subscription is paused), deliveries cannot reach a local handler: run the same cycle, but after each `simulate_test_payment` and each refund send the handler a locally signed event for that `payment_id` («code.md», «Checking the handler locally»; it signs with `XPAYMENT_WEBHOOK_SECRET` from `.env`). The handler reads the real test payment and updates the order, so steps 3–7 are checked except the delivery itself; step 4's `list_webhook_deliveries` waits until the subscription is active.

Chat mode, or no code (a payment page): `create_test_payment` (`kind: "link"` or `"invoice"`, `amount`, `merchant_order_id`), then `simulate_test_payment`, and show the person the statuses (`get_payment`). A link's `qr_token` opens the test page «Тестовая ссылка» with the status and no pay button. The cabinet tab «Песочница» → «Платежи» has the same outcome buttons.

## Special values (from the documentation)

- One outcome per payment, and only while it is unfinished (`PENDING`, `WAITING_FOR_PAYER`, `QR_TOKEN_CREATED`); a second one → `SANDBOX_OUTCOME_NOT_ALLOWED`. Without an outcome a test link expires by itself after 5 minutes, a test invoice after 23 h 30 min (`EXPIRED`, `payment.expired`).
- `declined` makes `CANCELLED` with `payment.cancelled`. On live a payer's refusal in Kaspi arrives as `payment.expired`, and `payment.cancelled` means the seller cancelled: the handler must treat both as not paid.
- Payer phones for test invoices (the last 10 digits count): ending `7000000001` → `422 KASPI_CLIENT_NOT_FOUND`; ending `7000000002` → `422 KASPI_ERROR`; the payment stays `FAILED`. Any other valid number makes the invoice.
- A test refund of exactly `13.13` is always declined: refund `FAILED` with `fail_reason`, `payment.refund_failed` (the payment must be at least 13.13). Use it to test the handler's refund-failure path.
- Static QR is not in the sandbox (`404 NOT_AVAILABLE_IN_SANDBOX`).
