import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { API } from '../helpers';
import { AppButton, AppModal } from '../router-ui';

const DISMISSED_STORAGE_KEY = 'welcome_overlay_dismissed_v1';

// 三步引导,复用 WorkspaceStart 的落地路径。
const STEP_KEYS = ['quota', 'token', 'call'];
const STEP_PATHS = {
  quota: '/workspace/service/pricing',
  token: '/workspace/token/add',
  call: '/workspace/service/cli-guide',
};

const readDismissed = () => {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(DISMISSED_STORAGE_KEY) === '1';
  } catch (error) {
    return false;
  }
};

const WelcomeOverlay = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (readDismissed()) {
      return undefined;
    }

    API.get('/api/v1/public/user/onboarding/progress')
      .then((response) => {
        if (cancelled) return;
        const data = response?.data?.success
          ? response?.data?.data || null
          : null;
        if (!data) return;
        const doneCount =
          (data.has_token ? 1 : 0) +
          (data.has_balance_or_package ? 1 : 0) +
          (data.has_api_call ? 1 : 0) +
          (data.email_bound ? 1 : 0);
        // 仅对完全没有任何进度(0/4)的真正新用户展示。
        if (doneCount === 0) {
          setVisible(true);
        }
      })
      .catch(() => {
        // 拉取失败静默,不展示遮罩。
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // 回访入口:WorkspaceStart「重新查看新手引导」派发此事件,
  // 强制重弹引导(绕过 doneCount / dismissed 检查,回到第一步)。
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const handleOpen = () => {
      setStepIndex(0);
      setVisible(true);
    };
    window.addEventListener('welcome-overlay:open', handleOpen);
    return () => {
      window.removeEventListener('welcome-overlay:open', handleOpen);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(DISMISSED_STORAGE_KEY, '1');
      } catch (error) {
        // ignore
      }
    }
  };

  const total = STEP_KEYS.length;
  const isLast = stepIndex >= total - 1;
  const currentKey = STEP_KEYS[stepIndex];

  const handlePrimary = () => {
    // 主 CTA:跳到当前步骤对应页,并结束引导(不再复现)。
    const path = STEP_PATHS[currentKey];
    dismiss();
    if (path) {
      navigate(path);
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <AppModal
      size='small'
      open={visible}
      onClose={dismiss}
      title={t('welcome_overlay.title')}
      className='router-welcome-overlay'
      footer={[
        <AppButton
          key='skip'
          className='router-modal-button'
          basic
          onClick={dismiss}
        >
          {t('welcome_overlay.skip')}
        </AppButton>,
        <AppButton
          key='prev'
          className='router-modal-button'
          disabled={stepIndex === 0}
          onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
        >
          {t('welcome_overlay.prev')}
        </AppButton>,
        isLast ? null : (
          <AppButton
            key='next'
            className='router-modal-button'
            onClick={() => setStepIndex((prev) => Math.min(total - 1, prev + 1))}
          >
            {t('welcome_overlay.next')}
          </AppButton>
        ),
        <AppButton
          key='primary'
          className='router-modal-button'
          color='blue'
          onClick={handlePrimary}
        >
          {t(`welcome_overlay.steps.${currentKey}.cta`)}
        </AppButton>,
      ].filter(Boolean)}
    >
      <div className='router-welcome-overlay-body'>
        <div className='router-welcome-overlay-subtitle'>
          {t('welcome_overlay.subtitle')}
        </div>
        <div className='router-welcome-overlay-steps'>
          {STEP_KEYS.map((key, index) => (
            <span
              key={key}
              className={
                index === stepIndex
                  ? 'router-welcome-overlay-dot is-active'
                  : 'router-welcome-overlay-dot'
              }
            />
          ))}
        </div>
        <div className='router-welcome-overlay-step-meta'>
          {t('welcome_overlay.step_of', {
            current: stepIndex + 1,
            total,
          })}
        </div>
        <div className='router-welcome-overlay-step-title'>
          {t(`welcome_overlay.steps.${currentKey}.title`)}
        </div>
        <div className='router-welcome-overlay-step-description'>
          {t(`welcome_overlay.steps.${currentKey}.description`)}
        </div>
      </div>
    </AppModal>
  );
};

export default WelcomeOverlay;
