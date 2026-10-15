import React, { useState } from 'react'
import {
  Layers, ChevronRight, ChevronDown, SlidersHorizontal,
  CalendarClock, Clock, MapPin, CheckCircle2, PackageOpen, X, AlertTriangle,
} from 'lucide-react'
import type { SkuSummaryRow, SkuLot } from '../lib/api'

// ── Helpers ─────────────────────────────────────────────────────────────────────

const formatDate = (d: string | null | undefined): string => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString()
}

const daysUntil = (d: string | null | undefined): number | null => {
  if (!d) return null
  return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 3600 * 24))
}

const getStatus = (row: SkuSummaryRow): { label: string; color: 'green' | 'yellow' | 'red' } => {
  if (row.is_out) return { label: 'Out of Stock', color: 'red' }
  if (row.is_low) return { label: 'Low Stock', color: 'yellow' }
  return { label: 'Adequate', color: 'green' }
}

// ── FEFO lots panel ────────────────────────────────────────────────────────────

function LotsPanel({ lots, undatedCount }: { lots: SkuLot[]; undatedCount: number }) {
  // First lot that has a real expiry date is the FEFO "issue first" lot
  const firstDated = lots.findIndex((l) => l.expiry_date)

  return (
    <div className="bg-gray-50/70 border-l-2 border-blue-300 py-3 pl-5 pr-4">
      <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        <Clock className="w-3.5 h-3.5" />
        Issue order — FEFO (soonest expiry first)
        {undatedCount > 0 && (
          <span className="text-gray-400 normal-case font-normal tracking-normal">
            · {undatedCount} lot(s) without expiry issued last
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {lots.map((lot, i) => {
          const dte = daysUntil(lot.expiry_date)
          const isFirst = i === firstDated
          return (
            <div
              key={lot.id}
              className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-sm px-3 py-1.5 rounded-md ${
                isFirst ? 'bg-blue-50 ring-1 ring-blue-200' : 'bg-white'
              }`}
            >
              <span className="flex items-center gap-2 min-w-[150px]">
                {isFirst ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Issue 1st
                  </span>
                ) : (
                  <span className="text-xs font-medium text-gray-400">#{i + 1}</span>
                )}
              </span>

              <span className="font-medium text-gray-900">
                {lot.quantity}
                {lot.unit && <span className="ml-1 text-xs font-normal text-gray-400">{lot.unit}</span>}
              </span>

              <span className="flex items-center gap-1 text-gray-600">
                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                {lot.bin_location || 'no bin'}
              </span>

              <span className="text-gray-500">
                Mfg {lot.production_date ? formatDate(lot.production_date) : '—'}
              </span>

              <span className="flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5 text-gray-400" />
                {lot.expiry_date ? (
                  <>
                    <span>{formatDate(lot.expiry_date)}</span>
                    {dte !== null && (
                      <span className={`text-xs ${
                        dte < 0 ? 'text-red-500'
                        : dte <= 7 ? 'text-yellow-600'
                        : 'text-green-600'
                      }`}>
                        {dte > 0 ? `+${dte}d` : `${dte}d`}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-gray-400 italic">no expiry</span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Thresholds modal ───────────────────────────────────────────────────────────

interface SkuSummaryProps {
  skus: SkuSummaryRow[]
  loading: boolean
  canEdit: boolean
  onEditThresholds: (sku: string, min: number | null, max: number | null) => Promise<void> | void
}

function parseNum(s: string): number | null {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

function ThresholdModal({
  row, onClose, onSave,
}: {
  row: SkuSummaryRow
  onClose: () => void
  onSave: (sku: string, min: number | null, max: number | null) => Promise<void>
}) {
  const [minStr, setMinStr] = useState(row.min_threshold != null ? String(row.min_threshold) : '')
  const [maxStr, setMaxStr] = useState(row.max_threshold != null ? String(row.max_threshold) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    const min = parseNum(minStr)
    const max = parseNum(maxStr)
    if (min != null && max != null && max < min) {
      setError('Max must be at least the min')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave(row.sku, min, max)
    } catch (e) {
      setError((e as Error).message || 'Failed to save thresholds')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-blue-600" />
              Thresholds for {row.sku}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Optional — leave blank for SKUs that don't need a min/max.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-4 text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            <span>
              Total on hand: <span className="font-semibold text-gray-900">{row.total_quantity}{row.unit ? ` ${row.unit}` : ''}</span>
            </span>
            <span>{row.lot_count} lot(s)</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Minimum</label>
              <input
                type="number"
                min={0}
                value={minStr}
                onChange={(e) => setMinStr(e.target.value)}
                placeholder="—"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Maximum</label>
              <input
                type="number"
                min={0}
                value={maxStr}
                onChange={(e) => setMaxStr(e.target.value)}
                placeholder="—"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={busy}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Saving…' : 'Save thresholds'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main table ─────────────────────────────────────────────────────────────────

const SkuSummary: React.FC<SkuSummaryProps> = ({ skus, loading, canEdit, onEditThresholds }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<SkuSummaryRow | null>(null)

  const toggle = (sku: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(sku)) next.delete(sku)
      else next.add(sku)
      return next
    })
  }

  const handleSaved = async (sku: string, min: number | null, max: number | null) => {
    await onEditThresholds(sku, min, max)
    setEditing(null)
  }

  if (!loading && skus.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500">
        <PackageOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p className="text-lg font-medium">No SKUs found</p>
        <p className="text-sm mt-1">Add items first — each SKU's total on hand will show up here.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {skus.length} SKU{skus.length === 1 ? '' : 's'} · total on hand across all bins & lots
        </p>
        <span className="text-xs text-gray-400">Click a row to see its lots in FEFO issue order</span>
      </div>

      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8"></th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU / Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">On Hand</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Min / Max</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lots</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Soonest Expiry</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[90px]">Action</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {skus.map((row) => {
            const status = getStatus(row)
            const isOpen = expanded.has(row.sku)
            const soonestDays = daysUntil(row.soonest_expiry)
            return (
              <React.Fragment key={row.sku}>
                <tr
                  className={`hover:bg-gray-50 transition-colors cursor-pointer ${isOpen ? 'bg-blue-50/40' : ''}`}
                  onClick={() => toggle(row.sku)}
                >
                  <td className="px-3 py-3">
                    {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-mono text-sm font-medium text-gray-900">{row.sku}</div>
                    <div className="text-xs text-gray-400">{row.name || '—'}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-semibold">
                    {row.total_quantity}
                    {row.unit && <span className="ml-1 text-xs font-normal text-gray-400">{row.unit}</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {row.min_threshold != null || row.max_threshold != null ? (
                      <span className="text-gray-700 font-medium">
                        {row.min_threshold ?? '—'}
                        <span className="text-gray-400 mx-1">/</span>
                        {row.max_threshold ?? '—'}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs italic">not set</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      status.color === 'green' ? 'bg-green-100 text-green-800'
                      : status.color === 'yellow' ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                    }`}>
                      {status.label}
                    </span>
                    {row.expired && (
                      <span className="ml-2 px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                        Expired
                      </span>
                    )}
                    {row.expiring_soon && (
                      <span className="ml-2 px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">
                        Expiring soon
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    <span className="inline-flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-gray-400" />
                      {row.lot_count}
                      {row.bin_count > 0 && <span className="text-gray-400">· {row.bin_count} bin(s)</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {row.soonest_expiry ? (
                      <div>
                        <div>{formatDate(row.soonest_expiry)}</div>
                        {soonestDays !== null && (
                          <span className={`text-xs ${
                            soonestDays < 0 ? 'text-red-500'
                            : soonestDays <= 7 ? 'text-yellow-600'
                            : 'text-green-600'
                          }`}>
                            {soonestDays > 0 ? `+${soonestDays}d` : `${soonestDays}d`}
                          </span>
                        )}
                      </div>
                    ) : row.undated_count > 0 ? (
                      <span className="text-gray-400 italic">no dated lots</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    {canEdit && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditing(row) }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
                        title="Set min / max thresholds"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        Thresholds
                      </button>
                    )}
                  </td>
                </tr>

                {isOpen && (
                  <tr>
                    <td colSpan={8} className="p-0">
                      <LotsPanel lots={row.lots} undatedCount={row.undated_count} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>

      {editing && (
        <ThresholdModal
          row={editing}
          onClose={() => setEditing(null)}
          onSave={handleSaved}
        />
      )}
    </div>
  )
}

export default SkuSummary
