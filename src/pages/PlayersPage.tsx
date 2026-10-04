import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { DataTable, type Column } from '../components/DataTable';
import { Exportable } from '../components/Exportable';
import { NoData } from '../components/NoData';
import { formatPoints } from '../lib/format';
import { summarizePlayers, tournamentTitle, type PlayerSummary } from '../lib/stats';
import type { Dataset } from '../lib/types';

export function PlayersPage({ data }: { data: Dataset }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [seriesId, setSeriesId] = useState('');
  const players = useMemo(() => summarizePlayers(data, seriesId || undefined), [data, seriesId]);
  const titles = useMemo(() => {
    const seriesById = new Map(data.series.map((s) => [s.id, s]));
    return new Map(data.tournaments.map((t) => [t.id, tournamentTitle(t, seriesById.get(t.seriesId))]));
  }, [data]);

  if (data.tournaments.length === 0) return <NoData />;

  const q = query.trim().toLowerCase();
  const rows = q ? players.filter((p) => p.name.toLowerCase().includes(q) || p.playerId.includes(q)) : players;
  const columns: Column<PlayerSummary>[] = [
    { key: 'name', label: '名前', render: (p) => p.name, sortValue: (p) => p.name },
    { key: 'count', label: '参加大会数', num: true, render: (p) => p.tournamentCount, sortValue: (p) => p.tournamentCount },
    { key: 'games', label: '通算対局数', num: true, render: (p) => p.totalGames, sortValue: (p) => p.totalGames },
    { key: 'points', label: '通算打点', num: true, render: (p) => formatPoints(p.totalPoints), sortValue: (p) => p.totalPoints },
    { key: 'last', label: '最終参加大会', render: (p) => titles.get(p.lastTournamentId) ?? '' },
  ];
  const seriesName = data.series.find((s) => s.id === seriesId)?.name ?? '全シリーズ';

  return (
    <section className="card">
      <h2>プレイヤー一覧</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <input placeholder="名前・IDで検索" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
          <option value="">全シリーズ</option>
          {data.series.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="muted">{rows.length}人</span>
      </div>
      <Exportable title={`${seriesName} 参加者一覧`}>
        {(limit) => (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(p) => p.playerId}
            sortable
            limit={limit}
            onRowClick={(p) => navigate(`/players/${p.playerId}`)}
          />
        )}
      </Exportable>
    </section>
  );
}
