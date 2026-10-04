import { useState, type ReactNode } from 'react';

export type Column<T> = {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => number | string;
  num?: boolean;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  sortable?: boolean;
  /** 並び替えた後に先頭から何件表示するか */
  limit?: number;
  empty?: string;
};

export function DataTable<T>({ columns, rows, rowKey, onRowClick, sortable = false, limit, empty = 'データがありません' }: Props<T>) {
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  if (rows.length === 0) return <p className="muted">{empty}</p>;

  const sortCol = sort ? columns.find((c) => c.key === sort.key) : undefined;
  let shown = rows;
  if (sort && sortCol?.sortValue) {
    const value = sortCol.sortValue;
    shown = [...rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ja');
      return sort.desc ? -cmp : cmp;
    });
  }
  if (limit !== undefined) shown = shown.slice(0, limit);

  function toggle(c: Column<T>) {
    if (!sortable || !c.sortValue) return;
    setSort((s) => (s?.key === c.key ? { key: c.key, desc: !s.desc } : { key: c.key, desc: true }));
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={[c.num && 'num', sortable && c.sortValue && 'sortable'].filter(Boolean).join(' ') || undefined}
                onClick={() => toggle(c)}
              >
                {c.label}
                {sort?.key === c.key && (sort.desc ? ' ▼' : ' ▲')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr
              key={rowKey(r)}
              className={onRowClick ? 'clickable' : undefined}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.num ? 'num' : undefined}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
