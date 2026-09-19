// Lightweight theme controller. Two responsibilities:
//   1. Resolve the active mode (light | dark) from localStorage, then system
//      preference, then a hard-coded default of light. Keep a single source
//      of truth so chart helpers, antd ConfigProvider and CSS-var bridge all
//      agree.
//   2. Apply the mode to the DOM (`data-theme` on <html>) and persist the
//      user's choice. MutationObservers in App.jsx react to the attribute
//      flip and re-apply chart CSS vars.
//
// We deliberately avoid a global store / context: this surface is small
// enough that a custom event + DOM attribute gives us everything a context
// would, with zero re-renders for callers that only read the current mode.

const STORAGE_KEY = 'router.theme';
const DEFAULT_MODE = 'light';
const VALID_MODES = ['light', 'dark'];

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

const systemPrefersDark = () => {
  if (!isBrowser() || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const readStoredRaw = () => {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const readStoredThemeMode = () => {
  const stored = readStoredRaw();
  return VALID_MODES.includes(stored) ? stored : DEFAULT_MODE;
};

// First-load resolution order: stored choice > system preference > default.
// Called once at boot — `data-theme` is then committed by `applyThemeMode`.
export const resolveInitialThemeMode = () => {
  // If the user has ever made a choice (raw value present in storage), trust
  // it — even when the stored value matches the default — so the preference
  // is sticky and we don't bounce back to system on every reload.
  if (readStoredRaw() !== null) return readStoredThemeMode();
  return systemPrefersDark() ? 'dark' : DEFAULT_MODE;
};

export const applyThemeMode = (mode) => {
  const normalized = VALID_MODES.includes(mode) ? mode : DEFAULT_MODE;
  if (!isBrowser()) return normalized;
  const root = document.documentElement;
  if (normalized === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else {
    root.removeAttribute('data-theme');
  }
  // Also sync the legacy body class so existing listeners (e.g. CSS that
  // targets `body.router-theme-dark`) keep working.
  document.body.classList.toggle('router-theme-dark', normalized === 'dark');
  return normalized;
};

export const persistThemeMode = (mode) => {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage may be unavailable (private mode, quota); fail open.
  }
};

export const cycleToOppositeThemeMode = (mode) => (mode === 'dark' ? 'light' : 'dark');

export const themeModeStorageKey = STORAGE_KEY;