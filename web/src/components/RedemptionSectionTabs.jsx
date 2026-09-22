import React from 'react';
import { useTranslation } from 'react-i18next';
import SectionTabs from './SectionTabs';

// Redemption domain sub-nav: code list / redemption records.
function RedemptionSectionTabs({ active = 'list' }) {
  const { t } = useTranslation();
  return (
    <SectionTabs
      active={active}
      tabs={[
        {
          key: 'list',
          label: t('redemption.tabs.list'),
          to: '/admin/redemption',
        },
        {
          key: 'records',
          label: t('redemption.tabs.records'),
          to: '/admin/redemption/records',
        },
      ]}
    />
  );
}

export default RedemptionSectionTabs;
