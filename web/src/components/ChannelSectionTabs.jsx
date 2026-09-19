import React from 'react';
import { useTranslation } from 'react-i18next';
import SectionTabs from './SectionTabs';

// Channels domain sub-nav: list / health / alerts.
function ChannelSectionTabs({ active = 'list' }) {
  const { t } = useTranslation();
  return (
    <SectionTabs
      active={active}
      tabs={[
        { key: 'list', label: t('channel.tabs.list'), to: '/admin/channel' },
        {
          key: 'health',
          label: t('channel.tabs.health'),
          to: '/admin/dashboard?section=channels',
        },
        { key: 'alerts', label: t('channel.tabs.alerts'), to: '/admin/alerts' },
      ]}
    />
  );
}

export default ChannelSectionTabs;
