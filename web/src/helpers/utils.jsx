import { toast } from 'react-toastify';
import { toastConstants } from '../constants';
import React from 'react';
import i18n from '../i18n.jsx';
import { API } from './api';
import { buildLoginPath } from './authRedirect';

const HTMLToastContent = ({ htmlContent }) => {
  return <div dangerouslySetInnerHTML={{ __html: htmlContent }} />;
};
export default HTMLToastContent;

// Synchronous localStorage helpers. Prefer `useIsAdmin()` from
// `hooks/useAuth` for any decision that gates UI or routing — it reads
// the in-memory UserContext and is fed by the server's /api/v1/user/self
// response. These helpers exist for the very first render before
// UserContext is bootstrapped and for legacy callers; they must NOT be
// the only gate on an admin endpoint.
const ADMIN_ROLE_FLOOR = 10;
const ROOT_ROLE_FLOOR = 100;

function readUserFromStorage() {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

export function isAdmin() {
  const user = readUserFromStorage();
  if (!user) return false;
  return Number(user.role || 0) >= ADMIN_ROLE_FLOOR;
}

export function canManageUsers() {
  const user = readUserFromStorage();
  if (!user) return false;
  if (user.can_manage_users === true) return true;
  return Number(user.role || 0) >= ROOT_ROLE_FLOOR;
}

export function isRoot() {
  return canManageUsers();
}

export function getSystemName() {
  let system_name = localStorage.getItem('system_name');
  if (!system_name) return 'Router';
  return system_name;
}

export function getLogo() {
  let logo = localStorage.getItem('logo');
  if (!logo) return '/logo.png';
  return logo;
}

export function getFooterHTML() {
  return localStorage.getItem('footer_html');
}

export async function copy(text) {
  let okay = true;
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    okay = false;
    console.error(e);
  }
  return okay;
}

// withCardLabels attaches each column's (string) title to its rendered <td> as a
// `data-label` attribute, so the narrow-screen `.router-table-cardify` CSS can
// stack rows into labelled cards without duplicating the table markup.
export function withCardLabels(columns) {
  if (!Array.isArray(columns)) {
    return columns;
  }
  return columns.map((column) => {
    if (!column || typeof column !== 'object') {
      return column;
    }
    const label = typeof column.title === 'string' ? column.title : '';
    if (!label) {
      return column;
    }
    const previousOnCell = column.onCell;
    return {
      ...column,
      onCell: (record, index) => {
        const previous =
          typeof previousOnCell === 'function'
            ? previousOnCell(record, index) || {}
            : {};
        return { ...previous, 'data-label': label };
      },
    };
  });
}

export function isMobile() {
  return window.innerWidth <= 600;
}

let showErrorOptions = { autoClose: toastConstants.ERROR_TIMEOUT };
let showWarningOptions = { autoClose: toastConstants.WARNING_TIMEOUT };
let showSuccessOptions = { autoClose: toastConstants.SUCCESS_TIMEOUT };
let showInfoOptions = { autoClose: toastConstants.INFO_TIMEOUT };
let showNoticeOptions = { autoClose: false };

if (isMobile()) {
  showErrorOptions.position = 'top-center';
  // showErrorOptions.transition = 'flip';

  showSuccessOptions.position = 'top-center';
  // showSuccessOptions.transition = 'flip';

  showInfoOptions.position = 'top-center';
  // showInfoOptions.transition = 'flip';

  showNoticeOptions.position = 'top-center';
  // showNoticeOptions.transition = 'flip';
}

export function showError(error, options = {}) {
  if (!error) return;
  console.error(error);
  const mergedErrorOptions = { ...showErrorOptions, ...options };
  if (error.message) {
    if (error.name === 'AxiosError') {
      switch (error.response.status) {
        case 401:
          toast.error(i18n.t('common.session_expired'), mergedErrorOptions);
          {
            const loginPath = buildLoginPath(window.location);
            window.location.href = `${loginPath}${
              loginPath.includes('?') ? '&' : '?'
            }expired=${Date.now()}`;
          }
          break;
        case 429:
          toast.error(i18n.t('common.rate_limit'), mergedErrorOptions);
          break;
        case 500:
          toast.error(i18n.t('common.server_error'), mergedErrorOptions);
          break;
        case 405:
          toast.info(i18n.t('common.demo_only'));
          break;
        default:
          toast.error(error.message, mergedErrorOptions);
      }
      return;
    }
    toast.error(error.message, mergedErrorOptions);
  } else {
    toast.error(`${error}`, mergedErrorOptions);
  }
}

