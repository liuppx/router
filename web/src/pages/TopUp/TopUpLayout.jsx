import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import QuotaPage from './QuotaPage';
import { QuotaHistoryPageInner } from './QuotaHistoryPage';
import TopUpRecordsPage from './TopUpRecordsPage';
import Log from '../Log';
import TopUpWorkspaceProvider from './provider.jsx';
import { AppFilterHeader } from '../../router-ui';
import SectionTabs from '../../components/SectionTabs';

// Single "my usage" hub for normal users: quota overview, historical quota
// cards, payment records and the personal call log all live under
// `/workspace/topup?tab=...` so the sidebar exposes one entry instead of
// scattering these across orphan routes.
const TABS = [
  { key: 'quota', labelKey: 'topup.mine.quota' },
  { key: 'history', labelKey: 'topup.quota_cards.history_title' },
  { key: 'records', labelKey: 'topup.payment_history.title' },
  { key: 'logs', labelKey: 'header.log' },
];

const VALID_TABS = new Set(TABS.map((tab) => tab.key));

const TopUpLayout = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const rawRecord = searchParams.get('record');
  const rawHistory = searchParams.get('history');

  // Legacy query aliases (?history / ?record / ?tab=records) map onto the
  // merged tabs instead of redirecting to standalone routes.
  const activeTab = rawHistory
    ? 'history'
    : rawRecord || rawTab === 'records'
      ? 'records'
      : VALID_TABS.has(rawTab)
        ? rawTab
        : 'quota';

  const renderActive = () => {
    switch (activeTab) {
      case 'history':
        return <QuotaHistoryPageInner embedded />;
      case 'records':
        return <TopUpRecordsPage recordKey='payment' embedded />;
      case 'logs':
        return <Log embedded />;
      case 'quota':
      default:
        return <QuotaPage />;
    }
  };

  const activeTabLabelKey =
    TABS.find((tab) => tab.key === activeTab)?.labelKey || 'topup.mine.quota';

  return (
    <TopUpWorkspaceProvider>
      <div className='dashboard-container'>
        <AppFilterHeader
          breadcrumbs={[
            { key: 'workspace', label: t('header.user_workspace') },
            { key: 'mine', label: t('header.mine') },
            { key: 'topup', label: t(activeTabLabelKey), active: true },
          ]}
          query={
            <SectionTabs
              active={activeTab}
              tabs={TABS.map((tab) => ({
                key: tab.key,
                label: t(tab.labelKey),
                to: `/workspace/topup?tab=${tab.key}`,
              }))}
            />
          }
        />
        {renderActive()}
      </div>
    </TopUpWorkspaceProvider>
  );
};

export default TopUpLayout;
