import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { DataTable, type Column } from '../components/DataTable';
import { formatPeriod, formatPoints } from '../lib/format';
import { getPlayerDetail, type PlayerHistoryEntry } from '../lib/stats';
import type { Dataset } from '../lib/types';

const columns: Column<PlayerHistoryEntry>[] = [
  { key: 'title', label: '大会', render: (h) => h.title },
  { key: 'period', label: '開催期間', render: (h) => formatPeriod(h.tournament) },
  { key: 'rank', label: '順位', num: true, render: (h) => h.rank },
  { key: 'games', label: '対局数', num: true, render: (h) => h.games },
  { key: 'points', label: '打点', num: true, render: (h) => formatPoints(h.totalPoints) },
];

export function PlayerDetailPage({ data }: { data: Dataset }) {
  const navigate = useNavigate();
  const { playerId = '' } = useParams();
  const detail = useMemo(() => getPlayerDetail(data, playerId), [data, playerId]);

  if (!detail) {
    return (
      <section className="card">
        <p>プレイヤーが見つかりません。</p>
        <Link to="/players">← プレイヤー一覧へ</Link>
      </section>
    );
  }

  return (
    <>
      <p>
        <Link to="/players">← プレイヤー一覧へ</Link>
      </p>
      <section className="card">
        <h2>
          {detail.name} <span className="muted">ID: {detail.playerId}</span>
        </h2>
        <div className="stat-grid">
          <div className="stat">
            参加大会数<b>{detail.history.length}</b>
          </div>
          {detail.seriesAttendance.map((s) => (
            <div className="stat" key={s.seriesId}>
              {s.seriesName}
              <b>
                {s.attended}/{s.total}回
              </b>
            </div>
          ))}
        </div>
        <DataTable
          columns={columns}
          rows={detail.history}
          rowKey={(h) => h.tournament.id}
          onRowClick={(h) => navigate(`/tournaments/${h.tournament.id}`)}
        />
      </section>
    </>
  );
}
