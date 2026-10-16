import React, { useRef, useState } from 'react'
import {
  X, Upload, Download, Loader2, CheckCircle2, TriangleAlert, FileWarning,
} from 'lucide-react'
import { parseImportFile, downloadTemplate, type ImportRow } from '../lib/import'
import { importInventory, type ImportPlanRow, type ImportResult } from '../lib/api'

interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
  /** Called after a successful commit so the parent can refresh its data. */
  onSuccess: () => void
  onError: (msg: string) => void
}

type Phase = 'idle' | 'preview' | 'done'

const StatusBadge: React.FC<{ status: ImportPlanRow['status'] }> = ({ status }) => {
  if (status === 'create') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Will add</span>
  if (status === 'skip_duplicate') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Duplicate — skip</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Error</span>
}

export const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onSuccess, onError }) => {
  const [rows, setRows] = useState<ImportRow[]>([])
  const [plan, setPlan] = useState<ImportPlanRow[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [finalResult, setFinalResult] = useState<ImportResult | null>(null)
  const [onlyProblems, setOnlyProblems] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const summary = plan
    ? {
        create: plan.filter(p => p.status === 'create').length,
        skip: plan.filter(p => p.status === 'skip_duplicate').length,
        error: plan.filter(p => p.status === 'error').length,
      }
    : null

  // Rows that did NOT import (duplicates or validation errors), paired with their
  // real spreadsheet row number so the user can find them in their own file.
  const problemRows = plan ? plan.filter(p => p.status !== 'create') : []
  const rowNum = (p: ImportPlanRow) => rows[p.index]?.rowNum ?? (p.index + 1)

  const reset = () => {
    setRows([]); setPlan(null); setFileName(''); setError(null); setPhase('idle'); setFinalResult(null); setOnlyProblems(false)
  }
  const close = () => { reset(); onClose() }

  const runPreview = async (file: File) => {
    setBusy(true); setError(null); setPhase('idle')
    try {
      const parsed = await parseImportFile(file)
      if (parsed.length === 0) {
        setError('No data rows found in that file. Check the header row and make sure there is at least one item.')
        setBusy(false)
        return
      }
      setRows(parsed)
      setFileName(file.name)
      const result = await importInventory(parsed as unknown as Record<string, unknown>[], true)
      setPlan(result.results || [])
      setPhase('preview')
    } catch (e: any) {
      setError(e.message || 'Could not read that file. Is it a valid .xlsx or .csv?')
    } finally {
      setBusy(false)
    }
  }

  const commit = async () => {
    if (!summary || summary.create === 0) return
    setBusy(true); setError(null)
    try {
      const result = await importInventory(rows as unknown as Record<string, unknown>[], false)
      setFinalResult(result)
      setPhase('done')
      onSuccess()
    } catch (e: any) {
      setError(e.message || 'Import failed. Try again.')
      onError(e.message || 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) runPreview(f)
    e.target.value = ''
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !busy && close()} />

      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-gray-900">Import items from a spreadsheet</h2>
          <button onClick={() => !busy && close()} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* ── Idle: pick a file / grab a template ── */}
          {phase === 'idle' && (
            <>
              <p className="text-sm text-gray-600">
                Download the template, fill in your items, then upload the finished
                <span className="font-medium text-gray-800"> .xlsx</span> or{' '}
                <span className="font-medium text-gray-800">.csv</span>. Only <span className="font-medium">SKU</span> and{' '}
                <span className="font-medium">Name</span> are required.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => downloadTemplate('xlsx')}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Download className="w-4 h-4" /> Template (Excel)
                </button>
                <button
                  onClick={() => downloadTemplate('csv')}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Download className="w-4 h-4" /> Template (CSV)
                </button>
              </div>

              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onPick} className="hidden" />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg py-8 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50"
              >
                {busy ? (
                  <><Loader2 className="w-6 h-6 animate-spin" /><span className="text-sm font-medium">Reading file…</span></>
                ) : (
                  <><Upload className="w-6 h-6" /><span className="text-sm font-medium">Choose an .xlsx or .csv file to preview</span></>
                )}
              </button>

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  <FileWarning className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </>
          )}

          {/* ── Preview: per-row plan + commit ── */}
          {phase === 'preview' && plan && summary && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-600 truncate">{fileName}</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {summary.create} to add
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                  <TriangleAlert className="w-3.5 h-3.5" /> {summary.skip} duplicate{summary.skip === 1 ? '' : 's'}
                </span>
                {summary.error > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-medium">
                    <FileWarning className="w-3.5 h-3.5" /> {summary.error} error{summary.error === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-500">
                Duplicates (same SKU + bin + production + expiry) are skipped, never overwritten.
                Re-running this file is safe.
              </p>

              {problemRows.length > 0 && (
                <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                  <input type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)} className="accent-blue-600" />
                  Show only skipped / errored rows ({problemRows.length})
                </label>
              )}

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left w-12">Row</th>
                        <th className="px-3 py-2 text-left">SKU</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-left">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(onlyProblems ? problemRows : plan).map(p => (
                        <tr key={p.index} className={p.status === 'error' ? 'bg-red-50' : p.status === 'skip_duplicate' ? 'bg-amber-50' : ''}>
                          <td className="px-3 py-2 text-gray-400 tabular-nums">{rowNum(p)}</td>
                          <td className="px-3 py-2 font-medium text-gray-800">{p.sku}</td>
                          <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                          <td className="px-3 py-2 text-gray-600">{p.reason || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  <FileWarning className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <button onClick={() => setPhase('idle')} className="text-sm text-gray-500 hover:text-gray-700">
                  Start over
                </button>
                <button
                  onClick={commit}
                  disabled={busy || summary.create === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {busy ? 'Importing…' : `Import ${summary.create} item${summary.create === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          )}

          {/* ── Done ── */}
          {phase === 'done' && finalResult && (
            <div className="text-center py-6">
              <div className="w-12 h-12 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
              <p className="mt-4 text-lg font-semibold text-gray-900">{finalResult.message}</p>
              <p className="mt-1 text-sm text-gray-500">
                {finalResult.created ?? 0} added · {finalResult.skipped ?? 0} skipped · {finalResult.errors ?? 0} errors
              </p>

              {problemRows.length > 0 && (
                <div className="mt-5 mx-auto max-w-md text-left">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    {problemRows.length} row{problemRows.length === 1 ? '' : 's'} not imported — fix these in your sheet, then re-run:
                  </p>
                  <ul className="max-h-48 overflow-y-auto space-y-1.5 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                    {problemRows.map(p => (
                      <li key={p.index} className="leading-snug">
                        <span className="font-mono text-gray-400">Row {rowNum(p)}</span>
                        <span className="font-medium text-gray-800"> · {p.sku}</span>
                        <span className="text-gray-600"> — {p.reason || (p.status === 'skip_duplicate' ? 'Duplicate — same lot already in the list' : 'Invalid')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                onClick={close}
                className="mt-6 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
