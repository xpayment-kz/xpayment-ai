# Scenarios: where the person takes payment

Step 3 of `integrate`. Pick the row that fits what you learned in step 2 (the project, or the person's answer). Recommend its first option, with a reason from their situation; name the alternative. Before you describe an endpoint, read it in the documentation (`describe_endpoint` with `version`, `method`, `path`; the section «Способы приёма оплаты» for the overview). The documentation wins over this table.

| Where they take payment | Recommend | Alternative |
|---|---|---|
| No site, or no developer (Instagram, WhatsApp, a chat, orders by phone without a CRM) | **Payment page** made in their account (the cabinet's «Платёжные ссылки»): you create and publish it and hand over its link | A payment link through the API later, when they have a site or a developer |
| A site, an online shop, a bot | **Payment link** `POST /v2/payments/link` | Invoice to a phone `POST /v2/payments` |
| A CRM, delivery, an invoice after a phone call | **Invoice to a phone** `POST /v2/payments` | A payment link sent by SMS or a messenger |
| A point of sale with a printed static Kaspi QR | **Reconciling the static QR by order number** `GET /v2/static-qr-payments/{orderNumber}` | A payment link shown on a screen |
| Access by subscription (a SaaS plan) | Tell them about the subscriptions API (beta) and give the section | — |

With API v1 the paths are the same under `/v1` and the body has no `device_name` (step 4 picks the version).

When you know nothing yet (an empty folder, a chat with no details), recommend the payment page: it needs no code, takes payments the same day, and an API link can come later.

## Payment page (no code)

What it is: a reusable public page of the cabinet («Платёжные ссылки», `/v1/projects` in the documentation). The client opens it, fills a short form, and pays through Kaspi. Not the same as a one-time payment link of the API.

- It exists **on live only**: there are no payment pages in the sandbox. It needs an active live cashbox (step 5 first).
- Chat mode and code mode alike: you do it through the tools.
  1. Ask, one question at a time, only what you cannot guess: what they sell and the price (one price → `amount_mode: "fixed"` with `fixed_amount`; a choice of options with prices → `amount_mode: "tariff"` and a `select` field whose options carry `price`). Propose a name and a description from what they told you.
  2. `list_devices` with `environment: "live"` → the cashbox's `id` for `device_id` (several active ones → one question with the cashboxes as options).
  3. `create_payment_page` (no `environment`): `name`, `description`, `device_id`, `amount_mode`, `fixed_amount` or the `select` field, `fields` (the form: `key`, `label`, `type` phone|text|email|select, `required`). A phone field is added on publishing. The page is a draft: it takes nothing yet.
  4. Show what the page will be (name, price or options, form, cashbox) and ask for a yes to publish: from then on it takes real money («Confirmation» of the rules).
  5. After the yes: `publish_payment_page` with `page_id` only (it has no `confirmed` argument). Give the person its `public_url` and tell them where to share it (the Instagram profile link, stories, messages).
- Changes later: `update_payment_page`; to stop it: `archive_payment_page` (needs a yes; it cannot be published again).
- Payments of the page arrive in the cabinet and in `list_payments` on live. A webhook is optional here; offer it only if they have a system to receive it.
- The person can see how a payment behaves before going live: in the sandbox, `create_test_payment` with `kind: "link"` gives a test link page (it shows the status, no pay button) and `simulate_test_payment` ends it; or the cabinet tab «Песочница» → «Платежи» has the same outcome buttons.

## Payment link (site, shop, bot)

- `POST /v2/payments/link` with `device_name`, `amount`, `merchant_order_id` (the shop's order id). The answer has `payment_id` and `qr_token` — the URL the customer opens (show it as a QR on a desktop, open it in Kaspi on a phone) — and `expire_date`.
- A new link for the same `merchant_order_id` cancels the earlier unpaid links of that order (without a webhook).
- The result comes by webhook; the code then reads the payment (`GET /v2/payments/{paymentID}`).
- Code mode: write the client and the webhook handler into their project («code.md»). Chat mode: ask their stack (one question) and hand over the complete files; if they have no developer, go back to the payment page.

## Invoice to a phone (CRM, delivery)

- `POST /v2/payments` with `device_name`, `payer_phone`, `amount`, `merchant_order_id`, optional `comment` and `metadata`, and the header `X-Idempotency-Key` (a repeat with the same key returns the payment already made). The payer gets the invoice in the Kaspi app. Status `PENDING`, then `WAITING_FOR_PAYER`; the outcome comes by webhook.
- Same code shape as the link («code.md»).

## Static QR (a printed Kaspi QR at the till)

- Payments to a printed static QR are not created through xPayment; `GET /v2/static-qr-payments/{orderNumber}` finds one by the order number from the Kaspi history so their system can reconcile it. Read the endpoint with `describe_endpoint` before you write code.
- Not in the sandbox: a test key gets `404 NOT_AVAILABLE_IN_SANDBOX`. Test the rest of the code there; this call is checked on live with a real order number.
- If they want every payment to land in their system automatically, recommend a payment link shown on a screen instead.

## Subscriptions, online booking, recurring payments

Out of scope («Out of scope» of the rules). Say in two sentences what exists — subscriptions: the subscriptions API (beta, `xsub_…` keys, `/v2/subscriptions/...`) — and give the documentation: `https://xpayment.kz/docs#section-v2` (online booking and recurring payments: `https://xpayment.kz/docs` and the cabinet path the documentation gives). Don't set them up. If they also take one-off payments, continue with that scenario.
