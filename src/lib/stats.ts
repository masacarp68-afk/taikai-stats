import type { Dataset, Part, PartRank, Result, Series, Tournament } from './types';

const UNKNOWN_SERIES = '(不明なシリーズ)';
const round1 = (n: number) => Math.round(n * 10) / 10;

export function sortTournaments(ts: Tournament[]): Tournament[] {
  return [...ts].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.importedAt - b.importedAt);
}

/** パート名の自然順（2-1, 2-2, 2-10）→ 取り込み順 */
export function sortParts(parts: Part[]): Part[] {
  return [...parts].sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true }) || a.importedAt - b.importedAt);
}

export function tournamentTitle(t: Tournament, series: Series | undefined): string {
  return `${series?.name ?? UNKNOWN_SERIES} ${t.label}`.trim();
}

/** 1大会での1人分の成績（全パート合算） */
export type TournamentEntry = {
  playerId: string;
  /** 最後のパートでの名前 */
  playerName: string;
  games: number;
  totalPoints: number;
  ranks: PartRank[];
};

type Index = {
  ordered: Tournament[];
  seriesById: Map<string, Series>;
  partsByTournament: Map<string, Part[]>;
  resultsByPart: Map<string, Result[]>;
  entriesByTournament: Map<string, TournamentEntry[]>;
  /** 最新の大会での名前 */
  latestName: Map<string, string>;
};

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(key(item)) ?? [];
    list.push(item);
    map.set(key(item), list);
  }
  return map;
}

function buildIndex(data: Dataset): Index {
  const ordered = sortTournaments(data.tournaments);
  const seriesById = new Map(data.series.map((s) => [s.id, s]));
  const partsByTournament = new Map([...groupBy(data.parts, (p) => p.tournamentId)].map(([id, ps]) => [id, sortParts(ps)]));
  const resultsByPart = groupBy(data.results, (r) => r.partId);

  const entriesByTournament = new Map<string, TournamentEntry[]>();
  for (const t of ordered) {
    const byPlayer = new Map<string, TournamentEntry>();
    for (const part of partsByTournament.get(t.id) ?? []) {
      for (const r of resultsByPart.get(part.id) ?? []) {
        const e = byPlayer.get(r.playerId) ?? { playerId: r.playerId, playerName: r.playerName, games: 0, totalPoints: 0, ranks: [] };
        e.playerName = r.playerName;
        e.games += r.games;
        e.totalPoints += r.totalPoints;
        e.ranks.push({ partId: part.id, partName: part.name, rank: r.rank });
        byPlayer.set(r.playerId, e);
      }
    }
    entriesByTournament.set(
      t.id,
      [...byPlayer.values()].map((e) => ({ ...e, totalPoints: round1(e.totalPoints) })),
    );
  }

  const latestName = new Map<string, string>();
  for (const t of ordered) {
    for (const e of entriesByTournament.get(t.id) ?? []) latestName.set(e.playerId, e.playerName);
  }
  return { ordered, seriesById, partsByTournament, resultsByPart, entriesByTournament, latestName };
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
    for (const e of idx.entriesByTournament.get(t.id) ?? []) {
      const s = map.get(e.playerId) ?? {
        playerId: e.playerId,
        name: idx.latestName.get(e.playerId) ?? e.playerName,
        tournamentCount: 0,
        totalGames: 0,
        totalPoints: 0,
        lastTournamentId: t.id,
      };
      s.tournamentCount += 1;
      s.totalGames += e.games;
      s.totalPoints += e.totalPoints;
      s.lastTournamentId = t.id;
      map.set(e.playerId, s);
    }
  }
  return [...map.values()]
    .map((s) => ({ ...s, totalPoints: round1(s.totalPoints) }))
    .sort((a, b) => b.tournamentCount - a.tournamentCount || b.totalGames - a.totalGames);
}

export type PlayerHistoryEntry = {
  tournament: Tournament;
  title: string;
  /** パートごとの順位（パート順） */
  ranks: PartRank[];
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
    const e = idx.entriesByTournament.get(t.id)?.find((x) => x.playerId === playerId);
    if (!e) continue;
    attended.set(t.seriesId, (attended.get(t.seriesId) ?? 0) + 1);
    history.push({
      tournament: t,
      title: tournamentTitle(t, idx.seriesById.get(t.seriesId)),
      ranks: e.ranks,
      games: e.games,
      totalPoints: e.totalPoints,
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
    const ids = new Set((idx.entriesByTournament.get(t.id) ?? []).map((e) => e.playerId));
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

export type TournamentDetail = {
  stat: TournamentStat;
  /** パート順。各パートの成績は順位順 */
  parts: { part: Part; results: Result[] }[];
  /** 全パート合算。打点合計の多い順（同点なら対局数の多い順） */
  combined: TournamentEntry[];
};

export function getTournamentDetail(data: Dataset, tournamentId: string): TournamentDetail | null {
  const stat = tournamentStats(data).find((s) => s.tournament.id === tournamentId);
  if (!stat) return null;
  const idx = buildIndex(data);
  const parts = (idx.partsByTournament.get(tournamentId) ?? []).map((part) => ({
    part,
    results: [...(idx.resultsByPart.get(part.id) ?? [])].sort((a, b) => a.rank - b.rank),
  }));
  const combined = [...(idx.entriesByTournament.get(tournamentId) ?? [])].sort(
    (a, b) => b.totalPoints - a.totalPoints || b.games - a.games,
  );
  return { stat, parts, combined };
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
        for (const e of idx.entriesByTournament.get(t.id) ?? []) {
          totalEntries++;
          const p = map.get(e.playerId) ?? {
            playerId: e.playerId,
            name: idx.latestName.get(e.playerId) ?? e.playerName,
            attended: 0,
            totalGames: 0,
            totalPoints: 0,
          };
          p.attended += 1;
          p.totalGames += e.games;
          p.totalPoints += e.totalPoints;
          map.set(e.playerId, p);
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
