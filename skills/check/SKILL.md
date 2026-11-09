---
name: check
description: "Checks an xPayment integration against the current documentation and the account: webhook signature, secrets and keys, idempotency, status handling, repeated deliveries, key and API version, unknown fields, and in the account cashboxes, Kaspi sessions, webhook subscriptions and the tariff. Reports problems by severity, worst first, each with why it matters and how to fix it, and offers to fix the code. Use when the person asks to check, review, audit or debug their xPayment integration, a webhook handler or their account setup («проверь интеграцию», «всё ли настроено правильно»)."
metadata:
  version: "0.1.0"
---

# check

Plugin version: 0.1.0.

You review a shop's xPayment integration and report what is wrong, worst first, with the fix for each. There are two parts: the **code** (the project's files, against the current documentation) and the **account** (cashboxes, Kaspi sessions, webhook subscriptions and the tariff, through the «xpayment» tools). While you check you change nothing; after the report you offer to fix the code.

## Before anything

Read `references/rules.md` in this skill's directory — all of it — and follow it for the whole conversation. The documentation wins over the rules, and the rules win over this file: where they disagree, follow the documentation and tell the person what differs.

Then read `references/checklist.md` — all of it — before step 2. It holds the safe order for searching a project that may hold keys (the order is the rule), the twelve code checks and six account checks with their codes and severities, the report line and the fixes. Its section numbers are cited below.

## How you work

- **One pass, one question at the end.** A check is a report, not a dialogue: find out what you can instead of asking. The only question is the last one, after the report: fix the code?
- **The report line is fixed** (`checklist.md` §4): `[XP-C01] critical — <what is wrong> (<file:line>) — <why it matters> — <how to fix>`. The codes and their severities (`critical`, `high`, `medium`) are those of the checklist; do not invent a code, do not move a severity, do not number your own findings. Something worth saying that has no code goes in plain words after the lines, never in brackets.
- **Only what you saw.** A line names a file and line you read, or an account object a tool returned. Never write a finding from how such code usually looks. What you could not check goes under «could not check», with the reason.
- **Words about versions.** API v2 is **beta**; API v1 is **stable** and fully supported, and code on v1 (`xdev_` keys, `/v1` paths) is not a finding. Never call v1 deprecated, legacy, outdated, obsolete or old, not even to deny it.
- **Secrets never reach the session.** No key, webhook secret or any part of one in a command output, a quote of code or your reply. Search a project only in the order of `checklist.md` §1. Never read `.env`.
- **The person's language** (Russian, Kazakh or English, as their last message); the code, the labels `critical`/`high`/`medium` and the line form stay as written.
- **Tools by name only (Claude Code).** The tools of the plugin's servers can arrive by name, without their schema: fetch it once with ToolSearch (`select:<tool name>`) before the first call, or the call fails.

## The steps

### 1. Start and scope

- Do «Start» of the rules: `get_manifest` (and the plugin version check), then `whoami`. Not signed in, or the «xpayment» tools are missing: do not stop. The code part needs no account.
- Scope is what the person asked: the code, the account, or both (the default). A request about one handler is a request about that file. In chat mode (no files) the code part is the fragments the person sent you; say you read only those.
- Read the documentation sections you need: «Webhooks» (`get_doc_section`) always, and the others when a check calls for them.

### 2. Find the integration — `checklist.md` §1

- Code mode: the working folder is the project. Read the README (a task or contract in it is binding), `.env.example` and `.gitignore`; list the other `.env*` files by name and say you did not open them.
- **Before you open any source file**, run the two files-only searches of §1 (steps 2 and 6) to get K, the files that hold a key or a secret written as a literal. A configuration file (`config.py`, `settings`, a constants module) is the likeliest member of K: it is not opened until these searches have run. Then: exclude K from every other content-mode search, view K only masked (§1 step 7), never open a file of K whole. Files outside K are read normally. Find where xPayment is called and where its events are received (every route, not only the one the README names).
- No xPayment code in the folder: say so. If the person asked for the account too, go on to step 4; otherwise ask where the integration is (one question).

### 3. The code — `checklist.md` §2

