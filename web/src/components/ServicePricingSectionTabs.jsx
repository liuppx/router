import React from 'react';
import { useTranslation } from 'react-i18next';
import SectionTabs from './SectionTabs';

// Service purchase domain sub-nav: purchase / payment records.
function ServicePricingSectionTabs({ active = 'pricing' }) {
  const { t } = useTranslation();
  return (
    <SectionTabs
      active={active}
      tabs={[
        {
          key: 'pricing',
          label: t('topup.pricing.title'),
          to: '/workspace/service/pricing?tab=pricing',
        },
        {
          key: 'records',
          label: t('topup.payment_history.title'),
          to: '/workspace/service/pricing?tab=records',
        },
      ]}
    />
  );
}

export default ServicePricingSectionTabs;
