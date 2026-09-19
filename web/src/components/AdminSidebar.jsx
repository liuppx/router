import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  buildUnifiedWorkspaceMenuGroups,
  isAdminRouteActive,
} from '../constants/adminMenu';
import { isUserRouteActive } from '../constants/userMenu';
import { useIsAdmin } from '../hooks/useAuth';
import { AppIcon, AppNavMenu } from '../router-ui';

// Persist only the groups the user explicitly collapsed. Stored as an array
// of group keys; absent / unparseable / stale keys fall back to "nothing
// closed", which means everything defaults to expanded.
const SIDEBAR_GROUP_CLOSED_STORAGE_KEY = 'router_admin_sidebar_group_closed_v1';
// v1 of this storage was an "open keys" list — superseded by the closed-keys
// model. Clean it up on the next load so users don't carry stale data.
const SIDEBAR_GROUP_OPEN_STORAGE_KEY_LEGACY =
  'router_admin_sidebar_group_open_v2';

const loadPersistedClosedKeys = () => {
  if (typeof window === 'undefined') {
    return new Set();
  }
  try {
    window.localStorage.removeItem(SIDEBAR_GROUP_OPEN_STORAGE_KEY_LEGACY);
  } catch {
    // ignore storage errors (private mode / quota)
  }
  const raw = window.localStorage.getItem(SIDEBAR_GROUP_CLOSED_STORAGE_KEY);
  if (!raw) {
    return new Set();
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((k) => typeof k === 'string')) : new Set();
  } catch {
    return new Set();
  }
};

const AdminSidebar = ({ compact = false }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  // Trust the in-memory UserContext (populated from /api/v1/user/self) rather
  // than localStorage, and recompute when it changes — so a server-side role
  // change is reflected in the sidebar without a full re-login.
  const hasAdminAccess = useIsAdmin();
  const menuItems = useMemo(
    () => buildUnifiedWorkspaceMenuGroups(hasAdminAccess),
    [hasAdminAccess],
  );
  const groupKeys = useMemo(
    () =>
      menuItems
        // Single-item groups render as flat leaves (see `items` below), so they
        // never own a collapsible submenu — exclude them from the open/closed
        // bookkeeping to avoid tracking openKeys for a menu that has no children.
        .filter((group) => Array.isArray(group.items) && group.items.length > 1)
        .map((group) => group.key),
    [menuItems],
  );
  const groupKeySet = useMemo(() => new Set(groupKeys), [groupKeys]);
  const [closedKeys, setClosedKeys] = useState(() => loadPersistedClosedKeys());

  const isRouteActive = (to) =>
    String(to || '').startsWith('/admin/')
      ? isAdminRouteActive(location, to)
      : isUserRouteActive(location, to);

  const selectedKeys = useMemo(() => {
    const active = [];
    menuItems.forEach((group) => {
      if (Array.isArray(group.items)) {
        group.items.forEach((item) => {
          if (isRouteActive(item.to)) {
            active.push(item.to);
          }
        });
        return;
      }
      if (group.to && isRouteActive(group.to)) {
        active.push(group.to);
      }
    });
    return active;
  }, [location, menuItems]);

  // A group is open by default unless the user explicitly closed it, OR the
  // route lands inside it (in which case the active group must stay open
  // regardless of any prior manual collapse — otherwise users get "lost" in
  // an empty sidebar).
  const openKeys = useMemo(() => {
    const activeGroupKeys = new Set(
      menuItems
        .filter(
          (group) =>
            Array.isArray(group.items) &&
            group.items.some((item) => selectedKeys.includes(item.to)),
        )
        .map((group) => group.key),
    );
    return groupKeys.filter(
      (key) => !closedKeys.has(key) || activeGroupKeys.has(key),
    );
  }, [closedKeys, groupKeys, menuItems, selectedKeys]);

  // Persist only the user-collapsed set; drop any keys that no longer map to
  // a real group (e.g. after a menu refactor removed them).
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const filtered = Array.from(closedKeys).filter((key) => groupKeySet.has(key));
    try {
      window.localStorage.setItem(
        SIDEBAR_GROUP_CLOSED_STORAGE_KEY,
        JSON.stringify(filtered),
      );
    } catch {
      // ignore storage errors
    }
  }, [closedKeys, groupKeySet]);

  const handleOpenChange = (nextKeys) => {
    // nextKeys = the set of groups the menu now wants open. Diff against
    // groupKeys to figure out which groups the user just collapsed.
    const next = Array.isArray(nextKeys) ? nextKeys : [];
    const nextSet = new Set(next);
    setClosedKeys((previous) => {
      const updated = new Set();
      groupKeys.forEach((key) => {
        if (!nextSet.has(key)) {
          updated.add(key);
        }
      });
      if (
        updated.size === previous.size &&
        Array.from(updated).every((key) => previous.has(key))
      ) {
        return previous;
      }
      return updated;
    });
  };

  const items = useMemo(
    () =>
      menuItems.map((group) => {
        if (Array.isArray(group.items)) {
          // A single-item group is pure nesting noise (e.g. "设置 > 设置"):
          // render it as a flat leaf pointing at its only child, keeping the
          // group's icon so the section identity survives. Multi-item groups
          // stay as expandable submenus.
          if (group.items.length === 1) {
            const [only] = group.items;
            return {
              key: only.to,
              icon: <AppIcon name={group.icon} />,
              label: t(only.name),
            };
          }
          return {
            key: group.key,
            icon: <AppIcon name={group.icon} />,
            label: t(group.name),
            children: group.items.map((item) => ({
              key: item.to,
              icon: <AppIcon name={item.icon} />,
              label: t(item.name),
            })),
          };
        }
        return {
          key: group.to,
          icon: <AppIcon name={group.icon} />,
          label: t(group.name),
        };
      }),
    [menuItems, t],
  );

  return (
    <AppNavMenu
      className='router-admin-nav-menu'
      mode='inline'
      triggerSubMenuAction={compact ? 'click' : 'hover'}
      items={items}
      selectedKeys={selectedKeys}
      openKeys={openKeys}
      onOpenChange={handleOpenChange}
      onClick={({ key }) => {
        if (typeof key === 'string' && key.startsWith('/')) {
          navigate(key);
        }
      }}
    />
  );
};

export default AdminSidebar;
