import React from 'react';
import { useTranslation } from 'react-i18next';
import { copy, showSuccess, showError } from '../helpers';
import { AppButton, AppIcon, AppTooltip } from '../router-ui';

// 通用复制按钮:复制 value 到剪贴板并给出 toast 反馈。
// label 缺省时显示「复制」;其余 props 透传给 AppButton(size/color/className 等)。
function CopyButton({ value, label, className = '', iconOnly = false, ...rest }) {
  const { t } = useTranslation();
  const buttonLabel = label ?? t('common.copy');
  const handleCopy = async () => {
    const text = value == null ? '' : String(value);
    if (!text) return;
    if (await copy(text)) {
      showSuccess(t('common.copy_success'));
    } else {
      showError(t('common.copy_failed'));
    }
  };
  if (iconOnly) {
    return (
      <AppTooltip title={buttonLabel}>
        <AppButton
          type='button'
          aria-label={buttonLabel}
          className={['router-copy-icon-button', className]
            .filter(Boolean)
            .join(' ')}
          icon={<AppIcon name='copy outline' />}
          onClick={handleCopy}
          {...rest}
        />
      </AppTooltip>
    );
  }
  return (
    <AppButton
      className={['router-copy-button', className].filter(Boolean).join(' ')}
      onClick={handleCopy}
      {...rest}
    >
      {buttonLabel}
    </AppButton>
  );
}

export default CopyButton;
