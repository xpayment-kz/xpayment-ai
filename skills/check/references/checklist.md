# Checklist: what to look for, the account checks, the report

Used by `check`. The documentation wins over this file: before you judge the code, read the section «Webhooks» (`get_doc_section`) and, for every endpoint the code calls, `describe_endpoint`. Where they differ from what is written here, follow the documentation and tell the person what differs.

## 1. Searching the project (it may hold keys)

**A search must not be able to print a key.** A line that holds a key prints it whole into the session, and `.env.production`, `.env.local`, `docker-compose.yml`, CI files and source code can hold one just as `.env` does.

Work in this order. The order is the rule.

1. **Leave out every `.env*` file except `.env.example`** (Grep `glob: "!{.env*,node_modules/**,.git/**}"`; shell `--exclude='.env*'`). Read `.env.example` by name. List the other `.env*` files by name (`ls -a`, Glob) and tell the person you did not open them.
2. **Find the files that hold a key** with one files-only search for the key's shape, `(xdev_|xapi_)(test_)?[A-Za-z0-9]{8}` (Grep `output_mode: "files_with_matches"`, or `grep -rIl`). Call the result **K**. A second files-only search for the names (`DEVICE_KEY`, `Bearer`, `Authorization`) finds the files that only mention them. Never run a content-mode search with a pattern like these.
3. **Every other search in content mode, whatever its pattern** (`/v1`, `fetch`, `refund`, a function name), **excludes K** (Grep `glob: "!{.env*,node_modules/**,.git/**,<each file of K>}"`; shell `--exclude=<file>`). A `/v1` line can hold a key too: `curl -H "Authorization: Bearer xdev_… " https://…/v1/payments` in a README, a script or a CI file matches `/v1` and prints the key, so no pattern is safe on its own. With a shell, do both: exclude K **and** pipe the output through the mask, `| sed -E 's/(xdev_|xapi_)(test_)?[A-Za-z0-9]+/\1***/g'`. With only Grep, the exclusion is what protects you.
4. **Lines inside the files of K** are shown only with a shell, through the mask: `grep -In -E '/v1|fetch' FILE | sed -E 's/(xdev_|xapi_)(test_)?[A-Za-z0-9]+/\1***/g'`. Without a shell you do not see them: a files-only search for `/v1` (not excluding K) says which files of K also call `/v1`, and the report says «holds a key and calls `/v1`, lines not shown».
5. **Files of K are never opened with Read or `cat`.** Report each file (and the line number from the masked command) **without the value**. That key sits in a file and probably in git: count it as exposed, like a pasted key (rules, «Secrets»). The way out is in section 5: a new key through a one-time link, the code reading it from the environment, the exposed key revoked last and only after a yes.

**In a check, step 8 below replaces step 4** (the lines of a file of K are shown through its view, or not at all), and the K searches of step 6 come before everything else. Steps 1–5 are otherwise the rule as written.

Added for a check, because a webhook secret has no prefix to mask, and because a README, `.env.example` or a test can hold a key as well:

