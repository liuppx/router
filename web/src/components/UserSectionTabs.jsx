import React from 'react';
import { useTranslation } from 'react-i18next';
import SectionTabs from './SectionTabs';

// Customers domain sub-nav: user list / conversion analytics / user tasks.
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
        { key: 'tasks', label: t('user.tabs.tasks'), to: '/admin/task' },
      ]}
    />
  );
}

export default UserSectionTabs;
