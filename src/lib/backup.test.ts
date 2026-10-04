import { describe, expect, it } from 'vitest';
import type { Dataset } from './types';
import { createBackup, parseBackup } from './backup';

const data: Dataset = {
  series: [{ id: 's1', name: '深海杯' }],
  tournaments: [
    { id: 't1', seriesId: 's1', label: '第1回', startDate: '2026-01-10', endDate: '2026-01-12', mahjongSoulId: '708677', importedAt: 1 },
  ],
  results: [
    { id: 'r1', tournamentId: 't1', playerId: '111', playerName: 'A', rank: 1, games: 10, totalPoints: 12.3 },
  ],
};

describe('backup', () => {
  it('書き出したものを読み戻せる', () => {
    const json = JSON.stringify(createBackup(data, new Date('2026-10-04T00:00:00Z')));
    expect(JSON.parse(json).exportedAt).toBe('2026-10-04T00:00:00.000Z');
    expect(parseBackup(json)).toEqual({ ok: true, data });
  });

  it('JSONでなければエラー', () => {
    expect(parseBackup('not json').ok).toBe(false);
  });

  it('このアプリのバックアップでなければエラー', () => {
    expect(parseBackup(JSON.stringify({ app: 'other', version: 1, data })).ok).toBe(false);
  });

  it('項目が欠けていればエラー', () => {
    const broken = { ...data, results: [{ ...data.results[0], games: undefined }] };
    expect(parseBackup(JSON.stringify(createBackup(broken as unknown as Dataset))).ok).toBe(false);
  });

  it('存在しない大会・シリーズへの参照があればエラー', () => {
    const badResult = { ...data, results: [{ ...data.results[0], tournamentId: 'zzz' }] };
    expect(parseBackup(JSON.stringify(createBackup(badResult))).ok).toBe(false);
    const badTournament = { ...data, tournaments: [{ ...data.tournaments[0], seriesId: 'zzz' }] };
    expect(parseBackup(JSON.stringify(createBackup(badTournament))).ok).toBe(false);
  });
});
