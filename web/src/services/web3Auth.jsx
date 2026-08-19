import {
  clearAccessToken as sdkClearAccessToken,
  focusPendingApproval,
  getAccessToken as sdkGetAccessToken,
  getChainId,
  getProvider,
  isUserRejectedWalletAction,
  isWalletReconnectError,
  logout as sdkLogout,
  refreshAccessToken as sdkRefreshAccessToken,
  requestAccounts,
  requestIdentityPresentation,
  signMessage,
  watchProvider,
} from '@yeying-community/web3-bs';

import { WEB3_AUTH_OPTIONS, WEB3_TOKEN_STORAGE_KEY } from '../helpers/web3';
import {
  getAccessTokenExpiresAt,
  isAccessTokenFresh,
} from '../helpers/walletSession.mjs';

const WALLET_RECONNECT_TIMEOUT_MS = 1600;

function getRefreshPayload(refreshResult) {
  return refreshResult?.response?.data || refreshResult?.response || {};
}

function persistRefreshedWalletSession(refreshResult) {
  const token = refreshResult?.token;
  if (!token || typeof window === 'undefined') {
    return;
  }
  const payload = getRefreshPayload(refreshResult);
  const expiresAt =
    Number(payload?.expiresAt || 0) || getAccessTokenExpiresAt(token);
  if (expiresAt > 0) {
    localStorage.setItem(
      'wallet_token_expires_at',
      new Date(expiresAt).toISOString(),
    );
  }
  try {
    const storedUserRaw = localStorage.getItem('user');
    if (!storedUserRaw) {
      return;
    }
    const storedUser = JSON.parse(storedUserRaw);
    if (storedUser?.id) {
      localStorage.setItem(
        'user',
        JSON.stringify({
          ...storedUser,
          token,
        }),
      );
    }
  } catch (error) {
    // Keep the refreshed SDK token even if the legacy user cache is malformed.
  }
}

export function normalizeChainId(chainId) {
  if (!chainId) return '';
  if (typeof chainId !== 'string') return String(chainId);
  if (chainId.startsWith('0x')) {
    const parsed = parseInt(chainId, 16);
    if (!Number.isNaN(parsed)) {
      return parsed.toString();
    }
  }
  return chainId;
}

function waitForWalletProviderReconnect(timeoutMs = WALLET_RECONNECT_TIMEOUT_MS) {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    let stopWatching = () => {};
    const finish = () => {
      if (settled) return;
      settled = true;
      stopWatching();
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    stopWatching = watchProvider(
      ({ present }) => {
        if (present) {
          finish();
        }
      },
      { preferYeYing: true, pollIntervalMs: 100, maxPolls: 16 },
    );
    if (settled) {
      stopWatching();
    }
  });
}

export async function requireWalletProvider() {
  const provider = await getProvider();
  if (!provider) {
    throw new Error('未检测到钱包，请安装 MetaMask 或开启浏览器钱包');
  }
  return provider;
}

export async function getWalletContext(preferredAddress = '') {
  const provider = await requireWalletProvider();
  const accounts = await requestAccounts({ provider });
  const normalizedPreferredAddress = String(preferredAddress || '').trim().toLowerCase();
  const matchedAddress = Array.isArray(accounts)
    ? accounts.find(
        (item) =>
          String(item || '').trim().toLowerCase() === normalizedPreferredAddress,
      )
    : '';
  const address = matchedAddress || accounts?.[0];
  if (!address) {
    throw new Error('未获取到钱包账户');
  }
  const chainId = normalizeChainId(await getChainId(provider));
  return { provider, address, chainId };
}

