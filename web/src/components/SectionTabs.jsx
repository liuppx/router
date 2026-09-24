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
          // 同路由内切 tab 属于「换视图」而非「跳页面」:用 replace 避免每次
          // 点 tab 都压一条历史,否则 Back 会在 tab 间来回而非返回来处。
          navigate(target.to, { replace: true });
        }
      }}
    />
  );
}

export default SectionTabs;
