import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { API } from '../../helpers/api';
import { showError } from '../../helpers/utils';
import {
  buildPublicDisplayCurrencyIndex,
  convertChargeAmountToDisplayAmount,
  formatCompactDisplayAmount,
} from '../../helpers/billing';
import {
  AppButton,
  AppFilterHeader,
  AppIcon,
  AppInput,
  AppSegmented,
  AppSection,
  AppSelect,
  AppSpin,
  AppTag,
  AppTable,
  AppTooltip,
  AppToolbar,
  formatBillingPercent,
  BILLING_PERCENT_DECIMALS,
  chartAxisStyle,
  chartCategoricalPalette,
  chartGridStyle,
  chartNeutralColor,
  chartStatusPalette,
  chartTooltipStyle,
  chartTooltipLabelStyle,
  chartTooltipItemStyle,
  getActiveChartTheme,
} from '../../router-ui';
import './Dashboard.css';
import ChannelSectionTabs from '../../components/ChannelSectionTabs';
import UserSectionTabs from '../../components/UserSectionTabs';
import ModelSectionTabs from '../../components/ModelSectionTabs';
import './AdminDashboard.css';

const PERIOD_OPTIONS = [
  'today',
  'last_7_days',
  'last_30_days',
  'this_month',
  'last_month',
  'this_year',
  'all_time',
];

const TREND_METRIC_OPTIONS = [
  'spend_amount',
  'topup_amount',
  'request_count',
  'active_user_count',
];

const USER_GROWTH_GRANULARITY_OPTIONS = ['week', 'month'];
const USER_GROWTH_LINE_KEYS = ['new_user_count', 'active_user_count', 'topup_user_count'];
const USER_SEGMENT_FOCUS_LIMIT = 100;

const DASHBOARD_SECTIONS = ['spending', 'channels', 'users', 'models'];
const DASHBOARD_SECTION_TITLES = {
  spending: 'dashboard.admin.nav.spending',
  channels: 'dashboard.admin.nav.channels',
  users: 'dashboard.admin.nav.users',
  models: 'dashboard.admin.nav.models',
};

const MODEL_SORT_OPTIONS = [
  'spend',
  'requests',
  'health',
  'latency',
];

const CHANNEL_SORT_OPTIONS = [
  'health',
  'pass_rate',
  'latency',
  'requests',
];

const EMPTY_SUMMARY = {
  spend_amount: 0,
  topup_amount: 0,
  net_amount: 0,
  request_count: 0,
  active_user_count: 0,
  channel_total: 0,
  channel_enabled: 0,
  channel_disabled: 0,
  group_total: 0,
  provider_total: 0,
  task_active_total: 0,
  task_failed_total: 0,
};

const EMPTY_CHANNEL_HEALTH_SUMMARY = {
  with_tests: 0,
  without_tests: 0,
  avg_pass_rate: 0,
  avg_coverage_rate: 0,
  avg_latency_ms: 0,
  needs_retest: 0,
  risk_count: 0,
  active_circuit_breaker_count: 0,
  high_latency_count: 0,
};

const EMPTY_USER_GROWTH_COMPARISON = {
  current: 0,
  previous: 0,
  delta: 0,
  growth_rate: 0,
  has_baseline: false,
};

const EMPTY_USER_GROWTH_SUMMARY = {
  granularity: 'week',
  current: {
    bucket: '',
    start_timestamp: 0,
    end_timestamp: 0,
    new_user_count: 0,
    active_user_count: 0,
    topup_user_count: 0,
    request_count: 0,
  },
  previous: {
    bucket: '',
    start_timestamp: 0,
    end_timestamp: 0,
    new_user_count: 0,
    active_user_count: 0,
    topup_user_count: 0,
    request_count: 0,
  },
  new_users: EMPTY_USER_GROWTH_COMPARISON,
  active_users: EMPTY_USER_GROWTH_COMPARISON,
  topup_users: EMPTY_USER_GROWTH_COMPARISON,
};

const EMPTY_DASHBOARD = {
  period: 'last_7_days',
  granularity: 'day',
  start_timestamp: 0,
  end_timestamp: 0,
  summary: EMPTY_SUMMARY,
  trend: [],
  top_channels: [],
  usage_summary: {
    user_count: 0,
    request_count: 0,
    total_tokens: 0,
    spend_amount: 0,
    top_username: '',
    top_user_share: 0,
  },
  usage_totals: {
    user_count: 0,
    request_count: 0,
    total_tokens: 0,
    spend_amount: 0,
  },
  usage_rank: [],
  user_growth_summary: EMPTY_USER_GROWTH_SUMMARY,
  user_growth_trend: [],
  model_summary: {
    selected_model_count: 0,
    tested_model_count: 0,
    healthy_model_count: 0,
    warning_model_count: 0,
    critical_model_count: 0,
    request_count: 0,
    total_tokens: 0,
    spend_amount: 0,
    avg_pass_rate: 0,
    avg_latency_ms: 0,
  },
  channel_health_summary: EMPTY_CHANNEL_HEALTH_SUMMARY,
  top_models: [],
  generated_at: 0,
};

const HEALTH_LEVEL_COLORS = {
  healthy: chartStatusPalette.success,
  warning: chartStatusPalette.warning,
  critical: chartStatusPalette.danger,
  unknown: chartNeutralColor(),
};

const CHANNEL_HEALTH_HISTORY_SIZE = 60;

const CHANNEL_HEALTH_POINT_COLORS = {
  success: chartStatusPalette.success,
  warning: chartStatusPalette.warning,
  failure: chartStatusPalette.danger,
  unknown: chartNeutralColor(),
};

const USER_GROWTH_LINE_COLORS = {
  new_user_count: chartCategoricalPalette[0],
  active_user_count: chartCategoricalPalette[2],
  topup_user_count: chartCategoricalPalette[1],
};

const ACTIVE_CIRCUIT_BREAKER_STATES = new Set(['open', 'half_open']);

const formatCount = (value) => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString('zh-CN');
};

