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
