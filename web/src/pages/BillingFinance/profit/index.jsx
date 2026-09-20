import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { API, showError } from '../../../helpers';
import { exportCSV } from '../../../helpers/csv';
import { formatDecimalNumber } from '../../../helpers/render';
import {
  AppButton,
  AppFilterHeader,
  AppInput,
  AppSelect,
  AppSection,
  AppSpin,
  AppTable,
  AppTag,
  chartAxisStyle,
  chartGridStyle,
  chartNeutralColor,
  chartStatusPalette,
  chartTooltipStyle,
  formatCnyChart,
  formatCnyFixed,
  formatCsvCurrency,
  formatCsvPercent,
  formatBillingPercent,
  BILLING_PERCENT_DECIMALS,
} from '../../../router-ui';
import './BillingPricingAnalysis.css';

const formatCNY = formatCnyFixed;
const formatCount = (value) => formatDecimalNumber(value || 0, 0);
const formatPercent = (value) => formatBillingPercent(value, BILLING_PERCENT_DECIMALS);

const toDateTimeLocalValue = (timestamp) => {
  if (!Number.isFinite(Number(timestamp)) || Number(timestamp) <= 0) return '';
  const date = new Date(Number(timestamp) * 1000);
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('');
};

const timestampFromDateTimeLocal = (value) => {
  if (!value) return 0;
  const date = new Date(value);
  const timestamp = Math.floor(date.getTime() / 1000);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
};

const STATE_COLORS = {
  healthy: chartStatusPalette.success,
  low_margin: chartStatusPalette.warning,
  loss: chartStatusPalette.danger,
  unknown: chartNeutralColor(),
};

const normalize = (payload) => ({
  items: (Array.isArray(payload?.items) ? payload.items : []).map((item) => ({
    ...item,
    request_count: Number(item?.request_count || 0),
    configured_cost_request_count: Number(item?.configured_cost_request_count || 0),
    estimated_cost_request_count: Number(item?.estimated_cost_request_count || 0),
    pending_cost_request_count: Number(item?.pending_cost_request_count || 0),
    retry_cost_request_count: Number(item?.retry_cost_request_count || 0),
    unconfigured_cost_request_count: Number(item?.unconfigured_cost_request_count || 0),
    router_consumed_yyc: Number(item?.router_consumed_yyc || 0),
    sell_base_amount: Number(item?.sell_base_amount || 0),
    procurement_cost_base_amount: Number(item?.procurement_cost_base_amount || 0),
    gross_profit_base_amount: Number(item?.gross_profit_base_amount || 0),
    gross_margin: Number(item?.gross_margin || 0),
    cost_floor_triggered_count: Number(item?.cost_floor_triggered_count || 0),
    cost_floor_triggered_amount: Number(item?.cost_floor_triggered_amount || 0),
    procurement_cost_base_per_unit: Number(item?.procurement_cost_base_per_unit || 0),
  })),
});

const recentRange = () => {
  const end = Math.floor(Date.now() / 1000);
  return { start_at: end - 7 * 24 * 60 * 60, end_at: end };
};

const pricingState = (row) => {
  if (row.unconfigured_cost_request_count > 0 || row.pending_cost_request_count > 0 || row.retry_cost_request_count > 0 || row.estimated_cost_request_count > 0) return 'unknown';
  if (row.configured_cost_request_count <= 0) return 'unknown';
  if (row.gross_margin < 0) return 'loss';
  if (row.gross_margin < 0.1) return 'low_margin';
  return 'healthy';
};

