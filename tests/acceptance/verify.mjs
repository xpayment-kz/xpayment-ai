#!/usr/bin/env node
// verify: grades an xPayment integration that an AI produced in a sample shop project.
//
//   node tests/acceptance/verify.mjs <project-dir> --stack node|python|php [--api v1|v2] [--python <path>]
//
// It reads the project's .env only to get XPAYMENT_WEBHOOK_SECRET for signing (this is our script,
// not the AI; the values are never printed). It starts the fake xPayment on a free port and the
// project with the start command of its stack:
//   node    node server.js
//   python  <python> -m uvicorn main:app --host 127.0.0.1 --port $PORT
//   php     php -S 127.0.0.1:$PORT -t public public/index.php
// The project gets the inherited environment WITHOUT any XPAYMENT_* variable, plus PORT and
// XPAYMENT_BASE_URL (the fake). Nothing from .env is injected: a project that never loads its own
// .env runs with empty settings and fails. (Loaders that do not override an existing variable, like
// Node's process.loadEnvFile or python-dotenv, still let the fake URL win.) Then it creates orders,
// reads what the project sent to the fake (GET /__requests), "pays" the payments and delivers
// signed webhooks (HMAC-SHA256 of the raw body with XPAYMENT_WEBHOOK_SECRET, lowercase hex, header
// X-xPayment-Signature, no "sha256=" prefix), and prints a table of PASS/FAIL rows.
//
// Exit code: 0 all rows PASS, 1 some row FAIL, 2 the script could not run (usage, missing tools).
//
// Node projects: `npm ci` runs in the project when node_modules is missing. Python projects: the
// interpreter given by --python (default python3) must already have the requirements of the project
// (fastapi, uvicorn, ...) installed. PHP needs nothing. Node 22, no dependencies.

import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startFake } from '../fake-xpayment/server.mjs';

const SECRET_RE = /(xapi|xdev)_(test_)?[0-9a-f]{64}/g;
const FAKE_HEX = '0123456789abcdef'.repeat(4);
const SCAN_SKIP_DIRS = new Set(['node_modules', '.venv', 'vendor', '.git', '__pycache__', '.pytest_cache']);
const FALLBACK_SECRET = 'verify-fallback-secret';
const JSON_HEADERS = { 'content-type': 'application/json' };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(fn, timeout = 3000, step = 50) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value || Date.now() >= end) return value;
    await sleep(step);
  }
}

// ---------- .env, secrets, .gitignore ----------

/** KEY=VALUE lines of a .env file. Quotes are removed; comments and blank lines are skipped. */
export function parseEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.lastIndexOf(quote) > 0) {
      value = value.slice(1, value.lastIndexOf(quote));
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    out[m[1]] = value;
  }
  return out;
}

function readEnvFile(dir) {
  try {
    return parseEnv(fs.readFileSync(path.join(dir, '.env'), 'utf8'));
  } catch {
    return {};
  }
}

function walkFiles(dir, rel = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SCAN_SKIP_DIRS.has(entry.name)) out.push(...walkFiles(dir, entryRel));
    } else if (entry.isFile() && entry.name !== '.env') {
      out.push(entryRel);
    }
  }
  return out.sort();
}

/** Key-shaped strings in the project files (not .env, node_modules, .venv, vendor). Values are never returned. */
export function scanSecrets(dir) {
  const hits = [];
  for (const rel of walkFiles(dir)) {
    const file = path.join(dir, rel);
    let buf;
    try {
      if (fs.statSync(file).size > 2 * 1024 * 1024) continue;
      buf = fs.readFileSync(file);
    } catch {
      continue;
    }
    if (buf.subarray(0, 8192).includes(0)) continue;
    const text = buf.toString('utf8');
    for (const m of text.matchAll(SECRET_RE)) {
      if (m[0].slice(-64) === FAKE_HEX) continue;
      hits.push({ file: rel, line: text.slice(0, m.index).split('\n').length, prefix: `${m[1]}_${m[2] ?? ''}` });
    }
  }
  return hits;
}

