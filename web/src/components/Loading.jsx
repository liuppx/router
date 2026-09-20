import React from 'react';
import { useTranslation } from 'react-i18next';
import { AppSpin } from '../router-ui';

const Loading = () => {
  const { t } = useTranslation();
  return (
    <div className='router-loading-shell'>
      <AppSpin size='large' description={t('common.loading')} />
    </div>
  );
};

export default Loading;
