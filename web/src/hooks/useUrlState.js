import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const identity = (value) => value;
const defaultSerialize = (value) => (value == null ? '' : String(value));

/**
 * Persist a page's list state (filters / search / sort / pagination) to the URL
 * query string so a refresh or shared link restores it.
 *
 * Generalizes the inline pattern in pages/Task/index.jsx: seed state from the
 * URL, write it back with navigate({ replace }) so history isn't spammed, and
 * omit values that equal their default so clean state keeps a clean URL.
 *
 * @param {Object} schema Map of stateKey -> { param, default, parse?, serialize? }
 *   - param: the query-string key (namespace it per page, e.g. `hist_page`, to
 *     avoid collisions when several lists share one route).
 *   - default: value used when the param is absent; also the value that is
 *     stripped from the URL when set, so defaults never appear in the query.
 *   - parse: (rawString) => value, applied when reading from the URL.
 *   - serialize: (value) => string, applied when writing to the URL.
 * @param {Object} [options]
 * @param {boolean} [options.replace=true] Use history.replace so filter changes
 *   don't pile up in the back stack.
 * @returns {[Object, Function]} [values, patch] where values is a map of the
 *   current parsed values and patch(partial) atomically updates one or more of
 *   them in a single URL write.
 *
 * The schema is assumed structurally stable across renders (param names /
 * defaults / parse / serialize don't change), which matches how callers declare
 * it. patch is stable and safe to pass to effects.
 */
export default function useUrlState(schema, options = {}) {
  const { replace = true } = options;
  const [searchParams, setSearchParams] = useSearchParams();

  const values = useMemo(() => {
    const out = {};
    for (const key of Object.keys(schema)) {
      const config = schema[key];
      const raw = searchParams.get(config.param);
      out[key] =
        raw == null || raw === ''
          ? config.default
          : (config.parse || identity)(raw);
    }
    return out;
    // schema is structurally stable; only re-derive when the URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const patch = useCallback(
    (partial) => {
      if (!partial || typeof partial !== 'object') {
        return;
      }
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const key of Object.keys(partial)) {
            const config = schema[key];
            if (!config) {
              continue;
            }
            const value = partial[key];
            const serialize = config.serialize || defaultSerialize;
            const serialized = serialize(value);
            const defaultSerialized = serialize(config.default);
            if (
              value == null ||
              serialized === '' ||
              serialized === defaultSerialized
            ) {
              next.delete(config.param);
            } else {
              next.set(config.param, serialized);
            }
          }
          return next;
        },
        { replace },
      );
    },
    // schema is structurally stable; setSearchParams is stable from react-router.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [replace, setSearchParams],
  );

  return [values, patch];
}

/** Common parser for a 1-based page number stored in the URL. */
export const parsePageParam = (raw) => {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

/** Allowed page sizes for the shared list pagination size-changer. */
export const PAGE_SIZE_OPTIONS = [10, 20, 50];

/**
 * Parser for a `page_size` param constrained to PAGE_SIZE_OPTIONS. An absent
 * param never reaches here (useUrlState returns the schema default); an explicit
 * but out-of-range value falls back to the smallest option so a hand-edited URL
 * can't request an unbounded page.
 */
export const parseListPageSize = (raw) => {
  const parsed = Number(raw);
  return PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : PAGE_SIZE_OPTIONS[0];
};
