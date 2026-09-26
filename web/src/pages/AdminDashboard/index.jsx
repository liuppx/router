import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AppFilterHeader,
  AppSection,
  AppSegmented,
  AppSpin,
  AppToolbar,
  chartAxisStyle,
  chartCategoricalPalette,
  chartGridStyle,
  chartStatusPalette,
  chartTooltipStyle,
  chartTooltipLabelStyle,
  chartTooltipItemStyle,
} from '../../router-ui';
import { API } from '../../helpers';
import useChannelAlertSummary from '../../hooks/useChannelAlertSummary';
import { adaptListResponse } from '../../hooks/useList';
import './Dashboard.css';
import {
  PERIOD_OPTIONS,
  TREND_METRIC_OPTIONS,
  EMPTY_CHANNEL_HEALTH_SUMMARY,
  formatCount,
  useAdminDashboardData,
  useUsdFormatter,
} from './dashboardShared';
import { DashboardSectionControls } from './DashboardSectionControls';
import './AdminDashboard.css';

// 两个重面板延后到值班状态条首绘之后再加载,保住首屏首字节的处置信号(磁贴数字)
// 尽快点亮;告警面板与健康概览随后填入(AppSpin 占位)。
const AdminChannelAlertsPanel = lazy(() =>
  import('../../components/AdminChannelAlertsPanel'),
);
const ChannelHealthSection = lazy(() => import('./sections/ChannelHealthSection'));
const RouteAnomaliesSection = lazy(() => import('./sections/RouteAnomaliesSection'));
// 经营大盘(模型运营)由原「可用模型 / 经营」双 TAB 合并下沉而来,自包含取数,
// 与收支大盘同属值班台底部的经营板块;延后加载,不与首屏排障信号争首字节。
const ModelOperationsSection = lazy(() =>
  import('./sections/ModelOperationsSection'),
);