/** Does the .gitignore of the project ignore a file named .env? Asked of git itself, in a scratch repository. */
export function envIsIgnored(dir) {
  let text;
  try {
    text = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
  } catch {
    return false;
  }
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-gitignore-'));
  try {
    fs.writeFileSync(path.join(scratch, '.gitignore'), text);
    if (spawnSync('git', ['init', '-q'], { cwd: scratch }).status !== 0) return /^\/?\.env\s*$/m.test(text);
    return spawnSync('git', ['check-ignore', '-q', '--no-index', '.env'], { cwd: scratch }).status === 0;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/** Is a file named .env tracked by the git repository the project is in? */
function envIsTracked(dir) {
  return spawnSync('git', ['-C', dir, 'ls-files', '--error-unmatch', '.env'], { stdio: 'ignore' }).status === 0;
}

// ---------- environment of the stacks ----------

export function ensureNodeDeps(dir) {
  if (!fs.existsSync(path.join(dir, 'package.json')) || fs.existsSync(path.join(dir, 'node_modules'))) return null;
  const cmd = fs.existsSync(path.join(dir, 'package-lock.json')) ? 'ci' : 'install';
  const r = spawnSync('npm', [cmd, '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir, encoding: 'utf8' });
  return r.status === 0 ? null : `npm ${cmd} failed: ${(r.stderr || r.stdout || r.error?.message || '').trim().split('\n').slice(-5).join(' | ')}`;
}

/** Returns an error message when the tools of the stack are missing, else null. */
function checkTools(stack, python) {
  if (stack === 'python') {
    const r = spawnSync(python, ['-c', 'import fastapi, uvicorn'], { encoding: 'utf8' });
    if (r.error || r.status !== 0) {
      return (
        `the Python interpreter "${python}" cannot import fastapi and uvicorn (${r.error ? r.error.message : (r.stderr || '').trim().split('\n').pop()}).\n` +
        'Install the requirements of the project in a virtual environment and pass it with --python, for example:\n' +
        '  python3 -m venv tests/.venv && tests/.venv/bin/pip install -r <project>/requirements.txt\n' +
        '  node tests/acceptance/verify.mjs <project> --stack python --python tests/.venv/bin/python'
      );
    }
  }
  if (stack === 'php') {
    const r = spawnSync('php', ['--version'], { encoding: 'utf8' });
    if (r.error || r.status !== 0) return 'php is not installed or not on PATH';
  }
  return null;
}

function startCommand(stack, python, port) {
  if (stack === 'node') return { cmd: process.execPath, args: ['server.js'] };
  if (stack === 'python') return { cmd: python, args: ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(port)] };
  return { cmd: 'php', args: ['-S', `127.0.0.1:${port}`, '-t', 'public', 'public/index.php'] };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function stopProcess(child) {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
  await exited;
  clearTimeout(timer);
}

// ---------- the table ----------

function tableFor(api) {
  const v = `/${api}`;
  return [
    ['starts', 'project starts and listens on PORT'],
    ['contract-post', 'contract: POST /orders -> {id, status: "new"}'],
    ['contract-get', 'contract: GET /orders/:id -> {id, status}'],
    ['env-secret', '.env defines XPAYMENT_WEBHOOK_SECRET'],
    ['create', `a payment or link is created at ${v}/payments[/link]`],
    ...(api === 'v2' ? [['device-name', 'the create request has device_name']] : []),
    ['key-prefix', `the create request is authorized with an ${api === 'v2' ? 'xapi_' : 'xdev_'} key`],
    ['idempotency', 'the create request has X-Idempotency-Key'],
    ['payment-url', 'the order has a payment_url'],
    ['webhook-ok', 'signed payment.completed -> 2xx'],
    ['order-paid', 'the order becomes paid'],
    ['get-payment', `the project does GET ${v}/payments/{id} after the webhook`],
    ['replay', 'the same delivery_id again -> 2xx, not processed twice'],
    ['bad-signature', 'a wrong signature -> 401, the order is untouched'],
    ['refunded', 'payment.refunded -> the order becomes refunded'],
    ['failed', 'payment.expired / cancelled / failed -> the order becomes payment_failed'],
    ['secrets', 'no key-shaped secrets in the project files'],
    ['gitignore', '.env is in .gitignore'],
  ];
}

// ---------- the run ----------

async function http(url, { method = 'GET', headers, body, timeout = 8000 } = {}) {
  try {
    const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeout) });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // not JSON
    }
    return { status: res.status, text, json };
  } catch (err) {
    return { status: 0, text: '', json: null, error: err.cause?.code ?? err.message };
  }
}

const ok2xx = (status) => status >= 200 && status < 300;

/**
 * Runs the checks. Returns { rows: [{ id, title, ok, detail }] }.
 * Throws an Error with a message for problems that are not a project's fault (missing tools).
 */
