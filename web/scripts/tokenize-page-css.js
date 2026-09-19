// One-off tokenization script. Maps known hex swatches to var(--router-...) with
// the original hex as fallback. Safe to run repeatedly (idempotent). Run from
// web/: `node ../scripts/tokenize-page-css.js` (or invoke directly).
const fs = require('fs');
const path = require('path');

// Single source of truth — must match applyChartThemeToDocument() in
// router-ui/theme/charts.js. The fallback hex is what was on disk before
// this script ran, so visual output is byte-identical until theme flips.
const TOKENS = [
  // ink
  ['#0f172a', '--router-text-primary'],
  ['#1f2937', '--router-text-primary'],
  ['#111827', '--router-text-primary'],
  ['#24324a', '--router-text-secondary'],
  ['#334155', '--router-text-secondary'],
  ['#374151', '--router-text-secondary'],
  ['#475569', '--router-text-secondary'],
  ['#64748b', '--router-text-muted'],
  ['#94a3b8', '--router-text-muted'],
  ['#a3aed0', '--router-text-muted'],
  ['#6b7280', '--router-text-muted'],
  // surface
  ['#ffffff', '--router-surface'],
  ['#fff', '--router-surface'],
  ['#f8fafc', '--router-surface-muted'],
  ['#f9fafb', '--router-surface-muted'],
  ['#fafbfc', '--router-surface-muted'],
  ['#f7f9fb', '--router-surface-muted'],
  ['#f1f5ff', '--router-surface-info'],
  // link / primary
  ['#2563eb', '--router-link'],
  // status
  ['#16a34a', '--router-status-success'],
  ['#15803d', '--router-status-success'],
  ['#21ba45', '--router-status-success'],
  ['#f59e0b', '--router-status-warning'],
  ['#b45309', '--router-status-warning'],
  ['#d97706', '--router-status-warning'],
  ['#dc2626', '--router-status-danger'],
  ['#ef4444', '--router-status-danger'],
  ['#db2828', '--router-status-danger'],
  ['#9333ea', '--router-status-info'],
  ['#0891b2', '--router-status-info'],
  // accent / link-hover / indigo family
  ['#2b3674', '--router-accent-strong'],
  ['#4338ca', '--router-accent-strong'],
  ['#1d4ed8', '--router-link-hover'],
  ['#1e40af', '--router-link-hover'],
  ['#eff6ff', '--router-surface-info-strong'],
  ['#eef2ff', '--router-surface-info-strong'],
  ['#e2e8f0', '--router-surface-chip'],
];

const files = [
  'src/pages/AdminDashboard/AdminDashboard.css',
  'src/pages/BillingPricingAnalysis/BillingPricingAnalysis.css',
  'src/pages/BillingProcurementReport/BillingProcurementReport.css',
];

let touched = 0;
for (const file of files) {
  const abs = path.resolve(process.cwd(), file);
  if (!fs.existsSync(abs)) {
    console.log(`skip (not found): ${file}`);
    continue;
  }
  let content = fs.readFileSync(abs, 'utf8');
  const original = content;
  for (const [hex, varName] of TOKENS) {
    // Word-boundary case-insensitive replace. Preserves trailing semicolon.
    const re = new RegExp(hex.replace('#', '#'), 'gi');
    content = content.replace(re, (match) =>
      `var(${varName}, ${match.toLowerCase()})`
    );
  }
  if (content !== original) {
    fs.writeFileSync(abs, content);
    touched += 1;
    console.log(`updated: ${file}`);
  } else {
    console.log(`no change: ${file}`);
  }
}
console.log(`done. ${touched} file(s) updated.`);