export function showWarning(message) {
  toast.warn(message, showWarningOptions);
}

export function showSuccess(message) {
  toast.success(message, showSuccessOptions);
}

export function showInfo(message) {
  toast.info(message, showInfoOptions);
}

export function showNotice(message, isHTML = false) {
  if (isHTML) {
    toast(<HTMLToastContent htmlContent={message} />, showNoticeOptions);
  } else {
    toast.info(message, showNoticeOptions);
  }
}

export function openPage(url) {
  window.open(url);
}

export function removeTrailingSlash(url) {
  if (url.endsWith('/')) {
    return url.slice(0, -1);
  } else {
    return url;
  }
}

export function timestamp2string(timestamp) {
  let date = new Date(timestamp * 1000);
  let year = date.getFullYear().toString();
  let month = (date.getMonth() + 1).toString();
  let day = date.getDate().toString();
  let hour = date.getHours().toString();
  let minute = date.getMinutes().toString();
  let second = date.getSeconds().toString();
  if (month.length === 1) {
    month = '0' + month;
  }
  if (day.length === 1) {
    day = '0' + day;
  }
  if (hour.length === 1) {
    hour = '0' + hour;
  }
  if (minute.length === 1) {
    minute = '0' + minute;
  }
  if (second.length === 1) {
    second = '0' + second;
  }
  return (
    year + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second
  );
}

export function downloadTextAsFile(text, filename) {
  let blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  let url = URL.createObjectURL(blob);
  let a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

export const verifyJSON = (str) => {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
};

export function shouldShowPrompt(id) {
  let prompt = localStorage.getItem(`prompt-${id}`);
  return !prompt;
}

export function setPromptShown(id) {
  localStorage.setItem(`prompt-${id}`, 'true');
}

let channelModels = undefined;
const normalizeModelId = (model) => {
  if (typeof model === 'string') return model;
  if (model && typeof model === 'object') {
    if (typeof model.id === 'string') return model.id;
    if (typeof model.name === 'string') return model.name;
    if (typeof model.model === 'string') return model.model;
  }
  return null;
};

const normalizeModelList = (models) => {
  if (!Array.isArray(models)) return [];
  const seen = new Set();
  const list = [];
  models.forEach((model) => {
    const id = normalizeModelId(model);
    if (!id || seen.has(id)) return;
    seen.add(id);
    list.push(id);
  });
  return list;
};

export async function loadChannelModels() {
  const res = await API.get('/api/v1/public/channel/models');
  const { success, data, meta } = res.data;
  if (!success) {
    return;
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    channelModels = data;
    localStorage.setItem('channel_models', JSON.stringify(data));
    return;
  }

  let modelMap = {};
  if (Array.isArray(meta)) {
    meta.forEach((entry) => {
      if (!entry || entry.id === undefined) return;
      const models = normalizeModelList(entry.models);
      modelMap[entry.id] = models;
    });
  } else if (meta && typeof meta === 'object' && meta.id !== undefined) {
    const models = normalizeModelList(data);
    if (models.length > 0) {
      modelMap[meta.id] = models;
    }
  }

  if (Array.isArray(data)) {
    if (Object.keys(modelMap).length === 0) {
      data.forEach((entry) => {
        if (!entry || typeof entry !== 'object' || entry.id === undefined)
          return;
        const models = normalizeModelList(entry.models);
        modelMap[entry.id] = models;
      });
    }
    if (Object.keys(modelMap).length === 0) {
      const models = normalizeModelList(data);
      if (models.length > 0) {
        modelMap.all = models;
      }
    }
  }

  channelModels = modelMap;
  localStorage.setItem('channel_models', JSON.stringify(modelMap));
}

export function getChannelModels(type) {
  if (channelModels !== undefined) {
    if (Array.isArray(channelModels)) {
      return normalizeModelList(channelModels);
    }
    if (type in channelModels) {
      return normalizeModelList(channelModels[type]);
    }
    if (channelModels.all) {
      return normalizeModelList(channelModels.all);
    }
  }
  let models = localStorage.getItem('channel_models');
  if (!models) {
    return [];
  }
  channelModels = JSON.parse(models);
  if (Array.isArray(channelModels)) {
    return normalizeModelList(channelModels);
  }
  if (type in channelModels) {
    return normalizeModelList(channelModels[type]);
  }
  if (channelModels.all) {
    return normalizeModelList(channelModels.all);
  }
  return [];
}
