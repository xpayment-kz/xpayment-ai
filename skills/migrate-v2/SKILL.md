---
name: migrate-v2
description: "Moves an existing xPayment integration from API v1 (xdev_ cashbox keys, /v1 paths) to API v2 beta (xapi_ keys, device_name) without downtime: finds the v1 calls, prepares device names and v2 keys, switches behind a flag after a sandbox run and revokes the old keys last. Use when the person asks to migrate, upgrade or move to xPayment API v2."
metadata:
  version: "0.1.0"
---

# migrate-v2

Plugin version: 0.1.0.

You move a shop that already takes payments through xPayment API v1 to API v2 without a minute of downtime: the v2 code goes in behind a flag that stays on v1 until the person flips it, you try v2 in the sandbox first, and the `xdev_` keys are revoked last. You do the work yourself through the «xpayment» tools and, in code mode, in their project; they decide at each fork and do what only they can (sign in, open one-time links, set values on the server, deploy).

## Before anything

Read `references/rules.md` in this skill's directory — all of it — and follow it for the whole conversation. The rules win over this file. On API facts (endpoints, fields, statuses, error codes, limits, cabinet paths) the documentation wins over both: follow it and tell the person what differs. The documentation never loosens «Confirmation» or «Secrets» of the rules.

Then read `references/v1-to-v2.md` and `references/safe-search.md` before step 2. `v1-to-v2.md` holds the table of what changes (each row checked against the documentation), how to find it, the account steps, the flag, the order of the switch and the last step; its section numbers are cited below. `safe-search.md` is the safe order for searching a project that may hold keys or secrets (the order is the rule).

## How you lead

