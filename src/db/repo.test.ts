import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PART_NAME, type ParsedRow } from '../lib/types';
import {
  deletePart,
  deleteTournament,
  findPartByMahjongSoulId,
  importPart,
  loadDataset,
  renamePart,
  renameSeries,
  replaceAll,
  updateTournament,
} from './repo';
import { TaikaiDB } from './schema';

const rows: ParsedRow[] = [
  { rank: 1, playerId: '111', playerName: 'A', games: 10, totalPoints: 12.3 },
  { rank: 2, playerId: '222', playerName: 'B', games: 8, totalPoints: -5 },
];

let db: TaikaiDB;
beforeEach(() => {
  db = new TaikaiDB(`test-${crypto.randomUUID()}`);
});

const newTournament = (seriesName = '夏宵', endDate = '2026-08-16') => ({
  newTournament: { series: { newName: seriesName }, label: '2', startDate: '2026-08-14', endDate },
});

describe('importPart', () => {
  it('新しい大会とパートを作って成績を保存する', async () => {
    const { tournamentId, partId } = await importPart(db, {
      target: newTournament(' 夏宵 '),
      partName: ' 2-1 ',
      mahjongSoulId: '708677',
      rows,
    });
    const data = await loadDataset(db);
    expect(data.series.map((s) => s.name)).toEqual(['夏宵']);
    expect(data.tournaments).toEqual([
      expect.objectContaining({ id: tournamentId, seriesId: data.series[0].id, label: '2', startDate: '2026-08-14', endDate: '2026-08-16' }),
    ]);
    expect(data.parts).toEqual([expect.objectContaining({ id: partId, tournamentId, name: '2-1', mahjongSoulId: '708677' })]);
    expect(data.results.map((r) => [r.tournamentId, r.partId, r.playerId])).toEqual([
      [tournamentId, partId, '111'],
      [tournamentId, partId, '222'],
    ]);
  });

  it('既存の大会にパートを追加できる', async () => {
    const first = await importPart(db, { target: newTournament(), partName: '2-1', mahjongSoulId: null, rows });
    const second = await importPart(db, { target: { tournamentId: first.tournamentId }, partName: '2-2', mahjongSoulId: null, rows });
    const data = await loadDataset(db);
    expect(second.tournamentId).toBe(first.tournamentId);
    expect(data.tournaments).toHaveLength(1);
    expect(data.parts.map((p) => p.name).sort()).toEqual(['2-1', '2-2']);
    expect(data.results).toHaveLength(4);
  });

  it('既存シリーズに新しい大会を作れる', async () => {
    await importPart(db, { target: newTournament(), partName: '2-1', mahjongSoulId: null, rows });
    const seriesId = (await loadDataset(db)).series[0].id;
    await importPart(db, {
      target: { newTournament: { series: { id: seriesId }, label: '3', startDate: '2026-09-01', endDate: '' } },
      partName: '3-1',
      mahjongSoulId: null,
      rows,
    });
    const data = await loadDataset(db);
    expect(data.series).toHaveLength(1);
    expect(data.tournaments.map((t) => t.seriesId)).toEqual([seriesId, seriesId]);
  });

  it('終了日が空なら開始日、パート名が空なら既定名にする', async () => {
    await importPart(db, { target: newTournament('X', ''), partName: '  ', mahjongSoulId: null, rows });
    const data = await loadDataset(db);
    expect(data.tournaments[0].endDate).toBe('2026-08-14');
    expect(data.parts[0].name).toBe(DEFAULT_PART_NAME);
  });

  it('存在しないシリーズ・大会を指定するとエラーで何も保存しない', async () => {
    await expect(
      importPart(db, {
        target: { newTournament: { series: { id: 'nope' }, label: '', startDate: '2026-01-01', endDate: '' } },
        partName: 'a',
        mahjongSoulId: null,
        rows,
      }),
    ).rejects.toThrow('選択したシリーズが見つかりません');
    await expect(importPart(db, { target: { tournamentId: 'nope' }, partName: 'a', mahjongSoulId: null, rows })).rejects.toThrow(
      '選択した大会が見つかりません',
    );
    const data = await loadDataset(db);
    expect([data.tournaments.length, data.parts.length, data.results.length]).toEqual([0, 0, 0]);
  });

  it('上書きするとそのパートの成績だけ差し替え、IDと取り込み時刻を維持する', async () => {
    const a = await importPart(db, { target: newTournament(), partName: '2-1', mahjongSoulId: '708677', rows });
    await importPart(db, { target: { tournamentId: a.tournamentId }, partName: '2-2', mahjongSoulId: null, rows });
    const before = (await loadDataset(db)).parts.find((p) => p.id === a.partId)!;
    expect((await findPartByMahjongSoulId(db, '708677'))?.id).toBe(a.partId);

    const newRows: ParsedRow[] = [{ rank: 1, playerId: '333', playerName: 'C', games: 3, totalPoints: 1 }];
    const res = await importPart(db, { target: { tournamentId: a.tournamentId }, partName: '2-1改', mahjongSoulId: '708677', rows: newRows }, a.partId);
    const data = await loadDataset(db);
    expect(res.partId).toBe(a.partId);
    expect(data.parts).toHaveLength(2);
    const after = data.parts.find((p) => p.id === a.partId)!;
    expect([after.name, after.importedAt]).toEqual(['2-1改', before.importedAt]);
    expect(data.results.filter((r) => r.partId === a.partId).map((r) => r.playerId)).toEqual(['333']);
    expect(data.results.filter((r) => r.partId !== a.partId)).toHaveLength(2);
  });

  it('上書きで別の大会へ移すと、パートが無くなった元の大会は消える', async () => {
    const a = await importPart(db, { target: newTournament(), partName: '2-1', mahjongSoulId: '1', rows });
    const b = await importPart(db, { target: newTournament(), partName: '3-1', mahjongSoulId: '2', rows });
    await importPart(db, { target: { tournamentId: b.tournamentId }, partName: '2-1', mahjongSoulId: '1', rows }, a.partId);
    const data = await loadDataset(db);
    expect(data.tournaments.map((t) => t.id)).toEqual([b.tournamentId]);
    expect(data.parts.every((p) => p.tournamentId === b.tournamentId)).toBe(true);
    expect(data.results.every((r) => r.tournamentId === b.tournamentId)).toBe(true);
  });
});

