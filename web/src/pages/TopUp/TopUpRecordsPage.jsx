import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { API, timestamp2string, showError, showSuccess, withCardLabels } from '../../helpers';
import { exportCSV } from '../../helpers/csv';
import { formatPaymentAmount } from '../../helpers/render';
import useUrlState, { parsePageParam } from '../../hooks/useUrlState';
import {
  TOPUP_RECORD_COLUMN_WIDTHS,
  TOPUP_RECORD_TABLE_MIN_WIDTH,
} from '../../constants/tableWidthPresets';
import {
  AppButton,
  AppEmpty,
  AppPagination,
  AppPopconfirm,
  AppSection,
  AppSkeleton,
  AppTable,
  AppTooltip,
} from '../../router-ui';
import {
  formatTopupBusinessType,
  formatTopupOrderStatusHint,
  useTopUpWorkspace,
  renderTopupOrderStatus,
} from './shared.jsx';

const PAGE_SIZE = 10;
const REFRESHABLE_TOPUP_ORDER_STATUSES = new Set(['created', 'pending']);

const TopUpRecordsPage = ({ embedded = false }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { renderDisplayAmount } = useTopUpWorkspace();
  const [{ page }, patchQuery] = useUrlState({
    page: { param: 'page', default: 1, parse: parsePageParam },
  });
  const [orders, setOrders] = useState([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [refreshingOrderID, setRefreshingOrderID] = useState('');

  const loadOrders = useCallback(
    async (targetPage = 1) => {
      setLoadingOrders(true);
      try {
        const res = await API.get('/api/v1/public/user/topup/orders', {
          params: {
            page: targetPage,
            page_size: PAGE_SIZE,
            business_type: '',
            credit_origin: 'paid',
          },
        });
        const { success, message, data } = res?.data || {};
        if (success) {
          setOrders(Array.isArray(data?.items) ? data.items : []);
          patchQuery({ page: Number(data?.page || targetPage) || 1 });
          setOrdersTotal(Number(data?.total || 0) || 0);
          return;
        }
        showError(message || t('topup.external_topup.request_failed'));
      } catch (error) {
        showError(error?.message || t('topup.external_topup.request_failed'));
      } finally {
        setLoadingOrders(false);
      }
    },
    [patchQuery, t],
  );

  useEffect(() => {
    loadOrders(page).then();
  }, [loadOrders, page]);

  const ordersTotalPages = Math.max(1, Math.ceil(ordersTotal / PAGE_SIZE));

  const refreshOrderStatus = useCallback(
    async (orderID) => {
      const normalizedOrderID = (orderID || '').trim();
      if (!normalizedOrderID) {
        return null;
      }
      setRefreshingOrderID(normalizedOrderID);
      try {
        const res = await API.post(
          `/api/v1/public/user/topup/orders/${normalizedOrderID}/refresh`,
        );
        const { success, message, data } = res?.data || {};
        if (!success) {
          showError(message || t('topup.external_topup.request_failed'));
          return null;
        }
        setOrders((previous) =>
          previous.map((item) =>
            item.id === normalizedOrderID ? { ...item, ...data } : item,
          ),
        );
        return data || null;
      } catch (error) {
        showError(error?.message || t('topup.external_topup.request_failed'));
        return null;
      } finally {
        setRefreshingOrderID('');
      }
    },
    [t],
  );

  const continuePay = useCallback(
    async (order) => {
      const refreshedOrder = await refreshOrderStatus(order?.id);
      const targetOrder = refreshedOrder || order;
      if (!targetOrder) {
        return;
      }
      if (['paid', 'fulfilled'].includes(targetOrder.status)) {
        showSuccess(t('topup.records.order_paid'));
        loadOrders(page).then();
        return;
      }
      const redirectURL = (targetOrder.redirect_url || '').trim();
      if (redirectURL === '') {
        showError(t('topup.records.redirect_missing'));
        return;
      }
      const popup = window.open(redirectURL, '_blank');
      if (!popup) {
        showError(t('topup.external_topup.popup_blocked'));
      }
    },
    [loadOrders, page, refreshOrderStatus, t],
  );

  const manualRefreshOrder = useCallback(
    async (orderID) => {
      const refreshedOrder = await refreshOrderStatus(orderID);
      if (refreshedOrder && ['paid', 'fulfilled'].includes(refreshedOrder.status)) {
        showSuccess(t('topup.records.order_paid'));
      }
    },
    [refreshOrderStatus, t],
  );

  const cancelPay = useCallback(
    async (orderID) => {
      const normalizedOrderID = (orderID || '').trim();
      if (!normalizedOrderID) {
        return;
      }
      setRefreshingOrderID(normalizedOrderID);
      try {
        const res = await API.post(
          `/api/v1/public/user/topup/orders/${normalizedOrderID}/cancel`,
        );
        const { success, message, data } = res?.data || {};
        if (!success) {
          showError(message || t('topup.external_topup.request_failed'));
          return;
        }
        setOrders((previous) =>
          previous.map((item) =>
            item.id === normalizedOrderID ? { ...item, ...(data || {}) } : item,
          ),
        );
        showSuccess(t('topup.records.order_canceled'));
      } catch (error) {
        showError(error?.message || t('topup.external_topup.request_failed'));
      } finally {
        setRefreshingOrderID('');
      }
    },
    [t],
  );

  const openOrderDetailPage = useCallback(
    (order) => {
      const normalizedOrderID = (order?.id || '').trim();
      if (!normalizedOrderID) {
        return;
      }
      const currentPagePath = `${location.pathname}${location.search}${location.hash}`;
      navigate(`/workspace/topup/orders/${encodeURIComponent(normalizedOrderID)}`, {
        state: {
          from: currentPagePath,
          recordKey: 'payment',
        },
      });
    },
    [
      location.hash,
      location.pathname,
      location.search,
      navigate,
    ],
  );

  const orderColumns = useMemo(
    () => [
      {
        title: t('topup.external_topup_orders.columns.time'),
        dataIndex: 'created_at',
        key: 'created_at',
        className: 'router-table-col-datetime',
        width: TOPUP_RECORD_COLUMN_WIDTHS.time,
        render: (value) => (value ? timestamp2string(value) : '-'),
      },
      {
        title: t('topup.external_topup_orders.columns.business_type'),
        dataIndex: 'business_type',
        key: 'business_type',
        className: 'router-table-col-type-narrow',
        width: TOPUP_RECORD_COLUMN_WIDTHS.businessType,
        render: (value) => formatTopupBusinessType(value, t),
      },
      {
        title: t('topup.external_topup_orders.columns.status'),
        dataIndex: 'status',
        key: 'status',
        className: 'router-table-col-status-compact',
        width: TOPUP_RECORD_COLUMN_WIDTHS.status,
        render: (value, order) => {
          const statusNode = renderTopupOrderStatus(value, t);
          const statusHint = order?.business_type !== 'package_purchase'
            ? formatTopupOrderStatusHint(value, t)
            : '';
          if (!statusHint) {
            return statusNode;
          }
          return (
            <AppTooltip title={statusHint}>
              <span className='router-help-trigger'>
                {statusNode}
              </span>
            </AppTooltip>
          );
        },
      },
      {
        title: t('topup.external_topup_orders.columns.amount'),
        dataIndex: 'amount',
        key: 'amount',
        width: TOPUP_RECORD_COLUMN_WIDTHS.amount,
        render: (_, order) =>
          order.amount > 0
            ? formatPaymentAmount(order.amount, order.currency)
            : order.quota > 0
              ? renderDisplayAmount(order.quota)
              : '-',
      },
      {
        title: t('topup.external_topup_orders.columns.name'),
        dataIndex: 'quota',
        key: 'name',
        width: TOPUP_RECORD_COLUMN_WIDTHS.quotaOrPackage,
        ellipsis: true,
        render: (_, order) => {
          if (order.business_type === 'package_purchase') {
            return order.package_name || order.title || '-';
          }
          if (order.quota > 0) {
            return renderDisplayAmount(order.quota);
          }
          return order.title || '-';
        },
      },
      {
        title: t('topup.external_topup_orders.columns.action'),
        key: 'action',
        className: 'router-table-col-actions-token',
        width: TOPUP_RECORD_COLUMN_WIDTHS.actions,
        render: (_, order) => {
          const canRefreshStatus = REFRESHABLE_TOPUP_ORDER_STATUSES.has(order.status);
          if (!canRefreshStatus) {
            return '-';
          }
          return (
            <div className='router-action-group-tight router-table-actions-wide'>
              <AppButton
                className='router-inline-button'
                onClick={(event) => {
                  event.stopPropagation();
                  manualRefreshOrder(order.id);
                }}
                loading={refreshingOrderID === order.id}
                disabled={refreshingOrderID === order.id}
              >
                {t('topup.records.refresh_status')}
              </AppButton>
              <AppButton
                className='router-inline-button'
                color='blue'
                onClick={(event) => {
                  event.stopPropagation();
                  continuePay(order);
                }}
                loading={refreshingOrderID === order.id}
                disabled={refreshingOrderID === order.id}
              >
                {t('topup.records.continue_pay')}
              </AppButton>
              <AppPopconfirm
                title={t('topup.records.cancel_pay_confirm')}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
                onConfirm={() => cancelPay(order.id)}
              >
                <AppButton
                  className='router-inline-button'
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  loading={refreshingOrderID === order.id}
                  disabled={refreshingOrderID === order.id}
                >
                  {t('topup.records.cancel_pay')}
                </AppButton>
              </AppPopconfirm>
            </div>
          );
        },
      },
    ],
    [
      cancelPay,
      continuePay,
      formatTopupBusinessType,
      manualRefreshOrder,
      refreshingOrderID,
      renderDisplayAmount,
      t,
    ],
  );

  const sectionTitle = t('topup.payment_history.title');
  const shouldShowSectionExtra = !embedded;
  const handleExportCsv = useCallback(() => {
    const stamp = timestamp2string(Math.floor(Date.now() / 1000)).replace(
      /[^0-9]/g,
      '',
    );
    exportCSV(
      `topup-payment-${stamp}.csv`,
      [
        {
          key: 'created_at',
          label: t('topup.external_topup_orders.columns.time'),
          format: (v) => (v ? timestamp2string(v) : ''),
        },
        {
          key: 'business_type',
          label: t('topup.external_topup_orders.columns.business_type'),
          format: (v) => formatTopupBusinessType(v, t),
        },
        {
          key: 'status',
          label: t('topup.external_topup_orders.columns.status'),
        },
        {
          key: 'amount',
          label: t('topup.external_topup_orders.columns.amount'),
        },
        {
          key: 'quota',
          label: t('topup.external_topup_orders.columns.quota'),
        },
        {
          key: 'package_name',
          label: t('topup.external_topup_orders.columns.package_name'),
        },
      ],
      orders,
    );
  }, [orders, t]);
  const sectionExtra = shouldShowSectionExtra ? (
    <>
      <AppButton
        className='router-section-button'
        onClick={() => navigate('/workspace/service/pricing')}
      >
        {t('topup.payment_history.back_to_pricing')}
      </AppButton>
      <AppButton
        className='router-section-button'
        onClick={handleExportCsv}
        disabled={orders.length === 0}
      >
        {t('common.export_csv')}
      </AppButton>
      <AppButton
        className='router-section-button'
        onClick={() => loadOrders(page)}
        loading={loadingOrders}
      >
        {t('topup.records.refresh')}
      </AppButton>
    </>
  ) : null;

  return (
    <>
      {embedded ? (
        <div className='router-topup-history-panel'>
          {sectionExtra ? (
            <div className='router-topup-history-toolbar'>{sectionExtra}</div>
          ) : null}
          {loadingOrders && orders.length === 0 ? (
            <AppSkeleton variant='list' count={6} />
          ) : (
            <div className='router-table-scroll-x'>
              <AppTable
                className='router-list-table router-table-fit-page router-table-cardify'
                rowKey='id'
                pagination={false}
                scroll={{ x: TOPUP_RECORD_TABLE_MIN_WIDTH }}
                loading={loadingOrders}
                locale={{
                  emptyText: (
                    <AppEmpty
                      action={
                        <AppButton
                          color='blue'
                          onClick={() => navigate('/workspace/service/pricing')}
                        >
                          {t('topup.record_nav.topup')}
                        </AppButton>
                      }
                    >
                      {t('topup.records.order_empty')}
                    </AppEmpty>
                  ),
                }}
                dataSource={orders}
                columns={withCardLabels(orderColumns)}
                onRow={(order) => ({
                  onClick: () => openOrderDetailPage(order),
                  style: { cursor: 'pointer' },
                })}
              />
            </div>
          )}
          {ordersTotalPages > 1 ? (
            <div className='router-pagination-wrap-md'>
              <AppPagination
                className='router-section-pagination'
                activePage={page}
                totalPages={ordersTotalPages}
                onPageChange={(_, { activePage: nextActivePage }) => {
                  patchQuery({ page: Number(nextActivePage) || 1 });
                }}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <AppSection title={sectionTitle} extra={sectionExtra}>
          {loadingOrders && orders.length === 0 ? (
            <AppSkeleton variant='list' count={6} />
          ) : (
            <div className='router-table-scroll-x'>
              <AppTable
                className='router-list-table router-table-fit-page router-table-cardify'
                rowKey='id'
                pagination={false}
                scroll={{ x: TOPUP_RECORD_TABLE_MIN_WIDTH }}
                loading={loadingOrders}
                locale={{
                  emptyText: (
                    <AppEmpty
                      action={
                        <AppButton
                          color='blue'
                          onClick={() => navigate('/workspace/service/pricing')}
                        >
                          {t('topup.record_nav.topup')}
                        </AppButton>
                      }
                    >
                      {t('topup.records.order_empty')}
                    </AppEmpty>
                  ),
                }}
                dataSource={orders}
                columns={withCardLabels(orderColumns)}
                onRow={(order) => ({
                  onClick: () => openOrderDetailPage(order),
                  style: { cursor: 'pointer' },
                })}
              />
            </div>
          )}
          {ordersTotalPages > 1 ? (
            <div className='router-pagination-wrap-md'>
              <AppPagination
                className='router-section-pagination'
                activePage={page}
                totalPages={ordersTotalPages}
                onPageChange={(_, { activePage: nextActivePage }) => {
                  patchQuery({ page: Number(nextActivePage) || 1 });
                }}
              />
            </div>
          ) : null}
        </AppSection>
      )}
    </>
  );
};

export default TopUpRecordsPage;