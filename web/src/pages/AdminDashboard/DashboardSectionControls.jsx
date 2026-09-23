import { useTranslation } from 'react-i18next';
import { AppButton, AppIcon, AppSelect, AppTooltip } from '../../router-ui';
import { formatUpdatedAt } from './dashboardShared';

// Shared period picker + refresh cluster used by every dashboard section
// (spending / channel health / user analytics / model operations). `extra`
// slots a section-specific control (e.g. a sort segmented) between the period
// picker and the refresh button, matching the original renderSectionControls.
export const DashboardSectionControls = ({
  period,
  periodOptions,
  onPeriodChange,
  generatedAt,
  loading,
  onRefresh,
  extra = null,
}) => {
  const { t } = useTranslation();
  return (
    <div className='admin-dashboard-section-controls'>
      <div className='admin-dashboard-period-control'>
        <AppSelect
          className='router-section-dropdown'
          options={periodOptions}
          value={period}
          onChange={(e, { value }) => onPeriodChange(value)}
        />
      </div>
      {extra}
      <div className='admin-dashboard-refresh-controls'>
        <span className='admin-dashboard-generated-at'>
          {formatUpdatedAt(generatedAt)}
        </span>
        <AppTooltip title={t('dashboard.admin.buttons.refresh')}>
          <AppButton
            className='router-inline-button admin-dashboard-refresh-button'
            type='button'
            aria-label={t('dashboard.admin.buttons.refresh')}
            loading={loading}
            onClick={onRefresh}
            icon={<AppIcon name='exchange' />}
          />
        </AppTooltip>
      </div>
    </div>
  );
};

export default DashboardSectionControls;
