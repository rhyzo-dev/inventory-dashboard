import React from 'react';
import { Package, AlertTriangle, AlertCircle, Calendar, ChevronRight, Skull } from 'lucide-react';

export type StatKey = 'all' | 'low' | 'out' | 'expiring' | 'expired';

interface StatsCardProps {
  title: string;
  value: number | string;
  Icon: React.ComponentType<{ className?: string }>;
  color?: 'blue' | 'red' | 'yellow' | 'green';
  active?: boolean;
  onClick?: () => void;
}

const StatsCard: React.FC<StatsCardProps> = ({ title, value, Icon, color = 'blue', active, onClick }) => {
  const colorMap: Record<string, string> = {
    blue: 'border-blue-500 bg-blue-50 text-blue-600',
    red: 'border-red-500 bg-red-50 text-red-600',
    yellow: 'border-yellow-500 bg-yellow-50 text-yellow-600',
    green: 'border-green-500 bg-green-50 text-green-600',
  };

  const bgColor = colorMap[color] || colorMap.blue;
  const interactive = !!onClick;

  const className = `rounded-lg border p-4 flex items-center space-x-4 ${bgColor} ${
    interactive ? 'cursor-pointer hover:shadow-sm transition-all' : ''
  } ${active ? 'ring-2 ring-offset-2 ring-gray-300' : ''}`;

  const inner = (
    <>
      <div className="w-10 h-10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-current" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      </div>
      {interactive && (
        <ChevronRight className={`w-4 h-4 ml-auto ${active ? 'text-gray-600' : 'text-gray-300'}`} />
      )}
    </>
  );

  return interactive ? (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  ) : (
    <div className={className}>{inner}</div>
  );
};

interface StatsCardsProps {
  stats: {
    total_items: number;
    low_stock_count: number;
    out_of_stock_count: number;
    expiring_soon_count: number;
    expired_count?: number;
  };
  /** When provided, the cards act as one-click filters into the table below. */
  onSelect?: (key: StatKey) => void;
  /** Which card is currently active (drives the highlight). */
  active?: StatKey;
}

export const StatsCards: React.FC<StatsCardsProps> = ({ stats, onSelect, active }) => {
  // Cards read as attention signals: the count is colored by severity, and a zero
  // count stays quiet. Only the three "problem" cards are clickable.
  const select = onSelect;

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatsCard
          title="Total Items"
          value={stats.total_items}
          Icon={Package}
          color="blue"
          active={active === 'all'}
          onClick={select ? () => select('all') : undefined}
        />
        <StatsCard
          title="Low Stock"
          value={stats.low_stock_count}
          Icon={AlertTriangle}
          color="yellow"
          active={active === 'low'}
          onClick={select ? () => select('low') : undefined}
        />
        <StatsCard
          title="Out of Stock"
          value={stats.out_of_stock_count}
          Icon={AlertCircle}
          color="red"
          active={active === 'out'}
          onClick={select ? () => select('out') : undefined}
        />
        <StatsCard
          title="Expiring Soon"
          value={stats.expiring_soon_count}
          Icon={Calendar}
          color="green"
          active={active === 'expiring'}
          onClick={select ? () => select('expiring') : undefined}
        />
        <StatsCard
          title="Expired"
          value={stats.expired_count ?? 0}
          Icon={Skull}
          color="red"
          active={active === 'expired'}
          onClick={select ? () => select('expired') : undefined}
        />
      </div>
      {select && (
        <p className="mt-2 text-xs text-gray-400">
          Tap a card to filter the list. Click again to clear.
        </p>
      )}
    </div>
  );
};
