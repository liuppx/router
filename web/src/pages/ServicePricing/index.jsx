import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import BalanceTopUpPage from '../TopUp/BalanceTopUpPage';
import PackagePurchasePage from '../TopUp/PackagePurchasePage';
import TopUpWorkspaceProvider from '../TopUp/provider.jsx';
import { AppAlert, AppFilterHeader } from '../../router-ui';

const ServicePricing = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <TopUpWorkspaceProvider>
      <div className='dashboard-container router-service-pricing-page'>
        <AppFilterHeader
          breadcrumbs={[
            { key: 'workspace', label: t('header.user_workspace') },
            { key: 'mine', label: t('header.mine') },
            {
              key: 'quota',
              label: t('topup.mine.quota'),
              onClick: () => navigate('/workspace/topup?tab=quota'),
            },
            { key: 'pricing', label: t('topup.pricing.title'), active: true },
          ]}
          title={t('topup.pricing.page_title')}
          meta={
            <Link
              className='router-breadcrumb-link router-service-pricing-history-link'
              to='/workspace/service/pricing/history'
            >
              {t('topup.payment_history.button')}
            </Link>
          }
          metaClassName='router-service-pricing-history-link-wrap'
        />
        <AppAlert
          type='info'
          showIcon
          className='router-service-pricing-info'
          message={
            <div className='router-service-pricing-info-body'>
              <div className='router-service-pricing-info-title'>
                {t('topup.pricing.balance_vs_package_title')}
              </div>
              <div className='router-service-pricing-info-text'>
                {t('topup.pricing.balance_vs_package_body')}
              </div>
            </div>
          }
        />
        <div id='pricing-package-section'>
          <PackagePurchasePage />
        </div>
        <div id='pricing-balance-section'>
          <BalanceTopUpPage />
        </div>
      </div>
    </TopUpWorkspaceProvider>
  );
};

export default ServicePricing;
