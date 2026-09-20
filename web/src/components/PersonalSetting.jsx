import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../helpers';
import { UserContext } from '../context/User';
import {
  AppButton,
  AppField,
  AppFormRow,
  AppInput,
  AppInputNumber,
  AppModal,
  AppSection,
  AppSwitch,
} from '../router-ui';

const defaultPasswordModal = {
  open: false,
  mode: 'set',
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
  submitting: false,
};

const normalizeUser = (user) => {
  if (!user || typeof user !== 'object') return null;
  return {
    ...user,
    display_name: user.display_name ?? user.displayName ?? '',
    avatar_url: user.avatar_url ?? user.avatarUrl ?? '',
  };
};

const PersonalSetting = () => {
  const { t } = useTranslation();
  const [userState, userDispatch] = useContext(UserContext);
  const currentUser = useMemo(() => {
    const contextUser = normalizeUser(userState?.user);
    if (contextUser) return contextUser;
    const cached = localStorage.getItem('user');
    if (!cached) return null;
    try {
      return normalizeUser(JSON.parse(cached));
    } catch (error) {
      return null;
    }
  }, [userState?.user]);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [passwordModal, setPasswordModal] = useState(defaultPasswordModal);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState({
    low_balance_threshold: null,
    notify_on_low_balance: true,
    default_threshold: 0,
  });
  const [lowBalanceThresholdInput, setLowBalanceThresholdInput] = useState('');

  useEffect(() => {
    setUsername(currentUser?.username || '');
    setEmail(currentUser?.email || '');
    setIsEditingUsername(false);
    setIsEditingEmail(false);
  }, [currentUser?.email, currentUser?.username]);

  useEffect(() => {
    if (!currentUser || typeof currentUser.has_password === 'boolean') {
      return;
    }
    syncCurrentUser();
  }, [currentUser]);

  useEffect(() => {
    let cancelled = false;
    const loadNotificationSettings = async () => {
      setNotificationLoading(true);
      try {
        const res = await API.get('/api/v1/public/user/self/notification');
        const { success, data } = res?.data || {};
        if (cancelled) return;
        if (success && data && typeof data === 'object') {
          setNotificationSettings({
            low_balance_threshold:
              typeof data.low_balance_threshold === 'number'
                ? data.low_balance_threshold
                : null,
            notify_on_low_balance:
              typeof data.notify_on_low_balance === 'boolean'
                ? data.notify_on_low_balance
                : true,
            default_threshold:
              typeof data.default_threshold === 'number'
                ? data.default_threshold
                : 0,
          });
        }
      } catch (error) {
        // 设置页不应因加载失败弹出明显错误条幅;静默。
        if (!cancelled) {
          showError(
            error?.message ||
              t('personal_setting.error.notification_load_failed'),
          );
        }
      } finally {
        if (!cancelled) {
          setNotificationLoading(false);
        }
      }
    };
    loadNotificationSettings();
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    setLowBalanceThresholdInput(
      typeof notificationSettings.low_balance_threshold === 'number'
        ? String(notificationSettings.low_balance_threshold)
        : '',
    );
  }, [notificationSettings.low_balance_threshold]);

  const submitNotificationSettings = async () => {
    const raw = (lowBalanceThresholdInput || '').trim();
    let payloadThreshold = null;
    if (raw !== '') {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
        showError(t('personal_setting.error.low_balance_threshold_invalid'));
        return;
      }
      payloadThreshold = parsed;
    }
    setNotificationSaving(true);
    try {
      const res = await API.put('/api/v1/public/user/self/notification', {
        low_balance_threshold: payloadThreshold,
        notify_on_low_balance: notificationSettings.notify_on_low_balance,
      });
      const { success, message } = res?.data || {};
      if (!success) {
        showError(message || t('personal_setting.notification.save_failed'));
        return;
      }
      showSuccess(t('personal_setting.notification.saved'));
      setNotificationSettings((prev) => ({
        ...prev,
        low_balance_threshold:
          payloadThreshold === null ? null : Number(payloadThreshold),
      }));
    } catch (error) {
      showError(
        error?.message || t('personal_setting.notification.save_failed'),
      );
    } finally {
      setNotificationSaving(false);
    }
  };

  const walletAddress = currentUser?.wallet_address || '-';
  const avatarURL = currentUser?.avatar_url || '';
  const hasPassword = currentUser?.has_password === true;

  const syncCurrentUser = async () => {
    const res = await API.get('/api/v1/public/user/self');
    const { success, message, data } = res.data || {};
    if (!success) {
      showError(message || t('user.messages.load_failed', '加载失败'));
      return false;
    }
    const nextUser = normalizeUser(data);
    userDispatch({ type: 'login', payload: nextUser });
    localStorage.setItem('user', JSON.stringify(nextUser));
    return true;
  };

  const submitUsername = async () => {
    const trimmedUsername = (username || '').trim();
    if (!trimmedUsername) {
      showError(t('user.edit.username_placeholder'));
      return;
    }
    if (!currentUser?.username) {
      showError(t('personal_setting.error.user_missing'));
      return;
    }
    setProfileSubmitting(true);
    try {
      const res = await API.put('/api/v1/public/user/self', {
        username: trimmedUsername,
        password: '',
      });
      const { success, message } = res.data || {};
      if (!success) {
        showError(message || t('user.messages.update_failed', '更新失败'));
        return;
      }
      await syncCurrentUser();
      setIsEditingUsername(false);
      showSuccess(t('user.messages.update_success'));
    } finally {
      setProfileSubmitting(false);
    }
  };

  const cancelUsernameEdit = () => {
    setUsername(currentUser?.username || '');
    setIsEditingUsername(false);
  };

  const submitEmail = async () => {
    const trimmedEmail = (email || '').trim();
    if (!trimmedEmail) {
      showError(t('personal_setting.error.email_required'));
      return;
    }
    setProfileSubmitting(true);
    try {
      const res = await API.put('/api/v1/public/user/self', {
        username: currentUser?.username || '',
        password: '',
        email: trimmedEmail,
      });
      const { success, message } = res.data || {};
      if (!success) {
        showError(message || t('user.messages.update_failed', '更新失败'));
        return;
      }
      await syncCurrentUser();
      setIsEditingEmail(false);
      showSuccess(t('user.messages.update_success'));
    } finally {
      setProfileSubmitting(false);
    }
  };

  const cancelEmailEdit = () => {
    setEmail(currentUser?.email || '');
    setIsEditingEmail(false);
  };

  const openPasswordModal = (mode) => {
    setPasswordModal({
      ...defaultPasswordModal,
      open: true,
      mode,
    });
  };

  const closePasswordModal = () => {
    if (passwordModal.submitting) return;
    setPasswordModal(defaultPasswordModal);
  };

  const updatePasswordModalField = (name, value) => {
    setPasswordModal((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const submitPassword = async () => {
    const isModify = passwordModal.mode === 'modify';
    const currentPassword = passwordModal.currentPassword || '';
    const newPassword = passwordModal.newPassword || '';
    const confirmPassword = passwordModal.confirmPassword || '';

    if (isModify && currentPassword.length < 8) {
      showError(t('personal_setting.error.current_password_required'));
      return;
    }
    if (newPassword.length < 8) {
      showError(t('messages.error.password_length'));
      return;
    }
    if (newPassword !== confirmPassword) {
      showError(t('messages.error.password_mismatch'));
      return;
    }

    setPasswordModal((prev) => ({ ...prev, submitting: true }));
    try {
      let res;
      if (isModify) {
        res = await API.post('/api/v1/public/user/self/password', {
          current_password: currentPassword,
          new_password: newPassword,
        });
      } else {
        res = await API.put('/api/v1/public/user/self', {
          username: currentUser?.username || '',
          password: newPassword,
        });
      }
      const { success, message } = res.data || {};
      if (!success) {
        showError(message || t('user.messages.update_failed', '更新失败'));
        return;
      }
      showSuccess(
        isModify
          ? t('personal_setting.messages.password_modify_success')
          : t('personal_setting.messages.password_set_success'),
      );
      setPasswordModal(defaultPasswordModal);
    } finally {
      setPasswordModal((prev) =>
        prev.open ? { ...prev, submitting: false } : defaultPasswordModal
      );
    }
  };

  return (
    <div className='router-page-stack'>
      <AppSection title={t('personal_setting.section.account_info')}>
        <div className='router-page-stack'>
          <AppField label={t('personal_setting.field.wallet')}>
            <AppInput
              className='router-section-input'
              value={walletAddress}
              readOnly
            />
          </AppField>
          <AppField label={t('personal_setting.field.avatar')}>
            <div className='router-setting-inline-row'>
              {avatarURL ? (
                <img
                  src={avatarURL}
                  alt={t('personal_setting.avatar.alt')}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 6,
                    objectFit: 'cover',
                    border: '1px solid var(--router-border-color, #e5e7eb)',
                  }}
                />
              ) : null}
              <AppInput
                className='router-section-input'
                value={avatarURL || t('personal_setting.unset')}
                readOnly
              />
            </div>
          </AppField>
          <AppField label={t('user.edit.username')}>
            <div className='router-setting-inline-row'>
              <AppInput
                className='router-section-input'
                name='username'
                placeholder={t('user.edit.username_placeholder')}
                value={username}
                readOnly={!isEditingUsername}
                onChange={(e, { value }) => setUsername(value)}
              />
              <div className='router-setting-inline-actions'>
                {isEditingUsername ? (
                  <>
                    <AppButton
                      className='router-section-button'
                      type='button'
                      onClick={cancelUsernameEdit}
                      disabled={profileSubmitting}
                    >
                      {t('common.cancel')}
                    </AppButton>
                    <AppButton
                      className='router-section-button'
                      type='button'
                      color='blue'
                      loading={profileSubmitting}
                      disabled={(username || '').trim() === (currentUser?.username || '').trim()}
                      onClick={submitUsername}
                    >
                      {t('personal_setting.button.save')}
                    </AppButton>
                  </>
                ) : (
                  <AppButton
                    className='router-section-button'
                    type='button'
                    onClick={() => setIsEditingUsername(true)}
                  >
                    {t('personal_setting.button.edit')}
                  </AppButton>
                )}
              </div>
            </div>
          </AppField>
          <AppField label={t('personal_setting.field.email')}>
            <div className='router-setting-inline-row'>
              <AppInput
                className='router-section-input'
                type='email'
                placeholder={t('personal_setting.placeholder.email')}
                value={email}
                readOnly={!isEditingEmail}
                onChange={(e, { value }) => setEmail(value)}
              />
              <div className='router-setting-inline-actions'>
                {isEditingEmail ? (
                  <>
                    <AppButton
                      className='router-section-button'
                      type='button'
                      onClick={cancelEmailEdit}
                      disabled={profileSubmitting}
                    >
                      {t('common.cancel')}
                    </AppButton>
                    <AppButton
                      className='router-section-button'
                      type='button'
                      color='blue'
                      loading={profileSubmitting}
                      disabled={
                        (email || '').trim() === '' ||
                        (email || '').trim() ===
                          (currentUser?.email || '').trim()
                      }
                      onClick={submitEmail}
                    >
                      {t('personal_setting.button.save')}
                    </AppButton>
                  </>
                ) : (
                  <AppButton
                    className='router-section-button'
                    type='button'
                    onClick={() => setIsEditingEmail(true)}
                  >
                    {(currentUser?.email || '').trim()
                      ? t('personal_setting.button.edit')
                      : t('personal_setting.button.set')}
                  </AppButton>
                )}
              </div>
            </div>
          </AppField>
          <AppField label={t('personal_setting.field.password')}>
            <div className='router-setting-inline-row'>
              <AppInput
                className='router-section-input'
                value={hasPassword ? t('personal_setting.set') : t('personal_setting.unset')}
                readOnly
              />
              <div className='router-setting-inline-actions'>
                <AppButton
                  className='router-section-button'
                  type='button'
                  color='blue'
                  onClick={() => openPasswordModal(hasPassword ? 'modify' : 'set')}
                >
                  {hasPassword
                    ? t('personal_setting.button.modify_password')
                    : t('personal_setting.button.set_password')}
                </AppButton>
              </div>
            </div>
          </AppField>
        </div>
      </AppSection>

      <AppSection title={t('personal_setting.section.notification_preferences')}>
        <div className='router-page-stack'>
          <AppField
            label={t('personal_setting.notification.email_low_balance')}
            hint={t('personal_setting.notification.email_low_balance_hint')}
            extra={
              <AppSwitch
                checked={notificationSettings.notify_on_low_balance}
                onChange={(_, { checked }) =>
                  setNotificationSettings((prev) => ({
                    ...prev,
                    notify_on_low_balance: checked === true,
                  }))
                }
              />
            }
          />
          <AppField
            label={t('personal_setting.notification.low_balance_threshold')}
            hint={`${t('personal_setting.notification.low_balance_threshold_hint')} ${t('personal_setting.notification.default_threshold_label', { amount: notificationSettings.default_threshold })}`}
          >
            <AppInputNumber
              fluid
              min={0}
              precision={0}
              disabled={notificationLoading}
              placeholder={t('personal_setting.placeholder.low_balance_threshold')}
              value={
                lowBalanceThresholdInput === '' ? null : Number(lowBalanceThresholdInput)
              }
              onChange={(_, { value }) => {
                if (value === null || value === undefined || value === '') {
                  setLowBalanceThresholdInput('');
                  return;
                }
                setLowBalanceThresholdInput(String(value));
              }}
            />
          </AppField>
          <div className='router-setting-inline-actions'>
            <AppButton
              className='router-section-button'
              type='button'
              color='blue'
              loading={notificationSaving}
              disabled={notificationLoading || notificationSaving}
              onClick={submitNotificationSettings}
            >
              {t('personal_setting.notification.save')}
            </AppButton>
          </div>
        </div>
      </AppSection>

      <AppModal
        size='tiny'
        open={passwordModal.open}
        onClose={closePasswordModal}
        title={
          passwordModal.mode === 'modify'
            ? t('personal_setting.password_modal.modify_title')
            : t('personal_setting.password_modal.set_title')
        }
        footer={[
          <AppButton key='cancel' className='router-modal-button' onClick={closePasswordModal}>
            {t('common.cancel')}
          </AppButton>,
          <AppButton
            key='confirm'
            className='router-modal-button'
            color='blue'
            loading={passwordModal.submitting}
            onClick={submitPassword}
          >
            {passwordModal.mode === 'modify'
              ? t('personal_setting.password_modal.confirm_modify')
              : t('personal_setting.password_modal.confirm_set')}
          </AppButton>,
        ]}
      >
        <div className='router-page-stack'>
          {passwordModal.mode === 'modify' ? (
            <AppFormRow className='router-modal-form-row'>
              <AppField label={t('personal_setting.field.current_password')}>
                <AppInput
                  type='password'
                  value={passwordModal.currentPassword}
                  onChange={(e, { value }) =>
                    updatePasswordModalField('currentPassword', value)
                  }
                  autoComplete='current-password'
                />
              </AppField>
            </AppFormRow>
          ) : null}
          <AppFormRow className='router-modal-form-row'>
            <AppField label={t('personal_setting.field.new_password')}>
              <AppInput
                type='password'
                value={passwordModal.newPassword}
                onChange={(e, { value }) =>
                  updatePasswordModalField('newPassword', value)
                }
                autoComplete='new-password'
              />
            </AppField>
          </AppFormRow>
          <AppFormRow className='router-modal-form-row'>
            <AppField label={t('personal_setting.field.confirm_password')}>
              <AppInput
                type='password'
                value={passwordModal.confirmPassword}
                onChange={(e, { value }) =>
                  updatePasswordModalField('confirmPassword', value)
                }
                autoComplete='new-password'
              />
            </AppField>
          </AppFormRow>
        </div>
      </AppModal>
    </div>
  );
};

export default PersonalSetting;
