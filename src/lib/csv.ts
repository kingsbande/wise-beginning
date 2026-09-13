// Plain CSV export — no library needed. Opens directly in Excel,
// Google Sheets, or anything else that reads CSV. If true .xlsx
// (native Excel format, multiple sheets, formatting) is ever
// needed, that's a real dependency (e.g. the `xlsx` package) — CSV
// covers the "export a table of numbers" case without adding one.

function escapeCsvCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const lines = [headers, ...rows].map((row) =>
    row.map((cell) => escapeCsvCell(String(cell))).join(','),
  )
  const csvContent = lines.join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
