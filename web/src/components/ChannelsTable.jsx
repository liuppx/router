import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import ChannelSectionTabs from './ChannelSectionTabs';
import {
  API,
  showError,
  showInfo,
  showSuccess,
  timestamp2string,
  withCardLabels,
} from '../helpers';

import { ITEMS_PER_PAGE } from '../constants';
import {
  CHANNEL_LIST_COLUMN_WIDTHS,
  CHANNEL_LIST_TABLE_MIN_WIDTH,
} from '../constants/tableWidthPresets';
import {
  getChannelProtocolOptions,
  loadChannelProtocolOptions,
} from '../helpers/helper';
import useBatchRowActions from '../hooks/useBatchRowActions';
import useUrlState, { parseListPageSize } from '../hooks/useUrlState';
import {
  AppButton,
  AppEmpty,
  AppErrorState,
  AppFilterHeader,
  AppInput,
  AppInputNumber,
  AppFormActions,
  AppModal,
  AppPagination,
  AppPopconfirm,
  AppSelect,
  AppSpin,
  AppSwitch,
  AppTable,
  AppTableActionButton,
  AppTooltip,
} from '../router-ui';

const compareTextValue = (left, right) =>
  String(left || '').localeCompare(String(right || ''));

const compareNumberValue = (left, right) =>
  Number(left || 0) - Number(right || 0);

const compareArrayValue = (left, right) =>
  compareTextValue(
    Array.isArray(left) ? left.join(',') : left,
    Array.isArray(right) ? right.join(',') : right,
  );

function renderTimestamp(timestamp) {
  return <>{timestamp2string(timestamp)}</>;
}

function buildProtocolMap(options, t) {
  const protocolMap = {};
  if (Array.isArray(options)) {
    options.forEach((option) => {
      if (
        option &&
        typeof option.value === 'string' &&
        option.value.trim() !== ''
      ) {
        protocolMap[option.value] = option;
      }
    });
  }
  protocolMap.unknown = {
    value: 'unknown',
    text: t('channel.table.status_unknown'),
    color: 'grey',
  };
  return protocolMap;
}

function renderProtocol(protocol, protocolMap) {
  const normalized = (protocol || '').toString().trim().toLowerCase();
  const option = protocolMap[normalized] || protocolMap.unknown;
  const colorClassMap = {
    grey: 'router-text-muted',
    green: 'router-text-success',
    red: 'router-text-danger',
    yellow: 'router-text-warning',
    olive: 'router-text-olive',
    blue: 'router-text-info',
    orange: 'router-text-warning',
  };
  return (
    <span className={colorClassMap[option?.color] || undefined}>
      {option ? option.text : normalized || 'unknown'}
    </span>
  );
}

function getChannelDisplayName(channel) {
  const name = (channel?.name || '').toString().trim();
  if (name !== '') {
    return name;
  }
  return '-';
}

function renderChannelName(channel, t) {
  const displayName = getChannelDisplayName(channel);
  return <span>{displayName || t('channel.table.no_name')}</span>;
}

