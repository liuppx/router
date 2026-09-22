import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AppFilterHeader } from '../../router-ui';
import TopUpRecordsPage from '../TopUp/TopUpRecordsPage';
import TopUpWorkspaceProvider from '../TopUp/provider.jsx';
import ServicePricingSectionTabs from '../../components/ServicePricingSectionTabs';

const PaymentRecordsPageInner = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className='dashboard-container router-payment-history-page'>
      <AppFilterHeader
        breadcrumbs={[
          { key: 'workspace', label: t('header.user_workspace') },
          { key: 'mine', label: t('header.mine') },
          {
            key: 'quota',
            label: t('topup.mine.quota'),
            onClick: () => navigate('/workspace/topup?tab=quota'),
          },
          {
            key: 'payment-history',
            label: t('topup.payment_history.title'),
            active: true,
          },
        ]}
        title={t('topup.payment_history.title')}
      />
      <ServicePricingSectionTabs active='records' />
      <TopUpRecordsPage embedded />
    </div>
  );
};

const PaymentRecordsPage = () => (
  <TopUpWorkspaceProvider>
    <PaymentRecordsPageInner />
  </TopUpWorkspaceProvider>
);

export default PaymentRecordsPage;
