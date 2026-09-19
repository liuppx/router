import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AppTabs } from '../router-ui';
import './SectionTabs.css';

// Generic persistent sub-navigation for a domain whose surfaces live on
// separate routes but read as one tabbed page. `tabs` is an ordered list of
// { key, label, to }; `active` is the current surface key.
function SectionTabs({ active, tabs = [], className = '' }) {
  const navigate = useNavigate();
  const nextClassName = ['section-tabs', className].filter(Boolean).join(' ');

  return (
    <AppTabs
      className={nextClassName}
      activeKey={active}
      items={tabs.map(({ key, label }) => ({ key, label }))}
      onChange={(key) => {
        const target = tabs.find((tab) => tab.key === key);
        if (target?.to && key !== active) {
          navigate(target.to);
        }
      }}
    />
  );
}

export default SectionTabs;
