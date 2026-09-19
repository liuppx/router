import React from 'react';
import { useTranslation } from 'react-i18next';
import { AppAlert } from '../../router-ui';

const NotFound = () => {
  const { t } = useTranslation();
  return (
    <div className='router-not-found'>
      <AppAlert
        type='error'
        title={t('not_found.title')}
        description={t('not_found.description')}
        showIcon
      />
    </div>
  );
};

export default NotFound;