describe('パートの編集・削除', () => {
  it('パート名を変更できる（空なら既定名）', async () => {
    const a = await importPart(db, { target: newTournament(), partName: '2-1', mahjongSoulId: null, rows });
    await renamePart(db, a.partId, ' 予選 ');
    expect((await loadDataset(db)).parts[0].name).toBe('予選');
    await renamePart(db, a.partId, ' ');
    expect((await loadDataset(db)).parts[0].name).toBe(DEFAULT_PART_NAME);
  });

  it('パートを削除すると成績も消え、他のパートが残っていれば大会は残る', async () => {
    const a = await importPart(db, { target: newTournament(), partName: '2-1', mahjongSoulId: null, rows });
    const b = await importPart(db, { target: { tournamentId: a.tournamentId }, partName: '2-2', mahjongSoulId: null, rows });
    await deletePart(db, a.partId);
    const data = await loadDataset(db);
    expect(data.tournaments).toHaveLength(1);
    expect(data.parts.map((p) => p.id)).toEqual([b.partId]);
    expect(data.results.every((r) => r.partId === b.partId)).toBe(true);
  });

  it('最後のパートを削除すると大会も消える', async () => {
    const a = await importPart(db, { target: newTournament(), partName: '2-1', mahjongSoulId: null, rows });
    await deletePart(db, a.partId);
    const data = await loadDataset(db);
    expect([data.tournaments.length, data.parts.length, data.results.length]).toEqual([0, 0, 0]);
  });
});

