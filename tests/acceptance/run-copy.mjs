#!/usr/bin/env node
// run-copy: a fresh copy of a sample project for an acceptance run.
//
//   node tests/acceptance/run-copy.mjs <project>      (shop-node, shop-python, shop-php, legacy-v1-node, broken-python)
//
// Copies tests/projects/<project> (without node_modules, .venv, caches, .env and runtime data) to
// $TMPDIR/xpayment-acceptance/<project>-<YYYYMMDD-HHMMSS>, makes it a git repository with one commit,
// and prints the path of the copy (and nothing else) on stdout. Node 22, no dependencies.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectsDir = path.resolve(here, '..', 'projects');
const SKIP = new Set(['node_modules', '.venv', '__pycache__', '.pytest_cache', '.git', '.env', 'orders.json']);

function stamp(date = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=xpayment-acceptance', '-c', 'user.email=acceptance@example.invalid', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${(r.stderr || r.stdout || r.error?.message || '').trim()}`);
}

export function runCopy(project) {
  const src = path.join(projectsDir, project);
  if (!/^[a-z0-9-]+$/.test(project) || !fs.existsSync(src)) {
    const known = fs.readdirSync(projectsDir).sort().join(', ');
    throw new Error(`unknown project "${project}" (known: ${known})`);
  }
  const root = path.join(os.tmpdir(), 'xpayment-acceptance');
  fs.mkdirSync(root, { recursive: true });
  let dest = path.join(root, `${project}-${stamp()}`);
  for (let n = 2; fs.existsSync(dest); n++) dest = path.join(root, `${project}-${stamp()}-${n}`);
  fs.cpSync(src, dest, { recursive: true, filter: (s) => !SKIP.has(path.basename(s)) });
  git(dest, 'init', '-q');
  git(dest, 'add', '-A');
  git(dest, 'commit', '-q', '-m', `${project}: before integration`);
  return dest;
}

function isMain() {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  if (process.argv.length !== 3) {
    console.error('usage: node tests/acceptance/run-copy.mjs <project>');
    process.exit(2);
  }
  try {
    console.log(runCopy(process.argv[2]));
  } catch (err) {
    console.error(`run-copy: ${err.message}`);
    process.exit(2);
  }
}