function BillingPricingAnalysis() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const defaults = useMemo(() => recentRange(), []);
  const initialContext = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const numberParam = (key, fallback) => {
      const value = Number(params.get(key) || 0);
      return Number.isFinite(value) && value > 0 ? value : fallback;
    };
    const rawStart = params.get('start_at');
    const rawEnd = params.get('end_at');
    return {
      startAt: rawStart ? timestampFromDateTimeLocal(rawStart) || numberParam('start_at', defaults.start_at) : numberParam('start_at', defaults.start_at),
      endAt: rawEnd ? timestampFromDateTimeLocal(rawEnd) || numberParam('end_at', defaults.end_at) : numberParam('end_at', defaults.end_at),
      channelID: params.get('channel_id') || '',
      model: params.get('model') || '',
      groupID: params.get('group_id') || '',
      returnTo: params.get('return_to') || '',
    };
  }, [defaults]);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [groupID, setGroupID] = useState(initialContext.groupID);
  const [channelID, setChannelID] = useState(initialContext.channelID);
  const [model, setModel] = useState(initialContext.model);
  const [startAt, setStartAt] = useState(initialContext.startAt);
  const [endAt, setEndAt] = useState(initialContext.endAt);
  const [groupOptions, setGroupOptions] = useState([]);
  const [channelOptions, setChannelOptions] = useState([]);

  const queryContext = useMemo(() => ({
    start_at: startAt,
    end_at: endAt,
    channel_id: channelID,
    model,
    group_id: groupID,
  }), [channelID, endAt, groupID, model, startAt]);

  const buildProcurementTarget = useCallback((model) => {
    const params = new URLSearchParams();
    Object.entries({ ...queryContext, model }).forEach(([key, value]) => {
      if (value !== '') params.set(key, String(value));
    });
    params.set('return_to', `${location.pathname}?${new URLSearchParams(queryContext).toString()}`);
    return `/admin/finance/procurement?${params.toString()}`;
  }, [location.pathname, queryContext]);

  useEffect(() => {
    API.get('/api/v1/admin/groups', { params: { page: 1, page_size: 200 } })
      .then((response) => {
        if (!response.data?.success) return;
        const items = Array.isArray(response.data?.data?.items) ? response.data.data.items : [];
        setGroupOptions(items.map((group) => ({ key: group.id, value: group.id, text: group.name || group.id })));
      })
      .catch((error) => showError(error?.message || t('common.load_failed')));

    API.get('/api/v1/admin/channels/', { params: { page: 1, page_size: 500 } })
      .then((response) => {
        if (!response.data?.success) return;
        const items = Array.isArray(response.data?.data?.items) ? response.data?.data?.items : [];
        setChannelOptions(
          items.map((item) => ({
            key: item.id,
            value: String(item.id),
            text: item.name || String(item.id),
          })),
        );
      })
      .catch((error) => showError(error?.message || t('common.load_failed')));
  }, []);

  // Sync filters into the URL so the page is bookmarkable.
  useEffect(() => {
    const params = new URLSearchParams();
    if (startAt) params.set('start_at', String(startAt));
    if (endAt) params.set('end_at', String(endAt));
    if (channelID) params.set('channel_id', channelID);
    if (model) params.set('model', model);
    if (groupID) params.set('group_id', groupID);
    if (initialContext.returnTo) params.set('return_to', initialContext.returnTo);
    navigate(
      {
        pathname: location.pathname,
        search: params.toString() ? `?${params.toString()}` : '',
      },
      { replace: true },
    );
  }, [
    channelID,
    endAt,
    groupID,
    initialContext.returnTo,
    location.pathname,
    model,
    navigate,
    startAt,
  ]);

  const load = useCallback(async () => {
    if (!startAt || !endAt || endAt < startAt) {
      showError(t('billing.overview.invalid_time'));
      return;
    }
    setLoading(true);
    try {
      const response = await API.get('/api/v1/admin/billing/procurement-report', {
        params: { ...queryContext, group_by: 'model', cost_scope: 'all' },
      });
      if (!response.data?.success) {
        showError(response.data?.message || t('billing.pricing_analysis.load_failed'));
        return;
      }
      setRows(normalize(response.data.data).items);
    } catch (error) {
      showError(error?.message || t('billing.pricing_analysis.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [queryContext, startAt, endAt, t]);

  useEffect(() => { load().then(); }, [load]);

  const summaryTotals = useMemo(() => {
    const items = Array.isArray(rows) ? rows : [];
    let revenue = 0;
    let cost = 0;
    let profit = 0;
    let lossCount = 0;
    let lowMarginCount = 0;
    items.forEach((row) => {
      const configured = Number(row?.configured_cost_request_count || 0);
      const rowCost = Number(row?.procurement_cost_base_amount || 0);
      if (configured > 0) {
        revenue += Number(row?.sell_base_amount || 0);
        cost += rowCost;
        profit += Number(row?.gross_profit_base_amount || 0);
      }
      const state = pricingState(row);
      if (state === 'loss') lossCount += 1;
      else if (state === 'low_margin') lowMarginCount += 1;
    });
    const weightedMargin = revenue > 0 ? profit / revenue : 0;
    return {
      models: items.length,
      lossCount,
      lowMarginCount,
      revenue,
      cost,
      profit,
      weightedMargin,
    };
  }, [rows]);

  const stateDistribution = useMemo(() => {
    const items = Array.isArray(rows) ? rows : [];
    const counts = { healthy: 0, low_margin: 0, loss: 0, unknown: 0 };
    items.forEach((row) => {
      counts[pricingState(row)] += 1;
    });
    return ['healthy', 'low_margin', 'loss', 'unknown'].map((state) => ({
      key: state,
      label: t(`billing.pricing_analysis.states.${state}`),
      count: counts[state],
      color: STATE_COLORS[state],
    }));
  }, [rows, t]);

  const columns = [
    {
      title: t('billing.pricing_analysis.columns.model'),
      dataIndex: 'dimension_key',
      width: 220,
      render: (value) => <span className='billing-pricing-analysis-model'>{value || '-'}</span>,
    },
    {
      title: t('billing.pricing_analysis.columns.state'),
      key: 'state',
      width: 120,
      render: (_, row) => {
        const state = pricingState(row);
        return <AppTag color={state === 'loss' ? 'red' : state === 'healthy' ? 'green' : 'orange'}>{t(`billing.pricing_analysis.states.${state}`)}</AppTag>;
      },
    },
    {
      title: t('billing.pricing_analysis.columns.requests'),
      dataIndex: 'request_count',
      width: 100,
      align: 'right',
      render: formatCount,
    },
    {
      title: t('billing.pricing_analysis.columns.sell'),
      dataIndex: 'sell_base_amount',
      width: 130,
      align: 'right',
      render: formatCNY,
    },
    {
      title: t('billing.pricing_analysis.columns.cost'),
      dataIndex: 'procurement_cost_base_amount',
      width: 130,
      align: 'right',
      render: formatCNY,
    },
    {
      title: t('billing.pricing_analysis.columns.profit'),
      dataIndex: 'gross_profit_base_amount',
      width: 130,
      align: 'right',
      render: formatCNY,
    },
    {
      title: t('billing.pricing_analysis.columns.margin'),
      dataIndex: 'gross_margin',
      width: 110,
      align: 'right',
      render: formatPercent,
    },
    {
      title: t('billing.pricing_analysis.columns.cost_coverage'),
      key: 'coverage',
      width: 150,
      align: 'right',
      render: (_, row) => `${formatCount(row.configured_cost_request_count)} / ${formatCount(row.request_count)}`,
    },
    {
      title: t('billing.pricing_analysis.columns.actions'),
      key: 'actions',
      width: 120,
      render: (_, row) => <Link to={buildProcurementTarget(row.dimension_key)}>{t('billing.pricing_analysis.view_procurement')}</Link>,
    },
  ];

  const fromOverview = initialContext.returnTo.startsWith('/admin/finance/overview');
  const breadcrumbs = [
    { key: 'finance', label: t('header.finance') },
    ...(fromOverview ? [{ key: 'overview', label: t('billing.overview.title'), onClick: () => navigate(initialContext.returnTo) }] : []),
    { key: 'pricing-analysis', label: t('billing.pricing_analysis.title'), active: true },
  ];

  const summaryKpis = [
    {
      key: 'models',
      label: t('billing.pricing_analysis.summary.models'),
      value: formatCount(summaryTotals.models),
      hint: t('billing.pricing_analysis.summary.low_margin_models') + ` ${formatCount(summaryTotals.lowMarginCount)}`,
      danger: false,
    },
    {
      key: 'loss',
      label: t('billing.pricing_analysis.summary.loss_models'),
      value: formatCount(summaryTotals.lossCount),
      hint: formatCNY(summaryTotals.profit),
      danger: summaryTotals.lossCount > 0,
    },
    {
      key: 'revenue',
      label: t('billing.pricing_analysis.summary.total_revenue'),
      value: formatCNY(summaryTotals.revenue),
      hint: formatCNY(summaryTotals.cost),
      danger: false,
    },
    {
      key: 'margin',
      label: t('billing.pricing_analysis.summary.avg_margin'),
      value: formatPercent(summaryTotals.weightedMargin),
      hint: formatCNY(summaryTotals.profit),
      danger: summaryTotals.weightedMargin < 0.1,
    },
  ];

  return (
    <div className='dashboard-container billing-pricing-analysis-page'>
      <AppFilterHeader
        breadcrumbs={breadcrumbs}
        actions={
          <>
            <AppButton
              className='router-page-button'
              loading={loading}
              onClick={() => {
                exportCSV(
                  `pricing-analysis-${new Date(startAt * 1000).toISOString().slice(0, 19).replace(/[:T]/g, '-')}_${new Date(endAt * 1000).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`,
                  [
                    { key: 'dimension_key', label: t('billing.pricing_analysis.columns.model') },
                    { key: 'request_count', label: t('billing.pricing_analysis.columns.requests') },
                    { key: 'configured_cost_request_count', label: t('billing.pricing_analysis.columns.cost_coverage').split('/')[0]?.trim() },
                    { key: 'sell_base_amount', label: t('billing.pricing_analysis.columns.sell'), format: formatCsvCurrency },
                    { key: 'procurement_cost_base_amount', label: t('billing.pricing_analysis.columns.cost'), format: formatCsvCurrency },
                    { key: 'gross_profit_base_amount', label: t('billing.pricing_analysis.columns.profit'), format: formatCsvCurrency },
                    { key: 'gross_margin', label: t('billing.pricing_analysis.columns.margin'), format: formatCsvPercent },
                  ],
                  rows,
                );
              }}
            >
              {t('common.export_csv')}
            </AppButton>
            <AppButton
              className='router-page-button'
              color='blue'
              loading={loading}
              onClick={() => load().then()}
            >
              {t('common.refresh')}
            </AppButton>
          </>
        }
        query={
          <div className='billing-pricing-analysis-filters'>
            <AppInput
              className='router-section-input billing-pricing-analysis-time-input'
              type='datetime-local'
              value={toDateTimeLocalValue(startAt)}
              onChange={(e, { value }) => setStartAt(timestampFromDateTimeLocal(value))}
            />
            <AppInput
              className='router-section-input billing-pricing-analysis-time-input'
              type='datetime-local'
              value={toDateTimeLocalValue(endAt)}
              onChange={(e, { value }) => setEndAt(timestampFromDateTimeLocal(value))}
            />
            <AppSelect
              className='router-section-input billing-pricing-analysis-group-select'
              clearable
              search
              options={groupOptions}
              value={groupID}
              placeholder={t('billing.pricing_analysis.group_placeholder')}
              onChange={(e, { value }) => setGroupID((value || '').toString())}
            />
            <AppSelect
              className='router-section-input billing-pricing-analysis-group-select'
              clearable
              search
              options={channelOptions}
              value={channelID}
              placeholder={t('billing.pricing_analysis.channel_placeholder')}
              onChange={(e, { value }) => setChannelID((value || '').toString())}
            />
            <AppInput
              className='router-section-input billing-pricing-analysis-group-select'
              value={model}
              placeholder={t('billing.pricing_analysis.model_placeholder')}
              onChange={(e, { value }) => setModel((value || '').toString())}
            />
          </div>
        }
      />
      <AppSpin spinning={loading}>
        <AppSection className='billing-pricing-analysis-section'>
          <div className='billing-pricing-analysis-note'>{t('billing.pricing_analysis.context', { start: new Date(startAt * 1000).toLocaleString(), end: new Date(endAt * 1000).toLocaleString() })}</div>
          <div className='billing-pricing-analysis-note'>{t('billing.pricing_analysis.note')}</div>
          <div className='billing-pricing-analysis-summary-grid'>
            {summaryKpis.map((item) => (
              <div
                key={item.key}
                className={`billing-pricing-analysis-summary-card${
                  item.danger ? ' is-danger' : ''
                }`}
              >
                <div className='billing-pricing-analysis-summary-label'>{item.label}</div>
                <div className='billing-pricing-analysis-summary-value'>{item.value}</div>
                <div className='billing-pricing-analysis-summary-hint'>{item.hint}</div>
              </div>
            ))}
          </div>
          <div className='billing-pricing-analysis-distribution'>
            <div className='billing-pricing-analysis-distribution-title'>
              {t('billing.pricing_analysis.distribution.title')}
            </div>
            <div className='billing-pricing-analysis-distribution-hint'>
              {t('billing.pricing_analysis.distribution.hint')}
            </div>
            <div className='chart-container'>
              <ResponsiveContainer width='100%' height={200}>
                <BarChart data={stateDistribution}>
                  <CartesianGrid {...chartGridStyle()} />
                  <XAxis dataKey='label' {...chartAxisStyle()} />
                  <YAxis {...chartAxisStyle()} allowDecimals={false} />
                  <Tooltip contentStyle={chartTooltipStyle()} />
                  <Bar dataKey='count' radius={[4, 4, 0, 0]}>
                    {stateDistribution.map((item) => (
                      <Cell key={item.key} fill={item.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <AppTable className='router-detail-table billing-pricing-analysis-table' size='small' pagination={false} rowKey={(row) => row.dimension_key} dataSource={rows} columns={columns} locale={{ emptyText: t('billing.pricing_analysis.empty') }} />
        </AppSection>
      </AppSpin>
    </div>
  );
}

export default BillingPricingAnalysis;
