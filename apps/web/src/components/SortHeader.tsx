import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { SortDir } from '../lib/table-sort';

/** En-tête de colonne cliquable pour tri — cohérent sur tous les tableaux du module Stocks. */
export function SortHeader({
  active,
  dir,
  onClick,
  children,
  className,
}: {
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={className}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className="sort-header-btn" onClick={onClick}>
        {children}
        {active ? (
          dir === 'asc' ? (
            <ArrowUp size={12} />
          ) : (
            <ArrowDown size={12} />
          )
        ) : (
          <ArrowUpDown size={12} className="sort-header-icon-idle" />
        )}
      </button>
    </th>
  );
}
