import { describe, expect, it } from 'vitest';
import { createBackup, parseBackup } from './backup';
import { DEFAULT_PART_NAME, type Dataset } from './types';

const data: Dataset = {
  series: [{ id: 's1', name: '夏宵' }],
  tournaments: [{ id: 't1', seriesId: 's1', label: '2', startDate: '2026-08-14', endDate: '2026-08-16', importedAt: 1 }],
  parts: [
    { id: 'p1', tournamentId: 't1', name: '2-1', mahjongSoulId: '708677', importedAt: 1 },
    { id: 'p2', tournamentId: 't1', name: '2-2', mahjongSoulId: null, importedAt: 2 },
  ],
  results: [
    { id: 'r1', tournamentId: 't1', partId: 'p1', playerId: '111', playerName: 'A', rank: 1, games: 10, totalPoints: 12.3 },
    { id: 'r2', tournamentId: 't1', partId: 'p2', playerId: '111', playerName: 'A', rank: 3, games: 5, totalPoints: -2 },
  ],
};

const v1 = {
  app: 'taikai-stats',
  version: 1,
  exportedAt: '2026-10-04T00:00:00.000Z',
  data: {
    series: [{ id: 's1', name: '深海杯' }],
    tournaments: [{ id: 't1', seriesId: 's1', label: '第1回', startDate: '2026-01-10', endDate: '2026-01-12', mahjongSoulId: '708677', importedAt: 1 }],
    results: [{ id: 'r1', tournamentId: 't1', playerId: '111', playerName: 'A', rank: 1, games: 10, totalPoints: 12.3 }],
  },
};

const json = (d: unknown) => JSON.stringify(d);

describe('backup', () => {
  it('書き出したものを読み戻せる（version 2）', () => {
    const b = createBackup(data, new Date('2026-10-07T00:00:00Z'));
    expect([b.version, b.exportedAt]).toEqual([2, '2026-10-07T00:00:00.000Z']);
    expect(parseBackup(json(b))).toEqual({ ok: true, data });
  });

  it('version 1 のバックアップは大会ごとにパート1つの形に変換して読む', () => {
    const parsed = parseBackup(json(v1));
    if (!parsed.ok) throw new Error(parsed.error);
    const { tournaments, parts, results } = parsed.data;
    expect(parts).toEqual([{ id: expect.any(String), tournamentId: 't1', name: DEFAULT_PART_NAME, mahjongSoulId: '708677', importedAt: 1 }]);
    expect(tournaments[0]).not.toHaveProperty('mahjongSoulId');
    expect(results[0].partId).toBe(parts[0].id);
  });

  it('JSONでない・このアプリのものでない・未知のバージョンはエラー', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, error: 'JSONとして読み込めません' });
    expect(parseBackup(json({ ...createBackup(data), app: 'other' })).ok).toBe(false);
    expect(parseBackup(json({ ...createBackup(data), version: 3 })).ok).toBe(false);
  });

  it('項目が欠けていればエラー', () => {
    const noParts = { ...createBackup(data), data: { ...data, parts: undefined } };
    expect(parseBackup(json(noParts))).toEqual({ ok: false, error: 'パートのデータが壊れています' });
    const noPartId = createBackup({ ...data, results: [{ ...data.results[0], partId: undefined as unknown as string }] });
    expect(parseBackup(json(noPartId))).toEqual({ ok: false, error: '成績のデータが壊れています' });
    const v1Broken = { ...v1, data: { ...v1.data, tournaments: [{ ...v1.data.tournaments[0], mahjongSoulId: 5 }] } };
    expect(parseBackup(json(v1Broken))).toEqual({ ok: false, error: '大会のデータが壊れています' });
  });

  it('存在しないシリーズ・大会・パートへの参照があればエラー', () => {
    const badSeries = createBackup({ ...data, tournaments: [{ ...data.tournaments[0], seriesId: 'zzz' }] });
    expect(parseBackup(json(badSeries))).toEqual({ ok: false, error: '存在しないシリーズを参照している大会があります' });
    const badPart = createBackup({ ...data, parts: [{ ...data.parts[0], tournamentId: 'zzz' }, data.parts[1]] });
    expect(parseBackup(json(badPart))).toEqual({ ok: false, error: '存在しない大会を参照しているパートがあります' });
    const badResult = createBackup({ ...data, results: [{ ...data.results[0], partId: 'zzz' }] });
    expect(parseBackup(json(badResult))).toEqual({ ok: false, error: '存在しないパートを参照している成績があります' });
    const mismatch = createBackup({ ...data, results: [{ ...data.results[0], tournamentId: 't9' }] });
    expect(parseBackup(json(mismatch))).toEqual({ ok: false, error: '存在しないパートを参照している成績があります' });
  });
});
