// Light mode design tokens. Single source of truth for every primitive in the
// router-ui design system. Dark mode uses routerTokensDark — both share the
// same shape so antd-theme.js can pick either via a single helper.
const baseTokens = {
  colorPrimary: '#1677ff',
  colorPrimaryHover: '#4096ff',
  colorSuccess: '#52c41a',
  colorWarning: '#faad14',
  colorError: '#ff4d4f',
  borderRadiusSM: 6,
  borderRadius: 8,
  borderRadiusLG: 10,
  controlHeightSM: 28,
  controlHeight: 32,
  controlHeightLG: 36,
  fontFamily:
    "'Helvetica Neue', Arial, Helvetica, 'Microsoft YaHei', sans-serif",
  fontSizeSM: 13,
  fontSize: 14,
  fontSizeLG: 16,
  lineHeight: 1.5,
  spaceXS: 4,
  spaceSM: 8,
  spaceMD: 12,
  spaceLG: 16,
  spaceXL: 24,
};

export const routerTokens = {
  ...baseTokens,
  colorText: '#1f2329',
  colorTextSecondary: '#667085',
  colorTextMuted: 'rgba(31, 35, 41, 0.6)',
  colorBorder: '#d9d9d9',
  colorBgContainer: '#ffffff',
  colorBgMuted: '#f5f6f7',
  descriptionsLabelBg: '#fafafa',
  optionSelectedBg: '#e6f4ff',
  optionActiveBg: '#f5f6f7',
  segmentedTrackBg: '#f5f6f7',
  layoutSiderBg: '#f8fafc',
  menuItemColor: '#475569',
  menuItemSelectedBg: '#eaf3ff',
  menuItemHoverBg: '#f1f5f9',
  menuGroupTitleColor: '#94a3b8',
  tableHeaderBg: '#fafafa',
  tableRowHoverBg: '#f8fbff',
};

export const routerTokensDark = {
  ...baseTokens,
  colorText: '#f1f5f9',
  colorTextSecondary: '#cbd5e1',
  colorTextMuted: 'rgba(241, 245, 249, 0.6)',
  colorBorder: 'rgba(241, 245, 249, 0.16)',
  colorBgContainer: '#0f172a',
  colorBgMuted: '#111827',
  descriptionsLabelBg: 'rgba(241, 245, 249, 0.04)',
  optionSelectedBg: 'rgba(22, 119, 255, 0.18)',
  optionActiveBg: 'rgba(241, 245, 249, 0.06)',
  segmentedTrackBg: 'rgba(241, 245, 249, 0.06)',
  layoutSiderBg: '#0b1220',
  menuItemColor: '#cbd5e1',
  menuItemSelectedBg: 'rgba(22, 119, 255, 0.20)',
  menuItemHoverBg: 'rgba(241, 245, 249, 0.08)',
  menuGroupTitleColor: '#94a3b8',
  tableHeaderBg: 'rgba(241, 245, 249, 0.04)',
  tableRowHoverBg: 'rgba(22, 119, 255, 0.08)',
};

export default routerTokens;