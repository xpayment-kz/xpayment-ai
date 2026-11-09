// Tests of the two things in skills/check/references/checklist.md that keep a secret out of the session:
// the files-only regex that finds a secret written as a literal (```secret-literal-regex) and the masked
// view of a file that holds one (```masked-view-script). Both are read out of the checklist, so the text
// the model sees is the text that is tested. The regex is run by the system `grep -E` (POSIX ERE: the
// strictest reader of the three that matter, stock macOS grep, GNU grep and the Grep tool's ripgrep), not by
// JavaScript; those tests are skipped where /usr/bin/grep does not exist. Node 22, no dependencies.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checklist = fs.readFileSync(path.join(root, 'skills/check/references/checklist.md'), 'utf8');
const GREP = '/usr/bin/grep';
const noGrep = !fs.existsSync(GREP) && `no ${GREP}`;

function block(tag) {
  const m = checklist.match(new RegExp('```' + tag + '\\n([\\s\\S]*?)\\n[ \\t]*```'));
  assert.ok(m, `the checklist has no ${tag} block`);
  const lines = m[1].split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(indent)).join('\n');
}

// The Grep tool searches with -i for this pattern; so does grep -iE.
const SECRET_LITERAL = block('secret-literal-regex').trim();

function grep(args, input) {
  const r = spawnSync(GREP, args, { encoding: 'utf8', input });
  assert.ok(r.status === 0 || r.status === 1, `grep failed (${r.status}): ${r.stderr}`);
  return r.stdout;
}

// The 1-based numbers of the lines that the regex matches.
function matchingLines(lines) {
  const out = grep(['-n', '-i', '-E', '-e', SECRET_LITERAL], lines.join('\n') + '\n');
  return new Set(out.split('\n').filter(Boolean).map((l) => Number(l.slice(0, l.indexOf(':')))));
}

const POSITIVE = [
  'WEBHOOK_SECRET = os.getenv("XPAYMENT_WEBHOOK_SECRET", "zzlit-value")',
  'WEBHOOK_SECRET = os.getenv("XPAYMENT_WEBHOOK_SECRET") or "zzlit-value"',
  "WEBHOOK_SECRET = os.environ.get('XPAYMENT_WEBHOOK_SECRET') or 'zzlit-value'",
  'secret = os.getenv("WH", b"zzlit-bytes")',
  'secret = os.getenv("WH", f"zzlit-fstring")',
  'secret = os.getenv("WH", rb"zzlit-raw")',
  'SECRET = b"zzlit-bytes"',
  "const S = process.env.WEBHOOK_SECRET || 'zzlit12345'",
  'const S = process.env.WEBHOOK_SECRET || `zzlit12345`',
  'const S = process.env["XPAYMENT_WEBHOOK_SECRET"] ?? "zzlit12345"',
  "$secret = getenv('XPAYMENT_WEBHOOK_SECRET') ?: 'zzlit-hello';",
  "'secret' => 'zzlit-array',",
  '  secret: "zzlit-object",',
  'secretKey := "zzlit-go"',
  'if secret == "" { secret = "zzlit-go" }',
  'WEBHOOK_SECRET = "ABCD1234EFGH"',
  'WEBHOOK_SECRET = os.getenv("XPAYMENT_WEBHOOK_SECRET", "ABCD1234")',
  'webhook_secret = config.get("secret") or "ABCD1234"',
  'S = os.getenv("XPAYMENT_WEBHOOK_SECRET", "zzlit-value")',
  // typed fields and wrappers (an annotation or a constructor between the name and the literal)
  'webhook_secret: str = "zzlit-value"',
  'const secret: string = "zzlit-value"',
  'let secret: &str = "zzlit-value";',
  'val webhookSecret: String = "zzlit-value"',
  'webhookSecret := []byte("zzlit-value")',
  'const secret = Buffer.from("zzlit-value")',
  'secret = SecretStr("zzlit-value")',
  'var secret = Encoding.UTF8.GetBytes("zzlit-value");',
  'secret: Optional[str] = os.getenv("WH") or "zzlit-value"',
  'S = foo(os.environ["XPAYMENT_WEBHOOK_SECRET"]) or "zzlit-value"',
  // configuration lines with an unquoted value
  'XPAYMENT_WEBHOOK_SECRET=zzunq123',
  'XPAYMENT_WEBHOOK_SECRET: zzunq123',
  '      - X_SECRET=zzunq123',
  'export API_KEY=zzunq123',
  'ENV X_TOKEN=zzunq123',
  'webhook_secret: zzunq123  # from the vault',
  'XPAYMENT_API_KEY=xapi_zzunq1234',
  'MY_TOKEN=zzabc#notcomment',
];

