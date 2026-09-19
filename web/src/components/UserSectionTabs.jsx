import React from 'react';
import { useTranslation } from 'react-i18next';
import SectionTabs from './SectionTabs';

// Customers domain sub-nav: user list / conversion analytics.
function UserSectionTabs({ active = 'list' }) {
  const { t } = useTranslation();
  return (
    <SectionTabs
      active={active}
      tabs={[
        { key: 'list', label: t('user.tabs.list'), to: '/admin/user' },
        {
          key: 'analytics',
          label: t('user.tabs.analytics'),
          to: '/admin/dashboard?section=users',
        },
      ]}
    />
  );
}

export default UserSectionTabs;
