import React from 'react';
import { useTranslation } from 'react-i18next';
import SectionTabs from './SectionTabs';

// Settings domain sub-nav: 基础 / 支付 / 计费 / 内容. All four tabs share the
// /admin/setting route and are distinguished by ?tab= and ?section=.
function SettingSectionTabs({ active = 'basic' }) {
  const { t } = useTranslation();
  return (
    <SectionTabs
      active={active}
      tabs={[
        {
          key: 'basic',
          label: t('setting.groups.basic'),
          to: '/admin/setting?tab=basic&section=general',
        },
        {
          key: 'payment',
          label: t('setting.groups.payment'),
          to: '/admin/setting?tab=payment&section=currency',
        },
        {
          key: 'billing',
          label: t('setting.groups.billing'),
          to: '/admin/setting?tab=billing&section=balance',
        },
        {
          key: 'content',
          label: t('setting.groups.content'),
          to: '/admin/setting?tab=content&section=notice',
        },
      ]}
    />
  );
}

export default SettingSectionTabs;