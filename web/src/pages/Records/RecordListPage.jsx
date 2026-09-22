import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import BusinessRecordsTable from '../../components/BusinessRecordsTable';
import EntitlementSectionTabs from '../../components/EntitlementSectionTabs';
import RedemptionSectionTabs from '../../components/RedemptionSectionTabs';

const RECORD_CONFIG = {
  purchase: {
    titleKey: 'flow.records.purchase_title',
    parentPath: '/admin/entitlement',
    tableKind: 'purchase',
    scope: 'entitlement',
    hideParentBreadcrumb: true,
  },
  redemption: {
    titleKey: 'flow.records.redemption_title',
    parentKey: 'header.redemption',
    parentPath: '/admin/redemption',
    detailBasePath: '/admin/redemption/records',
  },
};

const RecordListPage = ({ kind }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const config = RECORD_CONFIG[kind] || RECORD_CONFIG.purchase;
  const parentBreadcrumbs =
    config.scope === 'entitlement'
      ? [
          { key: 'model', label: t('header.model') },
          {
            key: 'entitlement',
            label: t('header.entitlement'),
            onClick: () => navigate('/admin/entitlement'),
          },
        ]
      : [
          { key: 'business', label: t('header.operation') },
        ];

  return (
    <div className='dashboard-container'>
      {kind === 'purchase' ? (
        <EntitlementSectionTabs active='records' />
      ) : null}
      {kind === 'redemption' ? (
        <RedemptionSectionTabs active='records' />
      ) : null}
      <BusinessRecordsTable
        kind={config.tableKind || kind}
        title={t(config.titleKey)}
        detailBasePath={config.detailBasePath}
        breadcrumbs={[
          { key: 'admin', label: t('header.admin_workspace') },
          ...parentBreadcrumbs,
          ...(config.hideParentBreadcrumb
            ? []
            : [{
                key: `${kind}-parent`,
                label: t(config.parentKey),
                onClick: () => navigate(config.parentPath),
              }]),
          {
            key: `${kind}-records`,
            label: t(config.titleKey),
            active: true,
          },
        ]}
      />
    </div>
  );
};

export default RecordListPage;
