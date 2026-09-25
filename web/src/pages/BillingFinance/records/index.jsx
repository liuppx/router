import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import BusinessRecordsTable from '../../../components/BusinessRecordsTable';
import { AppSegmented } from '../../../router-ui';

// Unified money-records surface: the four全站-level flow endpoints (top-up
// orders / purchases / reconciliation / redemptions) all run through the single
// `BusinessRecordsTable`, so here we just pick a `kind` and mount it globally
// (no `user_id` lock — reconciliation gets its first cross-user list this way).
// The active sub-view lives in a `flow` query param so links stay shareable and
// switching only swaps the body, keeping the finance shell's tab strip mounted.
const FLOWS = [
  { key: 'topup', kind: 'topup', labelKey: 'billing.records.kinds.topup' },
  { key: 'purchase', kind: 'purchase', labelKey: 'billing.records.kinds.purchase' },
  { key: 'reconcile', kind: 'topup-reconcile', labelKey: 'billing.records.kinds.reconcile' },
  { key: 'redemption', kind: 'redemption', labelKey: 'billing.records.kinds.redemption' },
];

const VALID_FLOWS = new Set(FLOWS.map((flow) => flow.key));

const FinanceRecordsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawFlow = searchParams.get('flow');
  const activeFlow = VALID_FLOWS.has(rawFlow) ? rawFlow : 'topup';
  const activeKind = useMemo(
    () => FLOWS.find((flow) => flow.key === activeFlow)?.kind || 'topup',
    [activeFlow],
  );

  const onFlowChange = (nextFlow) => {
    if (nextFlow === activeFlow) return;
    // Drop the previous view's q/status/page so each sub-view opens clean; the
    // `key` below then remounts the table against the new kind.
    navigate(`/admin/finance?tab=records&flow=${nextFlow}`);
  };

  return (
    <div className='billing-finance-records'>
      <div className='billing-finance-records-switch'>
        <AppSegmented
          options={FLOWS.map((flow) => ({
            value: flow.key,
            label: t(flow.labelKey),
          }))}
          value={activeFlow}
          onChange={(e, { value }) => onFlowChange(value)}
        />
        <p className='billing-finance-records-hint'>{t('billing.records.summary')}</p>
      </div>
      <BusinessRecordsTable
        key={activeFlow}
        kind={activeKind}
        embedded
        title=''
        breadcrumbs={[]}
      />
    </div>
  );
};

export default FinanceRecordsPage;
