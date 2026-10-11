import React from 'react';

export const Loading: React.FC = () => {
  return (
    <div className="flex min-h-[200px] items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <p className="mt-4 text-sm text-gray-500">
          Loading inventory...
        </p>
      </div>
    </div>
  );
};