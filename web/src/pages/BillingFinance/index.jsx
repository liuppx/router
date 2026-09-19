import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppFilterHeader, AppSpin } from '../../router-ui';
import SectionTabs from '../../components/SectionTabs';
import './BillingFinance.css';

const BillingOverviewPage = lazy(() => import('./overview'));
const BillingPricingAnalysisPage = lazy(() => import('./profit'));
const BillingProcurementReportPage = lazy(() => import('./procurement'));

const TABS = [
  {
    key: 'overview',
    path: 'overview',
    labelKey: 'billing.overview.title',
  },
  {
    key: 'profit',
    path: 'profit',
    labelKey: 'billing.pricing_analysis.title',
  },
  {
    key: 'procurement',
    path: 'procurement',
    labelKey: 'billing.procurement_report.title',
  },
];

const BillingFinance = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const activeKey = (() => {
    const segment = location.pathname.split('/').pop();
    const match = TABS.find((tab) => tab.path === segment);
    return match?.key || TABS[0].key;
  })();
  return (
    <div className='dashboard-container billing-finance-page'>
      <AppFilterHeader
        breadcrumbs={[
          { key: 'finance', label: t('header.finance') },
          { key: 'billing', label: t('header.finance'), active: true },
        ]}
        query={
          <SectionTabs
            active={activeKey}
            tabs={TABS.map((tab) => ({
              key: tab.key,
              label: t(tab.labelKey),
              to: `/admin/finance/${tab.path}`,
            }))}
          />
        }
      />
      <Suspense fallback={<AppSpin spinning />}>
        <Routes>
          <Route
            index
            element={<Navigate to='/admin/finance/overview' replace />}
          />
          <Route path='overview' element={<BillingOverviewPage />} />
          <Route path='profit' element={<BillingPricingAnalysisPage />} />
          <Route path='procurement' element={<BillingProcurementReportPage />} />
          <Route
            path='*'
            element={<Navigate to='/admin/finance/overview' replace />}
          />
        </Routes>
      </Suspense>
    </div>
  );
};

export default BillingFinance;