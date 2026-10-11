/** Spreadsheet programs run text that starts with = + - @ as a formula. Prefix such cells so they stay text. */
export function sanitizeCsvCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export type CsvCell = string | number | null | undefined;

/** Builds a UTF-8 CSV (with BOM, so Excel shows symbols correctly) ready to download. */
export function buildCsv(headers: string[], rows: CsvCell[][]): Blob {
  const escape = (cell: CsvCell): string => {
    const text =
      cell === null || cell === undefined
        ? ''
        : typeof cell === 'number'
          ? String(cell)
          : sanitizeCsvCell(cell);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = [headers, ...rows].map((row) => row.map(escape).join(','));
  return new Blob([`\uFEFF${lines.join('\r\n')}\r\n`], {
    type: 'text/csv;charset=utf-8',
  });
}
