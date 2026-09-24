import { useCallback, useEffect, useRef, useState } from 'react';
import { API } from '../helpers';
import { useIsAdmin } from './useAuth';

// 值班台 / 侧栏红点共用的告警摘要源:只取 summary(page_size=1,列表几乎不落地),
// 后端按扫描窗口聚合,故此计数是页无关的全量口径。60s 轮询一次,失败静默降级为
// 全 0,绝不打断 UI(侧栏/首屏不应因告警接口抖动而报错或闪空)。
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

const useChannelAlertSummary = () => {
  const isAdmin = useIsAdmin();
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!isAdmin) {
      return;
    }
    setLoading(true);
    try {
      const response = await API.get('/api/v1/admin/channel/alerts', {
        params: { page: 1, page_size: 1 },
      });
      if (!mountedRef.current) {
        return;
      }
      if (response?.data?.success === true) {
        setSummary(normalizeSummary(response?.data?.data?.summary));
      }
    } catch {
      // 静默降级:保留上一次的计数,不清零、不报错,避免网络抖动清空红点。
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [isAdmin]);

  useEffect(() => {
    mountedRef.current = true;
    if (!isAdmin) {
      setSummary(EMPTY_SUMMARY);
      return undefined;
    }
    load();
    const timer = window.setInterval(load, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, [isAdmin, load]);

  return { ...summary, loading, reload: load };
};

export default useChannelAlertSummary;