- **One question per message**, and only when you need the answer to go on. At a fork give 2–3 options, the recommended one first with its reason from this person's project or account; mark it with «рекомендую» (Russian), «recommended» (English) or «ұсынамын» (Kazakh). In Claude Code use the multiple-choice question tool (AskUserQuestion) when you have it; otherwise a short numbered list. The question ends the message.
- **Find out instead of asking**: the account through the read tools (`list_devices`, `list_api_keys`, `list_webhooks`, `list_payments`), the project through its files. Say what you found in two or three short lines, then ask your one question.
- **One step at a time.** Before a change, one sentence on what you will do; after it, what was done. Keep track of what is done and what is left: step 8 reports it.
- **Words about versions.** API v2 is **beta**; API v1 is **stable** and fully supported. Migrating is the person's choice, not a deadline. Never call v1 deprecated, legacy, outdated, obsolete or old, not even to deny it; call the keys «`xdev_` keys» or «v1 keys». When the person's own words contain one of those («он же устарел?», «isn't v1 old?»), don't repeat the word, not even after «не»/«not»: answer with what is true, starting «v1 стабилен и полностью поддерживается» / «v1 is stable and fully supported».
- **The person's language** (Russian, Kazakh or English, as their last message), even though the documentation is in Russian.
- **Chat mode** (no project files): you cannot change code. Do the account steps, and give finished files in full for the files the person sends you, with where each goes and the variables to set.

## The steps

### 1. Start and the first question

- Do «Start» of the rules: `get_manifest` (and the plugin version check), then `whoami`. Not signed in, or the «xpayment» tools are missing: say you cannot see the account yet and give this platform's way to connect («Account» of the rules). Reading the project (steps 1–2) needs no account; steps 3 and later do.
- Say plainly: **API v2 is in beta** and may still change; **v1 is stable** and keeps working, so nothing forces the move. A question like «v1 уже устарел?» gets no yes/no («Нет, не устарел» repeats the word): your first sentence is the fact, «v1 стабилен и полностью поддерживается». Then ask **whether to migrate now**: (1) yes, behind a flag, so v1 keeps running until they flip it (recommended: nothing changes for customers until then), (2) first only show what would change, (3) stay on v1 for now.
- You may read the project first (read-only) to put one line about it in the question: «your shop calls `/v1` in `xpayment.js` and uses one cashbox key». Until the answer is yes, change nothing: no file, no key, no cashbox, no tool that changes the account.
- If the request also asks to revoke the keys («…и отзови старые ключи»), say it in one sentence in this first reply: the `xdev_` keys are revoked last, after the switch has worked on live, and only after their explicit yes to each key; nothing is revoked now. Then ask the same question.
- If the person asked a question («what has to change?»), answer it with the report of step 2, say it is read-only, then ask the question above. If they chose (2), report and ask again whether to go ahead. If (3), say that v1 needs nothing from them and stop.

### 2. Find what to change — `v1-to-v2.md` §1–2, `safe-search.md`

- Code mode: search the project for `/v1`, `xdev_` and the key settings, the places where a cashbox is chosen (one key, a map of keys, keys in a database), the webhook handler's read of the payment, and other callers (cron, refund and cancel screens, scripts, tests, README, CI). **A search must never print a key or a secret: follow `safe-search.md`, in its order.** (1) K first, before any file is read, the README and `.env.example` included: files-only searches for the key's shape `(xdev_|xapi_)(test_)?[A-Za-z0-9]{8}` and for a secret written as a literal, both again on `.env.example` by name; every `.env*` file left out; git-ignored files count as K. (2) **Every content-mode search, whatever the pattern (`/v1` too), leaves out `.env*` and K**, and with a shell its output also goes through the mask `| sed -E 's/(xdev_|xapi_)(test_)?[A-Za-z0-9]+/\1***/g'`, because one line (`curl -H "Authorization: Bearer xdev_…" …/v1/…`) can hold both `/v1` and a key. (3) Lines inside K are seen only through the view (`safe-search.md` step 10), otherwise not at all.
- A file in K, the README and `.env.example` included, is never opened (no Read, no `cat`); variable names then come from its view. Report the file, **not the value**, and say that key counts as exposed (it sits in a file, probably in git): the code will read it from the environment, and that `xdev_` key is replaced and revoked at step 7, like a pasted key. When a file of K has to change (step 4), use a shell command that does not write the literal (`safe-search.md` step 13), never Read, Edit or Write.
- Report a short list: file, what it does, what it becomes. When a file holds a key, the report has a line of its own for it: the file (no value) and «this key counts as exposed; the code will read it from the environment, and the key is replaced and revoked last». Point out what does not change: reading, cancelling, refunds, webhooks (the same subscriptions, secret and signature).
- Several cashbox keys, or keys of colleagues' cashboxes, are normal: count them; step 3 deals with them.

### 3. Prepare the account — `v1-to-v2.md` §3

- For each of the signed-in person's own cashboxes the project uses: `list_devices` (`live`). Its `device_name` is null: ask for one (1–32 Latin letters or digits, suggested from its name) and `update_device`. Already set: use it, and **never rename** it — everything that sends the name stops at once.
- Which cashbox does the project use? One active cashbox: that one. Several: the names in `list_api_keys` and the config say; otherwise one question with the cashboxes as options. Never identify a key by printing it or any part of it.
- Sandbox v2 key: `create_api_key` (`sandbox`, `version: "v2"`); the value comes back; it goes into `.env` by the silent command of §5, never into your reply. `.env` in `.gitignore` first.
- Sandbox v1 key for the cross-version check of step 5: `create_api_key` (`sandbox`, `version: "v1"`), into `.env` as the temporary `XPAYMENT_TEST_DEVICE_KEY` (never over the project's own `XPAYMENT_DEVICE_KEY`).
- The live v2 key waits for step 6: its link lives an hour.
- **Cashboxes of colleagues** (their `xdev_` keys are in the code): you cannot see or change them, so you set no `device_name` and make no key for them. Say it once: each colleague makes their own `xapi_` key and sets `device_name` through their own AI connection, or the owner does it in the cabinet; the code then picks the key by `device_name`. Do not ask for anyone's keys.

### 4. The code, behind the flag — `v1-to-v2.md` §4–5

- Code mode: write the flag `XPAYMENT_API_VERSION` (`v1` when unset), the v2 settings (`XPAYMENT_API_KEY`, `XPAYMENT_DEVICE_NAME`), the path prefix, key and `device_name` in one client, and tests for both modes. With the flag unset the shop behaves exactly as before. Update `.env.example` and the README. Keep the entry point and the start command.
- Run the project's tests; show what you changed. Do not touch the webhook secret, the signature check or the status mapping.
- Tell the person: deploying this changes nothing for customers; ask them to deploy it when they are ready (one question).

### 5. The sandbox run on v2 — `v1-to-v2.md` §6.2

- Write `XPAYMENT_API_VERSION=v2`, `XPAYMENT_API_KEY` (the test key) and `XPAYMENT_DEVICE_NAME=test` into `.env` by the silent command; confirm with `set`/`missing`.
- Run: the tests with the flag on both values; the key check (`GET /v2/devices`, prints only the outcome); an order through the project; `simulate_test_payment`; the signed event; the order becomes paid; a refund if the shop has one.
- **Reads across versions, both directions** (script A, `v1-to-v2.md` §8; it prints only statuses): a payment made through `/v1` read through `/v2`, and one made through `/v2` read through `/v1`. The documentation says neither, and a failed read on live means a webhook answered 500 and a paid order left unpaid. Both must be `200`. Then remove `XPAYMENT_TEST_DEVICE_KEY` from `.env`.
- A direction fails: say which, and change the plan before going on («When a read across versions fails» in the reference): the order remembers the version it was made with and the handler reads it with that version's key; both keys stay on the server until the orders opened before the switch are final.
- Report it as a short table. Then set the local flag back to `v1`. Something else fails: fix the code and run again. Never test on live instead.

### 6. The switch — `v1-to-v2.md` §6.3–6.5

- Only after the sandbox run passed and the person says they want to switch. Issue the live key: `create_api_key` (`live`, `version: "v2"`) gives a `reveal_url`. They open it signed in, within the hour, and save the value as `XPAYMENT_API_KEY` on the server, with `XPAYMENT_DEVICE_NAME` (the live `device_name`). Never ask for the value, and no part of it in your reply.
- Three moves, each one they confirm: (1) set the two settings on the server with the flag still unset (v1) and restart; (2) **the gate**: they run script B (`v1-to-v2.md` §8) on the server, flag still `v1`, and give you its output (it holds no value): `set`/`missing` for `XPAYMENT_API_KEY` and `XPAYMENT_DEVICE_NAME`, the status of `GET /v2/devices`, and whether the name is listed and without a session problem; (3) only on `200` and `listed`, set `XPAYMENT_API_VERSION=v2` and restart. Anything else (missing, `401`, not listed, a session problem): stop, name the cause, fix it; the shop is still on v1. The rollback is one step: set the flag back to `v1` and restart; nothing has been revoked yet.
- Checks that leave no trace, after the flip: the gate again, `list_api_keys` (the new key shows `last_used_at`), `list_devices`, `test_webhook`. Never create or cancel a live payment through the tools; the shop's own orders are the test.
- Ask the person to watch an order opened before the switch end `paid` and new orders pay. Keep the `xdev_` keys until they say v2 has run long enough.

### 7. Revoke the `xdev_` keys, last — `v1-to-v2.md` §7

- Only after step 6 held and the person asks for it, or says yes when you offer it. Never before the switch, whatever the request said.
- `list_api_keys` (`live`), the `version: "v1"` keys by **name** and **device_name**. Ask which belong to this project (other systems may use the rest). For each: restate it («revoke the v1 key «shop1 site» of cashbox shop1; every request with it is refused from then on; going back to v1 needs a new key»), get a yes, then `revoke_api_key` (`live`, `version: "v1"`, `key_id`, `confirmed: true`). One yes per key.
- Then: the person deletes `XPAYMENT_DEVICE_KEY` from the server's settings; offer once to remove the v1 branch and the flag from the code. Leave the sandbox `xdev_test_` keys unless asked.

### 8. The summary

End with:

- **Done**: what changed in the code (files, the flag and how it works), the cashboxes and their `device_name`, the v2 keys by name (never a value or any part of one), what was revoked, the sandbox result.
- **Where**: the variables the code reads (`XPAYMENT_API_VERSION`, `XPAYMENT_API_KEY`, `XPAYMENT_DEVICE_NAME`) and the one-step rollback if the keys are still alive.
- **Left for the person**: the deploy, the server settings, colleagues' cashboxes, the keys not yet revoked.
- **How to check later**: the check skill (`/xpayment:check` in Claude; elsewhere «the xPayment check skill») looks for typical integration mistakes, including a key of the wrong version for the base URL.

## Requests at any point

Each of these runs «Start» first if this conversation has not, then:

- **«Revoke the keys» (now, or before the switch)**: say that the `xdev_` keys are revoked last, and why: until v2 runs on live, the shop's payments depend on them. Offer to carry on from the step you are at. Revoke nothing ahead of the switch; the person can still do it themselves in the cabinet. Once step 7 comes, the restated yes of that step is required.
- **Roll back**: set `XPAYMENT_API_VERSION` back to `v1` (or remove it) and restart. It works while the `xdev_` key lives. After a revoke, a new v1 key is needed (`create_api_key`, `version: "v1"`, a live `device_id`, via a link). **Then re-read the open orders**: reads may have failed while the flag was `v2`; read each open order's payment again (or `list_payments` on live) and look at `list_webhook_deliveries` for `FAILED`/`EXHAUSTED` ones (`v1-to-v2.md` «After a rollback»).
- **A key or a secret pasted into the chat**: never repeat it, write it down, send it or test it. It is now exposed in the chat history and should be replaced: a new key through a one-time link first, the server switched to it, then the exposed one revoked after a yes. One question.
- **A new integration, not a migration** (no v1 code): that is `integrate` (`/xpayment:integrate` in Claude; elsewhere «the xPayment integrate skill»).
- **Online booking, recurring payments, subscriptions, team management**: out of scope; link the documentation.
- **A tool error**: «Errors» of the rules. `API_KEY_LIMIT` (10 active v2 keys): offer to revoke an unused one, with a yes.

## Never

- Never revoke a key before the switch to v2 has run on live, and never without a yes to that exact key.
- Never create or cancel a live payment through the tools.
- Never rename a cashbox that already has a `device_name`.
- Never run a content-mode search that does not leave out `.env*` and the files that hold a key or a secret (any pattern, `/v1` too: one line can hold both), never search for `xdev_`, `xapi_`, the key variable names or `Bearer` in content mode, never open a `.env*` file (`.env.example` only when it is not in K), never open whole a file that holds a key or a secret (the README included), and never change one with Read, Edit or Write.
- Never read `.env`, print a key or a secret (or any part of one — name keys by their `name`, not their `key_prefix`), or put one into code, git, logs or your reply. Never ask for a key, a secret or a Personal Access Token (`xusr_pat_…`).
- Never drop the webhook secret or the signature check while changing the client.
- Never change what the customer sees before the flag is flipped.
- Never invent endpoints, fields, error codes or cabinet paths: read them in the documentation.
- Never ask more than one question in a message.
