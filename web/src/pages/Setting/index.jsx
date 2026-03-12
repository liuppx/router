import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Tab } from 'semantic-ui-react';
import { useLocation } from 'react-router-dom';
import SystemSetting from '../../components/SystemSetting';
import { isRoot } from '../../helpers';
import OtherSetting from '../../components/OtherSetting';
import PersonalSetting from '../../components/PersonalSetting';
import OperationSetting from '../../components/OperationSetting';

const Setting = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const isAdminWorkspace = location.pathname.startsWith('/admin/');

  if (!isAdminWorkspace) {
    return (
      <div className='dashboard-container'>
        <Card fluid className='chart-card'>
          <Card.Content>
            <Card.Header className='header router-page-title'>
              {t('setting.title')}
            </Card.Header>
            <PersonalSetting />
          </Card.Content>
        </Card>
      </div>
    );
  }

  const panes = [];

  if (isRoot()) {
    panes.push({
      menuItem: t('setting.tabs.operation'),
      render: () => (
        <Tab.Pane attached={false}>
          <OperationSetting />
        </Tab.Pane>
      ),
    });
    panes.push({
      menuItem: t('setting.tabs.system'),
      render: () => (
        <Tab.Pane attached={false}>
          <SystemSetting />
        </Tab.Pane>
      ),
    });
    panes.push({
      menuItem: t('setting.tabs.other'),
      render: () => (
        <Tab.Pane attached={false}>
          <OtherSetting />
        </Tab.Pane>
      ),
    });
  }

  return (
    <div className='dashboard-container'>
      <Card fluid className='chart-card'>
        <Card.Content>
          <Card.Header className='header router-page-title'>
            {t('setting.title')}
          </Card.Header>
          {panes.length > 0 ? (
            <Tab
              menu={{
                secondary: true,
                pointing: true,
                className: 'router-tab-menu',
              }}
              panes={panes}
            />
          ) : (
            <div className='router-empty-cell'>
              {t('setting.empty_admin', '暂无可配置项')}
            </div>
          )}
        </Card.Content>
      </Card>
    </div>
  );
};

export default Setting;
