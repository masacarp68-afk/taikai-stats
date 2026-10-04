import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ParsedRow } from '../lib/types';
import { TaikaiDB } from './schema';
import {
  deleteTournament,
  findTournamentByMahjongSoulId,
  importTournament,
  loadDataset,
  renameSeries,
  replaceAll,
  updateTournament,
} from './repo';

const rows: ParsedRow[] = [
  { rank: 1, playerId: '111', playerName: 'A', games: 10, totalPoints: 12.3 },
  { rank: 2, playerId: '222', playerName: 'B', games: 8, totalPoints: -5 },
];

let db: TaikaiDB;
beforeEach(() => {
  db = new TaikaiDB(`test-${crypto.randomUUID()}`);
});

const baseInput = {
  label: '第1回',
  startDate: '2026-01-10',
  endDate: '2026-01-12',
  mahjongSoulId: '708677',
  rows,
};

describe('importTournament', () => {
  it('存在しないシリーズIDならエラーにして何も保存しない', async () => {
    await expect(importTournament(db, { ...baseInput, series: { id: 'nope' } })).rejects.toThrow('選択したシリーズが見つかりません');
    const data = await loadDataset(db);
    expect(data.tournaments).toHaveLength(0);
    expect(data.results).toHaveLength(0);
  });

  it('新しいシリーズを作って大会と成績を保存する', async () => {
    const id = await importTournament(db, { ...baseInput, series: { newName: ' 深海杯 ' } });
    const data = await loadDataset(db);
    expect(data.series).toHaveLength(1);
    expect(data.series[0].name).toBe('深海杯');
    expect(data.tournaments).toEqual([
      expect.objectContaining({ id, seriesId: data.series[0].id, label: '第1回', startDate: '2026-01-10', endDate: '2026-01-12', mahjongSoulId: '708677' }),
    ]);
    expect(data.results.map((r) => [r.tournamentId, r.playerId])).toEqual([
      [id, '111'],
      [id, '222'],
    ]);
  });

  it('既存シリーズに追加できる', async () => {
    await importTournament(db, { ...baseInput, series: { newName: '深海杯' } });
    const seriesId = (await loadDataset(db)).series[0].id;
    await importTournament(db, { ...baseInput, label: '第2回', mahjongSoulId: null, series: { id: seriesId } });
    const data = await loadDataset(db);
    expect(data.series).toHaveLength(1);
    expect(data.tournaments.map((t) => t.seriesId)).toEqual([seriesId, seriesId]);
  });

  it('終了日が空なら開始日と同じにする', async () => {
    await importTournament(db, { ...baseInput, endDate: '', series: { newName: 'X' } });
    expect((await loadDataset(db)).tournaments[0].endDate).toBe('2026-01-10');
  });

  it('上書きすると成績を差し替え、IDと取り込み時刻は維持する', async () => {
    const id = await importTournament(db, { ...baseInput, series: { newName: 'X' } });
    const before = (await loadDataset(db)).tournaments[0];
    const found = await findTournamentByMahjongSoulId(db, '708677');
    expect(found?.id).toBe(id);

    const newRows: ParsedRow[] = [{ rank: 1, playerId: '333', playerName: 'C', games: 3, totalPoints: 1 }];
    const id2 = await importTournament(db, { ...baseInput, rows: newRows, series: { id: before.seriesId } }, id);
    const data = await loadDataset(db);
    expect(id2).toBe(id);
    expect(data.tournaments).toHaveLength(1);
    expect(data.tournaments[0].importedAt).toBe(before.importedAt);
    expect(data.results.map((r) => r.playerId)).toEqual(['333']);
  });
});

describe('大会・シリーズの編集', () => {
  it('大会を更新できる（終了日が空なら開始日）', async () => {
    const id = await importTournament(db, { ...baseInput, series: { newName: 'X' } });
    const seriesId = (await loadDataset(db)).series[0].id;
    await updateTournament(db, id, { seriesId, label: '第9回', startDate: '2026-05-01', endDate: '' });
    const t = (await loadDataset(db)).tournaments[0];
    expect([t.label, t.startDate, t.endDate]).toEqual(['第9回', '2026-05-01', '2026-05-01']);
  });

  it('大会を削除すると成績も消える', async () => {
    const id = await importTournament(db, { ...baseInput, series: { newName: 'X' } });
    await deleteTournament(db, id);
    const data = await loadDataset(db);
    expect(data.tournaments).toHaveLength(0);
    expect(data.results).toHaveLength(0);
  });

  it('シリーズ名を変更できる', async () => {
    await importTournament(db, { ...baseInput, series: { newName: 'X' } });
    const seriesId = (await loadDataset(db)).series[0].id;
    await renameSeries(db, seriesId, '夏宵');
    expect((await loadDataset(db)).series[0].name).toBe('夏宵');
  });
});

describe('replaceAll', () => {
  it('全データを置き換える', async () => {
    await importTournament(db, { ...baseInput, series: { newName: 'X' } });
    await replaceAll(db, {
      series: [{ id: 's9', name: 'Y' }],
      tournaments: [{ id: 't9', seriesId: 's9', label: '', startDate: '2026-02-01', endDate: '2026-02-01', mahjongSoulId: null, importedAt: 5 }],
      results: [{ id: 'r9', tournamentId: 't9', playerId: '999', playerName: 'Z', rank: 1, games: 1, totalPoints: 0 }],
    });
    const data = await loadDataset(db);
    expect(data.series.map((s) => s.id)).toEqual(['s9']);
    expect(data.tournaments.map((t) => t.id)).toEqual(['t9']);
    expect(data.results.map((r) => r.id)).toEqual(['r9']);
  });
});
