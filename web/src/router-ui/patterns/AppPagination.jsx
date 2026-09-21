import React from 'react';
import { Pagination } from 'antd';

// AppPagination supports two contracts, chosen by whether `total` is passed:
//
//  1. Legacy (no `total`): callers pass `totalPages` (a page *count*) and the
//     component assumes 10 rows/page with the size changer disabled — the exact
//     behaviour every existing call site relies on. Untouched.
//
//  2. Extended (`total` given): callers pass the real row `total` plus a
//     `pageSize`, and the size changer turns on (10/20/50 by default) so the
//     operator can widen the page. `onChange(page, pageSize)` fires on both page
//     and page-size changes; `onPageChange(null, { activePage, pageSize })` is
//     kept for the older Semantic-style callers.
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_PAGE_SIZE_OPTIONS = ['10', '20', '50'];

function AppPagination({
  className = '',
  activePage,
  current,
  totalPages,
  total,
  pageSize,
  showSizeChanger,
  pageSizeOptions,
  onPageChange,
  onChange,
  ...props
}) {
  const resolvedCurrent = Number(current || activePage || 1) || 1;
  const resolvedPageSize = Number(pageSize) > 0 ? Number(pageSize) : DEFAULT_PAGE_SIZE;
  const hasRealTotal = total !== undefined && total !== null;
  const resolvedTotal = hasRealTotal
    ? Number(total) || 0
    : (Number(totalPages || 1) || 1) * resolvedPageSize;
  const resolvedShowSizeChanger =
    showSizeChanger !== undefined ? showSizeChanger : hasRealTotal;
  const nextClassName = ['router-ui-pagination', className]
    .filter(Boolean)
    .join(' ');

  const handleChange = (page, size) => {
    if (typeof onChange === 'function') {
      onChange(page, size);
    }
    if (typeof onPageChange === 'function') {
      onPageChange(null, { activePage: page, pageSize: size });
    }
  };

  return (
    <Pagination
      {...props}
      className={nextClassName}
      current={resolvedCurrent}
      total={resolvedTotal}
      pageSize={resolvedPageSize}
      showSizeChanger={resolvedShowSizeChanger}
      pageSizeOptions={
        resolvedShowSizeChanger
          ? pageSizeOptions || DEFAULT_PAGE_SIZE_OPTIONS
          : undefined
      }
      onChange={handleChange}
    />
  );
}

export default AppPagination;
