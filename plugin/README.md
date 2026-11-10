# xPayment plugin

Accept Kaspi Pay payments through [xPayment](https://xpayment.kz) with your AI assistant (Claude, Claude Code, Codex, ChatGPT). The plugin is text and configuration only: four skills (instructions for the AI) and the addresses of two MCP servers. It ships no scripts and no hooks.

## Skills

- **ask** — answers questions about xPayment from the live documentation and, when you are signed in, from your account. It changes nothing.
- **integrate** — takes you from sign-in to the first live payment: the scenario, the account and the cashbox, a full cycle in the sandbox, the code or a payment page, the webhook and the switch to live.
- **migrate-v2** — moves an integration from API v1 to API v2 (beta) behind a flag, without downtime, and revokes the old keys last.
- **check** — reviews an integration (code and account) against the current documentation and reports problems by severity, with fixes.

## MCP servers

- `xpayment-docs` — `https://api.xpayment.kz/mcp/docs`, the public documentation (no sign-in).
- `xpayment` — `https://api.xpayment.kz/mcp`, your xPayment account (sign in with OAuth).

## Install

Installation steps for each platform and the safety notes are in the repository: https://github.com/xpayment-kz/xpayment-ai

## License

MIT, see [LICENSE](LICENSE).
