# Going live: webhook, key, switch, first payment

Steps 8 and 9 of `integrate`. Go live only after the sandbox cycle passed (or the person chose to skip it, knowingly) and readiness is done: an active tariff, an active live cashbox with a `device_name` and no session problem. Read the documentation section «Лимиты, хранение, переход на бой» (`get_doc_section`) first.

On live you read, configure what the person asked for, and send test webhooks. You never create a live payment through the tools. Live values (the key, the webhook secret) never pass through the conversation: the tools answer a one-time `reveal_url` instead.

## How to hand over a one-time link

`create_api_key` and `create_webhook` on live (and `rotate_webhook_secret` on live) answer `reveal_url`, `expires_at` (an hour) and, for a key, a `note`. Tell the person, in their language:

- open the link in the browser where they are signed in to the xPayment cabinet, within the hour (say until when, Kazakhstan time); the value is made when they open it and shown once;
- save it in the environment variable their code reads on the server — name it: `XPAYMENT_API_KEY` or `XPAYMENT_WEBHOOK_SECRET` (or the project's own names), in the server's `.env` or its secret settings — and nowhere else: not in the code, not in git, not in this chat;
- if the link expired or was lost, you can make a new one.

Word it as «open the link and save the value in …». Don't say «paste» («вставьте») about these values at all, and never ask for the value in the chat. Don't show any part of a key.

In code mode check `.env` is in `.gitignore` before you name it as the place.

## Step 8. The live webhook

1. The production handler's public HTTPS address (ask, one question, if you don't know it). `list_webhooks` with `environment: "live"`: a subscription for that URL already exists → reuse it (if `has_secret` is false, offer `rotate_webhook_secret`, after a yes). Live subscriptions belong to the organization: events of all its live payments (API v1, API v2, the cabinet) reach them.
2. `create_webhook` with `environment: "live"`, `url`, `events` left out (all) or the `payment.*` events the code handles. Hand over the `reveal_url` (above): the variable is `XPAYMENT_WEBHOOK_SECRET`. Deliveries are signed with the new secret from the moment the link is opened, so the server should get it right away.
3. After they say the secret is set on the server: `test_webhook` with `environment: "live"` and the `subscription_id`. `success: true` → done. `WEBHOOK_TEST_FAILED` → its message says why (unreachable, not 2xx); fix the URL or the handler and test again. The test event has a made-up payment: a handler that answers 404-not-found payments with 2xx passes («code.md», step 7 of the handler).

## Step 9. The live key and the switch

1. `create_api_key` with `environment: "live"`, `version: "v2"` and a `name` (what will use it, e.g. `shop-prod`). For API v1: `version: "v1"` and `device_id` of the live cashbox (`list_devices`), one key per cashbox. Hand over the `reveal_url`: the variable is `XPAYMENT_API_KEY`.
2. The switch, on the server (the documentation's «Переход на бой»): `XPAYMENT_API_KEY` from `xapi_test_…` to the live `xapi_…` (v1: `xdev_test_…` → `xdev_…`); `XPAYMENT_DEVICE_NAME` from `test` to the live cashbox's `device_name` (v2); `XPAYMENT_WEBHOOK_SECRET` to the live subscription's secret. The base URL and the code stay the same. Test subscriptions get no live events.
3. Checks that leave no trace:
   - `list_devices` with `environment: "live"`: the cashbox is active, `session_problem_since` is `null`;
   - `GET /v2/devices` with the live key: run the key check of «code.md» where the live key is set (the person's server, or the project if they put it into the local `.env`); it prints only the status and the cashbox names; `XPAYMENT_DEVICE_NAME` must be among them;
   - `test_webhook` on live (step 8);
   - later, `list_webhook_deliveries` with `environment: "live"` shows real deliveries and their `response_code`.
4. `API_KEY_LIMIT` (at most 10 active v2 keys): `list_api_keys` with `environment: "live"` and offer to revoke an unused one, after a yes.

## The first real payment (optional)

Offer it once; it is the person's choice. They pay a small amount themselves through their own flow (their site, the link their code makes, or the payment page) and check that the order became paid. You don't create it.

Then offer to refund it — a live refund is real money:

1. `get_payment` with `environment: "live"` (or `list_payments`): the payment, its amount and status (`COMPLETED` or `PARTIALLY_REFUNDED`).
2. Restate exactly: «a refund of N ₸ on payment <id, first 8 characters>…, real money back to the payer through Kaspi, it cannot be undone» and ask for a yes.
3. After the yes only: `refund_payment` with `environment: "live"`, `payment_id`, `amount`, `confirmed: true`.
4. The refund starts as `PENDING`; `get_payment` shows it complete within seconds to minutes, and `payment.refunded` reaches the handler.

## Live refunds and keys at any time

- **A refund the person asks for** follows the four points above. Find the payment first (`get_payment` on live; not found there → the sandbox, where a test refund needs no yes). Never call `refund_payment` on live before the yes — not even without `confirmed`.
- **`DUPLICATE_ACTION`** on a refund: the same refund (this payment, this amount) was made within the last ten minutes. Don't call it again. Read `get_payment` and tell the person what is there (the refund and its status). A second refund of the same amount is a new action: only if they ask for it again, after a new restated yes.
- **`INTERNAL_ERROR`** on a refund: unknown whether it happened. `get_payment` first; repeat only if no such refund is there, and only after a new restated yes.
- **A live key pasted into the chat**: it is exposed. Don't repeat or use it. Recommend: issue a new key (`create_api_key` on live, a link), switch the server to it, then revoke the exposed one (`list_api_keys` on live finds it by `key_prefix`; `revoke_api_key` with `confirmed: true` only after a yes) — or ask which order they prefer. Revoking first stops every payment made with it at once; never do that without saying so.
- **Revoking a key, deleting a subscription, rotating a secret, removing a cashbox, archiving a page**: each only after a yes to a restated action («Confirmation» of the rules).
