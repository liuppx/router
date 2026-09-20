import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { API, showError } from '../../helpers';
import {
  AppButton,
  AppEmpty,
  AppFilterHeader,
  AppPagination,
  AppSelect,
  AppSkeleton,
} from '../../router-ui';
import QuotaCardItem from './QuotaCardItem';
import TopUpWorkspaceProvider from './provider.jsx';
import useUrlState, { parsePageParam } from '../../hooks/useUrlState';
import {
  renderTopupIntegerAmountWithExactPopup,
  useTopUpWorkspace,
} from './shared.jsx';

const PAGE_SIZE = 20;

export const QuotaHistoryPageInner = ({ embedded = false }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { displayCurrency, displayCurrencyIndex } = useTopUpWorkspace();
  const [cards, setCards] = useState([]);
  const [{ kind, page }, patchQuery] = useUrlState({
    kind: { param: 'hist_kind', default: 'all' },
    page: { param: 'hist_page', default: 1, parse: parsePageParam },
  });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadCards = useCallback(
    async (nextPage = page) => {
      setLoading(true);
      try {
        const response = await API.get('/api/v1/public/user/quota/cards', {
          params: {
            scope: 'history',
            kind,
            page: nextPage,
            page_size: PAGE_SIZE,
          },
        });
        const payload = response?.data || {};
        if (!payload.success) {
          throw new Error(
            payload.message || t('topup.quota_cards.load_failed'),
          );
        }
        setCards(
          Array.isArray(payload.data?.items) ? payload.data.items : [],
        );
        patchQuery({ page: Number(payload.data?.page || nextPage) || 1 });
        setTotal(Number(payload.data?.total || 0) || 0);
      } catch (error) {
        showError(error?.message || t('topup.quota_cards.load_failed'));
      } finally {
        setLoading(false);
      }
    },
    [kind, page, patchQuery, t],
  );

  useEffect(() => {
    loadCards(page).then();
  }, [loadCards, page]);

  const renderAmount = useCallback(
    (amount) =>
      renderTopupIntegerAmountWithExactPopup({
        chargeAmount: Number(amount || 0),
        displayCurrency,
        displayCurrencyIndex,
      }),
    [displayCurrency, displayCurrencyIndex],
  );

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total],
  );
  const kindOptions = useMemo(
    () => [
      { value: 'all', text: t('topup.quota_cards.kind.all') },
      { value: 'package', text: t('topup.quota_cards.kind.package') },
      { value: 'topup', text: t('topup.quota_cards.kind.topup') },
      { value: 'redemption', text: t('topup.quota_cards.kind.redemption') },
      { value: 'gift', text: t('topup.quota_cards.kind.gift') },
    ],
    [t],
  );

  const openCardDetail = useCallback(
    (card) => {
      navigate(
        `/workspace/topup/cards/${encodeURIComponent(card.kind)}/${encodeURIComponent(card.id)}`,
      );
    },
    [navigate],
  );

  const historyBody = (
    <>
      {cards.length > 0 ? (
        <div className='router-quota-card-grid'>
          {cards.map((card) => (
            <QuotaCardItem
              key={`${card.kind}-${card.id}`}
              card={card}
              renderAmount={renderAmount}
              onClick={openCardDetail}
              t={t}
            />
          ))}
        </div>
      ) : loading ? (
        <AppSkeleton variant='cards' count={6} />
      ) : (
        <AppEmpty
          action={
            <AppButton
              color='blue'
              onClick={() => navigate('/workspace/service/pricing')}
            >
              {t('topup.quota_cards.history_empty_cta')}
            </AppButton>
          }
        >
          {t('topup.quota_cards.history_empty')}
        </AppEmpty>
      )}
      {totalPages > 1 ? (
        <div className='router-pagination-wrap-md'>
          <AppPagination
            activePage={page}
            totalPages={totalPages}
            onPageChange={(_, { activePage }) =>
              patchQuery({ page: Number(activePage) || 1 })
            }
          />
        </div>
      ) : null}
    </>
  );

  const toolbar = (
    <>
      <AppButton loading={loading} onClick={() => loadCards(page)}>
        {t('common.refresh')}
      </AppButton>
      <AppSelect
        className='router-quota-history-kind-select'
        options={kindOptions}
        value={kind}
        onChange={(event, { value }) => {
          patchQuery({ kind: String(value || 'all'), page: 1 });
        }}
      />
    </>
  );

  // Embedded inside the TopUp usage hub: the layout already owns the
  // breadcrumb/header, so only render the toolbar + list here.
  if (embedded) {
    return (
      <div className='router-topup-history-panel'>
        <div className='router-topup-history-toolbar'>{toolbar}</div>
        {historyBody}
      </div>
    );
  }

  return (
    <div className='dashboard-container'>
      <AppFilterHeader
        breadcrumbs={[
          { key: 'mine', label: t('header.mine') },
          {
            key: 'quota',
            label: t('topup.mine.quota'),
            onClick: () => navigate('/workspace/topup?tab=quota'),
          },
          {
            key: 'history',
            label: t('topup.quota_cards.history_title'),
            active: true,
          },
        ]}
        title={t('topup.quota_cards.history_title')}
        actions={toolbar}
      />
      {historyBody}
    </div>
  );
};

const QuotaHistoryPage = () => (
  <TopUpWorkspaceProvider>
    <QuotaHistoryPageInner />
  </TopUpWorkspaceProvider>
);

export default QuotaHistoryPage;
