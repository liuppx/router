import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { copy, showSuccess, showError } from '../../helpers';

const COPY_BTN_CLASS = 'router-doc-copy-btn';

// 指南页渲染后,为每个 <pre> 代码块的右上角注入「复制」按钮。
// CLI 指南(dangerouslySetInnerHTML 注入的静态 HTML)与 Router 指南(静态 JSX)
// 共用此逻辑。两处的 <pre>/<code> 元素在生命周期内位置稳定、不会被条件卸载或
// 替换,React 只会原地更新其文本,故以尾部追加的方式注入原生按钮是安全的;
// 依赖变化(如语言切换、动态 Base URL 注入完成)时先清理旧按钮再重建。
export default function useCopyableCodeBlocks(containerRef, deps = []) {
  const { t } = useTranslation();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const cleanups = [];
    const blocks = container.querySelectorAll('pre');
    blocks.forEach((pre) => {
      // 幂等:重跑时先移除已存在的按钮
      const existing = pre.querySelector(`.${COPY_BTN_CLASS}`);
      if (existing) existing.remove();

      const codeEl = pre.querySelector('code') || pre;
      const codeText = codeEl.textContent || '';
      if (!codeText.trim()) return;

      pre.classList.add('router-doc-pre');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = COPY_BTN_CLASS;
      btn.textContent = t('common.copy');
      const onClick = async (event) => {
        event.preventDefault();
        if (await copy(codeText)) {
          showSuccess(t('common.copy_success'));
        } else {
          showError(t('common.copy_failed'));
        }
      };
      btn.addEventListener('click', onClick);
      pre.appendChild(btn);
      cleanups.push(() => {
        btn.removeEventListener('click', onClick);
        btn.remove();
      });
    });

    return () => {
      cleanups.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, t, ...deps]);
}