const channelStatusCreating = 4;
const ChannelsTable = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [totalChannels, setTotalChannels] = useState(0);
  const [searching, setSearching] = useState(false);
  const [disableBlockedImpact, setDisableBlockedImpact] = useState(null);
  const [statusMutatingId, setStatusMutatingId] = useState('');
  const [batchRunning, setBatchRunning] = useState(false);
  const batchActions = useBatchRowActions();
  const { isSelecting: isBatchSelecting, selectedCount: batchSelectedCount } = batchActions;
  const [
    { status: statusFilter, keyword: searchKeyword, pageSize },
    patchQuery,
  ] = useUrlState({
    status: { param: 'status', default: 'all' },
    keyword: { param: 'q', default: '' },
    pageSize: {
      param: 'page_size',
      default: ITEMS_PER_PAGE,
      parse: parseListPageSize,
    },
  });
  const currentPagePath = `${location.pathname}${location.search}${location.hash}`;
  const [tableSorter, setTableSorter] = useState({
    columnKey: 'created_time',
    order: 'descend',
  });
  const [protocolMap, setProtocolMap] = useState(() =>
    buildProtocolMap(getChannelProtocolOptions(), t)
  );

  const processChannelData = useCallback((channel) => {
    const next = { ...channel };
    next.id = (next.id || '').toString().trim();
    next.protocol = (next.protocol || '').toString().trim().toLowerCase();
    next.created_time = Number(next.created_time || 0);
    next.updated_at = Number(next.updated_at || 0);
    if (next.protocol === '') {
      next.protocol = 'openai';
    }
    return next;
  }, []);

  const loadChannels = useCallback(
    async ({ page = 1, keyword = '', status = 'all', pageSize: size = ITEMS_PER_PAGE } = {}) => {
      const normalizedPage = Number(page) > 0 ? Number(page) : 1;
      const normalizedSize = Number(size) > 0 ? Number(size) : ITEMS_PER_PAGE;
      const normalizedKeyword = (keyword || '').toString().trim();
      const normalizedStatus = (status || 'all').toString().trim().toLowerCase();
      try {
        const res = await API.get('/api/v1/admin/channels/', {
          params: {
            page: normalizedPage,
            page_size: normalizedSize,
            keyword: normalizedKeyword,
            status: normalizedStatus === 'all' ? '' : normalizedStatus,
          },
        });
        const { success, message, data } = res.data;
        if (success) {
          setLoadError(false);
          const items = Array.isArray(data?.items) ? data.items : [];
          setChannels(items.map(processChannelData));
          const total = Number(data?.total || 0);
          setTotalChannels(Number.isFinite(total) && total >= 0 ? total : 0);
        } else {
          setLoadError(true);
          showError(message);
        }
      } catch (error) {
        setLoadError(true);
        showError(error?.message || String(error));
      } finally {
        setLoading(false);
      }
    },
    [processChannelData]
  );

  useEffect(() => {
    setLoading(true);
    // Refetch from page 1 on mount and whenever the status filter or page size
    // changes, honoring the keyword already in the URL (so a refresh / shared
    // link with ?q= restores a filtered list). Keyword typing updates the URL
    // but must not retrigger a fetch here — that stays on Enter — so
    // searchKeyword is read but deliberately not a dependency.
    loadChannels({ page: 1, keyword: searchKeyword, status: statusFilter, pageSize })
      .then()
      .catch((reason) => {
        showError(reason);
      });
    setActivePage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, pageSize, loadChannels]);

  const onPaginationChange = (e, { activePage, pageSize: nextSize }) => {
    const size = Number(nextSize) > 0 ? Number(nextSize) : pageSize;
    if (size !== pageSize) {
      // Page-size change: writing the URL retriggers the effect above, which
      // reloads page 1 at the new size — so don't also fetch here.
      patchQuery({ pageSize: size });
      return;
    }
    (async () => {
      const nextPage = Number(activePage) > 0 ? Number(activePage) : 1;
      setLoading(true);
      await loadChannels({ page: nextPage, keyword: searchKeyword, status: statusFilter, pageSize });
      setActivePage(nextPage);
    })();
  };

  const refresh = async () => {
    setLoading(true);
    await loadChannels({ page: activePage, keyword: searchKeyword, status: statusFilter, pageSize });
  };

  useEffect(() => {
    let disposed = false;
    setProtocolMap(buildProtocolMap(getChannelProtocolOptions(), t));
    loadChannelProtocolOptions().then((options) => {
      if (disposed) {
        return;
      }
      setProtocolMap(buildProtocolMap(options, t));
    });
    return () => {
      disposed = true;
    };
  }, [t]);

  const manageChannel = async (id, action, value) => {
    const normalizedID = (id || '').toString().trim();
    if (normalizedID === '') {
      showError(t('channel.error.id_invalid'));
      return;
    }
    const isStatusAction = action === 'enable' || action === 'disable';
    if (isStatusAction) {
      setStatusMutatingId(normalizedID);
    }
    let data = { id: normalizedID };
    let res;
    try {
      switch (action) {
        case 'delete':
          res = await API.delete(
            `/api/v1/admin/channel/${encodeURIComponent(normalizedID)}/`
          );
          break;
        case 'enable':
          data.status = 1;
          res = await API.put('/api/v1/admin/channel/', data);
          break;
        case 'disable':
          data.status = 2;
          res = await API.put('/api/v1/admin/channel/', data);
          break;
        case 'priority':
          if (value === '') {
            return;
          }
          data.priority = parseInt(value);
          res = await API.put('/api/v1/admin/channel/', data);
          break;
        case 'weight':
          if (value === '') {
            return;
          }
          data.weight = parseInt(value);
          if (data.weight < 0) {
            data.weight = 0;
          }
          res = await API.put('/api/v1/admin/channel/', data);
          break;
        default:
          return;
      }
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('channel.messages.operation_success'));
        setLoading(true);
        await loadChannels({ page: activePage, keyword: searchKeyword, status: statusFilter, pageSize });
      } else {
        if (res?.data?.data?.code === 'channel_disable_blocked') {
          setDisableBlockedImpact(res?.data?.data?.impact || null);
        }
        showError(message);
      }
    } finally {
      if (isStatusAction) {
        setStatusMutatingId('');
      }
    }
  };

  // Batch enable/disable by looping the existing per-row PUT. The backend has
  // no batch endpoint for channel status, so we serialize N PUTs and report a
  // single aggregated result toast (success count / failure count) at the end
  // rather than showing the first error and dropping the rest.
  const runBatchToggle = useCallback(
    async (action) => {
      if (batchRunning) {
        return;
      }
      if (action !== 'enable' && action !== 'disable') {
        return;
      }
      const targetStatus = action === 'enable' ? 1 : 2;
      const keys = batchActions.selectedRowKeys;
      if (keys.length === 0) {
        showInfo(t('channel.batch.select_required'));
        return;
      }
      setBatchRunning(true);
      let successCount = 0;
      const failures = [];
      for (const id of keys) {
        try {
          const res = await API.put('/api/v1/admin/channel/', {
            id,
            status: targetStatus,
          });
          if (res?.data?.success) {
            successCount += 1;
          } else {
            failures.push({ id, message: res?.data?.message || '-' });
          }
        } catch (error) {
          failures.push({
            id,
            message: error?.message || String(error),
          });
        }
      }
      setBatchRunning(false);
      const failedCount = failures.length;
      if (failedCount === 0) {
        showSuccess(
          t(
            action === 'enable'
              ? 'channel.batch.enable_all_success'
              : 'channel.batch.disable_all_success',
            { count: successCount },
          ),
        );
      } else if (successCount === 0) {
        showError(
          t(
            action === 'enable'
              ? 'channel.batch.enable_all_failed'
              : 'channel.batch.disable_all_failed',
            { count: failedCount },
          ),
        );
      } else {
        showError(
          t('channel.batch.partial', {
            success: successCount,
            failed: failedCount,
          }),
        );
      }
      batchActions.exit();
      setLoading(true);
      await loadChannels({ page: activePage, keyword: searchKeyword, status: statusFilter, pageSize });
    },
    [activePage, batchActions, batchRunning, loadChannels, searchKeyword, statusFilter, t],
  );

  const statusTooltipText = (status, t) => {
    switch (status) {
      case 1:
        return t('channel.table.status_enabled');
      case 2:
        return t('channel.table.status_disabled_tip');
      case 3:
        return t('channel.table.status_auto_disabled_tip');
      case 5:
        return t('channel.table.status_half_open_tip');
      case channelStatusCreating:
        return t('channel.table.status_creating');
      default:
        return t('channel.table.status_unknown');
    }
  };

  const renderStatusSwitch = (channel) => {
    const status = Number(channel?.status || 0);
    const checked = status === 1;
    const disabled = status === channelStatusCreating || actionBusy;
    return (
      <div className='router-channel-status-switch' onClick={stopRowClick}>
        <AppTooltip title={statusTooltipText(status, t)}>
          <AppSwitch
            size='small'
            checked={checked}
            disabled={disabled}
            loading={statusMutatingId === channel.id}
            aria-label={t('channel.table.status')}
            onChange={(event, { checked: nextChecked }) => {
              manageChannel(channel.id, nextChecked ? 'enable' : 'disable');
            }}
          />
        </AppTooltip>
      </div>
    );
  };

  const renderCapabilities = (capabilities, t) => {
    const normalized = Array.isArray(capabilities)
      ? capabilities.filter(Boolean).map((item) => item.toString().toLowerCase())
      : [];
    if (normalized.length === 0) {
      return <span className='router-text-muted'>-</span>;
    }
    const order = ['text', 'image', 'audio', 'video'];
    const capabilitySet = new Set(normalized);
    const ordered = order.filter((item) => capabilitySet.has(item));
    return ordered.map((capability, index) => (
      <span key={`${capability}-${index}`}>
        {t(`channel.model_types.${capability}`, capability)}
        {index === ordered.length - 1 ? '' : ' / '}
      </span>
    ));
  };

  const searchChannels = async () => {
    setSearching(true);
    setLoading(true);
    try {
      await loadChannels({ page: 1, keyword: searchKeyword, status: statusFilter, pageSize });
      setActivePage(1);
    } catch (error) {
      showError(error?.message || String(error));
      setLoading(false);
    } finally {
      setSearching(false);
    }
  };

  const handleKeywordChange = (e, { value }) => {
    patchQuery({ keyword: value });
  };

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

  const pagedChannels = channels;
  const visibleChannels = pagedChannels.filter((channel) => !channel.deleted);
  const actionBusy = loading;

  const openChannelByStatus = async (channel) => {
    if (!channel || !channel.id) {
      return;
    }
    navigate(`/admin/channel/detail/${channel.id}`, {
      state: {
        from: currentPagePath,
        channelLabel: getChannelDisplayName(channel),
      },
    });
  };

  // Deep-link straight to the channel detail "publish" tab (URL-driven via
  // ?tab=publish). This is the discoverable entry point for publishing a
  // channel's models to customers — the publish UI otherwise only lives inside
  // the detail page with no link pointing at it.
  const openChannelPublish = (channel) => {
    if (!channel || !channel.id) {
      return;
    }
    navigate(`/admin/channel/detail/${channel.id}?tab=publish`, {
      state: {
        from: currentPagePath,
        channelLabel: getChannelDisplayName(channel),
      },
    });
  };

  const stopRowClick = (event) => {
    event.stopPropagation();
  };

  return (
    <>
      <AppFilterHeader
        breadcrumbs={[
          { key: 'admin', label: t('header.admin_workspace') },
          { key: 'resource', label: t('header.model') },
          { key: 'channel', label: t('header.channel'), active: true },
        ]}
        title={t('header.channel')}
        actions={
          <div className='router-list-toolbar-actions'>
            <AppButton
              className='router-page-button'
              color='blue'
              disabled={actionBusy || isBatchSelecting}
              onClick={() => navigate('/admin/channel/add')}
            >
              {t('channel.buttons.add')}
            </AppButton>
            {isBatchSelecting ? (
              <>
                <AppPopconfirm
                  title={t('channel.batch.confirm_enable', {
                    count: batchSelectedCount,
                  })}
                  okText={t('common.confirm')}
                  cancelText={t('common.cancel')}
                  disabled={batchSelectedCount === 0 || batchRunning}
                  onConfirm={() => runBatchToggle('enable')}
                >
                  <AppButton
                    className='router-page-button'
                    disabled={batchSelectedCount === 0 || batchRunning}
                    loading={batchRunning}
                  >
                    {t('channel.batch.enable_selected', {
                      count: batchSelectedCount,
                    })}
                  </AppButton>
                </AppPopconfirm>
                <AppPopconfirm
                  title={t('channel.batch.confirm_disable', {
                    count: batchSelectedCount,
                  })}
                  okText={t('common.confirm')}
                  cancelText={t('common.cancel')}
                  disabled={batchSelectedCount === 0 || batchRunning}
                  onConfirm={() => runBatchToggle('disable')}
                >
                  <AppButton
                    className='router-page-button'
                    color='red'
                    disabled={batchSelectedCount === 0 || batchRunning}
                    loading={batchRunning}
                  >
                    {t('channel.batch.disable_selected', {
                      count: batchSelectedCount,
                    })}
                  </AppButton>
                </AppPopconfirm>
                <AppButton
                  className='router-page-button'
                  disabled={batchRunning}
                  onClick={batchActions.exit}
                >
                  {t('channel.batch.cancel_selection')}
                </AppButton>
              </>
            ) : (
              <AppButton
                className='router-page-button'
                disabled={actionBusy}
                onClick={batchActions.enter}
              >
                {t('channel.batch.enter_selection')}
              </AppButton>
            )}
            <AppButton
              className='router-page-button'
              onClick={refresh}
              loading={loading}
              disabled={actionBusy || batchRunning}
            >
              {t('channel.buttons.refresh')}
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
                { value: 'all', label: t('channel.filter.status_all') },
                { value: 'enabled', label: t('channel.table.status_enabled') },
                { value: 'disabled', label: t('channel.table.status_disabled_tip') },
                { value: 'creating', label: t('channel.table.status_creating') },
              ]}
            />
            <AppInput
              className='router-section-input'
              icon='search'
              iconPosition='left'
              fluid
              placeholder={t('channel.search')}
              value={searchKeyword}
              loading={searching}
              onChange={handleKeywordChange}
              onPressEnter={searchChannels}
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
      <ChannelSectionTabs active='list' />
      <div className='router-table-scroll-x'>
        <AppSpin spinning={loading}>
          <AppTable
            className='router-hover-table router-list-table router-table-fit-page router-table-cardify'
          pagination={false}
          scroll={{ x: CHANNEL_LIST_TABLE_MIN_WIDTH }}
          rowKey={(channel) => channel.id}
          onChange={handleTableChange}
          rowSelection={
            isBatchSelecting
              ? {
                  ...batchActions.tableSelection,
                  renderCell: (_, __, ___, originNode) => (
                    <span onClick={stopRowClick}>{originNode}</span>
                  ),
                }
              : undefined
          }
          dataSource={visibleChannels}
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
              <AppEmpty>{t('common.no_data')}</AppEmpty>
            ),
          }}
          onRow={(channel) => ({
            onClick: isBatchSelecting
              ? undefined
              : () => openChannelByStatus(channel),
            className: isBatchSelecting ? undefined : 'router-row-clickable',
          })}
          columns={withCardLabels([
          {
            title: t('channel.table.id'),
            dataIndex: 'name',
            key: 'name',
            width: CHANNEL_LIST_COLUMN_WIDTHS.name,
            ellipsis: true,
            sorter: (a, b) => compareTextValue(a.name, b.name),
            sortDirections: ['ascend', 'descend'],
            sortOrder: tableSorter.columnKey === 'name' ? tableSorter.order : null,
            render: (_, channel) => renderChannelName(channel, t),
          },
          {
            title: t('channel.table.type'),
            dataIndex: 'protocol',
            key: 'protocol',
            className: 'router-table-col-type-narrow',
            width: CHANNEL_LIST_COLUMN_WIDTHS.type,
            sorter: (a, b) => compareTextValue(a.protocol, b.protocol),
            sortDirections: ['ascend', 'descend'],
            sortOrder:
              tableSorter.columnKey === 'protocol' ? tableSorter.order : null,
            render: (value) => renderProtocol(value, protocolMap),
          },
          {
            title: t('channel.table.status'),
            dataIndex: 'status',
            key: 'status',
            className: 'router-table-col-status-compact',
            width: CHANNEL_LIST_COLUMN_WIDTHS.status,
            sorter: (a, b) => compareNumberValue(a.status, b.status),
            sortDirections: ['ascend', 'descend'],
            sortOrder: tableSorter.columnKey === 'status' ? tableSorter.order : null,
            render: (_, channel) => renderStatusSwitch(channel),
          },
          {
            title: t('channel.table.created_time'),
            dataIndex: 'created_time',
            key: 'created_time',
            className: 'router-table-col-datetime',
            width: CHANNEL_LIST_COLUMN_WIDTHS.createdAt,
            sorter: (a, b) => compareNumberValue(a.created_time, b.created_time),
            sortDirections: ['ascend', 'descend'],
            sortOrder:
              tableSorter.columnKey === 'created_time' ? tableSorter.order : null,
            render: (value) => (value ? renderTimestamp(value) : '-'),
          },
          {
            title: t('channel.table.updated_at'),
            dataIndex: 'updated_at',
            key: 'updated_at',
            className: 'router-table-col-datetime',
            width: CHANNEL_LIST_COLUMN_WIDTHS.updatedAt,
            sorter: (a, b) => compareNumberValue(a.updated_at, b.updated_at),
            sortDirections: ['ascend', 'descend'],
            sortOrder:
              tableSorter.columnKey === 'updated_at' ? tableSorter.order : null,
            render: (value) => (value ? renderTimestamp(value) : '-'),
          },
          {
            title: t('channel.table.capabilities'),
            dataIndex: 'capabilities',
            key: 'capabilities',
            width: CHANNEL_LIST_COLUMN_WIDTHS.capabilities,
            ellipsis: true,
            sorter: (a, b) => compareArrayValue(a.capabilities, b.capabilities),
            sortDirections: ['ascend', 'descend'],
            sortOrder:
              tableSorter.columnKey === 'capabilities' ? tableSorter.order : null,
            render: (value) => renderCapabilities(value, t),
          },
          {
            title: t('channel.table.priority'),
            dataIndex: 'priority',
            key: 'priority',
            className: 'router-table-col-status-compact',
            width: CHANNEL_LIST_COLUMN_WIDTHS.priority,
            sorter: (a, b) => compareNumberValue(a.priority, b.priority),
            sortDirections: ['ascend', 'descend'],
            sortOrder:
              tableSorter.columnKey === 'priority' ? tableSorter.order : null,
            render: (value, channel) => (
              <div onClick={stopRowClick}>
                <AppTooltip title={t('channel.table.priority_tip')}>
                  <AppInputNumber
                    className='router-inline-number-input router-inline-input-short'
                    defaultValue={value}
                    onBlur={(event) => {
                      manageChannel(channel.id, 'priority', event.target.value);
                    }}
                  />
                </AppTooltip>
              </div>
            ),
          },
          {
            title: t('channel.table.actions'),
            key: 'actions',
            className: 'router-table-col-actions-icon',
            width: 104,
            render: (_, channel) => (
              <div
                className='router-action-group-tight router-table-actions-icon-compact'
                onClick={stopRowClick}
              >
                {(channel.protocol || '').toString().trim().toLowerCase() !==
                'proxy' ? (
                  <AppTableActionButton
                    icon='cloud upload'
                    title={t('channel.edit.detail_tabs.publish')}
                    onClick={() => {
                      openChannelPublish(channel);
                    }}
                  />
                ) : null}
                <AppPopconfirm
                  title={t('channel.buttons.confirm_delete')}
                  onConfirm={() => {
                    manageChannel(channel.id, 'delete');
                  }}
                >
                  <span>
                    <AppTableActionButton
                      icon='trash'
                      title={t('channel.buttons.delete')}
                      color='red'
                    />
                  </span>
                </AppPopconfirm>
              </div>
            ),
          },
          ])}
          />
        </AppSpin>
      </div>
      <AppModal
        size='small'
        open={!!disableBlockedImpact}
        onClose={() => setDisableBlockedImpact(null)}
        title={t('channel.messages.disable_blocked_title')}
        footer={
          <AppFormActions>
            <AppButton type='button' onClick={() => setDisableBlockedImpact(null)}>
              {t('channel.buttons.confirm')}
            </AppButton>
          </AppFormActions>
        }
      >
        <div className='router-block-gap-sm'>
          <div>{t('channel.messages.disable_blocked_description')}</div>
          {disableBlockedImpact?.channel_id ? (
            <div className='router-text-meta'>
              {t('channel.messages.disable_blocked_channel', {
                channel: disableBlockedImpact.channel_id,
              })}
            </div>
          ) : null}
          <div className='router-block-gap-xs'>
            {(Array.isArray(disableBlockedImpact?.groups)
              ? disableBlockedImpact.groups
              : []
            ).map((item, index) => {
              const groupID = (item?.group || '').toString().trim() || '-';
              const models = Array.isArray(item?.models) ? item.models : [];
              return (
                <div key={`${groupID}-${index}`} className='router-text-wrap'>
                  {models.length > 0
                    ? t('channel.messages.disable_blocked_group_with_models', {
                        group: groupID,
                        models: models.join(', '),
                      })
                    : t('channel.messages.disable_blocked_group', {
                        group: groupID,
                      })}
                </div>
              );
            })}
          </div>
        </div>
      </AppModal>
      <div className='router-pagination-wrap'>
        <AppPagination
          className='router-page-pagination'
          activePage={activePage}
          onPageChange={onPaginationChange}
          siblingRange={1}
          total={totalChannels}
          pageSize={pageSize}
        />
      </div>
    </>
  );
};

export default ChannelsTable;
