import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  API,
  copy,
  showError,
  showSuccess,
  showWarning,
  hasLoadedPagedRows,
  timestamp2string,
  writePagedRows,
  withCardLabels,
} from '../helpers';

import { ITEMS_PER_PAGE } from '../constants';
import {
  REDEMPTION_LIST_COLUMN_WIDTHS,
  REDEMPTION_LIST_TABLE_MIN_WIDTH,
} from '../constants/tableWidthPresets';
import {
  buildBillingCurrencyIndex,
  buildDisplayUnitOptions,
} from '../helpers/billing';
import {
  formatDecimalNumber,
} from '../helpers/render';
import UnitDropdown from './UnitDropdown';
import useUrlState from '../hooks/useUrlState';
import {
  AppButton,
  AppEmpty,
  AppErrorState,
  AppFilterHeader,
  AppInput,
  AppPagination,
  AppPopconfirm,
  AppSelect,
  AppTable,
  AppTableActionButton,
  AppTag,
} from '../router-ui';

const compareTextValue = (left, right) =>
  String(left || '').localeCompare(String(right || ''));

const compareNumberValue = (left, right) =>
  Number(left || 0) - Number(right || 0);

function renderTimestamp(timestamp) {
  return <>{timestamp2string(timestamp)}</>;
}

function renderExpiryTime(timestamp, t) {
  const normalized = Number(timestamp || 0);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return t('common.never');
  }
  return renderTimestamp(normalized);
}

function renderGroupLabel(redemption) {
  const groupName = (redemption?.group_name || '').toString().trim();
  if (groupName) {
    return groupName;
  }
  const groupID = (redemption?.group_id || '').toString().trim();
  return groupID || '-';
}

function formatByCurrencyMinorUnit(amount, currency) {
  const normalizedAmount = Number(amount || 0);
  if (!Number.isFinite(normalizedAmount)) {
    return '-';
  }
  const minorUnit = Number(currency?.minor_unit);
  const maximumFractionDigits =
    Number.isInteger(minorUnit) && minorUnit >= 0 ? minorUnit : 8;
  const unit = (currency?.code || '').toString().trim().toUpperCase();
  if (unit === 'YYC') {
    return formatDecimalNumber(Math.round(normalizedAmount), 0);
  }
  return formatDecimalNumber(normalizedAmount, maximumFractionDigits);
}

function normalizeRedemptionRow(row) {
  return {
    ...(row || {}),
    creditedChargeAmount: Number(row?.credit_amount || 0),
    groupLabel: renderGroupLabel(row),
    createdTime: Number(row?.created_time ?? 0),
    redeemedTime: Number(row?.redeemed_time ?? 0),
  };
}

function buildDisplayValue(redemption, displayUnit, currencyIndex) {
  const creditedChargeAmount = Number(redemption?.creditedChargeAmount || 0);
  const targetCurrency = currencyIndex[displayUnit] || currencyIndex.YYC;
  const rate = Number(targetCurrency?.charge_rate || 0);
  if (!Number.isFinite(rate) || rate <= 0) {
    return '-';
  }
  return formatByCurrencyMinorUnit(creditedChargeAmount / rate, targetCurrency);
}

function renderDisplayFaceValue(redemption, displayUnit, currencyIndex) {
  return buildDisplayValue(redemption, displayUnit, currencyIndex);
}

function renderStatus(status, t) {
  switch (status) {
    case 1:
      return (
        <AppTag color='green' className='router-tag'>
          {t('redemption.status.unused')}
        </AppTag>
      );
    case 2:
      return (
        <AppTag color='red' className='router-tag'>
          {t('redemption.status.disabled')}
        </AppTag>
      );
    case 3:
      return (
        <AppTag color='grey' className='router-tag'>
          {t('redemption.status.used')}
        </AppTag>
      );
    default:
      return (
        <AppTag color='black' className='router-tag'>
          {t('redemption.status.unknown')}
        </AppTag>
      );
  }
}

