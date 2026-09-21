import { resolveAdminSettingLocation } from '../helpers/adminSetting';
import { buildUserWorkspaceMenuItems } from './userMenu';

export const ADMIN_MENU_GROUPS = [
  {
    // 总览:唯一真正跨实体的大盘。单项组 → 侧边栏渲染为扁平叶子。
    // 其余原仪表盘 section(渠道健康/用户分析/模型运营)已归位到各实体页的
    // SectionTabs,不再作为独立侧边栏项。
    key: 'dashboard',
    name: 'header.dashboard',
    icon: 'chart line',
    items: [
      {
        name: 'dashboard.admin.nav.spending',
        to: '/admin/dashboard?section=spending',
        icon: 'chart line',
      },
    ],
  },
  {
    key: 'supply',
    name: 'header.supply',
    icon: 'cube',
    items: [
      {
        name: 'header.providers',
        to: '/admin/provider',
        icon: 'cubes',
      },
      {
        // 渠道的「面」:列表(此项)/健康/告警/系统任务 —— 后三者进渠道页 tab 条,
        // 侧边栏只保留一个「渠道」项,并在这些面路由上一并高亮。
        name: 'header.channel',
        to: '/admin/channel',
        icon: 'sitemap',
        matchPaths: [
          '/admin/dashboard?section=channels',
          '/admin/alerts',
          '/admin/channel/tasks',
        ],
      },
      {
        name: 'header.group',
        to: '/admin/group',
        icon: 'group',
      },
      {
        // The model catalog is a supply-side artifact (published models backed
        // by providers/channels), so it belongs with供给 rather than客户.
        // 「运营」面在仪表盘,归入本项的高亮范围。
        name: 'header.model',
        to: '/workspace/service/models',
        icon: 'cube',
        matchPaths: ['/admin/dashboard?section=models'],
      },
    ],
  },
  {
    key: 'customers',
    name: 'header.customers',
    icon: 'users',
    items: [
      {
        // 用户的「分析」面在仪表盘,归入本项高亮范围。
        name: 'header.user',
        to: '/admin/user',
        icon: 'user',
        matchPaths: ['/admin/dashboard?section=users'],
      },
      {
        name: 'header.redemption',
        to: '/admin/redemption',
        icon: 'dollar sign',
      },
      {
        name: 'header.entitlement',
        to: '/admin/entitlement',
        icon: 'ticket',
      },
    ],
  },
  {
    // 财务:总览/毛利/采购已是同一页的 SectionTabs,侧边栏收成单项(扁平叶子),
    // 进入后用 tab 切,与渠道详情 tab 心智一致。
    key: 'finance',
    name: 'header.finance',
    icon: 'money bill alternate outline',
    items: [
      {
        name: 'header.finance',
        to: '/admin/finance/overview',
        icon: 'money bill alternate outline',
        matchPaths: ['/admin/finance/profit', '/admin/finance/procurement'],
      },
    ],
  },
  {
    key: 'system',
    name: 'header.system',
    icon: 'cog',
    items: [
      {
        name: 'header.task',
        to: '/admin/task',
        icon: 'tasks',
      },
      {
        name: 'header.log',
        to: '/admin/log',
        icon: 'book',
      },
    ],
  },
  {
    key: 'setting',
    name: 'header.setting',
    icon: 'setting',
    items: [
      {
        name: 'header.setting',
        to: '/admin/setting?tab=basic&section=general',
        icon: 'sliders horizontal',
      },
    ],
  },
];

// Admin operators are end users too: give their own quota/tokens a dedicated
// "personal" group pinned to the bottom of the admin sidebar, so seeing your
// own usage no longer means digging into the header avatar dropdown. The items
// point at the shared /workspace/* surfaces (isUserRouteActive handles them).
export const PERSONAL_WORKSPACE_MENU_GROUP = {
  key: 'personal',
  name: 'header.mine',
  icon: 'user',
  items: [
    {
      name: 'topup.mine.quota',
      to: '/workspace/topup?tab=quota',
      icon: 'credit card',
    },
    {
      name: 'header.token',
      to: '/workspace/token',
      icon: 'key',
    },
  ],
};

export const buildUnifiedWorkspaceMenuGroups = (hasAdminAccess) => {
  if (!hasAdminAccess) {
    return buildUserWorkspaceMenuItems();
  }
  // Admin console: the operator surface, plus a personal group so operators can
  // reach their own quota/tokens straight from the sidebar. Remaining personal
  // entries (account / logs / guide) stay in the header avatar dropdown, which
  // is now shown to every role for consistency.
  return [...ADMIN_MENU_GROUPS, PERSONAL_WORKSPACE_MENU_GROUP].map((group) => ({
    ...group,
    type: 'group',
    items: group.items.map((item) => ({ ...item })),
  }));
};

export const isAdminRouteActive = (location, to) => {
  if (!location) {
    return false;
  }
  const [path, queryString = ''] = String(to || '').split('?');
  if (!path) {
    return false;
  }
  if (location.pathname !== path && !location.pathname.startsWith(`${path}/`)) {
    return false;
  }
  if (!queryString) {
    return true;
  }
  const targetParams = new URLSearchParams(queryString);
  const currentParams = new URLSearchParams(location.search || '');
  const targetTab = (targetParams.get('tab') || '').trim().toLowerCase();
  if (path === '/admin/setting' && targetTab !== '') {
    const { tab: currentTab } = resolveAdminSettingLocation(
      currentParams.get('tab') || 'basic',
      currentParams.get('section') || 'general',
    );
    if (currentTab !== targetTab) {
      return false;
    }
    return true;
  }
  if (path === '/admin/entitlement' && targetTab !== '') {
    const currentTab = (currentParams.get('tab') || 'topup')
      .trim()
      .toLowerCase();
    if (currentTab !== targetTab) {
      return false;
    }
    return true;
  }
  const targetSection = (targetParams.get('section') || '').trim().toLowerCase();
  if (path === '/admin/dashboard' && targetSection !== '') {
    const currentSection = (currentParams.get('section') || 'spending')
      .trim()
      .toLowerCase();
    if (currentSection !== targetSection) {
      return false;
    }
    return true;
  }
  const entries = Array.from(targetParams.entries());
  if (entries.length === 0) {
    return true;
  }
  return entries.every(
    ([key, value]) => (currentParams.get(key) || '') === value,
  );
};

// A single sidebar item can stand for one operational entity whose several
// "faces" live at different routes (e.g. 渠道 = list + health + alerts + tasks).
// `matchPaths` lists those extra face routes so the item highlights on any of
// them; the primary `to` stays the entity's default (list) face. Paths may be
// admin or /workspace/* — the caller picks the right matcher per path.
export const isAdminItemActive = (location, item, routeMatcher) => {
  if (!item) {
    return false;
  }
  const match =
    typeof routeMatcher === 'function' ? routeMatcher : isAdminRouteActive;
  if (match(location, item.to)) {
    return true;
  }
  return (item.matchPaths || []).some((path) => match(location, path));
};

export const isAdminGroupActive = (location, group) =>
  Array.isArray(group?.items) &&
  group.items.some((item) => isAdminRouteActive(location, item.to));
