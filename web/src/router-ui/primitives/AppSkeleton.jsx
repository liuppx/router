import React from 'react';
import { Skeleton } from 'antd';

// First-paint loading skeletons, kept behind the router-ui boundary so business
// code never imports antd directly. Prefer these over a blank render or a bare
// "loading" line for the initial load of a page/list.
//
// variant:
//   'text'  (default) - a title + paragraph block, for detail panels.
//   'list'            - stacked full-width bars, for tables / record lists.
//   'cards'           - a responsive grid of card blocks, for card grids.
function AppSkeleton({
  variant = 'text',
  rows = 3,
  count = 6,
  className,
  ...props
}) {
  const rootClassName = ['router-skeleton', className]
    .filter(Boolean)
    .join(' ');

  if (variant === 'list') {
    return (
      <div className={`${rootClassName} router-skeleton-list`} aria-busy='true'>
        {Array.from({ length: count }).map((_, index) => (
          <Skeleton.Input
            key={index}
            active
            block
            className='router-skeleton-row'
          />
        ))}
      </div>
    );
  }

  if (variant === 'cards') {
    return (
      <div className={`${rootClassName} router-skeleton-cards`} aria-busy='true'>
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className='router-skeleton-card'>
            <Skeleton active title paragraph={{ rows: 2 }} {...props} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={rootClassName} aria-busy='true'>
      <Skeleton active title paragraph={{ rows }} {...props} />
    </div>
  );
}

export default AppSkeleton;