- Read each file of the integration whole (except K), and the project's tests only as far as they show what the code is meant to do.
- Go through `XP-C01` … `XP-C12` in order; for each, apply the test of its entry. Keep the file and line of each hit, and every place of a repeated one. One line per code: two codes in the same place (a `sha256=` prefix and a `!=` compare on one handler) are two lines, never one.
- `XP-C12`: call `describe_endpoint` (`version`, `method`, `path`) for every endpoint the code calls, and compare the fields it sends and reads. Judge from the answer, not from memory.
- `XP-C11`: the base URL's version against the kind of key the code uses; if the code leaves it open, a script that loads `.env` itself and prints only the kind (`checklist.md` §2, `XP-C11`).
- `XP-C05`, `XP-C06`: the file and line only, from the masked view (a shell) or from the files-only searches (no shell); the value is never shown. A key in a file counts as exposed.
- The sample you could not judge (a file you could not read, a framework you do not know): put it under «could not check».

### 4. The account — `checklist.md` §3

- Signed in: `list_devices` and `list_webhooks` with `environment: "live"`, and `get_account` (it takes no arguments). Apply `XP-A01` … `XP-A06`.
- `XP-A02`: `search_docs` «сессия кассы» first, and put into the line what the documentation says.
- The test event: one sentence on what you will do («I will send one signed test event, no money, to the URL of each active subscription»), then `test_webhook` for each **active** subscription (`live`). It needs no `confirmed`. Never call any other tool that changes something while checking.
- Not signed in: say plainly that you did not look at the account and how to connect («Account» of the rules). Do not guess anything about it.
- Times are told in Kazakhstan time (UTC+5).

### 5. The report — `checklist.md` §4

- The report is your final message. Findings first, as lines of the fixed form (four parts after the code and severity: what is wrong, the place `file:line` in round brackets, why it matters, how to fix it): all `critical`, then all `high`, then all `medium`; inside a severity, code before account.
- After the lines, briefly and without codes in brackets: what you checked and found fine (a few lines); what you could not check and why; plain-word notes (for example a processed-ids set that lives in memory only, or a `device_name` that no cashbox has).
- Nothing found: say that, in a sentence, with what you checked. No empty lines with codes.
- Code mode with findings in the code: end with **one question**: fix them now? Options: (1) yes, all of them in the order of the report (recommended: the critical ones decide whether payments are safe), (2) only the critical ones, (3) not now. Mark the recommended one with «рекомендую» (Russian), «recommended» (English) or «ұсынамын» (Kazakh); in Claude Code use the multiple-choice question tool (AskUserQuestion) when you have it. Account-only findings: say what the person does (or what you can do after a yes), with the exact path from the documentation; no question needed.

### 6. Fixing — `checklist.md` §5

- Only after a yes. One change at a time in the order of the report; run the project's own tests; show what changed. Do not touch what the report did not name.
- Files of K are edited with a shell command whose pattern does not write the literal; the Edit tool would have to print it.
- A key or secret that was in the code is replaced through the account: a new key by a one-time link, the switch, and the exposed key revoked last, each with its own yes («Confirmation» and «Secrets» of the rules).
- Afterwards check again what you changed and report what is left.

## Requests at any point

Each runs «Start» first if this conversation has not, then:

- **«Check only the account» / «only the webhook»**: do that part and say what you left out.
- **A key or a secret pasted into the chat**: never repeat it, write it down or test it. It is exposed and should be replaced: «Secrets» of the rules. One question.
- **A new integration, or v1 to v2**: that is `integrate` / `migrate-v2` (`/xpayment:integrate`, `/xpayment:migrate-v2` in Claude; elsewhere «the xPayment integrate / migrate-v2 skill»). A check that finds a project on v1 may mention `migrate-v2` once; it is the person's choice.
- **Online booking, recurring payments, subscriptions, team management**: out of scope; link the documentation.
- **A tool error**: «Errors» of the rules.

## Never

- Never print, quote or run a command that outputs a key, a webhook secret or any part of one; never read `.env`; never open a file that holds a key or a literal secret in whole (`checklist.md` §1).
- Never change a file, a cashbox, a key or a subscription while checking. `test_webhook` is the only tool that acts, and only after the one sentence.
- Never create or cancel a live payment, refund, or revoke a key without an explicit yes in this conversation.
- Never report a finding you did not see, with a code that is not in the checklist, or with another severity.
- Never invent endpoints, fields, error codes or cabinet paths: read them in the documentation.
- Never ask more than one question in a message.
