import React from 'react';
import { useTranslation } from 'react-i18next';
import SectionTabs from './SectionTabs';

// Customers domain sub-nav: user list / conversion analytics / user tasks.
// All tabs point at /admin/user?tab=... so the UserLayout shell keeps its
// breadcrumb/header mounted and swaps the body in place.
function UserSectionTabs({ active = 'list' }) {
  const { t } = useTranslation();
  return (
    <SectionTabs
      active={active}
      tabs={[
        { key: 'list', label: t('user.tabs.list'), to: '/admin/user?tab=list' },
        {
          key: 'analytics',
          label: t('user.tabs.analytics'),
          to: '/admin/user?tab=analytics',
        },
        { key: 'tasks', label: t('user.tabs.tasks'), to: '/admin/user?tab=tasks' },
      ]}
    />
  );
}

export default UserSectionTabs;
