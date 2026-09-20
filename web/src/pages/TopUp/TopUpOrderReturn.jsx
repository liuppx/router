import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import {
  API,
  showError,
  showSuccess,
} from '../../helpers';
import {
  AppButton,
  AppEmpty,
  AppFilterHeader,
  AppSection,
} from '../../router-ui';

const TERMINAL_STATUSES = new Set(['paid', 'fulfilled', 'failed', 'canceled']);
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 120000;

const TopUpOrderReturn = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderID = String(searchParams.get('order') || '').trim();

  const [order, setOrder] = useState(null);
  const [phase, setPhase] = useState('pending'); // pending | success | failed | missing
  const [loading, setLoading] = useState(false);
  const deadlineRef = useRef(0);
  const timerRef = useRef(null);
  const activeRef = useRef(true);
  const orderRef = useRef(null);

  // 轮询回调从 ref 读最新订单,避免闭包捕获首帧 null 导致终态判定永不命中。
  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  const refreshOrder = useCallback(async () => {
    if (!orderID) {
      setPhase('missing');
      return;
    }
    setLoading(true);
    try {
      const res = await API.post(
        `/api/v1/public/user/topup/orders/${encodeURIComponent(orderID)}/refresh`,
      );
      const { success, message, data } = res?.data || {};
      if (!success) {
        showError(message || t('topup.external_topup.request_failed'));
        return;
      }
      if (data) {
        setOrder(data);
        const status = String(data.status || '').trim();
        if (status === 'paid' || status === 'fulfilled') {
          setPhase('success');
          showSuccess(t('topup.external_topup.sync.return_success'));
        } else if (status === 'failed' || status === 'canceled') {
          setPhase('failed');
        }
      }
    } catch (error) {
      showError(error?.message || t('topup.external_topup.request_failed'));
    } finally {
      setLoading(false);
    }
  }, [orderID, t]);

  useEffect(() => {
    activeRef.current = true;
    deadlineRef.current = Date.now() + POLL_TIMEOUT_MS;

    refreshOrder();

    const tick = async () => {
      if (!activeRef.current) return;
      if (Date.now() > deadlineRef.current) {
        // Stop polling; leave phase as the last observed status.
        return;
      }
      const status = String(orderRef.current?.status || '').trim();
      if (!TERMINAL_STATUSES.has(status)) {
        await refreshOrder();
      }
    };

    timerRef.current = setInterval(() => {
      tick();
    }, POLL_INTERVAL_MS);

    const onFocus = () => {
      if (!activeRef.current) return;
      const status = String(orderRef.current?.status || '').trim();
      if (!TERMINAL_STATUSES.has(status)) {
        refreshOrder();
      }
    };
    window.addEventListener('focus', onFocus);

    return () => {
      activeRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      window.removeEventListener('focus', onFocus);
    };
    // order 从 orderRef 读取最新值,故不进依赖数组。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshOrder, orderID]);

  const renderBody = () => {
    if (phase === 'missing') {
      return (
        <AppEmpty>
          {t('topup.external_topup.sync.return_failed')}
        </AppEmpty>
      );
    }
    if (phase === 'failed') {
      return (
        <AppSection>
          <div className='router-empty-cell'>
            {t('topup.external_topup.sync.return_failed')}
          </div>
          <div className='router-empty-cell'>
            {t('topup.external_topup.sync.return_failed_hint')}
          </div>
          <div className='router-topup-return-next-actions'>
            <AppButton
              className='router-section-button'
              color='blue'
              onClick={() => navigate('/workspace/service/pricing')}
            >
              {t('topup.external_topup.sync.return_back_pricing')}
            </AppButton>
          </div>
        </AppSection>
      );
    }
    if (phase === 'success') {
      return (
        <AppSection>
          <div className='router-empty-cell'>
            {t('topup.external_topup.sync.return_success')}
          </div>
          <div className='router-topup-return-next'>
            <div className='router-topup-return-next-title'>
              {t('topup.external_topup.sync.next_steps_title')}
            </div>
            <div className='router-topup-return-next-hint'>
              {t('topup.external_topup.sync.next_steps_hint')}
            </div>
            <div className='router-topup-return-next-actions'>
              <AppButton
                className='router-section-button'
                color='blue'
                onClick={() => navigate('/workspace/token')}
              >
                {t('topup.external_topup.sync.next_create_token')}
              </AppButton>
              <AppButton
                className='router-section-button'
                onClick={() => navigate('/workspace/topup?tab=quota')}
              >
                {t('topup.external_topup.sync.next_view_quota')}
              </AppButton>
              <AppButton
                className='router-section-button'
                onClick={() => navigate('/workspace/service/cli-guide')}
              >
                {t('topup.external_topup.sync.next_view_guide')}
              </AppButton>
            </div>
          </div>
        </AppSection>
      );
    }
    return (
      <AppSection>
        <div className='router-empty-cell'>
          {t('topup.external_topup.sync.return_confirming')}
        </div>
      </AppSection>
    );
  };

  return (
    <div className='dashboard-container router-topup-return-page'>
      <AppFilterHeader
        breadcrumbs={[
          { key: 'workspace', label: t('header.user_workspace') },
          { key: 'service', label: t('header.service') },
          {
            key: 'pricing',
            label: t('topup.pricing.title'),
            onClick: () => navigate('/workspace/service/pricing'),
          },
          {
            key: 'return',
            label: t('topup.external_topup.sync.return_title'),
            active: true,
          },
        ]}
        title={t('topup.external_topup.sync.return_title')}
        actions={
          <>
            {orderID && phase !== 'missing' ? (
              <AppButton
                className='router-section-button'
                onClick={refreshOrder}
                loading={loading}
              >
                {t('topup.external_topup.sync.return_retry')}
              </AppButton>
            ) : null}
            {orderID && phase !== 'missing' ? (
              <AppButton
                className='router-section-button'
                color='blue'
                onClick={() =>
                  navigate(`/workspace/topup/orders/${encodeURIComponent(orderID)}`)
                }
              >
                {t('topup.external_topup.sync.return_view_detail')}
              </AppButton>
            ) : null}
            <AppButton
              className='router-section-button'
              onClick={() => navigate('/workspace/service/pricing')}
            >
              {t('topup.external_topup.sync.return_back_pricing')}
            </AppButton>
          </>
        }
      />
      {renderBody()}
    </div>
  );
};

export default TopUpOrderReturn;