const RedemptionsTable = ({ headerMeta = null }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPagePath = `${location.pathname}${location.search}${location.hash}`;
  const [redemptions, setRedemptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
  const pageSizeRef = useRef(ITEMS_PER_PAGE);
  pageSizeRef.current = pageSize;
  const [totalCount, setTotalCount] = useState(0);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [{ status: statusFilter, keyword: searchKeyword }, patchQuery] =
    useUrlState({
      status: { param: 'status', default: 'all' },
      keyword: { param: 'q', default: '' },
    });
  const setSearchKeyword = useCallback(
    (value) => patchQuery({ keyword: (value || '').toString() }),
    [patchQuery],
  );
  const [searching, setSearching] = useState(false);
  const initializedSearchRef = useRef(false);
  const [tableSorter, setTableSorter] = useState({
    columnKey: 'created_time',
    order: 'descend',
  });
  const [displayUnit, setDisplayUnit] = useState('USD');
  const [currencyIndex, setCurrencyIndex] = useState(
    buildBillingCurrencyIndex([], { placeholderCodes: ['USD', 'CNY'] })
  );

  const displayUnitOptions = useMemo(
    () => buildDisplayUnitOptions(currencyIndex, { order: 'charge-first' }),
    [currencyIndex]
  );

  const loadDisplayUnits = useCallback(async () => {
    try {
      const res = await API.get('/api/v1/admin/billing/currencies');
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message);
        return;
      }
      const next = buildBillingCurrencyIndex(Array.isArray(data) ? data : [], {
        activeOnly: true,
      });
      setCurrencyIndex(next);
      setDisplayUnit((current) => {
        const normalizedCurrent = (current || '').toString().trim().toUpperCase();
        if (normalizedCurrent && next[normalizedCurrent]) {
          return normalizedCurrent;
        }
        if (next.USD) {
          return 'USD';
        }
        const fallbackUnit = Object.keys(next)
          .filter((code) => code)
          .sort((a, b) => a.localeCompare(b))[0];
        return fallbackUnit || 'YYC';
      });
    } catch (error) {
      showError(error?.message || error);
    }
  }, []);

  const loadRedemptions = useCallback(async (page, { status = 'all' } = {}) => {
    const normalizedPage = Number(page) > 0 ? Number(page) : 1;
    try {
      const params = new URLSearchParams();
      params.set('page', String(normalizedPage));
      const size = pageSizeRef.current;
      params.set('page_size', String(size));
      const normalizedStatus = (status || 'all').toString();
      if (normalizedStatus !== 'all') params.set('status', normalizedStatus);
      const res = await API.get(`/api/v1/admin/redemption/?${params.toString()}`);
      const { success, message, data, meta } = res.data;
      if (success) {
        setLoadError(false);
        setIsSearchMode(false);
        setTotalCount(Number(meta?.total || data?.length || 0));
        const nextRows = (Array.isArray(data) ? data : []).map(normalizeRedemptionRow);
        if (normalizedPage === 1) {
          setRedemptions(nextRows);
        } else {
          setRedemptions((prev) => writePagedRows(prev, normalizedPage, size, nextRows));
        }
      } else {
        if (normalizedPage === 1) setLoadError(true);
        showError(message);
      }
    } catch (error) {
      if (normalizedPage === 1) setLoadError(true);
      showError(error?.message || error);
    } finally {
      setLoading(false);
    }
  }, []);

  const onPaginationChange = (e, { activePage, pageSize: nextPageSize }) => {
    (async () => {
      const size = Number(nextPageSize) > 0 ? Number(nextPageSize) : pageSize;
      if (size !== pageSize) {
        pageSizeRef.current = size;
        setPageSize(size);
        setActivePage(1);
        if (!isSearchMode) {
          // 每页条数变了,按旧尺寸建立的行缓存已失效,重建
          setRedemptions([]);
          await loadRedemptions(1, { status: statusFilter });
        }
        return;
      }
      const nextPage = Number(activePage) > 0 ? Number(activePage) : 1;
      const hasLoadedPageRows = hasLoadedPagedRows(redemptions, nextPage, size);
      if (!isSearchMode && !hasLoadedPageRows) {
        await loadRedemptions(nextPage, { status: statusFilter });
      }
      setActivePage(nextPage);
    })();
  };

  useEffect(() => {
    setLoading(true);
    setActivePage(1);
    loadRedemptions(1, { status: statusFilter })
      .then()
      .catch((reason) => {
        showError(reason);
      });
  }, [loadRedemptions, statusFilter]);

  useEffect(() => {
    loadDisplayUnits().then();
  }, [loadDisplayUnits]);

  const manageRedemption = async (id, action, idx) => {
    let data = { id };
    let res;
    switch (action) {
      case 'delete':
        res = await API.delete(`/api/v1/admin/redemption/${id}/`);
        break;
      case 'enable':
        data.status = 1;
        res = await API.put('/api/v1/admin/redemption/?status_only=true', data);
        break;
      case 'disable':
        data.status = 2;
        res = await API.put('/api/v1/admin/redemption/?status_only=true', data);
        break;
      default:
        return;
    }
    const { success, message } = res.data;
    if (success) {
      showSuccess(t('token.messages.operation_success'));
      let redemption = res.data.data;
      let newRedemptions = [...redemptions];
      let realIdx = (activePage - 1) * pageSize + idx;
      if (action === 'delete') {
        newRedemptions[realIdx].deleted = true;
        setTotalCount((prev) => Math.max(prev - 1, 0));
      } else {
        newRedemptions[realIdx].status = redemption.status;
      }
      setRedemptions(newRedemptions);
    } else {
      showError(message);
    }
  };

  const searchRedemptions = async () => {
    if (searchKeyword === '') {
      // if keyword is blank, load files instead.
      await loadRedemptions(1, { status: statusFilter });
      setActivePage(1);
      return;
    }
    setSearching(true);
    const res = await API.get(
      `/api/v1/admin/redemption/search?keyword=${searchKeyword}`
    );
    const { success, message, data } = res.data;
    if (success) {
      setIsSearchMode(true);
      setTotalCount(Array.isArray(data) ? data.length : 0);
      setRedemptions((Array.isArray(data) ? data : []).map(normalizeRedemptionRow));
      setActivePage(1);
    } else {
      showError(message);
    }
    setSearching(false);
  };

  const handleKeywordChange = async (e, { value }) => {
    setSearchKeyword(value.trim());
  };

  useEffect(() => {
    const firstRun = !initializedSearchRef.current;
    initializedSearchRef.current = true;
    if (firstRun && searchKeyword === '') {
      // Initial list load is owned by the filter effect; only auto-run search
      // on mount when a keyword was restored from the URL.
      return undefined;
    }
    const timer = window.setTimeout(() => {
      searchRedemptions().catch((error) => {
        showError(error?.message || error);
      });
    }, 250);
    return () => {
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKeyword]);

  const handleTableChange = (_, __, sorter) => {
    if (!sorter || Array.isArray(sorter) || !sorter.columnKey || !sorter.order) {
      setTableSorter({ columnKey: null, order: null });
      return;
    }
    setTableSorter({
      columnKey: sorter.columnKey,
      order: sorter.order,
    });
  };

  const refresh = async () => {
    setLoading(true);
    await loadRedemptions(1, { status: statusFilter });
    setActivePage(1);
  };

  const visibleRedemptionCount = redemptions.filter((row) => !row?.deleted).length;
  const paginationTotal = isSearchMode ? visibleRedemptionCount : totalCount;

  return (
    <>
      <AppFilterHeader
        className='router-block-gap-md'
        breadcrumbs={[
          { key: 'workspace', label: t('header.admin_workspace') },
          { key: 'business', label: t('header.operation') },
          { key: 'redemption', label: t('header.redemption'), active: true },
        ]}
        title={t('header.redemption')}
        meta={headerMeta}
        metaClassName='router-page-header-meta-links'
        actions={
          <div className='router-list-toolbar-actions'>
            <AppButton
              className='router-page-button'
              color='blue'
              onClick={() => navigate('/admin/redemption/add')}
            >
              {t('redemption.buttons.add')}
            </AppButton>
            <AppButton className='router-page-button' onClick={refresh} loading={loading}>
              {t('redemption.buttons.refresh')}
            </AppButton>
          </div>
        }
        query={
          <div className='router-list-toolbar-query'>
            <AppSelect
              className='router-section-select'
              value={statusFilter}
              onChange={(_, { value }) => patchQuery({ status: value })}
              options={[
                { value: 'all', label: t('redemption.filter.status_all') },
                { value: '1', label: t('redemption.status.unused') },
                { value: '2', label: t('redemption.status.disabled') },
                { value: '3', label: t('redemption.status.used') },
              ]}
            />
            <AppInput
              className='router-section-input'
              icon='search'
              fluid
              iconPosition='left'
              placeholder={t('redemption.search')}
              value={searchKeyword}
              loading={searching}
              onChange={handleKeywordChange}
            />
            <AppButton
              className='router-section-button'
              disabled={statusFilter === 'all' && searchKeyword === ''}
              onClick={() => patchQuery({ status: 'all', keyword: '' })}
            >
              {t('common.clear_filters')}
            </AppButton>
          </div>
        }
      />

      <div className='router-table-scroll-x'>
        <AppTable
          className='router-hover-table router-list-table router-table-fit-page router-redemption-list-table router-table-cardify'
          pagination={false}
          loading={loading}
          locale={{
            emptyText: loadError ? (
              <AppErrorState
                message={t('common.load_failed')}
                onRetry={refresh}
                retryText={t('common.retry')}
              />
            ) : (
              <AppEmpty>{t('common.no_data')}</AppEmpty>
            ),
          }}
          scroll={{ x: REDEMPTION_LIST_TABLE_MIN_WIDTH }}
          rowKey={(redemption) => redemption.id}
          onChange={handleTableChange}
          dataSource={redemptions
            .slice(
              (activePage - 1) * pageSize,
              activePage * pageSize,
            )
            .filter((redemption) => !redemption?.deleted)}
          onRow={(redemption) => ({
            className: 'router-row-clickable',
            onClick: () => {
              navigate(`/admin/redemption/${redemption.id}`, {
                state: {
                  from: currentPagePath,
                },
              });
            },
          })}
          columns={withCardLabels([
          {
            title: t('redemption.table.name'),
            dataIndex: 'name',
            key: 'name',
            width: REDEMPTION_LIST_COLUMN_WIDTHS.name,
            ellipsis: true,
            sorter: (a, b) => compareTextValue(a.name, b.name),
            sortDirections: ['ascend', 'descend'],
            sortOrder: tableSorter.columnKey === 'name' ? tableSorter.order : null,
            render: (value) => value || t('redemption.table.no_name'),
          },
          {
            title: t('redemption.table.status'),
            dataIndex: 'status',
            key: 'status',
            className: 'router-table-col-status-compact',
            width: REDEMPTION_LIST_COLUMN_WIDTHS.status,
            sorter: (a, b) => compareNumberValue(a.status, b.status),
            sortDirections: ['ascend', 'descend'],
            sortOrder: tableSorter.columnKey === 'status' ? tableSorter.order : null,
            render: (value) => renderStatus(value, t),
          },
          {
            title: '权益名称',
            key: 'product_name_snapshot',
            width: REDEMPTION_LIST_COLUMN_WIDTHS.faceValue,
            render: (_, redemption) => redemption?.product_name_snapshot || redemption?.entitlement_product_id || '-',
          },
          {
            title: t('redemption.table.created_time'),
            key: 'created_time',
            className: 'router-table-col-datetime',
            width: REDEMPTION_LIST_COLUMN_WIDTHS.createdTime,
            sorter: (a, b) => compareNumberValue(a.createdTime, b.createdTime),
            sortDirections: ['ascend', 'descend'],
            sortOrder:
              tableSorter.columnKey === 'created_time' ? tableSorter.order : null,
            render: (_, redemption) =>
              renderTimestamp(redemption.createdTime || redemption.created_time),
          },
          {
            title: '过期时间',
            dataIndex: 'code_expires_at',
            key: 'code_expires_at',
            className: 'router-table-col-datetime',
            width: REDEMPTION_LIST_COLUMN_WIDTHS.codeExpiresAt,
            sorter: (a, b) =>
              compareNumberValue(a.code_expires_at, b.code_expires_at),
            sortDirections: ['ascend', 'descend'],
            sortOrder:
              tableSorter.columnKey === 'code_expires_at'
                ? tableSorter.order
                : null,
            render: (value) => renderExpiryTime(value, t),
          },
          {
            title: t('redemption.table.redeemed_time'),
            key: 'redeemed_time',
            className: 'router-table-col-datetime',
            width: REDEMPTION_LIST_COLUMN_WIDTHS.redeemedTime,
            sorter: (a, b) => compareNumberValue(a.redeemedTime, b.redeemedTime),
            sortDirections: ['ascend', 'descend'],
            sortOrder:
              tableSorter.columnKey === 'redeemed_time'
                ? tableSorter.order
                : null,
            render: (_, redemption) =>
              redemption.redeemedTime
                ? renderTimestamp(redemption.redeemedTime)
                : t('redemption.table.not_redeemed'),
          },
          {
            title: t('redemption.table.actions'),
            key: 'actions',
            className: 'router-table-col-actions-icon',
            width: 120,
            render: (_, redemption, idx) => (
              <div
                className='router-action-group-tight router-table-actions-icon-compact'
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <AppTableActionButton
                  icon='copy outline'
                  title={t('redemption.buttons.copy')}
                  color='blue'
                  onClick={async () => {
                    if (await copy(redemption.code)) {
                      showSuccess(t('token.messages.copy_success'));
                    } else {
                      showWarning(t('token.messages.copy_failed'));
                      setSearchKeyword(redemption.code);
                    }
                  }}
                />
                <AppPopconfirm
                  title={t('redemption.buttons.confirm_delete')}
                  onConfirm={() => {
                    manageRedemption(redemption.id, 'delete', idx);
                  }}
                >
                  <span>
                    <AppTableActionButton
                      icon='trash'
                      title={t('redemption.buttons.delete')}
                      color='red'
                    />
                  </span>
                </AppPopconfirm>
                <AppTableActionButton
                  icon={redemption.status === 1 ? 'close' : 'check'}
                  title={
                    redemption.status === 1
                      ? t('redemption.buttons.disable')
                      : t('redemption.buttons.enable')
                  }
                  disabled={redemption.status === 3}
                  onClick={() => {
                    manageRedemption(
                      redemption.id,
                      redemption.status === 1 ? 'disable' : 'enable',
                      idx,
                    );
                  }}
                />
              </div>
            ),
          },
          ])}
        />
      </div>
      <div className='router-pagination-wrap'>
        <AppPagination
          className='router-page-pagination'
          activePage={activePage}
          onPageChange={onPaginationChange}
          siblingRange={1}
          total={paginationTotal}
          pageSize={pageSize}
        />
      </div>
    </>
  );
};

export default RedemptionsTable;
