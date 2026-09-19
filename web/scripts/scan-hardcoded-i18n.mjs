#!/usr/bin/env node
// Audit hardcoded user-facing Chinese in JS/JSX files.
// Flags three classes of leak:
//   1. JSX text nodes that contain CJK characters (the >...< pattern)
//   2. JSX attribute strings (placeholder, title, alt, aria-label, tooltip) that contain CJK
//   3. JS string literals that look like user-facing copy (short, in
//      toast/notify/message/notice call sites)
// Excludes:
//   - The locales/ directory (translation source of truth)
//   - The assets/ directory (HTML / SVG content)
//   - Comments (lines that look like `// ...` or `/* ... */`)
//
// The script prints a report grouped by file and counts only — no
// auto-fix. Auto-replacing human copy with t() calls would require a
// key-naming scheme we don't have yet.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../src', import.meta.url).pathname;
const CJK = /[㐀-鿿]/;
const CJK_CLASS = '[一-鿿]';

const TEXT_NODE = new RegExp(`>[^<{]*${CJK_CLASS}[^<{]*<`);
const ATTR_NAMES = ['placeholder', 'title', 'alt', 'aria-label', 'tooltip'];
const QUOTE_NAMES = ['showError', 'showInfo', 'showSuccess', 'showNotice', 'notify.error', 'notify.success'];
const SKIP_DIRS = new Set(['locales', 'assets', 'node_modules']);
const SKIP_FILE_PATTERNS = [
  /HelpDoc\//, // help docs ship in source language, not localized
  /constants\/channel\.constants/, // vendor-specific copy
  /ChannelForm\.jsx/, // 5687-line channel form; placeholder copy is vendor-driven
];

function shouldSkipFile(file) {
  return SKIP_FILE_PATTERNS.some((pattern) => pattern.test(file));
}

// Files that opt out via a top-of-file `/* i18n-skip */` directive. This is
// for one-off pages the product has accepted as Chinese-only (e.g. the
// operator-only wallet playground).
function hasI18nSkipDirective(content) {
  return /\/\*\s*i18n-skip\s*\*\//.test(content);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(jsx?|tsx?)$/.test(name)) out.push(full);
  }
  return out;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function findLeaks(content) {
  const findings = [];
  const lines = stripComments(content).split('\n');
  lines.forEach((line, idx) => {
    if (!CJK.test(line)) return;
    if (TEXT_NODE.test(line)) findings.push({ kind: 'text', line: idx + 1, snippet: line.trim() });
    for (const attr of ATTR_NAMES) {
      const re = new RegExp(`\\b${attr}=(['"\`])([^'"\\\`]*${CJK_CLASS}[^'"\\\`]*)\\1`);
      const m = line.match(re);
      if (m) findings.push({ kind: `attr:${attr}`, line: idx + 1, snippet: line.trim() });
    }
    for (const fn of QUOTE_NAMES) {
      const re = new RegExp(`\\b${fn.replace('.', '\\.')}\\(\\s*(['"\`])([^'"\\\`]*${CJK_CLASS}[^'"\\\`]*)\\1`);
      const m = line.match(re);
      if (m) findings.push({ kind: `call:${fn}`, line: idx + 1, snippet: line.trim() });
    }
  });
  return findings;
}

const files = walk(ROOT);
const report = [];
let totalLeaks = 0;
for (const file of files) {
  const rel = relative(ROOT, file);
  if (shouldSkipFile(rel)) continue;
  const content = readFileSync(file, 'utf8');
  if (hasI18nSkipDirective(content)) continue;
  const leaks = findLeaks(content);
  if (leaks.length === 0) continue;
  report.push({ file: rel, leaks });
  totalLeaks += leaks.length;
}

report.sort((a, b) => b.leaks.length - a.leaks.length);
console.log(`# i18n hardcoded-CJK audit — ${totalLeaks} findings across ${report.length} files`);
console.log('');
for (const entry of report) {
  console.log(`## ${entry.file} (${entry.leaks.length})`);
  for (const leak of entry.leaks.slice(0, 6)) {
    console.log(`  L${leak.line} [${leak.kind}] ${leak.snippet.slice(0, 100)}`);
  }
  if (entry.leaks.length > 6) console.log(`  ... and ${entry.leaks.length - 6} more`);
  console.log('');
}