// 首屏 = 值班台:顶部一排可点击状态磁贴(火/供给/失败任务/收支)让运营者一眼
// 看清「今天有没有事」并直接下钻到处置现场;其下内嵌排障三件套——告警面板(就地
// ack/resolve)、渠道健康概览、路由异常排名,把「出问题去哪看」收敛到一个入口;
// 经营大盘下沉到最底。这些小件自包含、零/注入 props、各自轮询或取数。
const AdminDashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { formatUsd } = useUsdFormatter();
  const [period, setPeriod] = useState('last_7_days');
  const [trendMetric, setTrendMetric] = useState('spend_amount');

  const { dashboard, loading, reload } = useAdminDashboardData('spending', {
    period,
  });

  // 值班状态条数据源(均复用既有接口,无新后端):
  // - 告警摘要:与侧栏红点共用的 hook(60s 轮询)。
  const { unresolvedCritical, unacknowledged } = useChannelAlertSummary();
  // - 渠道健康摘要:复用 dashboard?section=channels 的 channel_health_summary。
  //   同一份结果注入内嵌 <ChannelHealthSection>,避免它再取一次同 section。
  const {
    dashboard: channelsDashboard,
    loading: channelsLoading,
    reload: channelsReload,
  } = useAdminDashboardData('channels');
  const channelHealthSummary = useMemo(
    () => ({
      ...EMPTY_CHANNEL_HEALTH_SUMMARY,
      ...(channelsDashboard.channel_health_summary || {}),
    }),
    [channelsDashboard.channel_health_summary],
  );
  // - 失败任务数:轻量拉一页系统任务(status=failed)取 total。
  const [failedTaskCount, setFailedTaskCount] = useState(0);
  useEffect(() => {
    let active = true;
    API.get('/api/v1/admin/tasks', {
      params: { status: 'failed', page: 1, page_size: 1 },
    })
      .then((response) => {
        if (!active || response?.data?.success !== true) return;
        const { total } = adaptListResponse(response.data);
        setFailedTaskCount(Number(total || 0));
      })
      .catch(() => {
        // 值班条为概览信号,失败静默降级为 0,不打断首屏。
      });
    return () => {
      active = false;
    };
  }, []);

  const dutyTitle = t('dashboard.admin.duty.title');

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
        { key: 'duty', label: dutyTitle, active: true },
      ]}
      title={dutyTitle}
    />
  );

  const renderDutyStrip = () => {
    const riskyChannels =
      Number(channelHealthSummary.risk_count || 0) +
      Number(channelHealthSummary.active_circuit_breaker_count || 0);
    const tiles = [
      {
        key: 'pending_alerts',
        label: t('dashboard.admin.duty.pending_alerts'),
        value: unresolvedCritical,
        hint: t('dashboard.admin.duty.pending_alerts_hint', {
          count: unacknowledged,
        }),
        tone: 'critical',
        to: '/admin/channel?tab=alerts',
      },
      {
        key: 'risky_channels',
        label: t('dashboard.admin.duty.risky_channels'),
        value: riskyChannels,
        tone: 'critical',
        to: '/admin/channel?tab=health',
      },
      {
        key: 'low_balance_channels',
        label: t('dashboard.admin.duty.low_balance_channels'),
        value: Number(channelHealthSummary.low_balance_channel_count || 0),
        tone: 'warning',
        to: '/admin/channel',
      },
      {
        key: 'failed_tasks',
        label: t('dashboard.admin.duty.failed_tasks'),
        value: failedTaskCount,
        tone: 'warning',
        to: '/admin/channel?tab=tasks',
      },
      {
        key: 'net_amount',
        label: t('dashboard.admin.duty.net_amount'),
        display: formatUsd(dashboard.summary.net_amount),
        tone: 'info',
        to: '/admin/finance',
      },
    ];
    return (
      <div className='admin-dashboard-duty-strip'>
        {tiles.map((tile) => (
          <button
            type='button'
            key={tile.key}
            className={`admin-dashboard-channel-bell admin-dashboard-channel-bell-cta is-${tile.tone}${
              tile.value > 0 ? ' is-active' : ''
            }`}
            onClick={() => navigate(tile.to)}
          >
            <div className='admin-dashboard-channel-bell-value'>
              {tile.display !== undefined ? tile.display : tile.value}
            </div>
            <div className='admin-dashboard-channel-bell-label'>{tile.label}</div>
            {tile.hint ? (
              <div className='admin-dashboard-duty-tile-hint'>{tile.hint}</div>
            ) : null}
          </button>
        ))}
      </div>
    );
  };

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
          end={
            <DashboardSectionControls
              period={period}
              periodOptions={periodOptions}
              onPeriodChange={setPeriod}
              generatedAt={dashboard.generated_at}
              loading={loading}
              onRefresh={reload}
            />
          }
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
              {t('dashboard.admin.spending.trend_title')}
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

  return (
    <div className='dashboard-container admin-dashboard-container'>
      {renderPageHeader()}
      {renderDutyStrip()}
      <Suspense
        fallback={
          <AppSpin spinning className='admin-dashboard-content-spin' />
        }
      >
        <AdminChannelAlertsPanel />
        <ChannelHealthSection
          injectedData={{
            dashboard: channelsDashboard,
            loading: channelsLoading,
            reload: channelsReload,
          }}
        />
        <RouteAnomaliesSection />
      </Suspense>
      <div className='admin-dashboard-board-divider'>
        <div className='admin-dashboard-board-divider-title'>
          {t('dashboard.admin.board.operations_title')}
        </div>
        <div className='admin-dashboard-board-divider-hint'>
          {t('dashboard.admin.board.operations_hint')}
        </div>
      </div>
      <AppSpin spinning={loading} className='admin-dashboard-content-spin'>
        {renderSpendingSection()}
      </AppSpin>
      <Suspense
        fallback={
          <AppSpin spinning className='admin-dashboard-content-spin' />
        }
      >
        <ModelOperationsSection />
      </Suspense>
    </div>
  );
};

export default AdminDashboard;
