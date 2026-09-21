import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import UnitDropdown from './UnitDropdown';
import {
  API,
  copy,
  showError,
  showSuccess,
  timestamp2string,
  withCardLabels,
} from '../helpers';
import useList, { sorterToSort, sortOrderForColumn } from '../hooks/useList';
import { parseListPageSize } from '../hooks/useUrlState';

import { LIST_PAGE_SIZE } from '../constants';
import {
  TOKEN_LIST_COLUMN_WIDTHS,
  TOKEN_LIST_TABLE_MIN_WIDTH,
} from '../constants/tableWidthPresets';
import {
  buildDisplayUnitOptions,
  buildPublicDisplayCurrencyIndex,
  formatDisplayAmountFromChargeAmount,
  loadPublicDisplayCurrencyCatalog,
  resolvePreferredDisplayCurrency,
} from '../helpers/billing';
import {
  AppButton,
  AppEmpty,
  AppErrorState,
  AppFilterHeader,
  AppIcon,
  AppInput,
  AppPagination,
  AppPopconfirm,
  AppSelect,
  AppSwitch,
  AppTable,
  AppTableActionButton,
  AppTooltip,
  AppToolbar,
} from '../router-ui';

// Frontend column key → backend sort column (whitelisted server-side). Columns
// absent from this map are not sortable via the backend (name / status).
const TOKEN_SORT_FIELD_MAP = {
  usedAmount: 'used_quota',
  remainingAmount: 'remain_quota',
  usedRequestCount: 'used_request_count',
  remainingRequestCount: 'remain_request_count',
  createdTime: 'created_time',
  expiredTime: 'expired_time',
};

const normalizeTokenRow = (raw) => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  return {
    ...raw,
    usedAmount: Number(raw?.used_amount ?? raw?.used_quota ?? 0) || 0,
    remainingAmount: Number(raw?.remaining_amount ?? raw?.remain_quota ?? 0) || 0,
    hasUnlimitedLimitAmount: raw?.unlimited_quota === true,
    usedRequestCount: Number(raw?.used_request_count ?? 0) || 0,
    remainingRequestCount: Number(raw?.remaining_request_count ?? raw?.remain_request_count ?? 0) || 0,
    hasUnlimitedRequestCount: raw?.unlimited_request_count !== false,
    createdTime: Number(raw?.created_time ?? 0) || 0,
    updatedTime: Number(raw?.updated_time ?? 0) || 0,
    expiredTime: Number(raw?.expired_time ?? 0) || 0,
  };
};

function renderTimestamp(timestamp) {
  return <>{timestamp2string(timestamp)}</>;
}

function tokenStatusTooltip(status, t) {
  switch (status) {
    case 1:
      return t('token.table.status_enabled');
    case 2:
      return t('token.table.status_disabled');
    case 3:
      return t('token.table.status_expired');
    case 4:
      return t('token.table.status_depleted');
    default:
      return t('token.table.status_unknown');
  }
}

function renderTokenPreview(key) {
  const raw = typeof key === 'string' ? key.trim() : '';
  if (raw === '') {
    return '-';
  }
  const hasPrefix = raw.toLowerCase().startsWith('sk-');
  const body = hasPrefix ? raw.slice(3) : raw;
  if (body.includes('****')) {
    return `sk-${body}`;
  }
  if (body.length <= 4) {
    return 'sk-****';
  }
  if (body.length <= 8) {
    return `sk-${body.slice(0, 2)}****${body.slice(-2)}`;
  }
  return `sk-${body.slice(0, 4)}****${body.slice(-4)}`;
}

function normalizeTokenCopyValue(key) {
  const raw = typeof key === 'string' ? key.trim() : '';
  if (raw === '' || raw.includes('****')) {
    return '';
  }
  return raw.toLowerCase().startsWith('sk-') ? raw : `sk-${raw}`;
}