export async function verify({ dir, stack, api = 'v2', python = 'python3' }) {
  dir = path.resolve(dir);
  // The project runs with its own directory as cwd, so a relative interpreter path is made absolute.
  if (python.includes('/') || python.includes(path.sep)) python = path.resolve(python);
  if (!fs.existsSync(dir)) throw new Error(`${dir} does not exist`);
  const toolsError = checkTools(stack, python);
  if (toolsError) throw new Error(toolsError);

  const table = tableFor(api);
  const results = new Map();
  const add = (id, ok, detail = '') => {
    if (!results.has(id)) results.set(id, { ok: Boolean(ok), detail });
  };

  const dotenv = readEnvFile(dir);
  const sensitive = Object.values(dotenv).filter((v) => v.length >= 8);
  const redact = (text) => sensitive.reduce((acc, v) => acc.split(v).join('***'), text);

  // Static rows first, they do not depend on the run.
  const hits = scanSecrets(dir);
  add(
    'secrets',
    hits.length === 0,
    hits.length === 0
      ? 'none found'
      : hits.slice(0, 5).map((h) => `${h.file}:${h.line} (${h.prefix}...)`).join(', ') + (hits.length > 5 ? `, +${hits.length - 5} more` : ''),
  );
  const ignored = envIsIgnored(dir);
  const tracked = envIsTracked(dir);
  add('gitignore', ignored && !tracked, tracked ? '.env is tracked by git' : ignored ? 'ignored' : '.gitignore does not ignore .env');
  const webhookSecret = dotenv.XPAYMENT_WEBHOOK_SECRET;
  add('env-secret', Boolean(webhookSecret), webhookSecret ? 'set (value not shown)' : fs.existsSync(path.join(dir, '.env')) ? 'missing or empty in .env' : 'there is no .env');
  const signingSecret = webhookSecret || FALLBACK_SECRET;

  if (stack === 'node') {
    const depsError = ensureNodeDeps(dir);
    if (depsError) {
      add('starts', false, depsError);
      return finish(table, results);
    }
  }

  const fake = await startFake({ port: 0 });
  const port = await freePort();
  const project = `http://127.0.0.1:${port}`;
  const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('XPAYMENT_')));
  const env = { ...baseEnv, PORT: String(port), XPAYMENT_BASE_URL: fake.url, PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1' };
  const { cmd, args } = startCommand(stack, python, port);
  const child = spawn(cmd, args, { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  const collect = (chunk) => {
    output = (output + chunk.toString('utf8')).slice(-4000);
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  child.on('error', (err) => collect(String(err.message)));

  try {
    const up = await waitFor(async () => (child.exitCode !== null || child.pid === undefined ? 'exited' : (await canConnect(port)) ? 'up' : null), 20000, 100);
    if (up !== 'up') {
      const tail = redact(output).trim().split('\n').slice(-4).join(' | ');
      const what = child.pid === undefined ? 'could not be started' : up === 'exited' ? `exited with code ${child.exitCode ?? child.signalCode}` : 'did not answer on PORT in 20 s';
      add('starts', false, `${what}${tail ? `: ${tail}` : ''}`);
      return finish(table, results);
    }
    add('starts', true, `${[path.basename(cmd), ...args].join(' ')}`);
    await runFlow({ project, fake, api, add, signingSecret });
  } finally {
    await stopProcess(child);
    await fake.close();
  }
  return finish(table, results);
}

function finish(table, results) {
  return {
    rows: table.map(([id, title]) => {
      const r = results.get(id) ?? { ok: false, detail: 'not run' };
      return { id, title, ok: r.ok, detail: r.detail };
    }),
  };
}

async function runFlow({ project, fake, api, add, signingSecret }) {
  const reqs = async () => (await http(`${fake.url}/__requests`)).json ?? [];
  const anyCreate = (e) => e.method === 'POST' && /^\/v[12]\/payments(\/link)?$/.test(e.path);
  const getsOf = (list, paymentId) => list.filter((e) => e.method === 'GET' && e.path === `/${api}/payments/${paymentId}`);
  const orderStatus = async (id) => (await http(`${project}/orders/${encodeURIComponent(id)}`)).json?.status;

  /** Creates an order and finds the payment the project made for it. */
  async function newOrder(waitForPayment = 1500) {
    const countBefore = (await reqs()).filter(anyCreate).length;
    const res = await http(`${project}/orders`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ amount: 1500, description: 'Verification order' }),
    });
    const id = typeof res.json?.id === 'string' ? res.json.id : null;
    const entry = await waitFor(async () => {
      const list = (await reqs()).filter(anyCreate);
      return list.length > countBefore ? list[list.length - 1] : null;
    }, waitForPayment);
    const paymentId = entry && ok2xx(entry.status) ? entry.payment_id : null;
    return { res, id, entry, paymentId };
  }

  /** Delivers a signed webhook to the project. */
  async function deliver(order, event, { deliveryId = crypto.randomUUID(), secret = signingSecret } = {}) {
    const payload = {
      event,
      event_version: '1',
      delivery_id: deliveryId,
      attempt_number: 1,
      source: 'xpayment',
      payment_id: order.paymentId,
    };
    const merchantOrderId = order.entry?.body?.merchant_order_id;
    if (typeof merchantOrderId === 'string') payload.merchant_order_id = merchantOrderId;
    payload.created_at = new Date().toISOString();
    payload.environment = String(order.entry?.auth).includes('test_') ? 'sandbox' : 'live';
    // Pretty-printed on purpose: a handler that signs a re-serialised body cannot match these bytes.
    const raw = `${JSON.stringify(payload, null, 2)}\n`;
    const signature = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const res = await http(`${project}/webhooks/xpayment`, {
      method: 'POST',
      headers: { ...JSON_HEADERS, 'X-xPayment-Signature': signature },
      body: raw,
    });
    return { ...res, deliveryId };
  }

  const pay = (order, outcome) =>
    http(`${fake.url}/__pay/${order.paymentId}`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ outcome }) });

  // 1. an order, the contract, and the payment the project asked for
  const first = await newOrder();
  const created = first.res;
  add(
    'contract-post',
    ok2xx(created.status) && typeof created.json?.id === 'string' && created.json?.status === 'new',
    ok2xx(created.status) ? `HTTP ${created.status}, status ${JSON.stringify(created.json?.status)}` : `HTTP ${created.status || created.error}`,
  );
  const got = first.id ? await http(`${project}/orders/${encodeURIComponent(first.id)}`) : { status: 0 };
  add(
    'contract-get',
    got.status === 200 && got.json?.id === first.id && typeof got.json?.status === 'string',
    got.status === 200 ? `HTTP 200, status ${JSON.stringify(got.json?.status)}` : `HTTP ${got.status || got.error || 'no order id'}`,
  );

  // 2. what the project sent to the fake
  const entry = first.entry;
  const wantedPath = new RegExp(`^/${api}/payments(/link)?$`);
  if (!entry) {
    add('create', false, 'no request to /v1 or /v2 payments reached the fake');
    for (const id of api === 'v2' ? ['device-name', 'key-prefix', 'idempotency'] : ['key-prefix', 'idempotency']) add(id, false, 'no create request to look at');
  } else {
    add('create', wantedPath.test(entry.path) && ok2xx(entry.status), `${entry.method} ${entry.path} -> HTTP ${entry.status}`);
    if (api === 'v2') {
      const name = entry.body?.device_name;
      add('device-name', typeof name === 'string' && name !== '', typeof name === 'string' && name !== '' ? 'device_name is set' : 'device_name is missing');
    }
    const prefix = api === 'v2' ? 'xapi_' : 'xdev_';
    add('key-prefix', String(entry.auth).startsWith(prefix), `key prefix sent: ${entry.auth}`);
    add('idempotency', Boolean(entry.idempotency_key), entry.idempotency_key ? 'header present' : 'no X-Idempotency-Key header');
  }
  const url = got.json?.payment_url ?? created.json?.payment_url;
  add('payment-url', typeof url === 'string' && /^https?:\/\//.test(url), typeof url === 'string' ? 'payment_url is set' : 'no payment_url in the order');

  if (!first.paymentId) {
    const why = 'no payment was created, nothing to deliver';
    for (const id of ['webhook-ok', 'order-paid', 'get-payment', 'replay', 'bad-signature', 'refunded', 'failed']) add(id, false, why);
    return;
  }

  // 3. paid: a signed webhook, the order, the GET of the payment
  await pay(first, 'paid');
  const seqBefore = Math.max(0, ...(await reqs()).map((e) => e.seq));
  const hook = await deliver(first, 'payment.completed');
  add('webhook-ok', ok2xx(hook.status), `HTTP ${hook.status || hook.error}`);
  if (ok2xx(hook.status)) {
    const paid = await waitFor(async () => (await orderStatus(first.id)) === 'paid');
    add('order-paid', paid, paid ? 'status paid' : `status is ${JSON.stringify(await orderStatus(first.id))}`);
  } else {
    add('order-paid', false, `the webhook was not accepted (HTTP ${hook.status || hook.error})`);
  }
  const afterHook = await waitFor(async () => getsOf(await reqs(), first.paymentId).filter((e) => e.seq > seqBefore).length > 0, 1500);
  add('get-payment', afterHook, afterHook ? 'GET seen' : `no GET /${api}/payments/{id} after the webhook`);

  // 4. the same delivery again
  const getsBefore = getsOf(await reqs(), first.paymentId).length;
  const replay = await deliver(first, 'payment.completed', { deliveryId: hook.deliveryId });
  await sleep(400);
  const getsAfter = getsOf(await reqs(), first.paymentId).length;
  const stillPaid = (await orderStatus(first.id)) === 'paid';
  add(
    'replay',
    ok2xx(replay.status) && getsAfter === getsBefore && stillPaid,
    !ok2xx(replay.status)
      ? `HTTP ${replay.status || replay.error}`
      : getsAfter !== getsBefore
        ? `the payment was fetched again (${getsBefore} -> ${getsAfter} GETs)`
        : stillPaid
          ? 'HTTP 2xx, no second GET'
          : 'the order is no longer paid',
  );

  // 5. a wrong signature on a second order
  const second = await newOrder();
  if (second.paymentId) {
    await pay(second, 'paid');
    const seq2 = Math.max(0, ...(await reqs()).map((e) => e.seq));
    const bad = await deliver(second, 'payment.completed', { secret: `${signingSecret}-wrong` });
    await sleep(300);
    const touched = getsOf(await reqs(), second.paymentId).some((e) => e.seq > seq2) || (await orderStatus(second.id)) === 'paid';
    add(
      'bad-signature',
      bad.status === 401 && !touched,
      bad.status === 401 ? (touched ? 'HTTP 401 but the event was processed' : 'HTTP 401') : `HTTP ${bad.status || bad.error}, expected 401`,
    );
  } else {
    add('bad-signature', false, 'no payment was created for the second order');
  }

  // 6. refund on the first order
  await pay(first, 'refunded');
  const refundHook = await deliver(first, 'payment.refunded');
  if (ok2xx(refundHook.status)) {
    const refunded = await waitFor(async () => (await orderStatus(first.id)) === 'refunded');
    add('refunded', refunded, refunded ? 'status refunded' : `status is ${JSON.stringify(await orderStatus(first.id))}`);
  } else {
    add('refunded', false, `HTTP ${refundHook.status || refundHook.error}`);
  }

  // 7. expired, cancelled, failed
  const failures = [];
  for (const [event, outcome] of [['payment.expired', 'expired'], ['payment.cancelled', 'cancelled'], ['payment.failed', 'failed']]) {
    const order = await newOrder();
    if (!order.paymentId) {
      failures.push(`${event}: no payment`);
      continue;
    }
    await pay(order, outcome);
    const res = await deliver(order, event);
    if (!ok2xx(res.status)) {
      failures.push(`${event}: HTTP ${res.status || res.error}`);
      continue;
    }
    const done = await waitFor(async () => (await orderStatus(order.id)) === 'payment_failed');
    if (!done) failures.push(`${event}: status ${JSON.stringify(await orderStatus(order.id))}`);
  }
  add('failed', failures.length === 0, failures.length === 0 ? 'all three' : failures.join('; '));
}

