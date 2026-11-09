import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ensureNodeDeps } from './verify.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const projects = path.join(repo, 'tests', 'projects');
const verifyScript = path.join(here, 'verify.mjs');

// Key-shaped strings are built at runtime: no key-shaped literal is committed.
const hex = (c) => c.repeat(64);
const V1_KEY = 'xdev_test_' + hex('a');
const V2_KEY = 'xapi_test_' + hex('b');
const HOOK_SECRET = 'webhook-secret-for-the-test';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-test-'));
let counter = 0;

before(() => {
  for (const name of ['shop-node', 'legacy-v1-node']) {
    const error = ensureNodeDeps(path.join(projects, name));
    assert.equal(error, null, error ?? '');
  }
});

after(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

/** A copy of a sample project in a scratch dir, with node_modules linked from the sample. */
function copyProject(name, { env, patch = {} } = {}) {
  const src = path.join(projects, name);
  const dest = path.join(scratch, `${name}-${++counter}`);
  const skip = new Set(['node_modules', '__pycache__', '.pytest_cache', '.venv', 'orders.json']);
  fs.cpSync(src, dest, { recursive: true, filter: (s) => !skip.has(path.basename(s)) });
  if (fs.existsSync(path.join(src, 'node_modules'))) {
    fs.symlinkSync(path.join(src, 'node_modules'), path.join(dest, 'node_modules'), 'dir');
  }
  if (env) fs.writeFileSync(path.join(dest, '.env'), Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  for (const [file, [from, to]] of Object.entries(patch)) {
    const text = fs.readFileSync(path.join(dest, file), 'utf8');
    assert.ok(text.includes(from), `${file} must contain the text to patch: ${from}`);
    fs.writeFileSync(path.join(dest, file), text.replace(from, to));
  }
  return dest;
}

function runVerify(dir, args) {
  const r = spawnSync(process.execPath, [verifyScript, dir, ...args], { encoding: 'utf8', timeout: 120000 });
  const rows = [...r.stdout.matchAll(/^\| (PASS|FAIL) \| (.*?) \| (.*) \|$/gm)].map((m) => ({ ok: m[1] === 'PASS', title: m[2], detail: m[3] }));
  return { status: r.status, out: r.stdout, err: r.stderr, rows };
}

const row = (rows, re) => {
  const found = rows.filter((r) => re.test(r.title));
  assert.equal(found.length, 1, `exactly one row matches ${re}, got ${found.length}`);
  return found[0];
};
const failing = (rows) => rows.filter((r) => !r.ok).map((r) => r.title);

const legacyEnv = () => ({ XPAYMENT_BASE_URL: 'https://api.xpayment.kz', XPAYMENT_DEVICE_KEY: V1_KEY, XPAYMENT_WEBHOOK_SECRET: HOOK_SECRET });

test('untouched shop-node -> payment checks FAIL, contract test PASS, exit 1', () => {
  const dir = copyProject('shop-node');
  const r = runVerify(dir, ['--stack', 'node', '--api', 'v2']);
  assert.equal(r.status, 1, r.out + r.err);
  assert.ok(row(r.rows, /^project starts/).ok);
  assert.ok(row(r.rows, /contract: POST/).ok, 'POST /orders contract');
  assert.ok(row(r.rows, /contract: GET/).ok, 'GET /orders/:id contract');
  for (const re of [/a payment or link is created/, /device_name/, /authorized with/, /X-Idempotency-Key/, /payment_url/, /signed payment\.completed/, /becomes paid/, /does GET/, /same delivery_id/, /wrong signature/, /becomes refunded/, /payment_failed/]) {
    assert.equal(row(r.rows, re).ok, false, `${re} must FAIL for an untouched project`);
  }
  // the static rows are fine: .env is ignored and there are no secrets
  assert.ok(row(r.rows, /key-shaped secrets/).ok);
  assert.ok(row(r.rows, /\.env is in \.gitignore/).ok);
  assert.match(r.out, /\d+ PASS, \d+ FAIL/);
});

test('legacy-v1-node --api v1 -> all PASS, exit 0, and no value of .env is printed', () => {
  const dir = copyProject('legacy-v1-node', { env: legacyEnv() });
  const r = runVerify(dir, ['--stack', 'node', '--api', 'v1']);
  assert.equal(r.status, 0, r.out + r.err);
  assert.deepEqual(failing(r.rows), []);
  assert.equal(r.rows.length, 17);
  assert.ok(!r.rows.some((x) => x.title.includes('device_name')), 'v1 has no device_name row');
  for (const value of [V1_KEY, V1_KEY.slice(-24), HOOK_SECRET]) {
    assert.ok(!(r.out + r.err).includes(value), 'a value of .env was printed');
  }
});

test('legacy-v1-node --api v2 -> the v2 rows FAIL (path, device_name, key prefix, GET), the rest PASS', () => {
  const dir = copyProject('legacy-v1-node', { env: legacyEnv() });
  const r = runVerify(dir, ['--stack', 'node', '--api', 'v2']);
  assert.equal(r.status, 1);
  assert.equal(failing(r.rows).length, 4, failing(r.rows).join(' / '));
  for (const re of [/a payment or link is created at \/v2/, /device_name/, /authorized with an xapi_/, /does GET \/v2/]) {
    assert.equal(row(r.rows, re).ok, false, String(re));
  }
});

test('a v1 project moved to v2 passes --api v2', () => {
  const dir = copyProject('legacy-v1-node', {
    env: { ...legacyEnv(), XPAYMENT_DEVICE_KEY: V2_KEY, XPAYMENT_DEVICE_NAME: 'test' },
  });
  const file = path.join(dir, 'xpayment.js');
  let text = fs.readFileSync(file, 'utf8');
  text = text
    .replace("'/v1/payments/link'", "'/v2/payments/link'")
    .replace('`/v1/payments/${', '`/v2/payments/${')
    .replace('body: { amount, merchant_order_id: merchantOrderId },', 'body: { amount, merchant_order_id: merchantOrderId, device_name: process.env.XPAYMENT_DEVICE_NAME },');
  fs.writeFileSync(file, text);
  const r = runVerify(dir, ['--stack', 'node', '--api', 'v2']);
  assert.equal(r.status, 0, r.out + r.err);
  assert.deepEqual(failing(r.rows), []);
  assert.equal(r.rows.length, 18);
});

test('a project with a live-looking key in a source file -> secret scan FAIL', () => {
  const dir = copyProject('legacy-v1-node', { env: legacyEnv() });
  const key = 'xapi_' + hex('c');
  fs.writeFileSync(path.join(dir, 'payments-config.js'), `module.exports = { apiKey: '${key}' };\n`);
  const r = runVerify(dir, ['--stack', 'node', '--api', 'v1']);
  assert.equal(r.status, 1);
  const secrets = row(r.rows, /key-shaped secrets/);
  assert.equal(secrets.ok, false);
  assert.match(secrets.detail, /payments-config\.js:1 \(xapi_\.\.\.\)/);
  assert.deepEqual(failing(r.rows), [secrets.title]);
  assert.ok(!(r.out + r.err).includes(key.slice(-24)), 'the key was printed');
});

test('a key in .env and the documented fake value are not secrets', () => {
  const dir = copyProject('legacy-v1-node', { env: legacyEnv() });
  fs.writeFileSync(path.join(dir, 'NOTES.md'), `Example: xapi_${'0123456789abcdef'.repeat(4)}\n`);
  const r = runVerify(dir, ['--stack', 'node', '--api', 'v1']);
  assert.ok(row(r.rows, /key-shaped secrets/).ok, r.out);
});

test('.env not in .gitignore -> FAIL', () => {
  const dir = copyProject('legacy-v1-node', { env: legacyEnv() });
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n');
  const r = runVerify(dir, ['--stack', 'node', '--api', 'v1']);
  assert.equal(r.status, 1);
  const g = row(r.rows, /\.env is in \.gitignore/);
  assert.equal(g.ok, false);
  assert.deepEqual(failing(r.rows), [g.title]);
});

test('a handler that does not check the signature -> the wrong-signature row FAILs', () => {
  const dir = copyProject('legacy-v1-node', {
    env: legacyEnv(),
    patch: { 'webhook.js': ["!signatureMatches(secret, rawBody, req.get('X-xPayment-Signature'))", 'false'] },
  });
  const r = runVerify(dir, ['--stack', 'node', '--api', 'v1']);
  assert.equal(r.status, 1);
  assert.deepEqual(failing(r.rows), [row(r.rows, /wrong signature/).title]);
});

test('a handler that does not drop a repeated delivery_id -> the replay row FAILs', () => {
  const dir = copyProject('legacy-v1-node', {
    env: legacyEnv(),
    patch: { 'webhook.js': ["if (seenDeliveries.has(deliveryId)) return res.json({ ok: true, duplicate: true });", ''] },
  });
  const r = runVerify(dir, ['--stack', 'node', '--api', 'v1']);
  assert.equal(r.status, 1);
  assert.deepEqual(failing(r.rows), [row(r.rows, /same delivery_id/).title]);
});

test('a handler that signs a re-serialised body never accepts a real delivery', () => {
  const dir = copyProject('legacy-v1-node', {
    env: legacyEnv(),
    patch: { 'webhook.js': ['signatureMatches(secret, rawBody,', 'signatureMatches(secret, Buffer.from(JSON.stringify(JSON.parse(rawBody.toString()))),'] },
  });
  const r = runVerify(dir, ['--stack', 'node', '--api', 'v1']);
  assert.equal(r.status, 1);
  assert.equal(row(r.rows, /signed payment\.completed/).ok, false);
});

test('a project that does not start is reported, without the values of .env', () => {
  const dir = copyProject('legacy-v1-node', {
    env: { ...legacyEnv(), XPAYMENT_WEBHOOK_SECRET: '' },
  });
  const r = runVerify(dir, ['--stack', 'node', '--api', 'v1']);
  assert.equal(r.status, 1);
  const starts = row(r.rows, /project starts/);
  assert.equal(starts.ok, false);
  assert.match(starts.detail, /exited with code 1/);
  assert.ok(!(r.out + r.err).includes(V1_KEY));
});

test('usage errors and missing tools exit 2', () => {
  const dir = copyProject('shop-node');
  assert.equal(spawnSync(process.execPath, [verifyScript, dir], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [verifyScript, dir, '--stack', 'ruby'], { encoding: 'utf8' }).status, 2);
  const noPython = spawnSync(process.execPath, [verifyScript, dir, '--stack', 'python', '--python', path.join(scratch, 'no-such-python')], { encoding: 'utf8' });
  assert.equal(noPython.status, 2);
  assert.match(noPython.stderr, /cannot import fastapi and uvicorn/);
  assert.match(noPython.stderr, /--python/);
});

// Python and PHP: run when the tools are there (CI installs them, a local venv is tests/.venv).
const python =
  process.env.XPAYMENT_PYTHON ||
  [path.join(repo, 'tests', '.venv', 'bin', 'python'), path.join(repo, 'tests', '.venv', 'Scripts', 'python.exe')].find((p) => fs.existsSync(p));
const pythonReady = Boolean(python) && spawnSync(python, ['-c', 'import fastapi, uvicorn'], { stdio: 'ignore' }).status === 0;
const phpReady = spawnSync('php', ['--version'], { stdio: 'ignore' }).status === 0;

function untouched(name, args) {
  const r = runVerify(copyProject(name), args);
  assert.equal(r.status, 1, r.out + r.err);
  assert.ok(row(r.rows, /^project starts/).ok, r.out);
  assert.ok(row(r.rows, /contract: POST/).ok, r.out);
  assert.ok(row(r.rows, /contract: GET/).ok, r.out);
  assert.equal(row(r.rows, /a payment or link is created/).ok, false);
  assert.ok(row(r.rows, /\.env is in \.gitignore/).ok);
}

test('untouched shop-python -> contract PASS, payment checks FAIL', { skip: !pythonReady && 'no Python with fastapi and uvicorn (set XPAYMENT_PYTHON)' }, () => {
  untouched('shop-python', ['--stack', 'python', '--api', 'v2', '--python', python]);
});

test('untouched shop-php -> contract PASS, payment checks FAIL', { skip: !phpReady && 'php is not installed' }, () => {
  untouched('shop-php', ['--stack', 'php', '--api', 'v2']);
});

test(
  'a relative --python path works although the project runs in its own directory',
  { skip: !(pythonReady && path.isAbsolute(python)) && 'needs an absolute path to a Python with fastapi and uvicorn' },
  () => {
    const r = spawnSync(
      process.execPath,
      [verifyScript, copyProject('shop-python'), '--stack', 'python', '--python', path.relative(process.cwd(), python)],
      { encoding: 'utf8' },
    );
    assert.match(r.stdout, /\| PASS \| project starts/);
    assert.match(r.stdout, /\| PASS \| contract: POST/);
  },
);