function buildChatTokenUrl(chatLink, tokenKey) {
  const rawChatLink = typeof chatLink === 'string' ? chatLink.trim() : '';
  const rawTokenKey = typeof tokenKey === 'string' ? tokenKey.trim() : '';
  if (rawChatLink === '' || rawTokenKey === '') {
    return '';
  }
  const params = new URLSearchParams({
    redirect: '/new-chat',
    action: 'token',
    token: rawTokenKey,
  });

  try {
    const url = new URL(rawChatLink, window.location.origin);
    url.hash = `/router?${params.toString()}`;
    return url.toString();
  } catch {
    const base = rawChatLink.replace(/#.*$/, '').replace(/\/+$/, '');
    return `${base}/#/router?${params.toString()}`;
  }
}

const TokensTable = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPagePath = `${location.pathname}${location.search}${location.hash}`;
  // Seed the search keyword from the URL once, so a refresh or shared link
  // keeps the active search instead of dropping back to the full list.
  const initialSearchKeyword = useMemo(
    () => (new URLSearchParams(location.search).get('q') || '').trim(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Seed the sort from the URL once (frontend column key + direction), defaulting
  // to created-time descending to match the backend default.
  const initialSort = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const field = (params.get('order_by') || '').trim();
    const order = (params.get('order') || '').trim();
    if (
      Object.prototype.hasOwnProperty.call(TOKEN_SORT_FIELD_MAP, field) &&
      (order === 'asc' || order === 'desc')
    ) {
      return { field, order };
    }
    return { field: 'createdTime', order: 'desc' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchKeyword, setSearchKeyword] = useState(() => initialSearchKeyword);
  const [searching, setSearching] = useState(false);
  // Seed the status filter from the URL once so a refresh / shared link keeps it.
  const initialStatus = useMemo(
    () => (new URLSearchParams(location.search).get('status') || 'all').trim(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const initialPageSize = useMemo(() => {
    const raw = new URLSearchParams(location.search).get('page_size');
    return raw ? parseListPageSize(raw) : LIST_PAGE_SIZE;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [statusFilter, setStatusFilter] = useState(() => initialStatus);
  const [currencyIndex, setCurrencyIndex] = useState(() =>
    buildPublicDisplayCurrencyIndex([]),
  );
  const [displayUnit, setDisplayUnit] = useState(() =>
    resolvePreferredDisplayCurrency(buildPublicDisplayCurrencyIndex([]), 'USD'),
  );
  const [statusMutatingTokenId, setStatusMutatingTokenId] = useState('');
  const chatLink = String(localStorage.getItem('chat_link') || '').trim();

  // Backend-paged fetcher: page-overwrite + true global sort. Frontend column
  // keys are mapped to whitelisted backend columns; unmapped keys fall back to
  // the backend default order.
  const fetchTokens = useCallback(async ({ page, pageSize, orderBy, order }) => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(pageSize));
    if (statusFilter && statusFilter !== 'all') {
      params.set('status', statusFilter);
    }
    const backendOrderBy = TOKEN_SORT_FIELD_MAP[orderBy] || '';
    if (backendOrderBy) {
      params.set('order_by', backendOrderBy);
      params.set('order', order === 'asc' ? 'asc' : 'desc');
    }
    const res = await API.get(`/api/v1/public/token/?${params.toString()}`);
    const { success, message, data, meta } = res.data;
    if (!success) {
      showError(message);
      throw new Error(message || 'load tokens failed');
    }
    const rows = Array.isArray(data)
      ? data.map(normalizeTokenRow).filter(Boolean)
      : [];
    return { rows, total: Number(meta?.total || rows.length || 0) };
  }, [statusFilter]);

  const {
    rows,
    total: pagedTotal,
    loading,
    loadError,
    page: activePage,
    pageSize,
    sort,
    setPage: setActivePage,
    load: loadTokens,
    setPageSize,
    reload,
    setSort,
  } = useList({
    fetcher: fetchTokens,
    pageSize: initialPageSize,
    initialSort,
  });

  // page_size lives in the URL (default LIST_PAGE_SIZE is stripped) so a refresh
  // or shared link keeps the chosen size. Tokens manages its URL manually rather
  // than through useUrlState, so mirror the param here.
  const syncPageSizeToUrl = useCallback(
    (size) => {
      const params = new URLSearchParams(location.search);
      if (Number(size) === LIST_PAGE_SIZE) {
        params.delete('page_size');
      } else {
        params.set('page_size', String(size));
      }
      const nextSearch = params.toString();
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : '',
        },
        { replace: true },
      );
    },
    [location.pathname, location.search, navigate],
  );

  const onPaginationChange = (e, { activePage: nextActivePage, pageSize: nextSize }) => {
    const size = Number(nextSize) > 0 ? Number(nextSize) : pageSize;
    if (size !== pageSize) {
      syncPageSizeToUrl(size);
      if (isSearchMode) {
        // Search mode slices a client-held result set: resize without a fetch.
        setPageSize(size, { reload: false });
        setActivePage(1);
      } else {
        // Backend-paged: reload page 1 at the new size.
        setPageSize(size);
      }
      return;
    }
    const nextPage = Number(nextActivePage) > 0 ? Number(nextActivePage) : 1;
    if (isSearchMode) {
      // Search mode keeps the full result set client-side; just slice.
      setActivePage(nextPage);
    } else {
      loadTokens(nextPage);
    }
  };

  const refresh = () => {
    if (isSearchMode) {
      searchTokens();
    } else {
      reload();
    }
  };

  useEffect(() => {
    if (initialSearchKeyword) {
      // Restore the search result set when arriving with a keyword in the URL.
      searchTokens();
    } else {
      loadTokens(1);
    }
    // Run once on mount; searchTokens reads the seeded keyword.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTokens]);

  // React to status-filter changes: the filter is backend-side and applies to
  // the paged list, so we leave any active search, sync the URL, and reload.
  const statusInitializedRef = useRef(false);
  useEffect(() => {
    if (!statusInitializedRef.current) {
      statusInitializedRef.current = true;
      return;
    }
    const params = new URLSearchParams(location.search);
    const normalized = (statusFilter || 'all').toString();
    if (normalized === 'all') {
      params.delete('status');
    } else {
      params.set('status', normalized);
    }
    params.delete('q');
    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true },
    );
    setIsSearchMode(false);
    setSearchKeyword('');
    loadTokens(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  // Reflect the active sort in the URL (replace), preserving other params.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (sort?.field) {
      params.set('order_by', sort.field);
      params.set('order', sort.order === 'asc' ? 'asc' : 'desc');
    } else {
      params.delete('order_by');
      params.delete('order');
    }
    const nextSearch = params.toString();
    const currentSearch = location.search.startsWith('?')
      ? location.search.slice(1)
      : location.search;
    if (nextSearch === currentSearch) {
      return;
    }
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  useEffect(() => {
    let disposed = false;
    loadPublicDisplayCurrencyCatalog().then(
      ({ currencyIndex: nextIndex, defaultCurrency }) => {
        if (disposed) {
          return;
        }
        setCurrencyIndex(nextIndex);
        setDisplayUnit((current) =>
          resolvePreferredDisplayCurrency(
            nextIndex,
            current || defaultCurrency || 'USD',
          ),
        );
      },
    );
    return () => {
      disposed = true;
    };
  }, []);

  const manageToken = async (token, action) => {
    const id = token?.id;
    const isStatusAction = action === 'enable' || action === 'disable';
    if (isStatusAction) {
      setStatusMutatingTokenId(`${id}`);
    }
    let data = { id };
    let res;
    try {
      switch (action) {
        case 'delete':
          res = await API.delete(`/api/v1/public/token/${id}/`);
          break;
        case 'enable':
          data.status = 1;
          res = await API.put('/api/v1/public/token/?status_only=true', data);
          break;
        case 'disable':
          data.status = 2;
          res = await API.put('/api/v1/public/token/?status_only=true', data);
          break;
        default:
          return;
      }
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('token.messages.operation_success'));
        const updated = res.data.data;
        if (isSearchMode) {
          // Search mode owns its client-side list; patch it in place.
          setSearchResults((prev) => {
            if (action === 'delete') {
              return prev.filter((item) => item?.id !== id);
            }
            return prev.map((item) =>
              item?.id === id
                ? { ...item, status: updated?.status ?? item.status }
                : item,
            );
          });
        } else {
          // Overwrite model: re-fetch the current page to reflect the change.
          reload();
        }
      } else {
        showError(message);
      }
    } finally {
      if (isStatusAction) {
        setStatusMutatingTokenId('');
      }
    }
  };

  const renderStatusSwitch = (token) => {
    const status = Number(token?.status || 0);
    return (
      <div
        className='router-token-status-switch'
        onClick={(event) => stopRowClick(event)}
      >
        <AppTooltip title={tokenStatusTooltip(status, t)}>
          <AppSwitch
            size='small'
            checked={status === 1}
            loading={statusMutatingTokenId === `${token.id}`}
            aria-label={t('token.table.status')}
            onChange={(event, { checked }) => {
              manageToken(token, checked ? 'enable' : 'disable');
            }}
          />
        </AppTooltip>
      </div>
    );
  };

  // Reflect the active search keyword in the URL (replace, so it doesn't spam
  // history), preserving any other query params. Cleared search removes `q`.
  const writeSearchParam = useCallback(
    (keyword) => {
      const params = new URLSearchParams(location.search);
      const trimmed = (keyword || '').trim();
      if (trimmed === '') {
        params.delete('q');
      } else {
        params.set('q', trimmed);
      }
      const nextSearch = params.toString();
      const currentSearch = location.search.startsWith('?')
        ? location.search.slice(1)
        : location.search;
      if (nextSearch === currentSearch) {
        return;
      }
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : '',
        },
        { replace: true },
      );
    },
    [location.pathname, location.search, navigate],
  );

  const searchTokens = async () => {
    if (searchKeyword === '') {
      // if keyword is blank, load files instead.
      writeSearchParam('');
      setIsSearchMode(false);
      await loadTokens(1);
      return;
    }
    setSearching(true);
    try {
      const res = await API.get(
        `/api/v1/public/token/search?keyword=${searchKeyword}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        const normalizedRows = Array.isArray(data)
          ? data.map(normalizeTokenRow).filter(Boolean)
          : [];
        setIsSearchMode(true);
        setSearchResults(normalizedRows);
        setActivePage(1);
        writeSearchParam(searchKeyword);
      } else {
        showError(message);
      }
    } finally {
      setSearching(false);
    }
  };

  const handleKeywordChange = async (e, { value }) => {
    setSearchKeyword(value.trim());
  };

  const clearFilters = () => {
    setSearchKeyword('');
    if (statusFilter !== 'all') {
      // The status effect clears both `q` and `status`, exits search, reloads.
      setStatusFilter('all');
      return;
    }
    // Status already at default: just drop the keyword and reload the list.
    const params = new URLSearchParams(location.search);
    params.delete('q');
    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true },
    );
    setIsSearchMode(false);
    loadTokens(1);
  };

  const stopRowClick = (event) => {
    event.stopPropagation();
  };

  const openTokenInChat = (token) => {
    const tokenKey = normalizeTokenCopyValue(token?.key);
    const chatUrl = buildChatTokenUrl(chatLink, tokenKey);
    if (chatUrl === '') {
      showError(t('token.messages.chat_open_failed'));
      return;
    }
    window.open(chatUrl, '_blank', 'noopener,noreferrer');
  };

  // Sorting is only meaningful for the backend-paged (non-search) list.
  const handleTableChange = (_, __, sorter) => {
    if (isSearchMode) {
      return;
    }
    setSort(sorterToSort(sorter));
  };

  const visibleTokenCount = searchResults.filter(
    (token) => !token?.deleted,
  ).length;
  const paginationTotal = isSearchMode ? visibleTokenCount : pagedTotal;
  const displayUnitOptions = useMemo(
    () => buildDisplayUnitOptions(currencyIndex),
    [currencyIndex],
  );

  return (
    <>
      <AppFilterHeader
        breadcrumbs={[
          { key: 'workspace', label: t('header.user_workspace') },
          { key: 'mine', label: t('header.mine') },
          { key: 'token', label: t('header.token'), active: true },
        ]}
        title={t('header.token')}
        actions={
          <div className='router-list-toolbar-actions'>
            <AppButton
              className='router-page-button'
              color='blue'
              onClick={() =>
                navigate('/workspace/token/add', {
                  state: {
                    from: currentPagePath,
                  },
                })
              }
            >
              {t('token.buttons.add')}
            </AppButton>
            <AppButton
              className='router-page-button'
              onClick={refresh}
              loading={loading}
            >
              {t('token.buttons.refresh')}
            </AppButton>
          </div>
        }
        query={
          <div className='router-list-toolbar-query router-list-toolbar-query-compact'>
            <AppSelect
              className='router-section-select'
              value={statusFilter}
              onChange={(_, { value }) => setStatusFilter((value || 'all').toString())}
              options={[
                { value: 'all', label: t('token.filter.status_all') },
                { value: '1', label: t('token.table.status_enabled') },
                { value: '2', label: t('token.table.status_disabled') },
                { value: '3', label: t('token.table.status_expired') },
                { value: '4', label: t('token.table.status_depleted') },
              ]}
            />
            <form
              className='router-search-form-xs'
              onSubmit={(event) => {
                event.preventDefault();
                searchTokens();
              }}
            >
              <AppInput
                className='router-section-input'
                icon='search'
                fluid
                iconPosition='left'
                placeholder={t('token.search')}
                value={searchKeyword}
                loading={searching}
                onChange={handleKeywordChange}
              />
            </form>
            <AppButton
              className='router-section-button'
              disabled={statusFilter === 'all' && searchKeyword === ''}
              onClick={clearFilters}
            >
              {t('common.clear_filters')}
            </AppButton>
          </div>
        }
      />

      <div className='router-table-scroll-x'>
        <AppTable
          className='router-list-table router-table-fit-page router-table-cardify'
          pagination={false}
          loading={loading}
          scroll={{ x: TOKEN_LIST_TABLE_MIN_WIDTH }}
          rowKey='id'
          onChange={handleTableChange}
          dataSource={(isSearchMode
            ? searchResults.slice(
                (activePage - 1) * pageSize,
                activePage * pageSize,
              )
            : rows
          ).filter((token) => !token?.deleted)}
          locale={{
            emptyText: loading ? (
              t('common.loading')
            ) : loadError ? (
              <AppErrorState
                message={t('common.load_failed')}
                onRetry={refresh}
                retryText={t('common.retry')}
              />
            ) : (
              <AppEmpty
                action={
                  <AppButton
                    color='blue'
                    onClick={() =>
                      navigate('/workspace/token/add', {
                        state: { from: currentPagePath },
                      })
                    }
                  >
                    {t('token.buttons.add')}
                  </AppButton>
                }
              >
                {t('token.table.empty_cta')}
              </AppEmpty>
            ),
          }}
          onRow={(token) => ({
            className: 'router-row-clickable',
            onClick: () =>
              navigate(`/workspace/token/${token.id}`, {
                state: {
                  from: currentPagePath,
                },
              }),
          })}
          columns={withCardLabels([
          {
            title: t('token.table.name'),
            dataIndex: 'name',
            key: 'name',
            width: TOKEN_LIST_COLUMN_WIDTHS.name,
            ellipsis: true,
            render: (value) => value || t('token.table.no_name'),
          },
          {
            title: t('token.table.token'),
            dataIndex: 'key',
            key: 'key',
            width: TOKEN_LIST_COLUMN_WIDTHS.token,
            ellipsis: true,
            render: (value) => {
              const preview = renderTokenPreview(value);
              const copyValue = normalizeTokenCopyValue(value);
              return (
                <span
                  className='router-action-group'
                >
                  <span
                    className='router-token-key-link'
                    title={preview}
                  >
                    {preview}
                  </span>
                  <button
                    type='button'
                    className='router-icon-button'
                    title={t('token.buttons.copy')}
                    onClick={async (event) => {
                      event.stopPropagation();
                      if (copyValue === '') {
                        showError(t('token.messages.copy_failed'));
                        return;
                      }
                      if (await copy(copyValue)) {
                        showSuccess(t('token.messages.copy_success'));
                        return;
                      }
                      showError(t('token.messages.copy_failed'));
                    }}
                  >
                    <AppIcon name='copy outline' />
                  </button>
                </span>
              );
            },
          },
          {
            title: t('token.table.status'),
            dataIndex: 'status',
            key: 'status',
            className: 'router-table-col-status-compact',
            width: TOKEN_LIST_COLUMN_WIDTHS.status,
            render: (_, token) => renderStatusSwitch(token),
          },
          {
            title: (
              <div className='router-table-header-with-control'>
                <span>{t('token.table.used_amount')}</span>
                <UnitDropdown
                  variant='header'
                  compact
                  options={displayUnitOptions}
                  value={displayUnit}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  onChange={(_, { value }) => {
                    setDisplayUnit((value || '').toString());
                  }}
                />
              </div>
            ),
            dataIndex: 'usedAmount',
            key: 'usedAmount',
            width: TOKEN_LIST_COLUMN_WIDTHS.usedAmount,
            sorter: true,
            sortOrder: sortOrderForColumn(sort, 'usedAmount'),
            render: (value) =>
              formatDisplayAmountFromChargeAmount(value, displayUnit, currencyIndex),
          },
          {
            title: (
              <div className='router-table-header-with-control'>
                <span>{t('token.table.remain_amount')}</span>
                <UnitDropdown
                  variant='header'
                  compact
                  options={displayUnitOptions}
                  value={displayUnit}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  onChange={(_, { value }) => {
                    setDisplayUnit((value || '').toString());
                  }}
                />
              </div>
            ),
            dataIndex: 'remainingAmount',
            key: 'remainingAmount',
            width: TOKEN_LIST_COLUMN_WIDTHS.remainingAmount,
            sorter: true,
            sortOrder: sortOrderForColumn(sort, 'remainingAmount'),
            render: (value, token) =>
              token.hasUnlimitedLimitAmount
                ? t('token.table.unlimited')
                : formatDisplayAmountFromChargeAmount(value, displayUnit, currencyIndex),
          },
          {
            title: t('token.table.used_request_count'),
            dataIndex: 'usedRequestCount',
            key: 'usedRequestCount',
            width: TOKEN_LIST_COLUMN_WIDTHS.usedRequestCount,
            sorter: true,
            sortOrder: sortOrderForColumn(sort, 'usedRequestCount'),
          },
          {
            title: t('token.table.remain_request_count'),
            dataIndex: 'remainingRequestCount',
            key: 'remainingRequestCount',
            width: TOKEN_LIST_COLUMN_WIDTHS.remainingRequestCount,
            sorter: true,
            sortOrder: sortOrderForColumn(sort, 'remainingRequestCount'),
            render: (value, token) =>
              token.hasUnlimitedRequestCount ? t('token.table.unlimited') : value,
          },
          {
            title: t('token.table.created_time'),
            dataIndex: 'createdTime',
            key: 'createdTime',
            className: 'router-table-col-datetime',
            width: TOKEN_LIST_COLUMN_WIDTHS.createdTime,
            sorter: true,
            sortOrder: sortOrderForColumn(sort, 'createdTime'),
            render: (value) => renderTimestamp(value),
          },
          {
            title: t('token.table.expired_time'),
            dataIndex: 'expiredTime',
            key: 'expiredTime',
            className: 'router-table-col-datetime',
            width: TOKEN_LIST_COLUMN_WIDTHS.expiredTime,
            sorter: true,
            sortOrder: sortOrderForColumn(sort, 'expiredTime'),
            render: (value) =>
              value === -1 ? t('token.table.never_expire') : renderTimestamp(value),
          },
          {
            title: t('token.table.actions'),
            key: 'actions',
            className: 'router-table-col-actions-icon',
            width: TOKEN_LIST_COLUMN_WIDTHS.actions,
            render: (_, token) => {
              const tokenKey = normalizeTokenCopyValue(token?.key);

              return (
                <div
                  className='router-action-group router-table-actions-icon-compact'
                  onClick={(event) => stopRowClick(event)}
                >
                  <AppTableActionButton
                    icon='comments'
                    title={t('token.buttons.chat')}
                    color='blue'
                    disabled={tokenKey === '' || chatLink === ''}
                    onClick={() => openTokenInChat(token)}
                  />
                  <AppPopconfirm
                    title={`${t('token.buttons.confirm_delete')} ${token.name || ''}`}
                    onConfirm={() => {
                      manageToken(token, 'delete');
                    }}
                    okText={t('common.confirm')}
                    cancelText={t('common.cancel')}
                  >
                    <span>
                      <AppTableActionButton
                        icon='trash'
                        title={t('token.buttons.delete')}
                        color='red'
                      />
                    </span>
                  </AppPopconfirm>
                </div>
              );
            },
          },
          ])}
          footer={() => (
            <AppToolbar
              className='router-toolbar-compact'
              start={
                <AppPagination
                  className='router-page-pagination'
                  activePage={activePage}
                  onPageChange={onPaginationChange}
                  siblingRange={1}
                  total={paginationTotal}
                  pageSize={pageSize}
                />
              }
            />
          )}
        />
      </div>
    </>
  );
};

export default TokensTable;
