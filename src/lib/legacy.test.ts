import { describe, expect, it } from 'vitest';
import { migrateLegacy, type LegacyResult, type LegacyTournament } from './legacy';
import { DEFAULT_PART_NAME } from './types';

const tournaments: LegacyTournament[] = [
  { id: 't1', seriesId: 's1', label: '第1回', startDate: '2026-01-10', endDate: '2026-01-10', mahjongSoulId: '708677', importedAt: 5 },
  { id: 't2', seriesId: 's1', label: '第2回', startDate: '2026-02-10', endDate: '2026-02-10', mahjongSoulId: null, importedAt: 6 },
];
const results: LegacyResult[] = [
  { id: 'r1', tournamentId: 't1', playerId: '111', playerName: 'A', rank: 1, games: 3, totalPoints: 1 },
  { id: 'r2', tournamentId: 't2', playerId: '111', playerName: 'A', rank: 2, games: 4, totalPoints: 2 },
];

describe('migrateLegacy', () => {
  it('大会ごとにパートを1つ作り、大会IDをパートへ移し、成績にパートを付ける', () => {
    let n = 0;
    const m = migrateLegacy(tournaments, results, () => `p${++n}`);
    expect(m.parts).toEqual([
      { id: 'p1', tournamentId: 't1', name: DEFAULT_PART_NAME, mahjongSoulId: '708677', importedAt: 5 },
      { id: 'p2', tournamentId: 't2', name: DEFAULT_PART_NAME, mahjongSoulId: null, importedAt: 6 },
    ]);
    expect(m.tournaments).toEqual([
      { id: 't1', seriesId: 's1', label: '第1回', startDate: '2026-01-10', endDate: '2026-01-10', importedAt: 5 },
      { id: 't2', seriesId: 's1', label: '第2回', startDate: '2026-02-10', endDate: '2026-02-10', importedAt: 6 },
    ]);
    expect(m.results.map((r) => [r.id, r.tournamentId, r.partId])).toEqual([
      ['r1', 't1', 'p1'],
      ['r2', 't2', 'p2'],
    ]);
  });
});
