import { useState } from 'react';
import { replaceAll } from '../../db/repo';
import { db } from '../../db/schema';
import { createBackup, parseBackup } from '../../lib/backup';
import { downloadBlob } from '../../lib/download';
import type { Dataset } from '../../lib/types';

export function BackupSection({ data }: { data: Dataset }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function exportBackup() {
    const blob = new Blob([JSON.stringify(createBackup(data), null, 2)], { type: 'application/json' });
    downloadBlob(blob, `taikai-stats-backup-${new Date().toISOString().slice(0, 10)}.json`);
  }

  async function restore(file: File) {
    setMessage('');
    setError('');
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) return setError(parsed.error);
    if (!confirm(`現在のデータをすべて置き換えます（大会 ${parsed.data.tournaments.length} 件）。よろしいですか？`)) return;
    try {
      await replaceAll(db, parsed.data);
    } catch (e) {
      return setError(`読み込みに失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }
    setMessage('バックアップを読み込みました');
  }

  return (
    <section className="card">
      <h2>バックアップ</h2>
      <p className="muted">
        データはこのブラウザにだけ保存されています。ブラウザのデータを消すと失われるので、定期的に書き出してください。
      </p>
      <div className="row">
        <button className="primary" disabled={data.tournaments.length === 0} onClick={exportBackup}>
          バックアップを書き出す
        </button>
        <label className="button-like">
          バックアップを読み込む
          <input
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void restore(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {message && <p className="muted">{message}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
