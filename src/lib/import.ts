/**
 * Client-side bulk-import helpers.
 *
 * Spreadsheets are parsed in the browser (SheetJS) and posted to /api/import as
 * plain JSON rows — that keeps the messy xlsx/csv handling off the Cloudflare
 * runtime. The same COLUMNS drive both the downloadable template and the header
 * matching, so the template and the parser can never drift apart.
 */
import * as XLSX from 'xlsx'

export interface ImportRow {
  sku: string
  name: string
  specification: string
  category: string
  unit: string
  quantity: string | number
  min_threshold: string | number
  max_threshold: string | number
  bin_location: string
  production_date: string
  expiry_date: string
  description: string
}

interface ColumnDef {
  key: keyof ImportRow
  label: string
  example: string
  required?: boolean
  hint?: string
}

/** Ordered template columns. `label` is what the user sees and matches on upload. */
export const COLUMNS: ColumnDef[] = [
  { key: 'sku', label: 'SKU', example: 'LUB-001', required: true, hint: 'Alphanumeric, max 50' },
  { key: 'name', label: 'Name', example: 'Hydraulic Oil', required: true },
  { key: 'specification', label: 'Specification', example: 'ISO 46' },
  { key: 'category', label: 'Category', example: 'Lubricants' },
  { key: 'unit', label: 'Unit', example: 'L', hint: 'Must match a managed unit (pc, kg, L, …)' },
  { key: 'quantity', label: 'Quantity', example: '120' },
  { key: 'min_threshold', label: 'Min Threshold', example: '20' },
  { key: 'max_threshold', label: 'Max Threshold', example: '300' },
  { key: 'bin_location', label: 'Bin Location', example: 'A-3-12' },
  { key: 'production_date', label: 'Production Date', example: '2025-01-01', hint: 'YYYY-MM-DD or blank' },
  { key: 'expiry_date', label: 'Expiry Date', example: '2027-01-01', hint: 'YYYY-MM-DD or blank' },
  { key: 'description', label: 'Description', example: 'Bulk lubricant' },
]

// Map the friendly labels (and common spreadsheet / export headers) to a field.
const HEADER_ALIASES: Record<string, keyof ImportRow> = {
  sku: 'sku', 'item code': 'sku', 'item code (sku)': 'sku', 'itemcode': 'sku', 'item code(sku)': 'sku', code: 'sku',
  name: 'name', 'item name': 'name',
  specification: 'specification', spec: 'specification', specs: 'specification',
  category: 'category',
  unit: 'unit', 'unit of measure': 'unit', 'uom': 'unit',
  quantity: 'quantity', 'current quantity': 'quantity', 'current qty': 'quantity', qty: 'quantity',
  'min threshold': 'min_threshold', min: 'min_threshold', 'minimum': 'min_threshold',
  'max threshold': 'max_threshold', max: 'max_threshold', 'maximum': 'max_threshold',
  'bin location': 'bin_location', location: 'bin_location', bin: 'bin_location',
  'production date': 'production_date', 'manufacturing date': 'production_date', 'mfg date': 'production_date',
  'expiry date': 'expiry_date', 'expiration date': 'expiry_date', 'exp date': 'expiry_date', 'expiry': 'expiry_date',
  description: 'description', notes: 'description', remarks: 'description',
}

function keyFromHeader(header: unknown): keyof ImportRow | null {
  const norm = String(header ?? '').trim().toLowerCase()
  if (HEADER_ALIASES[norm]) return HEADER_ALIASES[norm]
  // Fall back to an exact field-name match ("sku", "bin_location", …).
  if ((COLUMNS as { key: keyof ImportRow }[]).some(c => c.key === norm)) return norm as keyof ImportRow
  return null
}

/** Convert a cell to a YYYY-MM-DD string (or '' ). Works for Date, ISO text, or serial. */
function cellToYmd(v: unknown): string {
  if (v == null || v === '') return ''
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return ''
    return v.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return s
}

function isBlankRow(row: ImportRow): boolean {
  return Object.values(row).every(v => String(v ?? '').trim() === '')
}

/** Parse an uploaded .xlsx / .csv into clean ImportRows (blank rows dropped). */
export async function parseImportFile(file: File): Promise<ImportRow[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', raw: true, cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('No readable sheet found in that file')
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: true })

  const rows: ImportRow[] = []
  for (const rec of records) {
    const out: Record<string, string | number> = {
      sku: '', name: '', specification: '', category: '', unit: '',
      quantity: '', min_threshold: '', max_threshold: '',
      bin_location: '', production_date: '', expiry_date: '', description: '',
    }
    for (const [header, value] of Object.entries(rec)) {
      const key = keyFromHeader(header)
      if (!key) continue
      if (key === 'production_date' || key === 'expiry_date') {
        out[key] = cellToYmd(value)
      } else if (key === 'quantity' || key === 'min_threshold' || key === 'max_threshold') {
        // Numbers pass through as numbers; text/empty stay as strings.
        out[key] = value === '' ? '' : (typeof value === 'number' ? value : String(value).trim())
      } else {
        out[key] = String(value ?? '').trim()
      }
    }
    const row = out as unknown as ImportRow
    if (!isBlankRow(row)) rows.push(row)
  }
  return rows
}

// ── Template download ──────────────────────────────────────────────────────────

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function csvEscape(v: string): string {
  const needs = /[",\n\r]/.test(v)
  return needs ? `"${v.replace(/"/g, '""')}"` : v
}

/** Download a blank import template (one example row, friendly headers). */
export function downloadTemplate(format: 'csv' | 'xlsx') {
  const headers = COLUMNS.map(c => c.label)
  const example = COLUMNS.map(c => c.example)

  if (format === 'csv') {
    const lines = [headers, example].map(cols => cols.map(csvEscape).join(',')).join('\r\n')
    triggerBlobDownload(new Blob([lines + '\r\n'], { type: 'text/csv;charset=utf-8' }), 'inventory-import-template.csv')
    return
  }

  const aoa: (string)[][] = [headers, example]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = COLUMNS.map(c => ({ wch: Math.max(c.label.length, c.example.length, 12) }))
  ws['!views'] = [{ state: 'frozen', ySplit: 1 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Import')
  XLSX.writeFile(wb, 'inventory-import-template.xlsx')
}
