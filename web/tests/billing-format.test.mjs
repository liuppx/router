// Tests for the cross-page billing format helpers. These guard against
// regressions in decimal-place conventions — CSV exports used to hardcode
// `(v) => Number(v).toFixed(2)` in three pages, with no shared constant. Now
// every financial CSV column goes through one of these helpers.

import assert from 'node:assert/strict';

const charts = await import('../src/router-ui/theme/charts.js');

const {
  BILLING_DECIMALS,
  BILLING_PERCENT_DECIMALS,
  CSV_DECIMALS,
  CSV_PERCENT_DECIMALS,
  formatCnyFixed,
  formatBillingPercent,
  formatCsvCurrency,
  formatCsvPercent,
} = charts;

assert.equal(BILLING_DECIMALS, 4, 'BILLING_DECIMALS = 4 for in-page finance tables');
assert.equal(BILLING_PERCENT_DECIMALS, 1, 'BILLING_PERCENT_DECIMALS = 1 for finance percentages');
assert.equal(CSV_DECIMALS, 2, 'CSV_DECIMALS = 2 for spreadsheet readability');
assert.equal(CSV_PERCENT_DECIMALS, 2, 'CSV_PERCENT_DECIMALS = 2 for spreadsheet percentages');

// formatCnyFixed — currency symbol prefix, 4 fractional digits.
assert.equal(formatCnyFixed(0), '¥0.0000');
assert.equal(formatCnyFixed(12.3), '¥12.3000');
assert.equal(formatCnyFixed(12.34567), '¥12.3457');
assert.equal(formatCnyFixed(12.34543), '¥12.3454', 'rounds half-to-even at 5th decimal');
assert.equal(formatCnyFixed(NaN), '¥0.0000');
assert.equal(formatCnyFixed(null), '¥0.0000');
assert.equal(formatCnyFixed('not a number'), '¥0.0000');
assert.equal(formatCnyFixed(-5.5), '¥-5.5000');
assert.equal(formatCnyFixed(12.3, 2), '¥12.30', 'override decimals');

// formatBillingPercent — accepts 0-1 fraction or >1 number, 1 fractional digit.
assert.equal(formatBillingPercent(0.1234), '12.3%');
assert.equal(formatBillingPercent(0.1), '10.0%');
assert.equal(formatBillingPercent(0.5), '50.0%');
assert.equal(formatBillingPercent(50), '50.0%', 'treats >1 values as already-percent');
assert.equal(formatBillingPercent(0), '0.0%');
assert.equal(formatBillingPercent(NaN), '0.0%');
assert.equal(formatBillingPercent(null), '0.0%');
assert.equal(formatBillingPercent(0.1234, 2), '12.34%', 'override decimals');

// formatCsvCurrency — no currency symbol so Excel auto-detects numeric type.
assert.equal(formatCsvCurrency(0), '0.00');
assert.equal(formatCsvCurrency(12.345), '12.35');
assert.equal(formatCsvCurrency(12.34567), '12.35', 'rounds to 2 decimals');
assert.equal(formatCsvCurrency(-5.5), '-5.50', 'negative sign preserved');
assert.equal(formatCsvCurrency(NaN), '0.00');
assert.equal(formatCsvCurrency(null), '0.00');
assert.equal(formatCsvCurrency('garbage'), '0.00');
assert.equal(formatCsvCurrency(12.3, 4), '12.3000', 'override decimals');

// formatCsvPercent — same shape as formatBillingPercent but 2 decimals and
// trailing % sign so Excel reads it as a percent string.
assert.equal(formatCsvPercent(0.1234), '12.34%');
assert.equal(formatCsvPercent(0.5), '50.00%');
assert.equal(formatCsvPercent(0), '0.00%');
assert.equal(formatCsvPercent(50), '50.00%', 'treats >1 values as already-percent');
assert.equal(formatCsvPercent(-0.1), '-10.00%', 'negative percent for losses');
assert.equal(formatCsvPercent(NaN), '0.00%');
assert.equal(formatCsvPercent(null), '0.00%');

// Decimal-place invariant: the on-page table is always wider than the CSV
// export, so operators who care about precision can read it on the page and
// the CSV stays scannable.
assert.ok(BILLING_DECIMALS > CSV_DECIMALS, 'in-page currency has more decimals than CSV');
assert.ok(BILLING_PERCENT_DECIMALS <= CSV_PERCENT_DECIMALS, 'CSV percent at least as wide as in-page');

console.log('ok billing-format tests passed');