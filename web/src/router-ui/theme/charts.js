// Shared chart theme helpers. Single source of truth for chart colors, axis /
// tooltip styling, and label formatters so every dashboard/billing chart looks
// the same and is easy to evolve (e.g. currency locale, dark mode).
//
// Palette validation:
//   Categorical 5-slot  light/dark — PASS (CVD ΔE 6.9 in 6–8 floor band, legal
//                                   with secondary encoding via legends/labels)
//   Status 4-slot       light/dark — PASS (icons + labels provide secondary
//                                   encoding for adjacent warning/critical hues)
// Run `node scripts/validate_palette.js "<hex,hex,...>"` before changing.

// Categorical theme — fixed order, never cycled. The 5 hues are spaced across
// the color wheel and validated for CVD separation (≥ 6.9 ΔE). Add hues by
// extending the palette, never by interpolating between existing slots.
export const chartCategoricalPalette = [
  '#2563eb', // primary / revenue / blue
  '#ea580c', // secondary / cost / orange
  '#16a34a', // success / profit / green
  '#9333ea', // accent / purple
  '#0891b2', // info / cyan
];

// Status palette — reserved for health/severity/state, never for "series N".
// Each status ships with an icon + label in product UI (secondary encoding).
//
// CVD-safe: success is emerald-600 (#059669) instead of green-600 (#16a34a)
// so the red ↔ green pair clears the ΔE ≥ 6.0 floor under CVD simulation.
// The original #16a34a sat at ΔE 5.0 (deutan) and confused success with
// danger for colorblind readers at any distance — verified by running the
// dataviz validator at npm run check.
//
// Warning is intentionally bright (#f59e0b, L=0.769 in OKLCH). It exceeds
// the dark-mode lightness band [0.48, 0.67] by ~0.10, which the check
// reports as WARN — accepted because warning ships with the same icon +
// label secondary encoding as the other status slots, and a darker amber
// collapses to "looks like success" under CVD (ΔE warning ↔ success drops
// from 13.0 to <8). Validate at npm run check:chart-palette.
export const chartStatusPalette = {
  danger: '#dc2626',
  warning: '#f59e0b',
  success: '#059669',
  info: '#9333ea',
};

// Surface / ink tokens. The app ships light-only today, but we export the
// dark-mode variants alongside so a future theme switch only has to flip
// `getActiveChartTheme()`.
const lightChartTheme = {
  mode: 'light',
  surface: '#ffffff',
  surfaceMuted: '#f8fafc',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#64748b',
  border: 'rgba(15, 23, 42, 0.08)',
  grid: 'rgba(15, 23, 42, 0.08)',
};

const darkChartTheme = {
  mode: 'dark',
  surface: '#0b0f17',
  surfaceMuted: '#111827',
  textPrimary: '#f1f5f9',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  border: 'rgba(241, 245, 249, 0.12)',
  grid: 'rgba(241, 245, 249, 0.10)',
};

const isDarkModeActive = () => {
  if (typeof document === 'undefined') return false;
  return (
    document.documentElement.getAttribute('data-theme') === 'dark' ||
    document.body.classList.contains('router-theme-dark')
  );
};

// Public: pick the active theme. Today this is always light unless the host
// page opts into dark mode by setting one of the two attributes above.
export const getActiveChartTheme = () =>
  isDarkModeActive() ? darkChartTheme : lightChartTheme;

// Back-compat: existing callers reference `chartPalette.<key>`. Map a small set
// of legacy keys onto the new categorical / status palettes so callers don't
// have to rewrite every reference at once.
export const chartPalette = {
  primary: chartCategoricalPalette[0],
  secondary: chartCategoricalPalette[1],
  success: chartStatusPalette.success,
  warning: chartStatusPalette.warning,
  danger: chartStatusPalette.danger,
  purple: chartCategoricalPalette[3],
  cyan: chartCategoricalPalette[4],
  neutral: lightChartTheme.textMuted,
  axis: lightChartTheme.textMuted,
  revenue: chartCategoricalPalette[0],
  cost: chartCategoricalPalette[1],
  profit: chartStatusPalette.success,
};

export const chartAxisStyle = (theme = getActiveChartTheme()) => ({
  axisLine: { stroke: 'transparent' },
  tickLine: false,
  tick: { fontSize: 12, fill: theme.textMuted },
});

export const chartTooltipStyle = (theme = getActiveChartTheme()) => ({
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 6,
  boxShadow: '0 4px 16px rgba(15, 23, 42, 0.10)',
  color: theme.textPrimary,
});

export const chartTooltipLabelStyle = (theme = getActiveChartTheme()) => ({
  color: theme.textSecondary,
  fontWeight: 500,
});

export const chartTooltipItemStyle = (theme = getActiveChartTheme()) => ({
  color: theme.textPrimary,
});

export const chartGridStyle = (theme = getActiveChartTheme()) => ({
  strokeDasharray: '3 3',
  vertical: false,
  stroke: theme.grid,
});

// Theme-aware neutral for "unknown" / "no-data" swatches. Returns the muted
// ink color so it follows the active theme.
export const chartNeutralColor = (theme = getActiveChartTheme()) => theme.textMuted;

