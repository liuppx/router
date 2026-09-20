import React from 'react';
import AppButton from '../primitives/AppButton';

// Retryable error state, the "load failed" counterpart to AppEmpty's "no data".
// Keep the two visually and semantically distinct: AppEmpty means the request
// succeeded but returned nothing; AppErrorState means the request failed and the
// user can retry. Presentational only (no i18n) — pass already-translated text.
//
// Props:
//   message   - the error text (e.g. t('common.load_failed'))
//   onRetry   - optional; when provided, renders a retry button
//   retryText - retry button label (e.g. t('common.retry'))
function AppErrorState({ className = '', message, onRetry, retryText, children }) {
  const nextClassName = ['router-empty-cell', 'router-error-state', className]
    .filter(Boolean)
    .join(' ');
  const content = children || message;
  if (!onRetry) {
    return <div className={nextClassName}>{content}</div>;
  }
  return (
    <div className={nextClassName}>
      <div className='router-empty-cta'>
        <div className='router-empty-cta-text'>{content}</div>
        <div className='router-empty-cta-action'>
          <AppButton basic onClick={onRetry}>
            {retryText}
          </AppButton>
        </div>
      </div>
    </div>
  );
}

export default AppErrorState;
