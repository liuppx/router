import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import RedemptionsTable from '../../components/RedemptionsTable';
import RecordListPage from '../Records/RecordListPage';
import RedemptionSectionTabs from '../../components/RedemptionSectionTabs';
import { AppFilterHeader } from '../../router-ui';

// Single redemption shell: code list / redemption records live under
// `/admin/redemption?tab=...` so switching a tab only changes the query — the
// breadcrumb + tab strip stay mounted and the body swaps in place instead of
// tearing down a whole route (the old `/admin/redemption/records` page).
const TABS = [
  { key: 'list', labelKey: 'redemption.tabs.list' },
  { key: 'records', labelKey: 'redemption.tabs.records' },
];

const VALID_TABS = new Set(TABS.map((tab) => tab.key));

const RedemptionLayout = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = VALID_TABS.has(rawTab) ? rawTab : 'list';

  const renderActive = () => {
    switch (activeTab) {
      case 'records':
        return <RecordListPage kind='redemption' embedded />;
      case 'list':
      default:
        return <RedemptionsTable embedded />;
    }
  };

  const activeTabLabelKey =
    TABS.find((tab) => tab.key === activeTab)?.labelKey || 'redemption.tabs.list';

  return (
    <div className='dashboard-container'>
      <AppFilterHeader
        breadcrumbs={[
          { key: 'admin', label: t('header.admin_workspace') },
          { key: 'business', label: t('header.operation') },
          { key: 'redemption', label: t('header.redemption') },
          { key: activeTab, label: t(activeTabLabelKey), active: true },
        ]}
        title={t('header.redemption')}
        query={
          <RedemptionSectionTabs active={activeTab} />
        }
      />
      {renderActive()}
    </div>
  );
};

export default RedemptionLayout;
