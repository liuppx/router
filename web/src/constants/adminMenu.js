import { resolveAdminSettingLocation } from '../helpers/adminSetting';
import { buildUserWorkspaceMenuItems } from './userMenu';

export const ADMIN_MENU_GROUPS = [
  {
    key: 'dashboard',
    name: 'header.dashboard',
    icon: 'chart bar',
    items: [
      {
        name: 'dashboard.admin.nav.spending',
        to: '/admin/dashboard?section=spending',
        icon: 'chart line',
      },
      {
        name: 'dashboard.admin.nav.models',
        to: '/admin/dashboard?section=models',
        icon: 'cube',
      },
      {
        name: 'dashboard.admin.nav.channels',
        to: '/admin/dashboard?section=channels',
        icon: 'heartbeat',
      },
      {
        name: 'dashboard.admin.nav.users',
        to: '/admin/dashboard?section=users',
        icon: 'users',
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
        name: 'header.channel',
        to: '/admin/channel',
        icon: 'sitemap',
      },
      {
        name: 'header.group',
        to: '/admin/group',
        icon: 'group',
      },
      {
        // The model catalog is a supply-side artifact (published models backed
        // by providers/channels), so it belongs with供给 rather than客户.
        name: 'header.model',
        to: '/workspace/service/models',
        icon: 'cube',
      },
      {
        name: 'dashboard.admin.nav.alerts',
        to: '/admin/alerts',
        icon: 'bell',
      },
    ],
  },
  {
    key: 'customers',
    name: 'header.customers',
    icon: 'users',
    items: [
      {
        name: 'header.user',
        to: '/admin/user',
        icon: 'user',
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
    key: 'finance',
    name: 'header.finance',
    icon: 'money bill alternate outline',
    items: [
      {
        name: 'billing.overview.title',
        to: '/admin/finance/overview',
        icon: 'chart pie',
      },
      {
        name: 'billing.pricing_analysis.title',
        to: '/admin/finance/profit',
        icon: 'chart line',
      },
      {
        name: 'billing.procurement_report.title',
        to: '/admin/finance/procurement',
        icon: 'shopping cart',
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

export const isAdminGroupActive = (location, group) =>
  Array.isArray(group?.items) &&
  group.items.some((item) => isAdminRouteActive(location, item.to));