const normalizeAdminDashboardPayload = (payload) => {
  const summary = payload?.summary || {};
  const trend = Array.isArray(payload?.trend) ? payload.trend : [];
  const topChannels = Array.isArray(payload?.top_channels)
    ? payload.top_channels
    : [];
  const usageSummary = payload?.usage_summary || {};
  const usageTotals = payload?.usage_totals || {};
  const usageRank = Array.isArray(payload?.usage_rank) ? payload.usage_rank : [];
  const userGrowthSummary = payload?.user_growth_summary || {};
  const userGrowthTrend = Array.isArray(payload?.user_growth_trend)
    ? payload.user_growth_trend
    : [];
  const modelSummary = payload?.model_summary || {};
  const channelHealthSummary = payload?.channel_health_summary || {};
  const topModels = Array.isArray(payload?.top_models) ? payload.top_models : [];
  return {
    ...EMPTY_DASHBOARD,
    ...(payload || {}),
    summary: {
      ...EMPTY_SUMMARY,
      ...summary,
      spend_amount: Number(summary?.consume_amount ?? summary?.consume_quota ?? 0),
      topup_amount: Number(summary?.topup_amount ?? summary?.topup_quota ?? 0),
      net_amount: Number(summary?.net_amount ?? summary?.net_quota ?? 0),
    },
    trend: trend.map((item) => ({
      ...item,
      spend_amount: Number(item?.consume_amount ?? item?.consume_quota ?? 0),
      topup_amount: Number(item?.topup_amount ?? item?.topup_quota ?? 0),
    })),
    top_channels: topChannels.map((item) => ({
      ...item,
      usedYyc: Number(item?.used_amount ?? item?.used_quota ?? 0),
      circuit_breaker:
        item?.circuit_breaker && typeof item.circuit_breaker === 'object'
          ? item.circuit_breaker
          : null,
      health_points: Array.isArray(item?.health_points)
        ? item.health_points.map((point) => ({
            ...point,
            state: normalizeChannelHealthPointState(point),
            bucket_start: Number(point?.bucket_start || 0),
            bucket_end: Number(point?.bucket_end || 0),
            success_count: Number(point?.success_count || 0),
            failure_count: Number(point?.failure_count || 0),
            total_count: Number(point?.total_count || 0),
            avg_latency_ms: Number(point?.avg_latency_ms || 0),
            pass_rate: Number(point?.pass_rate || 0),
          }))
        : [],
    })),
    channel_health_summary: {
      with_tests: Number(channelHealthSummary?.with_tests || 0),
      without_tests: Number(channelHealthSummary?.without_tests || 0),
      avg_pass_rate: Number(channelHealthSummary?.avg_pass_rate || 0),
      avg_coverage_rate: Number(channelHealthSummary?.avg_coverage_rate || 0),
      avg_latency_ms: Number(channelHealthSummary?.avg_latency_ms || 0),
      needs_retest: Number(channelHealthSummary?.needs_retest || 0),
      risk_count: Number(channelHealthSummary?.risk_count || 0),
      active_circuit_breaker_count: Number(
        channelHealthSummary?.active_circuit_breaker_count || 0,
      ),
      high_latency_count: Number(channelHealthSummary?.high_latency_count || 0),
    },
    usage_summary: {
      user_count: Number(usageSummary?.user_count || 0),
      request_count: Number(usageSummary?.request_count || 0),
      total_tokens: Number(usageSummary?.total_tokens || 0),
      spend_amount: Number(usageSummary?.spend_amount ?? usageSummary?.spend_quota ?? 0),
      top_username: String(usageSummary?.top_username || ''),
      top_user_share: Number(usageSummary?.top_user_share || 0),
    },
    usage_totals: {
      user_count: Number(usageTotals?.user_count || 0),
      request_count: Number(usageTotals?.request_count || 0),
      total_tokens: Number(usageTotals?.total_tokens || 0),
      spend_amount: Number(usageTotals?.spend_amount ?? usageTotals?.spend_quota ?? 0),
    },
    usage_rank: usageRank.map((item) => ({
      ...item,
      request_count: Number(item?.request_count || 0),
      total_tokens: Number(item?.total_tokens || 0),
      spend_amount: Number(item?.spend_amount ?? item?.spend_quota ?? 0),
      balance_amount: Number(item?.balance_amount || 0),
      share_rate: Number(item?.share_rate || 0),
      last_used_at: Number(item?.last_used_at || 0),
    })),
    user_growth_summary: {
      ...EMPTY_USER_GROWTH_SUMMARY,
      ...(userGrowthSummary || {}),
      current: {
        ...EMPTY_USER_GROWTH_SUMMARY.current,
        ...(userGrowthSummary?.current || {}),
        new_user_count: Number(userGrowthSummary?.current?.new_user_count || 0),
        active_user_count: Number(userGrowthSummary?.current?.active_user_count || 0),
        topup_user_count: Number(userGrowthSummary?.current?.topup_user_count || 0),
        request_count: Number(userGrowthSummary?.current?.request_count || 0),
        start_timestamp: Number(userGrowthSummary?.current?.start_timestamp || 0),
        end_timestamp: Number(userGrowthSummary?.current?.end_timestamp || 0),
      },
      previous: {
        ...EMPTY_USER_GROWTH_SUMMARY.previous,
        ...(userGrowthSummary?.previous || {}),
        new_user_count: Number(userGrowthSummary?.previous?.new_user_count || 0),
        active_user_count: Number(userGrowthSummary?.previous?.active_user_count || 0),
        topup_user_count: Number(userGrowthSummary?.previous?.topup_user_count || 0),
        request_count: Number(userGrowthSummary?.previous?.request_count || 0),
        start_timestamp: Number(userGrowthSummary?.previous?.start_timestamp || 0),
        end_timestamp: Number(userGrowthSummary?.previous?.end_timestamp || 0),
      },
      new_users: {
        ...EMPTY_USER_GROWTH_COMPARISON,
        ...(userGrowthSummary?.new_users || {}),
        current: Number(userGrowthSummary?.new_users?.current || 0),
        previous: Number(userGrowthSummary?.new_users?.previous || 0),
        delta: Number(userGrowthSummary?.new_users?.delta || 0),
        growth_rate: Number(userGrowthSummary?.new_users?.growth_rate || 0),
        has_baseline: Boolean(userGrowthSummary?.new_users?.has_baseline),
      },
      active_users: {
        ...EMPTY_USER_GROWTH_COMPARISON,
        ...(userGrowthSummary?.active_users || {}),
        current: Number(userGrowthSummary?.active_users?.current || 0),
        previous: Number(userGrowthSummary?.active_users?.previous || 0),
        delta: Number(userGrowthSummary?.active_users?.delta || 0),
        growth_rate: Number(userGrowthSummary?.active_users?.growth_rate || 0),
        has_baseline: Boolean(userGrowthSummary?.active_users?.has_baseline),
      },
      topup_users: {
        ...EMPTY_USER_GROWTH_COMPARISON,
        ...(userGrowthSummary?.topup_users || {}),
        current: Number(userGrowthSummary?.topup_users?.current || 0),
        previous: Number(userGrowthSummary?.topup_users?.previous || 0),
        delta: Number(userGrowthSummary?.topup_users?.delta || 0),
        growth_rate: Number(userGrowthSummary?.topup_users?.growth_rate || 0),
        has_baseline: Boolean(userGrowthSummary?.topup_users?.has_baseline),
      },
    },
    user_growth_trend: userGrowthTrend.map((item) => ({
      ...item,
      start_timestamp: Number(item?.start_timestamp || 0),
      end_timestamp: Number(item?.end_timestamp || 0),
      new_user_count: Number(item?.new_user_count || 0),
      active_user_count: Number(item?.active_user_count || 0),
      topup_user_count: Number(item?.topup_user_count || 0),
      request_count: Number(item?.request_count || 0),
    })),
    model_summary: {
      selected_model_count: Number(modelSummary?.selected_model_count || 0),
      tested_model_count: Number(modelSummary?.tested_model_count || 0),
      healthy_model_count: Number(modelSummary?.healthy_model_count || 0),
      warning_model_count: Number(modelSummary?.warning_model_count || 0),
      critical_model_count: Number(modelSummary?.critical_model_count || 0),
      request_count: Number(modelSummary?.request_count || 0),
      total_tokens: Number(modelSummary?.total_tokens || 0),
      spend_amount: Number(modelSummary?.spend_amount ?? modelSummary?.spend_quota ?? 0),
      avg_pass_rate: Number(modelSummary?.avg_pass_rate || 0),
      avg_latency_ms: Number(modelSummary?.avg_latency_ms || 0),
    },
    top_models: topModels.map((item) => ({
      ...item,
      request_count: Number(item?.request_count || 0),
      total_tokens: Number(item?.total_tokens || 0),
      spend_amount: Number(item?.spend_amount ?? item?.spend_quota ?? 0),
      channel_count: Number(item?.channel_count || 0),
      tested_channel_count: Number(item?.tested_channel_count || 0),
      tested_endpoint_count: Number(item?.tested_endpoint_count || 0),
      supported_count: Number(item?.supported_count || 0),
      unsupported_count: Number(item?.unsupported_count || 0),
      supported_endpoint_count: Number(item?.supported_endpoint_count || 0),
      pass_rate: Number(item?.pass_rate || 0),
      avg_latency_ms: Number(item?.avg_latency_ms || 0),
      health_score: Number(item?.health_score || 0),
      last_tested_at: Number(item?.last_tested_at || 0),
      tags: Array.isArray(item?.tags) ? item.tags : [],
    })),
  };
};

const toPercent = (raw) => {
  const value = Number(raw || 0);
  if (!Number.isFinite(value)) return 0;
  if (value <= 1) return value * 100;
  return value;
};

const formatPercent = (raw) => formatBillingPercent(toPercent(raw), BILLING_PERCENT_DECIMALS);

const normalizeChannelHealthPointState = (point) => {
  const raw = typeof point === 'string' ? point : point?.state;
  const normalized = String(raw || '').trim().toLowerCase();
  if (normalized === 'success' || normalized === 'ok') return 'success';
  if (normalized === 'warning') return 'warning';
  if (normalized === 'failure' || normalized === 'failed' || normalized === 'error') {
    return 'failure';
  }
  return 'unknown';
};

const buildChannelHealthHistory = (points) => {
  const normalized = Array.isArray(points)
    ? points.slice(-CHANNEL_HEALTH_HISTORY_SIZE).map((point) => ({
        ...point,
        state: normalizeChannelHealthPointState(point),
        observed: Number(point?.total_count || 0) > 0,
      }))
    : [];
  const paddingCount = Math.max(
    0,
    CHANNEL_HEALTH_HISTORY_SIZE - normalized.length,
  );
  const history = [
    ...Array.from({ length: paddingCount }, () => ({
      state: 'unknown',
      observed: false,
    })),
    ...normalized,
  ];
  return history.map((point, index) => ({
    ...point,
    key: `${index}-${point.state}-${point.bucket_start || 0}`,
  }));
};

const normalizeCircuitBreakerState = (raw) =>
  String(raw || '').trim().toLowerCase();

const isActiveCircuitBreaker = (circuitBreaker) =>
  ACTIVE_CIRCUIT_BREAKER_STATES.has(
    normalizeCircuitBreakerState(circuitBreaker?.state),
  );

