// Tests for scripts/sync.mjs.
// Each test builds a small repository in a temp dir and runs sync.mjs as a subprocess.
// The --docs tests talk to a local node:http server standing in for xpayment.kz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sync.mjs');

// ---------- fixtures ----------

function write(root, rel, content) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function skillMd(name) {
  return [
    '---',
    `name: ${name}`,
    'description: "Says: version: 0.1.0 is in the text. Use when asked."',
    'metadata:',
    '  version: "0.1.0"',
    '---',
    '',
    `# ${name}`,
    '',
    'Plugin version: 0.1.0.',
    '',
    'Body text with a version: "0.1.0" mention.',
    '',
  ].join('\n');
}

const CLAUDE_PLUGIN = `{
  "name": "xpayment",
  "displayName": "xPayment",
  "version": "0.1.0",
  "description": "Accept payments.",
  "keywords": ["payments", "xpayment"]
}
`;
const PORTABLE_PLUGIN = `{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "xpayment",
  "version": "0.1.0",
  "description": "Accept payments.",
  "keywords": ["payments", "xpayment"]
}
`;
const MARKETPLACE = '{"name":"xpayment","owner":{"name":"xPayment"},"plugins":[{"name":"xpayment","source":"./"}]}\n';

function makeRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, '.claude-plugin/plugin.json', CLAUDE_PLUGIN);
  write(root, 'plugin.json', PORTABLE_PLUGIN);
  write(root, '.claude-plugin/marketplace.json', MARKETPLACE);
  for (const name of ['ask', 'check']) write(root, `skills/${name}/SKILL.md`, skillMd(name));
  write(root, 'skills/ask/references/only-ask.md', '# only in ask\n');
  write(root, 'shared/glossary.md', '# Glossary\n');
  write(root, 'shared/api/v2/errors.md', '# Errors\n');
  return root;
}

/** path → content for every file under root. */
function snapshot(root, rel = '') {
  const out = {};
  for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(out, snapshot(root, entryRel));
    else out[entryRel] = fs.readFileSync(path.join(root, entryRel), 'utf8');
  }
  return out;
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out }));
  });
}

/** routes: { '/path': [status, body] } */
async function serve(t, routes) {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    const [status, body] = routes[req.url] ?? [404, 'not found'];
    res.writeHead(status, { 'content-type': 'text/plain' });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  return { base: `http://127.0.0.1:${server.address().port}`, hits };
}

const MANIFEST = JSON.stringify({ docs_updated_at: '2025-03-17', plugin: { min_version: '0.1.0', latest_version: '0.1.0' } });
const LLMS = '# xPayment docs\n\nEverything about payments.\n';

// ---------- shared/ → references/ ----------

test('copies every file of shared/ (recursively) into each skills/*/references/, keeps skill-only files, removes nothing', async (t) => {
  const root = makeRepo(t);
  const before = snapshot(root);
  const { code, out } = await run([root]);
  assert.equal(code, 0, out);

  for (const skill of ['ask', 'check']) {
    assert.equal(read(root, `skills/${skill}/references/glossary.md`), '# Glossary\n');
    assert.equal(read(root, `skills/${skill}/references/api/v2/errors.md`), '# Errors\n');
  }
  // Nothing removed or changed apart from the new copies.
  const after = snapshot(root);
  for (const [file, content] of Object.entries(before)) assert.equal(after[file], content, `${file} changed`);
  assert.equal(read(root, 'skills/ask/references/only-ask.md'), '# only in ask\n');
  assert.equal(Object.keys(after).length, Object.keys(before).length + 4);
});

test('overwrites a stale copy and is idempotent', async (t) => {
  const root = makeRepo(t);
  write(root, 'skills/check/references/glossary.md', '# Old\n');
  assert.equal((await run([root])).code, 0);
  assert.equal(read(root, 'skills/check/references/glossary.md'), '# Glossary\n');
  const first = snapshot(root);
  assert.equal((await run([root])).code, 0);
  assert.deepEqual(snapshot(root), first);
});

