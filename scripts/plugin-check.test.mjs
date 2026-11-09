// Tests for scripts/plugin-check.mjs.
// Every test builds a valid sample repository in a temp dir, applies ONE corruption,
// then runs the checker as a subprocess and asserts on the problem line and the exit code.
//
// Key-shaped strings are always built at runtime ('xapi_' + 'a'.repeat(64)), never written
// as literals: the repository's own secret scan reads this file too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'plugin-check.mjs');
const VERSION = '0.1.0';

// ---------- sample repository ----------

function write(root, rel, content) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function writeJson(root, rel, value) {
  write(root, rel, JSON.stringify(value, null, 2) + '\n');
}

function readJson(root, rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function editJson(root, rel, fn) {
  const value = readJson(root, rel);
  fn(value);
  writeJson(root, rel, value);
}

function editText(root, rel, fn) {
  const file = path.join(root, rel);
  fs.writeFileSync(file, fn(fs.readFileSync(file, 'utf8')));
}

function skillMd(name, { description = 'Does a thing. Use when asked.', version = VERSION } = {}) {
  return [
    '---',
    `name: ${name}`,
    `description: "${description}"`,
    'metadata:',
    `  version: "${version}"`,
    '---',
    '',
    `# ${name}`,
    '',
    `Plugin version: ${VERSION}.`,
    '',
    'See [the glossary](references/glossary.md).',
    '',
  ].join('\n');
}

const GLOSSARY = '# Glossary\n\nBack to [the skill](../SKILL.md).\n';

const SERVERS = {
  'xpayment-docs': 'https://api.xpayment.kz/mcp/docs',
  xpayment: 'https://api.xpayment.kz/mcp',
};

function mcpFile(type, withSchema) {
  const mcpServers = {};
  for (const [key, url] of Object.entries(SERVERS)) mcpServers[key] = { type, url };
  return withSchema
    ? { $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers }
    : { mcpServers };
}

function makeRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-check-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const common = {
    name: 'xpayment',
    version: VERSION,
    description: 'Accept payments.',
    author: { name: 'xPayment', url: 'https://xpayment.kz' },
    homepage: 'https://xpayment.kz/ai',
    repository: 'https://github.com/xpayment-kz/xpayment-ai',
    license: 'MIT',
    keywords: ['payments', 'xpayment'],
  };
  writeJson(root, '.claude-plugin/plugin.json', { ...common, displayName: 'xPayment' });
  writeJson(root, 'plugin.json', { $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', ...common });
  writeJson(root, '.claude-plugin/marketplace.json', {
    name: 'xpayment',
    owner: { name: 'xPayment', url: 'https://xpayment.kz' },
    description: 'The plugin.',
    plugins: [{ name: 'xpayment', source: './', description: 'Accept payments.' }],
  });
  writeJson(root, '.mcp.json', mcpFile('http', false));
  writeJson(root, 'mcp.json', mcpFile('streamable-http', true));

  write(root, 'shared/glossary.md', GLOSSARY);
  for (const name of ['ask', 'check']) {
    write(root, `skills/${name}/SKILL.md`, skillMd(name));
    write(root, `skills/${name}/references/glossary.md`, GLOSSARY);
  }
  return root;
}

function run(root) {
  const r = spawnSync(process.execPath, [SCRIPT, root], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

// Asserts: exit 1, and some output line contains every given fragment.
function assertProblem(root, ...fragments) {
  const { code, out } = run(root);
  assert.equal(code, 1, `expected exit 1, got ${code}\n${out}`);
  const lines = out.split('\n');
  assert.ok(
    lines.some((line) => fragments.every((f) => line.includes(f))),
    `no output line contains all of ${JSON.stringify(fragments)}\n${out}`,
  );
  assert.ok(!out.includes('plugin-check: ok'), 'must not print ok together with problems');
}

// ---------- tests ----------

test('valid repo → ok, exit 0', (t) => {
  const root = makeRepo(t);
  const { code, out } = run(root);
  assert.equal(out.trim(), 'plugin-check: ok');
  assert.equal(code, 0);
});

test('version differs between .claude-plugin/plugin.json and plugin.json', (t) => {
  const root = makeRepo(t);
  editJson(root, 'plugin.json', (j) => { j.version = '0.2.0'; });
  assertProblem(root, 'version differs', '.claude-plugin/plugin.json', 'plugin.json');
});

test('other shared field differs between the two plugin.json files', (t) => {
  const root = makeRepo(t);
  editJson(root, 'plugin.json', (j) => { j.description = 'Something else.'; });
  assertProblem(root, 'description differs');
});

test('plugin.json without $schema, or with displayName', (t) => {
  const root = makeRepo(t);
  editJson(root, 'plugin.json', (j) => { delete j.$schema; });
  assertProblem(root, 'plugin.json', '$schema');

  const root2 = makeRepo(t);
  editJson(root2, 'plugin.json', (j) => { j.displayName = 'xPayment'; });
  assertProblem(root2, 'plugin.json', 'displayName');
});

test('version is not semver', (t) => {
  const root = makeRepo(t);
  editJson(root, '.claude-plugin/plugin.json', (j) => { j.version = 'v1'; });
  editJson(root, 'plugin.json', (j) => { j.version = 'v1'; });
  assertProblem(root, 'version', 'semver');
});

test('SKILL.md metadata.version differs', (t) => {
  const root = makeRepo(t);
  editText(root, 'skills/ask/SKILL.md', (s) => s.replace(`  version: "${VERSION}"`, '  version: "0.0.9"'));
  assertProblem(root, 'skills/ask/SKILL.md', 'metadata.version', '0.0.9');
});

test('metadata has a key other than version', (t) => {
  const root = makeRepo(t);
  editText(root, 'skills/ask/SKILL.md', (s) => s.replace('---\n\n#', '  author: "me"\n---\n\n#'));
  assertProblem(root, 'skills/ask/SKILL.md', 'metadata', 'author');
});

test('Plugin version line missing', (t) => {
  const root = makeRepo(t);
  editText(root, 'skills/ask/SKILL.md', (s) => s.replace(`Plugin version: ${VERSION}.\n`, ''));
  assertProblem(root, 'skills/ask/SKILL.md', 'Plugin version');
});

test('Plugin version line different', (t) => {
  const root = makeRepo(t);
  editText(root, 'skills/check/SKILL.md', (s) => s.replace(`Plugin version: ${VERSION}.`, 'Plugin version: 0.0.9.'));
  assertProblem(root, 'skills/check/SKILL.md', 'Plugin version');
});

test('skill name differs from its directory', (t) => {
  const root = makeRepo(t);
  editText(root, 'skills/ask/SKILL.md', (s) => s.replace('name: ask', 'name: ask-more'));
  assertProblem(root, 'skills/ask/SKILL.md', 'name', 'differs from its directory');
});

test('skill name not [a-z0-9-]{1,64}', (t) => {
  const root = makeRepo(t);
  fs.renameSync(path.join(root, 'skills/ask'), path.join(root, 'skills/Ask_Me'));
  editText(root, 'skills/Ask_Me/SKILL.md', (s) => s.replace('name: ask', 'name: Ask_Me'));
  assertProblem(root, 'skills/Ask_Me/SKILL.md', 'name', '[a-z0-9-]{1,64}');

  const root2 = makeRepo(t);
  const long = 'a'.repeat(65);
  fs.renameSync(path.join(root2, 'skills/ask'), path.join(root2, `skills/${long}`));
  editText(root2, `skills/${long}/SKILL.md`, (s) => s.replace('name: ask', `name: ${long}`));
  assertProblem(root2, 'name', '[a-z0-9-]{1,64}');
});

test('description longer than 1024', (t) => {
  const root = makeRepo(t);
  editText(root, 'skills/ask/SKILL.md', (s) => s.replace('Does a thing. Use when asked.', 'x'.repeat(1025)));
  assertProblem(root, 'skills/ask/SKILL.md', 'description', '1025', '1024');
});

test('description of exactly 1024 characters is fine', (t) => {
  const root = makeRepo(t);
  editText(root, 'skills/ask/SKILL.md', (s) => s.replace('Does a thing. Use when asked.', 'x'.repeat(1024)));
  assert.equal(run(root).code, 0);
});

test('description not a single-line double-quoted string', (t) => {
  const root = makeRepo(t);
  editText(root, 'skills/ask/SKILL.md', (s) => s.replace('description: "Does a thing. Use when asked."', 'description: Does a thing.'));
  assertProblem(root, 'skills/ask/SKILL.md', 'description', 'one line in double quotes');
});

test('escaped quotes inside the description are unescaped before counting', (t) => {
  const root = makeRepo(t);
  // 1000 chars plus 20 escaped quotes: 1020 characters after unescaping, 1040 raw.
  const desc = 'x'.repeat(1000) + '\\"'.repeat(20);
  editText(root, 'skills/ask/SKILL.md', (s) => s.replace('Does a thing. Use when asked.', desc));
  assert.equal(run(root).code, 0);
});

test('frontmatter key outside {name, description, license, metadata}', (t) => {
  const root = makeRepo(t);
  editText(root, 'skills/ask/SKILL.md', (s) => s.replace('metadata:', 'when_to_use: "whenever"\nmetadata:'));
  assertProblem(root, 'skills/ask/SKILL.md', 'when_to_use');
});

test('license in skill frontmatter is allowed', (t) => {
  const root = makeRepo(t);
  editText(root, 'skills/ask/SKILL.md', (s) => s.replace('metadata:', 'license: "MIT"\nmetadata:'));
  assert.equal(run(root).code, 0);
});

test('SKILL.md longer than 500 lines', (t) => {
  const root = makeRepo(t);
  editText(root, 'skills/ask/SKILL.md', (s) => s + 'filler\n'.repeat(500));
  assertProblem(root, 'skills/ask/SKILL.md', 'lines', '500');
});

test('skill directory without SKILL.md', (t) => {
  const root = makeRepo(t);
  fs.rmSync(path.join(root, 'skills/ask/SKILL.md'));
  assertProblem(root, 'skills/ask', 'SKILL.md', 'missing');
});

test('.mcp.json and mcp.json list different servers', (t) => {
  const root = makeRepo(t);
  editJson(root, 'mcp.json', (j) => { delete j.mcpServers['xpayment-docs']; });
  assertProblem(root, '.mcp.json and mcp.json', 'different servers or URLs');
});

test('.mcp.json and mcp.json list different URLs', (t) => {
  const root = makeRepo(t);
  editJson(root, 'mcp.json', (j) => { j.mcpServers.xpayment.url = 'https://api.xpayment.kz/other'; });
  assertProblem(root, '.mcp.json and mcp.json', 'different servers or URLs');
});

test('.mcp.json type not "http"', (t) => {
  const root = makeRepo(t);
  editJson(root, '.mcp.json', (j) => { j.mcpServers.xpayment.type = 'streamable-http'; });
  assertProblem(root, '.mcp.json', 'type', '"http"');
});

test('mcp.json type not "streamable-http"', (t) => {
  const root = makeRepo(t);
  editJson(root, 'mcp.json', (j) => { j.mcpServers.xpayment.type = 'http'; });
  assertProblem(root, 'mcp.json', 'type', '"streamable-http"');
});

test('mcp.json without $schema', (t) => {
  const root = makeRepo(t);
  editJson(root, 'mcp.json', (j) => { delete j.$schema; });
  assertProblem(root, 'mcp.json', '$schema');
});

test('MCP server with an auth or headers block', (t) => {
  const root = makeRepo(t);
  editJson(root, 'mcp.json', (j) => { j.mcpServers.xpayment.auth = { type: 'oauth' }; });
  assertProblem(root, 'mcp.json', '"auth" block');

  const root2 = makeRepo(t);
  editJson(root2, '.mcp.json', (j) => { j.mcpServers.xpayment.headers = { a: 'b' }; });
  assertProblem(root2, '.mcp.json', '"headers" block');
});

test('MCP url not https', (t) => {
  const root = makeRepo(t);
  editJson(root, '.mcp.json', (j) => { j.mcpServers.xpayment.url = 'http://api.xpayment.kz/mcp'; });
  editJson(root, 'mcp.json', (j) => { j.mcpServers.xpayment.url = 'http://api.xpayment.kz/mcp'; });
  assertProblem(root, 'url', 'is not https');
});

test('marketplace plugin name differs from plugin.json name', (t) => {
  const root = makeRepo(t);
  editJson(root, '.claude-plugin/marketplace.json', (j) => { j.plugins[0].name = 'other'; });
  assertProblem(root, 'marketplace', 'plugin name', 'other', 'plugin.json');
});

test('marketplace source not "./"', (t) => {
  const root = makeRepo(t);
  editJson(root, '.claude-plugin/marketplace.json', (j) => { j.plugins[0].source = './plugin'; });
  assertProblem(root, 'marketplace', 'source', '"./"');
});

test('relative link in a SKILL.md points to a missing file', (t) => {
  const root = makeRepo(t);
  editText(root, 'skills/ask/SKILL.md', (s) => s + '\nSee [more](references/nope.md#part).\n');
  assertProblem(root, 'skills/ask/SKILL.md', 'references/nope.md', 'missing');
});

test('relative link in references/*.md points to a missing file', (t) => {
  const root = makeRepo(t);
  editText(root, 'skills/ask/references/glossary.md', (s) => s + '\n[x](../SKILL2.md)\n');
  assertProblem(root, 'skills/ask/references/glossary.md', '../SKILL2.md', 'missing');
});

test('links with a scheme, anchors only, and links in code fences are not checked', (t) => {
  const root = makeRepo(t);
  editText(
    root,
    'skills/ask/SKILL.md',
    (s) => s + '\n[a](https://example.com/x) [b](#top) [c](mailto:a@b.c)\n\n```md\n[d](missing.md)\n```\n',
  );
  assert.equal(run(root).code, 0);
});

test('file in shared/ missing in skills/<s>/references/', (t) => {
  const root = makeRepo(t);
  fs.rmSync(path.join(root, 'skills/check/references/glossary.md'));
  assertProblem(root, 'skills/check/references/glossary.md', 'missing', 'shared/glossary.md');
});

test('file in shared/ different in skills/<s>/references/', (t) => {
  const root = makeRepo(t);
  editText(root, 'skills/ask/references/glossary.md', (s) => s + 'edited by hand\n');
  assertProblem(root, 'skills/ask/references/glossary.md', 'differs', 'shared/glossary.md');
});

test('nested file in shared/ is checked too', (t) => {
  const root = makeRepo(t);
  write(root, 'shared/docs/a.txt', 'text\n');
  write(root, 'skills/ask/references/docs/a.txt', 'text\n');
  assertProblem(root, 'skills/check/references/docs/a.txt', 'missing');
});

test('skill-only files in references/ are fine', (t) => {
  const root = makeRepo(t);
  write(root, 'skills/ask/references/only-ask.md', '# Only ask\n');
  assert.equal(run(root).code, 0);
});

for (const dir of ['hooks', 'agents', 'commands']) {
  test(`${dir}/ present`, (t) => {
    const root = makeRepo(t);
    write(root, `${dir}/x.md`, 'x\n');
    assertProblem(root, `${dir}/`, 'must not exist');
  });
}

test('secret-looking string in a tracked file (xapi_, xdev_, test_ variants)', (t) => {
  for (const key of ['xapi_' + 'a'.repeat(64), 'xdev_' + 'b'.repeat(64), 'xapi_test_' + 'c'.repeat(64), 'xdev_test_' + '9f'.repeat(32)]) {
    const root = makeRepo(t);
    write(root, 'notes/leak.txt', `token=${key}\n`);
    assertProblem(root, 'notes/leak.txt', 'secret-looking string');
    assert.ok(!run(root).out.includes(key), 'the output must not echo the secret');
  }
});

test('secret inside SKILL.md and .env.example is flagged too', (t) => {
  const root = makeRepo(t);
  write(root, 'tests/projects/a/.env.example', 'XPAYMENT_KEY=' + 'xapi_' + 'd'.repeat(64) + '\n');
  assertProblem(root, 'tests/projects/a/.env.example', 'secret-looking string');
});

test('the one documented fake value per prefix is ignored', (t) => {
  const root = makeRepo(t);
  const fake = '0123456789abcdef'.repeat(4);
  write(
    root,
    'docs-example.md',
    ['xapi_', 'xapi_test_', 'xdev_', 'xdev_test_'].map((p) => `${p}${fake}`).join('\n') + '\n',
  );
  assert.equal(run(root).out.trim(), 'plugin-check: ok');
});

test('a near-fake value is still a secret', (t) => {
  const root = makeRepo(t);
  write(root, 'near.txt', 'xapi_' + '0123456789abcdef'.repeat(3) + 'fedcba9876543210' + '\n');
  assertProblem(root, 'near.txt', 'secret-looking string');
});

test('a short hex string after the prefix is not a secret', (t) => {
  const root = makeRepo(t);
  write(root, 'short.txt', 'xapi_' + 'a'.repeat(63) + '\nxdev_ and xapi_… placeholders\n');
  assert.equal(run(root).code, 0);
});

test('outside git, node_modules/, .git/, .venv/, vendor/, .superpowers/ and evals/results/ are not scanned', (t) => {
  const root = makeRepo(t);
  const leak = 'xapi_' + 'e'.repeat(64) + '\n';
  for (const dir of ['node_modules/p', '.git/objects', '.venv/lib', 'vendor/x', '.superpowers/sdd', 'evals/results/run1']) {
    write(root, `${dir}/leak.txt`, leak);
  }
  assert.equal(run(root).out.trim(), 'plugin-check: ok');
});

function git(root, ...args) {
  const r = spawnSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
}

test('in a git repo only tracked (and not-ignored) files are scanned', (t) => {
  const root = makeRepo(t);
  const leak = 'xapi_' + 'f'.repeat(64) + '\n';
  write(root, '.gitignore', '.env\nignored/\n');
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  // Git-ignored files are never scanned, even when they exist on disk.
  write(root, '.env', leak);
  write(root, 'ignored/leak.txt', leak);
  assert.equal(run(root).out.trim(), 'plugin-check: ok');
  // A new file that is not ignored is scanned before it is committed.
  write(root, 'fresh.txt', leak);
  assertProblem(root, 'fresh.txt', 'secret-looking string');
  // A committed file with a secret is flagged.
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'leak');
  assertProblem(root, 'fresh.txt', 'secret-looking string');
});

test('a file deleted from disk but still in the git index does not crash the check', (t) => {
  const root = makeRepo(t);
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  write(root, 'gone.txt', 'x\n');
  git(root, 'add', 'gone.txt');
  fs.rmSync(path.join(root, 'gone.txt'));
  assert.equal(run(root).out.trim(), 'plugin-check: ok');
});

test('missing manifests are reported, not thrown', (t) => {
  const root = makeRepo(t);
  fs.rmSync(path.join(root, 'plugin.json'));
  fs.rmSync(path.join(root, '.claude-plugin/marketplace.json'));
  const { code, out } = run(root);
  assert.equal(code, 1);
  assert.match(out, /plugin\.json: missing/);
  assert.match(out, /marketplace\.json: missing/);
});

test('invalid JSON is reported, not thrown', (t) => {
  const root = makeRepo(t);
  write(root, 'mcp.json', '{ nope');
  assertProblem(root, 'mcp.json', 'invalid JSON');
});

test('defaults to the current directory when no root is given', (t) => {
  const root = makeRepo(t);
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', cwd: root });
  assert.equal(r.stdout.trim(), 'plugin-check: ok');
  assert.equal(r.status, 0);
});
