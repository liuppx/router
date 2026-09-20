import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import usageDocHtml from '../../assets/help/usage.html?raw';
import { AppFilterHeader } from '../../router-ui';
import useCopyableCodeBlocks from './useCopyableCodeBlocks';
import './HelpDoc.css';

// 指南里的 API Base URL 统一指向当前部署 origin,与令牌页(EditToken)一致,
// 避免复制到写死的示例域名后指向错误的服务。
const API_BASE = typeof window !== 'undefined' ? window.location.origin : '';

const HelpDoc = () => {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const html = useMemo(() => {
    return usageDocHtml
      .replaceAll('CLI 工具使用文档', t('header.cli_guide'))
      .replaceAll('https://api.hanbbq.top', API_BASE)
      .replaceAll('https://router.yeying.pub', API_BASE)
      .replace(
        /<p class="hero-subtitle"[^>]*>\s*API BaseURL（CF节点）：[^<]*<\/p>/g,
        '',
      )
      .replace(
        /<p class="hero-subtitle"[^>]*>\s*如果第一个节点无法使用就换另外一个CF节点\s*<\/p>/g,
        '',
      )
      .replace(
        /<pre><code class="language-[^"]*">([\s\S]*?)<\/code><\/pre>/g,
        (block, code) => {
          const normalizedCode = String(code || '');
          if (
            !/your-api-key-here|CCH_API_KEY|OPENAI_API_KEY|ANTHROPIC_AUTH_TOKEN|GOOGLE_API_KEY|REPLACE_WITH_RANDOM_TOKEN|\"token\":/i.test(
              normalizedCode,
            )
          ) {
            return block;
          }
          return `${block}<div class="router-help-doc-token-tip">需要令牌？<a href="/workspace/token">获取</a></div>`;
        },
      );
  }, [t]);

  useCopyableCodeBlocks(containerRef, [html]);

  return (
    <div className='dashboard-container'>
      <AppFilterHeader
        breadcrumbs={[
          { key: 'workspace', label: t('header.user_workspace') },
          { key: 'help', label: t('header.help') },
          { key: 'cli-guide', label: t('header.cli_guide'), active: true },
        ]}
        title={t('header.cli_guide')}
      />
      <div
        ref={containerRef}
        className='router-help-doc-page'
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};

export default HelpDoc;
