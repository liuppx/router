import { useCallback, useEffect, useRef, useState } from 'react';
import { LIST_PAGE_SIZE } from '../constants/common.constant';

/**
 * Shared data layer for the paginated list surfaces (tokens / logs / tasks).
 *
 * Unifies the three tables onto one model: **page-overwrite pagination + backend
 * paging + backend (true global) sort**. It deliberately does NOT own filters or
 * URL state — callers keep their own filter/URL wiring and drive reloads through
 * `load(targetPage)`, mirroring the existing `loadTasks(targetPage)` call style so
 * migration is mechanical.
 *
 * The caller supplies a `fetcher({ page, pageSize, orderBy, order })` that performs
 * the request and returns `{ rows, total }`. Response-shape normalization (the
 * `{ data, meta.total }` vs `{ data: { items, total } }` split across endpoints)
 * lives in the caller's fetcher via the `adaptListResponse` helper below.
 *
 * @param {Object} params
 * @param {Function} params.fetcher async ({ page, pageSize, orderBy, order }) => { rows, total }
 * @param {number} [params.pageSize=LIST_PAGE_SIZE]
 * @param {number} [params.initialPage=1]
 * @param {{field:string, order:('asc'|'desc')}|null} [params.initialSort=null]
 * @returns {Object} { rows, total, loading, loadError, page, sort, load, setSort, reload }
 */
export default function useList({
  fetcher,
  pageSize = LIST_PAGE_SIZE,
  initialPage = 1,
  initialSort = null,
}) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [sort, setSortState] = useState(initialSort);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Always call the latest fetcher/sort without making `load` change identity
  // when the caller's fetcher closure (filters) updates — callers decide when to
  // reload via their own effects, so a stable `load` avoids surprise re-fetches.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const sortRef = useRef(sort);
  sortRef.current = sort;

  const load = useCallback(
    async (targetPage = 1) => {
      const normalizedPage = Number(targetPage) > 0 ? Number(targetPage) : 1;
      setLoading(true);
      try {
        const currentSort = sortRef.current;
        const result = await fetcherRef.current({
          page: normalizedPage,
          pageSize,
          orderBy: currentSort?.field || '',
          order: currentSort?.order || '',
        });
        setLoadError(false);
        setRows(Array.isArray(result?.rows) ? result.rows : []);
        setTotal(Number(result?.total || 0));
        setPage(normalizedPage);
        return result;
      } catch (error) {
        // Callers surface their own error toast inside `fetcher`; here we only
        // flip the error state. We intentionally swallow so existing call sites
        // (`load(page).then()` without a catch) don't hit unhandled rejections.
        setLoadError(true);
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [pageSize],
  );

  const reload = useCallback(() => load(page), [load, page]);

  // Changing the sort always returns to page 1 and reloads.
  const setSort = useCallback(
    (next) => {
      setSortState(next || null);
      sortRef.current = next || null;
      load(1);
    },
    [load],
  );

  return {
    rows,
    total,
    loading,
    loadError,
    page,
    sort,
    setPage,
    setSortState,
    load,
    reload,
    setSort,
  };
}

/**
 * Normalize the two list response shapes into `{ rows, total }`:
 *   - tokens / logs: `{ data: [...], meta: { total } }`
 *   - tasks:         `{ data: { items: [...], total } }`
 * Pass the axios response body (`res.data`). `mapRow` transforms each row.
 */
export function adaptListResponse(body, mapRow = (row) => row) {
  const payload = body?.data;
  let rawRows = [];
  let total = 0;
  if (Array.isArray(payload)) {
    rawRows = payload;
    total = Number(body?.meta?.total || payload.length || 0);
  } else if (payload && Array.isArray(payload.items)) {
    rawRows = payload.items;
    total = Number(payload.total || payload.items.length || 0);
  }
  return {
    rows: rawRows.map(mapRow),
    total,
  };
}

/** Map an antd Table `onChange` sorter object to `{ field, order }` or null. */
export function sorterToSort(sorter) {
  if (!sorter || !sorter.order) {
    return null;
  }
  const field = sorter.columnKey || sorter.field;
  if (!field) {
    return null;
  }
  return {
    field: String(field),
    order: sorter.order === 'ascend' ? 'asc' : 'desc',
  };
}

/** Map `{ field, order }` back to an antd column `sortOrder` for a given key. */
export function sortOrderForColumn(sort, columnKey) {
  if (!sort || sort.field !== columnKey) {
    return null;
  }
  return sort.order === 'asc' ? 'ascend' : 'descend';
}
