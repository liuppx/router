import { useTranslation } from 'react-i18next';
import { AppButton, AppIcon, AppSelect, AppTooltip } from '../../router-ui';
import { formatUpdatedAt } from './dashboardShared';

// Shared period picker (when a section has a period) + refresh cluster. `extra`
// slots a section-specific control between the picker and refresh button.
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
  const hasPeriodControl =
    Array.isArray(periodOptions) &&
    periodOptions.length > 0 &&
    typeof onPeriodChange === 'function';
  return (
    <div className='admin-dashboard-section-controls'>
      {hasPeriodControl ? (
        <div className='admin-dashboard-period-control'>
          <AppSelect
            className='router-section-dropdown'
            options={periodOptions}
            value={period}
            onChange={(e, { value }) => onPeriodChange(value)}
          />
        </div>
      ) : null}
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
