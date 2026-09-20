import React from 'react';
import { useTranslation } from 'react-i18next';
import { copy, showSuccess, showError } from '../helpers';
import { AppButton } from '../router-ui';

// 通用复制按钮:复制 value 到剪贴板并给出 toast 反馈。
// label 缺省时显示「复制」;其余 props 透传给 AppButton(size/color/className 等)。
function CopyButton({ value, label, className = '', ...rest }) {
  const { t } = useTranslation();
  const handleCopy = async () => {
    const text = value == null ? '' : String(value);
    if (!text) return;
    if (await copy(text)) {
      showSuccess(t('common.copy_success'));
    } else {
      showError(t('common.copy_failed'));
    }
  };
  return (
    <AppButton
      className={['router-copy-button', className].filter(Boolean).join(' ')}
      onClick={handleCopy}
      {...rest}
    >
      {label ?? t('common.copy')}
    </AppButton>
  );
}

export default CopyButton;
