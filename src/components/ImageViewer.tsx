import React from 'react';
import { X, ZoomIn } from 'lucide-react';

interface ImageViewerProps {
  imageUrl: string | null;
  itemName: string;
  onClose: () => void;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ imageUrl, itemName, onClose }) => {
  if (!imageUrl) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Viewer */}
      <div className="relative max-w-4xl max-h-full w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 px-2">
          <h3 className="text-white font-medium text-lg truncate">{itemName}</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Image */}
        <div className="relative bg-white rounded-lg overflow-hidden shadow-2xl">
          <img
            src={imageUrl}
            alt={itemName}
            className="w-full h-auto max-h-[70vh] object-contain"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-center mt-3 gap-3">
          <a
            href={imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm"
          >
            <ZoomIn className="w-4 h-4" />
            Open in new tab
          </a>
          <a
            href={imageUrl}
            download
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
          >
            Download
          </a>
        </div>
      </div>
    </div>
  );
};
