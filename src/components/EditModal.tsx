import React, { useState, useEffect } from 'react'
import { X, Save, Loader2, Trash2 } from 'lucide-react'
import { updateItem, createItem, removeImage, type UpdateItemInput, type CreateItemInput } from '../lib/api'

interface EditModalProps {
  isOpen: boolean
  onClose: () => void
  item?: any
  onSuccess: () => void
  onError: (msg: string) => void
  categories?: { name: string; color: string }[]
}

const emptyForm = {
  sku: '',
  name: '',
  description: '',
  category: '',
  quantity: 0,
  min_threshold: 0,
  max_threshold: 100,
  bin_location: '',
  production_date: '',
  expiry_date: '',
  specification: '',
}

export const EditModal: React.FC<EditModalProps> = ({ isOpen, onClose, item, onSuccess, onError, categories }) => {
  const isEdit = !!item
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [imagePreview, setImagePreview] = useState<string | null>(item?.image_url ?? null)
  const [removingImage, setRemovingImage] = useState(false)

  useEffect(() => {
    if (item) {
      setForm({
        sku: item.sku || '',
        name: item.name || '',
        description: item.description || '',
        category: item.category || '',
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
  }, [item, isOpen])

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
    setSaving(true)
    try {
      if (isEdit) {
        const updateData: UpdateItemInput = {
          sku: form.sku.trim(),
          name: form.name.trim(),
          description: form.description || null,
          category: form.category || null,
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
      } else {
        const createData: CreateItemInput = {
          sku: form.sku.trim(),
          name: form.name.trim(),
          description: form.description || undefined,
          category: form.category || undefined,
          quantity: form.quantity,
          min_threshold: form.min_threshold,
          max_threshold: form.max_threshold,
          bin_location: form.bin_location || undefined,
          production_date: form.production_date || undefined,
          expiry_date: form.expiry_date || undefined,
          specification: form.specification || undefined,
          image_url: imagePreview || undefined,
        }
        await createItem(createData)
      }
      onSuccess()
      onClose()
    } catch (err: any) {
      onError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // Build category options from API data (fallback to empty)
  const categoryOptions = categories?.map(c => c.name) || []

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
