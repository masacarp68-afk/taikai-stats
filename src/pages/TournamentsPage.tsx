import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { DataTable, type Column } from '../components/DataTable';
import { Exportable } from '../components/Exportable';
import { NoData } from '../components/NoData';
import { formatPercent, formatPeriod } from '../lib/format';
import { tournamentStats, type TournamentStat } from '../lib/stats';
import type { Dataset } from '../lib/types';

const columns: Column<TournamentStat>[] = [
  { key: 'title', label: '大会', render: (s) => s.title, sortValue: (s) => s.title },
  { key: 'period', label: '開催期間', render: (s) => formatPeriod(s.tournament), sortValue: (s) => s.tournament.startDate },
  { key: 'participants', label: '参加人数', num: true, render: (s) => s.participants, sortValue: (s) => s.participants },
  { key: 'newcomers', label: '新規', num: true, render: (s) => s.newcomers, sortValue: (s) => s.newcomers },
  { key: 'repeaters', label: 'リピーター', num: true, render: (s) => s.repeaters, sortValue: (s) => s.repeaters },
  { key: 'retention', label: '継続率', num: true, render: (s) => formatPercent(s.retention), sortValue: (s) => s.retention ?? -1 },
];

export function TournamentsPage({ data }: { data: Dataset }) {
  const navigate = useNavigate();
  const stats = useMemo(() => tournamentStats(data).reverse(), [data]);
  if (stats.length === 0) return <NoData />;
  return (
    <section className="card">
      <h2>大会集計</h2>
      <p className="muted">新規＝全大会を通じて初参加。継続率＝同じシリーズの前回参加者のうち今回も参加した割合。</p>
      <Exportable title="大会集計">
        {(limit) => (
          <DataTable
            columns={columns}
            rows={stats}
            rowKey={(s) => s.tournament.id}
            sortable
            limit={limit}
            onRowClick={(s) => navigate(`/tournaments/${s.tournament.id}`)}
          />
        )}
      </Exportable>
    </section>
  );
}