// ---------- output ----------

export function formatTable(rows) {
  const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
  const lines = ['| Result | Check | Detail |', '|---|---|---|'];
  for (const r of rows) lines.push(`| ${r.ok ? 'PASS' : 'FAIL'} | ${cell(r.title)} | ${cell(r.detail)} |`);
  const pass = rows.filter((r) => r.ok).length;
  lines.push('', `${pass} PASS, ${rows.length - pass} FAIL`);
  return lines.join('\n');
}

function usage() {
  console.error('usage: node tests/acceptance/verify.mjs <project-dir> --stack node|python|php [--api v1|v2] [--python <path>]');
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { api: 'v2', python: 'python3' };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stack' || a === '--api' || a === '--python') {
      const value = argv[++i];
      if (value === undefined) usage();
      opts[a.slice(2)] = value;
    } else if (a.startsWith('--')) {
      usage();
    } else {
      rest.push(a);
    }
  }
  if (rest.length !== 1 || !['node', 'python', 'php'].includes(opts.stack) || !['v1', 'v2'].includes(opts.api)) usage();
  return { dir: rest[0], ...opts };
}

function isMain() {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const opts = parseArgs(process.argv.slice(2));
  try {
    const { rows } = await verify(opts);
    console.log(`verify: ${path.resolve(opts.dir)} (stack ${opts.stack}, API ${opts.api})\n`);
    console.log(formatTable(rows));
    process.exitCode = rows.every((r) => r.ok) ? 0 : 1;
  } catch (err) {
    console.error(`verify: ${err.message}`);
    process.exitCode = 2;
  }
}
