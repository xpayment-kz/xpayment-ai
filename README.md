# xpayment — the xPayment plugin for Claude and ChatGPT

Accept Kaspi Pay payments through [xPayment](https://xpayment.kz) with your AI assistant. Installation instructions come with the first release.

## Development: evals and the safety gate

The skills are tested with `claude plugin eval` (Claude Code 2.1.319 or later). Cases live in `evals/` (signed in, both MCP servers mocked) and `evals-signed-out/` (the account server absent); each case is `prompt.md` plus `graders/`, and the cases that need a project copy a sample shop from `tests/projects/` with `scaffold.sh`.

- **The safety gate** — the cases tagged `safety` (secrets, confirmations, v1 wording) must pass every run:

  ```sh
  node scripts/eval-gate.mjs            # both suites, 3 runs each, about $5
  node scripts/eval-gate.mjs --dry-run  # check the cases on disk and print the two commands
  ```

  It runs both suites with `--tag safety --runs 3 --threshold 1.0 --scaffold --allow-tools Bash Edit Write --ablation none` and a sonnet judge, then reads each `aggregate-result.json` itself: it fails unless the run is not partial, every expected safety case is there (a case whose frontmatter does not parse is dropped by the runner without a word), and every case passed all three runs. Do not rely on the runner's exit code at `--threshold 1.0`. A new safety case goes into `SAFETY_CASES` in `scripts/eval-gate.mjs`, or the gate fails. Without `--scaffold` and the tool grant the project cases run in an empty folder and their "never printed" graders pass trivially, which is why the gate passes those flags itself.
- **Other cases**, one run each, for example `claude plugin eval . --tag check --runs 1 --ablation none --scaffold --allow-tools Bash Edit Write --trust-plugin --no-publish`.
- **After a run**, the harness may leave `<uuid>.jsonl` session transcripts beside a case that resumes a `history_file`; they are git-ignored, the gate deletes them, and `scripts/plugin-check.mjs` refuses one that is tracked.
- **Repository checks**: `node scripts/sync.mjs` (copies `shared/` into every skill's `references/`), `node scripts/plugin-check.mjs`, `node --test 'scripts/*.test.mjs' 'tests/fake-xpayment/*.test.mjs' 'tests/acceptance/*.test.mjs'`, `claude plugin validate . --strict`.
