import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import UsersTable from '../../components/UsersTable';
import Task, { TASK_PAGE_KIND_ADMIN_USER } from '../Task';
import UserAnalyticsSection from '../AdminDashboard/sections/UserAnalyticsSection';
import { AppFilterHeader } from '../../router-ui';
import SectionTabs from '../../components/SectionTabs';
import '../AdminDashboard/Dashboard.css';
import '../AdminDashboard/AdminDashboard.css';

// Single customer shell: user list / conversion analytics / user tasks all live
// under `/admin/user?tab=...` so switching a tab only changes the query — the
// breadcrumb + tab strip stay mounted and the body swaps in place. The list tab
// still honors ?focus_ids= deep links (UsersTable reads them) since that lands
// on the default tab.
const TABS = [
  { key: 'list', labelKey: 'user.tabs.list' },
  { key: 'analytics', labelKey: 'user.tabs.analytics' },
  { key: 'tasks', labelKey: 'user.tabs.tasks' },
];

const VALID_TABS = new Set(TABS.map((tab) => tab.key));

const UserLayout = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = VALID_TABS.has(rawTab) ? rawTab : 'list';

  const renderActive = () => {
    switch (activeTab) {
      case 'analytics':
        return <UserAnalyticsSection />;
      case 'tasks':
        return <Task pageKind={TASK_PAGE_KIND_ADMIN_USER} embedded />;
      case 'list':
      default:
        return <UsersTable embedded />;
    }
  };

  const activeTabLabelKey =
    TABS.find((tab) => tab.key === activeTab)?.labelKey || 'user.tabs.list';

  return (
    <div className='dashboard-container admin-dashboard-container'>
      <AppFilterHeader
        className='admin-dashboard-toolbar'
        breadcrumbs={[
          { key: 'admin', label: t('header.admin_workspace') },
          { key: 'business', label: t('header.operation') },
          { key: 'user', label: t('header.user') },
          { key: activeTab, label: t(activeTabLabelKey), active: true },
        ]}
        title={t('header.user')}
        query={
          <SectionTabs
            active={activeTab}
            tabs={TABS.map((tab) => ({
              key: tab.key,
              label: t(tab.labelKey),
              to: `/admin/user?tab=${tab.key}`,
            }))}
          />
        }
      />
      {renderActive()}
    </div>
  );
};

export default UserLayout;
