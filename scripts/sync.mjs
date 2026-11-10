#!/usr/bin/env node
// sync: keeps derived files of the plugin repository in step with their sources.
//
//   node scripts/sync.mjs [--docs] [--docs-base URL] [--version X.Y.Z] [root]
//
// root is the repository root (default: the current directory); the plugin lives in plugin/.
// Always: copies every file of shared/ (recursively) into plugin/skills/<skill>/references/
//   for every skill directory, and LICENSE into plugin/LICENSE. Skill-only files stay, nothing is removed.
// --docs: downloads <docs-base>/ai/manifest.json and <docs-base>/llms-full.txt into
//   shared/docs/ and writes shared/docs/SNAPSHOT.md (UTC download date and the
//   docs_updated_at of the manifest). The default docs base is https://xpayment.kz.
// --version X.Y.Z: sets the version in plugin/.claude-plugin/plugin.json, plugin/plugin.json, and in
//   every plugin/skills/*/SKILL.md (metadata.version and the "Plugin version:" line).
//   marketplace.json carries no version and is not touched.
//
// Everything that can fail (downloads, version edits) is prepared in memory first, so a
// failure leaves the working tree exactly as it was. Exit codes: 0 ok, 1 failure, 2 usage.
// Node 22, no dependencies.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_DOCS_BASE = 'https://xpayment.kz';
const USAGE = 'usage: node scripts/sync.mjs [--docs] [--docs-base URL] [--version X.Y.Z] [root]';
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const FETCH_TIMEOUT_MS = 30_000;
const PLUGIN_DIR = 'plugin';

class UsageError extends Error {}
class SyncError extends Error {}

// ---------- arguments ----------

export function parseArgs(argv) {
  const options = { docs: false, docsBase: DEFAULT_DOCS_BASE, version: undefined, root: undefined };
  const valueOf = (flag, inline, i) => {
    if (inline !== undefined) return [inline, i];
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) throw new UsageError(`${flag} needs a value`);
    return [next, i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const flag = eq > 0 ? arg.slice(0, eq) : arg;
    const inline = eq > 0 ? arg.slice(eq + 1) : undefined;
    if (flag === '--docs') {
      options.docs = true;
    } else if (flag === '--docs-base') {
      [options.docsBase, i] = valueOf(flag, inline, i);
    } else if (flag === '--version') {
      [options.version, i] = valueOf(flag, inline, i);
    } else if (arg.startsWith('--')) {
      throw new UsageError(`unknown option ${arg}`);
    } else if (options.root === undefined) {
      options.root = arg;
    } else {
      throw new UsageError(`unexpected argument ${arg}`);
    }
  }
  if (options.version !== undefined && !SEMVER_RE.test(options.version)) {
    throw new UsageError(`--version must look like X.Y.Z, got "${options.version}"`);
  }
  if (options.docs) {
    let protocol = '';
    try {
      protocol = new URL(options.docsBase).protocol;
    } catch {
      // handled below
    }
    if (protocol !== 'http:' && protocol !== 'https:') {
      throw new UsageError(`--docs-base must be an http(s) URL, got "${options.docsBase}"`);
    }
  }
  return options;
}

// ---------- files ----------

function isDir(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function walk(dir, rel = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(dir, entryRel));
    else if (entry.isFile()) out.push(entryRel);
  }
  return out.sort();
}

function skillNames(root) {
  const dir = path.join(root, PLUGIN_DIR, 'skills');
  if (!isDir(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function writeFile(root, rel, content) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// ---------- shared/ → references/, LICENSE → plugin/LICENSE ----------

function copyShared(root) {
  const sharedDir = path.join(root, 'shared');
  if (!isDir(sharedDir)) return 0;
  let changed = 0;
  for (const name of skillNames(root)) {
    for (const rel of walk(sharedDir)) {
      const source = fs.readFileSync(path.join(sharedDir, rel));
      const target = path.join(root, PLUGIN_DIR, 'skills', name, 'references', rel);
      if (fs.existsSync(target) && source.equals(fs.readFileSync(target))) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, source);
      changed++;
    }
  }
  return changed;
}

/** The plugin ships its own copy of the root LICENSE (the release archive is plugin/ alone). */
function copyLicense(root) {
  const source = path.join(root, 'LICENSE');
  const target = path.join(root, PLUGIN_DIR, 'LICENSE');
  if (!fs.existsSync(source) || !isDir(path.join(root, PLUGIN_DIR))) return false;
  const content = fs.readFileSync(source);
  if (fs.existsSync(target) && content.equals(fs.readFileSync(target))) return false;
  fs.writeFileSync(target, content);
  return true;
}

// ---------- --docs ----------

async function fetchText(url) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    throw new SyncError(`docs: cannot fetch ${url}: ${err.cause?.code ?? err.message}`);
  }
  if (res.status !== 200) throw new SyncError(`docs: ${url} answered ${res.status}, expected 200`);
  return res.text();
}

