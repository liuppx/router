import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  AppButton,
  AppFilterHeader,
  AppIcon,
  AppSection,
} from '../../router-ui';
import useOnboardingProgress from '../../hooks/useOnboardingProgress';

const DISMISSED_KEY = 'onboarding_dismissed';
const CHECKLIST_ITEMS = [
  { key: 'token', path: '/workspace/token/add' },
  { key: 'quota', path: '/workspace/service/pricing' },
  { key: 'first_call', path: '/workspace/service/cli-guide' },
  { key: 'email', path: '/workspace/setting' },
];

const WorkspaceStart = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const chatLink = String(localStorage.getItem('chat_link') || '').trim();

  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === 'true';
    } catch (error) {
      return false;
    }
  });
  const { progress, loading: progressLoading, doneCount } = useOnboardingProgress();

  const allDone = progress && doneCount === CHECKLIST_ITEMS.length;
  const showChecklist = !dismissed;

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, 'true');
    } catch (error) {
      // ignore quota errors
    }
    setDismissed(true);
  };
  const handleRestore = () => {
    try {
      localStorage.removeItem(DISMISSED_KEY);
    } catch (error) {
      // ignore
    }
    setDismissed(false);
  };

  const isItemDone = (key) => {
    if (!progress) return false;
    if (key === 'token') return !!progress.has_token;
    if (key === 'quota') return !!progress.has_balance_or_package;
    if (key === 'first_call') return !!progress.has_api_call;
    if (key === 'email') return !!progress.email_bound;
    return false;
  };

  return (
    <div className='dashboard-container router-workspace-start-page'>
      <AppFilterHeader
        breadcrumbs={[
          { key: 'workspace', label: t('header.workspace') },
          { key: 'start', label: t('workspace_start.title'), active: true },
        ]}
        title={t('workspace_start.title')}
      />

      {showChecklist ? (
        <AppSection className='router-workspace-start-checklist'>
          <div className='router-workspace-start-checklist-header'>
            <div className='router-workspace-start-checklist-title'>
              {t('workspace_start.checklist.title')}
            </div>
            <div className='router-workspace-start-checklist-progress'>
              {t('workspace_start.checklist.progress_label', {
                done: doneCount,
                total: CHECKLIST_ITEMS.length,
              })}
            </div>
          </div>
          {allDone ? (
            <div className='router-workspace-start-checklist-done'>
              <AppIcon name='check circle' />
              {t('workspace_start.checklist.done_label')}
            </div>
          ) : null}
          <ul className='router-workspace-start-checklist-list'>
            {CHECKLIST_ITEMS.map((item) => {
              const done = isItemDone(item.key);
              return (
                <li
                  key={item.key}
                  className={
                    done
                      ? 'router-workspace-start-checklist-item is-done'
                      : 'router-workspace-start-checklist-item'
                  }
                >
                  <span className='router-workspace-start-checklist-status'>
                    {progressLoading && !progress ? (
                      '…'
                    ) : done ? (
                      <AppIcon name='check' />
                    ) : (
                      <AppIcon name='circle outline' />
                    )}
                  </span>
                  <div className='router-workspace-start-checklist-body'>
                    <div className='router-workspace-start-checklist-item-title'>
                      {t(`workspace_start.checklist.items.${item.key}.title`)}
                    </div>
                    <div className='router-workspace-start-checklist-item-description'>
                      {t(
                        `workspace_start.checklist.items.${item.key}.description`,
                      )}
                    </div>
                  </div>
                  {done ? null : (
                    <AppButton
                      type='button'
                      size='small'
                      className='router-inline-button'
                      onClick={() => navigate(item.path)}
                    >
                      {t(`workspace_start.checklist.items.${item.key}.cta`)}
                    </AppButton>
                  )}
                </li>
              );
            })}
          </ul>
          <div className='router-workspace-start-checklist-footer'>
            <AppButton
              type='button'
              size='small'
              className='router-inline-button'
              onClick={handleDismiss}
            >
              {t('workspace_start.checklist.dismiss')}
            </AppButton>
          </div>
        </AppSection>
      ) : (
        <AppSection className='router-workspace-start-checklist'>
          <AppButton
            type='button'
            size='small'
            className='router-inline-button'
            onClick={handleRestore}
          >
            {t('workspace_start.checklist.restore')}
          </AppButton>
        </AppSection>
      )}

      <div className='router-workspace-start-grid'>
        <AppSection className='router-workspace-start-card'>
          <div className='router-workspace-start-card-index'>1</div>
          <div className='router-workspace-start-card-title'>
            {t('workspace_start.steps.pricing.title')}
          </div>
          <div className='router-workspace-start-card-body'>
            {t('workspace_start.steps.pricing.description')}
          </div>
          <AppButton
            type='button'
            className='router-inline-button'
            onClick={() => navigate('/workspace/service/pricing')}
          >
            {t('workspace_start.actions.view_pricing')}
          </AppButton>
        </AppSection>

        <AppSection className='router-workspace-start-card'>
          <div className='router-workspace-start-card-index'>2</div>
          <div className='router-workspace-start-card-title'>
            {t('workspace_start.steps.token.title')}
          </div>
          <div className='router-workspace-start-card-body'>
            {t('workspace_start.steps.token.description')}
          </div>
          <AppButton
            type='button'
            className='router-inline-button'
            onClick={() => navigate('/workspace/token/add')}
          >
            {t('workspace_start.actions.create_token')}
          </AppButton>
        </AppSection>

        <AppSection className='router-workspace-start-card'>
          <div className='router-workspace-start-card-index'>3</div>
          <div className='router-workspace-start-card-title'>
            {t('workspace_start.steps.call.title')}
          </div>
          <div className='router-workspace-start-card-body'>
            {t('workspace_start.steps.call.description')}
          </div>
          <div className='router-workspace-start-option-list'>
            {chatLink !== '' ? (
              <div className='router-workspace-start-option-item'>
                <div className='router-workspace-start-option-title'>
                  {t('workspace_start.steps.call.chat.title')}
                </div>
                <div className='router-workspace-start-option-description'>
                  {t('workspace_start.steps.call.chat.description')}
                </div>
                <AppButton
                  type='button'
                  className='router-inline-button'
                  onClick={() => window.open(chatLink, '_blank', 'noopener,noreferrer')}
                >
                  {t('workspace_start.actions.open_chat')}
                </AppButton>
              </div>
            ) : null}

            <div className='router-workspace-start-option-item'>
              <div className='router-workspace-start-option-title'>
                {t('workspace_start.steps.call.terminal.title')}
              </div>
              <div className='router-workspace-start-option-description'>
                {t('workspace_start.steps.call.terminal.description')}
              </div>
              <AppButton
                type='button'
                className='router-inline-button'
                onClick={() => navigate('/workspace/service/cli-guide')}
              >
                {t('workspace_start.actions.view_guide')}
              </AppButton>
            </div>
          </div>
        </AppSection>
      </div>
    </div>
  );
};

export default WorkspaceStart;