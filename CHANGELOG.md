# Changelog

All notable changes to this plugin are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

### Added

- Plugin skeleton: Claude and OpenAI manifests, the marketplace file and the MCP configuration for the `xpayment-docs` and `xpayment` servers.
- Four skill stubs: `ask`, `integrate`, `migrate-v2`, `check`.
- `scripts/plugin-check.mjs` (repository consistency checks), `scripts/sync.mjs` (shared references, documentation snapshot, version bump) and CI.
- `shared/rules.md`: the rules every skill follows (start check, modes, one question at a time, sign-in, environments, confirmations, secrets, error codes, API versions, out-of-scope topics, language), copied into each skill's `references/`.
- A snapshot of the public documentation (`shared/docs/`, 2026-11-09) for when xpayment.kz cannot be reached.
- The `ask` skill: answers questions from the live documentation and, when signed in, from the account; changes nothing and points to the skill that does.
- Eval cases for `ask` (`evals/`, `evals-signed-out/`) with mocks of both MCP servers recorded from the live documentation server and the account server's code.
- The `integrate` skill: from sign-in to the first live payment in ten steps (scenario, API version, readiness, the sandbox cycle, code, live webhook, live key, summary), with step references `scenarios.md`, `readiness.md`, `sandbox-cycle.md`, `code.md` (client and webhook handler for Node, Python and PHP, writing `.env` without reading it, checks that print no values) and `go-live.md`.
- Rules: writing `.env` without reading it, publishing a payment page after a yes (the tool has no `confirmed`), the safe order for replacing a pasted live key, `INVALID_ENVIRONMENT` on a live-only tool, long `RATE_LIMITED` waits, a repeat after `INTERNAL_ERROR`, choosing a cashbox after a device error, never the word «paste» for live values.
- Eval cases for `integrate` (ten, six of them safety gates) and the account mocks they use; `get_doc_section` mocks now answer the recorded sections (the harness cannot pick a fixture by a Cyrillic title).
- The `migrate-v2` skill: moves an integration from API v1 to API v2 (beta) in eight steps (the first question, finding the v1 calls, the account side, the code behind an `XPAYMENT_API_VERSION` flag, a sandbox run on v2, the switch with a one-step rollback, revoking the `xdev_` keys last and only after a yes per key), with `references/v1-to-v2.md` (what changes, each row checked against the documentation).
- Eval cases for `migrate-v2` (five, one of them a safety gate) in a scaffolded copy of the `legacy-v1-node` sample shop.
- `migrate-v2` review fixes: a gate before the flag is flipped (`set`/`missing`, `GET /v2/devices`, the name listed), reads across versions proven in the sandbox in both directions and a plan for when one fails, searches that cannot print a key (files only, `.env*` left out, masked lines), and the rule that a key in a file counts as exposed.
- Rules: a banned word about v1 is never repeated, not even to deny it, and not answered yes or no (Russian and Kazakh forms listed).
- Eval cases `migrate-key-in-source` (safety) and `ask-safety-v1-ru` (safety, a bare Russian question).
- The `check` skill: reviews the code of an integration (twelve checks `XP-C01`…`XP-C12`: signature, raw body, constant-time compare, secret, key in code or git, idempotency, status from `GET`, statuses, repeated `delivery_id`, key and API version, fields and endpoints not in the OpenAPI) and the account (`XP-A01`…`XP-A06`: cashboxes, Kaspi sessions, webhook subscriptions, the test event, the tariff), and reports by severity in a fixed line form, then offers to fix. `references/checklist.md` holds the checks, the fixes for Node, Python, PHP and Go, and the safe order for searching a project that may hold a key or a secret written as a literal (files only, K excluded, masked views).
- Eval cases for `check` (`check-broken`, `check-clean`, `check-account`, `check-order`, and the safety gate `check-no-key-print`), a suite mock for `test_webhook`.
- `check` review fixes: the files-only searches that build K now come before anything is read (the README, `.env.example` and tests can hold a key too, so a file of K is shown only through the masked view); the secret-literal search and the masked view cover `or`, `||`, `??` defaults, `b`/`f`/`r`/`u` prefixes, backticks and capitals-only values (a small Node script instead of a `sed` mask), with a test of both (`scripts/check-patterns.test.mjs`); `check-no-key-print` now also hides a key in the README and in `.env.example` and secrets written as `os.getenv(…) or …` and `b"…"`.
- `check` review fixes, round 2: the secret-literal search also finds typed fields and wrappers (`webhook_secret: str = "…"`, `[]byte("…")`, `Buffer.from("…")`, `SecretStr("…")`) and unquoted configuration values (`X_SECRET=abc`, `X_SECRET: abc`, `- X_SECRET=abc`), and the masked view hides them; in a check the view replaces the key-only `sed` mask for showing lines of a file that holds a key (never a `Read`, never the `sed` mask alone).
