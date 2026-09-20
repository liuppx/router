import React from 'react';

function AppEmpty({ className = '', children, action }) {
  const nextClassName = ['router-empty-cell', className].filter(Boolean).join(' ');
  if (!action) {
    return <div className={nextClassName}>{children}</div>;
  }
  return (
    <div className={nextClassName}>
      <div className='router-empty-cta'>
        <div className='router-empty-cta-text'>{children}</div>
        <div className='router-empty-cta-action'>{action}</div>
      </div>
    </div>
  );
}

export default AppEmpty;
