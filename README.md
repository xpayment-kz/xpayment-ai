# xpayment — the xPayment plugin for Claude, Codex and ChatGPT

English · [Русский](README.ru.md)

Accept Kaspi Pay payments through [xPayment](https://xpayment.kz) with your own AI assistant. The plugin takes you from zero to a first real payment: it signs in to your xPayment account, prepares the cashbox, runs a full test cycle in the sandbox, writes the integration code or publishes a payment page, sets up the webhook and switches to live. It is text and configuration only: four skills (instructions for the AI) and the addresses of two MCP servers. It ships no scripts and no hooks.

## Safety

- **You sign in through xPayment.** You sign in on xPayment's own page, «Войти через xPayment». Then a consent page lists the rights the AI asks for, and you allow or deny them.
- **Dangerous actions need your yes in the chat.** Removing a cashbox, revoking a key, deleting a webhook subscription or replacing its secret, archiving or publishing a payment page, a refund on a real payment, and a cashbox beyond your plan are done only after you say yes to that exact action. A general «do everything» does not count.
- **Live keys and webhook secrets never pass through the chat.** The AI gives you a one-time link (valid for an hour); you open it, see the value once and save it yourself, for example in `.env`. If you paste a key into the chat anyway, the AI tells you to replace it.
- **Test first.** The whole cycle runs in the sandbox with test keys (`xapi_test_…`): no money, no Kaspi. The AI cannot create a real payment, and it changes live objects only when you ask for live.
- **You can see and stop it.** What the AI did, and revoking its access, are in the cabinet: «Настройки → Подключённые AI».
- **Your data goes to the AI service you chose.** What the AI reads from your account, including payers' phone numbers and email addresses, is sent to that service (Claude, ChatGPT or Codex).

## Install

The plugin is `xpayment` in this repository. Short steps; every step with the exact labels is in [docs/platforms.md](docs/platforms.md).

- **Claude Code** (2.1.319 or later):

  ```sh
  claude plugin marketplace add xpayment-kz/xpayment-ai
  claude plugin install xpayment@xpayment
  ```

  Then sign in to your account: `/mcp` → `plugin:xpayment:xpayment` → Authenticate.
- **Claude (claude.ai, desktop app, Cowork):** Customize → Plugins → + Add → «Добавить маркетплейс» → «Добавить из репозитория» → type `xpayment-kz/xpayment-ai` → «Синхронизация» → the card «xPayment» → «Добавить». Then connect both connectors in the plugin (Connectors → Connect) and sign in to `xpayment` with «Войти через xPayment».
- **Claude, connector only (no plugin, no skills):** Customize → Connectors → + Add → «Добавить пользовательский коннектор», with `https://api.xpayment.kz/mcp/docs` and `https://api.xpayment.kz/mcp`.
- **Codex CLI** (checked on 0.167.0):

  ```sh
  codex plugin marketplace add xpayment-kz/xpayment-ai
  codex plugin add xpayment@xpayment
  codex mcp login xpayment
  ```

- **ChatGPT on the web (tools only, no skills):** Plugins → Add → Add custom MCP server: name `xPayment`, server URL `https://api.xpayment.kz/mcp`, authentication OAuth; then sign in with «Войти через xPayment».
- **ChatGPT desktop app:** upload the plugin archive [xpayment-0.1.0.zip](https://github.com/xpayment-kz/xpayment-ai/releases/download/v0.1.0/xpayment-0.1.0.zip) from the release (Plugins → Add → Upload plugin archive). The archive is the `plugin/` folder of this repository, with `.claude-plugin/plugin.json` at its top level. chatgpt.com accepted the archive, but it runs only in the desktop app, and it was **not tested there**.

Checked on 2026-11-10; details, what you should see and what to expect on each platform are in [docs/platforms.md](docs/platforms.md).

## First message

When the plugin is installed, write to your assistant:

> Connect xPayment payments

or in Russian: «Подключи приём оплаты через xPayment». The `integrate` skill starts, asks one question at a time and does the work itself.

## Skills

| Skill | What it does |
|---|---|
| `ask` | Answers questions about xPayment from the live documentation and, if you are signed in, from your account. Changes nothing. |
| `integrate` | From sign-in to the first live payment: the scenario, the account and the cashbox, a full cycle in the sandbox, the code or a payment page, the webhook and the switch to live. |
| `migrate-v2` | Moves an integration from API v1 to API v2 (beta) behind a flag, without downtime, and revokes the v1 keys last. |
| `check` | Reviews an integration (code and account) against the current documentation and reports problems by severity, with fixes. |

How to call a skill:

| Platform | Call |
|---|---|
| Claude Code | `/xpayment:ask`, `/xpayment:integrate`, `/xpayment:migrate-v2`, `/xpayment:check` |
| Claude (claude.ai) | `/integrate` (the button «Попробовать в чате» opens a chat with it); a skill also starts when your request matches it |
| Codex | the skills are listed as `xpayment:ask`, `xpayment:check`, `xpayment:integrate`, `xpayment:migrate-v2` |
| ChatGPT | `@xPayment` in a chat (a custom MCP server has tools but no skills) |

## Update

- **Claude Code:** `claude plugin marketplace update xpayment`, then `claude plugin update xpayment@xpayment`, then `/reload-plugins` or a new session. Claude Code keeps a cached copy until the plugin's version changes.
- **Claude (claude.ai):** Customize → Plugins → + Add → Manage marketplaces → `xpayment-ai` → ⋯ → Check for updates. Automatic sync («Синхронизировать автоматически») needs the Claude GitHub app.
- **Codex:** `codex plugin marketplace upgrade xpayment`, then a new session.
- **ChatGPT:** upload the archive of the new release again (the `xpayment-<version>.zip` asset of the [release](https://github.com/xpayment-kz/xpayment-ai/releases)); a custom MCP server needs no update.

The plugin itself tells you when it is older than the documentation requires.

## Support

- xPayment: <https://xpayment.kz>
- Documentation: <https://xpayment.kz/docs>
- For AI assistants: <https://xpayment.kz/llms.txt>
- Changes of this plugin: [CHANGELOG.md](CHANGELOG.md)

## License

MIT, see [LICENSE](LICENSE).

## Development

### Layout

- `plugin/` is the plugin, and the only part of this repository a user installs: `.claude-plugin/plugin.json` (the Claude manifest), `plugin.json` (the portable manifest that Codex and ChatGPT read), `.mcp.json` and `mcp.json` (the same two MCP servers, in each format), `skills/` (each skill with its `references/`), `LICENSE` (a copy of the root one) and a short `README.md`. Nothing else goes there: `scripts/plugin-check.mjs` reports any other file and any symbolic link.
- `.claude-plugin/marketplace.json` is the marketplace of this repository; its one plugin has `"source": "./plugin"`.
- `shared/` holds the sources of the files every skill carries in `plugin/skills/*/references/` (`rules.md`, `safe-search.md` and the documentation snapshot `docs/`). Edit them here, then run `node scripts/sync.mjs`.
- `scripts/`, `tests/` (sample shops, a fake xPayment, acceptance checks), `evals/`, `evals-signed-out/` and `.github/` are development tooling and are never installed.

### Evals and the safety gate

The skills are tested with `claude plugin eval` (Claude Code 2.1.319 or later). Cases live in `evals/` (signed in, both MCP servers mocked) and `evals-signed-out/` (the account server absent); each case is `prompt.md` plus `graders/`, and the cases that need a project copy a sample shop from `tests/projects/` with `scaffold.sh`.

`claude plugin eval` reads cases only from inside the plugin it targets (`--eval-dir` refuses an absolute path or `..`), and the suites stay outside `plugin/` so that they are not installed. So the target is the repository root, and every case names the plugin under test in its `prompt.md` frontmatter: `plugins: ["../../plugin"]`. A new case needs that line too: without it the case runs with no plugin at all, and the gate refuses it.

- **The safety gate**: the cases tagged `safety` (secrets, confirmations, v1 wording) must pass every run:

  ```sh
  node scripts/eval-gate.mjs            # both suites, 3 runs each, about $10 (sonnet answers the agent mocks too)
  node scripts/eval-gate.mjs --dry-run  # check the cases on disk and print the two commands
  ```

  It runs `claude plugin eval <repository root>` on both suites with `--tag safety --runs 3 --threshold 1.0 --scaffold --allow-tools Bash Edit Write --ablation none` and a sonnet judge, then reads each `aggregate-result.json` itself: it fails unless the run is not partial, the run loaded exactly the plugin in `plugin/`, every expected safety case is there (a case whose frontmatter does not parse is dropped by the runner without a word), and every case passed all three runs. Do not rely on the runner's exit code at `--threshold 1.0`. A new safety case goes into `SAFETY_CASES` in `scripts/eval-gate.mjs`, or the gate fails. Without `--scaffold` and the tool grant the project cases run in an empty folder and their "never printed" graders pass trivially, which is why the gate passes those flags itself.
- **Other cases**, one run each, from the repository root, for example `claude plugin eval . --tag check --runs 1 --ablation none --scaffold --allow-tools Bash Edit Write --trust-plugin --no-publish` (add `--eval-dir evals-signed-out` for the signed-out suite).
- **After a run**, the harness may leave `<uuid>.jsonl` session transcripts beside a case that resumes a `history_file`; they are git-ignored, the gate deletes them, and `scripts/plugin-check.mjs` refuses one that is tracked.
- **Repository checks**: `node scripts/sync.mjs` (copies `shared/` into every skill's `references/` and `LICENSE` into `plugin/`), `node scripts/plugin-check.mjs`, `node --test 'scripts/*.test.mjs' 'tests/fake-xpayment/*.test.mjs' 'tests/acceptance/*.test.mjs'`, `claude plugin validate . --strict` (the marketplace) and `claude plugin validate plugin --strict` (the plugin).

### Release archive

The claude.ai plugin upload (in the Russian interface «Загрузить плагин») and the ChatGPT desktop app take an archive with `.claude-plugin/plugin.json` at its top level, which is the `plugin/` folder. Users do not need to build it: each release carries the ready archive (for 0.1.0, <https://github.com/xpayment-kz/xpayment-ai/releases/download/v0.1.0/xpayment-0.1.0.zip>). A maintainer builds it from `plugin/` alone:

```sh
git archive --format=zip -o xpayment-<version>.zip HEAD:plugin
```

The archive is flat (`.claude-plugin/plugin.json`, `plugin.json`, `.mcp.json`, `mcp.json`, `skills/`, `LICENSE`, `README.md` at the top) and holds no scripts, tests or evals. `git archive` packs the committed `HEAD`, not the working tree: commit first, and run `node scripts/plugin-check.mjs` before.
