// Tests of the two things in skills/check/references/checklist.md that keep a secret out of the session:
// the files-only regex that finds a secret written as a literal (```secret-literal-regex) and the masked
// view of a file that holds one (```masked-view-script). Both are read out of the checklist, so the text
// the model sees is the text that is tested. Node 22, no dependencies.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checklist = fs.readFileSync(path.join(root, 'skills/check/references/checklist.md'), 'utf8');

function block(tag) {
  const m = checklist.match(new RegExp('```' + tag + '\\n([\\s\\S]*?)\\n[ \\t]*```'));
  assert.ok(m, `the checklist has no \`\`\`${tag} block`);
  const lines = m[1].split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(indent)).join('\n');
}

// The Grep tool searches with -i for this pattern; so does grep -iE.
const secretLiteral = new RegExp(block('secret-literal-regex').trim(), 'i');

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
];

test('secret-literal regex: matches every form of a secret written as a literal', () => {
  for (const line of POSITIVE) assert.ok(secretLiteral.test(line), `should match: ${line.replace(/"[^"]{5,}"/g, '"…"')}`);
});

test('secret-literal regex: does not match reads of the environment, empty defaults or arguments', () => {
  for (const line of NEGATIVE) assert.ok(!secretLiteral.test(line), `should not match: ${line}`);
});

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (['node_modules', '.venv', '__pycache__', '.pytest_cache', '.git', 'vendor'].includes(e.name)) return [];
    if (e.name.startsWith('.env') && e.name !== '.env.example') return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

test('secret-literal regex on the sample projects: broken-python config.py and a test file only', () => {
  const hits = {};
  for (const project of ['broken-python', 'legacy-v1-node', 'shop-node', 'shop-python', 'shop-php']) {
    const dir = path.join(root, 'tests/projects', project);
    const files = new Set();
    for (const file of walk(dir)) {
      if (/\.(pyc|png|lock)$/.test(file) || file.endsWith('package-lock.json')) continue;
      if (fs.readFileSync(file, 'utf8').split('\n').some((l) => secretLiteral.test(l))) files.add(path.relative(dir, file));
    }
    hits[project] = [...files].sort();
  }
  assert.deepEqual(hits, {
    'broken-python': ['config.py'],
    'legacy-v1-node': ['test/shop.test.js'],
    'shop-node': [],
    'shop-python': [],
    'shop-php': [],
  });
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

    // the selector of the checklist prints only the lines that name something
    const some = spawnSync('bash', ['-c', cmd], { encoding: 'utf8' });
    assert.equal(some.status, 0, some.stderr);
    assert.ok(!/zz/i.test(some.stdout));
    assert.ok(!some.stdout.includes('13:'), 'a line that names nothing is not printed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