test('files in skills/ that are not skill directories are ignored', async (t) => {
  const root = makeRepo(t);
  write(root, 'skills/.DS_Store', 'x');
  assert.equal((await run([root])).code, 0);
  assert.equal(fs.existsSync(path.join(root, 'skills/.DS_Store/references')), false);
});

test('works without a shared/ directory', async (t) => {
  const root = makeRepo(t);
  fs.rmSync(path.join(root, 'shared'), { recursive: true });
  assert.equal((await run([root])).code, 0);
});

test('defaults to the current directory when no root is given', async (t) => {
  const root = makeRepo(t);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT], { cwd: root, stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', (code) => { assert.equal(code, 0); resolve(); });
  });
  assert.equal(read(root, 'skills/ask/references/glossary.md'), '# Glossary\n');
});

test('unknown option → exit 2, nothing changed', async (t) => {
  const root = makeRepo(t);
  const before = snapshot(root);
  const { code, out } = await run(['--nope', root]);
  assert.equal(code, 2);
  assert.match(out, /usage/i);
  assert.deepEqual(snapshot(root), before);
});

// ---------- --version ----------

test('--version 1.2.3 sets the version in both plugin.json files, every SKILL.md metadata.version and Plugin version line', async (t) => {
  const root = makeRepo(t);
  const { code, out } = await run(['--version', '1.2.3', root]);
  assert.equal(code, 0, out);

  assert.equal(JSON.parse(read(root, '.claude-plugin/plugin.json')).version, '1.2.3');
  assert.equal(JSON.parse(read(root, 'plugin.json')).version, '1.2.3');
  // Formatting is preserved: only the version string changed.
  assert.equal(read(root, '.claude-plugin/plugin.json'), CLAUDE_PLUGIN.replace('"0.1.0"', '"1.2.3"'));
  assert.equal(read(root, 'plugin.json'), PORTABLE_PLUGIN.replace('"0.1.0"', '"1.2.3"'));

  for (const skill of ['ask', 'check']) {
    const text = read(root, `skills/${skill}/SKILL.md`);
    assert.equal(
      text,
      skillMd(skill).replace('  version: "0.1.0"', '  version: "1.2.3"').replace('Plugin version: 0.1.0.', 'Plugin version: 1.2.3.'),
    );
  }
  // The marketplace carries no version and is not touched.
  assert.equal(read(root, '.claude-plugin/marketplace.json'), MARKETPLACE);
});

test('--version also reaches skills synced from shared/ (nothing there carries a version)', async (t) => {
  const root = makeRepo(t);
  assert.equal((await run(['--version', '2.0.0', root])).code, 0);
  assert.equal(read(root, 'skills/ask/references/glossary.md'), '# Glossary\n');
});

test('--version with a value that is not X.Y.Z → exit 2, nothing changed', async (t) => {
  const root = makeRepo(t);
  const before = snapshot(root);
  for (const bad of ['1.2', 'v1.2.3', '1.2.3-beta', '']) {
    const { code, out } = await run(['--version', bad, root]);
    assert.equal(code, 2, out);
    assert.deepEqual(snapshot(root), before);
  }
  assert.equal((await run(['--version'])).code, 2);
});

test('--version with a plugin.json that cannot be updated → exit 1, nothing changed', async (t) => {
  const root = makeRepo(t);
  write(root, 'plugin.json', '{ "name": "xpayment" }\n');
  const before = snapshot(root);
  const { code, out } = await run(['--version', '1.2.3', root]);
  assert.equal(code, 1, out);
  assert.match(out, /plugin\.json/);
  assert.deepEqual(snapshot(root), before);
});

// ---------- --docs ----------

