import React from 'react';
import LogsTable from '../../components/LogsTable';

// 日志页 = 逐条查请求。路由异常排名(按 model/channel/endpoint/error 聚合的失败排名)
// 原先内联在此页顶部,现已抽成自包含 section 归位到值班台(排障信号收敛到一个入口),
// 故此页只保留原始调用日志表;管理端 / 个人端由 LogsTable 内部按 scope 自行区分。
const Log = ({ embedded = false }) => {
  return (
    <div className={`log-page${embedded ? ' log-page-embedded' : ' dashboard-container'}`}>
      <LogsTable />
    </div>
  );
};

export default Log;