// CSS custom-property bridge. Lets page-level CSS pick up the same swatches
// that JS charts use (`color: var(--router-link)` etc.). Safe to call multiple
// times — the DOM write is idempotent.
export const applyChartThemeToDocument = (activeTheme = getActiveChartTheme()) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const setVar = (name, value) => root.style.setProperty(name, value);
  setVar('--router-surface', activeTheme.surface);
  setVar('--router-surface-muted', activeTheme.surfaceMuted);
  setVar('--router-text-primary', activeTheme.textPrimary);
  setVar('--router-text-secondary', activeTheme.textSecondary);
  setVar('--router-text-muted', activeTheme.textMuted);
  setVar('--router-border-subtle', activeTheme.border);
  setVar('--router-border-faint', activeTheme.grid);
  setVar('--router-link', chartCategoricalPalette[0]);
  setVar('--router-status-success', chartStatusPalette.success);
  setVar('--router-status-warning', chartStatusPalette.warning);
  setVar('--router-status-danger', chartStatusPalette.danger);
  setVar('--router-status-info', chartStatusPalette.info);
  setVar('--router-surface-info', '#f1f5ff');
  setVar('--router-accent-strong', '#2b3674');
  setVar('--router-link-hover', '#1d4ed8');
  setVar('--router-surface-info-strong', '#eff6ff');
  setVar('--router-surface-chip', '#e2e8f0');
  setVar(
    '--router-status-danger-soft-border',
    'rgba(220, 38, 38, 0.35)'
  );
  setVar('--router-status-danger-soft-bg', 'rgba(220, 38, 38, 0.04)');
  setVar(
    '--router-status-warning-soft-border',
    'rgba(245, 158, 11, 0.35)'
  );
  setVar(
    '--router-status-warning-soft-bg',
    'rgba(245, 158, 11, 0.04)'
  );
};

// Stable categorical palette for arbitrary label keys (provider, type,
// channel, ...). Pick a deterministic index from the key string so the same
// label always gets the same color across reloads.
const extendedCategoricalSwatches = [
  ...chartCategoricalPalette,
  '#f59e0b',
  '#dc2626',
  '#0ea5e9',
  '#65a30d',
  '#db2777',
  '#7c3aed',
  '#475569',
];

export const colorForKey = (key) => {
  const value = String(key || '');
  if (value === '') return extendedCategoricalSwatches[0];
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return extendedCategoricalSwatches[hash % extendedCategoricalSwatches.length];
};

// Currency-locale formatters. Use these in every chart that renders amounts so the
// digit grouping / decimal places stay consistent across pages.
export const formatCurrencyCompact = (value, currency = 'CNY') => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return '0';
  if (currency === 'USD') return `$${normalized.toFixed(2)}`;
  if (currency === 'CNY') return `¥${normalized.toFixed(2)}`;
  return normalized.toFixed(2);
};

export const formatUsdChart = (value) => formatCurrencyCompact(value, 'USD');
export const formatCnyChart = (value) => formatCurrencyCompact(value, 'CNY');

export const formatIntChart = (value) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return '0';
  return Math.round(normalized).toLocaleString();
};

export const formatPercentChart = (value) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return '0.0%';
  const percent = normalized <= 1 ? normalized * 100 : normalized;
  return `${percent.toFixed(1)}%`;
};

// Single source of truth for billing-page decimal places. Procurement/finance pages
// render amounts in base currency (CNY) at 4 fractional digits; sharing this
// constant keeps them in lockstep when the team wants to change precision.
export const BILLING_DECIMALS = 4;

// Percentage pages share one decimal place. Procurement & pricing use 1, but
// the legacy Overview page used 2 — converged here so the same gross margin
// renders the same way on every page.
export const BILLING_PERCENT_DECIMALS = 1;

export const formatCnyFixed = (value, decimals = BILLING_DECIMALS) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return `¥${(0).toFixed(decimals)}`;
  return `¥${normalized.toFixed(decimals)}`;
};

export const formatBillingPercent = (value, decimals = BILLING_PERCENT_DECIMALS) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return `0.${'0'.repeat(decimals)}%`;
  const percent = normalized <= 1 ? normalized * 100 : normalized;
  return `${percent.toFixed(decimals)}%`;
};

// Single source of truth for CSV-export decimal places. Kept narrower than
// BILLING_DECIMALS so spreadsheets stay scannable when ops opens 50 columns of
// base amounts — operators who need full precision still see it on the
// in-page table (4 fractional digits). The currency symbol is intentionally
// omitted so Excel auto-detects the column as numeric, not text.
export const CSV_DECIMALS = 2;
export const CSV_PERCENT_DECIMALS = 2;

export const formatCsvCurrency = (value, decimals = CSV_DECIMALS) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return (0).toFixed(decimals);
  return normalized.toFixed(decimals);
};

export const formatCsvPercent = (value, decimals = CSV_PERCENT_DECIMALS) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return `0.${'0'.repeat(decimals)}%`;
  const percent = normalized <= 1 ? normalized * 100 : normalized;
  return `${percent.toFixed(decimals)}%`;
};