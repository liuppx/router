import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserContext } from '../context/User';
import { StatusContext } from '../context/Status';
import { useIsAdmin } from '../hooks/useAuth';
import useOnboardingProgress from '../hooks/useOnboardingProgress';
import HeaderMessageCenter from './HeaderMessageCenter';
import { API, getLogo, getSystemName, isMobile } from '../helpers';
import { WEB3_TOKEN_STORAGE_KEY } from '../helpers/web3';
import { logoutWallet } from '../services/web3Auth';
import {
  ADMIN_MENU_GROUPS,
  buildUnifiedWorkspaceMenuGroups,
  isAdminItemActive,
  isAdminRouteActive,
} from '../constants/adminMenu';
import {
  buildUserWorkspaceMenuItems,
  isUserRouteActive as isUserWorkspaceRouteActive,
} from '../constants/userMenu';
import {
  AppButton,
  AppDrawer,
  AppIcon,
  AppMenuDropdown,
  AppNavMenu,
  AppSelect,
  useThemeMode,
} from '../router-ui';
import '../index.css';

const formatHeaderWalletAddress = (value) => {
  const normalized = String(value || '').trim();
  if (normalized.length <= 15) {
    return normalized;
  }
  return `${normalized.slice(0, 6)}...${normalized.slice(-6)}`;
};

