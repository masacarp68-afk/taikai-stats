import { useState } from 'react';
import { deleteTournament, updateTournament } from '../../db/repo';
import { db } from '../../db/schema';
import { formatPeriod } from '../../lib/format';
import { sortTournaments, tournamentTitle } from '../../lib/stats';
import type { Dataset, Series, Tournament } from '../../lib/types';

export function TournamentManager({ data }: { data: Dataset }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  if (data.tournaments.length === 0) return null;

  const seriesById = new Map(data.series.map((s) => [s.id, s]));
  const counts = new Map<string, number>();
  for (const r of data.results) counts.set(r.tournamentId, (counts.get(r.tournamentId) ?? 0) + 1);
  const ordered = sortTournaments(data.tournaments).reverse();

  return (
    <section className="card">
      <h2>取り込み済みの大会</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>大会</th>
              <th>開催期間</th>
              <th className="num">人数</th>
              <th>雀魂大会ID</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ordered.map((t) => {
              const title = tournamentTitle(t, seriesById.get(t.seriesId));
              return editingId === t.id ? (
                <TournamentEditRow key={t.id} t={t} series={data.series} onClose={() => setEditingId(null)} />
              ) : (
                <tr key={t.id}>
                  <td>{title}</td>
                  <td>{formatPeriod(t)}</td>
                  <td className="num">{counts.get(t.id) ?? 0}</td>
                  <td>{t.mahjongSoulId ?? '—'}</td>
                  <td>
                    <div className="row">
                      <button onClick={() => setEditingId(t.id)}>編集</button>
                      <button
                        className="danger"
                        onClick={() => {
                          if (confirm(`「${title}」を削除しますか？この操作は取り消せません。`)) void deleteTournament(db, t.id);
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TournamentEditRow({ t, series, onClose }: { t: Tournament; series: Series[]; onClose: () => void }) {
  const [seriesId, setSeriesId] = useState(t.seriesId);
  const [label, setLabel] = useState(t.label);
  const [startDate, setStartDate] = useState(t.startDate);
  const [endDate, setEndDate] = useState(t.endDate === t.startDate ? '' : t.endDate);
  const [error, setError] = useState('');

  async function save() {
    if (!startDate) return setError('開始日を入力してください');
    if (endDate && endDate < startDate) return setError('終了日は開始日以降にしてください');
    await updateTournament(db, t.id, { seriesId, label, startDate, endDate });
    onClose();
  }

  return (
    <tr>
      <td colSpan={5}>
        <div className="row">
          <label className="field">
            シリーズ
            <select value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
              {series.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            回
            <input value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="field">
            開始日
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="field">
            終了日（1日開催なら空欄）
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <button className="primary" onClick={() => void save()}>
            保存
          </button>
          <button onClick={onClose}>キャンセル</button>
        </div>
        {error && <p className="error">{error}</p>}
      </td>
    </tr>
  );
}