test('--docs fetches /ai/manifest.json and /llms-full.txt from --docs-base into shared/docs/ and writes shared/docs/SNAPSHOT.md', async (t) => {
  const root = makeRepo(t);
  const server = await serve(t, { '/ai/manifest.json': [200, MANIFEST], '/llms-full.txt': [200, LLMS] });
  const dayBefore = new Date().toISOString().slice(0, 10);
  const { code, out } = await run(['--docs', '--docs-base', server.base, root]);
  const dayAfter = new Date().toISOString().slice(0, 10);
  assert.equal(code, 0, out);

  assert.deepEqual([...server.hits].sort(), ['/ai/manifest.json', '/llms-full.txt']);
  assert.equal(read(root, 'shared/docs/manifest.json'), MANIFEST);
  assert.equal(read(root, 'shared/docs/llms-full.txt'), LLMS);
  const snapshotMd = read(root, 'shared/docs/SNAPSHOT.md');
  assert.match(snapshotMd, /^# /);
  assert.ok(snapshotMd.includes('docs_updated_at: 2025-03-17'), 'docs_updated_at of the manifest');
  assert.ok(snapshotMd.includes(dayBefore) || snapshotMd.includes(dayAfter), 'UTC date of the download');
  assert.match(snapshotMd, /\b\d{4}-\d{2}-\d{2}\b/);

  // The fresh snapshot is synced to every skill in the same run.
  for (const skill of ['ask', 'check']) {
    assert.equal(read(root, `skills/${skill}/references/docs/llms-full.txt`), LLMS);
    assert.equal(read(root, `skills/${skill}/references/docs/SNAPSHOT.md`), snapshotMd);
    assert.equal(read(root, `skills/${skill}/references/docs/manifest.json`), MANIFEST);
  }
});

test('--docs-base with a trailing slash and --docs-base=URL both work', async (t) => {
  const root = makeRepo(t);
  const server = await serve(t, { '/ai/manifest.json': [200, MANIFEST], '/llms-full.txt': [200, LLMS] });
  assert.equal((await run(['--docs', `--docs-base=${server.base}/`, root])).code, 0);
  assert.equal(read(root, 'shared/docs/llms-full.txt'), LLMS);
});

test('the default --docs-base is https://xpayment.kz', async () => {
  const { DEFAULT_DOCS_BASE } = await import('./sync.mjs');
  assert.equal(DEFAULT_DOCS_BASE, 'https://xpayment.kz');
});

const BAD_DOCS = {
  'llms-full.txt is 404': { '/ai/manifest.json': [200, MANIFEST], '/llms-full.txt': [404, 'nope'] },
  'manifest is 500': { '/ai/manifest.json': [500, 'boom'], '/llms-full.txt': [200, LLMS] },
  'manifest is not JSON': { '/ai/manifest.json': [200, '<html>hi</html>'], '/llms-full.txt': [200, LLMS] },
  'manifest is JSON without docs_updated_at': { '/ai/manifest.json': [200, '{"plugin":{}}'], '/llms-full.txt': [200, LLMS] },
  'llms-full.txt is empty': { '/ai/manifest.json': [200, MANIFEST], '/llms-full.txt': [200, ''] },
};

for (const [title, routes] of Object.entries(BAD_DOCS)) {
  test(`--docs fails and changes nothing when ${title}`, async (t) => {
    const root = makeRepo(t);
    // A previous good snapshot and a stale reference copy must survive untouched,
    // and the shared/ → references/ copy must not run either.
    write(root, 'shared/docs/llms-full.txt', 'previous snapshot\n');
    write(root, 'shared/docs/SNAPSHOT.md', '# previous\n');
    const before = snapshot(root);
    const server = await serve(t, routes);
    const { code, out } = await run(['--docs', '--docs-base', server.base, '--version', '9.9.9', root]);
    assert.equal(code, 1, out);
    assert.match(out, /docs/i);
    assert.deepEqual(snapshot(root), before);
  });
}

test('--docs fails and changes nothing when the server is unreachable', async (t) => {
  const root = makeRepo(t);
  // Reserve a port, release it, and point at it: connection refused.
  const probe = http.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const dead = `http://127.0.0.1:${probe.address().port}`;
  await new Promise((resolve) => probe.close(resolve));
  const before = snapshot(root);
  const { code, out } = await run(['--docs', '--docs-base', dead, root]);
  assert.equal(code, 1, out);
  assert.deepEqual(snapshot(root), before);
});
