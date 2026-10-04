import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { DataTable, type Column } from '../components/DataTable';
import { formatPercent, formatPeriod, formatPoints } from '../lib/format';
import { tournamentStats } from '../lib/stats';
import type { Dataset, Result } from '../lib/types';

const columns: Column<Result>[] = [
  { key: 'rank', label: '順位', num: true, render: (r) => r.rank },
  { key: 'name', label: '名前', render: (r) => r.playerName },
  { key: 'games', label: '対局数', num: true, render: (r) => r.games },
  { key: 'points', label: '累計打点', num: true, render: (r) => formatPoints(r.totalPoints) },
];

export function TournamentDetailPage({ data }: { data: Dataset }) {
  const navigate = useNavigate();
  const { tournamentId = '' } = useParams();
  const stat = useMemo(() => tournamentStats(data).find((s) => s.tournament.id === tournamentId), [data, tournamentId]);
  const results = useMemo(
    () => data.results.filter((r) => r.tournamentId === tournamentId).sort((a, b) => a.rank - b.rank),
    [data, tournamentId],
  );

  if (!stat) {
    return (
      <section className="card">
        <p>大会が見つかりません。</p>
        <Link to="/tournaments">← 大会集計へ</Link>
      </section>
    );
  }

  return (
    <>
      <p>
        <Link to="/tournaments">← 大会集計へ</Link>
      </p>
      <section className="card">
        <h2>
          {stat.title} <span className="muted">{formatPeriod(stat.tournament)}</span>
        </h2>
        <div className="stat-grid">
          <div className="stat">参加人数<b>{stat.participants}</b></div>
          <div className="stat">新規<b>{stat.newcomers}</b></div>
          <div className="stat">リピーター<b>{stat.repeaters}</b></div>
          <div className="stat">継続率<b>{formatPercent(stat.retention)}</b></div>
        </div>
        <DataTable columns={columns} rows={results} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/players/${r.playerId}`)} />
      </section>
    </>
  );
}
