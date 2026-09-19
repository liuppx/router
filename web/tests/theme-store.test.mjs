import assert from 'node:assert/strict';

// The theme store reads/writes localStorage and the DOM, so we stub the
// browser globals before importing the module under test.
const fakeStorage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => (fakeStorage.has(key) ? fakeStorage.get(key) : null),
    setItem: (key, value) => fakeStorage.set(key, String(value)),
  },
  matchMedia: () => ({ matches: false }),
};
const docAttributes = new Map();
const docClasses = new Set();
globalThis.document = {
  documentElement: {
    setAttribute: (name, value) => docAttributes.set(name, value),
    removeAttribute: (name) => docAttributes.delete(name),
    getAttribute: (name) => (docAttributes.has(name) ? docAttributes.get(name) : null),
  },
  body: {
    classList: {
      add: (name) => docClasses.add(name),
      remove: (name) => docClasses.delete(name),
      toggle: (name, force) => {
        if (force === true) docClasses.add(name);
        else if (force === false) docClasses.delete(name);
        else if (docClasses.has(name)) docClasses.delete(name);
        else docClasses.add(name);
      },
      contains: (name) => docClasses.has(name),
    },
  },
};

const {
  readStoredThemeMode,
  applyThemeMode,
  persistThemeMode,
  resolveInitialThemeMode,
  cycleToOppositeThemeMode,
  themeModeStorageKey,
} = await import('../src/router-ui/theme/store.js');

assert.equal(themeModeStorageKey, 'router.theme');

// readStoredThemeMode: defaults to light when nothing is stored.
fakeStorage.clear();
assert.equal(readStoredThemeMode(), 'light');

// applyThemeMode: dark flips the DOM attribute and adds the legacy body class.
applyThemeMode('dark');
assert.equal(docAttributes.get('data-theme'), 'dark');
assert.equal(docClasses.has('router-theme-dark'), true);

// applyThemeMode: light clears the attribute and removes the legacy class.
applyThemeMode('light');
assert.equal(docAttributes.has('data-theme'), false);
assert.equal(docClasses.has('router-theme-dark'), false);

// applyThemeMode: invalid mode falls back to default (light).
applyThemeMode('sepia');
assert.equal(docAttributes.has('data-theme'), false);

// persistThemeMode: writes the storage key.
persistThemeMode('dark');
assert.equal(fakeStorage.get('router.theme'), 'dark');

// readStoredThemeMode: returns stored mode if valid.
fakeStorage.set('router.theme', 'dark');
assert.equal(readStoredThemeMode(), 'dark');

// readStoredThemeMode: ignores invalid stored values.
fakeStorage.set('router.theme', 'sepia');
assert.equal(readStoredThemeMode(), 'light');

// cycleToOppositeThemeMode: symmetric.
assert.equal(cycleToOppositeThemeMode('light'), 'dark');
assert.equal(cycleToOppositeThemeMode('dark'), 'light');

// resolveInitialThemeMode: prefers stored over system preference.
fakeStorage.set('router.theme', 'light');
globalThis.window.matchMedia = () => ({ matches: true });
assert.equal(resolveInitialThemeMode(), 'light');

// resolveInitialThemeMode: falls back to system preference when nothing stored.
fakeStorage.delete('router.theme');
assert.equal(resolveInitialThemeMode(), 'dark');

// resolveInitialThemeMode: defaults to light when both are absent.
globalThis.window.matchMedia = () => ({ matches: false });
assert.equal(resolveInitialThemeMode(), 'light');

console.log('ok theme-store tests passed');