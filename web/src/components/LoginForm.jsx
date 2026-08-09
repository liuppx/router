import React, { useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserContext } from '../context/User';
import { StatusContext } from '../context/Status';
import { API, showError } from '../helpers';
import { toastConstants } from '../constants';
import {
  focusWalletPendingApproval,
  isWalletUserRejectedError,
  loginWithWallet,
} from '../services/web3Auth';
import { useWalletProviderStatus } from '../hooks/useWalletProviderStatus';
import {
  AppAlert,
  AppButton,
  AppDivider,
  AppIcon,
  AppInput,
  AppQRCode,
  AppSelect,
  AppTooltip,
} from '../router-ui';
import {
  rememberAuthRedirectPath,
  resolvePostLoginPath,
} from '../helpers/authRedirect';
import './LoginForm.css';

const WALLET_LOGIN_HISTORY_STORAGE_KEY = 'wallet_login_history';
const LAST_WALLET_LOGIN_ADDRESS_STORAGE_KEY = 'last_wallet_login_address';

const maskWalletAddress = (value) => {
  const normalized = String(value || '').trim();
  if (normalized.length <= 15) {
    return normalized;
  }
  return `${normalized.slice(0, 6)}...${normalized.slice(-6)}`;
};

const normalizeWalletAddressList = (items) => {
  if (!Array.isArray(items)) {
    return [];
  }
  const result = [];
  const seen = new Set();
  items.forEach((item) => {
    const normalized = String(item || '').trim();
    if (normalized === '' || seen.has(normalized.toLowerCase())) {
      return;
    }
    seen.add(normalized.toLowerCase());
    result.push(normalized);
  });
  return result;
};

const getStoredWalletLoginHistory = () => {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(WALLET_LOGIN_HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return normalizeWalletAddressList(JSON.parse(raw));
  } catch (error) {
    return [];
  }
};

const getStoredLastWalletAddress = () => {
  if (typeof window === 'undefined') {
    return '';
  }
  return String(
    window.localStorage.getItem(LAST_WALLET_LOGIN_ADDRESS_STORAGE_KEY) || ''
  ).trim();
};

const persistWalletLoginHistory = (address) => {
  const normalizedAddress = String(address || '').trim();
  if (normalizedAddress === '' || typeof window === 'undefined') {
    return;
  }
  const nextHistory = normalizeWalletAddressList([
    normalizedAddress,
    ...getStoredWalletLoginHistory(),
  ]).slice(0, 8);
  window.localStorage.setItem(
    WALLET_LOGIN_HISTORY_STORAGE_KEY,
    JSON.stringify(nextHistory)
  );
  window.localStorage.setItem(
    LAST_WALLET_LOGIN_ADDRESS_STORAGE_KEY,
    normalizedAddress
  );
};

