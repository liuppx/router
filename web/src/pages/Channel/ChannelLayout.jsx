import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import ChannelsTable from '../../components/ChannelsTable';
import Task, { TASK_PAGE_KIND_ADMIN_SYSTEM } from '../Task';
import AdminChannelAlertsPanel from '../../components/AdminChannelAlertsPanel';
import ChannelHealthSection from '../AdminDashboard/sections/ChannelHealthSection';
import { AppFilterHeader } from '../../router-ui';
import SectionTabs from '../../components/SectionTabs';
import '../AdminDashboard/Dashboard.css';
import '../AdminDashboard/AdminDashboard.css';

// Single channel shell: list / health / alerts / system tasks all live under
// `/admin/channel?tab=...` so switching a tab only changes the query string —
// the tab strip stays mounted and the body swaps in place instead of tearing
// down a whole route (the old cross-route SectionTabs behavior).
const TABS = [
  { key: 'list', labelKey: 'channel.tabs.list' },
  { key: 'health', labelKey: 'channel.tabs.health' },
  { key: 'alerts', labelKey: 'channel.tabs.alerts' },
  { key: 'tasks', labelKey: 'channel.tabs.tasks' },
];

const VALID_TABS = new Set(TABS.map((tab) => tab.key));

const ChannelLayout = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = VALID_TABS.has(rawTab) ? rawTab : 'list';

  const renderActive = () => {
    switch (activeTab) {
      case 'health':
        return <ChannelHealthSection />;
      case 'alerts':
        return <AdminChannelAlertsPanel />;
      case 'tasks':
        return <Task pageKind={TASK_PAGE_KIND_ADMIN_SYSTEM} embedded />;
      case 'list':
      default:
        return <ChannelsTable embedded />;
    }
  };

  return (
    <div className='dashboard-container admin-dashboard-container'>
      <AppFilterHeader
        className='admin-dashboard-toolbar'
        query={
          <SectionTabs
            active={activeTab}
            tabs={TABS.map((tab) => ({
              key: tab.key,
              label: t(tab.labelKey),
              to: `/admin/channel?tab=${tab.key}`,
            }))}
          />
        }
      />
      {renderActive()}
    </div>
  );
};

export default ChannelLayout;
