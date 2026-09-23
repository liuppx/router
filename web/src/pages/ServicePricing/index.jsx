import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import BalanceTopUpPage from '../TopUp/BalanceTopUpPage';
import PackagePurchasePage from '../TopUp/PackagePurchasePage';
import TopUpRecordsPage from '../TopUp/TopUpRecordsPage';
import TopUpWorkspaceProvider from '../TopUp/provider.jsx';
import { AppAlert, AppFilterHeader } from '../../router-ui';
import ServicePricingSectionTabs from '../../components/ServicePricingSectionTabs';

// Single service purchase shell: pricing (package + balance) / payment records
// live under `/workspace/service/pricing?tab=...` so switching a tab only
// changes the query — the provider, breadcrumb and tab strip stay mounted and
// the body swaps in place instead of tearing down a whole route (the old
// `/workspace/service/pricing/history` page).
const TABS = [
  { key: 'pricing', labelKey: 'topup.pricing.title' },
  { key: 'records', labelKey: 'topup.payment_history.title' },
];

const VALID_TABS = new Set(TABS.map((tab) => tab.key));

const ServicePricingInner = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = VALID_TABS.has(rawTab) ? rawTab : 'pricing';

  const activeTabLabelKey =
    TABS.find((tab) => tab.key === activeTab)?.labelKey || 'topup.pricing.title';

  const renderPricing = () => (
    <>
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
    </>
  );

  return (
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
          { key: activeTab, label: t(activeTabLabelKey), active: true },
        ]}
        title={t('topup.pricing.page_title')}
        query={<ServicePricingSectionTabs active={activeTab} />}
      />
      {activeTab === 'records' ? (
        <TopUpRecordsPage embedded />
      ) : (
        renderPricing()
      )}
    </div>
  );
};

const ServicePricing = () => (
  <TopUpWorkspaceProvider>
    <ServicePricingInner />
  </TopUpWorkspaceProvider>
);

export default ServicePricing;
