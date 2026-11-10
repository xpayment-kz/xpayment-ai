import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'check-report.mjs');
const expected = path.join(here, '..', 'expected', 'broken-python.json');
const codes = JSON.parse(fs.readFileSync(expected, 'utf8')).map((e) => e.code);

function run(reportText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-report-'));
  const report = path.join(dir, 'report.txt');
  fs.writeFileSync(report, reportText);
  const r = spawnSync(process.execPath, [script, report, expected], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: r.status, out: r.stdout + r.stderr };
}

const line = (code) => `- [${code}] something is wrong in webhooks.py\n`;

test('the expected file lists all 12 XP-C codes', () => {
  assert.deepEqual(codes, Array.from({ length: 12 }, (_, i) => `XP-C${String(i + 1).padStart(2, '0')}`));
});

test('report with all 12 codes -> exit 0', () => {
  const r = run(`# Review\n\n${codes.map(line).join('')}`);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /12 of 12/);
});

test('missing XP-C10 -> exit 1 and names it', () => {
  const r = run(codes.filter((c) => c !== 'XP-C10').map(line).join(''));
  assert.equal(r.status, 1);
  assert.match(r.out, /missing: XP-C10/);
  assert.doesNotMatch(r.out, /missing:.*XP-C09/);
});

test('a code without brackets does not count', () => {
  const r = run(codes.map((c) => (c === 'XP-C05' ? 'XP-C05 is mentioned without brackets\n' : line(c))).join(''));
  assert.equal(r.status, 1);
  assert.match(r.out, /missing: XP-C05/);
});

test('codes that are not expected are listed but do not fail the check', () => {
  const r = run(`${codes.map(line).join('')}${line('XP-A03')}`);
  assert.equal(r.status, 0);
  assert.match(r.out, /not expected: XP-A03/);
});

test('an empty report misses every code', () => {
  const r = run('nothing found\n');
  assert.equal(r.status, 1);
  assert.match(r.out, /0 of 12/);
});

test('usage errors exit 2', () => {
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});
