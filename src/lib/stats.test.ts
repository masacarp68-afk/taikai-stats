import { describe, expect, it } from 'vitest';
import type { Dataset, Part, Result, Series, Tournament } from './types';
import {
  getPlayerDetail,
  getTournamentDetail,
  seriesStats,
  sortParts,
  sortTournaments,
  summarizePlayers,
  tournamentStats,
  tournamentTitle,
} from './stats';

const S = (id: string, name: string): Series => ({ id, name });
const T = (id: string, seriesId: string, label: string, startDate: string, endDate = startDate, importedAt = 0): Tournament => ({
  id,
  seriesId,
  label,
  startDate,
  endDate,
  importedAt,
});
const P = (id: string, tournamentId: string, name: string, importedAt = 0): Part => ({
  id,
  tournamentId,
  name,
  mahjongSoulId: null,
  importedAt,
});
let seq = 0;
/** partId は「大会ID:番号」。大会IDは partId から取る */
const R = (partId: string, playerId: string, playerName: string, games: number, totalPoints: number, rank: number): Result => ({
  id: `r${seq++}`,
  tournamentId: partId.split(':')[0],
  partId,
  playerId,
  playerName,
  rank,
  games,
  totalPoints,
});

// 深海杯(A): 第1回 1/10, 第2回 3/1〜3/15 ／ 夏宵(B): 2/1〜2/7（回の表記なし）／ 空シリーズ(C)。各大会パート1つ
const data: Dataset = {
  series: [S('A', '深海杯'), S('B', '夏宵'), S('C', '空シリーズ')],
  tournaments: [T('a2', 'A', '第2回', '2026-03-01', '2026-03-15'), T('a1', 'A', '第1回', '2026-01-10'), T('b1', 'B', '', '2026-02-01', '2026-02-07')],
  parts: [P('a1:1', 'a1', 'パート1'), P('a2:1', 'a2', 'パート1'), P('b1:1', 'b1', 'パート1')],
  results: [
    R('a1:1', 'p1', 'Alice', 10, 100.5, 1),
    R('a1:1', 'p2', 'Bob', 8, -20, 2),
    R('b1:1', 'p1', 'Alice2', 5, 30, 1),
    R('b1:1', 'p3', 'Carol', 6, 10, 2),
    R('a2:1', 'p1', 'Alice3', 12, 50.2, 2),
    R('a2:1', 'p3', 'Carol', 9, 40, 1),
  ],
};

describe('sortTournaments', () => {
  it('開始日順に並べる', () => {
    expect(sortTournaments(data.tournaments).map((t) => t.id)).toEqual(['a1', 'b1', 'a2']);
  });
  it('開始日が同じなら取り込み順', () => {
    const ts = [T('x', 'A', '', '2026-01-01', '2026-01-01', 200), T('y', 'A', '', '2026-01-01', '2026-01-01', 100)];
    expect(sortTournaments(ts).map((t) => t.id)).toEqual(['y', 'x']);
  });
});

describe('tournamentTitle', () => {
  it('シリーズ名と回をつなげる。回が空ならシリーズ名だけ', () => {
    expect(tournamentTitle(data.tournaments[0], data.series[0])).toBe('深海杯 第2回');
    expect(tournamentTitle(data.tournaments[2], data.series[1])).toBe('夏宵');
  });
});

describe('summarizePlayers', () => {
  it('全大会の参加数・対局数・打点を合計し、最新の名前を使う', () => {
    const ps = summarizePlayers(data);
    expect(ps.map((p) => p.playerId)).toEqual(['p1', 'p3', 'p2']);
    expect(ps[0]).toEqual({ playerId: 'p1', name: 'Alice3', tournamentCount: 3, totalGames: 27, totalPoints: 180.7, lastTournamentId: 'a2' });
    expect(ps[1]).toMatchObject({ tournamentCount: 2, totalGames: 15, totalPoints: 50, lastTournamentId: 'a2' });
  });
  it('シリーズで絞り込める', () => {
    const ps = summarizePlayers(data, 'A');
    expect(ps.map((p) => [p.playerId, p.tournamentCount, p.totalGames])).toEqual([
      ['p1', 2, 22],
      ['p3', 1, 9],
      ['p2', 1, 8],
    ]);
    expect(ps[0].totalPoints).toBe(150.7);
  });
});

describe('getPlayerDetail', () => {
  it('参加履歴とシリーズ別参加回数を返す', () => {
    const d = getPlayerDetail(data, 'p3')!;
    expect(d.name).toBe('Carol');
    expect(d.history.map((h) => [h.title, h.ranks.map((r) => r.rank), h.games, h.totalPoints])).toEqual([
      ['夏宵', [2], 6, 10],
      ['深海杯 第2回', [1], 9, 40],
    ]);
    expect(d.seriesAttendance).toEqual([
      { seriesId: 'B', seriesName: '夏宵', attended: 1, total: 1 },
      { seriesId: 'A', seriesName: '深海杯', attended: 1, total: 2 },
    ]);
  });
  it('存在しないプレイヤーは null', () => {
    expect(getPlayerDetail(data, 'nope')).toBeNull();
  });
});

