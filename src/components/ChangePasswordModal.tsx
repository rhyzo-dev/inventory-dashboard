import React, { useState } from 'react'
import { KeyRound, X, AlertTriangle } from 'lucide-react'
import { changePassword } from '../lib/api'

interface ChangePasswordModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  onError: (msg: string) => void
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose, onSuccess, onError }) => {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const reset = () => {
    setCurrent(''); setNext(''); setConfirm(''); setError(null); setBusy(false)
  }

  const handleCancel = () => { reset(); onClose() }

  const handleSave = async () => {
    setError(null)
    if (!current || !next || !confirm) {
      setError('Please fill in all fields')
      return
    }
    if (next.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }
    if (next === current) {
      setError('New password must be different from the current one')
      return
    }
    if (next !== confirm) {
      setError('New password and confirmation do not match')
      return
    }
    setBusy(true)
    try {
      await changePassword(current, next)
      reset()
      onSuccess()
      onClose()
    } catch (e) {
      setError((e as Error).message || 'Password change failed')
      setBusy(false)
    }
  }

  const field =
    'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/50" onClick={handleCancel} />
      <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-600" />
              Change your password
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Use the new password the next time you sign in.
            </p>
          </div>
          <button onClick={handleCancel} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              className={field}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              className={field}
            />
            <p className="text-xs text-gray-400 mt-1">
              At least 8 characters, with a letter and a number.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className={field}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={busy}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Saving…' : 'Update password'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChangePasswordModal
