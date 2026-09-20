// 仅供 Header 显示 onboarding 完成度环使用。
// 暂不复用 WelcomeOverlay/WorkspaceStart/App.jsx 中的内联请求,
// 以避免改动既有渲染顺序和错误处理带来的回归。
import { useEffect, useState } from 'react';
import { API } from '../helpers';

const TOTAL_ITEMS = 4;

const computeDoneCount = (progress) => {
  if (!progress) return 0;
  return (
    (progress.has_token ? 1 : 0) +
    (progress.has_balance_or_package ? 1 : 0) +
    (progress.has_api_call ? 1 : 0) +
    (progress.email_bound ? 1 : 0)
  );
};

export const useOnboardingProgress = (enabled = true) => {
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    API.get('/api/v1/public/user/onboarding/progress')
      .then((response) => {
        if (cancelled) return;
        const data = response?.data?.success
          ? response?.data?.data || null
          : null;
        setProgress(data);
      })
      .catch(() => {
        // Header 只显示环,失败时不打扰用户,静默忽略即可。
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return {
    progress,
    loading,
    doneCount: computeDoneCount(progress),
    total: TOTAL_ITEMS,
  };
};

export default useOnboardingProgress;