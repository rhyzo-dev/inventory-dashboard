import React from 'react';
import { Package, AlertTriangle, AlertCircle, Calendar, DollarSign } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: number | string;
  Icon: React.ComponentType<{ className?: string }>;
  color?: 'blue' | 'red' | 'yellow' | 'green' | 'gray';
}

const StatsCard: React.FC<StatsCardProps> = ({ title, value, Icon, color = 'blue' }) => {
  const colorMap: Record<string, string> = {
    blue: 'border-blue-500 bg-blue-50 text-blue-600',
    red: 'border-red-500 bg-red-50 text-red-600',
    yellow: 'border-yellow-500 bg-yellow-50 text-yellow-600',
    green: 'border-green-500 bg-green-50 text-green-600',
    gray: 'border-gray-300 bg-gray-50 text-gray-600'
  };

  const bgColor = colorMap[color] || colorMap.gray;

  return (
    <div className={`rounded-lg border p-4 flex items-center space-x-4 ${bgColor}`}>
      <div className="w-10 h-10 flex items-center justify-center">
        <Icon className={`w-5 h-5 ${color === 'gray' ? 'text-gray-500' : `text-${color}-600`}`} />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      </div>
    </div>
  );
};

interface StatsCardsProps {
  stats: {
    total_items: number;
    low_stock_count: number;
    out_of_stock_count: number;
    expiring_soon_count: number;
    total_value_estimate: number;
  };
}

export const StatsCards: React.FC<StatsCardsProps> = ({ stats }) => {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatsCard
        title="Total Items"
        value={stats.total_items}
        Icon={Package}
        color="blue"
      />
      <StatsCard
        title="Low Stock"
        value={stats.low_stock_count}
        Icon={AlertTriangle}
        color="yellow"
      />
      <StatsCard
        title="Out of Stock"
        value={stats.out_of_stock_count}
        Icon={AlertCircle}
        color="red"
      />
      <StatsCard
        title="Expiring Soon"
        value={stats.expiring_soon_count}
        Icon={Calendar}
        color="green"
      />
      {/* Optional: Total Value */}
      <StatsCard
        title="Est. Value"
        value={`$${stats.total_value_estimate.toLocaleString()}`}
        Icon={DollarSign}
        color="gray"
      />
    </div>
  );
};