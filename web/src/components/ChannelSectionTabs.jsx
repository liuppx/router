import React from 'react';
import { useTranslation } from 'react-i18next';
import SectionTabs from './SectionTabs';

// Channels domain sub-nav: list / health / alerts / system tasks.
// All tabs point at /admin/channel?tab=... so the ChannelLayout shell keeps
// its breadcrumb/header mounted and swaps the body in place.
function ChannelSectionTabs({ active = 'list' }) {
  const { t } = useTranslation();
  return (
    <SectionTabs
      active={active}
      tabs={[
        { key: 'list', label: t('channel.tabs.list'), to: '/admin/channel?tab=list' },
        {
          key: 'health',
          label: t('channel.tabs.health'),
          to: '/admin/channel?tab=health',
        },
        { key: 'alerts', label: t('channel.tabs.alerts'), to: '/admin/channel?tab=alerts' },
        {
          key: 'tasks',
          label: t('channel.tabs.tasks'),
          to: '/admin/channel?tab=tasks',
        },
      ]}
    />
  );
}

export default ChannelSectionTabs;