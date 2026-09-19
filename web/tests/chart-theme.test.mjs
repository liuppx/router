import assert from 'node:assert/strict';
import {
  BILLING_DECIMALS,
  BILLING_PERCENT_DECIMALS,
  applyChartThemeToDocument,
  chartAxisStyle,
  chartCategoricalPalette,
  chartGridStyle,
  chartNeutralColor,
  chartPalette,
  chartStatusPalette,
  chartTooltipItemStyle,
  chartTooltipLabelStyle,
  chartTooltipStyle,
  colorForKey,
  formatBillingPercent,
  formatCnyChart,
  formatCnyFixed,
  formatCurrencyCompact,
  formatIntChart,
  formatPercentChart,
  formatUsdChart,
  getActiveChartTheme,
} from '../src/router-ui/theme/charts.js';

// --- Palette structure ----------------------------------------------------

function testCategoricalPaletteHasFiveValidatedSlots() {
  assert.equal(
    chartCategoricalPalette.length,
    5,
    'categorical palette must stay at 5 hues — adding more is wrong (fold into small multiples)',
  );
  for (const hex of chartCategoricalPalette) {
    assert.match(hex, /^#[0-9a-f]{6}$/i, `categorical hue ${hex} must be 6-digit hex`);
  }
}

function testStatusPaletteCoversFourSeveritySlots() {
  const expected = ['danger', 'warning', 'success', 'info'];
  for (const key of expected) {
    assert.ok(chartStatusPalette[key], `status slot missing: ${key}`);
    assert.match(chartStatusPalette[key], /^#[0-9a-f]{6}$/i);
  }
  // danger and warning must be visually distinct — recharts/print users need
  // to be able to tell a warning row from a critical one without a legend.
  assert.notEqual(
    chartStatusPalette.danger,
    chartStatusPalette.warning,
    'danger and warning must not collapse to the same hue',
  );
}

function testBackcompatPaletteMapsToValidatedTokens() {
  // Every legacy chartPalette.* key still used by callers must resolve to
  // either a categorical or status hue (no orphan colors).
  for (const [key, value] of Object.entries(chartPalette)) {
    assert.match(value, /^#[0-9a-f]{6}$/i, `chartPalette.${key} must be a valid hex`);
  }
  assert.equal(chartPalette.primary, chartCategoricalPalette[0]);
  assert.equal(chartPalette.revenue, chartCategoricalPalette[0]);
  assert.equal(chartPalette.profit, chartStatusPalette.success);
}

// --- Theme-aware helpers ---------------------------------------------------

function testChartAxisStyleReadsFromActiveTheme() {
  const theme = getActiveChartTheme();
  const style = chartAxisStyle(theme);
  assert.deepEqual(style.axisLine, { stroke: 'transparent' });
  assert.equal(style.tickLine, false);
  assert.equal(style.tick.fill, theme.textMuted);
  assert.equal(style.tick.fontSize, 12);
}

function testChartTooltipStyleUsesSurfaceNotWhite() {
  // The G.2 bug — tooltips hardcoded `#fff`, then went black in dark mode.
  // The helper must consume theme.surface so flipping the theme flips the
  // tooltip background in lockstep.
  const theme = getActiveChartTheme();
  const style = chartTooltipStyle(theme);
  assert.equal(style.background, theme.surface);
  assert.notEqual(style.background, '#fff');
  assert.ok(style.border.includes(theme.border));
}

function testChartTooltipLabelAndItemStylesCarryInk() {
  const theme = getActiveChartTheme();
  assert.equal(chartTooltipLabelStyle(theme).color, theme.textSecondary);
  assert.equal(chartTooltipItemStyle(theme).color, theme.textPrimary);
}

function testChartGridStyleUsesThemeGridColor() {
  const theme = getActiveChartTheme();
  assert.equal(chartGridStyle(theme).stroke, theme.grid);
}

function testChartNeutralColorReturnsMutedInk() {
  const theme = getActiveChartTheme();
  assert.equal(chartNeutralColor(theme), theme.textMuted);
}

// --- colorForKey stability ------------------------------------------------

function testColorForKeyIsStableForTheSameKey() {
  const a = colorForKey('openai');
  const b = colorForKey('openai');
  const c = colorForKey('anthropic');
  assert.equal(a, b, 'same key must always map to the same color');
  assert.match(a, /^#[0-9a-f]{6}$/i);
  assert.match(c, /^#[0-9a-f]{6}$/i);
}

function testColorForKeyFallsBackOnEmpty() {
  const fallback = colorForKey('');
  assert.match(fallback, /^#[0-9a-f]{6}$/i);
}

function testColorForKeyHandlesNonStringInput() {
  assert.doesNotThrow(() => colorForKey(null));
  assert.doesNotThrow(() => colorForKey(undefined));
  assert.match(colorForKey(42), /^#[0-9a-f]{6}$/i);
}

// --- Formatters ------------------------------------------------------------

function testFormatCurrencyCompactHandlesEachSupportedCurrency() {
  assert.equal(formatCurrencyCompact(0, 'USD'), '$0.00');
  assert.equal(formatCurrencyCompact(12.5, 'USD'), '$12.50');
  assert.equal(formatCurrencyCompact(0, 'CNY'), '¥0.00');
  assert.equal(formatCurrencyCompact(99.9, 'CNY'), '¥99.90');
  assert.equal(formatCurrencyCompact(42, 'EUR'), '42.00');
}

function testFormatCurrencyCompactGuardsAgainstNaN() {
  assert.equal(formatCurrencyCompact(NaN, 'USD'), '0');
  assert.equal(formatCurrencyCompact(undefined, 'CNY'), '0');
  assert.equal(formatCurrencyCompact('not-a-number', 'USD'), '0');
}

function testUsdAndCnyCurrencyHelpers() {
  assert.equal(formatUsdChart(1.5), '$1.50');
  assert.equal(formatCnyChart(1.5), '¥1.50');
}

function testFormatIntChartRoundsAndGroups() {
  assert.equal(formatIntChart(1234.56), '1,235');
  assert.equal(formatIntChart(0), '0');
  assert.equal(formatIntChart(NaN), '0');
}

function testFormatPercentChartAcceptsFractionOrAlreadyPercent() {
  assert.equal(formatPercentChart(0.123), '12.3%');
  assert.equal(formatPercentChart(45), '45.0%');
  assert.equal(formatPercentChart(NaN), '0.0%');
}

function testBillingConstantsAndFixedHelpers() {
  assert.equal(BILLING_DECIMALS, 4, 'procurement/finance pages render at 4 fractional digits');
  assert.equal(
    BILLING_PERCENT_DECIMALS,
    1,
    'procurement/pricing percentages share one decimal place (legacy overview converged)',
  );
  assert.equal(formatCnyFixed(1.234567), '¥1.2346');
  assert.equal(formatCnyFixed(1.234567, 2), '¥1.23');
  assert.equal(formatCnyFixed(NaN), '¥0.0000');
  assert.equal(formatBillingPercent(0.1234), '12.3%');
  assert.equal(formatBillingPercent(0.1234, 2), '12.34%');
  assert.equal(formatBillingPercent(NaN), '0.0%');
}

// --- CSS variable bridge ---------------------------------------------------

function testApplyChartThemeToDocumentWritesAllExpectedVars() {
  // jsdom isn't loaded for these Node tests, so stub document if missing.
  const stubElement = {
    style: {
      setProperty: () => {},
    },
    getAttribute: () => null,
  };
  const hadDocument = typeof globalThis.document !== 'undefined';
  if (!hadDocument) {
    globalThis.document = {
      documentElement: stubElement,
      body: { classList: { contains: () => false } },
    };
  } else {
    // Replace setProperty with a spy on the existing documentElement.
    const writes = new Map();
    const original = globalThis.document.documentElement.style.setProperty;
    globalThis.document.documentElement.style.setProperty = (name, value) => {
      writes.set(name, value);
      return original.call(globalThis.document.documentElement.style, name, value);
    };
    try {
      applyChartThemeToDocument();
      for (const expected of [
        '--router-surface',
        '--router-text-primary',
        '--router-text-muted',
        '--router-link',
        '--router-status-warning',
        '--router-status-danger',
        '--router-accent-strong',
      ]) {
        assert.ok(writes.has(expected), `applyChartThemeToDocument must write ${expected}`);
        assert.match(writes.get(expected), /^(#|rgba)/);
      }
    } finally {
      globalThis.document.documentElement.style.setProperty = original;
    }
    return;
  }
  try {
    assert.doesNotThrow(() => applyChartThemeToDocument(), 'must not throw in a jsdom-less env');
  } finally {
    if (!hadDocument) delete globalThis.document;
  }
}

// --- Run -------------------------------------------------------------------

const tests = [
  testCategoricalPaletteHasFiveValidatedSlots,
  testStatusPaletteCoversFourSeveritySlots,
  testBackcompatPaletteMapsToValidatedTokens,
  testChartAxisStyleReadsFromActiveTheme,
  testChartTooltipStyleUsesSurfaceNotWhite,
  testChartTooltipLabelAndItemStylesCarryInk,
  testChartGridStyleUsesThemeGridColor,
  testChartNeutralColorReturnsMutedInk,
  testColorForKeyIsStableForTheSameKey,
  testColorForKeyFallsBackOnEmpty,
  testColorForKeyHandlesNonStringInput,
  testFormatCurrencyCompactHandlesEachSupportedCurrency,
  testFormatCurrencyCompactGuardsAgainstNaN,
  testUsdAndCnyCurrencyHelpers,
  testFormatIntChartRoundsAndGroups,
  testFormatPercentChartAcceptsFractionOrAlreadyPercent,
  testBillingConstantsAndFixedHelpers,
  testApplyChartThemeToDocumentWritesAllExpectedVars,
];

let failed = 0;
for (const test of tests) {
  try {
    test();
    console.log(`  ok  ${test.name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${test.name}`);
    console.error(`    ${error?.stack || error}`);
  }
}
if (failed > 0) {
  console.error(`\n${failed}/${tests.length} test(s) failed`);
  process.exit(1);
}
console.log(`\n${tests.length}/${tests.length} tests passed`);