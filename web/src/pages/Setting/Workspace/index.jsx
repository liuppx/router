import React from 'react';
import { useTranslation } from 'react-i18next';
import { AppFilterHeader } from '../../../router-ui';
import PersonalSetting from '../../../components/PersonalSetting';

// Workspace-side setting: just the personal preferences (language, theme
// hooks, password, etc.). Lives behind /workspace/setting and only reads
// the current user's data, so no role gating is needed here.
function WorkspaceSetting() {
  const { t } = useTranslation();
  return (
    <div className='dashboard-container'>
      <AppFilterHeader
        breadcrumbs={[
          { key: 'mine', label: t('header.mine') },
          { key: 'account', label: t('header.account'), active: true },
        ]}
        title={t('header.account')}
      />
      <PersonalSetting />
    </div>
  );
}

export default WorkspaceSetting;