const NEGATIVE = [
  'secret = os.environ["XPAYMENT_WEBHOOK_SECRET"]',
  'WEBHOOK_SECRET = os.getenv("XPAYMENT_WEBHOOK_SECRET", "")',
  'WEBHOOK_SECRET = os.getenv("XPAYMENT_WEBHOOK_SECRET") or ""',
  "webhookSecret: env.XPAYMENT_WEBHOOK_SECRET || '',",
  "signatureMatches(secret, rawBody, req.get('X-xPayment-Signature'))",
  'const secret = process.env.XPAYMENT_WEBHOOK_SECRET;',
  "$secret = getenv('XPAYMENT_WEBHOOK_SECRET');",
  'secret = os.getenv("XPAYMENT_WEBHOOK_SECRET")',
  'if not secret: raise HTTPException(status_code=500, detail="webhook secret not configured")',
  'digest = hmac.new(config.WEBHOOK_SECRET.encode(), payload, hashlib.sha256).hexdigest()',
  'API_KEY = os.getenv("XPAYMENT_API_KEY")',
  'secret = SecretStr(os.getenv("XPAYMENT_WEBHOOK_SECRET"))',
  'secret = str(os.getenv("XPAYMENT_WEBHOOK_SECRET"))',
  'val webhookSecret: String = System.getenv("XPAYMENT_WEBHOOK_SECRET")',
  // configuration lines with nothing to hide
  'X_SECRET=',
  'X_SECRET=${X_SECRET}',
  '      - XPAYMENT_WEBHOOK_SECRET',
  'XPAYMENT_API_KEY=xapi_…',
  'XPAYMENT_DEVICE_KEY=xdev_…',
  'XPAYMENT_WEBHOOK_SECRET=<your secret>',
  // code that only looks alike
  'webhook_secret = settings.webhook_secret',
  'secret=secret,',
  'secret: config.secret,',
];

// POSIX ERE has no escapes inside a bracket expression: a backslash there is a backslash, and an unescaped
// ] ends the bracket. This scanner fails on the constructs that made the round-2 regex match nothing on stock
// macOS grep: [\\])] , [\\w.-] , [^\\s ...].
function bracketProblems(re) {
  const problems = [];
  for (let i = 0; i < re.length; i++) {
    if (re[i] === '\\') { i++; continue; }
    if (re[i] !== '[') continue;
    let j = i + 1;
    if (re[j] === '^') j++;
    for (; j < re.length; j++) {
      if (re.startsWith('[:', j)) { j = re.indexOf(':]', j) + 1; continue; }
      if (re[j] === ']') break;
      if (re[j] === '\\') problems.push(`a backslash inside a bracket: ${re.slice(i, j + 2)}`);
      if (re[j] === '[') problems.push(`a [ inside a bracket: ${re.slice(i, j + 2)}`);
    }
    i = j;
  }
  return problems;
}

test('secret-literal regex: no backslash and no [ inside a bracket expression (POSIX ERE)', () => {
  assert.deepEqual(bracketProblems(SECRET_LITERAL), []);
  // plugin-check reads "](target)" as a markdown link, even inside a code block
  assert.ok(!SECRET_LITERAL.includes(']('), 'the regex must not contain "]("');
});