describe('大会・シリーズの編集', () => {
  it('大会を更新できる（終了日が空なら開始日）', async () => {
    const a = await importPart(db, { target: newTournament(), partName: '2-1', mahjongSoulId: null, rows });
    const seriesId = (await loadDataset(db)).series[0].id;
    await updateTournament(db, a.tournamentId, { seriesId, label: '第9回', startDate: '2026-05-01', endDate: '' });
    const t = (await loadDataset(db)).tournaments[0];
    expect([t.label, t.startDate, t.endDate]).toEqual(['第9回', '2026-05-01', '2026-05-01']);
  });

  it('大会を削除するとパートと成績も消える', async () => {
    const a = await importPart(db, { target: newTournament(), partName: '2-1', mahjongSoulId: null, rows });
    await importPart(db, { target: { tournamentId: a.tournamentId }, partName: '2-2', mahjongSoulId: null, rows });
    await deleteTournament(db, a.tournamentId);
    const data = await loadDataset(db);
    expect([data.tournaments.length, data.parts.length, data.results.length]).toEqual([0, 0, 0]);
  });

  it('シリーズ名を変更できる', async () => {
    await importPart(db, { target: newTournament(), partName: '2-1', mahjongSoulId: null, rows });
    const seriesId = (await loadDataset(db)).series[0].id;
    await renameSeries(db, seriesId, '夏宵祭');
    expect((await loadDataset(db)).series[0].name).toBe('夏宵祭');
  });
});

describe('replaceAll', () => {
  it('全データを置き換える', async () => {
    await importPart(db, { target: newTournament(), partName: '2-1', mahjongSoulId: null, rows });
    await replaceAll(db, {
      series: [{ id: 's9', name: 'Y' }],
      tournaments: [{ id: 't9', seriesId: 's9', label: '', startDate: '2026-02-01', endDate: '2026-02-01', importedAt: 5 }],
      parts: [{ id: 'p9', tournamentId: 't9', name: 'A', mahjongSoulId: null, importedAt: 5 }],
      results: [{ id: 'r9', tournamentId: 't9', partId: 'p9', playerId: '999', playerName: 'Z', rank: 1, games: 1, totalPoints: 0 }],
    });
    const data = await loadDataset(db);
    expect(data.series.map((s) => s.id)).toEqual(['s9']);
    expect(data.tournaments.map((t) => t.id)).toEqual(['t9']);
    expect(data.parts.map((p) => p.id)).toEqual(['p9']);
    expect(data.results.map((r) => r.id)).toEqual(['r9']);
  });
});

describe('DB v1 からの移行', () => {
  it('既存の大会ごとにパートを1つ作り、大会IDと成績を移す', async () => {
    const name = `test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(1).stores({ series: 'id', tournaments: 'id, seriesId, mahjongSoulId', results: 'id, tournamentId, playerId' });
    await old.table('series').add({ id: 's1', name: '深海杯' });
    await old.table('tournaments').add({ id: 't1', seriesId: 's1', label: '第1回', startDate: '2026-01-10', endDate: '2026-01-10', mahjongSoulId: '708677', importedAt: 5 });
    await old.table('results').add({ id: 'r1', tournamentId: 't1', playerId: '111', playerName: 'A', rank: 1, games: 3, totalPoints: 1 });
    old.close();

    const migrated = new TaikaiDB(name);
    const data = await loadDataset(migrated);
    expect(data.series).toEqual([{ id: 's1', name: '深海杯' }]);
    expect(data.parts).toEqual([{ id: expect.any(String), tournamentId: 't1', name: DEFAULT_PART_NAME, mahjongSoulId: '708677', importedAt: 5 }]);
    expect(data.tournaments).toEqual([{ id: 't1', seriesId: 's1', label: '第1回', startDate: '2026-01-10', endDate: '2026-01-10', importedAt: 5 }]);
    expect(data.results).toEqual([
      { id: 'r1', tournamentId: 't1', partId: data.parts[0].id, playerId: '111', playerName: 'A', rank: 1, games: 3, totalPoints: 1 },
    ]);
    expect((await findPartByMahjongSoulId(migrated, '708677'))?.tournamentId).toBe('t1');
  });
});
