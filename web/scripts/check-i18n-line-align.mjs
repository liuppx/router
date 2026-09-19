#!/usr/bin/env node
// Verify zh/en translation files stay line-aligned by extracting key paths
// (stripping their values) and diffing the two lists. A mismatch means the
// i18next loader would silently fall back to the key string for any code
// path the user touches, so we fail the build.
import { readFileSync } from 'node:fs';

const extractKeys = (path) => {
  const src = readFileSync(path, 'utf8');
  const lines = src.split('\n');
  const stack = [];
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // Track indentation-driven object depth.
    const indent = line.match(/^(\s*)/)[1].length;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const keyMatch = line.match(/^\s*"([^"\\]+)"\s*:/);
    if (!keyMatch) continue;
    const key = keyMatch[1];
    const suffix = line.slice(line.indexOf(':') + 1).trim();
    const pathSoFar = [...stack.map((s) => s.key), key].join('.');
    out.push({ line: i + 1, path: pathSoFar, opensObject: suffix.startsWith('{') });
    if (suffix.startsWith('{')) stack.push({ indent, key });
  }
  return out;
};

const zh = extractKeys(new URL('../src/locales/zh/translation.json', import.meta.url).pathname);
const en = extractKeys(new URL('../src/locales/en/translation.json', import.meta.url).pathname);
if (zh.length !== en.length) {
  console.error(`mismatch: zh has ${zh.length} keys, en has ${en.length}`);
  const set = new Map();
  for (const k of zh) set.set(k.path, (set.get(k.path) || 0) + 1);
  for (const k of en) set.set(k.path, (set.get(k.path) || 0) - 1);
  const missingInZh = [];
  const missingInEn = [];
  for (const [path, balance] of set.entries()) {
    if (balance < 0) missingInZh.push(path);
    else if (balance > 0) missingInEn.push(path);
  }
  if (missingInZh.length) {
    console.error(`Keys present in en but missing in zh (${missingInZh.length}):`);
    for (const path of missingInZh.slice(0, 20)) console.error(`  + ${path}`);
  }
  if (missingInEn.length) {
    console.error(`Keys present in zh but missing in en (${missingInEn.length}):`);
    for (const path of missingInEn.slice(0, 20)) console.error(`  - ${path}`);
  }
  process.exit(1);
}
const diffs = [];
for (let i = 0; i < zh.length; i += 1) {
  if (zh[i].path !== en[i].path) {
    diffs.push({ line: i + 1, zh: zh[i], en: en[i] });
  }
}
if (diffs.length === 0) {
  console.log(`i18n line-align: ${zh.length} keys in sync`);
} else {
  console.error(`i18n line-align: ${diffs.length} mismatches`);
  for (const d of diffs.slice(0, 20)) {
    console.error(`  #${d.line}  zh=${d.zh.path}  en=${d.en.path}`);
  }
  process.exit(1);
}