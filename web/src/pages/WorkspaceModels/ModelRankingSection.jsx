import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { API } from '../../helpers/api';
import { buildLogDrilldownPath } from '../../components/LogsTable.helpers';
import {
  AppAlert,
  AppButton,
  AppEmpty,
  AppIcon,
  AppInput,
  AppSegmented,
  AppSelect,
  AppSpin,
  AppTag,
  AppTooltip,
  AppToolbar,
  chartAxisStyle,
  chartCategoricalPalette,
  chartGridStyle,
  chartTooltipItemStyle,
  chartTooltipLabelStyle,
  chartTooltipStyle,
} from '../../router-ui';
import { useUsdFormatter } from '../AdminDashboard/dashboardShared';

const EMPTY_PAYLOAD = {
  scope: 'me',
  period: 'last_7_days',
  start_at: 0,
  end_at: 0,
  generated_at: 0,
  total_request_count: 0,
  total_tokens: 0,
  public_min_request_count: 5,
  public_min_distinct_users: 2,
  items: [],
};

const PERIODS = ['last_24_hours', 'last_7_days', 'last_30_days'];
const SCOPES = ['me', 'global'];

const toNumber = (value) => {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
};

const formatCount = (value) => toNumber(value).toLocaleString('zh-CN');

const formatPercent = (value) => `${(toNumber(value) * 100).toFixed(1)}%`;

const formatUpdatedAt = (value) => {
  const timestamp = toNumber(value);
  if (!timestamp) return '-';
  return new Date(timestamp * 1000).toLocaleString('zh-CN', {
    hour12: false,
  });
};

const normalizePayload = (payload) => {
  const data = payload && typeof payload === 'object' ? payload : {};
  return {
    ...EMPTY_PAYLOAD,
    ...data,
    start_at: toNumber(data.start_at),
    end_at: toNumber(data.end_at),
    generated_at: toNumber(data.generated_at),
    total_request_count: toNumber(data.total_request_count),
    total_tokens: toNumber(data.total_tokens),
    public_min_request_count: toNumber(data.public_min_request_count),
    public_min_distinct_users: toNumber(data.public_min_distinct_users),
    items: Array.isArray(data.items)
      ? data.items.map((item) => ({
          ...item,
          rank: toNumber(item?.rank),
          model: String(item?.model || '').trim(),
          provider: String(item?.provider || '').trim(),
          tags: Array.isArray(item?.tags) ? item.tags : [],
          health_level: String(item?.health_level || 'unknown')
            .trim()
            .toLowerCase(),
          sample_state: String(item?.sample_state || 'sufficient')
            .trim()
            .toLowerCase(),
          request_count: toNumber(item?.request_count),
          share_rate: toNumber(item?.share_rate),
          total_tokens: toNumber(item?.total_tokens),
          spend_quota: toNumber(item?.spend_quota),
          last_used_at: toNumber(item?.last_used_at),
          avg_latency_ms: toNumber(item?.avg_latency_ms),
          channel_count: toNumber(item?.channel_count),
        }))
      : [],
  };
};

