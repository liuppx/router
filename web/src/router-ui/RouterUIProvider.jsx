import React from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { antdThemeByMode } from './theme/antd-theme';
import { useThemeMode } from './theme/useThemeMode';

function RouterUIProvider({ children }) {
  // antd components inherit the active mode from the same hook that drives
  // the chart CSS vars — keeping a single source of truth (see store.js).
  const { mode } = useThemeMode();
  return (
    <ConfigProvider locale={zhCN} theme={antdThemeByMode(mode)}>
      {children}
    </ConfigProvider>
  );
}

export default RouterUIProvider;