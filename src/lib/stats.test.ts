import { describe, expect, it } from 'vitest';
import type { Dataset, Result, Series, Tournament } from './types';
import {
  getPlayerDetail,
  seriesStats,
  sortTournaments,
  summarizePlayers,
  tournamentStats,
  tournamentTitle,
} from './stats';

const S = (id: string, name: string): Series => ({ id, name });
const T = (
  id: string,
  seriesId: string,
  label: string,
  startDate: string,
  endDate = startDate,
  importedAt = 0,
): Tournament => ({ id, seriesId, label, startDate, endDate, mahjongSoulId: null, importedAt });
let seq = 0;
const R = (
  tournamentId: string,
  playerId: string,
  playerName: string,
  games: number,
  totalPoints: number,
  rank: number,
): Result => ({ id: `r${seq++}`, tournamentId, playerId, playerName, rank, games, totalPoints });

// 深海杯(A): 第1回 1/10, 第2回 3/1〜3/15 ／ 夏宵(B): 2/1〜2/7（回の表記なし）／ 空シリーズ(C)
const data: Dataset = {
  series: [S('A', '深海杯'), S('B', '夏宵'), S('C', '空シリーズ')],
  tournaments: [
    T('a2', 'A', '第2回', '2026-03-01', '2026-03-15'),
    T('a1', 'A', '第1回', '2026-01-10'),
    T('b1', 'B', '', '2026-02-01', '2026-02-07'),
  ],
  results: [
    R('a1', 'p1', 'Alice', 10, 100.5, 1),
    R('a1', 'p2', 'Bob', 8, -20, 2),
    R('b1', 'p1', 'Alice2', 5, 30, 1),
    R('b1', 'p3', 'Carol', 6, 10, 2),
    R('a2', 'p1', 'Alice3', 12, 50.2, 2),
    R('a2', 'p3', 'Carol', 9, 40, 1),
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
    expect(ps[0]).toEqual({
      playerId: 'p1',
      name: 'Alice3',
      tournamentCount: 3,
      totalGames: 27,
      totalPoints: 180.7,
      lastTournamentId: 'a2',
    });
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
    expect(ps[0].name).toBe('Alice3');
  });
});

describe('getPlayerDetail', () => {
  it('参加履歴とシリーズ別参加回数を返す', () => {
    const d = getPlayerDetail(data, 'p3');
    expect(d).not.toBeNull();
    expect(d!.name).toBe('Carol');
    expect(d!.history.map((h) => [h.title, h.rank, h.games, h.totalPoints])).toEqual([
      ['夏宵', 2, 6, 10],
      ['深海杯 第2回', 1, 9, 40],
    ]);
    expect(d!.seriesAttendance).toEqual([
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
    const st = tournamentStats(data);
    expect(st.map((s) => [s.tournament.id, s.title, s.participants, s.newcomers, s.repeaters, s.retention])).toEqual([
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

    const b = st[1];
    expect([b.tournamentCount, b.totalEntries, b.uniquePlayers]).toEqual([1, 2, 2]);
    expect(b.perfectAttendance.map((p) => p.playerId)).toEqual(['p3', 'p1']);
  });
});
