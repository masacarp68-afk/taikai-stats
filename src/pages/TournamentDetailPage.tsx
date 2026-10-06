import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { DataTable, type Column } from '../components/DataTable';
import { formatPercent, formatPeriod, formatPoints, formatRanks } from '../lib/format';
import { getTournamentDetail, type TournamentEntry } from '../lib/stats';
import type { Dataset, Result } from '../lib/types';

type CombinedRow = TournamentEntry & { place: number };

const combinedColumns: Column<CombinedRow>[] = [
  { key: 'place', label: '#', num: true, render: (e) => e.place },
  { key: 'name', label: '名前', render: (e) => e.playerName },
  { key: 'games', label: '対局数', num: true, render: (e) => e.games, sortValue: (e) => e.games },
  { key: 'points', label: '打点合計', num: true, render: (e) => formatPoints(e.totalPoints), sortValue: (e) => e.totalPoints },
  { key: 'ranks', label: 'パート別順位', render: (e) => formatRanks(e.ranks) },
];

const partColumns: Column<Result>[] = [
  { key: 'rank', label: '順位', num: true, render: (r) => r.rank },
  { key: 'name', label: '名前', render: (r) => r.playerName },
  { key: 'games', label: '対局数', num: true, render: (r) => r.games },
  { key: 'points', label: '累計打点', num: true, render: (r) => formatPoints(r.totalPoints) },
];

const COMBINED = '__combined__';

export function TournamentDetailPage({ data }: { data: Dataset }) {
  const navigate = useNavigate();
  const { tournamentId = '' } = useParams();
  const detail = useMemo(() => getTournamentDetail(data, tournamentId), [data, tournamentId]);
  const [tab, setTab] = useState(COMBINED);

  if (!detail) {
    return (
      <section className="card">
        <p>大会が見つかりません。</p>
        <Link to="/tournaments">← 大会集計へ</Link>
      </section>
    );
  }

  const { stat, parts, combined } = detail;
  const multi = parts.length > 1;
  const selectedPart = parts.find((p) => p.part.id === tab);
  const activeTab = selectedPart ? tab : COMBINED;
  const toPlayer = (playerId: string) => navigate(`/players/${playerId}`);
  const tabs = [{ id: COMBINED, name: '合算' }, ...parts.map((p) => ({ id: p.part.id, name: p.part.name }))];

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
          {multi && <div className="stat">パート数<b>{parts.length}</b></div>}
        </div>
        {multi && (
          <div className="tabs sub-tabs">
            {tabs.map((t) => (
              <button key={t.id} className={activeTab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
        )}
        {multi && !selectedPart ? (
          <DataTable
            columns={combinedColumns}
            rows={combined.map((e, i) => ({ ...e, place: i + 1 }))}
            rowKey={(e) => e.playerId}
            sortable
            onRowClick={(e) => toPlayer(e.playerId)}
          />
        ) : (
          <DataTable
            columns={partColumns}
            rows={(selectedPart ?? parts[0])?.results ?? []}
            rowKey={(r) => r.id}
            onRowClick={(r) => toPlayer(r.playerId)}
          />
        )}
      </section>
    </>
  );
}
