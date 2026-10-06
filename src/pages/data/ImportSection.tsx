import { useState } from 'react';
import { findPartByMahjongSoulId } from '../../db/repo';
import { db } from '../../db/schema';
import { decodeCsv, extractMahjongSoulId, parseResultsCsv, partNameFromFileName } from '../../lib/csv';
import type { Dataset } from '../../lib/types';
import { ImportForm, type PendingFile } from './ImportForm';

type Rejected = { fileName: string; error: string };

export function ImportSection({ data }: { data: Dataset }) {
  const [queue, setQueue] = useState<PendingFile[]>([]);
  const [rejected, setRejected] = useState<Rejected[]>([]);
  const [message, setMessage] = useState('');
  const [dragOver, setDragOver] = useState(false);
  /** 直前に保存した大会。続くファイルの取り込み先の初期値にする */
  const [lastTournamentId, setLastTournamentId] = useState<string | null>(null);

  async function addFiles(files: FileList) {
    const accepted: PendingFile[] = [];
    const errors: Rejected[] = [];
    for (const f of Array.from(files)) {
      try {
        const outcome = parseResultsCsv(decodeCsv(await f.arrayBuffer()));
        if (outcome.ok) {
          const mahjongSoulId = extractMahjongSoulId(f.name);
          const existing = mahjongSoulId ? await findPartByMahjongSoulId(db, mahjongSoulId) : undefined;
          accepted.push({
            key: crypto.randomUUID(),
            fileName: f.name,
            mahjongSoulId,
            partName: partNameFromFileName(f.name),
            rows: outcome.rows,
            skipped: outcome.skipped,
            existing,
          });
        } else {
          errors.push({ fileName: f.name, error: outcome.error });
        }
      } catch {
        errors.push({ fileName: f.name, error: 'ファイルを読み込めませんでした' });
      }
    }
    setQueue((q) => [...q, ...accepted]);
    setRejected(errors);
    setMessage('');
    setLastTournamentId(null);
  }

  const current = queue[0];
  return (
    <section className="card">
      <h2>CSV取り込み</h2>
      <label
        className={`dropzone${dragOver ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void addFiles(e.dataTransfer.files);
        }}
      >
        雀魂の大会CSVをここにドロップ（複数可）、またはクリックして選択
        <br />
        1つの大会が複数のCSVに分かれている場合は、まとめてドロップして同じ大会に追加できます
        <input
          type="file"
          accept=".csv,text/csv"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </label>
      {rejected.map((r, i) => (
        <p key={`${r.fileName}-${i}`} className="error">
          {r.fileName}: {r.error}
        </p>
      ))}
      {message && <p className="muted">{message}</p>}
      {current && (
        <ImportForm
          key={current.key}
          file={current}
          remaining={queue.length - 1}
          data={data}
          defaultTournamentId={lastTournamentId}
          onDone={(msg, tournamentId) => {
            setQueue((q) => q.slice(1));
            setMessage(msg);
            if (tournamentId) setLastTournamentId(tournamentId);
          }}
        />
      )}
    </section>
  );
}