describe('tournamentStats', () => {
  it('参加人数・新規・リピーター・継続率を出す', () => {
    expect(tournamentStats(data).map((s) => [s.tournament.id, s.title, s.participants, s.newcomers, s.repeaters, s.retention])).toEqual([
      ['a1', '深海杯 第1回', 2, 2, 0, null],
      ['b1', '夏宵', 2, 1, 1, null],
      ['a2', '深海杯 第2回', 2, 0, 2, 0.5],
    ]);
  });
});

describe('seriesStats', () => {
  it('シリーズごとの集計と皆勤者を出し、大会のないシリーズは除く', () => {
    const st = seriesStats(data);
    expect(st.map((s) => s.series.id)).toEqual(['A', 'B']);
    const a = st[0];
    expect([a.tournamentCount, a.totalEntries, a.uniquePlayers]).toEqual([2, 4, 3]);
    expect(a.perfectAttendance.map((p) => p.playerId)).toEqual(['p1']);
    expect(a.players.map((p) => [p.playerId, p.attended, p.totalGames, p.totalPoints])).toEqual([
      ['p1', 2, 22, 150.7],
      ['p3', 1, 9, 40],
      ['p2', 1, 8, -20],
    ]);
    expect(st[1].perfectAttendance.map((p) => p.playerId)).toEqual(['p3', 'p1']);
  });
});

// 夏宵(S) 2: パート 2-1 / 2-2 / 2-10。p1 は 2-1 と 2-2、p2 は 2-1 のみ、p3 は 2-10 のみ
const multi: Dataset = {
  series: [S('S', '夏宵')],
  tournaments: [T('m', 'S', '2', '2026-08-14', '2026-08-16')],
  parts: [P('m:10', 'm', '2-10'), P('m:1', 'm', '2-1'), P('m:2', 'm', '2-2')],
  results: [R('m:1', 'p1', 'Old', 10, 100, 1), R('m:1', 'p2', 'Bob', 5, -20, 2), R('m:2', 'p1', 'New', 7, 50.5, 3), R('m:10', 'p3', 'Cid', 4, 30, 1)],
};

describe('複数パートの大会', () => {
  it('パートは名前の数字順に並ぶ', () => {
    expect(sortParts(multi.parts).map((p) => p.name)).toEqual(['2-1', '2-2', '2-10']);
  });

  it('パート名が同じなら取り込み順', () => {
    expect(sortParts([P('x', 'm', 'A', 2), P('y', 'm', 'A', 1)]).map((p) => p.id)).toEqual(['y', 'x']);
  });

  it('参加人数はどれかのパートに出た人を1人と数える', () => {
    const [s] = tournamentStats(multi);
    expect([s.participants, s.newcomers, s.repeaters]).toEqual([3, 3, 0]);
  });

  it('参加大会数は1、対局数と打点は全パート合計、名前は最後のパートのもの', () => {
    expect(summarizePlayers(multi).find((p) => p.playerId === 'p1')).toEqual({
      playerId: 'p1',
      name: 'New',
      tournamentCount: 1,
      totalGames: 17,
      totalPoints: 150.5,
      lastTournamentId: 'm',
    });
  });

  it('プレイヤー詳細はパートごとの順位を持つ', () => {
    const d = getPlayerDetail(multi, 'p1')!;
    expect(d.history).toHaveLength(1);
    expect(d.history[0].ranks).toEqual([
      { partId: 'm:1', partName: '2-1', rank: 1 },
      { partId: 'm:2', partName: '2-2', rank: 3 },
    ]);
    expect([d.history[0].games, d.history[0].totalPoints]).toEqual([17, 150.5]);
    expect(d.seriesAttendance).toEqual([{ seriesId: 'S', seriesName: '夏宵', attended: 1, total: 1 }]);
  });

  it('シリーズ集計は大会単位で数える', () => {
    const [s] = seriesStats(multi);
    expect([s.tournamentCount, s.totalEntries, s.uniquePlayers]).toEqual([1, 3, 3]);
    expect(s.players.find((p) => p.playerId === 'p1')).toEqual({ playerId: 'p1', name: 'New', attended: 1, totalGames: 17, totalPoints: 150.5 });
  });

  it('大会詳細はパート別の順位表と合算を返す', () => {
    const d = getTournamentDetail(multi, 'm')!;
    expect(d.stat.participants).toBe(3);
    expect(d.parts.map((x) => [x.part.name, x.results.map((r) => r.playerId)])).toEqual([
      ['2-1', ['p1', 'p2']],
      ['2-2', ['p1']],
      ['2-10', ['p3']],
    ]);
    expect(d.combined.map((e) => [e.playerId, e.games, e.totalPoints, e.ranks.length])).toEqual([
      ['p1', 17, 150.5, 2],
      ['p3', 4, 30, 1],
      ['p2', 5, -20, 1],
    ]);
  });

  it('存在しない大会の詳細は null', () => {
    expect(getTournamentDetail(multi, 'x')).toBeNull();
  });
});
