// CSV export helpers. The browser does not have a native CSV encoder, so we
// hand-roll one with the two things every spreadsheet (Excel / Numbers /
// Sheets / LibreOffice) needs to round-trip correctly:
//   - UTF-8 BOM prefix (so Excel does not silently fall back to GBK)
//   - Double-quote every field that contains a quote, comma, newline or
//     leading/trailing whitespace; double the quotes inside the field
// We expose two surfaces:
//   - buildCSV(columns, rows): returns the CSV string. columns is an array
//     of { key, label, format? } so the caller can localize labels and
//     pick a per-column formatter (currency, percent, timestamp).
//   - downloadCSV(filename, csv): triggers a browser download via Blob +
//     a transient anchor element. No external deps.

const NEEDS_QUOTE = /[",\n\r]/;

const encodeField = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (!NEEDS_QUOTE.test(str) && str.trim() === str) return str;
  return `"${str.replace(/"/g, '""')}"`;
};

const formatCell = (cell, formatter) => {
  if (formatter && cell !== null && cell !== undefined) {
    return formatter(cell);
  }
  return cell;
};

export const buildCSV = (columns, rows) => {
  const header = columns.map((col) => encodeField(col.label || col.key)).join(',');
  const body = rows
    .map((row) =>
      columns
        .map((col) => encodeField(formatCell(row?.[col.key], col.format)))
        .join(','),
    )
    .join('\n');
  return `${header}\n${body}`;
};

export const downloadCSV = (filename, csv) => {
  if (typeof document === 'undefined') return;
  // BOM keeps Excel from mis-decoding UTF-8 as GBK; the BOM is a no-op for
  // every other consumer (Numbers / Sheets / LibreOffice strip it).
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const exportCSV = (filename, columns, rows) => {
  downloadCSV(filename, buildCSV(columns, rows));
};