test('secret-literal regex: matches every form of a secret written as a literal', { skip: noGrep }, () => {
  const hit = matchingLines(POSITIVE);
  assert.deepEqual(POSITIVE.filter((_, i) => !hit.has(i + 1)), [], 'these lines should match');
});

test('secret-literal regex: does not match reads of the environment, empty values or arguments', { skip: noGrep }, () => {
  const hit = matchingLines(NEGATIVE);
  assert.deepEqual(NEGATIVE.filter((_, i) => hit.has(i + 1)), [], 'these lines should not match');
});

test('secret-literal regex on the sample projects: broken-python config.py and a test file only', { skip: noGrep }, () => {
  const hits = {};
  for (const project of ['broken-python', 'legacy-v1-node', 'shop-node', 'shop-python', 'shop-php']) {
    const dir = path.join(root, 'tests/projects', project);
    const out = grep([
      '-r', '-I', '-i', '-l', '-E', '-e', SECRET_LITERAL,
      '--exclude-dir=node_modules', '--exclude-dir=.venv', '--exclude-dir=__pycache__', '--exclude-dir=.pytest_cache',
      '--exclude-dir=vendor', '--exclude-dir=.git', '--exclude=.env', '--exclude=package-lock.json',
      dir,
    ]);
    hits[project] = out.split('\n').filter(Boolean).map((f) => path.relative(dir, f)).sort();
  }
  assert.deepEqual(hits, {
    'broken-python': ['config.py'],
    'legacy-v1-node': ['test/shop.test.js'],
    'shop-node': [],
    'shop-python': [],
    'shop-php': [],
  });
});

