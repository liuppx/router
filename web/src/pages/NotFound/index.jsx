import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AppAlert, AppButton } from '../../router-ui';

const NotFound = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className='router-not-found'>
      <AppAlert
        type='error'
        title={t('not_found.title')}
        description={t('not_found.description')}
        showIcon
      />
      <div className='router-not-found-actions'>
        <AppButton color='blue' onClick={() => navigate('/')}>
          {t('not_found.back_home')}
        </AppButton>
      </div>
    </div>
  );
};

export default NotFound;
