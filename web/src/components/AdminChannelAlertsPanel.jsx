import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { API } from '../helpers/api';
import { showError, withCardLabels } from '../helpers';
import useUrlState from '../hooks/useUrlState';
import {
  AppButton,
  AppDescriptions,
  AppDrawer,
  AppEmpty,
  AppErrorState,
  AppFilterHeader,
  AppInput,
  AppModal,
  AppPagination,
  AppSelect,
  AppSpin,
  AppTag,
  AppTable,
  AppTextarea,
  chartAxisStyle,
  chartCategoricalPalette,
  chartGridStyle,
  chartNeutralColor,
  chartStatusPalette,
  chartTooltipStyle,
} from '../router-ui';

// Type-distribution swatches use the validated categorical palette so they
// stay in lockstep with the rest of the dashboard charts. `unknown` falls
// back to theme-muted ink.
const ALERT_DISTRIBUTION_COLORS = {
  billing: chartCategoricalPalette[0],
  circuit: chartCategoricalPalette[1],
  model_disabled: chartCategoricalPalette[3],
  endpoint_disabled: chartCategoricalPalette[4],
  unknown: chartNeutralColor(),
};

const formatAlertTrendLabel = (timestamp) => {
  if (!Number.isFinite(Number(timestamp)) || Number(timestamp) <= 0) return '';
  const date = new Date(Number(timestamp) * 1000);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  return `${month}-${day} ${hour}:00`;
};

const ALERT_LEVEL_COLORS = {
  critical: 'red',
  warning: 'orange',
  info: 'blue',
};

const normalizeAlertLevel = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'critical' || normalized === 'error') return 'critical';
  if (normalized === 'warning' || normalized === 'warn') return 'warning';
  return 'info';
};

const normalizeAlertItems = (items) =>
  (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    channelId: item?.channel_id || '',
    channelName: item?.channel_name || '',
    createdAt: Number(item?.created_at || 0),
    acknowledgedAt: Number(item?.acknowledged_at || 0),
    acknowledgedBy: item?.acknowledged_by || '',
    resolvedAt: Number(item?.resolved_at || 0),
    resolvedBy: item?.resolved_by || '',
    operatorNote: item?.operator_note || '',
  }));

const formatActorTimestampLabel = (timestamp) =>
  timestamp > 0
    ? new Date(timestamp * 1000).toLocaleString('zh-CN', { hour12: false })
    : '-';

function AdminChannelAlertsPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [alertItems, setAlertItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [alertSummary, setAlertSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [acknowledgingAlertID, setAcknowledgingAlertID] = useState('');
  const [resolvingAlertID, setResolvingAlertID] = useState('');
  const [noteModal, setNoteModal] = useState({
    open: false,
    action: '',
    alert: null,
    note: '',
  });
  const [detailAlert, setDetailAlert] = useState(null);
  const [
    {
      status: statusFilter,
      type: typeFilter,
      level: levelFilter,
      time: timeFilter,
      keyword,
    },
    patchQuery,
  ] = useUrlState({
    status: { param: 'status', default: 'all' },
    type: { param: 'type', default: 'all' },
    level: { param: 'level', default: 'all' },
    time: { param: 'time', default: 'all' },
    keyword: { param: 'q', default: '' },
  });
  const [keywordInput, setKeywordInput] = useState(keyword);
  const [page, setPage] = useState(1);
  const [tableSorter, setTableSorter] = useState({
    columnKey: 'createdAt',
    order: 'descend',
  });
  const pageSize = 20;

  const loadAlertItems = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await API.get('/api/v1/admin/channel/alerts', {
        params: {
          limit: Math.max(page * pageSize, 100),
          page,
          page_size: pageSize,
          status: statusFilter,
          type: typeFilter === 'all' ? undefined : typeFilter,
          level: levelFilter === 'all' ? undefined : levelFilter,
          keyword: keyword === '' ? undefined : keyword,
          time: timeFilter === 'all' ? undefined : timeFilter,
        },
      });
      if (response?.data?.success !== true) {
        // 业务失败也要提示,否则和「无告警」空态无法区分。
        showError(
          response?.data?.message || t('dashboard.admin.alerts.load_failed'),
        );
        setLoadError(true);
        setAlertItems([]);
        setTotal(0);
        setAlertSummary(null);
        return;
      }
      const nextItems = normalizeAlertItems(
        response?.data?.data?.items || [],
      );
      setAlertItems(nextItems);
      setTotal(Number(response?.data?.data?.total || 0));
      setAlertSummary(response?.data?.data?.summary || null);
    } catch (error) {
      console.error('Failed to load channel alerts:', error);
      showError(error?.message || t('dashboard.admin.alerts.load_failed'));
      setLoadError(true);
      setAlertItems([]);
      setTotal(0);
      setAlertSummary(null);
    } finally {
      setLoading(false);
    }
  }, [keyword, levelFilter, page, pageSize, statusFilter, timeFilter, typeFilter, t]);

  useEffect(() => {
    loadAlertItems();
  }, [loadAlertItems]);

  useEffect(() => {
    setPage(1);
  }, [keyword, levelFilter, statusFilter, timeFilter, typeFilter]);

  const openNoteModal = useCallback((action, alert) => {
    setNoteModal({
      open: true,
      action,
      alert,
      note: '',
    });
  }, []);

  const closeNoteModal = useCallback(() => {
    if (acknowledgingAlertID || resolvingAlertID) {
      return;
    }
    setNoteModal({
      open: false,
      action: '',
      alert: null,
      note: '',
    });
  }, [acknowledgingAlertID, resolvingAlertID]);

  const openDetailDrawer = useCallback((alert) => {
    setDetailAlert(alert || null);
  }, []);

  const closeDetailDrawer = useCallback(() => {
    setDetailAlert(null);
  }, []);

  const submitNoteAction = useCallback(async () => {
    const action = String(noteModal?.action || '').trim();
    const alert = noteModal?.alert;
    const note = String(noteModal?.note || '').trim();
    if (!alert || (action !== 'acknowledge' && action !== 'resolve')) {
      return;
    }
    if (action === 'acknowledge') {
      const alertID = String(alert?.id || '').trim();
      const alertType = String(alert?.type || '').trim();
      const channelID = String(alert?.channel_id || alert?.channelId || '').trim();
      if (alertID === '' || alertType === '' || channelID === '') {
        return;
      }
      setAcknowledgingAlertID(alertID);
      try {
        const response = await API.post('/api/v1/admin/channel/alerts/acknowledge', {
          alert_type: alertType,
          alert_key: alertID,
          channel_id: channelID,
          note,
        });
        if (response?.data?.success === true) {
          // Only refetch — no optimistic setAlertItems. A previous optimistic
          // update combined with a fire-and-forget reload hid backend write
          // failures (interface returned 200 with success=false), since the
          // reload would happily re-overwrite the error state with stale data.
          setNoteModal({ open: false, action: '', alert: null, note: '' });
          await loadAlertItems();
        } else {
          showError(
            response?.data?.message || t('dashboard.admin.alerts.acknowledge_failed'),
          );
        }
      } catch (error) {
        console.error('Failed to acknowledge channel alert:', error);
        showError(error?.message || t('dashboard.admin.alerts.acknowledge_failed'));
      } finally {
        setAcknowledgingAlertID('');
      }
      return;
    }
    const alertID = String(alert?.id || '').trim();
    const alertType = String(alert?.type || '').trim();
    const channelID = String(alert?.channel_id || alert?.channelId || '').trim();
    if (alertID === '' || alertType === '' || channelID === '') {
      return;
    }
    setResolvingAlertID(alertID);
    try {
      const response = await API.post('/api/v1/admin/channel/alerts/resolve', {
        alert_type: alertType,
        alert_key: alertID,
        channel_id: channelID,
        note,
      });
      if (response?.data?.success === true) {
        // Same reasoning as acknowledge: skip the optimistic filter, only
        // refetch on confirmed success so backend write failures surface.
        setNoteModal({ open: false, action: '', alert: null, note: '' });
        await loadAlertItems();
      } else {
        showError(
          response?.data?.message || t('dashboard.admin.alerts.resolve_failed'),
        );
      }
    } catch (error) {
      console.error('Failed to resolve channel alert:', error);
      showError(error?.message || t('dashboard.admin.alerts.resolve_failed'));
    } finally {
      setResolvingAlertID('');
    }
  }, [loadAlertItems, noteModal]);

  const formatUpdatedAt = useCallback((value) => {
    if (!value) return '-';
    return new Date(Number(value) * 1000).toLocaleString('zh-CN', {
      hour12: false,
    });
  }, []);

  const renderAlertLevelTag = useCallback(
    (level) => {
      const normalized = normalizeAlertLevel(level);
      return (
        <AppTag color={ALERT_LEVEL_COLORS[normalized] || 'grey'} className='router-tag'>
          {t(`dashboard.admin.alerts.level.${normalized}`)}
        </AppTag>
      );
    },
    [t],
  );

  const renderAlertMeta = useCallback(
    (record) => {
      if (String(record?.status || '').trim() === 'resolved') {
        return (
          <div className='admin-dashboard-alert-meta'>
            {t('dashboard.admin.alerts.meta.resolved', {
              actor: String(record?.resolvedBy || record?.resolved_by || '').trim() || '-',
              time: formatActorTimestampLabel(
                Number(record?.resolvedAt || record?.resolved_at || 0),
              ),
            })}
          </div>
        );
      }
      if (String(record?.status || '').trim() === 'acknowledged') {
        return (
          <div className='admin-dashboard-alert-meta'>
            {t('dashboard.admin.alerts.meta.acknowledged', {
              actor: String(record?.acknowledgedBy || record?.acknowledged_by || '').trim() || '-',
              time: formatActorTimestampLabel(
                Number(record?.acknowledgedAt || record?.acknowledged_at || 0),
              ),
            })}
          </div>
        );
      }
      return null;
    },
    [t],
  );

  const displayAlertItems = alertItems;

  const compareTextValue = useCallback((left, right) => {
    return String(left || '').localeCompare(String(right || ''));
  }, []);

  const compareNumberValue = useCallback((left, right) => {
    return Number(left || 0) - Number(right || 0);
  }, []);

  const sortedAlertItems = useMemo(() => {
    const items = [...displayAlertItems];
    const { columnKey, order } = tableSorter;
    if (!columnKey || !order) {
      return items;
    }
    items.sort((left, right) => {
      let result = 0;
      switch (columnKey) {
        case 'level':
          result = compareTextValue(
            normalizeAlertLevel(left?.level),
            normalizeAlertLevel(right?.level),
          );
          break;
        case 'title':
          result = compareTextValue(left?.title, right?.title);
          break;
        case 'type':
          result = compareTextValue(left?.type, right?.type);
          break;
        case 'channelName':
          result = compareTextValue(
            left?.channelName || left?.channelId,
            right?.channelName || right?.channelId,
          );
          break;
        case 'summary':
          result = compareTextValue(left?.summary, right?.summary);
          break;
        case 'status':
          result = compareTextValue(left?.status, right?.status);
          break;
        case 'createdAt':
        default:
          result = compareNumberValue(left?.createdAt, right?.createdAt);
          break;
      }
      return order === 'ascend' ? result : -result;
    });
    return items;
  }, [compareNumberValue, compareTextValue, displayAlertItems, tableSorter]);

  const handleTableChange = useCallback((pagination, filters, sorter) => {
    const normalizedSorter = Array.isArray(sorter) ? sorter[0] : sorter;
    setTableSorter({
      columnKey: normalizedSorter?.columnKey || 'createdAt',
      order: normalizedSorter?.order || 'descend',
    });
  }, []);

  const totalPages = useMemo(() => {
    const normalizedTotal = Number(total || 0);
    return Math.max(1, Math.ceil(normalizedTotal / pageSize));
  }, [pageSize, total]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const statusOptions = useMemo(
    () => [
      {
        value: 'all',
        label: t('dashboard.admin.alerts.filters.status.all'),
      },
      {
        value: 'active',
        label: t('dashboard.admin.alerts.filters.status.active'),
      },
      {
        value: 'unacknowledged',
        label: t('dashboard.admin.alerts.filters.status.unacknowledged'),
      },
      {
        value: 'acknowledged',
        label: t('dashboard.admin.alerts.filters.status.acknowledged'),
      },
      {
        value: 'resolved',
        label: t('dashboard.admin.alerts.filters.status.resolved'),
      },
    ],
    [t],
  );

  const typeOptions = useMemo(
    () => [
      { key: 'all', value: 'all', text: t('dashboard.admin.alerts.filters.type.all') },
      { key: 'billing', value: 'billing', text: t('dashboard.admin.alerts.type_labels.billing') },
      { key: 'circuit', value: 'circuit', text: t('dashboard.admin.alerts.type_labels.circuit') },
      { key: 'model_disabled', value: 'model_disabled', text: t('dashboard.admin.alerts.type_labels.model_disabled') },
      { key: 'endpoint_disabled', value: 'endpoint_disabled', text: t('dashboard.admin.alerts.type_labels.endpoint_disabled') },
    ],
    [t],
  );

  const levelOptions = useMemo(
    () => [
      { key: 'all', value: 'all', text: t('dashboard.admin.alerts.filters.level.all') },
      { key: 'critical', value: 'critical', text: t('dashboard.admin.alerts.level.critical') },
      { key: 'warning', value: 'warning', text: t('dashboard.admin.alerts.level.warning') },
      { key: 'info', value: 'info', text: t('dashboard.admin.alerts.level.info') },
    ],
    [t],
  );

  const timeOptions = useMemo(
    () => [
      { key: 'all', value: 'all', text: t('dashboard.admin.alerts.filters.time.all') },
      { key: '24h', value: '24h', text: t('dashboard.admin.alerts.filters.time.last_24h') },
      { key: '7d', value: '7d', text: t('dashboard.admin.alerts.filters.time.last_7d') },
      { key: '30d', value: '30d', text: t('dashboard.admin.alerts.filters.time.last_30d') },
    ],
    [t],
  );

  const alertColumns = useMemo(
    () => withCardLabels([
      {
        title: t('dashboard.admin.alerts.columns.level'),
        dataIndex: 'level',
        key: 'level',
        columnKey: 'level',
        width: 88,
        sorter: true,
        sortDirections: ['ascend', 'descend'],
        sortOrder: tableSorter.columnKey === 'level' ? tableSorter.order : null,
        render: (_, record) => renderAlertLevelTag(record.level),
      },
      {
        title: t('dashboard.admin.alerts.columns.event'),
        dataIndex: 'title',
        key: 'title',
        columnKey: 'title',
        width: 220,
        sorter: true,
        sortDirections: ['ascend', 'descend'],
        sortOrder: tableSorter.columnKey === 'title' ? tableSorter.order : null,
        render: (_, record) => (
          <div className='admin-dashboard-alert-title-cell'>
            <div className='admin-dashboard-alert-event-text'>{record.title || '-'}</div>
          </div>
        ),
      },
      {
        title: t('dashboard.admin.alerts.columns.type'),
        dataIndex: 'type',
        key: 'type',
        columnKey: 'type',
        width: 104,
        sorter: true,
        sortDirections: ['ascend', 'descend'],
        sortOrder: tableSorter.columnKey === 'type' ? tableSorter.order : null,
        render: (_, record) => (
          <AppTag className='router-tag'>
            {t(`dashboard.admin.alerts.type_labels.${record.type}`, {
              defaultValue: record.type || '-',
            })}
          </AppTag>
        ),
      },
      {
        title: t('dashboard.admin.alerts.columns.channel'),
        dataIndex: 'channelName',
        key: 'channelName',
        columnKey: 'channelName',
        width: 180,
        ellipsis: true,
        sorter: true,
        sortDirections: ['ascend', 'descend'],
        sortOrder: tableSorter.columnKey === 'channelName' ? tableSorter.order : null,
        render: (_, record) =>
          record.channelId ? (
            <button
              type='button'
              className='admin-dashboard-user-link'
              title={record.channelName || record.channelId || '-'}
              onClick={(event) => {
                event.stopPropagation();
                navigate(`/admin/channel/detail/${encodeURIComponent(record.channelId)}`);
              }}
            >
              {record.channelName || record.channelId || '-'}
            </button>
          ) : (
            <span>{record.channelName || '-'}</span>
          ),
      },
      {
        title: t('dashboard.admin.alerts.columns.summary'),
        dataIndex: 'summary',
        key: 'summary',
        columnKey: 'summary',
        ellipsis: true,
        sorter: true,
        sortDirections: ['ascend', 'descend'],
        sortOrder: tableSorter.columnKey === 'summary' ? tableSorter.order : null,
        render: (_, record) => (
          <div className='admin-dashboard-alert-summary-cell'>
            <div className='admin-dashboard-alert-summary'>{record.summary || '-'}</div>
            <div className='admin-dashboard-alert-detail'>{record.detail || '-'}</div>
            <div className='admin-dashboard-alert-state'>
              {record.status === 'acknowledged'
                ? t('dashboard.admin.alerts.status.acknowledged')
                : record.status === 'resolved'
                  ? t('dashboard.admin.alerts.status.resolved')
                  : t('dashboard.admin.alerts.status.active')}
            </div>
            {record.operatorNote || record.operator_note ? (
              <div className='admin-dashboard-alert-note'>
                {t('dashboard.admin.alerts.note_prefix')}
                {record.operatorNote || record.operator_note}
              </div>
            ) : null}
            {renderAlertMeta(record)}
          </div>
        ),
      },
      {
        title: t('dashboard.admin.alerts.columns.time'),
        dataIndex: 'createdAt',
        key: 'createdAt',
        columnKey: 'createdAt',
        width: 180,
        sorter: true,
        sortDirections: ['ascend', 'descend'],
        sortOrder: tableSorter.columnKey === 'createdAt' ? tableSorter.order : null,
        render: (value) => formatUpdatedAt(value),
      },
      {
        title: t('dashboard.admin.alerts.columns.actions'),
        key: 'actions',
        width: 168,
        render: (_, record) => (
          <div className='admin-dashboard-alert-actions'>
            <AppButton
              color='blue'
              type='button'
              className='router-inline-button'
              loading={acknowledgingAlertID === record.id}
              disabled={record.status === 'acknowledged' || resolvingAlertID === record.id}
              onClick={(event) => {
                event.stopPropagation();
                openNoteModal('acknowledge', record);
              }}
            >
              {record.status === 'acknowledged'
                ? t('dashboard.admin.alerts.actions.acknowledged')
                : t('dashboard.admin.alerts.actions.acknowledge')}
            </AppButton>
            <AppButton
              type='button'
              className='router-inline-button'
              loading={resolvingAlertID === record.id}
              disabled={record.status !== 'acknowledged' || acknowledgingAlertID === record.id}
              onClick={(event) => {
                event.stopPropagation();
                openNoteModal('resolve', record);
              }}
            >
              {t('dashboard.admin.alerts.actions.resolve')}
            </AppButton>
          </div>
        ),
      },
    ]),
    [
      acknowledgingAlertID,
      formatUpdatedAt,
      navigate,
      openNoteModal,
      openDetailDrawer,
      renderAlertLevelTag,
      renderAlertMeta,
      resolvingAlertID,
      tableSorter,
      t,
    ],
  );

  const selectorControls = (
    <div className='admin-dashboard-alert-filter-selects admin-dashboard-alert-filter-selects-left'>
      <AppSelect
        className='router-section-dropdown'
        options={statusOptions.map((item) => ({
          key: item.value,
          value: item.value,
          text: item.label,
        }))}
        value={statusFilter}
        onChange={(e, { value }) => patchQuery({ status: value })}
      />
      <AppSelect
        className='router-section-dropdown'
        options={timeOptions}
        value={timeFilter}
        onChange={(e, { value }) => patchQuery({ time: value })}
      />
      <AppSelect
        className='router-section-dropdown'
        options={typeOptions}
        value={typeFilter}
        onChange={(e, { value }) => patchQuery({ type: value })}
      />
      <AppSelect
        className='router-section-dropdown'
        options={levelOptions}
        value={levelFilter}
        onChange={(e, { value }) => patchQuery({ level: value })}
      />
    </div>
  );

  const filtersActive =
    statusFilter !== 'all' ||
    typeFilter !== 'all' ||
    levelFilter !== 'all' ||
    timeFilter !== 'all' ||
    keyword !== '';

  const searchControls = (
    <div className='admin-dashboard-alert-search-controls'>
      <AppInput
        className='admin-dashboard-alert-search'
        value={keywordInput}
        placeholder={t('dashboard.admin.alerts.filters.search.placeholder')}
        onChange={(e, { value }) => setKeywordInput(value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            patchQuery({ keyword: String(keywordInput || '').trim() });
          }
        }}
      />
      <AppButton
        color='blue'
        type='button'
        className='router-page-button'
        onClick={() => patchQuery({ keyword: String(keywordInput || '').trim() })}
      >
        {t('dashboard.admin.alerts.filters.search.submit')}
      </AppButton>
      {filtersActive ? (
        <AppButton
          type='button'
          className='router-page-button'
          onClick={() => {
            setKeywordInput('');
            patchQuery({
              status: 'all',
              type: 'all',
              level: 'all',
              time: 'all',
              keyword: '',
            });
          }}
        >
          {t('common.clear_filters')}
        </AppButton>
      ) : null}
    </div>
  );

  const countLabel = t('dashboard.admin.alerts.page_count', {
    page_count: displayAlertItems.length,
    total_count: total,
  });

  const alertKpiCards = useMemo(() => {
    const summary = alertSummary || {};
    return [
      {
        key: 'unresolved_critical',
        label: t('dashboard.admin.alerts.kpis.unresolved_critical'),
        hint: t('dashboard.admin.alerts.kpis.unresolved_critical_hint'),
        value: Number(summary.unresolved_critical || 0),
        danger: Number(summary.unresolved_critical || 0) > 0,
      },
      {
        key: 'unacknowledged',
        label: t('dashboard.admin.alerts.kpis.unacknowledged'),
        hint: t('dashboard.admin.alerts.kpis.unacknowledged_hint'),
        value: Number(summary.unacknowledged || 0),
        danger: false,
      },
      {
        key: 'active_total',
        label: t('dashboard.admin.alerts.kpis.active_total'),
        hint: t('dashboard.admin.alerts.kpis.active_total_hint'),
        value: Number(summary.active_total || 0),
        danger: false,
      },
      {
        key: 'resolved_24h',
        label: t('dashboard.admin.alerts.kpis.resolved_24h'),
        hint: t('dashboard.admin.alerts.kpis.resolved_24h_hint'),
        value: Number(summary.resolved_24h || 0),
        danger: false,
      },
      {
        key: 'last_24h',
        label: t('dashboard.admin.alerts.kpis.last_24h'),
        hint: t('dashboard.admin.alerts.kpis.last_24h_hint'),
        value: Number(summary.last_24h || 0),
        danger: false,
      },
    ];
  }, [alertSummary, t]);

  const alertTypeDistribution = useMemo(() => {
    const buckets = Array.isArray(alertSummary?.type_distribution)
      ? alertSummary.type_distribution
      : [];
    const totalCount = buckets.reduce(
      (sum, item) => sum + Number(item?.count || 0),
      0,
    );
    return buckets.map((item) => {
      const label = String(item?.label || item?.key || '').trim();
      const count = Number(item?.count || 0);
      return {
        key: item?.key || label,
        label: t(`dashboard.admin.alerts.type_labels.${label}`, {
          defaultValue: label || '-',
        }),
        count,
        percent: totalCount > 0 ? (count / totalCount) * 100 : 0,
        color: ALERT_DISTRIBUTION_COLORS[label] || ALERT_DISTRIBUTION_COLORS.unknown,
      };
    });
  }, [alertSummary, t]);

  const alertChannelDistribution = useMemo(() => {
    const buckets = Array.isArray(alertSummary?.channel_distribution)
      ? alertSummary.channel_distribution
      : [];
    const maxCount = buckets.reduce(
      (max, item) => Math.max(max, Number(item?.count || 0)),
      0,
    );
    return buckets.map((item) => {
      const count = Number(item?.count || 0);
      return {
        key: item?.key || item?.label,
        label: String(item?.label || item?.key || '-').trim() || '-',
        count,
        percent: maxCount > 0 ? (count / maxCount) * 100 : 0,
      };
    });
  }, [alertSummary]);

  const alertTrendData = useMemo(() => {
    const points = Array.isArray(alertSummary?.trend) ? alertSummary.trend : [];
    return points.map((item) => ({
      bucket: Number(item?.bucket || 0),
      count: Number(item?.count || 0),
      label: formatAlertTrendLabel(item?.bucket),
    }));
  }, [alertSummary]);

  // Pull the active theme once per render so both Bar and Line variants of the
  // trend chart share the same axis/tooltip styling and pick the categorical
  // blue instead of an ad-hoc hex.
  const trendAxisStyle = useMemo(() => chartAxisStyle(), []);
  const trendGridStyle = useMemo(() => chartGridStyle(), []);
  const trendTooltipStyle = useMemo(() => chartTooltipStyle(), []);
  const trendSeriesColor = useMemo(
    () => chartCategoricalPalette[0] || chartStatusPalette.info,
    [],
  );
  const channelDistributionFill = useMemo(
    () => chartStatusPalette.warning,
    [],
  );

  const renderTrendChart = () => {
    if (alertTrendData.length === 0) return null;
    if (alertTrendData.length === 1) {
      return (
        <BarChart data={alertTrendData}>
          <CartesianGrid {...trendGridStyle} />
          <XAxis dataKey='label' {...trendAxisStyle} minTickGap={8} />
          <YAxis {...trendAxisStyle} allowDecimals={false} />
          <Tooltip contentStyle={trendTooltipStyle} />
          <Bar dataKey='count' fill={trendSeriesColor} radius={[4, 4, 0, 0]} />
        </BarChart>
      );
    }
    return (
      <LineChart data={alertTrendData}>
        <CartesianGrid {...trendGridStyle} />
        <XAxis dataKey='label' {...trendAxisStyle} minTickGap={8} />
        <YAxis {...trendAxisStyle} allowDecimals={false} />
        <Tooltip contentStyle={trendTooltipStyle} />
        <Line
          type='monotone'
          dataKey='count'
          stroke={trendSeriesColor}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    );
  };

  const channelDistributionLimit =
    Array.isArray(alertSummary?.channel_distribution) &&
    alertSummary.channel_distribution.length > 0
      ? alertSummary.channel_distribution.length
      : 8;

  const summaryPanel =
    alertSummary && Number(alertSummary.total || 0) > 0 ? (
      <div className='admin-dashboard-alert-summary'>
        <div className='admin-dashboard-alert-kpi-grid'>
          {alertKpiCards.map((card) => (
            <div
              key={card.key}
              className={`admin-dashboard-alert-kpi-card${
                card.danger ? ' is-danger' : ''
              }`}
            >
              <div className='admin-dashboard-alert-kpi-label'>{card.label}</div>
              <div className='admin-dashboard-alert-kpi-value'>{card.value}</div>
              <div className='admin-dashboard-alert-kpi-hint'>{card.hint}</div>
            </div>
          ))}
        </div>
        <div className='admin-dashboard-alert-analytics'>
          <div className='admin-dashboard-alert-analytics-card'>
            <div className='admin-dashboard-card-title'>
              {t('dashboard.admin.alerts.distribution.by_type')}
            </div>
            {alertTypeDistribution.length === 0 ? (
              <div className='admin-dashboard-empty'>
                {t('dashboard.admin.alerts.empty')}
              </div>
            ) : (
              <div className='admin-dashboard-alert-dist-list'>
                {alertTypeDistribution.map((item) => (
                  <div key={item.key} className='admin-dashboard-alert-dist-row'>
                    <span className='admin-dashboard-alert-dist-label'>
                      {item.label}
                    </span>
                    <span className='admin-dashboard-alert-dist-bar'>
                      <span
                        className='admin-dashboard-alert-dist-bar-fill'
                        style={{
                          width: `${Math.max(item.percent, 4)}%`,
                          background: item.color,
                        }}
                      />
                    </span>
                    <span className='admin-dashboard-alert-dist-count'>
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className='admin-dashboard-alert-analytics-card'>
            <div className='admin-dashboard-card-title'>
              {t('dashboard.admin.alerts.distribution.by_channel', {
                limit: channelDistributionLimit,
              })}
            </div>
            {alertChannelDistribution.length === 0 ? (
              <div className='admin-dashboard-empty'>
                {t('dashboard.admin.alerts.empty')}
              </div>
            ) : (
              <div className='admin-dashboard-alert-dist-list'>
                {alertChannelDistribution.map((item) => (
                  <div key={item.key} className='admin-dashboard-alert-dist-row'>
                    <span
                      className='admin-dashboard-alert-dist-label'
                      title={item.label}
                    >
                      {item.label}
                    </span>
                    <span className='admin-dashboard-alert-dist-bar'>
                      <span
                        className='admin-dashboard-alert-dist-bar-fill'
                        style={{
                          width: `${Math.max(item.percent, 4)}%`,
                          background: channelDistributionFill,
                        }}
                      />
                    </span>
                    <span className='admin-dashboard-alert-dist-count'>
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className='admin-dashboard-alert-analytics-card admin-dashboard-alert-analytics-trend'>
            <div className='admin-dashboard-card-title'>
              {t('dashboard.admin.alerts.distribution.trend_title')}
            </div>
            <div className='admin-dashboard-alert-dist-hint'>
              {t('dashboard.admin.alerts.distribution.trend_hint')}
            </div>
            {alertTrendData.length === 0 ? (
              <div className='admin-dashboard-empty'>
                {t('dashboard.admin.alerts.empty')}
              </div>
            ) : (
              <div className='chart-container'>
                <ResponsiveContainer width='100%' height={200}>
                  {renderTrendChart()}
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>
    ) : null;

  const content = (
    <div className='admin-dashboard-alerts-list'>
      <AppFilterHeader
        className='admin-dashboard-alert-list-toolbar'
        title={t('dashboard.admin.alerts.title')}
        meta={countLabel}
        picker={selectorControls}
        end={searchControls}
      />
      {summaryPanel}
      {loading ? (
        <div className='admin-dashboard-empty'>{t('common.loading')}</div>
      ) : loadError ? (
        <AppErrorState
          message={t('dashboard.admin.alerts.load_failed')}
          onRetry={loadAlertItems}
          retryText={t('common.retry')}
        />
      ) : displayAlertItems.length === 0 ? (
        <AppEmpty>{t('dashboard.admin.alerts.empty')}</AppEmpty>
      ) : (
        <div className='router-table-scroll-x'>
          <AppSpin spinning={loading}>
            <AppTable
              className='router-hover-table router-list-table router-table-fit-page admin-dashboard-alert-table router-table-cardify'
              columns={alertColumns}
              dataSource={sortedAlertItems}
              pagination={false}
              rowKey='id'
              onChange={handleTableChange}
              onRow={(record) => ({
                className: 'router-row-clickable',
                onClick: () => openDetailDrawer(record),
              })}
              scroll={{ x: 1040 }}
            />
          </AppSpin>
        </div>
      )}
      {totalPages > 1 ? (
        <div className='router-pagination-wrap'>
          <AppPagination
            className='router-page-pagination'
            activePage={page}
            totalPages={totalPages}
            siblingRange={1}
            boundaryRange={0}
            onPageChange={(e, { activePage }) => {
              setPage(Number(activePage || 1));
            }}
          />
        </div>
      ) : null}
    </div>
  );

  const detailDescriptionItems = useMemo(() => {
    if (!detailAlert) {
      return [];
    }
    return [
      {
        key: 'type',
        label: t('dashboard.admin.alerts.detail.type'),
        value: t(`dashboard.admin.alerts.type_labels.${detailAlert.type}`, {
          defaultValue: detailAlert.type || '-',
        }),
      },
      {
        key: 'level',
        label: t('dashboard.admin.alerts.detail.level'),
        value: t(`dashboard.admin.alerts.level.${normalizeAlertLevel(detailAlert.level)}`),
      },
      {
        key: 'status',
        label: t('dashboard.admin.alerts.detail.status'),
        value:
          detailAlert.status === 'acknowledged'
            ? t('dashboard.admin.alerts.status.acknowledged')
            : detailAlert.status === 'resolved'
              ? t('dashboard.admin.alerts.status.resolved')
              : t('dashboard.admin.alerts.status.active'),
      },
      {
        key: 'time',
        label: t('dashboard.admin.alerts.detail.occurred_at'),
        value: formatUpdatedAt(detailAlert.createdAt || detailAlert.created_at),
      },
      {
        key: 'channel',
        label: t('dashboard.admin.alerts.detail.channel'),
        value: detailAlert.channelName || detailAlert.channelId || '-',
      },
      {
        key: 'channel_id',
        label: t('dashboard.admin.alerts.detail.channel_id'),
        value: detailAlert.channelId || detailAlert.channel_id || '-',
      },
      {
        key: 'ack',
        label: t('dashboard.admin.alerts.detail.acknowledged'),
        value:
          String(detailAlert.acknowledgedBy || detailAlert.acknowledged_by || '').trim() === ''
            ? '-'
            : t('dashboard.admin.alerts.meta.acknowledged', {
                actor:
                  String(detailAlert.acknowledgedBy || detailAlert.acknowledged_by || '').trim() ||
                  '-',
                time: formatActorTimestampLabel(
                  Number(detailAlert.acknowledgedAt || detailAlert.acknowledged_at || 0),
                ),
              }),
      },
      {
        key: 'resolved',
        label: t('dashboard.admin.alerts.detail.resolved'),
        value:
          String(detailAlert.resolvedBy || detailAlert.resolved_by || '').trim() === ''
            ? '-'
            : t('dashboard.admin.alerts.meta.resolved', {
                actor:
                  String(detailAlert.resolvedBy || detailAlert.resolved_by || '').trim() || '-',
                time: formatActorTimestampLabel(
                  Number(detailAlert.resolvedAt || detailAlert.resolved_at || 0),
                ),
              }),
      },
    ];
  }, [detailAlert, formatUpdatedAt, t]);

  const detailDrawer = (
    <AppDrawer
      open={!!detailAlert}
      onClose={closeDetailDrawer}
      placement='right'
      size='large'
      title={detailAlert?.title || t('dashboard.admin.alerts.detail.title')}
      className='admin-dashboard-alert-detail-drawer'
    >
      <div className='router-page-stack'>
        <AppDescriptions
          items={detailDescriptionItems}
          column={1}
        />
        <div className='admin-dashboard-alert-detail-block'>
          <div className='admin-dashboard-alert-detail-heading'>
            {t('dashboard.admin.alerts.detail.summary')}
          </div>
          <div className='admin-dashboard-alert-detail-content'>
            {detailAlert?.summary || '-'}
          </div>
        </div>
        <div className='admin-dashboard-alert-detail-block'>
          <div className='admin-dashboard-alert-detail-heading'>
            {t('dashboard.admin.alerts.detail.reason')}
          </div>
          <div className='admin-dashboard-alert-detail-content'>
            {detailAlert?.detail || '-'}
          </div>
        </div>
        <div className='admin-dashboard-alert-detail-block'>
          <div className='admin-dashboard-alert-detail-heading'>
            {t('dashboard.admin.alerts.detail.note')}
          </div>
          <div className='admin-dashboard-alert-detail-content'>
            {detailAlert?.operatorNote || detailAlert?.operator_note || '-'}
          </div>
        </div>
        <div className='admin-dashboard-alert-detail-actions'>
          <AppButton
            type='button'
            className='router-inline-button'
            onClick={() => {
              closeDetailDrawer();
              navigate(`/admin/channel/detail/${encodeURIComponent(detailAlert?.channelId || '')}`);
            }}
            disabled={!detailAlert?.channelId}
          >
            {t('dashboard.admin.alerts.actions.view_channel')}
          </AppButton>
          <AppButton
            color='blue'
            type='button'
            disabled={
              !detailAlert ||
              detailAlert.status === 'acknowledged' ||
              resolvingAlertID === detailAlert.id
            }
            loading={acknowledgingAlertID === detailAlert?.id}
            onClick={() => {
              closeDetailDrawer();
              openNoteModal('acknowledge', detailAlert);
            }}
          >
            {detailAlert?.status === 'acknowledged'
              ? t('dashboard.admin.alerts.actions.acknowledged')
              : t('dashboard.admin.alerts.actions.acknowledge')}
          </AppButton>
          <AppButton
            type='button'
            className='router-inline-button'
            disabled={
              !detailAlert ||
              detailAlert.status !== 'acknowledged' ||
              acknowledgingAlertID === detailAlert.id
            }
            loading={resolvingAlertID === detailAlert?.id}
            onClick={() => {
              closeDetailDrawer();
              openNoteModal('resolve', detailAlert);
            }}
          >
            {t('dashboard.admin.alerts.actions.resolve')}
          </AppButton>
        </div>
      </div>
    </AppDrawer>
  );

  return (
    <>
      {content}
      {detailDrawer}
      <AppModal
        open={noteModal.open}
        onClose={closeNoteModal}
        size='small'
        title={
          noteModal.action === 'resolve'
            ? t('dashboard.admin.alerts.dialog.resolve_title')
            : t('dashboard.admin.alerts.dialog.acknowledge_title')
        }
        footer={null}
      >
        <div className='router-page-stack'>
          <div className='admin-dashboard-alert-dialog-hint'>
            {noteModal?.alert?.title || '-'}
          </div>
          <AppTextarea
            className='router-section-input'
            rows={4}
            value={noteModal.note}
            placeholder={t('dashboard.admin.alerts.dialog.note_placeholder')}
            onChange={(e) =>
              setNoteModal((current) => ({
                ...current,
                note: e?.target?.value || '',
              }))
            }
          />
          <div className='admin-dashboard-alert-dialog-actions'>
            <AppButton type='button' onClick={closeNoteModal}>
              {t('common.cancel')}
            </AppButton>
            <AppButton
              color='blue'
              type='button'
              loading={
                (noteModal.action === 'acknowledge' && acknowledgingAlertID !== '') ||
                (noteModal.action === 'resolve' && resolvingAlertID !== '')
              }
              onClick={submitNoteAction}
            >
              {t('common.confirm')}
            </AppButton>
          </div>
        </div>
      </AppModal>
    </>
  );
}

export default AdminChannelAlertsPanel;
