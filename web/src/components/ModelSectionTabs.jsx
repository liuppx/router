import React from 'react';
import { useTranslation } from 'react-i18next';
import SectionTabs from './SectionTabs';

// Models domain sub-nav: available-model catalog / model operations.
function ModelSectionTabs({ active = 'catalog' }) {
  const { t } = useTranslation();
  return (
    <SectionTabs
      active={active}
      tabs={[
        {
          key: 'catalog',
          label: t('dashboard.admin.model_tabs.catalog'),
          to: '/workspace/service/models',
        },
        {
          key: 'operations',
          label: t('dashboard.admin.model_tabs.operations'),
          to: '/admin/dashboard?section=models',
        },
      ]}
    />
  );
}

export default ModelSectionTabs;
