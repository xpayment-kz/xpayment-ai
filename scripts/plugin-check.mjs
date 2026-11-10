#!/usr/bin/env node
// plugin-check: static consistency checks for the xpayment plugin repository.
//
//   node scripts/plugin-check.mjs [root]
//
// root is the repository root (default: the current directory). The plugin itself lives in plugin/ and is all
// that a user installs: the marketplace at the root (.claude-plugin/marketplace.json) points at "./plugin",
// and the release archive is `git archive HEAD:plugin`. Everything else (shared/, scripts/, tests/, evals*/,
// .github/) is development tooling and stays out of plugin/.
//
// Prints "plugin-check: ok" and exits 0, or prints one line per problem and exits 1.
// Node 22, no dependencies.
//
// What plugin/ may hold. Only .claude-plugin/plugin.json, plugin.json, .mcp.json, mcp.json, skills/**, LICENSE
// (identical to the root LICENSE) and README.md. Any other file (a script, a test, an eval, a second manifest)
// or a symbolic link is a problem line. The same file set as the secret scan is looked at (below), so a
// git-ignored file such as .DS_Store does not count.
//
// Secret scan. Any file of the repository that matches
//   (xapi|xdev)_(test_)?[0-9a-f]{64}
// is a problem, with ONE documented exception per prefix: the fake value whose 64 hex
// characters are the sixteen characters 0123456789abcdef repeated four times, with or
// without "test_" (so four strings in total: xapi_, xapi_test_, xdev_, xdev_test_).
// Docs and examples may use that value; nothing else is ignored. The output never
// repeats a matched value, only its prefix.
//
// Local traces. The same files must not name a local home directory (/Users/<name>/ or
// /home/<name>/), and no file under evals*/ may be a UUID-named .jsonl (a session transcript the
// eval harness writes beside a case that resumes a history_file). The output never repeats the
// user name.
//
// Which files are scanned. In a git checkout: the files git knows (`git ls-files`) plus
// new files that are not git-ignored, so a secret is caught before `git add`. In CI the
// two sets are the same. Outside git (the temp dirs of the tests): every file except
// .git/, node_modules/, .venv/, vendor/, .superpowers/ and evals/results/.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SKILL_KEYS = ['name', 'description', 'license', 'metadata'];
const SKILL_MAX_LINES = 500;
const DESCRIPTION_MAX = 1024;
const NAME_RE = /^[a-z0-9-]{1,64}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const PLUGIN_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';
const FORBIDDEN_DIRS = ['hooks', 'agents', 'commands'];
const PLUGIN_DIR = 'plugin';
const MARKETPLACE_SOURCE = './plugin';
const PLUGIN_FILES = ['.claude-plugin/plugin.json', 'plugin.json', '.mcp.json', 'mcp.json', 'LICENSE', 'README.md'];
const PLUGIN_TREES = ['skills/'];
/** Paths that belong in plugin/; one at the root means the move to plugin/ is incomplete or was undone. */
const ROOT_LEFTOVERS = ['.claude-plugin/plugin.json', 'plugin.json', '.mcp.json', 'mcp.json', 'skills'];
const P = (rel) => `${PLUGIN_DIR}/${rel}`;
const SHARED_PLUGIN_FIELDS = ['name', 'description', 'homepage', 'repository', 'license', 'author', 'keywords'];

const SECRET_RE = /(xapi|xdev)_(test_)?[0-9a-f]{64}/g;
const FAKE_HEX = '0123456789abcdef'.repeat(4);
const HOME_PATH_RE = /\/(Users|home)\/[A-Za-z0-9._-]+\//;
const SESSION_FILE_RE = /^evals[^/]*\/(?:.+\/)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i;

const SKIP_DIR_NAMES = new Set(['.git', 'node_modules', '.venv', 'vendor', '.superpowers']);
const SKIP_DIR_PATHS = new Set(['evals/results']);

// ---------- small helpers ----------

