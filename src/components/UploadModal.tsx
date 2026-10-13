import React, { useState, useRef } from 'react';
import { X, Upload, Image as ImageIcon } from 'lucide-react';
import { uploadImage } from '../lib/api';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemId?: string | null;
  onUploaded: (imageUrl: string) => void;
  onError: (msg: string) => void;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_SIZE_MB = 10;

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, itemId, onUploaded, onError }) => {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setDragging(false);
    setUploading(false);
    setPreview(null);
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const processFile = (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      onError(`Unsupported type: ${file.type}. Allowed: ${ALLOWED_TYPES.join(', ')}`);
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      onError(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max ${MAX_SIZE_MB}MB)`);
      return;
    }
    setFileName(file.name);
    setPreview(URL.createObjectURL(file));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleUpload = async () => {
    if (!preview || uploading) return;
    setUploading(true);
    try {
      // Re-read the file — we need the actual File object, not the preview
      const input = fileInputRef.current;
      if (!input?.files?.[0]) throw new Error('No file selected');
      const result = await uploadImage(input.files[0], itemId || undefined);
      onUploaded(result.image_url);
      handleClose();
    } catch (err: any) {
      onError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Upload Image</h2>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
              ${dragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_TYPES.join(',')}
              onChange={handleFileChange}
              className="hidden"
            />

            {preview ? (
              <div className="space-y-2">
                <img
                  src={preview}
                  alt="Preview"
                  className="max-h-40 mx-auto rounded-lg shadow-sm"
                />
                <p className="text-sm text-gray-500 truncate px-4">{fileName}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-blue-600" />
                </div>
                <p className="text-sm font-medium text-gray-700">
                  Drop image here or click to browse
                </p>
                <p className="text-xs text-gray-400">
                  PNG, JPG, GIF, WEBP up to {MAX_SIZE_MB}MB
                </p>
              </div>
            )}
          </div>

          {/* Info */}
          {itemId && (
            <p className="text-xs text-gray-400 text-center">
              This image will be attached to item #{itemId}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!preview || uploading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {uploading ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Uploading...
              </>
            ) : (
              <>
                <ImageIcon className="w-4 h-4" />
                Upload
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
