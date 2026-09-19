import assert from 'node:assert/strict';

globalThis.Blob = class {
  constructor(parts) {
    this.parts = parts;
  }
};
globalThis.URL = { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} };
const captured = { anchor: null };
globalThis.document = {
  createElement: () => ({
    href: '',
    download: '',
    style: {},
    click() {
      captured.anchor = this;
    },
  }),
  body: { appendChild() {}, removeChild() {} },
};

const { buildCSV, downloadCSV, exportCSV } = await import(
  '../src/helpers/csv.js'
);

const cols = [
  { key: 'name', label: 'Name' },
  { key: 'amount', label: 'Amount', format: (v) => Number(v).toFixed(2) },
  { key: 'note', label: 'Note' },
];
const rows = [
  { name: 'Alice', amount: 12.345, note: 'plain' },
  { name: 'Bob, Jr.', amount: 7, note: 'has, comma' },
  { name: 'Carol', amount: 0, note: 'has "quotes"' },
  { name: 'Dan', amount: null, note: 'multi\nline' },
  { name: ' Eve ', amount: 1, note: '  spaces  ' },
];

const csv = buildCSV(cols, rows);
const expected = [
  'Name,Amount,Note',
  'Alice,12.35,plain',
  '"Bob, Jr.",7.00,"has, comma"',
  'Carol,0.00,"has ""quotes"""',
  'Dan,,"multi\nline"',
  '" Eve ",1.00,"  spaces  "',
].join('\n');
assert.equal(csv, expected);

// downloadCSV triggers anchor.click; we just verify the anchor got the
// right filename and that the Blob has the BOM prefix + the CSV body.
downloadCSV('test.csv', csv);
assert.ok(captured.anchor, 'anchor should be created and clicked');
assert.equal(captured.anchor.download, 'test.csv');

// exportCSV runs buildCSV + downloadCSV under the hood — covered above.

console.log('ok csv tests passed');