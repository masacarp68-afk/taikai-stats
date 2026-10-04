import { Navigate, NavLink, Route, Routes } from 'react-router';
import { useDataset } from './db/useDataset';
import { DataPage } from './pages/DataPage';
import { PlayerDetailPage } from './pages/PlayerDetailPage';
import { PlayersPage } from './pages/PlayersPage';
import { SeriesPage } from './pages/SeriesPage';
import { TournamentDetailPage } from './pages/TournamentDetailPage';
import { TournamentsPage } from './pages/TournamentsPage';

const TABS = [
  { to: '/players', label: 'プレイヤー' },
  { to: '/tournaments', label: '大会' },
  { to: '/series', label: 'シリーズ' },
  { to: '/data', label: 'データ管理' },
];

export default function App() {
  const data = useDataset();
  return (
    <div className="app">
      <header className="app-header">
        <h1>大会参加者統計</h1>
        <nav className="tabs">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main>
        {data === undefined ? (
          <p className="muted">読み込み中…</p>
        ) : (
          <Routes>
            <Route path="/players" element={<PlayersPage data={data} />} />
            <Route path="/players/:playerId" element={<PlayerDetailPage data={data} />} />
            <Route path="/tournaments" element={<TournamentsPage data={data} />} />
            <Route path="/tournaments/:tournamentId" element={<TournamentDetailPage data={data} />} />
            <Route path="/series" element={<SeriesPage data={data} />} />
            <Route path="/data" element={<DataPage data={data} />} />
            <Route path="*" element={<Navigate to={data.tournaments.length > 0 ? '/players' : '/data'} replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
