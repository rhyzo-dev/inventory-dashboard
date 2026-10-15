import React, { useState, useEffect, useRef } from 'react'
import { X, Save, Loader2, Trash2, AlertTriangle } from 'lucide-react'
import { updateItem, createItem, removeImage, findDuplicates, DuplicateItemError, type UpdateItemInput, type CreateItemInput } from '../lib/api'

interface EditModalProps {
  isOpen: boolean
  onClose: () => void
  item?: any
  /** Called after a successful save with the item's id, so the list can flash it. */
  onSuccess: (id?: string) => void
  onError: (msg: string) => void
  categories?: { name: string; color: string }[]
  units?: { id: string; name: string }[]
}

const emptyForm = {
  sku: '',
  name: '',
  description: '',
  category: '',
  unit: '',
  quantity: 0,
  min_threshold: 0,
  max_threshold: 100,
  bin_location: '',
  production_date: '',
  expiry_date: '',
  specification: '',
}

export const EditModal: React.FC<EditModalProps> = ({ isOpen, onClose, item, onSuccess, onError, categories, units }) => {
  const isEdit = !!item
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [imagePreview, setImagePreview] = useState<string | null>(item?.image_url ?? null)
  const [removingImage, setRemovingImage] = useState(false)

  // Duplicate detection (Add mode only). `dupMatches` lists existing lots that
  // collide on all six identity fields; save is blocked until the editor either
  // changes a field or ticks "add anyway" (`allowDuplicate`).
  const [dupMatches, setDupMatches] = useState<any[]>([])
  const [checkingDup, setCheckingDup] = useState(false)
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const dupQuery = useRef<{ sku: string; name: string; bin: string; spec: string; prod: string; exp: string } | null>(null)

  useEffect(() => {
    if (item) {
      setForm({
        sku: item.sku || '',
        name: item.name || '',
        description: item.description || '',
        category: item.category || '',
        unit: item.unit || '',
        quantity: item.quantity ?? 0,
        min_threshold: item.min_threshold ?? 0,
        max_threshold: item.max_threshold ?? 100,
        bin_location: item.bin_location || '',
        production_date: item.production_date || '',
        expiry_date: item.expiry_date || '',
        specification: item.specification || '',
      })
      setImagePreview(item.image_url ?? null)
    } else {
      setForm(emptyForm)
      setImagePreview(null)
    }
    setErrors({})
    setRemovingImage(false)
    setDupMatches([])
    setCheckingDup(false)
    setAllowDuplicate(false)
    dupQuery.current = null
  }, [item, isOpen])

  // Live duplicate pre-check (Add mode): debounce on the six identity fields so
  // the warning appears as the editor types, not only at submit. A failed or
  // in-flight check never blocks the form — the authoritative guard is the
  // server-side 409 on the create call.
  useEffect(() => {
    if (isEdit || !isOpen) return
    const key = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      bin: form.bin_location.trim(),
      spec: form.specification.trim(),
      prod: form.production_date,
      exp: form.expiry_date,
    }
    if (!key.sku || !key.name) {
      setDupMatches([])
      setCheckingDup(false)
      setAllowDuplicate(false)
      dupQuery.current = null
      return
    }
    dupQuery.current = key
    setCheckingDup(true)
    const handle = window.setTimeout(async () => {
      const matches = await findDuplicates({
        sku: key.sku,
        name: key.name,
        bin_location: key.bin || undefined,
        specification: key.spec || undefined,
        production_date: key.prod || undefined,
        expiry_date: key.exp || undefined,
      })
      // Ignore a stale response: the fields changed again while we were waiting.
      if (!dupQuery.current || JSON.stringify(dupQuery.current) !== JSON.stringify(key)) return
      setDupMatches(matches)
      setCheckingDup(false)
      // Reset the override whenever the identity changes — it only ever applied
      // to the exact lot the editor saw when they ticked it.
      setAllowDuplicate(false)
    }, 350)
    return () => window.clearTimeout(handle)
  }, [form.sku, form.name, form.bin_location, form.specification, form.production_date, form.expiry_date, isOpen, isEdit])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setForm(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value,
    }))
    if (errors[name]) {
      setErrors(prev => { const n = { ...prev }; delete n[name]; return n })
    }
  }

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!form.sku.trim()) errs.sku = 'SKU is required'
    else if (!/^[a-zA-Z0-9\-_]{1,50}$/.test(form.sku)) errs.sku = 'SKU: alphanumeric only, max 50 chars'
    if (!form.name.trim()) errs.name = 'Name is required'
    if (form.expiry_date && isNaN(Date.parse(form.expiry_date))) errs.expiry_date = 'Invalid date'
    if (form.production_date && isNaN(Date.parse(form.production_date))) errs.production_date = 'Invalid date'
    if (form.min_threshold > form.max_threshold) errs.max_threshold = 'Must be >= min threshold'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleRemoveImage = async () => {
    if (!item?.id) return
    setRemovingImage(true)
    try {
      await removeImage(item.id)
      setImagePreview(null)
    } catch (e: any) {
      onError(e.message || 'Failed to remove image')
    } finally {
      setRemovingImage(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    // Duplicate gate (create only): if we already know this collides with an
    // existing lot and the editor hasn't opted to override, stop here. The amber
    // banner explains why and offers "add anyway".
    if (!isEdit && dupMatches.length > 0 && !allowDuplicate) {
      return
    }

    setSaving(true)
    let savedId: string | undefined
    try {
      if (isEdit) {
        const updateData: UpdateItemInput = {
          sku: form.sku.trim(),
          name: form.name.trim(),
          description: form.description || null,
          category: form.category || null,
          unit: form.unit || null,
          quantity: form.quantity,
          min_threshold: form.min_threshold,
          max_threshold: form.max_threshold,
          bin_location: form.bin_location || null,
          production_date: form.production_date || null,
          expiry_date: form.expiry_date || null,
          specification: form.specification || null,
          // Preserve existing image_url if not being changed
          image_url: imagePreview,
        }
        await updateItem(item.id, updateData)
        savedId = item.id
      } else {
        const createData: CreateItemInput = {
          sku: form.sku.trim(),
          name: form.name.trim(),
          description: form.description || undefined,
          category: form.category || undefined,
          unit: form.unit || undefined,
          quantity: form.quantity,
          min_threshold: form.min_threshold,
          max_threshold: form.max_threshold,
          bin_location: form.bin_location || undefined,
          production_date: form.production_date || undefined,
          expiry_date: form.expiry_date || undefined,
          specification: form.specification || undefined,
          image_url: imagePreview || undefined,
          // Only send when the editor explicitly overrode the guard.
          allow_duplicate: allowDuplicate || undefined,
        }
        const res = await createItem(createData)
        savedId = res.id
      }
      onSuccess(savedId)
      onClose()
    } catch (err: any) {
      // 409 = the server found the duplicate (the live pre-check was stale, or
      // another tab added it first). Surface it via the banner, not a generic toast.
      if (err instanceof DuplicateItemError) {
        setDupMatches(err.matches)
        setAllowDuplicate(false)
      } else {
        onError(err.message || 'Save failed')
      }
    } finally {
      setSaving(false)
    }
  }

  // Build category options from API data (fallback to empty)
  const categoryOptions = categories?.map(c => c.name) || []

  // Strict unit dropdown options. If the item carries a unit value that isn't in
  // the managed list (e.g. a legacy free-text value or a deleted unit), surface it
  // as an extra option so it isn't silently lost on save.
  const unitOptions = units?.map(u => u.name) || []
  const legacyUnit = form.unit && !unitOptions.includes(form.unit) ? form.unit : null

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? `Edit Item #${item?.id.slice(0, 8)}` : 'Add New Item'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Image preview area */}
        {imagePreview && (
          <div className="px-6 pt-4">
            <div className="relative inline-block group/img">
              <img
                src={imagePreview}
                alt="Item photo"
                className="w-24 h-24 rounded-lg object-cover border border-gray-200"
              />
              <button
                onClick={handleRemoveImage}
                disabled={removingImage}
                className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full bg-red-500 hover:bg-red-600 text-white shadow-sm transition-colors disabled:opacity-50"
                title="Remove image"
              >
                {removingImage ? (
                  <span className="text-xs">⏳</span>
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Row 1: SKU + Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SKU *</label>
              <input
                name="sku"
                value={form.sku}
                onChange={handleChange}
                disabled={isEdit}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.sku ? 'border-red-500' : 'border-gray-300'} ${isEdit ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                placeholder="e.g. LUB-001"
              />
              {errors.sku && <p className="mt-1 text-xs text-red-600">{errors.sku}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="Item name"
              />
              {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
            </div>
          </div>

          {/* Row 2: Category + Bin Location */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                name="category"
                value={form.category}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select...</option>
                {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bin Location</label>
              <input
                name="bin_location"
                value={form.bin_location}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. A-3-12"
              />
            </div>
          </div>

          {/* Row 3: Specifications */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Specification</label>
            <input
              name="specification"
              value={form.specification}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 5W-30, 1L bottle"
            />
          </div>

          {/* Row 4: Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Optional description..."
            />
          </div>

          {/* Row 5: Quantity thresholds */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <input
                name="quantity"
                type="number"
                min="0"
                value={form.quantity}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Threshold</label>
              <input
                name="min_threshold"
                type="number"
                min="0"
                value={form.min_threshold}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Threshold</label>
              <input
                name="max_threshold"
                type="number"
                min="0"
                value={form.max_threshold}
                onChange={handleChange}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.max_threshold ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.max_threshold && <p className="mt-1 text-xs text-red-600">{errors.max_threshold}</p>}
            </div>
          </div>

          {/* Row 5b: Unit of measure */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <select
                name="unit"
                value={form.unit}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">None</option>
                {legacyUnit && (
                  <option value={legacyUnit}>{legacyUnit} (legacy)</option>
                )}
                {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="flex items-center">
              <p className="text-xs text-gray-400">Manage units in the <span className="font-medium text-gray-500">Units</span> panel.</p>
            </div>
          </div>

          {/* Row 6: Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Production Date</label>
              <input
                name="production_date"
                type="date"
                value={form.production_date}
                onChange={handleChange}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.production_date ? 'border-red-500' : 'border-gray-300'}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
              <input
                name="expiry_date"
                type="date"
                value={form.expiry_date}
                onChange={handleChange}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.expiry_date ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.expiry_date && <p className="mt-1 text-xs text-red-600">{errors.expiry_date}</p>}
            </div>
          </div>

          {/* Duplicate warning (Add mode) */}
          {!isEdit && (checkingDup || dupMatches.length > 0) && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 space-y-2">
              {checkingDup && dupMatches.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-700">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking for duplicates…
                </div>
              )}
              {dupMatches.length > 0 && (
                <>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                    <div className="text-sm text-amber-800">
                      <p className="font-medium">
                        Possible duplicate — {dupMatches.length} existing item{dupMatches.length === 1 ? '' : 's'} match this exact lot.
                      </p>
                      <ul className="mt-1.5 list-disc pl-5 text-xs text-amber-700">
                        {dupMatches.slice(0, 3).map((m) => (
                          <li key={m.id}>
                            <span className="font-medium">{m.sku}</span> · {m.name}
                            {m.bin_location ? ` · bin ${m.bin_location}` : ''}
                            {m.specification ? ` · ${m.specification}` : ''}
                            {m.production_date ? ` · prod ${m.production_date}` : ''}
                            {m.expiry_date ? ` · exp ${m.expiry_date}` : ''}
                            {m.quantity != null ? ` · ${m.quantity}${m.unit ? ` ${m.unit}` : ''} on record` : ''}
                          </li>
                        ))}
                        {dupMatches.length > 3 && (
                          <li className="list-none pl-0 text-amber-600">…and {dupMatches.length - 3} more</li>
                        )}
                      </ul>
                    </div>
                  </div>
                  <p className="text-xs text-amber-700">
                    {allowDuplicate
                      ? 'You’re overriding the check — this will be saved as a separate, identical lot.'
                      : 'Saving is blocked while this lot already exists. Add a distinguishing production/expiry date, or confirm “add anyway”.'}
                  </p>
                  <label className="flex items-center gap-2 text-sm text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowDuplicate}
                      onChange={(e) => setAllowDuplicate(e.target.checked)}
                      className="h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="font-medium">Add anyway — I understand this duplicates an existing item</span>
                  </label>
                </>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {isEdit ? 'Save Changes' : 'Create Item'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
