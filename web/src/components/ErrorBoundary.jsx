import React from 'react';
import { useTranslation } from 'react-i18next';
import { AppButton, AppEmpty } from '../router-ui';

// 兜底 UI 单独抽成函数组件,以便使用 useTranslation;
// 错误发生后重新渲染该组件是安全的(全新一次渲染)。
function ErrorFallback({ error }) {
  const { t } = useTranslation();
  return (
    <div className='router-error-boundary'>
      <AppEmpty
        className='router-error-boundary-empty'
        action={
          <div className='router-error-boundary-actions'>
            <AppButton
              type='primary'
              onClick={() => window.location.reload()}
            >
              {t('error_boundary.reload')}
            </AppButton>
            <AppButton onClick={() => { window.location.href = '/'; }}>
              {t('error_boundary.home')}
            </AppButton>
          </div>
        }
      >
        <div className='router-error-boundary-body'>
          <div className='router-error-boundary-title'>
            {t('error_boundary.title')}
          </div>
          <div className='router-error-boundary-text'>
            {t('error_boundary.description')}
          </div>
          {error?.message ? (
            <div className='router-error-boundary-detail'>{error.message}</div>
          ) : null}
        </div>
      </AppEmpty>
    </div>
  );
}

// 全局渲染错误边界:任意子树渲染期抛错时,兜底为可恢复的整页提示,
// 避免整站白屏。仅捕获渲染错误(不含事件回调/异步,那些仍由 showError 处理)。
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // 保留堆栈到控制台,便于线上排查;不打扰用户。
    console.error('Uncaught render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