const LoginForm = () => {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState({
    username: '',
    password: '',
  });
  const [walletAddressOptions, setWalletAddressOptions] = useState([]);
  const [selectedWalletAddress, setSelectedWalletAddress] = useState(
    getStoredLastWalletAddress()
  );
  const [searchParams] = useSearchParams();
  const { username, password } = inputs;
  const [, userDispatch] = useContext(UserContext);
  const [statusState] = useContext(StatusContext);
  const navigate = useNavigate();
  const storedStatus = (() => {
    const raw = localStorage.getItem('status');
    if (!raw) {
      return undefined;
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      return undefined;
    }
  })();
  const status = statusState?.status || storedStatus || {};
  const walletLoginDisabled = status?.wallet_login === false;
  const passwordLoginDisabled = status?.password_login_enabled === false;
  const walletLoginEnabled = !walletLoginDisabled;
  const passwordRegisterEnabled =
    status?.register_enabled !== false &&
    status?.password_register_enabled !== false;
  const [walletLoginSubmitting, setWalletLoginSubmitting] = useState(false);
  const [authMode, setAuthMode] = useState('wallet');
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [walletLoginAwaitingApproval, setWalletLoginAwaitingApproval] =
    useState(false);
  const walletLoginPromiseRef = useRef(null);
  const passportPollTimerRef = useRef(null);
  const passportSessionRef = useRef('');
  const [passportLogin, setPassportLogin] = useState({
    loading: false,
    verifyUrl: '',
    message: '',
  });
  const walletProviderStatus = useWalletProviderStatus();
  const resolveLandingPath = (role) =>
    Number(role) >= 10 ? '/admin/dashboard' : '/workspace/entry';

  useEffect(() => {
    rememberAuthRedirectPath(searchParams.get('redirect'));
  }, [searchParams]);

  useEffect(() => {
    const mergedAddresses = normalizeWalletAddressList([
      ...walletProviderStatus.accounts,
      ...getStoredWalletLoginHistory(),
    ]);
    setWalletAddressOptions(
      mergedAddresses.map((address) => ({
        key: address,
        value: address,
        label: maskWalletAddress(address),
      }))
    );
    setSelectedWalletAddress((current) => {
      const normalizedCurrent = String(current || '').trim();
      if (
        normalizedCurrent !== '' &&
        mergedAddresses.some(
          (address) => address.toLowerCase() === normalizedCurrent.toLowerCase()
        )
      ) {
        return normalizedCurrent;
      }
      const storedAddress = getStoredLastWalletAddress();
      if (
        storedAddress !== '' &&
        mergedAddresses.some(
          (address) => address.toLowerCase() === storedAddress.toLowerCase()
        )
      ) {
        return storedAddress;
      }
      return mergedAddresses[0] || '';
    });
  }, [walletProviderStatus.accounts]);

  useEffect(() => {
    const expiredMarker = searchParams.get('expired');
    if (expiredMarker) {
      const lastMarker = sessionStorage.getItem('last_login_expired_marker');
      if (lastMarker !== expiredMarker) {
        sessionStorage.setItem('last_login_expired_marker', expiredMarker);
        showError(t('messages.error.login_expired'), {
          autoClose: Math.floor(toastConstants.ERROR_TIMEOUT / 2),
        });
      }
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('expired');
      const nextSearch = nextParams.toString();
      navigate(`/login${nextSearch ? `?${nextSearch}` : ''}`, {
        replace: true,
      });
      return;
    }
  }, [searchParams, t, navigate]);

  useEffect(
    () => () => {
      if (passportPollTimerRef.current) {
        window.clearInterval(passportPollTimerRef.current);
      }
    },
    []
  );

  const finishPassportLogin = (user) => {
    if (!user) {
      showError(t('auth.login.user_fetch_failed'));
      return;
    }
    if (passportPollTimerRef.current) {
      window.clearInterval(passportPollTimerRef.current);
      passportPollTimerRef.current = null;
    }
    setPassportLogin({
      loading: false,
      verifyUrl: '',
      message: '',
    });
    userDispatch({ type: 'login', payload: user });
    localStorage.setItem('user', JSON.stringify(user));
    navigate(
      resolvePostLoginPath(searchParams, resolveLandingPath(user.role)),
      { replace: true }
    );
  };

  const pollPassportLogin = async () => {
    const sessionId = passportSessionRef.current;
    if (!sessionId) return;
    try {
      const response = await API.get(
        '/api/v1/public/auth/passport/login/status',
        { params: { session_id: sessionId } }
      );
      const payload = response?.data || {};
      if (!payload.success) {
        setPassportLogin((current) => ({
          ...current,
          loading: false,
          message: payload.message || t('auth.login.passport_failed'),
        }));
        return;
      }
      const result = payload.data || {};
      if (result.status === 'complete') {
        finishPassportLogin(result.user);
        return;
      }
      if (['expired', 'failed', 'unbound'].includes(result.status)) {
        if (passportPollTimerRef.current)
          window.clearInterval(passportPollTimerRef.current);
        passportPollTimerRef.current = null;
        setPassportLogin((current) => ({
          ...current,
          loading: false,
          message: result.message || t(`auth.login.passport_${result.status}`),
        }));
      }
    } catch (error) {
      setPassportLogin((current) => ({
        ...current,
        loading: false,
        message: error.message || t('auth.login.passport_failed'),
      }));
    }
  };

  const startPassportLogin = async () => {
    if (passportLogin.loading) return;
    setPassportLogin({ loading: true, verifyUrl: '', message: '' });
    try {
      const response = await API.post(
        '/api/v1/public/auth/passport/login/session'
      );
      const payload = response?.data || {};
      if (
        !payload.success ||
        !payload.data?.session_id ||
        !payload.data?.verify_url
      ) {
        throw new Error(payload.message || t('auth.login.passport_failed'));
      }
      passportSessionRef.current = payload.data.session_id;
      setPassportLogin({
        loading: false,
        verifyUrl: payload.data.verify_url,
        message: '',
      });
      await pollPassportLogin();
      passportPollTimerRef.current = window.setInterval(
        pollPassportLogin,
        (Number(payload.data.poll_interval) || 2) * 1000
      );
    } catch (error) {
      setPassportLogin({
        loading: false,
        verifyUrl: '',
        message: error.message || t('auth.login.passport_failed'),
      });
    }
  };

  const closePassportLogin = () => {
    if (passportPollTimerRef.current)
      window.clearInterval(passportPollTimerRef.current);
    passportPollTimerRef.current = null;
    passportSessionRef.current = '';
    setPassportLogin({
      loading: false,
      verifyUrl: '',
      message: '',
    });
  };

  const toggleAuthMode = () => {
    if (authMode === 'passport') {
      closePassportLogin();
      setAuthMode('wallet');
      return;
    }
    setAuthMode('passport');
    startPassportLogin();
  };

  useEffect(() => {
    const refresh = () => pollPassportLogin();
    const channel =
      typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel('router-passport-login');
    if (channel) channel.onmessage = refresh;
    window.addEventListener('storage', refresh);
    return () => {
      if (channel) channel.close();
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const onWalletLoginClicked = async () => {
    if (walletLoginSubmitting) {
      return;
    }
    if (walletLoginPromiseRef.current) {
      const provider =
        walletProviderStatus.provider || (await walletProviderStatus.refresh());
      const pending = await focusWalletPendingApproval(provider || undefined);
      if (!pending?.focused) {
        showError(t('auth.login.wallet_pending_retry'));
      }
      return;
    }

    setWalletLoginSubmitting(true);
    try {
      if (status?.wallet_login === false) {
        showError(t('auth.login.wallet_disabled') || '钱包登录未开启');
        return;
      }
      await walletProviderStatus.refresh();
      setWalletLoginAwaitingApproval(true);
      const loginTask = loginWithWallet(selectedWalletAddress);
      walletLoginPromiseRef.current = loginTask;
      setWalletLoginSubmitting(false);
      const loginResult = await loginTask;
      setWalletLoginAwaitingApproval(false);
      persistWalletLoginHistory(loginResult?.address || selectedWalletAddress);
      const payload = loginResult?.response?.data || loginResult?.response;
      if (payload?.expiresAt) {
        localStorage.setItem(
          'wallet_token_expires_at',
          new Date(payload.expiresAt).toISOString()
        );
      }
      const selfResp = await API.get('/api/v1/public/user/self');
      const { success, data, message } = selfResp?.data || {};
      if (!success || !data) {
        showError(message || t('auth.login.user_fetch_failed'));
        return;
      }
      const userData = { ...data, token: loginResult.token };
      userDispatch({ type: 'login', payload: userData });
      localStorage.setItem('user', JSON.stringify(userData));
      navigate(
        resolvePostLoginPath(searchParams, resolveLandingPath(userData.role)),
        { replace: true }
      );
    } catch (error) {
      setWalletLoginAwaitingApproval(false);
      if (isWalletUserRejectedError(error)) {
        showError(t('auth.login.wallet_rejected'));
      } else {
        showError(error.message || t('auth.login.wallet_failed'));
      }
    } finally {
      walletLoginPromiseRef.current = null;
      setWalletLoginSubmitting(false);
    }
  };

  function handleChange(e) {
    const { name, value } = e.target;
    setInputs((previousInputs) => ({ ...previousInputs, [name]: value }));
  }

  async function handleSubmit() {
    if (passwordLoginDisabled) {
      showError(
        t('auth.login.password_disabled', '用户名密码登录未开启，请联系管理员')
      );
      return;
    }
    if (username && password) {
      const res = await API.post(`/api/v1/public/user/login`, {
        username,
        password,
      });
      const { success, message, data } = res.data;
      if (success) {
        userDispatch({ type: 'login', payload: data });
        localStorage.setItem('user', JSON.stringify(data));
        navigate(
          resolvePostLoginPath(searchParams, resolveLandingPath(data.role)),
          {
            replace: true,
          }
        );
      } else {
        showError(message);
      }
    }
  }

  return (
    <div className='router-login-page'>
      <main className='router-login-layout'>
        <section className='router-login-auth' aria-labelledby='login-title'>
          <div className='router-login-form-shell'>
            <div className='router-login-heading'>
              <h2 id='login-title'>
                {authMode === 'passport'
                  ? t('auth.login.passport_title')
                  : t('auth.login.wallet_title')}
              </h2>
              <p>
                {authMode === 'passport'
                  ? t('auth.login.passport_hint')
                  : t('auth.login.wallet_subtitle')}
              </p>
            </div>
            {authMode === 'wallet' && walletLoginEnabled ? (
              <>
                <div className='router-login-section'>
                  <div className='router-wallet-login-row'>
                    <AppSelect
                      className='router-wallet-address-select'
                      fluid
                      search
                      clearable={false}
                      options={walletAddressOptions}
                      value={selectedWalletAddress || undefined}
                      placeholder={t(
                        'auth.login.wallet_address_placeholder',
                        '选择钱包地址'
                      )}
                      disabled={walletLoginSubmitting}
                      onChange={(_, { value }) =>
                        setSelectedWalletAddress(String(value || '').trim())
                      }
                    />
                    <AppButton
                      className='router-login-main-btn router-auth-button router-wallet-button'
                      onClick={onWalletLoginClicked}
                      disabled={
                        walletLoginDisabled ||
                        walletLoginSubmitting ||
                        (!walletProviderStatus.detecting &&
                          !walletProviderStatus.available)
                      }
                      loading={
                        walletLoginSubmitting || walletProviderStatus.detecting
                      }
                    >
                      {t('auth.login.wallet_action', '钱包登陆')}
                    </AppButton>
                  </div>
                  {!walletProviderStatus.detecting &&
                    !walletProviderStatus.available && (
                      <AppAlert
                        type='warning'
                        showIcon
                        className='router-auth-message'
                        title={t(
                          'auth.login.wallet_not_detected',
                          '未检测到钱包插件，请安装或启用钱包插件后重试'
                        )}
                      />
                    )}
                </div>
              </>
            ) : null}
            {authMode === 'passport' ? (
              <div className='router-passport-login-panel'>
                {passportLogin.verifyUrl ? (
                  <AppQRCode value={passportLogin.verifyUrl} size={220} />
                ) : null}
                {passportLogin.loading ? (
                  <p>{t('auth.login.passport_loading')}</p>
                ) : null}
                {passportLogin.verifyUrl ? (
                  <a
                    className='router-passport-local-link'
                    href={passportLogin.verifyUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    {t('auth.login.passport_open')}
                  </a>
                ) : null}
                {passportLogin.message ? (
                  <>
                    <AppAlert
                      type='warning'
                      showIcon
                      title={passportLogin.message}
                    />
                    <AppButton onClick={startPassportLogin}>
                      {t('auth.login.passport_refresh')}
                    </AppButton>
                  </>
                ) : null}
              </div>
            ) : null}
            {authMode === 'wallet' ? (
              <div className='router-login-divider-wrap'>
                <AppDivider className='router-login-divider' horizontal>
                  <AppButton
                    className='router-email-login-toggle'
                    onClick={() => setShowEmailLogin((current) => !current)}
                  >
                    {t('auth.login.email_login_divider')}
                  </AppButton>
                </AppDivider>
              </div>
            ) : null}
            {authMode === 'wallet' && showEmailLogin ? (
              <div className='router-login-email-block'>
                {passwordLoginDisabled ? (
                  <AppAlert
                    type='warning'
                    showIcon
                    className='router-auth-message'
                    title={t(
                      'auth.login.password_disabled',
                      '用户名密码登录未开启，请联系管理员'
                    )}
                  />
                ) : (
                  <div className='router-login-form router-auth-form'>
                    <AppInput
                      className='router-auth-input'
                      fluid
                      icon='mail'
                      iconPosition='left'
                      placeholder={t('auth.login.email')}
                      name='username'
                      value={username}
                      onChange={handleChange}
                    />
                    <AppInput
                      className='router-auth-input'
                      fluid
                      icon='lock'
                      iconPosition='left'
                      placeholder={t('auth.login.password')}
                      name='password'
                      type='password'
                      value={password}
                      onChange={handleChange}
                      onPressEnter={handleSubmit}
                    />
                    <AppButton
                      fluid
                      className='router-auth-button router-password-submit'
                      onClick={handleSubmit}
                    >
                      {t('auth.login.start_work')}
                    </AppButton>
                  </div>
                )}
                <div className='router-login-links'>
                  <Link to='/reset'>{t('auth.login.reset_password')}</Link>
                  {passwordRegisterEnabled ? (
                    <span>
                      {t('auth.login.no_account')}
                      <Link to='/register'>{t('auth.login.register')}</Link>
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </section>
        <AppTooltip
          title={
            authMode === 'passport'
              ? t('auth.login.switch_to_wallet')
              : t('auth.login.switch_to_passport')
          }
        >
          <AppButton
            className='router-login-mode-corner'
            aria-label={
              authMode === 'passport'
                ? t('auth.login.switch_to_wallet')
                : t('auth.login.switch_to_passport')
            }
            icon={<AppIcon name={authMode === 'passport' ? 'key' : 'qrcode'} />}
            onClick={toggleAuthMode}
          />
        </AppTooltip>
      </main>
    </div>
  );
};

export default LoginForm;
