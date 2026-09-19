import { useCallback, useEffect, useState } from 'react';
import {
  applyThemeMode,
  cycleToOppositeThemeMode,
  persistThemeMode,
  readStoredThemeMode,
} from './store';

// React entry point. Components that need to render a toggle read this hook;
// everyone else reads `getActiveChartTheme()` at render time (no hook needed).
export const useThemeMode = () => {
  const [mode, setMode] = useState(() => readStoredThemeMode());

  useEffect(() => {
    applyThemeMode(mode);
    persistThemeMode(mode);
  }, [mode]);

  const toggle = useCallback(() => {
    setMode((current) => cycleToOppositeThemeMode(current));
  }, []);

  const setModeExplicit = useCallback((next) => {
    setMode((current) => (current === next ? current : next));
  }, []);

  return { mode, toggle, setMode: setModeExplicit };
};

export default useThemeMode;