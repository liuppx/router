import { routerTokens, routerTokensDark } from './tokens';
import { chartStatusPalette } from './charts';

// antd components consume the same status hues the charts do, so a warning
// pill in a chart legend and a warning antd Tag render with the same color.
// colorPrimary stays at the antd default blue (#1677ff) — it is the brand
// accent and would be jarring if it diverged from antd's own conventions.

const buildAntdTheme = (tokens) => ({
  token: {
    colorPrimary: tokens.colorPrimary,
    colorSuccess: chartStatusPalette.success,
    colorWarning: chartStatusPalette.warning,
    colorError: chartStatusPalette.danger,
    colorText: tokens.colorText,
    colorTextSecondary: tokens.colorTextSecondary,
    colorBorder: tokens.colorBorder,
    colorBgContainer: tokens.colorBgContainer,
    borderRadius: tokens.borderRadius,
    borderRadiusSM: tokens.borderRadiusSM,
    borderRadiusLG: tokens.borderRadiusLG,
    controlHeight: tokens.controlHeight,
    controlHeightSM: tokens.controlHeightSM,
    controlHeightLG: tokens.controlHeightLG,
    fontFamily: tokens.fontFamily,
    fontSize: tokens.fontSize,
  },
  components: {
    Button: {
      borderRadius: tokens.borderRadius,
      controlHeight: tokens.controlHeight,
      fontWeight: 500,
    },
    Descriptions: {
      labelBg: tokens.descriptionsLabelBg,
      titleMarginBottom: tokens.spaceSM,
    },
    Input: {
      activeBorderColor: tokens.colorPrimary,
      hoverBorderColor: tokens.colorPrimary,
    },
    Select: {
      optionSelectedBg: tokens.optionSelectedBg,
      optionActiveBg: tokens.optionActiveBg,
    },
    Segmented: {
      trackBg: tokens.segmentedTrackBg,
      itemColor: tokens.colorTextSecondary,
      itemHoverColor: tokens.colorText,
      itemHoverBg: tokens.colorBgContainer,
      itemSelectedBg: tokens.colorBgContainer,
      itemSelectedColor: tokens.colorPrimary,
      itemActiveBg: tokens.colorBgContainer,
      trackPadding: 4,
      borderRadius: 10,
    },
    Switch: {
      colorPrimary: tokens.colorPrimary,
      colorPrimaryHover: tokens.colorPrimaryHover,
      handleBg: '#ffffff',
      trackHeight: 22,
      trackMinWidth: 42,
      trackPadding: 2,
    },
    Modal: {
      borderRadiusLG: tokens.borderRadiusLG,
    },
    Layout: {
      siderBg: tokens.layoutSiderBg,
      triggerBg: tokens.layoutSiderBg,
      triggerColor: tokens.colorText,
    },
    Menu: {
      itemBg: 'transparent',
      subMenuItemBg: 'transparent',
      itemColor: tokens.menuItemColor,
      itemHoverColor: tokens.colorPrimary,
      itemSelectedColor: tokens.colorPrimary,
      itemSelectedBg: tokens.menuItemSelectedBg,
      itemHoverBg: tokens.menuItemHoverBg,
      activeBarWidth: 0,
      collapsedIconSize: 16,
      groupTitleColor: tokens.menuGroupTitleColor,
    },
    Table: {
      headerBg: tokens.tableHeaderBg,
      rowHoverBg: tokens.tableRowHoverBg,
    },
    Tabs: {
      itemSelectedColor: tokens.colorPrimary,
      itemHoverColor: tokens.colorPrimary,
      inkBarColor: tokens.colorPrimary,
    },
  },
});

export const antdTheme = buildAntdTheme(routerTokens);

export const antdThemeDark = buildAntdTheme(routerTokensDark);

export const antdThemeByMode = (mode) => (mode === 'dark' ? antdThemeDark : antdTheme);

export default antdTheme;