test('secret-literal regex: grep -rIil -E finds a typed field, an assignment, a default and an unquoted value', { skip: noGrep }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpayment-grep-'));
  try {
    fs.writeFileSync(path.join(dir, 'a.py'), 'webhook_secret: str = "zzlit-value"\n');
    fs.writeFileSync(path.join(dir, 'e.py'), 'secret = "zzabc12345"\n');
    fs.writeFileSync(path.join(dir, 'c.py'), 'import os\nX = os.getenv("X_SECRET", "zzlit-value")\n');
    fs.writeFileSync(path.join(dir, 'b.env.example'), 'XPAYMENT_WEBHOOK_SECRET=zzabc123\n');
    fs.writeFileSync(path.join(dir, 'clean.py'), 'import os\nsecret = os.environ["XPAYMENT_WEBHOOK_SECRET"]\n');
    const out = grep(['-r', '-I', '-i', '-l', '-E', '-e', SECRET_LITERAL, dir]);
    assert.deepEqual(out.split('\n').filter(Boolean).map((f) => path.basename(f)).sort(), ['a.py', 'b.env.example', 'c.py', 'e.py']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const SAMPLE = [
  'WEBHOOK_SECRET = os.getenv("XPAYMENT_WEBHOOK_SECRET") or "zzor-literal-1234"', // 1
  'WEBHOOK_SECRET = os.getenv("XPAYMENT_WEBHOOK_SECRET", b"zzbytes-literal-1")', // 2
  'API_KEY = os.getenv("XPAYMENT_API_KEY", "xapi_zzabcdef12345678")', // 3
  'const S = process.env.WEBHOOK_SECRET || `zzjs-backtick-12`;', // 4
  "const T = process.env[\"XPAYMENT_WEBHOOK_SECRET\"] ?? 'zzjs-nullish-12';", // 5
  'SECRET = "ZZALLCAPS1234"', // 6
  'DEVICE_KEY = os.getenv("XPAYMENT_DEVICE_KEY", "")', // 7
  'BASE_URL = os.getenv("XPAYMENT_BASE_URL", "https://api.xpayment.kz").rstrip("/") + "/v2"', // 8
  'secret = os.environ["XPAYMENT_WEBHOOK_SECRET"]', // 9
  'curl -H "Authorization: Bearer xdev_zzcurl3b7d1f5a9c3e7b" https://api.xpayment.kz/v1/payments', // 10
  "'secret' => 'zzphp-array-12',", // 11
  'signature = hmac.new(b"zz-key-arg-1234", payload)  # the key', // 12
  'x = 1', // 13
  'webhook_secret: str = "zzlit-typed"', // 14
  'webhookSecret := []byte("ZZALLCAPS99")', // 15
  'XPAYMENT_WEBHOOK_SECRET=zzunq123', // 16
  '      - X_SECRET=zzunq456', // 17
  'XPAYMENT_WEBHOOK_SECRET: zzunq789', // 18
  'X_SECRET=', // 19
  'X_SECRET=${X_SECRET}', // 20
  'MY_TOKEN=zzabc#notcomment', // 21
  'MY_TOKEN=zzabc  # a comment', // 22
];

test('masked view: no value reaches the output, names and empty defaults stay', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpayment-view-'));
  try {
    const file = path.join(dir, 'sample.txt');
    fs.writeFileSync(file, SAMPLE.join('\n') + '\n');
    const cmd = block('masked-view-script').replace(/^node /, `"${process.execPath}" `).replace(' FILE ', ` "${file}" `);
    // the selector '.' prints every line
    const all = spawnSync('bash', ['-c', cmd.replace("'KEY|SECRET|TOKEN|URL|DEVICE'", "'.'")], { encoding: 'utf8' });
    assert.equal(all.status, 0, all.stderr);
    assert.ok(!/zz/i.test(all.stdout), `a value is in the output:\n${all.stdout}`);
    const lines = all.stdout.trimEnd().split('\n');
    assert.equal(lines.length, SAMPLE.length, 'every line is printed with its number');
    assert.equal(lines[0], '1:WEBHOOK_SECRET = os.getenv("XPAYMENT_WEBHOOK_SECRET") or "***"');
    assert.equal(lines[1], '2:WEBHOOK_SECRET = os.getenv("XPAYMENT_WEBHOOK_SECRET", b"***")');
    assert.equal(lines[3], '4:const S = process.env.WEBHOOK_SECRET || `***`;');
    assert.equal(lines[4], "5:const T = process.env[\"XPAYMENT_WEBHOOK_SECRET\"] ?? '***';");
    assert.equal(lines[5], '6:SECRET = "***"');
    assert.equal(lines[6], '7:DEVICE_KEY = os.getenv("XPAYMENT_DEVICE_KEY", "")');
    assert.equal(lines[7], `8:${SAMPLE[7]}`);
    assert.equal(lines[8], `9:${SAMPLE[8]}`);
    assert.ok(lines[9].startsWith('10:curl -H "Authorization: Bearer xdev_***"'), lines[9]);
    assert.equal(lines[13], '14:webhook_secret: str = "***"');
    assert.equal(lines[14], '15:webhookSecret := []byte("***")');
    assert.equal(lines[15], '16:XPAYMENT_WEBHOOK_SECRET=***');
    assert.equal(lines[16], '17:      - X_SECRET=***');
    assert.equal(lines[17], '18:XPAYMENT_WEBHOOK_SECRET: ***');
    assert.equal(lines[18], '19:X_SECRET=');
    assert.equal(lines[19], '20:X_SECRET=${X_SECRET}');
    assert.equal(lines[20], '21:MY_TOKEN=***'); // a # with no space before it is part of the value
    assert.equal(lines[21], '22:MY_TOKEN=***  # a comment');

    // the selector of the checklist prints only the lines that name something
    const some = spawnSync('bash', ['-c', cmd], { encoding: 'utf8' });
    assert.equal(some.status, 0, some.stderr);
    assert.ok(!/zz/i.test(some.stdout));
    assert.ok(!some.stdout.includes('13:'), 'a line that names nothing is not printed');
    assert.ok(some.stdout.includes('16:XPAYMENT_WEBHOOK_SECRET=***'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
