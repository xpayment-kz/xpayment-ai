#!/usr/bin/env node
// check-report: which of the expected XP-* codes did an AI report mention?
//
//   node tests/acceptance/check-report.mjs <report.txt> tests/expected/broken-python.json
//
// A code counts when the report holds it in square brackets: [XP-C03]. The expected file is
// [{"code": "XP-C01", "file": "...", "hint": "..."}, ...]. Exit 0 when every expected code is
// found, 1 when some are missing (they are named), 2 on a usage error. Codes found in the report
// that are not expected are listed, they never fail the check. Node 22, no dependencies.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CODE_RE = /\[(XP-[CA]\d{2})\]/g;

export function checkReport(reportText, expectedCodes) {
  const found = new Set([...reportText.matchAll(CODE_RE)].map((m) => m[1]));
  return {
    found: expectedCodes.filter((c) => found.has(c)),
    missing: expectedCodes.filter((c) => !found.has(c)),
    unexpected: [...found].filter((c) => !expectedCodes.includes(c)).sort(),
  };
}

function isMain() {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const [reportPath, expectedPath] = process.argv.slice(2);
  if (!reportPath || !expectedPath) {
    console.error('usage: node tests/acceptance/check-report.mjs <report.txt> <expected.json>');
    process.exit(2);
  }
  let reportText;
  let expected;
  try {
    reportText = fs.readFileSync(path.resolve(reportPath), 'utf8');
    expected = JSON.parse(fs.readFileSync(path.resolve(expectedPath), 'utf8'));
  } catch (err) {
    console.error(`check-report: ${err.message}`);
    process.exit(2);
  }
  if (!Array.isArray(expected) || expected.some((e) => typeof e?.code !== 'string')) {
    console.error('check-report: the expected file must be a JSON array of {"code": ...}');
    process.exit(2);
  }
  const codes = expected.map((e) => e.code);
  const { found, missing, unexpected } = checkReport(reportText, codes);
  console.log(`check-report: ${found.length} of ${codes.length} expected codes found`);
  if (found.length) console.log(`found: ${found.join(', ')}`);
  if (missing.length) {
    console.log(`missing: ${missing.join(', ')}`);
    for (const code of missing) {
      const e = expected.find((x) => x.code === code);
      if (e.file) console.log(`  ${code} is in ${e.file}${e.hint ? `: ${e.hint}` : ''}`);
    }
  }
  if (unexpected.length) console.log(`not expected: ${unexpected.join(', ')}`);
  process.exitCode = missing.length ? 1 : 0;
}
