import React from 'react';
import TokensTable from '../../components/TokensTable';

// 全站令牌管理页:复用 TokensTable 的 admin 模式,跨用户列表 + 改额度/过期/模型、
// 启用/禁用、删除。新建令牌不在本页范围内(仅由用户自助创建)。
const AdminTokens = () => {
  return (
    <div className='dashboard-container'>
      <TokensTable admin />
    </div>
  );
};

export default AdminTokens;
