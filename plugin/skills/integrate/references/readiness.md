# Readiness: tariff, cashier, cashbox, device_name

Step 5 of `integrate`. Check the four items in this order, one at a time, through the tools. Skip what is already in place and say so in one line («the tariff is active; cashbox `shop2` is ready»). Ask only about the first item that is missing, then wait.

The sandbox needs none of this: no tariff, no Kaspi, no cashbox. When an item waits on the person (paying, the Kaspi app), offer to run the sandbox cycle meanwhile (step 6).

## 1. Tariff

`get_account` → `billing`, `topup_url`.

- `billing` is `null`: the organization has no plan yet. Live payments need one. Give `topup_url` (the cabinet's billing page); the person chooses and pays, you don't.
- `status` `ACTIVE`: fine. If `trial_expires_at` is set, it is a trial: say until when (the tools give UTC; tell Kazakhstan time, UTC+5).
- Any other `status` (for example `LOW_BALANCE`), or a `balance` below `-overdraft_limit`: name it as the tool wrote it and give `topup_url`.
- Limits worth one line when they matter: `daily_tx_limit`, `monthly_payment_limit` (they count only paid payments).
- Cashbox capacity: `device_limit` (cashboxes in the plan; `null` = unlimited), `active_devices`, `device_capacity`, `extra_device_price` (one more cashbox beyond the plan, in KZT). Keep these for item 3.

## 2. Cashier in Kaspi Pay

xPayment works through a restricted cashier the person creates in their Kaspi Pay app. You cannot do it for them («Outside MCP» of the rules).

- If `list_devices` with `environment: "live"` already shows an active cashbox, the cashier exists: skip this item.
- Otherwise give the steps of the documentation: «Быстрый старт», step 1 (create a restricted cashier for xpayment in the Kaspi Pay app), and the guide it links: `https://xpayment.kz/blog/kaspi-pay-cashier-setup`. If you have a web tool, read `https://xpayment.kz/blog/kaspi-pay-cashier-setup.md` and give its steps as written there. Never write Kaspi app menus from memory.
- They need the phone number of that cashier's Kaspi Pay account for item 3. Ask one question: is the cashier created (and which phone it uses)?

## 3. Cashbox

`list_devices` with `environment: "live"`.

- An active cashbox (`is_active: true`) that the person wants to use: done. Several: one question with the cashboxes as options (`name` and `device_name`). `session_problem_since` set: Kaspi refuses that cashbox's session since that time (tell it in Kazakhstan time); it cannot take payments until that is fixed. Search the documentation (`search_docs` «сессия кассы») for what to do; never invent steps. Prefer a cashbox without a session problem.
- None: add one. Cashboxes are managed on live only.
  1. **Price first.** From `get_account`: if `device_limit` is not `null`, `extra_device_price` > 0 and `active_devices` ≥ `device_capacity`, the new cashbox is charged: `extra_device_price` KZT from the balance, not refunded when the cashbox is removed. Say this before any SMS goes out and get a yes («Confirmation»). If the balance cannot cover it, give `topup_url` first.
  2. **Names.** Propose `name` (as the cabinet shows it, e.g. «Магазин на Абая») and `device_name` (1–32 Latin letters or digits, unique among the person's active cashboxes, e.g. `shop1`); the person may change them. Ask one question: the phone of the cashier's Kaspi Pay account (item 2).
  3. `start_add_device` with `environment: "live"`, `name`, `device_name`, `phone` (and `confirmed: true` only after the yes of point 1). If it answers `CONFIRMATION_REQUIRED`, its message has the price: ask, and call again with `confirmed: true` only after a yes. The answer is `challenge_id` and `expires_at`.
  4. Kaspi sends an SMS code to the cashier's phone. Ask the person for it, as one question, and say until when it works.
  5. `confirm_add_device` with `environment: "live"`, `challenge_id`, `code` (and `confirmed: true` for a paid cashbox, as in point 3). Never repeat, store or log the code.
  6. Say what was added (`name`, `device_name`). The tool makes no API key; keys come in steps 6 and 9.
- Errors: `CHALLENGE_EXPIRED`, `CHALLENGE_NOT_FOUND`, `CHALLENGE_ALREADY_USED` → `start_add_device` again for a new SMS. `DEVICE_NAME_TAKEN`, `VALIDATION_ERROR` → fix the name or the phone as the message says. `DEVICE_LIMIT_EXCEEDED`, `EXTRA_DEVICE_OVERDRAFT`, `NO_ACTIVE_BILLING` → the tariff (item 1).
- A member sees and manages only their own cashboxes. Cashboxes of other members are not theirs: each member connects their own AI, or the owner does it in the cabinet.

## 4. device_name (API v2)

API v2 picks the cashbox by `device_name` in each request.

- The chosen cashbox has a `device_name`: that is the value of `XPAYMENT_DEVICE_NAME` on live. Done.
- It has none (`null`): propose one (1–32 Latin letters or digits) and, after the person agrees, `update_device` with `environment: "live"`, `device_id`, `device_name`.
- Changing an existing `device_name` breaks every integration that sends the old one: do it only when the person asks, after saying so.
- API v1 needs no `device_name`: each v1 key belongs to one cashbox.
