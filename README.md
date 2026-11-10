# xpayment — the xPayment plugin for Claude and ChatGPT

Accept Kaspi Pay payments through [xPayment](https://xpayment.kz) with your AI assistant. Installation instructions come with the first release.

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

The claude.ai plugin upload (in the Russian interface «Загрузить плагин») takes an archive with `.claude-plugin/plugin.json` at its top level. Build it from `plugin/` alone:

```sh
git archive --format=zip -o xpayment-<version>.zip HEAD:plugin
```

The archive is flat (`.claude-plugin/plugin.json`, `plugin.json`, `.mcp.json`, `mcp.json`, `skills/`, `LICENSE`, `README.md` at the top) and holds no scripts, tests or evals. `git archive` packs the committed `HEAD`, not the working tree: commit first, and run `node scripts/plugin-check.mjs` before.