const AdminDashboard = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  // Dashboard figures are shown in USD via a fixed fallback charge rate rather
  // than the runtime currency table: passing [] makes buildPublicDisplayCurrencyIndex
  // fall back to getFallbackUSDChargeRate(), so this is intentional (no runtime
  // currency load needed for the operator's USD-only overview), not a missing feed.
  const displayCurrencyIndex = useMemo(
    () => buildPublicDisplayCurrencyIndex([]),
    [],
  );
  const [period, setPeriod] = useState('last_7_days');
  const [loading, setLoading] = useState(false);
  const [trendMetric, setTrendMetric] = useState('spend_amount');
  const [modelSort, setModelSort] = useState('spend');
  const [channelSort, setChannelSort] = useState('health');
  const [userGrowthGranularity, setUserGrowthGranularity] = useState('week');
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [usageKeywordInput, setUsageKeywordInput] = useState('');
  const [usageKeyword, setUsageKeyword] = useState('');

  const activeSection = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    const rawSection = (params.get('section') || '').trim().toLowerCase();
    if (rawSection === 'overview' || rawSection === 'trend') {
      return 'spending';
    }
    if (rawSection === 'health') {
      return 'channels';
    }
    return DASHBOARD_SECTIONS.includes(rawSection) ? rawSection : 'spending';
  }, [location.search]);

  const activeSectionTitle = t(DASHBOARD_SECTION_TITLES[activeSection]);

  const toUsd = useCallback(
    (chargeAmount) => {
      const amount = convertChargeAmountToDisplayAmount(
        chargeAmount,
        'USD',
        displayCurrencyIndex,
      );
      if (!Number.isFinite(amount)) return 0;
      return amount;
    },
    [displayCurrencyIndex],
  );

  const formatUsd = useCallback(
    (chargeAmount) => formatCompactDisplayAmount(toUsd(chargeAmount)),
    [toUsd],
  );

  const periodOptions = useMemo(
    () =>
      PERIOD_OPTIONS.map((value) => ({
        key: value,
        value,
        text: t(`dashboard.spending.period.${value}`),
      })),
    [t],
  );

  const trendMetricOptions = useMemo(
    () =>
      TREND_METRIC_OPTIONS.map((metric) => ({
        value: metric,
        label: t(`dashboard.admin.trend.metrics.${metric}`),
      })),
    [t],
  );

  const userGrowthGranularityOptions = useMemo(
    () =>
      USER_GROWTH_GRANULARITY_OPTIONS.map((value) => ({
        value,
        label: t(`dashboard.admin.users.growth.granularity.${value}`),
      })),
    [t],
  );

  const formatPeriodRange = useCallback((startTimestamp, endTimestamp) => {
    const start = Number(startTimestamp || 0);
    const end = Number(endTimestamp || 0);
    if (!start || !end) return '-';
    const formatDate = (timestamp) =>
      new Date(timestamp * 1000).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    return `${formatDate(start)} - ${formatDate(end)}`;
  }, []);

  const formatSignedCount = useCallback((value) => {
    const num = Number(value || 0);
    if (!Number.isFinite(num) || num === 0) return '0';
    return `${num > 0 ? '+' : '-'}${formatCount(Math.abs(num))}`;
  }, []);

  const formatSignedPercent = useCallback((value) => {
    const num = Number(value || 0);
    if (!Number.isFinite(num) || num === 0) return '0.00%';
    return `${num > 0 ? '+' : '-'}${(Math.abs(num) * 100).toFixed(2)}%`;
  }, []);

  const deltaTone = useCallback((value) => {
    const num = Number(value || 0);
    if (!Number.isFinite(num) || num === 0) return 'neutral';
    return num > 0 ? 'positive' : 'negative';
  }, []);

  const formatGrowthRate = useCallback(
    (comparison) => {
      const current = Number(comparison?.current || 0);
      const hasBaseline = comparison?.has_baseline === true;
      if (!hasBaseline) {
        return current > 0
          ? t('dashboard.admin.users.growth.no_baseline')
          : '0.0%';
      }
      const rate = Number(comparison?.growth_rate || 0);
      if (!Number.isFinite(rate) || rate === 0) return '0.0%';
      return `${rate > 0 ? '+' : ''}${(rate * 100).toFixed(1)}%`;
    },
    [t],
  );

  const userGrowthLineConfig = useMemo(
    () =>
      USER_GROWTH_LINE_KEYS.map((key) => ({
        dataKey: key,
        label: t(`dashboard.admin.users.growth.lines.${key}`),
        color: USER_GROWTH_LINE_COLORS[key],
      })),
    [t],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { period, section: activeSection };
      if (activeSection === 'users' && usageKeyword.trim() !== '') {
        params.user_keyword = usageKeyword.trim();
      }
      if (activeSection === 'users') {
        params.user_growth_granularity = userGrowthGranularity;
      }
      const res = await API.get('/api/v1/admin/dashboard/', {
        params,
      });
      if (res.data?.success) {
        setDashboard(normalizeAdminDashboardPayload(res.data.data || {}));
      } else {
        setDashboard(EMPTY_DASHBOARD);
      }
    } catch (error) {
      console.error('Failed to load admin dashboard:', error);
      showError(error);
      setDashboard(EMPTY_DASHBOARD);
    } finally {
      setLoading(false);
    }
  }, [activeSection, period, usageKeyword, userGrowthGranularity]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    loadData();
  }, [loadData]);

  const formatUpdatedAt = (value) => {
    if (!value) return '-';
    return new Date(Number(value) * 1000).toLocaleString('zh-CN', {
      hour12: false,
    });
  };

  const formatTimeRange = (start, end) => {
    const startTs = Number(start || 0);
    const endTs = Number(end || 0);
    if (!startTs || !endTs) return '-';
    return `${formatUpdatedAt(startTs)} - ${formatUpdatedAt(endTs)}`;
  };

  const renderCapabilities = useCallback(
    (raw) => {
      if (!Array.isArray(raw) || raw.length === 0) return '-';
      return raw
        .map((item) =>
          t(`dashboard.admin.capabilities.${item}`, { defaultValue: item }),
        )
        .join(' / ');
    },
    [t],
  );

  const channelHealthData = useMemo(
    () =>
      (dashboard.top_channels || []).map((row, index) => ({
        id: row.id || `channel-${index}`,
        channel_id: row.id || '',
        name: row.name || row.id || '-',
        status: Number(row.status || 0),
        capabilities: renderCapabilities(row.capabilities),
        health_score: Number(row.health_score || 0),
        health_level: row.health_level || 'unknown',
        pass_rate_percent: toPercent(row.pass_rate),
        coverage_rate_percent: toPercent(row.coverage_rate),
        avg_latency_ms: Number(row.avg_latency_ms || 0),
        selected_model_count: Number(row.selected_model_count || 0),
        tested_model_count: Number(row.tested_model_count || 0),
        tested_endpoint_count: Number(row.tested_endpoint_count || 0),
        has_test_data: Boolean(row.has_test_data),
        supported_count: Number(row.supported_count || 0),
        unsupported_count: Number(row.unsupported_count || 0),
        last_tested_at: Number(row.last_tested_at || 0),
        circuit_breaker: row.circuit_breaker || null,
        health_points: Array.isArray(row.health_points) ? row.health_points : [],
        health_history: buildChannelHealthHistory(row.health_points),
      })),
    [dashboard.top_channels, renderCapabilities],
  );

  const channelHealthSummary = useMemo(
    () => ({
      ...EMPTY_CHANNEL_HEALTH_SUMMARY,
      ...(dashboard.channel_health_summary || {}),
    }),
    [dashboard.channel_health_summary],
  );

  const userGrowthSummary = useMemo(
    () => ({
      ...EMPTY_USER_GROWTH_SUMMARY,
      ...(dashboard.user_growth_summary || {}),
    }),
    [dashboard.user_growth_summary],
  );

  const resolvedUserGrowthGranularity = useMemo(() => {
    const value = (userGrowthSummary?.granularity || userGrowthGranularity || '')
      .toString()
      .trim()
      .toLowerCase();
    return value === 'month' ? 'month' : 'week';
  }, [userGrowthGranularity, userGrowthSummary?.granularity]);

  const userGrowthCurrentLabel = useMemo(
    () =>
      resolvedUserGrowthGranularity === 'month'
        ? t('dashboard.admin.users.growth.period_labels.current_month')
        : t('dashboard.admin.users.growth.period_labels.current_week'),
    [resolvedUserGrowthGranularity, t],
  );

  const userGrowthPreviousLabel = useMemo(
    () =>
      resolvedUserGrowthGranularity === 'month'
        ? t('dashboard.admin.users.growth.period_labels.previous_month')
        : t('dashboard.admin.users.growth.period_labels.previous_week'),
    [resolvedUserGrowthGranularity, t],
  );

  const userGrowthComparisonLabel = useMemo(
    () =>
      resolvedUserGrowthGranularity === 'month'
        ? t('dashboard.admin.users.growth.period_labels.compare_previous_month')
        : t('dashboard.admin.users.growth.period_labels.compare_previous_week'),
    [resolvedUserGrowthGranularity, t],
  );

  const userGrowthCards = useMemo(
    () => [
      {
        key: 'new_users',
        label: t('dashboard.admin.users.growth.metrics.new_users'),
        value: Number(userGrowthSummary.current?.new_user_count || 0),
        previousValue: Number(userGrowthSummary.previous?.new_user_count || 0),
        comparison: userGrowthSummary.new_users,
        tone: Number(userGrowthSummary.new_users?.delta || 0) > 0
          ? 'positive'
          : Number(userGrowthSummary.new_users?.delta || 0) < 0
            ? 'negative'
            : 'neutral',
      },
      {
        key: 'active_users',
        label: t('dashboard.admin.users.growth.metrics.active_users'),
        value: Number(userGrowthSummary.current?.active_user_count || 0),
        previousValue: Number(userGrowthSummary.previous?.active_user_count || 0),
        comparison: userGrowthSummary.active_users,
        tone: Number(userGrowthSummary.active_users?.delta || 0) > 0
          ? 'positive'
          : Number(userGrowthSummary.active_users?.delta || 0) < 0
            ? 'negative'
            : 'neutral',
      },
      {
        key: 'topup_users',
        label: t('dashboard.admin.users.growth.metrics.topup_users'),
        value: Number(userGrowthSummary.current?.topup_user_count || 0),
        previousValue: Number(userGrowthSummary.previous?.topup_user_count || 0),
        comparison: userGrowthSummary.topup_users,
        tone: Number(userGrowthSummary.topup_users?.delta || 0) > 0
          ? 'positive'
          : Number(userGrowthSummary.topup_users?.delta || 0) < 0
            ? 'negative'
            : 'neutral',
      },
    ],
    [t, userGrowthSummary],
  );

  const userGrowthTrendData = useMemo(
    () =>
      (dashboard.user_growth_trend || []).map((item) => ({
        ...item,
        label: formatPeriodRange(item.start_timestamp, item.end_timestamp),
      })),
    [dashboard.user_growth_trend, formatPeriodRange],
  );

  const userGrowthKpis = useMemo(() => {
    const activeUsers = Number(
      userGrowthSummary.current?.active_user_count || 0,
    );
    const topupUsers = Number(
      userGrowthSummary.current?.topup_user_count || 0,
    );
    const previousActiveUsers = Number(
      userGrowthSummary.previous?.active_user_count || 0,
    );
    const previousTopupUsers = Number(
      userGrowthSummary.previous?.topup_user_count || 0,
    );
    const spendAmount = Number(dashboard.usage_totals?.spend_amount || 0);
    const balanceTotal = dashboard.usage_rank.reduce(
      (sum, item) => sum + Number(item?.balance_amount || 0),
      0,
    );
    const paidConversion =
      activeUsers > 0 ? topupUsers / activeUsers : 0;
    const previousPaidConversion =
      previousActiveUsers > 0 ? previousTopupUsers / previousActiveUsers : 0;
    const arpu = activeUsers > 0 ? spendAmount / activeUsers : 0;
    return {
      active_users: activeUsers,
      active_users_comparison: userGrowthSummary.active_users || null,
      topup_users: topupUsers,
      topup_users_comparison: userGrowthSummary.topup_users || null,
      paid_conversion_rate: paidConversion,
      paid_conversion_delta: paidConversion - previousPaidConversion,
      arpu,
      user_balance_total: balanceTotal,
    };
  }, [
    dashboard.usage_totals?.spend_amount,
    dashboard.usage_rank,
    userGrowthSummary.active_users,
    userGrowthSummary.current?.active_user_count,
    userGrowthSummary.current?.topup_user_count,
    userGrowthSummary.previous?.active_user_count,
    userGrowthSummary.previous?.topup_user_count,
    userGrowthSummary.topup_users,
  ]);

  const trendLineColor = useMemo(() => {
    switch (trendMetric) {
      case 'topup_amount':
        return chartStatusPalette.success;
      case 'request_count':
        return chartCategoricalPalette[0];
      case 'active_user_count':
        return chartCategoricalPalette[3];
      default:
        return chartCategoricalPalette[1];
    }
  }, [trendMetric]);

  const trendFormatter = (value) => {
    if (trendMetric === 'spend_amount' || trendMetric === 'topup_amount') {
      return formatUsd(value);
    }
    return formatCount(value);
  };

  const modelSortOptions = useMemo(
    () =>
      MODEL_SORT_OPTIONS.map((value) => ({
        value,
        label: t(`dashboard.admin.models.sort.${value}`),
      })),
    [t],
  );

  const channelSortOptions = useMemo(
    () =>
      CHANNEL_SORT_OPTIONS.map((value) => ({
        value,
        label: t(`dashboard.admin.channels.sort.${value}`),
      })),
    [t],
  );

  const sortedChannelHealthData = useMemo(() => {
    const items = [...channelHealthData];
    items.sort((left, right) => {
      if (channelSort === 'pass_rate') {
        if (left.pass_rate_percent !== right.pass_rate_percent) {
          return right.pass_rate_percent - left.pass_rate_percent;
        }
      } else if (channelSort === 'latency') {
        const leftLatency = Number(left.avg_latency_ms || 0);
        const rightLatency = Number(right.avg_latency_ms || 0);
        if (leftLatency !== rightLatency) {
          if (leftLatency <= 0) return 1;
          if (rightLatency <= 0) return -1;
          return leftLatency - rightLatency;
        }
      } else if (channelSort === 'requests') {
        // Busiest-first by total request count; ties break on health_score desc
        // so high-volume + risky channels still float to the top.
        const leftReq = Number(left.request_count || 0);
        const rightReq = Number(right.request_count || 0);
        if (leftReq !== rightReq) {
          return rightReq - leftReq;
        }
        if (left.health_score !== right.health_score) {
          return right.health_score - left.health_score;
        }
      } else if (left.health_score !== right.health_score) {
        return right.health_score - left.health_score;
      }
      // Fallback: latency asc (smaller first), then name asc
      const leftLatency = Number(left.avg_latency_ms || 0);
      const rightLatency = Number(right.avg_latency_ms || 0);
      if (leftLatency !== rightLatency) {
        if (leftLatency <= 0) return 1;
        if (rightLatency <= 0) return -1;
        return leftLatency - rightLatency;
      }
      return String(left.name || '').localeCompare(String(right.name || ''));
    });
    return items;
  }, [channelHealthData, channelSort]);

  const sortedModels = useMemo(() => {
    const items = Array.isArray(dashboard.top_models) ? [...dashboard.top_models] : [];
    items.sort((left, right) => {
      if (modelSort === 'requests') {
        if (left.request_count !== right.request_count) {
          return right.request_count - left.request_count;
        }
      } else if (modelSort === 'health') {
        if (left.health_score !== right.health_score) {
          return right.health_score - left.health_score;
        }
      } else if (modelSort === 'latency') {
        const leftLatency = Number(left.avg_latency_ms || 0);
        const rightLatency = Number(right.avg_latency_ms || 0);
        if (leftLatency !== rightLatency) {
          if (leftLatency <= 0) return 1;
          if (rightLatency <= 0) return -1;
          return leftLatency - rightLatency;
        }
      } else if (left.spend_amount !== right.spend_amount) {
        return right.spend_amount - left.spend_amount;
      }
      if (left.request_count !== right.request_count) {
        return right.request_count - left.request_count;
      }
      return String(left.model || '').localeCompare(String(right.model || ''));
    });
    return items;
  }, [dashboard.top_models, modelSort]);

  const renderHealthTag = useCallback(
    (level) => {
      const normalized = (level || 'unknown').toString().trim().toLowerCase();
      const color =
        normalized === 'healthy'
          ? 'green'
          : normalized === 'warning'
            ? 'orange'
            : normalized === 'critical'
              ? 'red'
              : 'grey';
      return (
        <AppTag color={color} className='router-tag'>
          {t(`dashboard.admin.health.level.${normalized}`, {
            defaultValue: t('dashboard.admin.health.level.unknown'),
          })}
        </AppTag>
      );
    },
    [t],
  );

  const renderCircuitBreakerTag = useCallback(
    (circuitBreaker) => {
      const state = normalizeCircuitBreakerState(circuitBreaker?.state);
      if (!state || state === 'recovered') {
        return null;
      }
      const color =
        state === 'open'
          ? 'red'
          : state === 'half_open'
            ? 'orange'
            : 'grey';
      const details = [
        t(`dashboard.admin.channels.circuit.state.${state}`, {
          defaultValue: t('dashboard.admin.channels.circuit.state.unknown'),
        }),
        circuitBreaker?.reason
          ? `${t('dashboard.admin.channels.circuit.reason')}: ${circuitBreaker.reason}`
          : null,
        circuitBreaker?.success_rate !== null &&
        circuitBreaker?.success_rate !== undefined
          ? `${t('dashboard.admin.channels.circuit.success_rate')}: ${formatPercent(circuitBreaker.success_rate)}`
          : null,
        circuitBreaker?.disabled_at
          ? `${t('dashboard.admin.channels.circuit.disabled_at')}: ${formatUpdatedAt(circuitBreaker.disabled_at)}`
          : null,
        circuitBreaker?.recover_after
          ? `${t('dashboard.admin.channels.circuit.recover_after')}: ${formatUpdatedAt(circuitBreaker.recover_after)}`
          : null,
      ].filter(Boolean);
      return (
        <AppTooltip title={details.join(' / ')}>
          <AppTag color={color} className='router-tag'>
            {t(`dashboard.admin.channels.circuit.state.${state}`, {
              defaultValue: t('dashboard.admin.channels.circuit.state.unknown'),
            })}
          </AppTag>
        </AppTooltip>
      );
    },
    [t],
  );

  const usageRankColumns = useMemo(
    () => [
      {
        title: t('dashboard.admin.usage_rank.columns.rank'),
        key: 'rank',
        width: 72,
        render: (_, __, index) => (
          <span className='admin-dashboard-rank-index'>{index + 1}</span>
        ),
      },
      {
        title: t('dashboard.admin.usage_rank.columns.user'),
        dataIndex: 'username',
        key: 'user',
        width: 180,
        ellipsis: true,
        render: (_, record) => (
          record.user_id ? (
            <button
              type='button'
              className='admin-dashboard-user-link admin-dashboard-rank-user'
              title={record.username || record.user_id || '-'}
              onClick={() =>
                navigate(`/admin/user/detail/${encodeURIComponent(record.user_id)}`)
              }
            >
              {record.username || record.user_id || '-'}
            </button>
          ) : (
            <span
              className='admin-dashboard-rank-user'
              title={record.username || record.user_id || '-'}
            >
              {record.username || record.user_id || '-'}
            </span>
          )
        ),
      },
      {
        title: t('dashboard.admin.usage_rank.columns.requests'),
        dataIndex: 'request_count',
        key: 'request_count',
        width: 120,
        render: (value) => formatCount(value),
      },
      {
        title: t('dashboard.admin.usage_rank.columns.tokens'),
        dataIndex: 'total_tokens',
        key: 'total_tokens',
        width: 140,
        render: (value) => formatCount(value),
      },
      {
        title: t('dashboard.admin.usage_rank.columns.spend'),
        dataIndex: 'spend_amount',
        key: 'spend_amount',
        width: 120,
        render: (value) => formatUsd(value),
      },
      {
        title: t('dashboard.admin.usage_rank.columns.share'),
        dataIndex: 'share_rate',
        key: 'share_rate',
        width: 220,
        render: (value) => (
          <span className='admin-dashboard-rank-share-cell'>
            <span className='admin-dashboard-rank-share-text'>
              {formatPercent(value)}
            </span>
            <span className='admin-dashboard-rank-share-track'>
              <span
                className='admin-dashboard-rank-share-bar'
                style={{
                  '--admin-dashboard-share-width': `${Math.max(
                    4,
                    toPercent(value),
                  )}%`,
                }}
              />
            </span>
          </span>
        ),
      },
      {
        title: t('dashboard.admin.usage_rank.columns.last_used_at'),
        dataIndex: 'last_used_at',
        key: 'last_used_at',
        width: 180,
        render: (value) => formatUpdatedAt(value),
      },
    ],
    [formatUsd, navigate, t],
  );

  const modelHealthDistribution = useMemo(
    () => [
      {
        key: 'healthy',
        label: t('dashboard.admin.health.level.healthy'),
        count: Number(dashboard.model_summary.healthy_model_count || 0),
        color: HEALTH_LEVEL_COLORS.healthy,
      },
      {
        key: 'warning',
        label: t('dashboard.admin.health.level.warning'),
        count: Number(dashboard.model_summary.warning_model_count || 0),
        color: HEALTH_LEVEL_COLORS.warning,
      },
      {
        key: 'critical',
        label: t('dashboard.admin.health.level.critical'),
        count: Number(dashboard.model_summary.critical_model_count || 0),
        color: HEALTH_LEVEL_COLORS.critical,
      },
    ],
    [dashboard.model_summary, t],
  );

  const modelLeaderboardData = useMemo(() => {
    return sortedModels.slice(0, 8).map((item) => {
      let value = Number(item.spend_amount || 0);
      let displayValue = formatUsd(item.spend_amount);
      let metricLabel = t('dashboard.admin.models.sort.spend');
      if (modelSort === 'requests') {
        value = Number(item.request_count || 0);
        displayValue = formatCount(item.request_count);
        metricLabel = t('dashboard.admin.models.sort.requests');
      } else if (modelSort === 'health') {
        value = Number(item.health_score || 0);
        displayValue = `${Number(item.health_score || 0).toFixed(0)}`;
        metricLabel = t('dashboard.admin.models.sort.health');
      } else if (modelSort === 'latency') {
        const latency = Number(item.avg_latency_ms || 0);
        value = latency > 0 ? latency : 0;
        displayValue = latency > 0 ? `${latency} ms` : '-';
        metricLabel = t('dashboard.admin.models.sort.latency');
      }
      return {
        model: item.model || '-',
        short_model: String(item.model || '-').slice(0, 20),
        value,
        display_value: displayValue,
        metric_label: metricLabel,
        health_level: item.health_level || 'unknown',
      };
    });
  }, [formatCount, formatUsd, modelSort, sortedModels, t]);

  const spendingInsightData = useMemo(() => {
    const trendRows = Array.isArray(dashboard.trend) ? dashboard.trend : [];
    const peakSpend = trendRows.reduce(
      (best, item) =>
        Number(item.spend_amount || 0) > Number(best?.spend_amount || 0) ? item : best,
      null,
    );
    const peakTopup = trendRows.reduce(
      (best, item) =>
        Number(item.topup_amount || 0) > Number(best?.topup_amount || 0) ? item : best,
      null,
    );
    const peakActiveUsers = trendRows.reduce(
      (best, item) =>
        Number(item.active_user_count || 0) > Number(best?.active_user_count || 0)
          ? item
          : best,
      null,
    );
    const netAmount = Number(dashboard.summary.net_amount || 0);
    return {
      net: {
        label:
          netAmount >= 0
            ? t('dashboard.admin.spending.insights.net_positive')
            : t('dashboard.admin.spending.insights.net_negative'),
        value: formatUsd(Math.abs(netAmount)),
        hint:
          netAmount >= 0
            ? t('dashboard.admin.spending.insights.net_positive_hint')
            : t('dashboard.admin.spending.insights.net_negative_hint'),
        tone: netAmount >= 0 ? 'green' : 'red',
      },
      peakSpend: {
        label: t('dashboard.admin.spending.insights.peak_spend'),
        value: peakSpend ? formatUsd(peakSpend.spend_amount) : '-',
        hint: peakSpend?.bucket || '-',
      },
      peakTopup: {
        label: t('dashboard.admin.spending.insights.peak_topup'),
        value: peakTopup ? formatUsd(peakTopup.topup_amount) : '-',
        hint: peakTopup?.bucket || '-',
      },
      activeUsers: {
        label: t('dashboard.admin.spending.insights.peak_active_users'),
        value: peakActiveUsers ? formatCount(peakActiveUsers.active_user_count) : '-',
        hint: peakActiveUsers?.bucket || '-',
      },
    };
  }, [dashboard.summary.net_amount, dashboard.trend, formatUsd, t]);

  const renderPageHeader = () => (
    <AppFilterHeader
      className='admin-dashboard-toolbar'
      breadcrumbs={[
        { key: 'admin', label: t('header.admin_workspace') },
        { key: 'dashboard', label: t('header.dashboard') },
        { key: activeSection, label: activeSectionTitle, active: true },
      ]}
      title={activeSectionTitle}
    />
  );

  const renderPeriodControl = () => (
    <div className='admin-dashboard-period-control'>
      <AppSelect
        className='router-section-dropdown'
        options={periodOptions}
        value={period}
        onChange={(e, { value }) => setPeriod(value)}
      />
    </div>
  );

  const renderRefreshControls = () => (
    <div className='admin-dashboard-refresh-controls'>
      <span className='admin-dashboard-generated-at'>
        {formatUpdatedAt(dashboard.generated_at)}
      </span>
      <AppTooltip title={t('dashboard.admin.buttons.refresh')}>
        <AppButton
          className='router-inline-button admin-dashboard-refresh-button'
          type='button'
          aria-label={t('dashboard.admin.buttons.refresh')}
          loading={loading}
          onClick={handleRefresh}
          icon={<AppIcon name='exchange' />}
        />
      </AppTooltip>
    </div>
  );

  const renderSectionControls = (extra = null) => (
    <div className='admin-dashboard-section-controls'>
      {renderPeriodControl()}
      {extra}
      {renderRefreshControls()}
    </div>
  );

  const applyUsageKeyword = useCallback(() => {
    setUsageKeyword(usageKeywordInput.trim());
  }, [usageKeywordInput]);

  const clearUsageKeyword = useCallback(() => {
    setUsageKeywordInput('');
    setUsageKeyword('');
  }, []);

  const openUserSegment = useCallback(
    (segment) => {
      const rows = Array.isArray(segment?.rows) ? segment.rows : [];
      const ids = [
        ...new Set(
          rows
            .map((item) => (item?.user_id || '').toString().trim())
            .filter(Boolean),
        ),
      ].slice(0, USER_SEGMENT_FOCUS_LIMIT);
      if (ids.length === 0) {
        return;
      }
      const params = new URLSearchParams();
      params.set('focus_ids', ids.join(','));
      params.set('focus_name', segment.label);
      params.set('focus_total', String(rows.length));
      navigate(`/admin/user?${params.toString()}`);
    },
    [navigate],
  );

  const userSegments = useMemo(() => {
    const rows = Array.isArray(dashboard.usage_rank)
      ? dashboard.usage_rank.filter((item) => (item?.user_id || '').toString().trim() !== '')
      : [];
    const activeRows = rows.filter((item) => Number(item.request_count || 0) > 0);
    const requestTotal = activeRows.reduce(
      (sum, item) => sum + Number(item.request_count || 0),
      0,
    );
    const tokenTotal = activeRows.reduce(
      (sum, item) => sum + Number(item.total_tokens || 0),
      0,
    );
    const averageRequests = activeRows.length > 0 ? requestTotal / activeRows.length : 0;
    const averageTokens = activeRows.length > 0 ? tokenTotal / activeRows.length : 0;
    const bySpendDesc = (left, right) =>
      Number(right.spend_amount || 0) - Number(left.spend_amount || 0) ||
      Number(right.request_count || 0) - Number(left.request_count || 0);
    const highSpendRows = rows
      .filter((item) => Number(item.spend_amount || 0) > 0 && Number(item.share_rate || 0) >= 0.1)
      .sort(bySpendDesc);
    const activeUserRows = activeRows
      .filter((item) => Number(item.request_count || 0) > averageRequests)
      .sort((left, right) => Number(right.request_count || 0) - Number(left.request_count || 0));
    const longTailRows = rows
      .filter(
        (item) =>
          Number(item.spend_amount || 0) > 0 &&
          Number(item.share_rate || 0) < 0.03 &&
          Number(item.total_tokens || 0) <= averageTokens,
      )
      .sort((left, right) => Number(left.spend_amount || 0) - Number(right.spend_amount || 0));
    const balanceRiskRows = activeRows
      .filter((item) => {
        const spend = Number(item.spend_amount || 0);
        const balance = Number(item.balance_amount || 0);
        return spend > 0 && balance <= spend;
      })
      .sort((left, right) => Number(left.balance_amount || 0) - Number(right.balance_amount || 0));
    return [
      {
        key: 'high_spend',
        label: t('dashboard.admin.users.insights.high_spend'),
        hint: t('dashboard.admin.users.insights.high_spend_hint'),
        rows: highSpendRows,
      },
      {
        key: 'active',
        label: t('dashboard.admin.users.insights.active'),
        hint: t('dashboard.admin.users.insights.active_hint'),
        rows: activeUserRows,
      },
      {
        key: 'long_tail',
        label: t('dashboard.admin.users.insights.long_tail'),
        hint: t('dashboard.admin.users.insights.long_tail_hint'),
        rows: longTailRows,
      },
      {
        key: 'balance_risk',
        label: t('dashboard.admin.users.insights.balance_risk'),
        hint: t('dashboard.admin.users.insights.balance_risk_hint'),
        rows: balanceRiskRows,
      },
    ];
  }, [dashboard.usage_rank, t]);

  const renderSpendingSection = () => (
    <AppSection className='admin-dashboard-section'>
      <div className='admin-dashboard-subsection-header'>
        <div className='admin-dashboard-subsection-header-main'>
          <div className='admin-dashboard-subsection-title admin-dashboard-subsection-title-strong'>
            {t('dashboard.admin.sections.spending')}
          </div>
        </div>
        <AppToolbar
          className='admin-dashboard-section-toolbar'
          end={renderSectionControls()}
        />
      </div>
      <div className='admin-dashboard-spending-headline'>
        <div className='admin-dashboard-spending-headline-main'>
          <div className='admin-dashboard-spending-headline-label'>
            {t('dashboard.admin.spending.headline.net')}
          </div>
          <div
            className={`admin-dashboard-spending-headline-value admin-dashboard-spending-headline-value-${spendingInsightData.net.tone}`}
          >
            {spendingInsightData.net.value}
          </div>
          <div className='admin-dashboard-spending-headline-hint'>
            {spendingInsightData.net.hint}
          </div>
        </div>
        <div className='admin-dashboard-spending-headline-side'>
          <div className='admin-dashboard-spending-headline-row'>
            <span>{t('dashboard.admin.metrics.consume')}</span>
            <strong>{formatUsd(dashboard.summary.spend_amount)}</strong>
          </div>
          <div className='admin-dashboard-spending-headline-row'>
            <span>{t('dashboard.admin.metrics.topup')}</span>
            <strong>{formatUsd(dashboard.summary.topup_amount)}</strong>
          </div>
          <div className='admin-dashboard-spending-headline-row'>
            <span>{t('dashboard.admin.metrics.request_count')}</span>
            <strong>{formatCount(dashboard.summary.request_count)}</strong>
          </div>
          <div className='admin-dashboard-spending-headline-row'>
            <span>{t('dashboard.admin.metrics.active_user_count')}</span>
            <strong>{formatCount(dashboard.summary.active_user_count)}</strong>
          </div>
        </div>
      </div>
      <div className='admin-dashboard-trend-block'>
        <div className='admin-dashboard-subsection-header admin-dashboard-trend-block-header'>
          <div className='admin-dashboard-subsection-header-main'>
            <div className='admin-dashboard-subsection-title'>
              {t('dashboard.admin.sections.spending')}
            </div>
            <div className='admin-dashboard-subsection-description'>
              {t('dashboard.admin.spending.insights.trend_hint')}
            </div>
          </div>
          <AppToolbar
            className='admin-dashboard-trend-toolbar'
            end={
              <AppSegmented
                className='admin-dashboard-segmented'
                options={trendMetricOptions}
                value={trendMetric}
                onChange={(e, { value }) => setTrendMetric(value)}
              />
            }
          />
        </div>
        {dashboard.trend.length === 0 ? (
          <div className='admin-dashboard-empty'>
            {t('dashboard.admin.empty.trend')}
          </div>
        ) : (
          <div className='chart-container'>
            <ResponsiveContainer width='100%' height={240}>
              <LineChart data={dashboard.trend}>
                <CartesianGrid {...chartGridStyle()} />
                <XAxis
                  dataKey='bucket'
                  {...chartAxisStyle()}
                  minTickGap={8}
                />
                <YAxis {...chartAxisStyle()} />
                <Tooltip
                  contentStyle={chartTooltipStyle()}
                  labelStyle={chartTooltipLabelStyle()}
                  itemStyle={chartTooltipItemStyle()}
                  formatter={(value) => [
                    trendFormatter(value),
                    t(`dashboard.admin.trend.metrics.${trendMetric}`),
                  ]}
                  labelFormatter={(label) =>
                    `${t('dashboard.statistics.tooltip.date')}: ${label}`
                  }
                />
                <Line
                  type='monotone'
                  dataKey={trendMetric}
                  stroke={trendLineColor}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </AppSection>
  );

  const renderChannelsSection = () => (
    <AppSection className='admin-dashboard-section'>
      <ChannelSectionTabs active='health' />
      <div className='admin-dashboard-subsection-header'>
        <div className='admin-dashboard-subsection-header-main'>
          <div className='admin-dashboard-subsection-title admin-dashboard-subsection-title-strong'>
            {t('dashboard.admin.sections.channels')}
          </div>
        </div>
        <AppToolbar
          className='admin-dashboard-section-toolbar'
          end={renderSectionControls(
            <AppSegmented
              className='admin-dashboard-segmented'
              options={channelSortOptions}
              value={channelSort}
              onChange={(e, { value }) => setChannelSort(value)}
            />
          )}
        />
      </div>
      <div className='admin-dashboard-channel-bells'>
        {[
          {
            key: 'active_circuit_breaker',
            label: t('dashboard.admin.health.summary.active_circuit_breaker'),
            value: Number(channelHealthSummary.active_circuit_breaker_count || 0),
            tone: 'critical',
          },
          {
            key: 'risk_count',
            label: t('dashboard.admin.health.summary.risk_count'),
            value: Number(channelHealthSummary.risk_count || 0),
            tone: 'critical',
          },
          {
            key: 'needs_retest',
            label: t('dashboard.admin.health.summary.needs_retest'),
            value: Number(channelHealthSummary.needs_retest || 0),
            tone: 'warning',
          },
          {
            key: 'high_latency',
            label: t('dashboard.admin.health.summary.high_latency'),
            value: Number(channelHealthSummary.high_latency_count || 0),
            tone: 'warning',
          },
        ].map((bell) => (
          <div
            key={bell.key}
            className={`admin-dashboard-channel-bell is-${bell.tone}${
              bell.value > 0 ? ' is-active' : ''
            }`}
          >
            <div className='admin-dashboard-channel-bell-value'>{bell.value}</div>
            <div className='admin-dashboard-channel-bell-label'>{bell.label}</div>
          </div>
        ))}
      </div>
      <div className='admin-dashboard-channel-meta-strip'>
        <div className='admin-dashboard-channel-meta-item'>
          <span className='admin-dashboard-channel-meta-label'>
            {t('dashboard.admin.metrics.channels')}
          </span>
          <strong className='admin-dashboard-channel-meta-value'>
            {formatCount(dashboard.summary.channel_enabled)} /{' '}
            {formatCount(dashboard.summary.channel_total)}
          </strong>
        </div>
        <div className='admin-dashboard-channel-meta-item'>
          <span className='admin-dashboard-channel-meta-label'>
            {t('dashboard.admin.health.summary.avg_pass_rate')}
          </span>
          <strong className='admin-dashboard-channel-meta-value'>
            {formatPercent(channelHealthSummary.avg_pass_rate)}
          </strong>
        </div>
        <div className='admin-dashboard-channel-meta-item'>
          <span className='admin-dashboard-channel-meta-label'>
            {t('dashboard.admin.health.summary.avg_latency')}
          </span>
          <strong className='admin-dashboard-channel-meta-value'>
            {`${Math.round(Number(channelHealthSummary.avg_latency_ms || 0))} ms`}
          </strong>
        </div>
      </div>
      <div className='admin-dashboard-usage-rank'>
        {sortedChannelHealthData.length === 0 ? (
          <div className='admin-dashboard-empty'>
            {t('dashboard.admin.empty.channels')}
          </div>
        ) : (
          <div className='admin-dashboard-channel-health-list'>
              <div className='admin-dashboard-channel-health-list-header'>
                <div className='admin-dashboard-channel-health-list-title'>
                  <div className='admin-dashboard-card-title'>
                    {t('dashboard.admin.channels.history.title')}
                  </div>
                  <div className='admin-dashboard-channel-health-hint'>
                    {t('dashboard.admin.channels.history.hint')}
                  </div>
                </div>
                <div className='admin-dashboard-health-strip-legend'>
                  {['success', 'warning', 'failure', 'unknown'].map((state) => (
                    <span
                      key={state}
                      className='admin-dashboard-health-strip-legend-item'
                    >
                      <span
                        className='admin-dashboard-health-strip-legend-dot'
                        style={{
                          background:
                            CHANNEL_HEALTH_POINT_COLORS[state] ||
                            CHANNEL_HEALTH_POINT_COLORS.unknown,
                        }}
                      />
                      {t(`dashboard.admin.channels.history.state.${state}`)}
                    </span>
                  ))}
                </div>
              </div>
              {sortedChannelHealthData.map((item) => {
                const statusText = t(
                  `dashboard.admin.channel_status.${Number(item.status)}`,
                  {
                    defaultValue: t('dashboard.admin.channel_status.default'),
                  },
                );
                const lastTested = item.last_tested_at
                  ? formatUpdatedAt(item.last_tested_at)
                  : '-';
                const activeCircuit = isActiveCircuitBreaker(
                  item.circuit_breaker,
                );
                const canOpenDetail = Boolean(item.channel_id);
                return (
                  <div
                    key={item.id}
                    className={`admin-dashboard-channel-health-row${
                      activeCircuit ? ' admin-dashboard-channel-health-row-circuit' : ''
                    }`}
                  >
                    <div className='admin-dashboard-channel-health-info'>
                      <div className='admin-dashboard-channel-health-title-row'>
                        <button
                          type='button'
                          className='admin-dashboard-channel-health-name'
                          title={item.name}
                          disabled={!canOpenDetail}
                          onClick={() => {
                            if (!canOpenDetail) return;
                            navigate(
                              `/admin/channel/detail/${encodeURIComponent(
                                item.channel_id,
                              )}`,
                            );
                          }}
                        >
                          {item.name}
                        </button>
                        {renderHealthTag(item.health_level)}
                        {renderCircuitBreakerTag(item.circuit_breaker)}
                      </div>
                      <div className='admin-dashboard-channel-health-subtitle'>
                        <span>{statusText}</span>
                        <span>{item.capabilities}</span>
                        <span>
                          {t('dashboard.admin.health.chart.last_tested')}:{' '}
                          {lastTested}
                        </span>
                      </div>
                    </div>
                    <div className='admin-dashboard-channel-health-strip-wrap'>
                      <div
                        className='admin-dashboard-health-strip'
                        aria-label={`${item.name} ${t(
                          'dashboard.admin.channels.history.title',
                        )}`}
                      >
                        {item.health_history.map((point) => {
                          const stateLabel = t(
                            `dashboard.admin.channels.history.state.${point.state}`,
                          );
                          const title = point.observed
                            ? (
                                <div>
                                  <div>{`${item.name}: ${stateLabel}`}</div>
                                  <div>{`${t('dashboard.admin.channels.history.window')}: ${formatTimeRange(point.bucket_start, point.bucket_end)}`}</div>
                                  <div>{`${t('dashboard.admin.channels.history.success_count')}: ${formatCount(point.success_count)}`}</div>
                                  <div>{`${t('dashboard.admin.channels.history.failure_count')}: ${formatCount(point.failure_count)}`}</div>
                                  <div>{`${t('dashboard.admin.channels.history.total_count')}: ${formatCount(point.total_count)}`}</div>
                                  <div>{`${t('dashboard.admin.channels.history.pass_rate')}: ${formatPercent(point.pass_rate)}`}</div>
                                  <div>{`${t('dashboard.admin.channels.history.avg_latency')}: ${
                                    point.avg_latency_ms > 0
                                      ? `${formatCount(point.avg_latency_ms)} ms`
                                      : '-'
                                  }`}</div>
                                </div>
                              )
                            : `${item.name}: ${t('dashboard.admin.channels.history.no_data')}`;
                          return (
                            <AppTooltip key={point.key} title={title}>
                              <span
                                className={`admin-dashboard-health-cell admin-dashboard-health-cell-${point.state}`}
                                style={{
                                  background:
                                    CHANNEL_HEALTH_POINT_COLORS[point.state] ||
                                    CHANNEL_HEALTH_POINT_COLORS.unknown,
                                }}
                              />
                            </AppTooltip>
                          );
                        })}
                      </div>
                    </div>
                    <div className='admin-dashboard-channel-health-metrics'>
                      <div className='admin-dashboard-channel-health-metric'>
                        <span>{t('dashboard.admin.health.chart.health_score')}</span>
                        <strong>{Number(item.health_score || 0).toFixed(0)}</strong>
                      </div>
                      <div className='admin-dashboard-channel-health-metric'>
                        <span>{t('dashboard.admin.health.chart.pass_rate')}</span>
                        <strong>{formatPercent(item.pass_rate_percent)}</strong>
                      </div>
                      <div className='admin-dashboard-channel-health-metric'>
                        <span>{t('dashboard.admin.health.chart.avg_latency')}</span>
                        <strong>
                          {item.avg_latency_ms > 0
                            ? `${formatCount(item.avg_latency_ms)} ms`
                            : '-'}
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </AppSection>
  );

  const renderUsersSection = () => (
    <AppSection className='admin-dashboard-section'>
      <UserSectionTabs active='analytics' />
      <div className='admin-dashboard-subsection-header'>
        <div className='admin-dashboard-subsection-header-main'>
          <div className='admin-dashboard-subsection-title admin-dashboard-subsection-title-strong'>
            {t('dashboard.admin.users.growth.title')}
          </div>
          <div className='admin-dashboard-subsection-description'>
            {t('dashboard.admin.users.growth.description')}
          </div>
        </div>
        <AppToolbar
          className='admin-dashboard-section-toolbar'
          end={
            <div className='admin-dashboard-section-controls'>
              {renderPeriodControl()}
              <AppSegmented
                className='admin-dashboard-segmented'
                options={userGrowthGranularityOptions}
                value={userGrowthGranularity}
                onChange={(e, { value }) => setUserGrowthGranularity(value)}
              />
              {renderRefreshControls()}
            </div>
          }
        />
      </div>
      <div className='admin-dashboard-user-growth-grid'>
        {userGrowthCards.map((item) => (
          <div key={item.key} className='admin-dashboard-user-growth-card'>
            <div className='admin-dashboard-user-growth-card-label'>
              {item.label}
            </div>
            <div className='admin-dashboard-user-growth-card-value'>
              {formatCount(item.value)}
            </div>
            <div className='admin-dashboard-user-growth-card-periods'>
              <span>
                {userGrowthCurrentLabel} {formatCount(item.value)}
              </span>
              <span>
                {userGrowthPreviousLabel} {formatCount(item.previousValue)}
              </span>
            </div>
            <div className={`admin-dashboard-user-growth-card-delta admin-dashboard-user-growth-card-delta-${item.tone}`}>
              <span>
                {userGrowthComparisonLabel} {formatSignedCount(item.comparison?.delta)}
              </span>
              <span>{formatGrowthRate(item.comparison)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className='admin-dashboard-user-monetization-strip'>
        <div className='admin-dashboard-user-monetization-item'>
          <span className='admin-dashboard-user-monetization-label'>
            {t('dashboard.admin.users.summary.paid_conversion_rate')}
          </span>
          <strong className='admin-dashboard-user-monetization-value'>
            {formatPercent(userGrowthKpis.paid_conversion_rate)}
          </strong>
          <span
            className={`admin-dashboard-user-monetization-delta admin-dashboard-kpi-delta-${deltaTone(
              userGrowthKpis.paid_conversion_delta,
            )}`}
          >
            {formatSignedPercent(userGrowthKpis.paid_conversion_delta)}
          </span>
        </div>
        <div className='admin-dashboard-user-monetization-item'>
          <span className='admin-dashboard-user-monetization-label'>
            {t('dashboard.admin.users.summary.arpu')}
          </span>
          <strong className='admin-dashboard-user-monetization-value'>
            {formatUsd(userGrowthKpis.arpu)}
          </strong>
        </div>
        <div className='admin-dashboard-user-monetization-item'>
          <span className='admin-dashboard-user-monetization-label'>
            {t('dashboard.admin.users.summary.user_balance_total')}
          </span>
          <strong className='admin-dashboard-user-monetization-value'>
            {formatUsd(userGrowthKpis.user_balance_total)}
          </strong>
        </div>
      </div>
      <div className='admin-dashboard-user-growth-panel'>
        <div className='admin-dashboard-user-growth-panel-header'>
          <div>
            <div className='admin-dashboard-card-title'>
              {t('dashboard.admin.users.growth.trend_title')}
            </div>
            <div className='admin-dashboard-user-growth-period'>
              {t('dashboard.admin.users.growth.current_period', {
                range: formatPeriodRange(
                  userGrowthSummary.current?.start_timestamp,
                  userGrowthSummary.current?.end_timestamp,
                ),
              })}
            </div>
            <div className='admin-dashboard-user-growth-period'>
              {t('dashboard.admin.users.growth.previous_period', {
                range: formatPeriodRange(
                  userGrowthSummary.previous?.start_timestamp,
                  userGrowthSummary.previous?.end_timestamp,
                ),
              })}
            </div>
          </div>
          <div className='admin-dashboard-user-growth-legend'>
            {userGrowthLineConfig.map((item) => (
              <span key={item.dataKey} className='admin-dashboard-user-growth-legend-item'>
                <span
                  className='admin-dashboard-user-growth-legend-dot'
                  style={{ background: item.color }}
                />
                {item.label}
              </span>
            ))}
          </div>
        </div>
        {userGrowthTrendData.length === 0 ? (
          <div className='admin-dashboard-empty'>
            {t('dashboard.admin.empty.trend')}
          </div>
        ) : (
          <div className='chart-container'>
            <ResponsiveContainer width='100%' height={240}>
              <LineChart data={userGrowthTrendData}>
                <CartesianGrid {...chartGridStyle()} />
                <XAxis
                  dataKey='label'
                  {...chartAxisStyle()}
                  minTickGap={8}
                />
                <YAxis {...chartAxisStyle()} allowDecimals={false} />
                <Tooltip
                  contentStyle={chartTooltipStyle()}
                  labelStyle={chartTooltipLabelStyle()}
                  itemStyle={chartTooltipItemStyle()}
                  formatter={(value, name) => {
                    const config = userGrowthLineConfig.find(
                      (item) => item.dataKey === name,
                    );
                    return [formatCount(value), config?.label || name];
                  }}
                  labelFormatter={(label, payload) =>
                    payload?.[0]?.payload?.label || label
                  }
                />
                {userGrowthLineConfig.map((item) => (
                  <Line
                    key={item.dataKey}
                    type='monotone'
                    dataKey={item.dataKey}
                    stroke={item.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className='admin-dashboard-user-segments'>
        <div className='admin-dashboard-user-segments-header'>
          <div>
            <div className='admin-dashboard-card-title'>
              {t('dashboard.admin.users.insights.title')}
            </div>
            <div className='admin-dashboard-subsection-description'>
              {t('dashboard.admin.users.insights.footnote')}
            </div>
          </div>
        </div>
        <div className='admin-dashboard-user-segment-grid'>
          {userSegments.map((segment) => {
            const count = Array.isArray(segment.rows) ? segment.rows.length : 0;
            const isLimited = count > USER_SEGMENT_FOCUS_LIMIT;
            return (
              <div key={segment.key} className='admin-dashboard-user-segment-card'>
                <div className='admin-dashboard-user-segment-main'>
                  <div className='admin-dashboard-user-segment-label'>
                    {segment.label}
                  </div>
                  <div className='admin-dashboard-user-segment-count'>
                    {formatCount(count)}
                  </div>
                  <div className='admin-dashboard-user-segment-hint'>
                    {segment.hint}
                  </div>
                  {isLimited ? (
                    <div className='admin-dashboard-user-segment-limit'>
                      {t('dashboard.admin.users.insights.focus_limit', {
                        count: USER_SEGMENT_FOCUS_LIMIT,
                      })}
                    </div>
                  ) : null}
                </div>
                <AppButton
                  className='router-inline-button admin-dashboard-user-segment-action'
                  type='button'
                  icon={<AppIcon name='users' />}
                  disabled={count === 0}
                  onClick={() => openUserSegment(segment)}
                >
                  {t('dashboard.admin.users.insights.view_users')}
                </AppButton>
              </div>
            );
          })}
        </div>
      </div>
      <div className='admin-dashboard-usage-rank'>
        <div className='admin-dashboard-subsection-header admin-dashboard-usage-rank-header'>
          <div className='admin-dashboard-usage-rank-title-row'>
            <div className='admin-dashboard-subsection-title admin-dashboard-subsection-title-strong'>
              {t('dashboard.admin.usage_rank.title')}
            </div>
          </div>
          <div className='admin-dashboard-usage-rank-filter-row'>
            <div className='admin-dashboard-subsection-description'>
              {t('dashboard.admin.usage_rank.description')}
            </div>
            <div className='admin-dashboard-usage-rank-filters'>
              <div className='router-list-toolbar-query router-list-toolbar-query-compact'>
                <AppInput
                  className='admin-dashboard-usage-rank-search'
                  value={usageKeywordInput}
                  placeholder={t('dashboard.admin.usage_rank.search.placeholder')}
                  onChange={(e, { value }) => setUsageKeywordInput(value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      applyUsageKeyword();
                    }
                  }}
                />
                <AppButton color='blue' type='button' onClick={applyUsageKeyword}>
                  {t('dashboard.admin.usage_rank.search.submit')}
                </AppButton>
                {usageKeyword ? (
                  <AppButton
                    type='button'
                    className='router-inline-button'
                    onClick={clearUsageKeyword}
                  >
                    {t('dashboard.admin.usage_rank.search.reset')}
                  </AppButton>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        {dashboard.usage_rank.length === 0 ? (
          <div className='admin-dashboard-empty'>
            {t('dashboard.admin.empty.usage_rank')}
          </div>
        ) : (
          <AppTable
            className='admin-dashboard-rank-table'
            columns={usageRankColumns}
            dataSource={dashboard.usage_rank}
            pagination={false}
            rowKey={(record) =>
              record.user_id ||
              `${record.username || 'unknown'}-${record.last_used_at || 0}`
            }
            scroll={{ x: 980 }}
          />
        )}
      </div>
    </AppSection>
  );

  const renderModelsSection = () => (
    <AppSection className='admin-dashboard-section'>
      <ModelSectionTabs active='operations' />
      <div className='admin-dashboard-subsection-header'>
        <div className='admin-dashboard-subsection-header-main'>
          <div className='admin-dashboard-subsection-title admin-dashboard-subsection-title-strong'>
            {t('dashboard.admin.models.title')}
          </div>
          <div className='admin-dashboard-subsection-description'>
            {t('dashboard.admin.models.description')}
          </div>
        </div>
        <AppToolbar
          className='admin-dashboard-section-toolbar'
          end={renderSectionControls(
            <AppSegmented
              className='admin-dashboard-segmented'
              options={modelSortOptions}
              value={modelSort}
              onChange={(e, { value }) => setModelSort(value)}
            />
          )}
        />
      </div>
      <div className='admin-dashboard-spending-headline'>
        <div className='admin-dashboard-spending-headline-main'>
          <div className='admin-dashboard-spending-headline-label'>
            {t('dashboard.admin.models.summary.critical_model_count')}
          </div>
          <button
            type='button'
            className={`admin-dashboard-spending-headline-value admin-dashboard-model-headline-cta${
              Number(dashboard.model_summary.critical_model_count) > 0
                ? ' admin-dashboard-spending-headline-value-negative'
                : ''
            }`}
            onClick={() =>
              navigate('/workspace/service/models?health=critical')
            }
          >
            {formatCount(dashboard.model_summary.critical_model_count)}
          </button>
          <div className='admin-dashboard-spending-headline-hint'>
            {t('dashboard.admin.models.headline.hint')}
          </div>
        </div>
        <div className='admin-dashboard-spending-headline-side'>
          <div className='admin-dashboard-spending-headline-row'>
            <span>{t('dashboard.admin.models.summary.selected_model_count')}</span>
            <strong>
              {formatCount(dashboard.model_summary.selected_model_count)}
            </strong>
          </div>
          <div className='admin-dashboard-spending-headline-row'>
            <span>{t('dashboard.admin.models.summary.tested_model_count')}</span>
            <strong>
              {formatCount(dashboard.model_summary.tested_model_count)}
            </strong>
          </div>
          <div className='admin-dashboard-spending-headline-row'>
            <span>{t('dashboard.admin.models.summary.healthy_model_count')}</span>
            <strong>
              {formatCount(dashboard.model_summary.healthy_model_count)}
            </strong>
          </div>
        </div>
      </div>
      <div className='admin-dashboard-usage-rank'>
        {sortedModels.length === 0 ? (
          <div className='admin-dashboard-empty'>
            {t('dashboard.admin.empty.models')}
          </div>
        ) : (
          <>
            <div className='admin-dashboard-model-overview-grid'>
              <div className='admin-dashboard-model-panel'>
                <div className='admin-dashboard-card-title'>
                  {t('dashboard.admin.models.chart.leaderboard')}
                </div>
                <div className='admin-dashboard-model-chart'>
                  <ResponsiveContainer width='100%' height={260}>
                    <BarChart
                      data={modelLeaderboardData}
                      layout='vertical'
                      margin={{ top: 0, right: 12, left: 12, bottom: 0 }}
                    >
                      <CartesianGrid
                        {...chartGridStyle()}
                        horizontal={false}
                      />
                      <XAxis type='number' {...chartAxisStyle()} />
                      <YAxis
                        type='category'
                        dataKey='short_model'
                        width={128}
                        {...chartAxisStyle()}
                      />
                      <Tooltip
                        contentStyle={chartTooltipStyle()}
                        labelStyle={chartTooltipLabelStyle()}
                        itemStyle={chartTooltipItemStyle()}
                        formatter={(value, _, payload) => [
                          payload?.payload?.display_value || value,
                          payload?.payload?.metric_label || '',
                        ]}
                        labelFormatter={(_, payload) =>
                          payload?.[0]?.payload?.model || '-'
                        }
                      />
                      <Bar dataKey='value' radius={[0, 4, 4, 0]}>
                        {modelLeaderboardData.map((item) => (
                          <Cell
                            key={`${item.model}-leaderboard`}
                            fill={
                              HEALTH_LEVEL_COLORS[item.health_level] ||
                              HEALTH_LEVEL_COLORS.unknown
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className='admin-dashboard-model-panel'>
                <div className='admin-dashboard-card-title'>
                  {t('dashboard.admin.models.chart.distribution')}
                </div>
                <div className='admin-dashboard-model-distribution-list'>
                  {modelHealthDistribution.map((item) => (
                    <div
                      key={item.key}
                      className='admin-dashboard-model-distribution-item'
                    >
                      <div className='admin-dashboard-model-distribution-main'>
                        <span
                          className='admin-dashboard-model-distribution-dot'
                          style={{ background: item.color }}
                        />
                        <span className='admin-dashboard-model-distribution-label'>
                          {item.label}
                        </span>
                      </div>
                      <div className='admin-dashboard-model-distribution-value'>
                        {formatCount(item.count)}
                      </div>
                    </div>
                  ))}
                  <div className='admin-dashboard-model-distribution-footnote'>
                    {t('dashboard.admin.models.chart.distribution_hint')}
                  </div>
                </div>
              </div>
            </div>
            <div className='admin-dashboard-model-grid'>
              {sortedModels.map((item) => (
                <div
                  key={`${item.provider || 'unknown'}-${item.model}`}
                  className='admin-dashboard-model-card'
                >
                  <div className='admin-dashboard-model-card-header'>
                    <div className='admin-dashboard-model-card-main'>
                      <div
                        className='admin-dashboard-model-card-title'
                        title={item.model || '-'}
                      >
                        {item.model || '-'}
                      </div>
                      <div className='admin-dashboard-model-card-subtitle'>
                        <span>{item.provider || '-'}</span>
                        {Array.isArray(item.tags) && item.tags.length > 0 ? (
                          <div className='router-tag-group'>
                            {item.tags.map((tag) => (
                              <AppTag
                                key={`${item.model}-${tag}`}
                                className='router-tag'
                              >
                                {tag}
                              </AppTag>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className='admin-dashboard-model-card-status'>
                      {renderHealthTag(item.health_level)}
                    </div>
                  </div>
                  <div className='admin-dashboard-model-card-metrics'>
                    <div className='admin-dashboard-model-metric'>
                      <div className='admin-dashboard-model-metric-label'>
                        {t('dashboard.admin.models.card.requests')}
                      </div>
                      <div className='admin-dashboard-model-metric-value'>
                        {formatCount(item.request_count)}
                      </div>
                    </div>
                    <div className='admin-dashboard-model-metric'>
                      <div className='admin-dashboard-model-metric-label'>
                        {t('dashboard.admin.models.card.tokens')}
                      </div>
                      <div className='admin-dashboard-model-metric-value'>
                        {formatCount(item.total_tokens)}
                      </div>
                    </div>
                    <div className='admin-dashboard-model-metric'>
                      <div className='admin-dashboard-model-metric-label'>
                        {t('dashboard.admin.models.card.spend')}
                      </div>
                      <div className='admin-dashboard-model-metric-value'>
                        {formatUsd(item.spend_amount)}
                      </div>
                    </div>
                    <div className='admin-dashboard-model-metric'>
                      <div className='admin-dashboard-model-metric-label'>
                        {t('dashboard.admin.models.card.channels')}
                      </div>
                      <div className='admin-dashboard-model-metric-value'>
                        {formatCount(item.channel_count)}
                      </div>
                    </div>
                    <div className='admin-dashboard-model-metric'>
                      <div className='admin-dashboard-model-metric-label'>
                        {t('dashboard.admin.models.card.supported_endpoints')}
                      </div>
                      <div className='admin-dashboard-model-metric-value'>
                        {formatCount(item.supported_endpoint_count)}
                      </div>
                    </div>
                    <div className='admin-dashboard-model-metric'>
                      <div className='admin-dashboard-model-metric-label'>
                        {t('dashboard.admin.models.card.pass_rate')}
                      </div>
                      <div className='admin-dashboard-model-metric-value'>
                        {formatPercent(item.pass_rate)}
                      </div>
                    </div>
                    <div className='admin-dashboard-model-metric'>
                      <div className='admin-dashboard-model-metric-label'>
                        {t('dashboard.admin.models.card.avg_latency')}
                      </div>
                      <div className='admin-dashboard-model-metric-value'>
                        {item.avg_latency_ms > 0 ? `${item.avg_latency_ms} ms` : '-'}
                      </div>
                    </div>
                    <div className='admin-dashboard-model-metric'>
                      <div className='admin-dashboard-model-metric-label'>
                        {t('dashboard.admin.models.card.last_tested')}
                      </div>
                      <div className='admin-dashboard-model-metric-value'>
                        {formatUpdatedAt(item.last_tested_at)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AppSection>
  );

  return (
    <div className='dashboard-container admin-dashboard-container'>
      {renderPageHeader()}
      <AppSpin spinning={loading} className='admin-dashboard-content-spin'>
        {activeSection === 'spending' ? renderSpendingSection() : null}
        {activeSection === 'channels' ? renderChannelsSection() : null}
        {activeSection === 'users' ? renderUsersSection() : null}
        {activeSection === 'models' ? renderModelsSection() : null}
      </AppSpin>
    </div>
  );
};

export default AdminDashboard;