const Header = ({ workspace = 'user', hideNavButtons = false }) => {
  const { t, i18n } = useTranslation();
  const [userState, userDispatch] = useContext(UserContext);
  const [statusState] = useContext(StatusContext);
  const navigate = useNavigate();
  const location = useLocation();

  const [showSidebar, setShowSidebar] = useState(false);
  const logo = getLogo();
  const shouldFixHeader = Boolean(userState?.user);
  const currentWorkspace = workspace === 'admin' ? 'admin' : 'user';
  // Trust UserContext (server-sourced) over localStorage so the nav reflects
  // the role the server last confirmed, reacting to changes without re-login.
  const hasAdminAccess = useIsAdmin();
  const userButtons = useMemo(() => buildUserWorkspaceMenuItems(), []);
  const unifiedButtons = useMemo(
    () => buildUnifiedWorkspaceMenuGroups(hasAdminAccess),
    [hasAdminAccess],
  );
  const navigationButtons = userState.user
    ? unifiedButtons
    : currentWorkspace === 'admin'
      ? ADMIN_MENU_GROUPS
      : userButtons;
  // 仅登录态请求;管理员也展示(让他们看到未完成项的提醒)。
  const { doneCount: onboardingDoneCount, total: onboardingTotal } =
    useOnboardingProgress(Boolean(userState?.user));
  const showOnboardingRing =
    Boolean(userState?.user) && onboardingDoneCount < onboardingTotal;
  const headerContainerClass = [
    'router-header-container',
    hideNavButtons ? 'router-header-container-full' : '',
  ]
    .filter(Boolean)
    .join(' ');

  useEffect(() => {
    const body = document.body;
    if (!body) return;
    body.classList.toggle('header-fixed-active', shouldFixHeader);
    return () => {
      body.classList.remove('header-fixed-active');
    };
  }, [shouldFixHeader]);

  const isRouteActive = (to) => {
    if (String(to || '').startsWith('/admin/')) {
      return isAdminRouteActive(location, to);
    }
    return isUserWorkspaceRouteActive(location, to);
  };

  // 一个导航项可代表一个「多面」实体(如用户 = 列表 + 分析 + 任务),其详情面
  // 落在 matchPaths 的其它路由上。走 isAdminItemActive 让顶栏与侧边栏高亮一致,
  // 否则详情/任务路由下顶栏不高亮对应项。
  const isItemActive = (item) =>
    isAdminItemActive(location, item, (_loc, path) => isRouteActive(path));

  async function logout() {
    setShowSidebar(false);
    await API.get('/api/v1/public/user/logout');
    try {
      await logoutWallet();
    } catch (e) {
      // ignore web3 logout errors
    }
    userDispatch({ type: 'logout' });
    localStorage.removeItem('user');
    localStorage.removeItem(WEB3_TOKEN_STORAGE_KEY);
    localStorage.removeItem('wallet_token_expires_at');
    navigate('/login');
  }

  const languageOptions = [
    { key: 'zh', text: '中文', value: 'zh' },
    { key: 'en', text: 'English', value: 'en' },
  ];

  const changeLanguage = (language) => {
    i18n.changeLanguage(language);
  };

  const { mode: themeMode, toggle: toggleThemeMode } = useThemeMode();

  const storedStatus = useMemo(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const raw = window.localStorage.getItem('status');
    if (!raw) {
      return undefined;
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      return undefined;
    }
  }, []);

  const status = statusState?.status || storedStatus || {};
  const passwordRegisterEnabled =
    status?.register_enabled !== false &&
    status?.password_register_enabled !== false;
  const userWalletAddress = String(userState?.user?.wallet_address || '').trim();
  const userUsername = String(userState?.user?.username || '').trim();
  // Prefer the account username in the header; wallet addresses remain a
  // useful fallback for wallet-only identities that do not have one.
  const userDisplayName =
    userUsername || formatHeaderWalletAddress(userWalletAddress) || '';

  const desktopNavItems = useMemo(() => {
    return navigationButtons.map((button) => {
      if (button.type === 'group' && Array.isArray(button.items)) {
        return {
          key: button.key || button.name,
          label: t(button.name),
          children: button.items.map((item) => ({
            key: item.to,
            icon: <AppIcon name={item.icon} />,
            label: t(item.name),
          })),
        };
      }
      return {
        key: button.to,
        label: t(button.name),
      };
    });
  }, [navigationButtons, t]);

  const desktopSelectedKeys = useMemo(() => {
    return navigationButtons.flatMap((button) => {
      if (button.type === 'group' && Array.isArray(button.items)) {
        return button.items
          .filter((item) => isItemActive(item))
          .map((item) => item.to);
      }
      return button.to && isItemActive(button)
        ? [button.to]
        : [];
    });
  }, [location, navigationButtons]);

  const renderMobileButtons = () => {
    return navigationButtons.map((button) => {
      if (button.type === 'group' && Array.isArray(button.items)) {
        return (
          <React.Fragment key={button.key || button.name}>
            <div className='router-header-item-mobile-group'>
              <AppIcon name={button.icon} />
              {t(button.name)}
            </div>
            {button.items.map((item) => (
              <button
                type='button'
                key={item.to}
                onClick={() => {
                  navigate(item.to);
                  setShowSidebar(false);
                }}
                className={`router-header-item-mobile router-header-item-mobile-child ${isItemActive(item) ? 'router-header-group-active' : ''}`}
              >
                <AppIcon name={item.icon} />
                {t(item.name)}
              </button>
            ))}
          </React.Fragment>
        );
      }

      return (
        <button
          type='button'
          key={button.to || button.name}
          onClick={() => {
            navigate(button.to);
            setShowSidebar(false);
          }}
          className={`router-header-item-mobile ${isItemActive(button) ? 'router-header-group-active' : ''}`}
        >
          {button.icon ? <AppIcon name={button.icon} /> : null}
          {t(button.name)}
        </button>
      );
    });
  };

  if (isMobile()) {
    return (
      <>
        <div
          className={[
            'router-header-menu',
            'router-header-menu-mobile',
            shouldFixHeader ? 'router-fixed-header' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className={headerContainerClass}>
            <a
              href='https://www.yeying.pub'
              target='_blank'
              rel='noopener noreferrer'
              className='router-header-brand'
            >
              <img src={logo} alt={getSystemName()} />
            </a>
            <div className='router-header-actions'>
              <HeaderMessageCenter />
              <button
                type='button'
                className='router-header-mobile-toggle'
                aria-label={t(showSidebar ? 'header.menu.close' : 'header.menu.open')}
                onClick={() => setShowSidebar((previous) => !previous)}
              >
                <AppIcon name={showSidebar ? 'close' : 'sidebar'} />
              </button>
            </div>
          </div>
        </div>
        <AppDrawer
          open={showSidebar}
          onClose={() => setShowSidebar(false)}
          placement='right'
          size='default'
          title={
            t('header.workspace')
          }
          className='router-header-mobile-drawer'
        >
          <div className='router-header-mobile-list'>
            {renderMobileButtons()}
            {userState.user && (
              <AppButton
                className='router-page-button router-header-mobile-actions'
                onClick={() => {
                  setShowSidebar(false);
                  navigate('/workspace/service/pricing');
                }}
              >
                {t('header.get_started')}
              </AppButton>
            )}
            <AppSelect
              className='router-header-mobile-language router-section-dropdown'
              options={languageOptions}
              value={i18n.language}
              onChange={(_, { value }) => changeLanguage(value)}
            />
            <AppButton
              className='router-page-button router-header-mobile-actions'
              onClick={() => {
                toggleThemeMode();
                setShowSidebar(false);
              }}
            >
              {t(
                themeMode === 'dark' ? 'header.theme.switch_to_light' : 'header.theme.switch_to_dark',
              )}
            </AppButton>
            <div className='router-header-mobile-auth'>
              {userState.user ? (
                <AppButton
                  className='router-page-button router-header-mobile-actions'
                  onClick={logout}
                >
                  {t('header.logout')}
                </AppButton>
              ) : (
                <>
                  <AppButton
                    className='router-page-button'
                    onClick={() => {
                      setShowSidebar(false);
                      navigate('/login');
                    }}
                  >
                    {t('header.login')}
                  </AppButton>
                  {passwordRegisterEnabled && (
                    <AppButton
                      className='router-page-button'
                      onClick={() => {
                        setShowSidebar(false);
                        navigate('/register');
                      }}
                    >
                      {t('header.register')}
                    </AppButton>
                  )}
                </>
              )}
            </div>
          </div>
        </AppDrawer>
      </>
    );
  }

  return (
    <div
      className={[
        'router-header-menu',
        shouldFixHeader ? 'router-fixed-header' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={headerContainerClass}>
        <a
          href='https://www.yeying.pub'
          target='_blank'
          rel='noopener noreferrer'
          className='router-header-brand hide-on-mobile'
        >
          <img src={logo} alt={getSystemName()} />
        </a>
        {!hideNavButtons ? (
          <div className='router-header-nav'>
            <AppNavMenu
              mode='horizontal'
              className='router-header-nav-menu'
              items={desktopNavItems}
              selectedKeys={desktopSelectedKeys}
              onClick={({ key }) => {
                if (typeof key === 'string' && key.startsWith('/')) {
                  navigate(key);
                }
              }}
            />
          </div>
        ) : null}
        <div className='router-header-actions'>
          {userState.user ? (
            <AppButton
              type='button'
              className='router-header-quick-action'
              onClick={() => navigate('/workspace/service/pricing')}
            >
              {t('header.get_started')}
            </AppButton>
          ) : null}
          <HeaderMessageCenter />
          <button
            type='button'
            className='router-header-toolbar-icon router-header-theme-toggle'
            onClick={toggleThemeMode}
            aria-label={t(
              themeMode === 'dark' ? 'header.theme.switch_to_light' : 'header.theme.switch_to_dark',
            )}
            title={t(
              themeMode === 'dark' ? 'header.theme.switch_to_light' : 'header.theme.switch_to_dark',
            )}
          >
            <AppIcon name={themeMode === 'dark' ? 'sun' : 'moon'} className='router-header-trigger-icon' />
          </button>
          <div className='router-header-dropdown router-header-trigger'>
            <AppMenuDropdown
              items={languageOptions.map((option) => ({
                key: option.value,
                active: i18n.language === option.value,
                label: option.text,
                onClick: () => changeLanguage(option.value),
              }))}
            >
              <span
                className='router-header-toolbar-icon'
                role='button'
                aria-label={t('header.menu.language')}
                aria-haspopup='menu'
                tabIndex={0}
              >
                <AppIcon name='language' className='router-header-trigger-icon' />
              </span>
            </AppMenuDropdown>
          </div>
          {userState.user ? (
            <div className='router-header-dropdown router-header-trigger'>
              <AppMenuDropdown
                items={[
                  // Personal shortcuts are shown to every role: admins get them
                  // in the sidebar's "personal" group too, but the dropdown is
                  // the consistent, always-available fallback for everyone.
                  // "Getting started" leads the list so the three-step onboarding
                  // guide stays reachable after the first-login landing, for
                  // returning users too.
                  {
                    key: 'my-start',
                    label: t('workspace_start.title'),
                    onClick: () => navigate('/workspace/start'),
                  },
                  {
                    key: 'my-quota',
                    label: t('topup.mine.quota'),
                    onClick: () => navigate('/workspace/topup?tab=quota'),
                  },
                  {
                    key: 'my-token',
                    label: t('header.token'),
                    onClick: () => navigate('/workspace/token'),
                  },
                  {
                    key: 'my-account',
                    label: t('header.account'),
                    onClick: () => navigate('/workspace/setting'),
                  },
                  {
                    key: 'my-log',
                    label: t('header.log'),
                    onClick: () => navigate('/workspace/log'),
                  },
                  {
                    key: 'my-guide',
                    label: t('header.router_guide'),
                    onClick: () => navigate('/workspace/service/router-guide'),
                  },
                  {
                    key: 'my-cli-guide',
                    label: t('header.cli_guide'),
                    onClick: () => navigate('/workspace/service/cli-guide'),
                  },
                  {
                    key: 'logout',
                    label: t('header.logout'),
                    onClick: logout,
                  },
                ]}
              >
                <span
                  className='router-header-toolbar-chip'
                  title={userUsername || userWalletAddress}
                >
                  {userDisplayName}
                </span>
                {showOnboardingRing ? (
                  <span
                    className='router-header-onboarding-ring'
                    role='img'
                    aria-label={t('header.onboarding_progress', {
                      done: onboardingDoneCount,
                      total: onboardingTotal,
                    })}
                    title={t('header.onboarding_progress', {
                      done: onboardingDoneCount,
                      total: onboardingTotal,
                    })}
                  >
                    <span className='router-header-onboarding-ring-segment is-done' />
                    <span
                      className={
                        onboardingDoneCount >= 2
                          ? 'router-header-onboarding-ring-segment is-done'
                          : 'router-header-onboarding-ring-segment'
                      }
                    />
                    <span
                      className={
                        onboardingDoneCount >= 3
                          ? 'router-header-onboarding-ring-segment is-done'
                          : 'router-header-onboarding-ring-segment'
                      }
                    />
                    <span
                      className={
                        onboardingDoneCount >= 4
                          ? 'router-header-onboarding-ring-segment is-done'
                          : 'router-header-onboarding-ring-segment'
                      }
                    />
                  </span>
                ) : null}
              </AppMenuDropdown>
            </div>
          ) : (
            <Link to='/login' className='router-header-user-link'>
              {t('header.login')}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default Header;
