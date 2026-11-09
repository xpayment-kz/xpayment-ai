# From API v1 to API v2: what changes and how to switch without downtime

The detail behind `migrate-v2`. API v2 is **beta**; API v1 is **stable** and stays fully supported, so the migration is the person's choice, not a deadline. Before you write an endpoint into code, read it with `describe_endpoint` (`version`, `method`, `path`): the documentation wins over this file.

## 1. What changes — each row checked against the documentation

"Docs" names the section of the documentation (`get_doc_section`, or `references/docs/llms-full.txt`) that backs the row.

| # | What | v1 (stable) | v2 (beta) | Docs |
|---|---|---|---|---|
| 1 | Base path of every payment call | `/v1/…` | `/v2/…`. Every call the code makes moves with the key: create a payment, create a link, get, list, cancel, refund, list refunds, static QR, `webhook-simulate`, sandbox `simulate`. | «API v1 — эндпоинты», «API v2 (beta) — эндпоинты» |
| 2 | Key | Cashbox key `xdev_…`, one per cashbox (sandbox: `xdev_test_…`). Accepted on `/v1` only. | Account key `xapi_…`, at most 10 active, one key for all of the person's cashboxes (sandbox: `xapi_test_…`). Accepted on `/v2` only. It keeps working after a cashbox is reconnected. | «Аутентификация», «Быстрый старт» (3) |
| 3 | A key of the other version | `401 UNAUTHORIZED` | `401 UNAUTHORIZED` | «Аутентификация» |
| 4 | Which cashbox | The key is bound to one cashbox. | `device_name` in the body of `POST /v2/payments` and `POST /v2/payments/link`, **required**: 1–32 Latin letters or digits, case-insensitive. Sandbox: always `test`. | «Быстрый старт» (2), reference `POST /v2/payments` and `POST /v2/payments/link`, «Песочница» |
| 5 | New errors on create | — | `400 VALIDATION_ERROR` (`device_name` missing or not Latin letters/digits); `404 DEVICE_NOT_FOUND` (no active cashbox of the key's owner has this `device_name`). | reference `POST /v2/payments` |
| 6 | Required body fields | `amount` and `payer_phone` are marked optional in the v1 reference. | `POST /v2/payments`: `amount`, `device_name`, `payer_phone`. `POST /v2/payments/link`: `amount`, `device_name`. A shop that always sends them changes nothing here. | reference `POST /v1/payments`, `POST /v2/payments` |
| 7 | List cashboxes | Only with an account token (`GET /v1/devices`), not with a payment key. | `GET /v2/devices` with the key: `device_name` and `session_problem_since` of each active cashbox that has a name; with a test key, the cashbox `test`. | reference `GET /v2/devices` |
| 8 | Unchanged | Get and list payments (the `device_name` filter exists in both), cancel, refund, list refunds, `X-Idempotency-Key`, `merchant_order_id` (a new link for the same order cancels the unpaid older ones), statuses, static QR (not in the sandbox). | The same fields and statuses. Only the base path and the key change. | the v1 and v2 reference sections, compared field by field |
| 9 | Webhooks | One subscription list for the organization; payments from v1, v2 and the cabinet all come to it. | The same subscriptions, the same secret, the same signature (HMAC-SHA256 of the raw body, lowercase hex, no `sha256=`), the same body (no status). After an event the code reads the payment: now `GET /v2/payments/{id}` with the v2 key. Nothing to do with the subscription. | «Webhooks» |
| 10 | Going live | Swap the key (`xdev_test_` → `xdev_`). | Swap the key (`xapi_test_` → `xapi_`) and `device_name` (`test` → the cashbox's name). | «Песочница» → «Лимиты, хранение, переход на бой» |

Not part of the migration: online booking, recurring payments and subscriptions (`/v2/subscriptions`, `xsub_…`): answer from the documentation if asked and stop there.

## 2. Find what to change (read-only)

Search the project, leaving `.env` out (a match prints its line). Names of variables come from `.env.example`, the README and the config code.

- **Version in paths.** Every `/v1` in code, scripts, tests, fixtures, README, CI. Find where the version is put: in the path strings (`/v1/payments/link`) or in the base-URL setting (then the setting's default or `.env.example` shows it; its value in `.env` you cannot see, so ask only if the code leaves it open).
- **Keys.** `xdev_`, `XPAYMENT_DEVICE_KEY`, `deviceKey`, `device_key`, `Authorization`/`Bearer`, a database column or table of keys.
- **Where the cashbox is chosen.** One key in one setting (the usual case); a map from branch, shop, user or order to a key; keys stored per merchant in a database. Each key stands for one cashbox: the number of keys is the number of cashboxes to name.
- **The webhook handler's read of the payment** (`GET /v1/payments/{id}`): it must use the same version as the key.
- **Other callers**: cron jobs, refund or cancel screens, static-QR checks, admin scripts.

Report it as a short list: file, line, what it does, what it becomes. Two or three lines about what you found, then the one question.

## 3. The account side (MCP, signed in)

For each of the signed-in person's own cashboxes that the code uses (colleagues' cashboxes: point 5):

1. **Which cashbox.** `list_devices` with `environment: "live"`. One active cashbox: that one, and say so. Several: the names of the keys in `list_api_keys` (`version: "v1"`, `name`, `device_name`), the config and the README often say it; if still unclear, one question with the cashboxes as options. Never find a key's cashbox by printing the key or any part of it (`key_prefix` included).
2. **`device_name`.** Null: ask for one name (1–32 Latin letters or digits, unique among their active cashboxes; suggest one from the cashbox's `name`, e.g. `shop1`) and call `update_device` with `environment: "live"`, `device_id`, `device_name`. Already set: use it as it is. **Never rename a cashbox that has a `device_name`**: every integration that sends the previous name stops working at once.
3. **Sandbox v2 key**: `create_api_key` with `environment: "sandbox"`, `version: "v2"`, `name` = the project's name + «test». The value comes back; write it into `.env` (section 5), never into your reply.
4. **Live v2 key**: `create_api_key` with `environment: "live"`, `version: "v2"` gives a `reveal_url` (valid an hour; the key is made when it is opened). Issue it only when the person is ready to put it on the server (section 6): one live key serves every cashbox of the person. `API_KEY_LIMIT` (10 active): `list_api_keys`, and offer to revoke an unused one, with a yes.
5. **Cashboxes of other members.** You can neither see nor change them: your tools act for the person who signed in. Say so, once, plainly: each member makes their own `xapi_` key and sets `device_name` through their own AI connection, or the owner does it in the cabinet («API-ключи» → «Ключи API v2» for one's own keys; for a member's key the documentation names no menu: say so and link `https://xpayment.kz/docs`). Never ask for a Personal Access Token. The code then picks the key by `device_name`; see the last bullet of section 4.

## 4. The code, behind the flag

The rule that makes it safe: **with `XPAYMENT_API_VERSION` unset the shop behaves exactly as before.** Deploying the new code changes nothing until someone sets the flag.

- `XPAYMENT_API_VERSION`: `v1` when unset or empty; `v1` or `v2` only. Any other value: refuse to start, naming the variable and the allowed values.
- `v1`: key from `XPAYMENT_DEVICE_KEY` (keep the project's name), paths `/v1/…`, no `device_name`.
- `v2`: key from `XPAYMENT_API_KEY`, `device_name` from `XPAYMENT_DEVICE_NAME`, paths `/v2/…`, `device_name` in the body of create-payment and create-link. A missing key or name: refuse to start, naming the variable (never a value).
- **One place** decides the path prefix, the key and the body: the client. The webhook handler, cancel, refund and static-QR calls go through it, so the handler's `GET` follows the same version as the key. A `/v2` call with an `xdev_` key (or the reverse) is a 401.
- `XPAYMENT_BASE_URL` stays as it is, without a version in it.
- A refusal to start prints one line (the names of the settings, or the allowed flag values) and exits non-zero, with no stack trace and no values.
- Do not touch the webhook secret, the signature check, the dedupe by `delivery_id`, the status mapping, the entry point or the start command.
- `.env.example` (names only, empty values) gets `XPAYMENT_API_VERSION`, `XPAYMENT_API_KEY`, `XPAYMENT_DEVICE_NAME`; the README says what the flag does and how to roll back.
- Tests: the project's own, plus tests for both modes of the client (v1 default: `/v1`, no `device_name`, the cashbox key; v2: `/v2`, `device_name`, the account key; a bad flag, and a missing v2 key or name, refuse to start).
- **Several cashboxes of different people**: keep the project's own shape for choosing a cashbox, and swap what it chooses: the cashbox's `device_name` plus the key of the person who owns it. A simple form is one variable per key, named after the device: `XPAYMENT_API_KEY_<DEVICE_NAME in capitals>`, with `XPAYMENT_API_KEY` as the fallback.

Node (Express) sketch, as in the sample shop; adapt to the project's stack and style:

```js
// config.js
const VERSIONS = ['v1', 'v2'];
function loadConfig(env = process.env) {
  const apiVersion = (env.XPAYMENT_API_VERSION || 'v1').trim() || 'v1';
  if (!VERSIONS.includes(apiVersion)) throw new Error('XPAYMENT_API_VERSION must be v1 or v2');
  return {
    apiVersion,
    apiKey: (apiVersion === 'v2' ? env.XPAYMENT_API_KEY : env.XPAYMENT_DEVICE_KEY) || '',
    deviceName: env.XPAYMENT_DEVICE_NAME || '',
    // …the rest as it was (port, baseUrl, webhookSecret)
  };
}
const missing = (c) => [!c.apiKey && (c.apiVersion === 'v2' ? 'XPAYMENT_API_KEY' : 'XPAYMENT_DEVICE_KEY'),
  c.apiVersion === 'v2' && !c.deviceName && 'XPAYMENT_DEVICE_NAME', !c.webhookSecret && 'XPAYMENT_WEBHOOK_SECRET'].filter(Boolean);

// xpayment.js
function createClient({ baseUrl, apiVersion = 'v1', apiKey, deviceName, fetchImpl = fetch }) {
  const prefix = `/${apiVersion}`;
  // request(): Authorization: Bearer ${apiKey}, the same timeout and error handling as before
  return {
    createLink: ({ amount, merchantOrderId, idempotencyKey }) =>
      request('POST', `${prefix}/payments/link`, {
        body: { ...(apiVersion === 'v2' && { device_name: deviceName }), amount, merchant_order_id: merchantOrderId },
        idempotencyKey,
      }),
    getPayment: (id) => request('GET', `${prefix}/payments/${encodeURIComponent(id)}`),
  };
}
```

## 5. Writing the variables

Never with Read, Edit or Write: `.env` is not read (rules, «Secrets»). Use a command that prints nothing, one variable at a time, then check with a command that prints only `set` or `missing`:

```sh
node -e 'const fs=require("fs");const [k,v]=process.argv.slice(1);const f=".env";let t=fs.existsSync(f)?fs.readFileSync(f,"utf8"):"";const re=new RegExp("^"+k+"=.*$","m");t=re.test(t)?t.replace(re,()=>k+"="+v):t+(t&&!t.endsWith("\n")?"\n":"")+k+"="+v+"\n";fs.writeFileSync(f,t)' XPAYMENT_API_VERSION v2
node -e 'const t=require("fs").readFileSync(".env","utf8");for(const k of process.argv.slice(1))console.log(k,new RegExp("^"+k+"=.+$","m").test(t)?"set":"missing")' XPAYMENT_API_VERSION XPAYMENT_API_KEY XPAYMENT_DEVICE_NAME
```

(Without Node, the same with `python3 -c`.) A test key goes in as an argument of that command from the tool's answer, and never into your reply. Before writing, make sure `.env` is in `.gitignore`.

## 6. Without downtime, in this order

1. **Code behind the flag** (section 4), flag unset. The person deploys it: nothing changes for their customers.
2. **Sandbox run on v2.** In the local `.env`: `XPAYMENT_API_VERSION=v2`, `XPAYMENT_API_KEY` = the test key, `XPAYMENT_DEVICE_NAME=test` (`XPAYMENT_DEVICE_KEY` stays). Then:
   - the project's tests, with the flag unset and with `v2`;
   - a key check that loads `.env` itself and prints only the outcome: `GET {XPAYMENT_BASE_URL}/v2/devices` with the key; expect `200` and the name `test`;
   - an order through the project running with `v2`: the sandbox payment exists (`list_payments`, `environment: "sandbox"`) with `device_name: "test"`;
   - `simulate_test_payment` with `outcome: "paid"` for it, then the signed event for that payment (the test subscription delivers it when the handler is reachable; otherwise send a locally signed one with the secret from `.env`, printing only the HTTP status): the order becomes `paid`, and the handler's read went to `/v2`;
   - a refund, if the shop makes refunds, and `declined`/`expired` for another order.
   Afterwards set the local flag back to `v1` (or remove the line). If a step fails, fix the code, not the plan; the sandbox costs nothing.
3. **The switch.** The person, on the server: sets `XPAYMENT_API_KEY` (from the live link) and `XPAYMENT_DEVICE_NAME` while the flag is still unset, checks that the service restarted fine, then sets `XPAYMENT_API_VERSION=v2` and restarts. `XPAYMENT_DEVICE_KEY` stays where it is. **Rollback** is one step: set the flag to `v1` (or remove it) and restart; nothing was revoked, so v1 works at once.
4. **Checks that leave no trace**: the key check against `/v2/devices` where the live key is set (the live cashbox name, `session_problem_since` empty); `list_api_keys` (live): the new key shows a `last_used_at`; `list_devices`. Orders come from the shop itself; never create or cancel a live payment through the tools. `test_webhook` (live) shows the handler still answers.
5. **Orders opened before the switch.** Their payments finish after it, and their events arrive at a handler that now reads through `/v2`. Before the last step, ask the person to confirm that the first such order ended `paid` (or that none was open) and that new orders pay normally. If reading a payment made through v1 fails on `/v2` (for example 404), set the flag back to `v1`, keep the keys and tell the person what the answer was.
6. **Revoke the `xdev_` keys last** (section 7).

## 7. The last step: revoking the `xdev_` keys

Only when the person confirms that v2 has run on live as long as they need and section 6, step 5 holds. Never earlier, however the request was worded.

1. `list_api_keys` (live), the keys with `version: "v1"`: show **name** and **device_name** (never `key_prefix`). Ask which belong to this project; other systems (a till, a script) may use the others. One key at a time.
2. Restate it: «Revoke the v1 key «<name>» of cashbox <device_name>: every request with it is refused from then on, so going back to v1 would need a new key. Yes?» A yes to that, then `revoke_api_key` with `environment: "live"`, `version: "v1"`, `key_id`, `confirmed: true`. Next key, next question.
3. `CONFIRMATION_REQUIRED`: nothing was done, ask. `KEY_NOT_FOUND` or `KEY_ALREADY_REVOKED`: read `list_api_keys` and say what is there.
4. Leave the sandbox `xdev_test_` keys alone unless asked. Tell the person to delete `XPAYMENT_DEVICE_KEY` from the server's settings, and offer once to remove the v1 branch and the flag from the code (a small change: v1 stays stable, but a branch whose key is revoked cannot work).
