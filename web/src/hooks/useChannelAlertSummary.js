import { useEffect, useState } from 'react';
import { API } from '../helpers';
import { useIsAdmin } from './useAuth';

// 值班台 / 侧栏红点共用的告警摘要源:只取 summary(page_size=1,列表几乎不落地),
// 后端按扫描窗口聚合,故此计数是页无关的全量口径。60s 轮询一次,失败静默降级为
// 保留上次计数,绝不打断 UI(侧栏/首屏不应因告警接口抖动而报错或闪空)。
//
// 单例轮询:侧栏与首屏值班台会同时挂载本 hook。若各自起 setInterval,就是两条
// 对 /channel/alerts 的重复轮询。这里把状态与定时器提升到模块级——所有消费者
// 共享一份 summary 和一个 60s 定时器,引用计数到 0 时停表,避免重复取数。
const EMPTY_SUMMARY = {
  activeTotal: 0,
  unresolvedCritical: 0,
  unacknowledged: 0,
  last24h: 0,
};

const POLL_INTERVAL_MS = 60000;

const normalizeSummary = (raw) => {
  if (!raw || typeof raw !== 'object') {
    return EMPTY_SUMMARY;
  }
  return {
    activeTotal: Number(raw.active_total || 0),
    unresolvedCritical: Number(raw.unresolved_critical || 0),
    unacknowledged: Number(raw.unacknowledged || 0),
    last24h: Number(raw.last_24h || 0),
  };
};

// ---- 模块级共享存储(单例) ----
let sharedSummary = EMPTY_SUMMARY;
let sharedLoading = false;
let sharedTimer = null;
let inFlight = null;
const subscribers = new Set();

const notify = () => {
  subscribers.forEach((listener) => listener());
};

const fetchSummary = async () => {
  // 合并并发调用:多消费者同时触发时只发一条请求。
  if (inFlight) {
    return inFlight;
  }
  sharedLoading = true;
  notify();
  inFlight = API.get('/api/v1/admin/channel/alerts', {
    params: { page: 1, page_size: 1 },
  })
    .then((response) => {
      if (response?.data?.success === true) {
        sharedSummary = normalizeSummary(response?.data?.data?.summary);
      }
    })
    .catch(() => {
      // 静默降级:保留上一次的计数,不清零、不报错,避免网络抖动清空红点。
    })
    .finally(() => {
      sharedLoading = false;
      inFlight = null;
      notify();
    });
  return inFlight;
};

const startPolling = () => {
  if (sharedTimer !== null) {
    return;
  }
  fetchSummary();
  sharedTimer = window.setInterval(fetchSummary, POLL_INTERVAL_MS);
};

const stopPolling = () => {
  if (sharedTimer !== null) {
    window.clearInterval(sharedTimer);
    sharedTimer = null;
  }
};

const subscribe = (listener) => {
  subscribers.add(listener);
  startPolling();
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) {
      stopPolling();
    }
  };
};

const useChannelAlertSummary = () => {
  const isAdmin = useIsAdmin();
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!isAdmin) {
      return undefined;
    }
    const unsubscribe = subscribe(() => forceRender((tick) => tick + 1));
    return unsubscribe;
  }, [isAdmin]);

  if (!isAdmin) {
    return { ...EMPTY_SUMMARY, loading: false, reload: fetchSummary };
  }
  return { ...sharedSummary, loading: sharedLoading, reload: fetchSummary };
};

export default useChannelAlertSummary;
