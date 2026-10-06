import { useState } from 'react';
import { findPartByMahjongSoulId, importPart, type ImportPartInput } from '../../db/repo';
import { db } from '../../db/schema';
import { formatPeriod } from '../../lib/format';
import { sortTournaments, tournamentTitle } from '../../lib/stats';
import type { Dataset, ParsedRow, Part } from '../../lib/types';

export type PendingFile = {
  key: string;
  fileName: string;
  mahjongSoulId: string | null;
  /** ファイル名から作ったパート名の初期値 */
  partName: string;
  rows: ParsedRow[];
  skipped: number;
  /** 同じ雀魂大会IDで取り込み済みのパート */
  existing?: Part;
};

const NEW_SERIES = '__new_series__';
const NEW_TOURNAMENT = '__new_tournament__';

type Props = {
  file: PendingFile;
  remaining: number;
  data: Dataset;
  /** 取り込み先の初期値（直前に保存した大会） */
  defaultTournamentId: string | null;
  onDone: (message: string, tournamentId?: string) => void;
};

export function ImportForm({ file, remaining, data, defaultTournamentId, onDone }: Props) {
  const ex = file.existing;
  const tournamentExists = (id: string) => data.tournaments.some((t) => t.id === id);
  const initialTarget =
    ex && tournamentExists(ex.tournamentId)
      ? ex.tournamentId
      : defaultTournamentId && tournamentExists(defaultTournamentId)
        ? defaultTournamentId
        : NEW_TOURNAMENT;

  const [target, setTarget] = useState(initialTarget);
  const [seriesChoice, setSeriesChoice] = useState(data.series[0]?.id ?? NEW_SERIES);
  const [newSeriesName, setNewSeriesName] = useState('');
  const [label, setLabel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [partName, setPartName] = useState(ex?.name ?? file.partName);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const seriesById = new Map(data.series.map((s) => [s.id, s]));
  const tournaments = sortTournaments(data.tournaments).reverse();
  const isNew = target === NEW_TOURNAMENT;

  async function save() {
    setError('');
    if (isNew) {
      if (seriesChoice === NEW_SERIES && !newSeriesName.trim()) return setError('シリーズ名を入力してください');
      if (!startDate) return setError('開始日を入力してください');
      if (endDate && endDate < startDate) return setError('終了日は開始日以降にしてください');
    }

    setSaving(true);
    try {
      let overwritePartId: string | undefined;
      if (file.mahjongSoulId) {
        const existing = await findPartByMahjongSoulId(db, file.mahjongSoulId);
        if (existing) {
          if (!confirm(`大会ID ${file.mahjongSoulId} は取り込み済みです。上書きしますか？`)) {
            setSaving(false);
            return;
          }
          overwritePartId = existing.id;
        }
      }
      const input: ImportPartInput = {
        target: isNew
          ? {
              newTournament: {
                series: seriesChoice === NEW_SERIES ? { newName: newSeriesName } : { id: seriesChoice },
                label,
                startDate,
                endDate,
              },
            }
          : { tournamentId: target },
        partName,
        mahjongSoulId: file.mahjongSoulId,
        rows: file.rows,
      };
      const { tournamentId } = await importPart(db, input, overwritePartId);
      onDone(`${file.fileName} を取り込みました（${file.rows.length}人）`, tournamentId);
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
        {file.rows.slice(0, 5).map((r, i) => (
          <li key={`${r.playerId}-${i}`}>
            {r.playerName}（{r.games}局 {r.totalPoints}）
          </li>
        ))}
      </ol>
      {ex && <p className="notice">取り込み済みのパートです。保存すると成績を上書きします</p>}
      <div className="row">
        <label className="field">
          取り込み先
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value={NEW_TOURNAMENT}>＋ 新しい大会</option>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {tournamentTitle(t, seriesById.get(t.seriesId))}（{formatPeriod(t)}）
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          パート名
          <input value={partName} onChange={(e) => setPartName(e.target.value)} placeholder="例：2-1" />
        </label>
      </div>
      {isNew ? (
        <div className="row" style={{ marginTop: 8 }}>
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
      ) : (
        <p className="muted">選んだ大会にパートとして追加します。参加人数は大会全体で重複なしに数えます。</p>
      )}
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
