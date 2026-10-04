import type { Dataset, Result, Series, Tournament } from './types';

const UNKNOWN_SERIES = '(不明なシリーズ)';
const round1 = (n: number) => Math.round(n * 10) / 10;

export function sortTournaments(ts: Tournament[]): Tournament[] {
  return [...ts].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.importedAt - b.importedAt);
}

export function tournamentTitle(t: Tournament, series: Series | undefined): string {
  return `${series?.name ?? UNKNOWN_SERIES} ${t.label}`.trim();
}

type Index = {
  ordered: Tournament[];
  seriesById: Map<string, Series>;
  resultsByTournament: Map<string, Result[]>;
  /** 最新の大会での名前 */
  latestName: Map<string, string>;
};

function buildIndex(data: Dataset): Index {
  const ordered = sortTournaments(data.tournaments);
  const seriesById = new Map(data.series.map((s) => [s.id, s]));
  const resultsByTournament = new Map<string, Result[]>();
  for (const r of data.results) {
    const list = resultsByTournament.get(r.tournamentId) ?? [];
    list.push(r);
    resultsByTournament.set(r.tournamentId, list);
  }
  const latestName = new Map<string, string>();
  for (const t of ordered) {
    for (const r of resultsByTournament.get(t.id) ?? []) latestName.set(r.playerId, r.playerName);
  }
  return { ordered, seriesById, resultsByTournament, latestName };
}

export type PlayerSummary = {
  playerId: string;
  name: string;
  tournamentCount: number;
  totalGames: number;
  totalPoints: number;
  lastTournamentId: string;
};

export function summarizePlayers(data: Dataset, seriesId?: string): PlayerSummary[] {
  const idx = buildIndex(data);
  const map = new Map<string, PlayerSummary>();
  for (const t of idx.ordered) {
    if (seriesId && t.seriesId !== seriesId) continue;
    for (const r of idx.resultsByTournament.get(t.id) ?? []) {
      const s = map.get(r.playerId) ?? {
        playerId: r.playerId,
        name: idx.latestName.get(r.playerId) ?? r.playerName,
        tournamentCount: 0,
        totalGames: 0,
        totalPoints: 0,
        lastTournamentId: t.id,
      };
      s.tournamentCount += 1;
      s.totalGames += r.games;
      s.totalPoints += r.totalPoints;
      s.lastTournamentId = t.id;
      map.set(r.playerId, s);
    }
  }
  return [...map.values()]
    .map((s) => ({ ...s, totalPoints: round1(s.totalPoints) }))
    .sort((a, b) => b.tournamentCount - a.tournamentCount || b.totalGames - a.totalGames);
}

export type PlayerHistoryEntry = {
  tournament: Tournament;
  title: string;
  rank: number;
  games: number;
  totalPoints: number;
};

export type SeriesAttendance = {
  seriesId: string;
  seriesName: string;
  attended: number;
  total: number;
};

export type PlayerDetail = {
  playerId: string;
  name: string;
  history: PlayerHistoryEntry[];
  seriesAttendance: SeriesAttendance[];
};

export function getPlayerDetail(data: Dataset, playerId: string): PlayerDetail | null {
  const idx = buildIndex(data);
  const history: PlayerHistoryEntry[] = [];
  const totals = new Map<string, number>();
  const attended = new Map<string, number>();
  for (const t of idx.ordered) {
    totals.set(t.seriesId, (totals.get(t.seriesId) ?? 0) + 1);
    const r = idx.resultsByTournament.get(t.id)?.find((x) => x.playerId === playerId);
    if (!r) continue;
    attended.set(t.seriesId, (attended.get(t.seriesId) ?? 0) + 1);
    history.push({
      tournament: t,
      title: tournamentTitle(t, idx.seriesById.get(t.seriesId)),
      rank: r.rank,
      games: r.games,
      totalPoints: r.totalPoints,
    });
  }
  if (history.length === 0) return null;
  const seriesAttendance = [...attended].map(([seriesId, n]) => ({
    seriesId,
    seriesName: idx.seriesById.get(seriesId)?.name ?? UNKNOWN_SERIES,
    attended: n,
    total: totals.get(seriesId) ?? n,
  }));
  return { playerId, name: idx.latestName.get(playerId) ?? '', history, seriesAttendance };
}

export type TournamentStat = {
  tournament: Tournament;
  title: string;
  participants: number;
  newcomers: number;
  repeaters: number;
  /** 同シリーズ前回参加者のうち今回も参加した割合。前回がなければ null */
  retention: number | null;
};

export function tournamentStats(data: Dataset): TournamentStat[] {
  const idx = buildIndex(data);
  const seen = new Set<string>();
  const prevBySeries = new Map<string, Set<string>>();
  return idx.ordered.map((t) => {
    const ids = new Set((idx.resultsByTournament.get(t.id) ?? []).map((r) => r.playerId));
    let newcomers = 0;
    for (const id of ids) {
      if (!seen.has(id)) newcomers++;
      seen.add(id);
    }
    const prev = prevBySeries.get(t.seriesId);
    let retention: number | null = null;
    if (prev && prev.size > 0) {
      let kept = 0;
      for (const id of prev) if (ids.has(id)) kept++;
      retention = kept / prev.size;
    }
    prevBySeries.set(t.seriesId, ids);
    return {
      tournament: t,
      title: tournamentTitle(t, idx.seriesById.get(t.seriesId)),
      participants: ids.size,
      newcomers,
      repeaters: ids.size - newcomers,
      retention,
    };
  });
}

export type SeriesPlayerStat = {
  playerId: string;
  name: string;
  attended: number;
  totalGames: number;
  totalPoints: number;
};

export type SeriesStat = {
  series: Series;
  tournamentCount: number;
  totalEntries: number;
  uniquePlayers: number;
  perfectAttendance: SeriesPlayerStat[];
  /** 参加回数の多い順（同数なら対局数の多い順） */
  players: SeriesPlayerStat[];
};

export function seriesStats(data: Dataset): SeriesStat[] {
  const idx = buildIndex(data);
  return data.series
    .map((series) => {
      const ts = idx.ordered.filter((t) => t.seriesId === series.id);
      const map = new Map<string, SeriesPlayerStat>();
      let totalEntries = 0;
      for (const t of ts) {
        for (const r of idx.resultsByTournament.get(t.id) ?? []) {
          totalEntries++;
          const p = map.get(r.playerId) ?? {
            playerId: r.playerId,
            name: idx.latestName.get(r.playerId) ?? r.playerName,
            attended: 0,
            totalGames: 0,
            totalPoints: 0,
          };
          p.attended += 1;
          p.totalGames += r.games;
          p.totalPoints += r.totalPoints;
          map.set(r.playerId, p);
        }
      }
      const players = [...map.values()]
        .map((p) => ({ ...p, totalPoints: round1(p.totalPoints) }))
        .sort((a, b) => b.attended - a.attended || b.totalGames - a.totalGames);
      return {
        series,
        tournamentCount: ts.length,
        totalEntries,
        uniquePlayers: players.length,
        perfectAttendance: players.filter((p) => p.attended === ts.length),
        players,
      };
    })
    .filter((s) => s.tournamentCount > 0);
}
