# Changelog

All notable changes to this plugin are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

First version of the plugin.

### Added

- The plugin `xpayment` for Claude Code, Claude (claude.ai, desktop app, Cowork), Codex and ChatGPT. It is text and configuration only: four skills and the addresses of two MCP servers; it ships no scripts and no hooks. It comes with a Claude manifest, a portable manifest that Codex and ChatGPT read, and the marketplace file of this repository.
- Two remote MCP servers: `xpayment-docs` (`https://api.xpayment.kz/mcp/docs`, the public documentation, no sign-in) and `xpayment` (`https://api.xpayment.kz/mcp`, your xPayment account, sign-in with «Войти через xPayment»).
- The skill `ask`: answers questions from the live documentation and, when you are signed in, from your account. It changes nothing and points to the skill that does the work.
- The skill `integrate`: from sign-in to the first live payment in ten steps: the scenario, the API version, readiness of the account, a full cycle in the sandbox, the code (client and webhook handler for Node, Python and PHP) or a payment page, the live webhook, the live key and a summary.
- The skill `migrate-v2`: moves an integration from API v1 to API v2 (beta) in eight steps behind a flag, with a sandbox run first, a one-step rollback and the v1 keys revoked last, one by one, each after your yes.
- The skill `check`: reviews the code of an integration (twelve checks, `XP-C01`…`XP-C12`) and the account (six checks, `XP-A01`…`XP-A06`) against the current documentation and reports problems by severity, with fixes for Node, Python, PHP and Go; it then offers to fix.
- Rules that every skill follows: the start check (passport, plugin version, documentation, sign-in), one question at a time, environments (sandbox first, no default), an explicit yes before dangerous actions, live keys and webhook secrets only through a one-time link, never reading or printing `.env` or a key, error codes, API v2 as beta and v1 as stable, and the topics left out of scope.
- A snapshot of the public documentation (2026-11-09), used when xpayment.kz cannot be reached.
- Install documentation: `README.md`, `README.ru.md` and `docs/platforms.md`, with the steps for Claude Code, Claude (claude.ai), Codex and ChatGPT as checked on 2026-11-10 (Claude Code 2.1.319, Codex 0.167.0, claude.ai and chatgpt.com). The ChatGPT plugin archive was accepted on chatgpt.com but was not tested in the ChatGPT desktop app.
- The plugin ships from the `plugin/` folder (both manifests, both MCP configurations, `skills/`, a copy of `LICENSE` and a short `README.md`), and the marketplace `source` is `"./plugin"`: installing it copies nothing from `scripts/`, `tests/`, `evals/` or `shared/`. On claude.ai the plugin page no longer lists «Может выполнять код без запроса разрешения».
- Repository tooling, not installed: consistency checks (`scripts/plugin-check.mjs`), the copy of shared references and the version bump (`scripts/sync.mjs`), eval cases for every skill with a safety gate (`scripts/eval-gate.mjs`), and CI.
