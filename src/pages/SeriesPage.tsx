import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { DataTable, type Column } from '../components/DataTable';
import { Exportable } from '../components/Exportable';
import { NoData } from '../components/NoData';
import { formatPoints } from '../lib/format';
import { seriesStats, type SeriesPlayerStat, type SeriesStat } from '../lib/stats';
import type { Dataset } from '../lib/types';

type Ranked = SeriesPlayerStat & { place: number };
const withPlace = (ps: SeriesPlayerStat[]): Ranked[] => ps.map((p, i) => ({ ...p, place: i + 1 }));

function rankingColumns(label: string, value: (p: Ranked) => ReactNode): Column<Ranked>[] {
  return [
    { key: 'place', label: '#', num: true, render: (p) => p.place },
    { key: 'name', label: '名前', render: (p) => p.name },
    { key: 'value', label, num: true, render: value },
  ];
}

export function SeriesPage({ data }: { data: Dataset }) {
  const stats = useMemo(() => seriesStats(data), [data]);
  if (stats.length === 0) return <NoData />;
  return (
    <>
      {stats.map((s) => (
        <SeriesCard key={s.series.id} stat={s} />
      ))}
    </>
  );
}

function SeriesCard({ stat }: { stat: SeriesStat }) {
  const navigate = useNavigate();
  const toPlayer = (p: Ranked) => navigate(`/players/${p.playerId}`);
  const byAttended = withPlace(stat.players);
  const byGames = withPlace([...stat.players].sort((a, b) => b.totalGames - a.totalGames));
  const byPoints = withPlace([...stat.players].sort((a, b) => b.totalPoints - a.totalPoints));

  return (
    <section className="card">
      <h2>{stat.series.name}</h2>
      <div className="stat-grid">
        <div className="stat">開催回数<b>{stat.tournamentCount}回</b></div>
        <div className="stat">のべ参加人数<b>{stat.totalEntries}人</b></div>
        <div className="stat">ユニーク参加人数<b>{stat.uniquePlayers}人</b></div>
        <div className="stat">皆勤者<b>{stat.perfectAttendance.length}人</b></div>
      </div>
      <h3>皆勤者（全{stat.tournamentCount}回参加）</h3>
      {stat.perfectAttendance.length > 0 ? (
        <p>{stat.perfectAttendance.map((p) => p.name).join('、')}</p>
      ) : (
        <p className="muted">なし</p>
      )}
      <div className="ranking-grid">
        <Exportable title={`${stat.series.name} 参加回数ランキング`} defaultLimit={20}>
          {(limit) => (
            <DataTable columns={rankingColumns('参加', (p) => `${p.attended}回`)} rows={byAttended} rowKey={(p) => p.playerId} onRowClick={toPlayer} limit={limit} />
          )}
        </Exportable>
        <Exportable title={`${stat.series.name} 通算対局数ランキング`} defaultLimit={20}>
          {(limit) => (
            <DataTable columns={rankingColumns('対局数', (p) => p.totalGames)} rows={byGames} rowKey={(p) => p.playerId} onRowClick={toPlayer} limit={limit} />
          )}
        </Exportable>
        <Exportable title={`${stat.series.name} 通算打点ランキング`} defaultLimit={20}>
          {(limit) => (
            <DataTable columns={rankingColumns('打点', (p) => formatPoints(p.totalPoints))} rows={byPoints} rowKey={(p) => p.playerId} onRowClick={toPlayer} limit={limit} />
          )}
        </Exportable>
      </div>
    </section>
  );
}
