import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import './Dashboard.css';
import {
  PERIOD_OPTIONS,
  TREND_METRIC_OPTIONS,
  DASHBOARD_SECTION_TITLES,
  formatCount,
  useAdminDashboardData,
  useUsdFormatter,
} from './dashboardShared';
import { DashboardSectionControls } from './DashboardSectionControls';
import './AdminDashboard.css';

// The admin dashboard is now the spending overview only. Channel health, user
// analytics, and model operations moved to their own entity shells
// (/admin/channel?tab=health, /admin/user?tab=analytics,
// /workspace/service/models?tab=operations); old ?section= deep links are
// redirected there by DashboardSectionRedirect in App.jsx.
const AdminDashboard = () => {
  const { t } = useTranslation();
  const { formatUsd } = useUsdFormatter();
  const [period, setPeriod] = useState('last_7_days');
  const [trendMetric, setTrendMetric] = useState('spend_amount');

  const { dashboard, loading, reload } = useAdminDashboardData('spending', {
    period,
  });

  const spendingTitle = t(DASHBOARD_SECTION_TITLES.spending);

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
        { key: 'spending', label: spendingTitle, active: true },
      ]}
      title={spendingTitle}
    />
  );

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

  return (
    <div className='dashboard-container admin-dashboard-container'>
      {renderPageHeader()}
      <AppSpin spinning={loading} className='admin-dashboard-content-spin'>
        {renderSpendingSection()}
      </AppSpin>
    </div>
  );
};

export default AdminDashboard;
