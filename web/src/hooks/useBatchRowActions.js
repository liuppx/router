import { useCallback, useMemo, useState } from 'react';

/**
 * Shared UI state for "top-level list batch operations" pattern: list pages
 * stay in normal view by default, the operator enters a `selecting` mode to
 * tick rows, then a batch action (topup / enable / disable / etc.) is run
 * against the keys they selected. Cancel returns to normal view and clears
 * the selection.
 *
 * This hook intentionally does NOT couple to a specific batch API. Channels
 * and Groups implement batch enable/disable by looping the existing single-row
 * PUT and aggregating per-row success/failure; UsersTable hits a single
 * batch endpoint. Both styles can reuse the same UI shell.
 *
 * @returns {{
 *   mode: 'idle' | 'selecting',
 *   selectedRowKeys: string[],
 *   isSelecting: boolean,
 *   selectedCount: number,
 *   enter: () => void,
 *   exit: () => void,
 *   toggle: (key: string) => void,
 *   selectAll: (keys: string[]) => void,
 *   clear: () => void,
 *   setKeys: (keys: string[]) => void,
 *   tableSelection: undefined | { selectedRowKeys, preserveSelectedRowKeys,
 *                                 onChange: (keys: string[]) => void,
 *                                 renderCell?: (...) => ReactNode }
 * }}
 */
export default function useBatchRowActions() {
  const [mode, setMode] = useState('idle');
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  const enter = useCallback(() => {
    setMode('selecting');
  }, []);

  const exit = useCallback(() => {
    setMode('idle');
    setSelectedRowKeys([]);
  }, []);

  const clear = useCallback(() => {
    setSelectedRowKeys([]);
  }, []);

  const setKeys = useCallback((keys) => {
    setSelectedRowKeys(
      (Array.isArray(keys) ? keys : [])
        .map((item) => (item == null ? '' : item.toString()).trim())
        .filter(Boolean),
    );
  }, []);

  const toggle = useCallback((key) => {
    const normalized = (key == null ? '' : key.toString()).trim();
    if (!normalized) {
      return;
    }
    setSelectedRowKeys((previous) =>
      previous.includes(normalized)
        ? previous.filter((item) => item !== normalized)
        : [...previous, normalized],
    );
  }, []);

  const selectAll = useCallback((keys) => {
    setSelectedRowKeys(
      (Array.isArray(keys) ? keys : [])
        .map((item) => (item == null ? '' : item.toString()).trim())
        .filter(Boolean),
    );
  }, []);

  const tableSelection = useMemo(() => {
    if (mode !== 'selecting') {
      return undefined;
    }
    return {
      selectedRowKeys,
      preserveSelectedRowKeys: true,
      onChange: (nextKeys) => setKeys(nextKeys),
    };
  }, [mode, selectedRowKeys, setKeys]);

  return {
    mode,
    isSelecting: mode === 'selecting',
    selectedRowKeys,
    selectedCount: selectedRowKeys.length,
    enter,
    exit,
    toggle,
    selectAll,
    clear,
    setKeys,
    // Raw state setter escape hatch for callers that need functional updates or
    // to keep a specific subset selected (e.g. keeping only failed rows after a
    // partial batch). Prefer setKeys/toggle/clear for the common cases.
    setSelectedRowKeys,
    tableSelection,
  };
}