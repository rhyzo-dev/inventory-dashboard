import React, { useState } from 'react';
import { X, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { deleteItem } from '../lib/api';

interface DeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  item: { id: string; sku: string; name: string } | null;
  onDeleted: () => void;
  onError: (msg: string) => void;
}

export const DeleteDialog: React.FC<DeleteDialogProps> = ({ isOpen, onClose, item, onDeleted, onError }) => {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!item) return;
    setDeleting(true);
    try {
      await deleteItem(item.id);
      onDeleted();
      onClose();
    } catch (err: any) {
      onError(err.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Warning header */}
        <div className="bg-red-50 px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-semibold text-red-900">Confirm Deletion</h3>
            <p className="text-sm text-red-700">This action cannot be undone.</p>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-3">Are you sure you want to delete this item?</p>
          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">SKU</span>
              <span className="font-mono font-medium text-gray-900">{item.sku}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Name</span>
              <span className="font-medium text-gray-900">{item.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">ID</span>
              <span className="font-mono text-gray-500">#{item.id}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {deleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Delete Item
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
