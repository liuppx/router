import React from 'react';
import { useTranslation } from 'react-i18next';
import SectionTabs from './SectionTabs';

// Entitlement domain sub-nav: product list / purchase records.
function EntitlementSectionTabs({ active = 'list' }) {
  const { t } = useTranslation();
  return (
    <SectionTabs
      active={active}
      tabs={[
        {
          key: 'list',
          label: t('entitlement.tabs.list'),
          to: '/admin/entitlement',
        },
        {
          key: 'records',
          label: t('entitlement.tabs.records'),
          to: '/admin/entitlement/payments',
        },
      ]}
    />
  );
}

export default EntitlementSectionTabs;
