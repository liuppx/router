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

const RecordListPage = ({ kind, embedded = false }) => {
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

  const sectionTabs =
    kind === 'purchase' ? (
      <EntitlementSectionTabs active='records' />
    ) : kind === 'redemption' ? (
      <RedemptionSectionTabs active='records' />
    ) : null;

  // When embedded in a shell (e.g. EntitlementLayout / RedemptionLayout), the
  // shell owns the breadcrumb + title + tab strip, so pass an empty breadcrumb
  // array (BusinessRecordsTable falls back to a default one on null/undefined),
  // drop the title/tabs, and skip the outer dashboard-container.
  const table = (
    <BusinessRecordsTable
      kind={config.tableKind || kind}
      embedded={embedded}
      title={embedded ? undefined : t(config.titleKey)}
      sectionTabs={embedded ? null : sectionTabs}
      detailBasePath={config.detailBasePath}
      breadcrumbs={
        embedded
          ? []
          : [
              { key: 'admin', label: t('header.admin_workspace') },
              ...parentBreadcrumbs,
              ...(config.hideParentBreadcrumb
                ? []
                : [
                    {
                      key: `${kind}-parent`,
                      label: t(config.parentKey),
                      onClick: () => navigate(config.parentPath),
                    },
                  ]),
              {
                key: `${kind}-records`,
                label: t(config.titleKey),
                active: true,
              },
            ]
      }
    />
  );

  return embedded ? (
    table
  ) : (
    <div className='dashboard-container'>{table}</div>
  );
};

export default RecordListPage;
