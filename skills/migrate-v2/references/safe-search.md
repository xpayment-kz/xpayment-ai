# Searching a project that may hold keys

Used by `check` and `migrate-v2`, and by any skill that searches a person's project. **A search must not be able to print a key or a secret.** A search in content mode prints every line it matches, whole, and reading a file prints all of it. A key or a webhook secret can sit in `.env.production`, `.env.local`, `.env.example`, `docker-compose.yml`, a CI file, a README with a `curl` line, a test or a config module just as it does in `.env`.

Work in this order. The order is the rule.

## 1. Build K before you read anything

**K** is the set of files that hold a key or a secret written as a literal. Build it first, with searches that print only file names. Until K exists, read no file of the project: not the README, not `.env.example`, not a config file, not a test. Listing names (`ls -a`, `git ls-files`, Glob) is fine at any time.

1. **Every `.env*` file is left out** of every search and never opened (`.env.example` gets its own searches in step 4). List them by name and tell the person you did not open them.
2. **The key's shape**, files only: `(xdev_|xapi_)(test_)?[A-Za-z0-9]{8}`.
3. **A secret written as a literal**, files only and case-insensitive: a name with `secret` in it that is assigned a quoted value (with a type annotation or a wrapper such as `: str =`, `[]byte(`, `Buffer.from(`, `SecretStr(`), or a quoted value after `,`, `or`, `||`, `??` or `?:` behind a lookup of the environment (`os.getenv("…", "lit")`, `os.getenv("…") or "lit"`, `process.env.X || 'lit'`, `getenv('…') ?: 'lit'`); a literal may carry a prefix (`b"…"`, `f"…"`, `r"…"`, `u"…"`) or be in backticks. The last alternative is a configuration line with an unquoted value: a name with `secret`, `key`, `token` or `passw` in it, an `=` or `:` with no space before it, and a non-empty value that is not a `$…` reference (`X_SECRET=abc`, `X_SECRET: abc`, `- X_SECRET=abc`, `export API_KEY=abc`). The pattern is plain POSIX, so the Grep tool, `rg` and stock macOS and GNU `grep -E` all read it alike:

   ```secret-literal-regex
   (secret\w*["'`]?(\s*:\s*([[:alnum:]_.<>&*]|\[|\])+)?\s*(=>|:=|=|:)\s*(([^"'`]*["'`][^"'`]*["'`]\)?\s*(,|\s+or\s+|\|\||\?\?|\?:)|[^"'`]*(\s+or\s+|\|\||\?\?|\?:))\s*)?|["'`]\w*secret\w*["'`]\)*\]*\)*\s*(,|\s+or\s+|\|\||\?\?|\?:)\s*|secret\w*\s*(\s+or\s+|\|\||\?\?|\?:)\s*)((\[\]byte|Buffer\.from|SecretStr|SecretString|Secret|bytes|bytearray|str|String|String::from|Some|Encoding\.UTF8\.GetBytes)\(\s*)?[bBfFrRuU]{0,2}["'`][^"'`]{4,}["'`]|^\s*(-\s+|export\s+|ENV\s+|ARG\s+)?[[:alnum:]_.-]*(secret|key|token|passw[[:alnum:]_]*)[[:alnum:]_.-]*(=|:)\s*[^[:space:]"'`$<{(,;#…][^[:space:],;…]*\s*(#.*)?$
   ```

   It matches the forms above and `SECRET = "ABCD1234"` (capitals are not skipped); it does not match `os.environ["XPAYMENT_WEBHOOK_SECRET"]`, an empty default or an empty `X_SECRET=`, `X_SECRET=${X_SECRET}`, a placeholder ending in `…`, or `secret` passed as an argument. It does not find `key = value` written with spaces and no quotes (the same line is a variable in code), and a bare annotation such as `webhook_secret: str` matches too (the file is then in K, which only costs reading comfort). A match in a test file or a fixture is not a finding, but the file still counts as K.
4. **`.env.example` by name.** Run the searches of steps 2 and 3 on it once more: step 1 left it out, and a real-looking key or an unquoted secret in it puts it in K.
5. **Git-ignored files.** The Grep tool, `rg` and many `grep` wrappers skip the files `.gitignore` names, so K says nothing about them: treat every git-ignored file as a file of K (`git status --ignored --short` names them).

The searches with each tool. `<regex>` is the block of step 3, on one line; give it through a quoted heredoc, because it holds both kinds of quotes. Dot-folders such as `.github/` hold CI files: make sure the searches cover them (`rg` needs `--hidden`).

- **Grep tool** (Claude Code): `output_mode: "files_with_matches"`, `glob: "!{.env*,node_modules/**,.git/**}"`, `pattern` the key's shape; then the same with the regex of step 3 and `-i: true`; then both with `path: ".env.example"` and no glob.
- **`rg`** (Codex and most terminals):

  ```sh
  rg -l --hidden -g '!.env*' -g '!.git' -g '!node_modules' -e '(xdev_|xapi_)(test_)?[A-Za-z0-9]{8}' .
  rg -l -i --hidden -g '!.env*' -g '!.git' -g '!node_modules' -f - . <<'RE'
  <regex>
  RE
  rg -l -e '(xdev_|xapi_)(test_)?[A-Za-z0-9]{8}' .env.example
  rg -l -i -f - .env.example <<'RE'
  <regex>
  RE
  ```
- **`grep`**, when there is no `rg`: `grep -rIl -E --exclude='.env*' --exclude-dir=.git --exclude-dir=node_modules -e '(xdev_|xapi_)(test_)?[A-Za-z0-9]{8}' .`, and for step 3 `grep -rIil -E` with the same exclusions and `-f /dev/stdin . <<'RE'`; then `grep -l -E` and `grep -il -E -f /dev/stdin` on `.env.example`.

## 2. Search outside K

6. **Every search in content mode, whatever its pattern** (`/v1`, `fetch`, `refund`, `X-xPayment-Signature`, a function name), **leaves out `.env*` and every file of K.** No pattern is safe on its own: `curl -H "Authorization: Bearer xdev_… " https://…/v1/payments` in a README, a script or a CI file matches `/v1` and prints the key.
   - Grep tool: `glob: "!{.env*,node_modules/**,.git/**,<path of each file of K>}"`.
   - `rg`: `-g '!.env*' -g '!<path of each file of K>'`; a path with a slash (`scripts/refund.js`) is matched from the folder you search.
   - `grep`: `--exclude='.env*' --exclude='<base name of each file of K>'`. `grep` matches only the base name, so `--exclude=scripts/refund.js` leaves that file in; `--exclude=refund.js` takes it out (with any other `refund.js`, which is safe).

   With a shell, also pipe the output through the mask, `| sed -E 's/(xdev_|xapi_)(test_)?[A-Za-z0-9]+/\1***/g'`: both, not either. The mask hides only a key's shape, never a secret: the exclusion is what protects you.
7. **Names are searched files only.** Never search in content mode for `xdev_`, `xapi_`, `Bearer`, `Authorization` or the names of the key and secret variables (`DEVICE_KEY`, `API_KEY`, `WEBHOOK_SECRET`): a files-only search for them tells which files mention them.
8. **Files outside K are read normally**: the handler, the client, the tests that hold no literal, and the README and `.env.example` when they are not in K.

## 3. See inside a file of K only through the view

9. **Never open a file of K whole**: no Read, no `cat`, `head` or `less`, no editor tool, no content-mode search that includes it. A README or `.env.example` in K is no exception: take variable names from its view.
10. **The view** is a small script, because a `sed` mask cannot tell an environment variable's name from a value. It prints the lines that match the selector (the second argument; `.` prints every line), with line numbers, hides the key's shape everywhere and, on a line that names a secret, a key, a token or a password, hides an unquoted value after `=` or `:`, the quoted value after `=`, `:`, `=>`, `,`, `or`, `||`, `??`, `?:` (behind a wrapper such as `[]byte(` too) and then every other quoted literal that is not an UPPER_SNAKE name:

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

   The result keeps the shape (`WEBHOOK_SECRET = os.getenv("XPAYMENT_WEBHOOK_SECRET") or "***"`: a fallback exists), an empty default or an empty `X_SECRET=` stays visible, the line number is there, the value is not. Without Node, do the same in the project's language, or follow step 11.
11. **Without a shell, or without Node,** you do not see the lines. The files-only searches are your evidence: «config.py holds a key» (step 2), «config.py has a secret written as a literal» (step 3); a files-only search for `/v1` that does not leave out K tells which files of K also call `/v1`. Report «holds a key / a secret, lines not shown». Never Read the file to see the lines, and never use the `sed` mask alone on a file of K: it does not hide a secret.

## 4. Report and change a file of K

12. **Report** each file of K (and the line number from the view) **without the value**. A key or a secret in a file is probably in git, for everyone with access: count it as exposed, like a pasted one («Secrets» of the rules). The way out: a new one through a one-time link, the code reading it from the environment, and the exposed one revoked last, only after a yes.
13. **Change a file of K only with a shell command** whose pattern matches the literal without writing it, for example `sed -i.bak -E 's/(getenv\("XPAYMENT_API_KEY"), *"[^"]*"\)/\1)/' config.py` (then remove the `.bak`), or a small script that prints nothing; then look at the result through the view. Never Read, Edit or Write a file of K: the Edit and Write tools need the file read first, and the Read prints the key. Once the literal is gone (the searches of steps 2 and 3 on that file find nothing), the file is no longer in K and is read and changed normally. Without a shell, don't change it: tell the person which line to change and how.
14. **Tracked in git?** `git ls-files -- FILE` prints only a name: a key in a tracked file is in git; `git ls-files '.env*'` lists the tracked env files (names only). `.gitignore` is safe to read.
