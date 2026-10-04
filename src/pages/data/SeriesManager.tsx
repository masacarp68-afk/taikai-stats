import { useState } from 'react';
import { renameSeries } from '../../db/repo';
import { db } from '../../db/schema';
import type { Dataset } from '../../lib/types';

export function SeriesManager({ data }: { data: Dataset }) {
  if (data.series.length === 0) return null;
  return (
    <section className="card">
      <h2>シリーズ名の変更</h2>
      {data.series.map((s) => (
        <SeriesRenameRow key={s.id} id={s.id} name={s.name} />
      ))}
    </section>
  );
}

function SeriesRenameRow({ id, name }: { id: string; name: string }) {
  const [value, setValue] = useState(name);
  const trimmed = value.trim();
  return (
    <div className="row" style={{ marginBottom: 8 }}>
      <input value={value} onChange={(e) => setValue(e.target.value)} />
      <button disabled={!trimmed || trimmed === name} onClick={() => void renameSeries(db, id, trimmed)}>
        変更
      </button>
    </div>
  );
}
