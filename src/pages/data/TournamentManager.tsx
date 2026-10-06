import { Fragment, useState } from 'react';
import { deletePart, deleteTournament, renamePart, updateTournament } from '../../db/repo';
import { db } from '../../db/schema';
import { formatPeriod } from '../../lib/format';
import { sortParts, sortTournaments, tournamentTitle } from '../../lib/stats';
import type { Dataset, Part, Series, Tournament } from '../../lib/types';

export function TournamentManager({ data }: { data: Dataset }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  if (data.tournaments.length === 0) return null;

  const seriesById = new Map(data.series.map((s) => [s.id, s]));
  const playersByTournament = new Map<string, Set<string>>();
  const countByPart = new Map<string, number>();
  for (const r of data.results) {
    const set = playersByTournament.get(r.tournamentId) ?? new Set<string>();
    set.add(r.playerId);
    playersByTournament.set(r.tournamentId, set);
    countByPart.set(r.partId, (countByPart.get(r.partId) ?? 0) + 1);
  }
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
              <th className="num">パート</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ordered.map((t) => {
              const title = tournamentTitle(t, seriesById.get(t.seriesId));
              const parts = sortParts(data.parts.filter((p) => p.tournamentId === t.id));
              if (editingId === t.id) {
                return <TournamentEditRow key={t.id} t={t} series={data.series} onClose={() => setEditingId(null)} />;
              }
              return (
                <Fragment key={t.id}>
                  <tr className="has-sub-row">
                    <td>{title}</td>
                    <td>{formatPeriod(t)}</td>
                    <td className="num">{playersByTournament.get(t.id)?.size ?? 0}</td>
                    <td className="num">{parts.length}</td>
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
                  <tr className="sub-row">
                    <td colSpan={5}>
                      <ul className="part-list">
                        {parts.map((p) => (
                          <PartItem key={p.id} part={p} players={countByPart.get(p.id) ?? 0} isLast={parts.length === 1} />
                        ))}
                      </ul>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PartItem({ part, players, isLast }: { part: Part; players: number; isLast: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(part.name);

  if (editing) {
    return (
      <li className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary" disabled={!name.trim()} onClick={() => void renamePart(db, part.id, name).then(() => setEditing(false))}>
          保存
        </button>
        <button
          onClick={() => {
            setName(part.name);
            setEditing(false);
          }}
        >
          キャンセル
        </button>
      </li>
    );
  }

  return (
    <li className="row">
      <span>{part.name}</span>
      <span className="muted">
        {players}人 ／ 大会ID {part.mahjongSoulId ?? '—'}
      </span>
      <button onClick={() => setEditing(true)}>名前変更</button>
      <button
        className="danger"
        onClick={() => {
          const message = isLast
            ? `パート「${part.name}」は大会の最後のパートです。削除すると大会も削除されます。よろしいですか？`
            : `パート「${part.name}」を削除しますか？この操作は取り消せません。`;
          if (confirm(message)) void deletePart(db, part.id);
        }}
      >
        削除
      </button>
    </li>
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
