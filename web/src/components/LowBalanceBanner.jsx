import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { API } from '../helpers';
import { AppAlert, AppButton } from '../router-ui';

const DISMISSED_STORAGE_KEY = 'low_balance_banner_dismissed';

const formatAmount = (value) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return '0';
  }
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 4,
  }).format(normalized);
};

const LowBalanceBanner = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [balance, setBalance] = useState(0);
  const [threshold, setThreshold] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (typeof window !== 'undefined') {
      try {
        if (window.sessionStorage.getItem(DISMISSED_STORAGE_KEY) === '1') {
          return undefined;
        }
      } catch (error) {
        // sessionStorage 可能不可用,静默。
      }
    }

    Promise.all([
      API.get('/api/v1/public/user/self/notification'),
      API.get('/api/v1/public/user/topup/balance/summary'),
    ])
      .then(([settingsRes, balanceRes]) => {
        if (cancelled) return;
        const settingsData = settingsRes?.data?.data || {};
        const balanceData = balanceRes?.data?.data || {};
        const perUserThreshold =
          typeof settingsData.low_balance_threshold === 'number'
            ? settingsData.low_balance_threshold
            : null;
        const defaultThreshold =
          typeof settingsData.default_threshold === 'number'
            ? settingsData.default_threshold
            : 0;
        const effectiveThreshold =
          typeof perUserThreshold === 'number' && perUserThreshold > 0
            ? perUserThreshold
            : defaultThreshold;
        const totalBalance = Number(balanceData?.total_balance_amount ?? 0);
        setBalance(Number.isFinite(totalBalance) ? totalBalance : 0);
        setThreshold(effectiveThreshold || 0);
        if (
          effectiveThreshold > 0 &&
          Number.isFinite(totalBalance) &&
          totalBalance < effectiveThreshold
        ) {
          setVisible(true);
        }
      })
      .catch(() => {
        // 任一接口失败都静默,不展示 banner。
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(DISMISSED_STORAGE_KEY, '1');
      } catch (error) {
        // ignore
      }
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <div className='router-low-balance-banner'>
      <AppAlert
        type='warning'
        showIcon
        message={t('low_balance_banner.message', {
          balance: formatAmount(balance),
          threshold: formatAmount(threshold),
        })}
        className='router-low-balance-banner-alert'
      />
      <div className='router-low-balance-banner-actions'>
        <AppButton
          className='router-section-button'
          color='blue'
          onClick={() => navigate('/workspace/service/pricing')}
        >
          {t('low_balance_banner.action')}
        </AppButton>
        <AppButton
          className='router-section-button'
          basic
          onClick={handleDismiss}
        >
          {t('low_balance_banner.dismiss')}
        </AppButton>
      </div>
    </div>
  );
};

export default LowBalanceBanner;