async function prepareDocs(base) {
  const root = base.replace(/\/+$/, '');
  const manifestUrl = `${root}/ai/manifest.json`;
  const llmsUrl = `${root}/llms-full.txt`;
  const manifestText = await fetchText(manifestUrl);
  const llmsText = await fetchText(llmsUrl);

  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new SyncError(`docs: ${manifestUrl} is not JSON`);
  }
  const updated = manifest?.docs_updated_at;
  if (typeof updated !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(updated)) {
    throw new SyncError(`docs: ${manifestUrl} has no docs_updated_at (YYYY-MM-DD)`);
  }
  if (llmsText.trim() === '') throw new SyncError(`docs: ${llmsUrl} is empty`);

  const today = new Date().toISOString().slice(0, 10);
  const snapshot = [
    '# Documentation snapshot',
    '',
    'A copy of the public xPayment documentation, written by `node scripts/sync.mjs --docs`. Do not edit it by hand.',
    '',
    `- Downloaded: ${today} (UTC)`,
    `- docs_updated_at: ${updated}`,
    `- Source: ${manifestUrl} and ${llmsUrl}`,
    '',
  ].join('\n');

  return {
    updated,
    files: {
      'shared/docs/manifest.json': manifestText,
      'shared/docs/llms-full.txt': llmsText,
      'shared/docs/SNAPSHOT.md': snapshot,
    },
  };
}

// ---------- --version ----------

function setJsonVersion(rel, text, version) {
  const re = /^(\s*"version"\s*:\s*)"[^"]*"/m;
  if (!re.test(text)) throw new SyncError(`version: no "version" field found in ${rel}`);
  const next = text.replace(re, `$1"${version}"`);
  let parsed;
  try {
    parsed = JSON.parse(next);
  } catch {
    throw new SyncError(`version: ${rel} is not valid JSON`);
  }
  if (parsed.version !== version) throw new SyncError(`version: could not set the top-level version of ${rel}`);
  return next;
}

function setSkillVersion(rel, text, version) {
  const lines = text.split('\n');
  const end = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (end < 0) throw new SyncError(`version: ${rel} has no frontmatter`);

  const meta = lines.slice(0, end).findIndex((line) => /^metadata:\s*$/.test(line));
  const versionLine = meta < 0 ? -1 : lines.findIndex((line, i) => i > meta && i < end && /^ {2}version:/.test(line));
  if (versionLine < 0) throw new SyncError(`version: ${rel} has no metadata.version line`);
  lines[versionLine] = `  version: "${version}"`;

  const planLine = lines.findIndex((line, i) => i > end && /^Plugin version:/.test(line));
  if (planLine < 0) throw new SyncError(`version: ${rel} has no "Plugin version:" line`);
  lines[planLine] = lines[planLine].replace(/^Plugin version:[^\r]*/, `Plugin version: ${version}.`);
  return lines.join('\n');
}

function prepareVersion(root, version) {
  const files = {};
  for (const rel of [`${PLUGIN_DIR}/.claude-plugin/plugin.json`, `${PLUGIN_DIR}/plugin.json`]) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) throw new SyncError(`version: ${rel} is missing`);
    files[rel] = setJsonVersion(rel, fs.readFileSync(file, 'utf8'), version);
  }
  for (const name of skillNames(root)) {
    const rel = `${PLUGIN_DIR}/skills/${name}/SKILL.md`;
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    files[rel] = setSkillVersion(rel, fs.readFileSync(file, 'utf8'), version);
  }
  return files;
}

// ---------- main ----------

export async function sync(options) {
  const root = path.resolve(options.root ?? process.cwd());
  const writes = {};
  const log = [];

  // 1. Prepare everything that can fail, writing nothing.
  if (options.docs) {
    const docs = await prepareDocs(options.docsBase);
    Object.assign(writes, docs.files);
    log.push(`docs snapshot from ${options.docsBase} (docs_updated_at ${docs.updated})`);
  }
  if (options.version !== undefined) {
    Object.assign(writes, prepareVersion(root, options.version));
    log.push(`version set to ${options.version}`);
  }

  // 2. Apply.
  for (const [rel, content] of Object.entries(writes)) writeFile(root, rel, content);
  const copied = copyShared(root);
  log.push(`${copied} reference file(s) copied from shared/`);
  if (copyLicense(root)) log.push(`LICENSE copied to ${PLUGIN_DIR}/LICENSE`);
  return log;
}

function isMain() {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    const log = await sync(parseArgs(process.argv.slice(2)));
    for (const line of log) console.log(`sync: ${line}`);
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`sync: ${err.message}\n${USAGE}`);
      process.exitCode = 2;
    } else if (err instanceof SyncError) {
      console.error(`sync: ${err.message}`);
      process.exitCode = 1;
    } else {
      throw err;
    }
  }
}