function ModelRankingSection({
  hasAdminAccess,
  keyword,
  scope,
  period,
  onKeywordChange,
  onScopeChange,
  onPeriodChange,
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { formatUsd } = useUsdFormatter();
  const [payload, setPayload] = useState(EMPTY_PAYLOAD);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await API.get('/api/v1/public/model/ranking', {
        params: { scope, period },
      });
      if (response.data?.success) {
        setPayload(normalizePayload(response.data.data));
        setLoadFailed(false);
      } else {
        setLoadFailed(true);
      }
    } catch (error) {
      console.error('Failed to load model ranking:', error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [period, scope]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const scopeOptions = useMemo(
    () =>
      SCOPES.map((value) => ({
        value,
        label: t(`workspace_models.ranking.scope.${value}`),
      })),
    [t],
  );

  const periodOptions = useMemo(
    () =>
      PERIODS.map((value) => ({
        value,
        label: t(`workspace_models.ranking.period.${value}`),
      })),
    [t],
  );

  const items = useMemo(() => {
    const query = String(keyword || '').trim().toLowerCase();
    if (!query) return payload.items;
    return payload.items.filter((item) =>
      [item.model, item.provider, ...(item.tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [keyword, payload.items]);

  const chartItems = useMemo(
    () =>
      items
        .filter((item) => !item.suppressed && item.request_count > 0)
        .slice(0, 10)
        .map((item) => ({
          model: item.model,
          shortModel:
            item.model.length > 24 ? `${item.model.slice(0, 22)}…` : item.model,
          requestCount: item.request_count,
        })),
    [items],
  );

  const renderHealth = (item) => {
    const level = item.published ? item.health_level || 'unknown' : 'unpublished';
    const color =
      level === 'healthy'
        ? 'green'
        : level === 'warning'
          ? 'orange'
          : level === 'critical'
            ? 'red'
            : 'grey';
    return (
      <AppTag color={color} className='router-tag'>
        {t(`workspace_models.ranking.health.${level}`)}
      </AppTag>
    );
  };

  return (
    <AppSpin spinning={loading}>
      <section
        className='workspace-model-ranking-section'
        aria-labelledby='workspace-model-ranking-heading'
      >
        <h2 id='workspace-model-ranking-heading' className='workspace-model-section-heading'>
          {t('workspace_models.ranking.title')}
        </h2>
        <p className='workspace-model-section-description'>
          {t(`workspace_models.ranking.description.${scope}`)}
        </p>
        {loadFailed && (
          <AppAlert
            type='error'
            showIcon
            title={t('workspace_models.ranking.load_failed')}
            action={
              <AppButton size='small' loading={loading} onClick={loadData}>
                {t('workspace_models.retry')}
              </AppButton>
            }
          />
        )}
        <AppToolbar
          className='workspace-model-ranking-toolbar'
          start={
            <div className='workspace-model-ranking-toolbar-start'>
              <AppInput
                className='workspace-models-search'
                value={keyword}
                aria-label={t('workspace_models.ranking.search_placeholder')}
                placeholder={t('workspace_models.ranking.search_placeholder')}
                onChange={(event, { value }) => onKeywordChange(value)}
              />
              <AppSegmented
                className='workspace-model-ranking-scope'
                options={scopeOptions}
                value={scope}
                onChange={(event, { value }) => onScopeChange(value)}
              />
            </div>
          }
          end={
            <div className='workspace-model-ranking-toolbar-end'>
              <AppSelect
                className='workspace-model-ranking-period'
                aria-label={t('workspace_models.ranking.period_label')}
                options={periodOptions}
                value={period}
                onChange={(event, { value }) => onPeriodChange(value)}
              />
              <AppTooltip title={t('workspace_models.refresh')}>
                <AppButton
                  type='button'
                  className='router-inline-button workspace-models-refresh'
                  aria-label={t('workspace_models.refresh')}
                  loading={loading}
                  onClick={loadData}
                  icon={<AppIcon name='exchange' />}
                />
              </AppTooltip>
            </div>
          }
        />
        <div className='workspace-model-ranking-meta'>
          <span>
            {t('workspace_models.ranking.window', {
              start: formatUpdatedAt(payload.start_at),
              end: formatUpdatedAt(payload.end_at),
            })}
          </span>
          <span>
            {t('workspace_models.generated_at', {
              time: formatUpdatedAt(payload.generated_at),
            })}
          </span>
          <span>{t('workspace_models.ranking.count_definition')}</span>
        </div>
        {scope === 'global' && !hasAdminAccess && (
          <div className='workspace-model-ranking-privacy-note'>
            {t('workspace_models.ranking.privacy_note', {
              requests: payload.public_min_request_count,
              users: payload.public_min_distinct_users,
            })}
          </div>
        )}

        {!loadFailed && items.length === 0 && !loading ? (
          <AppEmpty>{t(`workspace_models.ranking.empty.${scope}`)}</AppEmpty>
        ) : (
          <>
            <div className='workspace-model-ranking-chart-block'>
              <div className='workspace-model-ranking-chart-heading'>
                <span>{t('workspace_models.ranking.chart_title')}</span>
                <span>
                  {t('workspace_models.ranking.total_calls', {
                    count: formatCount(payload.total_request_count),
                  })}
                </span>
              </div>
              {chartItems.length === 0 ? (
                <div className='workspace-model-ranking-chart-empty'>
                  {t('workspace_models.ranking.chart_empty')}
                </div>
              ) : (
                <div className='workspace-model-ranking-chart'>
                  <ResponsiveContainer
                    width='100%'
                    height={Math.max(240, chartItems.length * 44)}
                  >
                    <BarChart
                      data={chartItems}
                      layout='vertical'
                      margin={{ top: 4, right: 20, left: 12, bottom: 4 }}
                    >
                      <CartesianGrid {...chartGridStyle()} horizontal={false} />
                      <XAxis type='number' {...chartAxisStyle()} />
                      <YAxis
                        type='category'
                        dataKey='shortModel'
                        width={148}
                        {...chartAxisStyle()}
                      />
                      <Tooltip
                        contentStyle={chartTooltipStyle()}
                        labelStyle={chartTooltipLabelStyle()}
                        itemStyle={chartTooltipItemStyle()}
                        formatter={(value) => [
                          formatCount(value),
                          t('workspace_models.ranking.calls'),
                        ]}
                        labelFormatter={(_, rows) => rows?.[0]?.payload?.model || '-'}
                      />
                      <Bar
                        dataKey='requestCount'
                        fill={chartCategoricalPalette[0]}
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div
              className={`workspace-model-ranking-list${hasAdminAccess ? ' is-admin' : ''}`}
              role='table'
              aria-label={t('workspace_models.ranking.table_label')}
            >
              <div className='workspace-model-ranking-list-header' role='row'>
                <span role='columnheader'>{t('workspace_models.ranking.rank')}</span>
                <span role='columnheader'>{t('workspace_models.ranking.model')}</span>
                <span role='columnheader'>{t('workspace_models.ranking.usage')}</span>
                {hasAdminAccess && (
                  <span role='columnheader'>{t('workspace_models.ranking.cost')}</span>
                )}
                <span role='columnheader'>{t('workspace_models.ranking.status')}</span>
                {hasAdminAccess && (
                  <span role='columnheader'>{t('workspace_models.ranking.action')}</span>
                )}
              </div>
              {items.map((item) => (
                <div
                  key={`${item.model}-${item.provider || 'unknown'}`}
                  className={`workspace-model-ranking-row${item.suppressed ? ' is-suppressed' : ''}`}
                  role='row'
                >
                  <div className='workspace-model-ranking-rank' role='cell'>
                    {item.rank > 0 ? item.rank : '—'}
                  </div>
                  <div className='workspace-model-ranking-model' role='cell'>
                    <strong title={item.model}>{item.model || '-'}</strong>
                    <div>
                      <span>{item.provider || '-'}</span>
                      {item.tags.slice(0, 2).map((tag) => (
                        <AppTag
                          key={`${item.model}-${tag}`}
                          className='router-tag workspace-model-tag'
                        >
                          {tag}
                        </AppTag>
                      ))}
                    </div>
                  </div>
                  <div className='workspace-model-ranking-metrics' role='cell'>
                    {item.suppressed ? (
                      <AppTag color='orange' className='router-tag'>
                        {t('workspace_models.ranking.sample_insufficient')}
                      </AppTag>
                    ) : (
                      <>
                        <span>
                          <small>{t('workspace_models.ranking.calls')}</small>
                          <strong>{formatCount(item.request_count)}</strong>
                        </span>
                        <span>
                          <small>{t('workspace_models.ranking.share')}</small>
                          <strong>{formatPercent(item.share_rate)}</strong>
                        </span>
                        {hasAdminAccess && (
                          <span>
                            <small>{t('workspace_models.ranking.tokens')}</small>
                            <strong>{formatCount(item.total_tokens)}</strong>
                          </span>
                        )}
                        {!hasAdminAccess && scope === 'me' && (
                          <span>
                            <small>{t('workspace_models.ranking.last_used')}</small>
                            <strong>{formatUpdatedAt(item.last_used_at)}</strong>
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {hasAdminAccess && (
                    <div className='workspace-model-ranking-cost' role='cell'>
                      <span>
                        <small>{t('workspace_models.ranking.spend')}</small>
                        <strong>{formatUsd(item.spend_quota)}</strong>
                      </span>
                      <span>
                        <small>{t('workspace_models.ranking.channels')}</small>
                        <strong>{formatCount(item.channel_count)}</strong>
                      </span>
                    </div>
                  )}
                  <div className='workspace-model-ranking-status' role='cell'>
                    {renderHealth(item)}
                    <span>
                      {item.avg_latency_ms > 0
                        ? `${formatCount(item.avg_latency_ms)} ms`
                        : '-'}
                    </span>
                  </div>
                  {hasAdminAccess && (
                    <div className='workspace-model-ranking-action' role='cell'>
                      <AppButton
                        type='link'
                        onClick={() =>
                          navigate(
                            buildLogDrilldownPath('admin', {
                              model_name: item.model,
                            }),
                          )
                        }
                      >
                        {t('log.drilldown.view')}
                      </AppButton>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </AppSpin>
  );
}

export default ModelRankingSection;