async function loginWithWalletOnce(preferredAddress = '', identityBindAttempted = false) {
  const { provider, address, chainId } = await getWalletContext(preferredAddress);
  const challengeResponse = await fetch(`${WEB3_AUTH_OPTIONS.baseUrl}/identity/login/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    credentials: WEB3_AUTH_OPTIONS.credentials,
    body: JSON.stringify({ address }),
  });
  const challengePayload = await challengeResponse.json();
  if (!challengeResponse.ok || challengePayload?.code || !challengePayload?.data?.nonce) {
    throw new Error(challengePayload?.message || '无法创建钱包登录请求');
  }
  const loginRequest = challengePayload.data;
  const presentation = await requestIdentityPresentation({
    provider,
    appId: loginRequest.app_id || loginRequest.appId,
    audience: loginRequest.audience,
    nonce: loginRequest.nonce,
    scopes: loginRequest.scopes,
    requestId: loginRequest.request_id || loginRequest.requestId,
    account: { chainKey: 'eip155', address },
  });
  const verifyResponse = await fetch(`${WEB3_AUTH_OPTIONS.baseUrl}/identity/login/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    credentials: WEB3_AUTH_OPTIONS.credentials,
    body: JSON.stringify({
      session_id: loginRequest.session_id,
      request_id: loginRequest.request_id,
      address,
      presentation,
    }),
  });
  const verifyPayload = await verifyResponse.json();
  if (!identityBindAttempted && verifyPayload?.code && verifyPayload?.reason === 'wallet_confirmation_required') {
    await bindIdentityAccount({ provider, address, chainId: `eip155:${chainId}`, presentation });
    return loginWithWalletOnce(preferredAddress, true);
  }
  if (!verifyResponse.ok || verifyPayload?.code || !verifyPayload?.data?.token) {
    throw new Error(verifyPayload?.message || '钱包登录失败');
  }
  const token = verifyPayload.data.token;
  if (token) {
    localStorage.setItem(WEB3_TOKEN_STORAGE_KEY, token);
  }
  return { token, address, presentation, response: verifyPayload.data, provider };
}

async function bindIdentityAccount({ provider, address, chainId, presentation }) {
  const identity = presentation?.holder;
  const identityDocument = presentation?.identityDocument;
  if (!identity || !identityDocument) throw new Error('夜莺身份缺少身份文档，无法绑定账户');
  const challengeResponse = await fetch(`${WEB3_AUTH_OPTIONS.baseUrl}/identity/account/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    credentials: WEB3_AUTH_OPTIONS.credentials,
    body: JSON.stringify({ identity, chainKey: chainId, address }),
  });
  const challengePayload = await challengeResponse.json();
  if (!challengeResponse.ok || challengePayload?.code || !challengePayload?.data?.message) {
    throw new Error(challengePayload?.message || '无法创建身份绑定请求');
  }
  const challenge = challengePayload.data;
  const accountSignature = await signMessage({ provider, address, message: challenge.message });
  const verifyResponse = await fetch(`${WEB3_AUTH_OPTIONS.baseUrl}/identity/account/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    credentials: WEB3_AUTH_OPTIONS.credentials,
    body: JSON.stringify({
      identityDocument,
      identity,
      chainKey: chainId,
      address,
      nonce: challenge.nonce,
      issuedAt: challenge.issuedAt,
      expiresAt: challenge.expiresAt,
      accountSignature,
      walletIdentityId: identity.replace(/^did:yeying:/, ''),
      did: identity,
    }),
  });
  const verifyPayload = await verifyResponse.json();
  if (!verifyResponse.ok || verifyPayload?.code) {
    throw new Error(verifyPayload?.message || '身份账户绑定失败');
  }
  return verifyPayload.data;
}

export async function loginWithWallet(preferredAddress = '') {
  try {
    return await loginWithWalletOnce(preferredAddress);
  } catch (error) {
    if (!isWalletReconnectError(error) || isUserRejectedWalletAction(error)) {
      throw error;
    }
    await waitForWalletProviderReconnect();
    return await loginWithWalletOnce(preferredAddress);
  }
}

export async function focusWalletPendingApproval(provider) {
  try {
    return await focusPendingApproval(provider);
  } catch (error) {
    return { focused: false, type: null };
  }
}

export function isWalletUserRejectedError(error) {
  return isUserRejectedWalletAction(error);
}

export async function signWalletMessage(message, address, provider) {
  const activeProvider = provider || (await requireWalletProvider());
  const signature = await signMessage({
    provider: activeProvider,
    message,
    address,
  });
  return { signature, provider: activeProvider };
}

export function getStoredAccessToken() {
  return sdkGetAccessToken({ tokenStorageKey: WEB3_TOKEN_STORAGE_KEY });
}

export async function refreshWalletAccessToken() {
  const result = await sdkRefreshAccessToken(WEB3_AUTH_OPTIONS);
  persistRefreshedWalletSession(result);
  return result;
}

export async function restoreWalletSession() {
  const token = getStoredAccessToken();
  if (isAccessTokenFresh(token)) {
    return {
      token,
      refreshed: false,
    };
  }
  const result = await refreshWalletAccessToken();
  return {
    ...result,
    refreshed: true,
  };
}

export async function logoutWallet() {
  try {
    await sdkLogout(WEB3_AUTH_OPTIONS);
  } finally {
    sdkClearAccessToken({ tokenStorageKey: WEB3_TOKEN_STORAGE_KEY });
  }
}
