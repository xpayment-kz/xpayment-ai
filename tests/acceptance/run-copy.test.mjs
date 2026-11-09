import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'run-copy.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'run-copy-test-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, TMPDIR: tmp } });

test('run-copy prints the path of a git copy with one commit', () => {
  const r = run('shop-node');
  assert.equal(r.status, 0, r.stderr);
  const dir = r.stdout.trim();
  assert.equal(r.stdout, `${dir}\n`, 'only the path is printed');
  assert.match(path.relative(tmp, dir), /^xpayment-acceptance[\\/]shop-node-\d{8}-\d{6}$/);
  assert.ok(fs.existsSync(path.join(dir, 'server.js')));
  assert.ok(fs.existsSync(path.join(dir, 'package-lock.json')));
  assert.ok(!fs.existsSync(path.join(dir, 'node_modules')), 'node_modules is not copied');
  const log = spawnSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });
  assert.equal(log.stdout.trim().split('\n').length, 1);
  const status = spawnSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' });
  assert.equal(status.stdout, '');
});

test('two copies in the same second do not collide', () => {
  const a = run('shop-php').stdout.trim();
  const b = run('shop-php').stdout.trim();
  assert.notEqual(a, b);
  assert.ok(fs.existsSync(path.join(a, 'public', 'index.php')) && fs.existsSync(path.join(b, 'public', 'index.php')));
  assert.ok(!fs.existsSync(path.join(a, 'var', 'orders.json')));
});

test('an unknown project exits 2 and lists the known ones', () => {
  const r = run('nope');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /shop-node/);
  assert.equal(run().status, 2);
});
