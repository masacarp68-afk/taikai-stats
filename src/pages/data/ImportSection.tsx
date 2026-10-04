import { useState } from 'react';
import { findTournamentByMahjongSoulId, importTournament } from '../../db/repo';
import { db } from '../../db/schema';
import { decodeCsv, extractMahjongSoulId, parseResultsCsv } from '../../lib/csv';
import type { Dataset, ParsedRow, Tournament } from '../../lib/types';

type PendingFile = {
  key: string;
  fileName: string;
  mahjongSoulId: string | null;
  rows: ParsedRow[];
  skipped: number;
  existing?: Tournament;
};
type Rejected = { fileName: string; error: string };

export function ImportSection({ data }: { data: Dataset }) {
  const [queue, setQueue] = useState<PendingFile[]>([]);
  const [rejected, setRejected] = useState<Rejected[]>([]);
  const [message, setMessage] = useState('');
  const [dragOver, setDragOver] = useState(false);

  async function addFiles(files: FileList) {
    const accepted: PendingFile[] = [];
    const errors: Rejected[] = [];
    for (const f of Array.from(files)) {
      try {
        const outcome = parseResultsCsv(decodeCsv(await f.arrayBuffer()));
        if (outcome.ok) {
          const mahjongSoulId = extractMahjongSoulId(f.name);
          const existing = mahjongSoulId ? await findTournamentByMahjongSoulId(db, mahjongSoulId) : undefined;
          accepted.push({
            key: crypto.randomUUID(),
            fileName: f.name,
            mahjongSoulId,
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
        雀魂の「シーズン順位統計」CSVをここにドロップ（複数可）、またはクリックして選択
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
      {rejected.map((r) => (
        <p key={r.fileName} className="error">
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
          onDone={(msg) => {
            setQueue((q) => q.slice(1));
            setMessage(msg);
          }}
        />
      )}
    </section>
  );
}

const NEW_SERIES = '__new__';

function ImportForm({
  file,
  remaining,
  data,
  onDone,
}: {
  file: PendingFile;
  remaining: number;
  data: Dataset;
  onDone: (message: string) => void;
}) {
  const ex = file.existing;
  const exSeriesValid = ex && data.series.some((s) => s.id === ex.seriesId);
  const [seriesChoice, setSeriesChoice] = useState(exSeriesValid ? ex.seriesId : (data.series[0]?.id ?? NEW_SERIES));
  const [newSeriesName, setNewSeriesName] = useState('');
  const [label, setLabel] = useState(ex?.label ?? '');
  const [startDate, setStartDate] = useState(ex?.startDate ?? '');
  const [endDate, setEndDate] = useState(ex && ex.endDate !== ex.startDate ? ex.endDate : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setError('');
    if (seriesChoice === NEW_SERIES && !newSeriesName.trim()) return setError('シリーズ名を入力してください');
    if (!startDate) return setError('開始日を入力してください');
    if (endDate && endDate < startDate) return setError('終了日は開始日以降にしてください');

    setSaving(true);
    try {
      let overwriteId: string | undefined;
      if (file.mahjongSoulId) {
        const existing = await findTournamentByMahjongSoulId(db, file.mahjongSoulId);
        if (existing) {
          if (!confirm(`大会ID ${file.mahjongSoulId} は取り込み済みです。上書きしますか？`)) {
            setSaving(false);
            return;
          }
          overwriteId = existing.id;
        }
      }
      await importTournament(
        db,
        {
          series: seriesChoice === NEW_SERIES ? { newName: newSeriesName } : { id: seriesChoice },
          label,
          startDate,
          endDate,
          mahjongSoulId: file.mahjongSoulId,
          rows: file.rows,
        },
        overwriteId,
      );
      onDone(`${file.fileName} を取り込みました（${file.rows.length}人）`);
    } catch (e) {
      setError(`保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
      setSaving(false);
    }
  }

  return (
    <div>
      <h3>
        {file.fileName}
        {remaining > 0 && <span className="muted">（このあと {remaining} 件）</span>}
      </h3>
      <p className="muted">
        大会ID: {file.mahjongSoulId ?? '不明'} ／ {file.rows.length}人
        {file.skipped > 0 && ` ／ ${file.skipped}行スキップ`}
      </p>
      <ol className="muted">
        {file.rows.slice(0, 5).map((r) => (
          <li key={r.playerId}>
            {r.playerName}（{r.games}局 {r.totalPoints}）
          </li>
        ))}
      </ol>
      {ex && <p className="error">取り込み済みの大会です。保存すると成績を上書きします</p>}
      <div className="row">
        <label className="field">
          シリーズ
          <select value={seriesChoice} onChange={(e) => setSeriesChoice(e.target.value)}>
            {data.series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value={NEW_SERIES}>＋ 新しいシリーズ</option>
          </select>
        </label>
        {seriesChoice === NEW_SERIES && (
          <label className="field">
            シリーズ名
            <input value={newSeriesName} onChange={(e) => setNewSeriesName(e.target.value)} placeholder="例：深海杯" />
          </label>
        )}
        <label className="field">
          回
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例：第3回" />
        </label>
        <label className="field">
          開始日
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="field">
          終了日（1日開催なら空欄）
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" disabled={saving} onClick={() => void save()}>
          保存
        </button>
        <button disabled={saving} onClick={() => onDone(`${file.fileName} をスキップしました`)}>
          スキップ
        </button>
      </div>
    </div>
  );
}