6. **The first action is building K, before anything is read.** Run the files-only searches of step 2 and step 7, and run both once more on `.env.example` by name (the glob of step 1 leaves it out: Grep with `path: ".env.example"`, or `grep -l`). Until then do not read the README, `.env.example`, a config file or a test. Step 1's «read `.env.example`» and every reading after it are for files outside K. A README, `.env.example` or test file that is in K (a `curl` line with a key, a real-looking key in `.env.example`, a test with a secret literal) is shown only through the masked view of step 8, or reported as «holds a key, lines not shown». Listing names (`ls -a`, `git ls-files`) is fine at any time.
7. **K also holds the files with a hard-coded secret.** One more files-only search, case-insensitive (Grep `-i: true`, or `grep -rIil -E`; the pattern is plain POSIX, so stock macOS and GNU `grep -E` read it as `rg` does), for a secret written as a literal: a name with `secret` in it that is assigned a quoted value (with a type annotation or a wrapper such as `: str =`, `[]byte(`, `Buffer.from(`, `SecretStr(`), or a quoted value after `,`, `or`, `||`, `??` or `?:` behind a lookup of the environment (`os.getenv("…", "lit")`, `os.getenv("…") or "lit"`, `process.env.X || 'lit'`, `getenv('…') ?: 'lit'`); a literal may carry a prefix (`b"…"`, `f"…"`, `r"…"`, `u"…"`) or be in backticks. The last alternative is a configuration line with an unquoted value: a name with `secret`, `key`, `token` or `passw` in it, an `=` or `:` with no space before it, and a non-empty value that is not a `$…` reference (`X_SECRET=abc`, `X_SECRET: abc`, `- X_SECRET=abc`, `export API_KEY=abc`):

   ```secret-literal-regex
   (secret\w*["'`]?(\s*:\s*([[:alnum:]_.<>&*]|\[|\])+)?\s*(=>|:=|=|:)\s*(([^"'`]*["'`][^"'`]*["'`]\)?\s*(,|\s+or\s+|\|\||\?\?|\?:)|[^"'`]*(\s+or\s+|\|\||\?\?|\?:))\s*)?|["'`]\w*secret\w*["'`]\)*\]*\)*\s*(,|\s+or\s+|\|\||\?\?|\?:)\s*|secret\w*\s*(\s+or\s+|\|\||\?\?|\?:)\s*)((\[\]byte|Buffer\.from|SecretStr|SecretString|Secret|bytes|bytearray|str|String|String::from|Some|Encoding\.UTF8\.GetBytes)\(\s*)?[bBfFrRuU]{0,2}["'`][^"'`]{4,}["'`]|^\s*(-\s+|export\s+|ENV\s+|ARG\s+)?[[:alnum:]_.-]*(secret|key|token|passw[[:alnum:]_]*)[[:alnum:]_.-]*(=|:)\s*[^[:space:]"'`$<{(,;#…][^[:space:],;…]*\s*(#.*)?$
   ```

   It matches the forms above and `SECRET = "ABCD1234"` (capitals are not skipped); it does not match `os.environ["XPAYMENT_WEBHOOK_SECRET"]`, an empty default or an empty `X_SECRET=`, `X_SECRET=${X_SECRET}`, a placeholder ending in `…`, or `secret` passed as an argument. It does not find `key = value` written with spaces and no quotes (the same line is a variable in code), and a bare annotation such as `webhook_secret: str` matches too (the file is then in K, which only costs reading comfort). A match in a test file or a fixture is not a finding, but the file still counts as K (not opened, shown masked).
8. **The view of a file of K replaces step 4 in a check.** Step 4's `sed` mask hides only the key's shape; it does not hide a secret, so never use it alone on a file of K, and never Read or `cat` such a file. The view is a small script, because a `sed` mask cannot tell an environment variable's name from a value. It prints the lines that match the selector (the second argument; `.` prints every line), with line numbers, hides the key's shape everywhere and, on a line that names a secret, a key, a token or a password, hides an unquoted value after `=` or `:`, the quoted value after `=`, `:`, `=>`, `,`, `or`, `||`, `??`, `?:` (behind a wrapper such as `[]byte(` too) and then every other quoted literal that is not an UPPER_SNAKE name. Use it also to read a README or `.env.example` that is in K:

   ```masked-view-script
   node - FILE 'KEY|SECRET|TOKEN|URL|DEVICE' <<'JS'
   const [file, sel = '.'] = process.argv.slice(2);
   const pick = new RegExp(sel, 'i');
   const BARE = /^(\s*(?:-\s+|export\s+|ENV\s+|ARG\s+)?[\w.-]*(?:secret|key|token|passw\w*)[\w.-]*[=:]\s*)(?![$<{(\[])[^\s"'`#]\S*?(?=\s+#|\s*$)/i;
   const VALUE = /(=>|:=|\?\?|\?:|\|\||\bor\b|[,=:])(\s*)((?:(?:\[\]byte|Buffer\.from|SecretStr|SecretString|Secret|bytes|bytearray|str|String|String::from|Some|Encoding\.UTF8\.GetBytes)\(\s*)?[bBfFrRuU]{0,2})(["'`])[^"'`]+\4/g;
   const ANY = /(?<![A-Za-z0-9_])([bBfFrRuU]{0,2})(["'`])(?![A-Z][A-Z0-9_]*\2)[^"'`]+\2/g;
   require('node:fs').readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
     if (!pick.test(line)) return;
     let out = line.replace(/(xdev_|xapi_)(test_)?[A-Za-z0-9]+/g, '$1***');
     if (/secret|key|token|passw/i.test(line)) out = out.replace(BARE, '$1***').replace(VALUE, '$1$2$3$4***$4').replace(ANY, '$1$2***$2');
     console.log(`${i + 1}:${out}`);
   });
   JS
   ```

   The result keeps the shape (`WEBHOOK_SECRET = os.getenv("XPAYMENT_WEBHOOK_SECRET") or "***"`: a fallback exists), an empty default or an empty `X_SECRET=` stays visible, the line number is there, the value is not. **Without Node** do not fall back to step 4: do the same in the project's language, or use step 9.
9. **Without a shell, or without Node,** the files-only searches are your evidence: «config.py holds a key» (step 2) and «config.py has a secret written as a literal» (step 7). Report them with the file and «line not shown»: «holds a key / a secret, lines not shown». A README or test that is in K is reported the same way. Never Read the file, and never step 4 alone, to see the lines.
10. **Tracked in git?** `git ls-files -- FILE` prints only a name: a key in a tracked file is in git; `git ls-files '.env*'` lists tracked env files (names only). `.gitignore` is safe to read.

Every file that is not in K (usually the handler, the client, the tests that hold no literal secret, and the README and `.env.example` when they hold no key) is read normally. Find where xPayment is used with content-mode searches that follow steps 1 and 3: `X-xPayment-Signature`, `delivery_id`, `/payments`, `/v1/`, `/v2/`, `device_name`, `webhook`.

## 2. The code checks

Severities are fixed; use them as written. Report a code only when the test of its entry is met; a project that does it right gets no line (say in one sentence what you checked and found fine, with no code in brackets).

| Code | Severity | What is wrong |
|---|---|---|
| `XP-C01` | critical | the signature is compared with a `sha256=` prefix |
| `XP-C02` | critical | the HMAC is not computed over the raw body |
| `XP-C03` | high | the signature is compared, but not in constant time |
| `XP-C04` | critical | a webhook handler does not check the signature at all |
| `XP-C05` | critical | the webhook secret is empty or hard-coded |
| `XP-C06` | critical | an API key is in the code, or `.env` is in git |
| `XP-C07` | high | a payment or link is created without `X-Idempotency-Key` |
| `XP-C08` | high | the order status comes from the webhook body, not from `GET` of the payment |
| `XP-C09` | medium | `EXPIRED`, `CANCELLED`, `FAILED` or refunds are not handled |
| `XP-C10` | medium | a repeated `delivery_id` is processed again |
| `XP-C11` | critical | the key is of the other API version than the base URL |
| `XP-C12` | high | a field or an endpoint that the OpenAPI of this version does not have |

The facts behind them, from the documentation: `X-xPayment-Signature` is the HMAC-SHA256 of the **raw body** with the subscription's secret, lowercase hex, **without** a `sha256=` prefix, compared in constant time; the body holds `event`, `delivery_id`, `payment_id`, `merchant_order_id` (only if it was sent), `environment` — **no status and no amount**; repeats of one delivery share its `delivery_id`; three attempts, then `EXHAUSTED`. Keys: `xapi_…` works only on `/v2`, `xdev_…` only on `/v1`.

### XP-C01 critical — `sha256=` prefix
- **Look for:** the string `sha256=` in the webhook code: Node `` `sha256=${digest}` `` or `'sha256=' + digest`; Python `f"sha256={digest}"`; PHP `'sha256=' . $digest`; Go `"sha256=" + hex.EncodeToString(sum)`; the expected value built with it and compared with the header as it is. Stripping the prefix from the header before a correct compare is not a finding.
- **Why:** the header is the bare hex, so every real delivery is refused with 401 and no order is ever marked paid.
- **Fix:** compare the bare hex digest.
  ```python
  expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()   # no "sha256=" in front
  ```

### XP-C02 critical — not the raw body
- **Look for:** the HMAC input is produced from parsed data: Node `JSON.stringify(req.body)` after `express.json()` (the route sits behind the JSON parser); Python `json.dumps(body)` of `await request.json()` or of a pydantic model; PHP `json_encode(json_decode(...))` or `json_encode($_POST)`; Go `json.Marshal(payload)`.
- **Why:** a re-serialised body differs in spacing and key order from the bytes xPayment signed, so a valid signature does not match, or a check was bent until it "works".
- **Fix:** take the bytes before parsing and sign those.
  ```python
  raw = await request.body()                # FastAPI; PHP file_get_contents('php://input'); Go io.ReadAll(r.Body)
  ```
  ```js
  app.post('/webhooks/xpayment', express.raw({ type: () => true }), handler)   // mounted before app.use(express.json())
  ```

### XP-C03 high — not constant time
- **Look for:** the signature compared with `==`, `!=`, `===`, `!==`, `strcmp`, `.equals(`, `bytes.Equal`, `string(a) == string(b)`.
- **Why:** a plain compare leaks through timing how many leading characters match, which lets an attacker forge a signature.
- **Fix:** a constant-time function: Node `crypto.timingSafeEqual(expectedBuf, sentBuf)` (equal lengths first), Python `hmac.compare_digest(expected, sent)`, PHP `hash_equals($expected, $sent)`, Go `hmac.Equal(a, b)`.
  ```python
  if not hmac.compare_digest(expected.encode(), sent.encode()): raise HTTPException(401)
  ```

### XP-C04 critical — no signature check
- **Look for:** every route that receives xPayment events (it reads `delivery_id`, `payment_id`, `payment.completed`, or changes an order from an outside POST), not only the one the README names: a second handler for refunds, an admin hook, a route kept from an earlier version of the shop. None of them mentions `X-xPayment-Signature` (`HTTP_X_XPAYMENT_SIGNATURE`, `x-xpayment-signature`) or an HMAC.
- **Why:** anyone who finds the URL can post a fake "paid" event and get goods for free.
- **Fix:** the same verify function in front of every handler, before anything else happens; 401 when it fails.
  ```python
  verify_signature(raw, request.headers.get("X-xPayment-Signature", ""))   # raises 401; call it first in every webhook route
  ```

### XP-C05 critical — empty or hard-coded secret
- **Look for:** a literal fallback for the secret: Python `os.getenv("…SECRET", "literal")`; Node `process.env.…SECRET || 'literal'`; PHP `getenv('…') ?: 'literal'`; Go `if secret == "" { secret = "literal" }`; a literal in the code or in `.env.example`. And the opposite: an empty secret accepted (`if (!secret) skip`, HMAC with an empty key, `.env.example` with a real value). Use the files-only search of section 1, step 7, then the masked view (step 8) for the line.
- **Why:** with a secret that is in the code, or empty, anyone can sign events, so the signature protects nothing.
- **Fix:** read it from the environment with no fallback, and refuse every event while it is missing. The hard-coded value is exposed: the account side needs a new one (section 5).
  ```python
  secret = os.environ.get("XPAYMENT_WEBHOOK_SECRET", "")      # no default value
  if not secret: raise HTTPException(500)                      # refuse, never accept unsigned
  ```

### XP-C06 critical — a key in code, or `.env` in git
- **Look for:** section 1 step 2 (the key's shape in a file: code, a README or script with a `curl` line, CI, `.env.example`); `git ls-files '.env*'` listing a file other than `.env.example`; `.gitignore` without `.env`; `.env.example` holding a real-looking key. Report the file and line (masked view), **never the value**.
- **Why:** a key in a file is in git history for everyone with access to the repository, and anyone with it moves money through the cashbox.
- **Fix:** the code reads `XPAYMENT_API_KEY` from the environment with no default; `.env` in `.gitignore` and out of git (`git rm --cached .env`); the exposed key is replaced and revoked (section 5): removing it from the file does not make it safe again.
  ```python
  API_KEY = os.environ["XPAYMENT_API_KEY"]    # no default
  ```

### XP-C07 high — no `X-Idempotency-Key`
- **Look for:** every create call to `/payments` and `/payments/link` (Node `fetch`/`axios`, Python `httpx.post`/`requests.post`, PHP `curl_init`/`file_get_contents` with a context, Go `http.NewRequest`) whose headers lack `X-Idempotency-Key`.
- **Why:** a retry after a timeout can create a second payment or link for the same order. The documentation defines the header for `POST /payments`; for links it names `merchant_order_id` as the guard, and the header does no harm there. Say this in the line when the code only creates links.
- **Fix:** a UUID made once per order and kept with it, sent on every create call.
  ```python
  headers={"Authorization": f"Bearer {API_KEY}", "X-Idempotency-Key": order["idempotency_key"]}
  ```
  A fresh UUID on every request is better than none, but a retry then gets a new key: keep one per order.

### XP-C08 high — status from the webhook body
- **Look for:** the handler reads `status` (or an amount) from the event: Node `req.body.status`, `event.status`; Python `body.get("status")`, `data["status"]`; PHP `$data['status']`; Go `event.Status`; or maps the event name (`payment.completed`) straight to an order status. No `GET /v2/payments/{id}` (or `/v1/…`) in the handler.
- **Why:** the body has no status and no amount, so the code reads nothing real (or a default), and orders are marked paid without a payment.
- **Fix:** after the signature and the repeat check, read the payment and take its `status`.
  ```python
  payment = await xpayment("GET", f"/payments/{event['payment_id']}")
  new_status = ORDER_STATUS.get(payment["status"])
  ```

### XP-C09 medium — statuses not handled
- **Look for:** the status map or `if` chain has only `COMPLETED` (paid); no `EXPIRED`, `CANCELLED`, `FAILED` (payment failed), no `REFUNDED`, `PARTIALLY_REFUNDED` (refunded); no handling of `payment.refunded` / `payment.refund_failed`. Unhandled statuses fall through as "no change" or crash.
- **Why:** an order whose payment expired or was cancelled stays "waiting" forever, and a refunded order still looks paid.
- **Fix:** a full map.
  ```python
  ORDER_STATUS = {"COMPLETED": "paid", "REFUNDED": "refunded", "PARTIALLY_REFUNDED": "refunded",
                  "EXPIRED": "payment_failed", "CANCELLED": "payment_failed", "FAILED": "payment_failed"}
  ```
  Use the project's own order statuses. `PENDING`, `WAITING_FOR_PAYER`, `QR_TOKEN_CREATED` change nothing.

### XP-C10 medium — a repeated `delivery_id` runs again
- **Look for:** the handler never reads or stores `delivery_id`, and has side effects on every call (a receipt sent, stock taken, a status set from the repeat). A set of processed ids in memory is fine for a demo and is not a finding (mention in plain words that it is lost on restart).
- **Why:** xPayment repeats a delivery after a failed answer or a timeout, so a customer gets two receipts or two goods.
- **Fix:** store processed ids (a table with a unique key) and answer 2xx at once for a known one, before reading the payment; mark an id processed after it was handled.
  ```python
  if await seen(event["delivery_id"]): return {"ok": True}      # a repeat: stop
  ```

### XP-C11 critical — the key of the other version
- **Look for:** the base URL says `/v2` (or paths `/v2/…`) while the key used is `xdev_…`, the variable `DEVICE_KEY` or `deviceKey`; or `/v1` with `xapi_…` or `API_KEY`. One client can mix them: a link made with the `xapi_` key and a payment read with the `xdev_` key on `/v2`. `.env.example` and README show which variable holds which kind. If the code leaves the real kind open, run a script of the project's stack that loads `.env` itself and prints only the kind; never print the key. For Node (name the variables the code reads):
  ```sh
  node -e 'const fs=require("fs");if(fs.existsSync(".env"))process.loadEnvFile(".env");for(const n of process.argv.slice(1)){const k=process.env[n]||"";console.log(n,!k?"missing":k.startsWith("xapi_test_")?"xapi_test_":k.startsWith("xapi_")?"xapi_":k.startsWith("xdev_test_")?"xdev_test_":k.startsWith("xdev_")?"xdev_":"other")}' XPAYMENT_API_KEY XPAYMENT_DEVICE_KEY
  ```
  The same in Python or PHP when there is no Node. A variable already set in the shell wins over `.env`: it checks the environment the code would see.
- **Why:** a key works only on its own version; the other answers 401, so the calls fail (often only the read after a webhook, which then ends in 500s and paid orders stay unpaid).
- **Fix:** one kind of key per base URL: v2 uses `xapi_…` (and `device_name`), v1 uses `xdev_…`.
  ```python
  headers={"Authorization": f"Bearer {config.API_KEY}"}    # not DEVICE_KEY on /v2
  ```
  Moving to v2 on purpose is the `migrate-v2` skill (`/xpayment:migrate-v2` in Claude; elsewhere «the xPayment migrate-v2 skill»). Code that is on v1 with `xdev_` keys and `/v1` paths is correct: not a finding.

### XP-C12 high — a field or an endpoint not in the OpenAPI
- **Look for:** every endpoint the code calls and every field it sends or reads. For each call, `describe_endpoint` with `version`, `method`, `path` (the version of the base URL). Compare the request body fields and the answer fields the code reads (for example `link["qr_token"]` exists; `link["payment_url"]` may not). Typical inventions: `callback_url`, `return_url`, `success_url`, `description`, `currency` on a link; `phone` for `payer_phone`; `order_id` for `merchant_order_id`; a path like `/payments/create`. Judge from the answer of `describe_endpoint`, never from memory; a tool error (`DOC_SECTION_NOT_FOUND`) for the path is itself the finding.
- **Why:** an unknown field is ignored or rejected (400/422), so the feature the code relies on (a callback URL, a return page) silently does not exist; an unknown endpoint is a 404.
- **Fix:** remove it or use what the reference has. The webhook URL is set on the subscription (`create_webhook` / the cabinet), not per payment; the order id goes in `merchant_order_id`.

## 3. The account checks (the «xpayment» tools, live)

Run them when the tools are connected and the person is signed in (`whoami`). Pass `environment: "live"` to the tools that take it (`get_account` takes no arguments). The tools are read-only except `test_webhook`. Not signed in: do the code part, then say that you did not look at the account and how to connect («Account» of the rules). `SCOPE_REQUIRED`: name the right and how to grant it.

| Code | Severity | Source and test |
|---|---|---|
| `XP-A01` | high | `list_devices`: a cashbox with `is_active: false` |
| `XP-A02` | high | `list_devices`: `session_problem_since` is set: Kaspi has refused the cashbox's session since then; payments through it may fail |
| `XP-A03` | critical | `list_webhooks`: `has_secret: false`: deliveries are not signed |
| `XP-A04` | high | `list_webhooks`: `is_active: false`, `failure_count` above 0 or `failing_since` set: deliveries to the URL are failing |
| `XP-A05` | high | `test_webhook`: the test event was not accepted (`WEBHOOK_TEST_FAILED`; its message says why) |
| `XP-A06` | high | `get_account`: `billing` is null, `status` is not `ACTIVE` (for example `LOW_BALANCE`), `balance` is below `-overdraft_limit`, or `trial_expires_at` is in the past with no active plan |

- **Times:** the tools answer UTC; tell Kazakhstan time (UTC+5): `2026-11-09T09:20:00Z` is 14:20.
- **XP-A02:** before you write the line, `search_docs` «сессия кассы» and give as the fix only what the documentation says; if it has no steps for this, say that and link `https://xpayment.kz/docs`. Never invent steps.
- **XP-A03 fix:** `rotate_webhook_secret` (`live`) answers a one-time link for the secret; it needs a yes («Confirmation» of the rules), and the handler must verify with the new value. Offer it; do not call it while checking.
- **XP-A04:** `list_webhook_deliveries` (`subscription_id`, `live`) shows `response_code` and `status` (`FAILED`, `EXHAUSTED`: not sent again). The cause is usually the handler: look at it in the code, then `test_webhook`.
- **XP-A05, the test event** (no money; not stored in the deliveries): before the call say in one sentence what you will do, «I will send one signed test event to <url> of each active subscription». Then `test_webhook` with `subscription_id`, `environment: "live"` for each **active** subscription. It needs no `confirmed`. The event has a made-up payment id, so a correct handler answers 2xx (a payment that is not found changes nothing). A paused subscription (`is_active: false`) is not tested; it is XP-A04.
- **XP-A06:** `topup_url` is the page to pay; the person pays, you do not. Without `billing` or with an inactive plan, live payments are refused.
- **Cross-check, plain words, no code:** the path of a subscription's `url` against the route in the code; the `device_name` in the code (or `.env.example`) against the names `list_devices` shows. A name that no cashbox has gets `DEVICE_NOT_FOUND`: say so after the lines.

## 4. The report

One line per finding, exactly this form (the labels `critical`, `high`, `medium` stay in English; the rest in the person's language):

`[XP-C01] critical — <what is wrong> (<file:line>) — <why it matters> — <how to fix>`

- Four parts after the code and severity, separated by « — »: what is wrong, the place in **round brackets**, why it matters, how to fix it. The closing bracket of the place is always followed by « — ». The place is always `file:line` (`config.py:4`), never «line 4» or «строка 4». Examples:

  ```
  [XP-C03] high — the signature is compared with != (webhooks.py:23) — a plain compare leaks timing, so a signature can be guessed — use hmac.compare_digest
  [XP-C06] critical — an API key is written in the code as a default (config.py:4, value not shown) — it is in git, so it counts as exposed — read it from the environment with no default; a new key by a one-time link, this one revoked last
  [XP-A02] high — Kaspi refuses the session of a cashbox (cashbox shop1, since 14:20 Kazakhstan time) — payments through it may fail — <the steps the documentation gives>
  ```
- Order: all `critical`, then all `high`, then all `medium`. Inside one severity, code findings first, then the account.
- Account findings put the object where the file goes: `(cashbox shop1)`, `(subscription https://shop.example/hook)`, `(billing)`.
- A finding in several places: one line, the places separated by commas inside the brackets: `(webhooks.py:21, hooks.py:9)`. A place that cannot be given (a file of K without a shell, an account tool unreachable): `(config.py, line not shown)`.
- Never a key, a secret or any part of one in a line. A key or secret in the code is told as the file and line only.
- A first sentence with the totals is welcome; count the lines you wrote.
- After the lines, short and without codes in brackets: what you checked and found fine (a few lines, not a list of every check), what you could not check and why, plain-word notes. In code mode with code findings, end with one question: whether to fix the code.

## 5. Fixing, after a yes

- One change at a time, in the order of the report; run the project's own tests afterwards and show what changed. Do not touch what the report did not name.
- **Files of K** are edited with a shell command whose pattern matches the literal without writing it (for example `sed -i.bak -E 's/(getenv\("XPAYMENT_API_KEY"), *"[^"]*"\)/\1)/' config.py`, then remove the `.bak`), then look at the result through the masked view. The Edit tool needs the file read first, which would print the key.
- **A key or a secret that was in the code** is exposed. A new key: `create_api_key` (`live`, `version`) answers a one-time link; the person opens it and saves the value as `XPAYMENT_API_KEY` where the code reads it. When the code and the server use the new key, `revoke_api_key` for the exposed one, **only after an explicit yes** that restates the key by its `name`. A new webhook secret: `rotate_webhook_secret` (`live`), also after a yes, then `XPAYMENT_WEBHOOK_SECRET`. Order for a live key: the new one first, the switch, the exposed one last.
- `.env` goes into `.gitignore`; a tracked one leaves git with `git rm --cached .env` (the person commits).
- Write the handler as the shop's stack and style do; keep the entry point and the start command.
- Then run the check again on the changed files and report what is left.