// A short printable form of any value, including an absent one (JSON.stringify(undefined) is undefined).
const short = (value) => {
  const s = JSON.stringify(value);
  if (s === undefined) return '<missing>';
  return s.length > 70 ? `${s.slice(0, 67)}...` : s;
};

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function isDir(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/** All files under dir (relative posix paths), sorted. Skips nothing. */
function walk(dir, skip = () => false, rel = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (skip(entryRel, entry.name)) continue;
      out.push(...walk(dir, skip, entryRel));
    } else if (entry.isFile()) {
      out.push(entryRel);
    }
  }
  return out.sort();
}

function loadJson(root, rel, problems) {
  const file = path.join(root, rel);
  if (!isFile(file)) {
    problems.push(`${rel}: missing`);
    return null;
  }
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    problems.push(`${rel}: invalid JSON (${err.message})`);
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    problems.push(`${rel}: must contain a JSON object at the top level`);
    return null;
  }
  return value;
}

// ---------- frontmatter ----------

function unquote(raw) {
  return raw.slice(1, -1).replace(/\\(["\\])/g, '$1');
}

/**
 * Flat `key: value` frontmatter with at most one nested block (`metadata:` with
 * two-space-indented children). A double-quoted value is unquoted (\" and \\ are
 * unescaped). Nothing wider than this is supported.
 */
export function parseSkill(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return { error: 'frontmatter missing (the file must start with ---)' };
  const end = lines.indexOf('---', 1);
  if (end < 0) return { error: 'frontmatter is not closed (second --- missing)' };

  const data = {};
  const raw = {};
  const errors = [];
  let block = null;
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    let m = /^ {2}([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(line);
    if (m && block) {
      block.data[m[1]] = m[2].startsWith('"') && m[2].endsWith('"') && m[2].length >= 2 ? unquote(m[2]) : m[2].trim();
      continue;
    }
    m = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(line);
    if (m) {
      const [, key, value] = m;
      if (key in data) errors.push(`frontmatter key "${key}" appears twice`);
      if (value.trim() === '') {
        data[key] = {};
        block = { data: data[key] };
      } else {
        raw[key] = value.trim();
        data[key] = raw[key].startsWith('"') && raw[key].endsWith('"') && raw[key].length >= 2 ? unquote(raw[key]) : raw[key];
        block = null;
      }
      continue;
    }
    errors.push(`frontmatter line ${i + 1} is not supported: ${short(line)}`);
  }
  return { data, raw, errors, body: lines.slice(end + 1) };
}

// ---------- checks ----------

function checkPluginManifests(root, problems) {
  const claudeRel = P('.claude-plugin/plugin.json');
  const portableRel = P('plugin.json');
  const claude = loadJson(root, claudeRel, problems);
  const portable = loadJson(root, portableRel, problems);

  for (const [rel, manifest] of [[claudeRel, claude], [portableRel, portable]]) {
    if (!manifest) continue;
    if (typeof manifest.name !== 'string' || !manifest.name) problems.push(`${rel}: name is missing`);
    if (manifest.version === undefined) {
      problems.push(`${rel}: version is missing`);
    } else if (typeof manifest.version !== 'string' || !SEMVER_RE.test(manifest.version)) {
      problems.push(`${rel}: version ${short(manifest.version)} is not semver (X.Y.Z)`);
    }
  }

  if (portable) {
    if (Object.keys(portable)[0] !== '$schema' || portable.$schema !== PLUGIN_SCHEMA) {
      problems.push(`${portableRel}: "$schema" must be the first field and equal ${PLUGIN_SCHEMA}`);
    }
    if ('displayName' in portable) {
      problems.push(`${portableRel}: "displayName" must not be set (only ${claudeRel} has it)`);
    }
  }

  if (claude && portable) {
    if (claude.version !== portable.version) {
      problems.push(
        `version differs between ${claudeRel} (${short(claude.version)}) and ${portableRel} (${short(portable.version)})`,
      );
    }
    for (const field of SHARED_PLUGIN_FIELDS) {
      if (JSON.stringify(claude[field]) !== JSON.stringify(portable[field])) {
        problems.push(
          `${field} differs between ${claudeRel} (${short(claude[field])}) and ${portableRel} (${short(portable[field])})`,
        );
      }
    }
  }
  return { claude, portable, version: claude?.version ?? portable?.version, name: claude?.name ?? portable?.name };
}

function checkMarketplace(root, pluginName, problems) {
  const rel = '.claude-plugin/marketplace.json';
  const market = loadJson(root, rel, problems);
  if (!market) return;
  if (typeof market.name !== 'string' || !market.name) problems.push(`${rel}: name is missing`);
  if (typeof market.owner?.name !== 'string' || !market.owner.name) problems.push(`${rel}: owner.name is missing`);
  if (!Array.isArray(market.plugins) || market.plugins.length === 0) {
    problems.push(`${rel}: plugins must be a non-empty array`);
    return;
  }
  for (const [i, plugin] of market.plugins.entries()) {
    if (typeof plugin !== 'object' || plugin === null || Array.isArray(plugin)) {
      problems.push(`${rel}: plugins[${i}] must be an object, got ${short(plugin)}`);
      continue;
    }
    if (pluginName !== undefined && plugin?.name !== pluginName) {
      problems.push(`${rel}: plugin name ${short(plugin?.name)} differs from ${P('plugin.json')} name ${short(pluginName)}`);
    }
    if (plugin?.source !== MARKETPLACE_SOURCE) {
      problems.push(`${rel}: plugin ${short(plugin?.name)} source is ${short(plugin?.source)}, expected "${MARKETPLACE_SOURCE}"`);
    }
  }
}

function checkMcp(root, problems) {
  const files = [
    { rel: P('.mcp.json'), type: 'http', schema: false },
    { rel: P('mcp.json'), type: 'streamable-http', schema: true },
  ];
  const urls = {};
  for (const { rel, type, schema } of files) {
    const config = loadJson(root, rel, problems);
    if (!config) continue;
    if (schema && (Object.keys(config)[0] !== '$schema' || config.$schema !== MCP_SCHEMA)) {
      problems.push(`${rel}: "$schema" must be the first field and equal ${MCP_SCHEMA}`);
    }
    const servers = config.mcpServers;
    if (typeof servers !== 'object' || servers === null || Array.isArray(servers)) {
      problems.push(`${rel}: mcpServers must be an object`);
      continue;
    }
    urls[rel] = {};
    for (const [key, server] of Object.entries(servers)) {
      if (typeof server !== 'object' || server === null || Array.isArray(server)) {
        problems.push(`${rel}: server "${key}" must be an object, got ${short(server)}`);
        continue;
      }
      urls[rel][key] = server.url;
      if (server?.type !== type) problems.push(`${rel}: server "${key}" type is ${short(server?.type)}, expected "${type}"`);
      let https = false;
      try {
        https = new URL(server?.url).protocol === 'https:';
      } catch {
        // not a URL at all
      }
      if (!https) problems.push(`${rel}: server "${key}" url ${short(server?.url)} is not https`);
      for (const forbidden of ['auth', 'headers']) {
        if (forbidden in (server ?? {})) {
          problems.push(`${rel}: server "${key}" has a "${forbidden}" block (the servers use OAuth discovery, none is allowed)`);
        }
      }
    }
  }
  const [claudeRel, portableRel] = files.map((f) => f.rel);
  if (urls[claudeRel] && urls[portableRel]) {
    const a = urls[claudeRel];
    const b = urls[portableRel];
    const diffs = [];
    for (const key of Object.keys(a)) {
      if (!(key in b)) diffs.push(`"${key}" only in ${claudeRel}`);
      else if (a[key] !== b[key]) diffs.push(`"${key}" url ${short(a[key])} vs ${short(b[key])}`);
    }
    for (const key of Object.keys(b)) if (!(key in a)) diffs.push(`"${key}" only in ${portableRel}`);
    if (diffs.length) problems.push(`${claudeRel} and ${portableRel} list different servers or URLs: ${diffs.join('; ')}`);
  }
}

function checkSkills(root, pluginVersion, problems) {
  const skillsDir = path.join(root, P('skills'));
  if (!isDir(skillsDir)) {
    problems.push(`${P('skills')}/: missing`);
    return [];
  }
  const skillNames = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  for (const dirName of skillNames) {
    const rel = P(`skills/${dirName}/SKILL.md`);
    const file = path.join(root, rel);
    if (!isFile(file)) {
      problems.push(`${P(`skills/${dirName}`)}: SKILL.md is missing`);
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    const lineCount = text.replace(/\n$/, '').split('\n').length;
    if (lineCount > SKILL_MAX_LINES) problems.push(`${rel}: ${lineCount} lines, the limit is ${SKILL_MAX_LINES}`);

    const parsed = parseSkill(text);
    if (parsed.error) {
      problems.push(`${rel}: ${parsed.error}`);
      continue;
    }
    for (const error of parsed.errors) problems.push(`${rel}: ${error}`);
    const { data, raw, body } = parsed;

    for (const key of Object.keys(data)) {
      if (!SKILL_KEYS.includes(key)) {
        problems.push(`${rel}: frontmatter key "${key}" is not allowed (allowed: ${SKILL_KEYS.join(', ')})`);
      }
    }

    if (typeof data.name !== 'string' || data.name === '') {
      problems.push(`${rel}: name is missing`);
    } else {
      if (!NAME_RE.test(data.name)) problems.push(`${rel}: name ${short(data.name)} is not [a-z0-9-]{1,64}`);
      if (data.name !== dirName) problems.push(`${rel}: name ${short(data.name)} differs from its directory "${dirName}"`);
    }

    if (typeof data.description !== 'string' || data.description === '') {
      problems.push(`${rel}: description is missing`);
    } else {
      if (!(raw.description.startsWith('"') && raw.description.endsWith('"') && raw.description.length >= 2)) {
        problems.push(`${rel}: description must be one line in double quotes`);
      }
      const length = Array.from(data.description).length;
      if (length > DESCRIPTION_MAX) problems.push(`${rel}: description is ${length} characters, the limit is ${DESCRIPTION_MAX}`);
    }

    const metadata = data.metadata;
    if (typeof metadata !== 'object' || metadata === null) {
      problems.push(`${rel}: metadata block with version is missing`);
    } else {
      for (const key of Object.keys(metadata)) {
        if (key !== 'version') problems.push(`${rel}: metadata must hold only "version", found "${key}"`);
      }
      if (metadata.version === undefined) {
        problems.push(`${rel}: metadata.version is missing`);
      } else if (pluginVersion !== undefined && metadata.version !== pluginVersion) {
        problems.push(`${rel}: metadata.version ${short(metadata.version)} differs from plugin version ${short(pluginVersion)}`);
      }
    }

    // The first non-empty line after the "# ..." title must be "Plugin version: X.Y.Z."
    if (pluginVersion !== undefined) {
      const heading = body.findIndex((line) => /^# /.test(line));
      const first = body.slice(heading + 1).find((line) => line.trim() !== '');
      if (first !== `Plugin version: ${pluginVersion}.`) {
        problems.push(`${rel}: the line "Plugin version: ${pluginVersion}." is missing or different right after the title`);
      }
    }
  }
  return skillNames;
}

/** Relative markdown links without a scheme must point to existing files (skills, their references, the plugin's README). */
function checkLinks(root, skillNames, problems) {
  const files = [];
  if (isFile(path.join(root, P('README.md')))) files.push(P('README.md'));
  for (const name of skillNames) {
    if (isFile(path.join(root, P(`skills/${name}/SKILL.md`)))) files.push(P(`skills/${name}/SKILL.md`));
    const refs = path.join(root, P(`skills/${name}/references`));
    if (isDir(refs)) {
      for (const rel of walk(refs)) if (rel.endsWith('.md')) files.push(P(`skills/${name}/references/${rel}`));
    }
  }
  for (const rel of files) {
    let text = fs.readFileSync(path.join(root, rel), 'utf8');
    text = text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '').replace(/`[^`\n]*`/g, '');
    for (const m of text.matchAll(/\]\(\s*(<[^>]*>|[^)\s]*)[^)]*\)/g)) {
      let target = m[1].replace(/^<|>$/g, '');
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target) || target.startsWith('/') || target.startsWith('#')) continue;
      target = target.replace(/[#?].*$/, '');
      if (target === '') continue;
      try {
        target = decodeURI(target);
      } catch {
        // keep the raw text
      }
      if (!fs.existsSync(path.resolve(root, path.dirname(rel), target))) {
        problems.push(`${rel}: link "${m[1]}" points to a missing file`);
      }
    }
  }
}

/** Every file of shared/ (recursively) must be identical in plugin/skills/<s>/references/. */
function checkShared(root, skillNames, problems) {
  const sharedDir = path.join(root, 'shared');
  if (!isDir(sharedDir)) return;
  for (const rel of walk(sharedDir)) {
    const source = fs.readFileSync(path.join(sharedDir, rel));
    for (const name of skillNames) {
      const targetRel = P(`skills/${name}/references/${rel}`);
      const target = path.join(root, targetRel);
      if (!isFile(target)) {
        problems.push(`${targetRel}: missing (copy of shared/${rel}; run node scripts/sync.mjs)`);
      } else if (!source.equals(fs.readFileSync(target))) {
        problems.push(`${targetRel}: differs from shared/${rel} (run node scripts/sync.mjs)`);
      }
    }
  }
}

function checkForbiddenDirs(root, problems) {
  for (const dir of FORBIDDEN_DIRS) {
    if (fs.existsSync(path.join(root, P(dir)))) {
      problems.push(`${P(dir)}/ must not exist (the plugin has only skills and MCP)`);
    }
  }
}

function lstat(file) {
  try {
    return fs.lstatSync(file);
  } catch {
    return null;
  }
}

/**
 * The entries of plugin/ (paths relative to plugin/), from the same file set as the secret scan: in git the
 * tracked and the new not-ignored files, outside git a walk. Symbolic links are listed too (statSync would
 * follow them and hide one that points at a directory).
 */
function pluginEntries(root) {
  const base = path.join(root, PLUGIN_DIR);
  if (!isDir(base)) return [];
  if (fs.existsSync(path.join(root, '.git'))) {
    const r = spawnSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', PLUGIN_DIR], {
      encoding: 'buffer',
      maxBuffer: 256 * 1024 * 1024,
    });
    if (r.status === 0) {
      const names = new Set(r.stdout.toString('utf8').split('\0').filter(Boolean));
      return [...names]
        .filter((rel) => rel.startsWith(`${PLUGIN_DIR}/`) && lstat(path.join(root, rel)) !== null)
        .map((rel) => rel.slice(PLUGIN_DIR.length + 1))
        .sort();
    }
  }
  const out = [];
  const visit = (rel) => {
    for (const entry of fs.readdirSync(path.join(base, rel), { withFileTypes: true })) {
      const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIP_DIR_NAMES.has(entry.name)) visit(entryRel);
      } else {
        out.push(entryRel);
      }
    }
  };
  visit('');
  return out.sort();
}

/** plugin/ holds the plugin and nothing else: no script, test or eval reaches a user's machine. */
function checkPluginContents(root, problems) {
  if (!isDir(path.join(root, PLUGIN_DIR))) {
    problems.push(`${PLUGIN_DIR}/: missing (the plugin lives in ${PLUGIN_DIR}/)`);
    return;
  }
  const allowed = [...PLUGIN_FILES, ...PLUGIN_TREES.map((t) => `${t}**`)].join(', ');
  for (const rel of pluginEntries(root)) {
    if (FORBIDDEN_DIRS.some((dir) => rel.startsWith(`${dir}/`))) continue; // reported by checkForbiddenDirs
    if (lstat(path.join(root, P(rel)))?.isSymbolicLink()) {
      problems.push(`${P(rel)}: a symbolic link (${PLUGIN_DIR}/ holds plain files only)`);
    } else if (!PLUGIN_FILES.includes(rel) && !PLUGIN_TREES.some((t) => rel.startsWith(t))) {
      problems.push(`${P(rel)}: not part of the plugin (${PLUGIN_DIR}/ holds only ${allowed}); move it out of ${PLUGIN_DIR}/`);
    }
  }

  const license = path.join(root, 'LICENSE');
  const copy = path.join(root, P('LICENSE'));
  if (!isFile(license)) problems.push('LICENSE: missing');
  if (!isFile(copy)) problems.push(`${P('LICENSE')}: missing (a copy of LICENSE; run node scripts/sync.mjs)`);
  else if (isFile(license) && !fs.readFileSync(license).equals(fs.readFileSync(copy))) {
    problems.push(`${P('LICENSE')}: differs from LICENSE (run node scripts/sync.mjs)`);
  }
  if (!isFile(path.join(root, P('README.md')))) problems.push(`${P('README.md')}: missing (the plugin's own short README)`);
}

/** The plugin's files at the root would mean the move to plugin/ is incomplete (or a merge brought them back). */
function checkRootLeftovers(root, problems) {
  for (const rel of ROOT_LEFTOVERS) {
    if (lstat(path.join(root, rel)) !== null) problems.push(`${rel}: belongs in ${PLUGIN_DIR}/, not at the repository root`);
  }
}

function filesToScan(root) {
  if (fs.existsSync(path.join(root, '.git'))) {
    const r = spawnSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      encoding: 'buffer',
      maxBuffer: 256 * 1024 * 1024,
    });
    if (r.status === 0) {
      const names = new Set(r.stdout.toString('utf8').split('\0').filter(Boolean));
      return [...names].filter((rel) => isFile(path.join(root, rel))).sort();
    }
  }
  return walk(root, (rel, name) => SKIP_DIR_NAMES.has(name) || SKIP_DIR_PATHS.has(rel));
}

function checkSecrets(root, problems) {
  for (const rel of filesToScan(root)) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const m of text.matchAll(SECRET_RE)) {
      if (m[0].slice(-64) === FAKE_HEX) continue;
      const line = text.slice(0, m.index).split('\n').length;
      problems.push(`${rel}:${line}: secret-looking string (${m[1]}_${m[2] ?? ''}<redacted>)`);
    }
  }
}

/**
 * Local traces. The repository is published, so no file of it may name a developer's home
 * directory (/Users/<name>/ on macOS, /home/<name>/ on Linux): such a path comes from a log, a
 * transcript or a pasted command, and what is around it is usually private too. One line per
 * file; the output never repeats the user name. And no session transcript the eval harness
 * writes beside a case (a <uuid>.jsonl under evals*): it holds the whole session.
 */
function checkLocalTraces(root, problems) {
  for (const rel of filesToScan(root)) {
    if (SESSION_FILE_RE.test(rel)) {
      problems.push(`${rel}: an eval session transcript (<uuid>.jsonl) must not be in the repository`);
      continue;
    }
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    const m = HOME_PATH_RE.exec(text);
    if (m) {
      const line = text.slice(0, m.index).split('\n').length;
      problems.push(`${rel}:${line}: local home path (/${m[1]}/<name>/…)`);
    }
  }
}

// ---------- entry points ----------

export function check(root) {
  const problems = [];
  const plugin = checkPluginManifests(root, problems);
  checkMarketplace(root, plugin.name, problems);
  checkMcp(root, problems);
  const skillNames = checkSkills(root, plugin.version, problems);
  checkLinks(root, skillNames, problems);
  checkShared(root, skillNames, problems);
  checkForbiddenDirs(root, problems);
  checkPluginContents(root, problems);
  checkRootLeftovers(root, problems);
  checkSecrets(root, problems);
  checkLocalTraces(root, problems);
  return problems;
}

function isMain() {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const root = path.resolve(process.argv[2] ?? process.cwd());
  const problems = check(root);
  if (problems.length === 0) {
    console.log('plugin-check: ok');
  } else {
    for (const problem of problems) console.log(problem);
    process.exitCode = 1;
  }
}
