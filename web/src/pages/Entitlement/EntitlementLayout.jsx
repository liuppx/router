import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import Entitlement from './index';
import RecordListPage from '../Records/RecordListPage';
import EntitlementSectionTabs from '../../components/EntitlementSectionTabs';
import { AppFilterHeader } from '../../router-ui';

// Single entitlement shell: product packages / purchase records live under
// `/admin/entitlement?tab=...` so switching a tab only changes the query — the
// breadcrumb + tab strip stay mounted and the body swaps in place instead of
// tearing down a whole route (the old `/admin/entitlement/payments` page).
const TABS = [
  { key: 'list', labelKey: 'entitlement.tabs.list' },
  { key: 'records', labelKey: 'entitlement.tabs.records' },
];

const VALID_TABS = new Set(TABS.map((tab) => tab.key));

const EntitlementLayout = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = VALID_TABS.has(rawTab) ? rawTab : 'list';

  const renderActive = () => {
    switch (activeTab) {
      case 'records':
        return <RecordListPage kind='purchase' embedded />;
      case 'list':
      default:
        return <Entitlement embedded />;
    }
  };

  const activeTabLabelKey =
    TABS.find((tab) => tab.key === activeTab)?.labelKey || 'entitlement.tabs.list';

  return (
    <div className='dashboard-container'>
      <AppFilterHeader
        breadcrumbs={[
          { key: 'admin', label: t('header.admin_workspace') },
          { key: 'model', label: t('header.model') },
          { key: 'entitlement', label: t('header.entitlement') },
          { key: activeTab, label: t(activeTabLabelKey), active: true },
        ]}
        title={t('header.entitlement')}
        query={
          <EntitlementSectionTabs active={activeTab} />
        }
      />
      {renderActive()}
    </div>
  );
};

export default EntitlementLayout;
