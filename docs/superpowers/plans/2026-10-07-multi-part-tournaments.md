# 1大会に複数CSV（パート） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1つの大会に複数のCSV（パート）を取り込めるようにし、参加人数などを「どれかのパートに出た人を1人」として集計する。

**Architecture:** 新しい `Part` テーブルを追加し、`Result` に `partId` を持たせる。集計は `stats.ts` の内部インデックスで「大会×プレイヤー」単位に全パートを合算した `TournamentEntry` を作り、各集計はそれを使う。旧データ（DB v1・バックアップ v1）は純粋関数 `migrateLegacy` で「パート1つの大会」に変換する。

**Tech Stack:** Vite, React 19, TypeScript, Dexie 4, Vitest, fake-indexeddb

**Spec:** `docs/superpowers/specs/2026-10-04-taikai-stats-design.md`（末尾の「追加仕様: 1大会に複数CSV（パート）」）

## Global Constraints

- UIの文言はすべて日本語
- 旧パート名の既定値は `DEFAULT_PART_NAME = 'パート1'`
- パートの並び順: パート名の自然順（`localeCompare(…, 'ja', { numeric: true })`）→ `importedAt`
- 大会単位の参加人数・新規・リピーター・継続率・皆勤・参加大会数は「どれかのパートに出た人を1人」と数える。対局数・打点は全パート合計（打点は小数1桁に丸める）
- 既存データは移行で消えないこと（DB v1→v2 アップグレード、バックアップ v1 の読み込み）
- 最後のパートを削除・移動した大会は削除する
- コミットメッセージ末尾: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- テスト用の実データを追加しないこと（`src/test/fixtures/kashou2-*.csv` は仮名化済み）

## File Structure

```
src/lib/types.ts            Part, PartRank, DEFAULT_PART_NAME を追加。Tournament から mahjongSoulId を削除、Result に partId
src/lib/legacy.ts           (新規) v1 形式 → パート形式の変換
src/lib/csv.ts              partNameFromFileName を追加
src/db/schema.ts            v2 スキーマとアップグレード
src/db/repo.ts              importPart / findPartByMahjongSoulId / renamePart / deletePart など
src/lib/backup.ts           バックアップ v2（v1 も読める）
src/lib/stats.ts            パート合算の集計、sortParts、getTournamentDetail
src/lib/format.ts           formatRanks を追加
src/pages/data/ImportSection.tsx   取り込みキュー（フォームは分離）
src/pages/data/ImportForm.tsx      (新規) 1ファイル分の取り込みフォーム
src/pages/data/TournamentManager.tsx パート一覧・名前変更・削除
src/pages/TournamentDetailPage.tsx  合算タブ＋パート別タブ
src/pages/PlayerDetailPage.tsx      順位をパート別表示
src/index.css               .notice / .sub-tabs / .part-list
README.md                   使い方にパートの説明
```

---

### Task 1: データ層（型・移行・DB・バックアップ）

**Files:**
- Modify: `src/lib/types.ts`（全体置き換え）, `src/lib/csv.ts`, `src/db/schema.ts`（全体置き換え）, `src/db/repo.ts`（全体置き換え）, `src/lib/backup.ts`（全体置き換え）
- Create: `src/lib/legacy.ts`
- Test: `src/lib/legacy.test.ts`（新規）, `src/lib/csv.test.ts`（追記）, `src/db/repo.test.ts`（全体置き換え）, `src/lib/backup.test.ts`（全体置き換え）

**Note:** このタスクの後、画面側（`src/pages/**`）と `src/lib/stats.ts` は Task 2・3 まで型が合わず `npm run build` は失敗する。このタスクでは `npm test` のうち Task 1 のテストファイルが通ることを確認する（`stats.test.ts` は Task 2 で直すので、このタスクでは失敗してよい）。

**Interfaces:**
- Produces:
  - `types.ts`: `Series`, `Tournament`（mahjongSoulId なし）, `Part`, `Result`（partId あり）, `ParsedRow`, `PartRank`, `Dataset`（parts あり）, `DEFAULT_PART_NAME`
  - `legacy.ts`: `LegacyTournament`, `LegacyResult`, `migrateLegacy(tournaments, results, newId?) => { tournaments; parts; results }`
  - `csv.ts`: `partNameFromFileName(fileName: string): string`
  - `repo.ts`: `loadDataset`, `findPartByMahjongSoulId(db, id): Promise<Part | undefined>`, `NewTournamentInput`, `ImportPartInput`, `importPart(db, input, overwritePartId?) => Promise<{ tournamentId; partId }>`, `TournamentPatch`, `updateTournament`, `deleteTournament`, `renameSeries`, `renamePart(db, id, name)`, `deletePart(db, id)`, `replaceAll`
  - `backup.ts`: `Backup`（version 2）, `createBackup`, `BackupParse`, `parseBackup`（v1/v2 対応）
  - 削除: `findTournamentByMahjongSoulId`, `importTournament`, `ImportInput`

- [ ] **Step 1: 型を置き換える**

`src/lib/types.ts`:
```ts
export type Series = {
  id: string;
  name: string;
};

export type Tournament = {
  id: string;
  seriesId: string;
  /** 回の表記（自由入力。例「第3回」「弐」。空文字可） */
  label: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD。1日開催なら startDate と同じ */
  endDate: string;
  /** 取り込み時刻（ms）。開始日が同じ大会の並び順に使う */
  importedAt: number;
};

/** 大会を構成するCSV 1つ分（例: 夏宵2 の「2-1」「2-2」「2-3」） */
export type Part = {
  id: string;
  tournamentId: string;
  /** パート名。ファイル名から初期値を作り、あとで変更できる */
  name: string;
  /** 雀魂の大会ID（ファイル名から抽出。不明なら null）。同じIDの再取り込みはこのパートの上書きになる */
  mahjongSoulId: string | null;
  /** 取り込み時刻（ms） */
  importedAt: number;
};

export type Result = {
  id: string;
  tournamentId: string;
  partId: string;
  playerId: string;
  /** そのパート時点の名前 */
  playerName: string;
  rank: number;
  games: number;
  totalPoints: number;
};

export type ParsedRow = Omit<Result, 'id' | 'tournamentId' | 'partId'>;

/** パート内の順位 */
export type PartRank = { partId: string; partName: string; rank: number };

export type Dataset = {
  series: Series[];
  tournaments: Tournament[];
  parts: Part[];
  results: Result[];
};

/** パート名が空のときと、旧データ移行時に使うパート名 */
export const DEFAULT_PART_NAME = 'パート1';
```

- [ ] **Step 2: 移行関数の失敗するテストを書く**

`src/lib/legacy.test.ts`:
```ts
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
```

`src/lib/csv.test.ts` の import 行を次に変え、末尾に describe を追加:
```ts
import { decodeCsv, extractMahjongSoulId, parseResultsCsv, partNameFromFileName } from './csv';
```
```ts
describe('partNameFromFileName', () => {
  it('拡張子と「シーズン順位統計-」を取り除く', () => {
    expect(partNameFromFileName('夏宵2-1.csv')).toBe('夏宵2-1');
    expect(partNameFromFileName('シーズン順位統計-大会708677.csv')).toBe('大会708677');
    expect(partNameFromFileName('ABC.CSV')).toBe('ABC');
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `npx vitest run src/lib/legacy.test.ts src/lib/csv.test.ts`
Expected: FAIL（`./legacy` が見つからない、`partNameFromFileName` が無い）

- [ ] **Step 4: 移行関数とパート名関数を実装**

`src/lib/legacy.ts`:
```ts
import { DEFAULT_PART_NAME, type Part, type Result, type Tournament } from './types';

/** v1 形式（パートなし。大会が雀魂大会IDを持つ）の大会 */
export type LegacyTournament = Tournament & { mahjongSoulId: string | null };
/** v1 形式（partId なし）の成績 */
export type LegacyResult = Omit<Result, 'partId'>;

/** v1 形式のデータを、大会ごとにパートを1つ持つ形に変換する */
export function migrateLegacy(
  tournaments: LegacyTournament[],
  results: LegacyResult[],
  newId: () => string = () => crypto.randomUUID(),
): { tournaments: Tournament[]; parts: Part[]; results: Result[] } {
  const parts: Part[] = tournaments.map((t) => ({
    id: newId(),
    tournamentId: t.id,
    name: DEFAULT_PART_NAME,
    mahjongSoulId: t.mahjongSoulId ?? null,
    importedAt: t.importedAt,
  }));
  const partIdByTournament = new Map(parts.map((p) => [p.tournamentId, p.id]));
  return {
    tournaments: tournaments.map((t) => ({
      id: t.id,
      seriesId: t.seriesId,
      label: t.label,
      startDate: t.startDate,
      endDate: t.endDate,
      importedAt: t.importedAt,
    })),
    parts,
    results: results.map((r) => ({ ...r, partId: partIdByTournament.get(r.tournamentId) ?? '' })),
  };
}
```

`src/lib/csv.ts` の `extractMahjongSoulId` の下に追加:
```ts
/** ファイル名からパート名の初期値を作る（例「夏宵2-1.csv」→「夏宵2-1」） */
export function partNameFromFileName(fileName: string): string {
  return fileName.replace(/\.csv$/i, '').replace(/^シーズン順位統計-/, '').trim();
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npx vitest run src/lib/legacy.test.ts src/lib/csv.test.ts`
Expected: PASS

- [ ] **Step 6: DB の失敗するテストを書く**

`src/db/repo.test.ts`（全体置き換え）:
```ts
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
```

- [ ] **Step 7: テストが失敗することを確認**

Run: `npx vitest run src/db/repo.test.ts`
Expected: FAIL（`importPart` などが無い）

- [ ] **Step 8: スキーマと repo を実装**

`src/db/schema.ts`（全体置き換え）:
```ts
import Dexie, { type Table } from 'dexie';
import { migrateLegacy } from '../lib/legacy';
import type { Part, Result, Series, Tournament } from '../lib/types';

export class TaikaiDB extends Dexie {
  series!: Table<Series, string>;
  tournaments!: Table<Tournament, string>;
  parts!: Table<Part, string>;
  results!: Table<Result, string>;

  constructor(name = 'taikai-stats') {
    super(name);
    this.version(1).stores({
      series: 'id',
      tournaments: 'id, seriesId, mahjongSoulId',
      results: 'id, tournamentId, playerId',
    });
    // v2: 1大会に複数CSV（パート）を持てるようにした。既存の大会はパート1つの大会に移行する
    this.version(2)
      .stores({
        series: 'id',
        tournaments: 'id, seriesId',
        parts: 'id, tournamentId, mahjongSoulId',
        results: 'id, tournamentId, partId, playerId',
      })
      .upgrade(async (tx) => {
        const migrated = migrateLegacy(await tx.table('tournaments').toArray(), await tx.table('results').toArray());
        await tx.table('tournaments').clear();
        await tx.table('tournaments').bulkAdd(migrated.tournaments);
        await tx.table('parts').bulkAdd(migrated.parts);
        await tx.table('results').clear();
        await tx.table('results').bulkAdd(migrated.results);
      });
  }
}

export const db = new TaikaiDB();
```

`src/db/repo.ts`（全体置き換え）:
```ts
import { DEFAULT_PART_NAME, type Dataset, type ParsedRow, type Part, type Tournament } from '../lib/types';
import type { TaikaiDB } from './schema';

export async function loadDataset(db: TaikaiDB): Promise<Dataset> {
  const [series, tournaments, parts, results] = await Promise.all([
    db.series.toArray(),
    db.tournaments.toArray(),
    db.parts.toArray(),
    db.results.toArray(),
  ]);
  // 主キーがランダムUUIDのため取得順が不定。順位順に揃えて決定的にする
  results.sort((a, b) => a.rank - b.rank);
  return { series, tournaments, parts, results };
}

export function findPartByMahjongSoulId(db: TaikaiDB, mahjongSoulId: string): Promise<Part | undefined> {
  return db.parts.where('mahjongSoulId').equals(mahjongSoulId).first();
}

export type NewTournamentInput = {
  series: { id: string } | { newName: string };
  label: string;
  startDate: string;
  endDate: string;
};

export type ImportPartInput = {
  /** 取り込み先。既存の大会に追加するか、新しい大会を作る */
  target: { tournamentId: string } | { newTournament: NewTournamentInput };
  partName: string;
  mahjongSoulId: string | null;
  rows: ParsedRow[];
};

/** CSV 1つ分をパートとして保存する。overwritePartId を渡すとそのパートの成績を差し替える */
export function importPart(
  db: TaikaiDB,
  input: ImportPartInput,
  overwritePartId?: string,
): Promise<{ tournamentId: string; partId: string }> {
  return db.transaction('rw', [db.series, db.tournaments, db.parts, db.results], async () => {
    const tournamentId =
      'tournamentId' in input.target
        ? await requireTournament(db, input.target.tournamentId)
        : await createTournament(db, input.target.newTournament);
    const existing = overwritePartId ? await db.parts.get(overwritePartId) : undefined;
    const partId = existing?.id ?? crypto.randomUUID();
    if (existing) await db.results.where('partId').equals(existing.id).delete();
    await db.parts.put({
      id: partId,
      tournamentId,
      name: input.partName.trim() || DEFAULT_PART_NAME,
      mahjongSoulId: input.mahjongSoulId,
      importedAt: existing?.importedAt ?? Date.now(),
    });
    if (existing && existing.tournamentId !== tournamentId) await deleteTournamentIfEmpty(db, existing.tournamentId);
    await db.results.bulkAdd(input.rows.map((r) => ({ ...r, id: crypto.randomUUID(), tournamentId, partId })));
    return { tournamentId, partId };
  });
}

async function requireTournament(db: TaikaiDB, id: string): Promise<string> {
  if (!(await db.tournaments.get(id))) throw new Error('選択した大会が見つかりません');
  return id;
}

async function createTournament(db: TaikaiDB, input: NewTournamentInput): Promise<string> {
  let seriesId: string;
  if ('id' in input.series) {
    if (!(await db.series.get(input.series.id))) throw new Error('選択したシリーズが見つかりません');
    seriesId = input.series.id;
  } else {
    seriesId = crypto.randomUUID();
    await db.series.add({ id: seriesId, name: input.series.newName.trim() });
  }
  const id = crypto.randomUUID();
  await db.tournaments.add({
    id,
    seriesId,
    label: input.label.trim(),
    startDate: input.startDate,
    endDate: input.endDate || input.startDate,
    importedAt: Date.now(),
  });
  return id;
}

async function deleteTournamentIfEmpty(db: TaikaiDB, tournamentId: string): Promise<void> {
  if ((await db.parts.where('tournamentId').equals(tournamentId).count()) === 0) {
    await db.tournaments.delete(tournamentId);
  }
}

export type TournamentPatch = Pick<Tournament, 'seriesId' | 'label' | 'startDate' | 'endDate'>;

export async function updateTournament(db: TaikaiDB, id: string, patch: TournamentPatch): Promise<void> {
  await db.tournaments.update(id, {
    ...patch,
    label: patch.label.trim(),
    endDate: patch.endDate || patch.startDate,
  });
}

export async function deleteTournament(db: TaikaiDB, id: string): Promise<void> {
  await db.transaction('rw', db.tournaments, db.parts, db.results, async () => {
    await db.results.where('tournamentId').equals(id).delete();
    await db.parts.where('tournamentId').equals(id).delete();
    await db.tournaments.delete(id);
  });
}

export async function renameSeries(db: TaikaiDB, id: string, name: string): Promise<void> {
  await db.series.update(id, { name: name.trim() });
}

export async function renamePart(db: TaikaiDB, id: string, name: string): Promise<void> {
  await db.parts.update(id, { name: name.trim() || DEFAULT_PART_NAME });
}

/** パートを削除する。大会のパートが無くなったら大会も削除する */
export async function deletePart(db: TaikaiDB, id: string): Promise<void> {
  await db.transaction('rw', db.tournaments, db.parts, db.results, async () => {
    const part = await db.parts.get(id);
    if (!part) return;
    await db.results.where('partId').equals(id).delete();
    await db.parts.delete(id);
    await deleteTournamentIfEmpty(db, part.tournamentId);
  });
}

export async function replaceAll(db: TaikaiDB, data: Dataset): Promise<void> {
  await db.transaction('rw', [db.series, db.tournaments, db.parts, db.results], async () => {
    await Promise.all([db.series.clear(), db.tournaments.clear(), db.parts.clear(), db.results.clear()]);
    await db.series.bulkAdd(data.series);
    await db.tournaments.bulkAdd(data.tournaments);
    await db.parts.bulkAdd(data.parts);
    await db.results.bulkAdd(data.results);
  });
}
```

- [ ] **Step 9: テストが通ることを確認**

Run: `npx vitest run src/db/repo.test.ts`
Expected: PASS（15 tests）

- [ ] **Step 10: バックアップの失敗するテストを書く**

`src/lib/backup.test.ts`（全体置き換え）:
```ts
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
```

- [ ] **Step 11: テストが失敗することを確認**

Run: `npx vitest run src/lib/backup.test.ts`
Expected: FAIL（version が 1、parts の検証が無い など）

- [ ] **Step 12: バックアップを実装**

`src/lib/backup.ts`（全体置き換え）:
```ts
import { migrateLegacy, type LegacyResult, type LegacyTournament } from './legacy';
import type { Dataset } from './types';

export type Backup = {
  app: 'taikai-stats';
  version: 2;
  exportedAt: string;
  data: Dataset;
};

export function createBackup(data: Dataset, now: Date = new Date()): Backup {
  return { app: 'taikai-stats', version: 2, exportedAt: now.toISOString(), data };
}

export type BackupParse = { ok: true; data: Dataset } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNullableStr = (v: unknown) => v === null || isStr(v);
const fail = (error: string): BackupParse => ({ ok: false, error });

const isSeries = (s: unknown) => isObj(s) && isStr(s.id) && isStr(s.name);
const isTournament = (t: unknown, legacy: boolean) =>
  isObj(t) &&
  isStr(t.id) &&
  isStr(t.seriesId) &&
  isStr(t.label) &&
  isStr(t.startDate) &&
  isStr(t.endDate) &&
  isNum(t.importedAt) &&
  (!legacy || isNullableStr(t.mahjongSoulId));
const isPart = (p: unknown) =>
  isObj(p) && isStr(p.id) && isStr(p.tournamentId) && isStr(p.name) && isNullableStr(p.mahjongSoulId) && isNum(p.importedAt);
const isResult = (r: unknown, legacy: boolean) =>
  isObj(r) &&
  isStr(r.id) &&
  isStr(r.tournamentId) &&
  (legacy || isStr(r.partId)) &&
  isStr(r.playerId) &&
  isStr(r.playerName) &&
  isNum(r.rank) &&
  isNum(r.games) &&
  isNum(r.totalPoints);

/** バックアップを検証して読み込む。version 1（パートなし）はパート1つの大会に変換する */
export function parseBackup(json: string): BackupParse {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return fail('JSONとして読み込めません');
  }
  if (!isObj(raw) || raw.app !== 'taikai-stats' || (raw.version !== 1 && raw.version !== 2) || !isObj(raw.data)) {
    return fail('このアプリのバックアップファイルではありません');
  }
  const legacy = raw.version === 1;
  const { series, tournaments, parts, results } = raw.data;
  if (!Array.isArray(series) || !series.every(isSeries)) return fail('シリーズのデータが壊れています');
  if (!Array.isArray(tournaments) || !tournaments.every((t) => isTournament(t, legacy))) {
    return fail('大会のデータが壊れています');
  }
  if (!legacy && (!Array.isArray(parts) || !parts.every(isPart))) return fail('パートのデータが壊れています');
  if (!Array.isArray(results) || !results.every((r) => isResult(r, legacy))) return fail('成績のデータが壊れています');

  const data: Dataset = legacy
    ? { series, ...migrateLegacy(tournaments as LegacyTournament[], results as LegacyResult[]) }
    : ({ series, tournaments, parts, results } as Dataset);
  return checkReferences(data);
}

function checkReferences(data: Dataset): BackupParse {
  const seriesIds = new Set(data.series.map((s) => s.id));
  const tournamentIds = new Set(data.tournaments.map((t) => t.id));
  const partById = new Map(data.parts.map((p) => [p.id, p]));
  if (!data.tournaments.every((t) => seriesIds.has(t.seriesId))) {
    return fail('存在しないシリーズを参照している大会があります');
  }
  if (!data.parts.every((p) => tournamentIds.has(p.tournamentId))) {
    return fail('存在しない大会を参照しているパートがあります');
  }
  if (!data.results.every((r) => partById.get(r.partId)?.tournamentId === r.tournamentId)) {
    return fail('存在しないパートを参照している成績があります');
  }
  return { ok: true, data };
}
```

- [ ] **Step 13: テストが通ることを確認**

Run: `npx vitest run src/lib/legacy.test.ts src/lib/csv.test.ts src/db/repo.test.ts src/lib/backup.test.ts src/lib/format.test.ts`
Expected: PASS（`stats.test.ts` は Task 2 で直すので、ここでは実行しない）

- [ ] **Step 14: コミット**

```bash
git add -A && git commit -m "feat: 1大会に複数CSVを持てるようパートをデータ層に追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 集計（パート合算）

**Files:**
- Modify: `src/lib/stats.ts`（全体置き換え）, `src/lib/format.ts`
- Test: `src/lib/stats.test.ts`（全体置き換え）, `src/lib/format.test.ts`（追記）, `src/lib/kashou2.test.ts`（新規）

**Interfaces:**
- Consumes: Task 1 の `Dataset`, `Part`, `PartRank`, `Result`, `Series`, `Tournament`, `parseResultsCsv`, `decodeCsv`
- Produces:
  - `sortTournaments`, `tournamentTitle`（変更なし）
  - `sortParts(parts: Part[]): Part[]`
  - `type TournamentEntry = { playerId; playerName; games; totalPoints; ranks: PartRank[] }`
  - `summarizePlayers`, `PlayerSummary`（シグネチャ変更なし）
  - `type PlayerHistoryEntry = { tournament; title; ranks: PartRank[]; games; totalPoints }`（`rank` を `ranks` に変更）
  - `getPlayerDetail`, `PlayerDetail`, `SeriesAttendance`, `tournamentStats`, `TournamentStat`, `seriesStats`, `SeriesStat`, `SeriesPlayerStat`（シグネチャ変更なし）
  - `type TournamentDetail = { stat: TournamentStat; parts: { part: Part; results: Result[] }[]; combined: TournamentEntry[] }`
  - `getTournamentDetail(data: Dataset, tournamentId: string): TournamentDetail | null`
  - `format.ts`: `formatRanks(ranks: PartRank[]): string`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/stats.test.ts`（全体置き換え）:
```ts
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
```

`src/lib/kashou2.test.ts`（新規。仮名化した実データで依頼者の期待値 1474人 を確認する）:
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeCsv, parseResultsCsv } from './csv';
import { getTournamentDetail, tournamentStats } from './stats';
import type { Dataset, Result } from './types';

function rowsOf(n: number) {
  const b = readFileSync(new URL(`../test/fixtures/kashou2-${n}.csv`, import.meta.url));
  const outcome = parseResultsCsv(decodeCsv(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer));
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.rows;
}

describe('夏宵2（3パート、仮名化した実データ）', () => {
  it('参加人数は3パートのどれかに出た人数（1474人）', () => {
    const results: Result[] = [1, 2, 3].flatMap((n) =>
      rowsOf(n).map((r, i) => ({ ...r, id: `${n}-${i}`, tournamentId: 't', partId: `p${n}` })),
    );
    const data: Dataset = {
      series: [{ id: 's', name: '夏宵' }],
      tournaments: [{ id: 't', seriesId: 's', label: '2', startDate: '2026-08-14', endDate: '2026-08-16', importedAt: 0 }],
      parts: [1, 2, 3].map((n) => ({ id: `p${n}`, tournamentId: 't', name: `2-${n}`, mahjongSoulId: null, importedAt: n })),
      results,
    };
    expect(tournamentStats(data)[0].participants).toBe(1474);
    expect(getTournamentDetail(data, 't')!.parts.map((p) => p.results.length)).toEqual([1067, 1022, 936]);
  });
});
```

`src/lib/format.test.ts`: import に `formatRanks` を追加し、末尾に追加:
```ts
describe('formatRanks', () => {
  it('パート1つなら数字だけ、複数なら「パート名: n位」を / でつなぐ', () => {
    expect(formatRanks([{ partId: 'a', partName: '2-1', rank: 5 }])).toBe('5');
    expect(
      formatRanks([
        { partId: 'a', partName: '2-1', rank: 5 },
        { partId: 'c', partName: '2-3', rank: 12 },
      ]),
    ).toBe('2-1: 5位 / 2-3: 12位');
    expect(formatRanks([])).toBe('');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/lib/stats.test.ts src/lib/kashou2.test.ts src/lib/format.test.ts`
Expected: FAIL（`sortParts` / `getTournamentDetail` / `formatRanks` が無い、参加人数が合わない など）

- [ ] **Step 3: 集計を実装**

`src/lib/stats.ts`（全体置き換え）:
```ts
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
```

`src/lib/format.ts` の先頭に import を追加し、末尾に関数を追加:
```ts
import type { PartRank } from './types';
```
```ts
/** パートが1つなら「5」、複数なら「2-1: 5位 / 2-3: 12位」 */
export function formatRanks(ranks: PartRank[]): string {
  if (ranks.length === 1) return String(ranks[0].rank);
  return ranks.map((r) => `${r.partName}: ${r.rank}位`).join(' / ');
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: 全テスト PASS（`npm run build` は Task 3 まで失敗してよい）

- [ ] **Step 5: コミット**

```bash
git add -A && git commit -m "feat: 複数パートを合算する集計に変更

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 画面（取り込み・データ管理・大会詳細・プレイヤー詳細）

**Files:**
- Modify: `src/pages/data/ImportSection.tsx`（全体置き換え）, `src/pages/data/TournamentManager.tsx`（全体置き換え）, `src/pages/TournamentDetailPage.tsx`（全体置き換え）, `src/pages/PlayerDetailPage.tsx`, `src/index.css`, `README.md`
- Create: `src/pages/data/ImportForm.tsx`

**Interfaces:**
- Consumes: `findPartByMahjongSoulId`, `importPart`, `ImportPartInput`, `renamePart`, `deletePart`, `deleteTournament`, `updateTournament`（Task 1）, `sortTournaments`, `sortParts`, `tournamentTitle`, `getTournamentDetail`, `TournamentEntry`, `PlayerHistoryEntry`（Task 2）, `formatPeriod`, `formatPoints`, `formatPercent`, `formatRanks`, `partNameFromFileName`, `DataTable`, `Column`
- Produces: `ImportForm`, `PendingFile`

- [ ] **Step 1: 取り込みフォームを作成**

`src/pages/data/ImportForm.tsx`:
```tsx
import { useState } from 'react';
import { findPartByMahjongSoulId, importPart, type ImportPartInput } from '../../db/repo';
import { db } from '../../db/schema';
import { formatPeriod } from '../../lib/format';
import { sortTournaments, tournamentTitle } from '../../lib/stats';
import type { Dataset, ParsedRow, Part } from '../../lib/types';

export type PendingFile = {
  key: string;
  fileName: string;
  mahjongSoulId: string | null;
  /** ファイル名から作ったパート名の初期値 */
  partName: string;
  rows: ParsedRow[];
  skipped: number;
  /** 同じ雀魂大会IDで取り込み済みのパート */
  existing?: Part;
};

const NEW_SERIES = '__new_series__';
const NEW_TOURNAMENT = '__new_tournament__';

type Props = {
  file: PendingFile;
  remaining: number;
  data: Dataset;
  /** 取り込み先の初期値（直前に保存した大会） */
  defaultTournamentId: string | null;
  onDone: (message: string, tournamentId?: string) => void;
};

export function ImportForm({ file, remaining, data, defaultTournamentId, onDone }: Props) {
  const ex = file.existing;
  const tournamentExists = (id: string) => data.tournaments.some((t) => t.id === id);
  const initialTarget =
    ex && tournamentExists(ex.tournamentId)
      ? ex.tournamentId
      : defaultTournamentId && tournamentExists(defaultTournamentId)
        ? defaultTournamentId
        : NEW_TOURNAMENT;

  const [target, setTarget] = useState(initialTarget);
  const [seriesChoice, setSeriesChoice] = useState(data.series[0]?.id ?? NEW_SERIES);
  const [newSeriesName, setNewSeriesName] = useState('');
  const [label, setLabel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [partName, setPartName] = useState(ex?.name ?? file.partName);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const seriesById = new Map(data.series.map((s) => [s.id, s]));
  const tournaments = sortTournaments(data.tournaments).reverse();
  const isNew = target === NEW_TOURNAMENT;

  async function save() {
    setError('');
    if (isNew) {
      if (seriesChoice === NEW_SERIES && !newSeriesName.trim()) return setError('シリーズ名を入力してください');
      if (!startDate) return setError('開始日を入力してください');
      if (endDate && endDate < startDate) return setError('終了日は開始日以降にしてください');
    }

    setSaving(true);
    try {
      let overwritePartId: string | undefined;
      if (file.mahjongSoulId) {
        const existing = await findPartByMahjongSoulId(db, file.mahjongSoulId);
        if (existing) {
          if (!confirm(`大会ID ${file.mahjongSoulId} は取り込み済みです。上書きしますか？`)) {
            setSaving(false);
            return;
          }
          overwritePartId = existing.id;
        }
      }
      const input: ImportPartInput = {
        target: isNew
          ? {
              newTournament: {
                series: seriesChoice === NEW_SERIES ? { newName: newSeriesName } : { id: seriesChoice },
                label,
                startDate,
                endDate,
              },
            }
          : { tournamentId: target },
        partName,
        mahjongSoulId: file.mahjongSoulId,
        rows: file.rows,
      };
      const { tournamentId } = await importPart(db, input, overwritePartId);
      onDone(`${file.fileName} を取り込みました（${file.rows.length}人）`, tournamentId);
    } catch (e) {
      setError(`保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
      setSaving(false);
    }
  }

  return (
    <div>
      <h3>
        {file.fileName}
        {remaining > 0 && <span className="muted">（このあと {remaining} 件）</span>}
      </h3>
      <p className="muted">
        大会ID: {file.mahjongSoulId ?? '不明'} ／ {file.rows.length}人
        {file.skipped > 0 && ` ／ ${file.skipped}行スキップ`}
      </p>
      <ol className="muted">
        {file.rows.slice(0, 5).map((r, i) => (
          <li key={`${r.playerId}-${i}`}>
            {r.playerName}（{r.games}局 {r.totalPoints}）
          </li>
        ))}
      </ol>
      {ex && <p className="notice">取り込み済みのパートです。保存すると成績を上書きします</p>}
      <div className="row">
        <label className="field">
          取り込み先
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value={NEW_TOURNAMENT}>＋ 新しい大会</option>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {tournamentTitle(t, seriesById.get(t.seriesId))}（{formatPeriod(t)}）
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          パート名
          <input value={partName} onChange={(e) => setPartName(e.target.value)} placeholder="例：2-1" />
        </label>
      </div>
      {isNew ? (
        <div className="row" style={{ marginTop: 8 }}>
          <label className="field">
            シリーズ
            <select value={seriesChoice} onChange={(e) => setSeriesChoice(e.target.value)}>
              {data.series.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value={NEW_SERIES}>＋ 新しいシリーズ</option>
            </select>
          </label>
          {seriesChoice === NEW_SERIES && (
            <label className="field">
              シリーズ名
              <input value={newSeriesName} onChange={(e) => setNewSeriesName(e.target.value)} placeholder="例：深海杯" />
            </label>
          )}
          <label className="field">
            回
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例：第3回" />
          </label>
          <label className="field">
            開始日
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="field">
            終了日（1日開催なら空欄）
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </div>
      ) : (
        <p className="muted">選んだ大会にパートとして追加します。参加人数は大会全体で重複なしに数えます。</p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" disabled={saving} onClick={() => void save()}>
          保存
        </button>
        <button disabled={saving} onClick={() => onDone(`${file.fileName} をスキップしました`)}>
          スキップ
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 取り込みキューを置き換え**

`src/pages/data/ImportSection.tsx`（全体置き換え）:
```tsx
import { useState } from 'react';
import { findPartByMahjongSoulId } from '../../db/repo';
import { db } from '../../db/schema';
import { decodeCsv, extractMahjongSoulId, parseResultsCsv, partNameFromFileName } from '../../lib/csv';
import type { Dataset } from '../../lib/types';
import { ImportForm, type PendingFile } from './ImportForm';

type Rejected = { fileName: string; error: string };

export function ImportSection({ data }: { data: Dataset }) {
  const [queue, setQueue] = useState<PendingFile[]>([]);
  const [rejected, setRejected] = useState<Rejected[]>([]);
  const [message, setMessage] = useState('');
  const [dragOver, setDragOver] = useState(false);
  /** 直前に保存した大会。続くファイルの取り込み先の初期値にする */
  const [lastTournamentId, setLastTournamentId] = useState<string | null>(null);

  async function addFiles(files: FileList) {
    const accepted: PendingFile[] = [];
    const errors: Rejected[] = [];
    for (const f of Array.from(files)) {
      try {
        const outcome = parseResultsCsv(decodeCsv(await f.arrayBuffer()));
        if (outcome.ok) {
          const mahjongSoulId = extractMahjongSoulId(f.name);
          const existing = mahjongSoulId ? await findPartByMahjongSoulId(db, mahjongSoulId) : undefined;
          accepted.push({
            key: crypto.randomUUID(),
            fileName: f.name,
            mahjongSoulId,
            partName: partNameFromFileName(f.name),
            rows: outcome.rows,
            skipped: outcome.skipped,
            existing,
          });
        } else {
          errors.push({ fileName: f.name, error: outcome.error });
        }
      } catch {
        errors.push({ fileName: f.name, error: 'ファイルを読み込めませんでした' });
      }
    }
    setQueue((q) => [...q, ...accepted]);
    setRejected(errors);
    setMessage('');
    setLastTournamentId(null);
  }

  const current = queue[0];
  return (
    <section className="card">
      <h2>CSV取り込み</h2>
      <label
        className={`dropzone${dragOver ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void addFiles(e.dataTransfer.files);
        }}
      >
        雀魂の大会CSVをここにドロップ（複数可）、またはクリックして選択
        <br />
        1つの大会が複数のCSVに分かれている場合は、まとめてドロップして同じ大会に追加できます
        <input
          type="file"
          accept=".csv,text/csv"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </label>
      {rejected.map((r, i) => (
        <p key={`${r.fileName}-${i}`} className="error">
          {r.fileName}: {r.error}
        </p>
      ))}
      {message && <p className="muted">{message}</p>}
      {current && (
        <ImportForm
          key={current.key}
          file={current}
          remaining={queue.length - 1}
          data={data}
          defaultTournamentId={lastTournamentId}
          onDone={(msg, tournamentId) => {
            setQueue((q) => q.slice(1));
            setMessage(msg);
            if (tournamentId) setLastTournamentId(tournamentId);
          }}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 3: データ管理（パート一覧）を置き換え**

`src/pages/data/TournamentManager.tsx`（全体置き換え）:
```tsx
import { Fragment, useState } from 'react';
import { deletePart, deleteTournament, renamePart, updateTournament } from '../../db/repo';
import { db } from '../../db/schema';
import { formatPeriod } from '../../lib/format';
import { sortParts, sortTournaments, tournamentTitle } from '../../lib/stats';
import type { Dataset, Part, Series, Tournament } from '../../lib/types';

export function TournamentManager({ data }: { data: Dataset }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  if (data.tournaments.length === 0) return null;

  const seriesById = new Map(data.series.map((s) => [s.id, s]));
  const playersByTournament = new Map<string, Set<string>>();
  const countByPart = new Map<string, number>();
  for (const r of data.results) {
    const set = playersByTournament.get(r.tournamentId) ?? new Set<string>();
    set.add(r.playerId);
    playersByTournament.set(r.tournamentId, set);
    countByPart.set(r.partId, (countByPart.get(r.partId) ?? 0) + 1);
  }
  const ordered = sortTournaments(data.tournaments).reverse();

  return (
    <section className="card">
      <h2>取り込み済みの大会</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>大会</th>
              <th>開催期間</th>
              <th className="num">人数</th>
              <th className="num">パート</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ordered.map((t) => {
              const title = tournamentTitle(t, seriesById.get(t.seriesId));
              const parts = sortParts(data.parts.filter((p) => p.tournamentId === t.id));
              if (editingId === t.id) {
                return <TournamentEditRow key={t.id} t={t} series={data.series} onClose={() => setEditingId(null)} />;
              }
              return (
                <Fragment key={t.id}>
                  <tr className="has-sub-row">
                    <td>{title}</td>
                    <td>{formatPeriod(t)}</td>
                    <td className="num">{playersByTournament.get(t.id)?.size ?? 0}</td>
                    <td className="num">{parts.length}</td>
                    <td>
                      <div className="row">
                        <button onClick={() => setEditingId(t.id)}>編集</button>
                        <button
                          className="danger"
                          onClick={() => {
                            if (confirm(`「${title}」を削除しますか？この操作は取り消せません。`)) void deleteTournament(db, t.id);
                          }}
                        >
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr className="sub-row">
                    <td colSpan={5}>
                      <ul className="part-list">
                        {parts.map((p) => (
                          <PartItem key={p.id} part={p} players={countByPart.get(p.id) ?? 0} isLast={parts.length === 1} />
                        ))}
                      </ul>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PartItem({ part, players, isLast }: { part: Part; players: number; isLast: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(part.name);

  if (editing) {
    return (
      <li className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary" disabled={!name.trim()} onClick={() => void renamePart(db, part.id, name).then(() => setEditing(false))}>
          保存
        </button>
        <button
          onClick={() => {
            setName(part.name);
            setEditing(false);
          }}
        >
          キャンセル
        </button>
      </li>
    );
  }

  return (
    <li className="row">
      <span>{part.name}</span>
      <span className="muted">
        {players}人 ／ 大会ID {part.mahjongSoulId ?? '—'}
      </span>
      <button onClick={() => setEditing(true)}>名前変更</button>
      <button
        className="danger"
        onClick={() => {
          const message = isLast
            ? `パート「${part.name}」は大会の最後のパートです。削除すると大会も削除されます。よろしいですか？`
            : `パート「${part.name}」を削除しますか？この操作は取り消せません。`;
          if (confirm(message)) void deletePart(db, part.id);
        }}
      >
        削除
      </button>
    </li>
  );
}

function TournamentEditRow({ t, series, onClose }: { t: Tournament; series: Series[]; onClose: () => void }) {
  const [seriesId, setSeriesId] = useState(t.seriesId);
  const [label, setLabel] = useState(t.label);
  const [startDate, setStartDate] = useState(t.startDate);
  const [endDate, setEndDate] = useState(t.endDate === t.startDate ? '' : t.endDate);
  const [error, setError] = useState('');

  async function save() {
    if (!startDate) return setError('開始日を入力してください');
    if (endDate && endDate < startDate) return setError('終了日は開始日以降にしてください');
    await updateTournament(db, t.id, { seriesId, label, startDate, endDate });
    onClose();
  }

  return (
    <tr>
      <td colSpan={5}>
        <div className="row">
          <label className="field">
            シリーズ
            <select value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
              {series.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            回
            <input value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="field">
            開始日
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="field">
            終了日（1日開催なら空欄）
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <button className="primary" onClick={() => void save()}>
            保存
          </button>
          <button onClick={onClose}>キャンセル</button>
        </div>
        {error && <p className="error">{error}</p>}
      </td>
    </tr>
  );
}
```

- [ ] **Step 4: 大会詳細を置き換え**

`src/pages/TournamentDetailPage.tsx`（全体置き換え）:
```tsx
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { DataTable, type Column } from '../components/DataTable';
import { formatPercent, formatPeriod, formatPoints, formatRanks } from '../lib/format';
import { getTournamentDetail, type TournamentEntry } from '../lib/stats';
import type { Dataset, Result } from '../lib/types';

type CombinedRow = TournamentEntry & { place: number };

const combinedColumns: Column<CombinedRow>[] = [
  { key: 'place', label: '#', num: true, render: (e) => e.place },
  { key: 'name', label: '名前', render: (e) => e.playerName },
  { key: 'games', label: '対局数', num: true, render: (e) => e.games, sortValue: (e) => e.games },
  { key: 'points', label: '打点合計', num: true, render: (e) => formatPoints(e.totalPoints), sortValue: (e) => e.totalPoints },
  { key: 'ranks', label: 'パート別順位', render: (e) => formatRanks(e.ranks) },
];

const partColumns: Column<Result>[] = [
  { key: 'rank', label: '順位', num: true, render: (r) => r.rank },
  { key: 'name', label: '名前', render: (r) => r.playerName },
  { key: 'games', label: '対局数', num: true, render: (r) => r.games },
  { key: 'points', label: '累計打点', num: true, render: (r) => formatPoints(r.totalPoints) },
];

const COMBINED = '__combined__';

export function TournamentDetailPage({ data }: { data: Dataset }) {
  const navigate = useNavigate();
  const { tournamentId = '' } = useParams();
  const detail = useMemo(() => getTournamentDetail(data, tournamentId), [data, tournamentId]);
  const [tab, setTab] = useState(COMBINED);

  if (!detail) {
    return (
      <section className="card">
        <p>大会が見つかりません。</p>
        <Link to="/tournaments">← 大会集計へ</Link>
      </section>
    );
  }

  const { stat, parts, combined } = detail;
  const multi = parts.length > 1;
  const selectedPart = parts.find((p) => p.part.id === tab);
  const toPlayer = (playerId: string) => navigate(`/players/${playerId}`);
  const tabs = [{ id: COMBINED, name: '合算' }, ...parts.map((p) => ({ id: p.part.id, name: p.part.name }))];

  return (
    <>
      <p>
        <Link to="/tournaments">← 大会集計へ</Link>
      </p>
      <section className="card">
        <h2>
          {stat.title} <span className="muted">{formatPeriod(stat.tournament)}</span>
        </h2>
        <div className="stat-grid">
          <div className="stat">参加人数<b>{stat.participants}</b></div>
          <div className="stat">新規<b>{stat.newcomers}</b></div>
          <div className="stat">リピーター<b>{stat.repeaters}</b></div>
          <div className="stat">継続率<b>{formatPercent(stat.retention)}</b></div>
          {multi && <div className="stat">パート数<b>{parts.length}</b></div>}
        </div>
        {multi && (
          <div className="tabs sub-tabs">
            {tabs.map((t) => (
              <button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
        )}
        {multi && !selectedPart ? (
          <DataTable
            columns={combinedColumns}
            rows={combined.map((e, i) => ({ ...e, place: i + 1 }))}
            rowKey={(e) => e.playerId}
            sortable
            onRowClick={(e) => toPlayer(e.playerId)}
          />
        ) : (
          <DataTable
            columns={partColumns}
            rows={(selectedPart ?? parts[0])?.results ?? []}
            rowKey={(r) => r.id}
            onRowClick={(r) => toPlayer(r.playerId)}
          />
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 5: プレイヤー詳細の順位をパート別に**

`src/pages/PlayerDetailPage.tsx`:
- import を `import { formatPeriod, formatPoints, formatRanks } from '../lib/format';` に変更
- `columns` の順位の行を次に置き換え:
```tsx
  { key: 'rank', label: '順位', render: (h) => formatRanks(h.ranks) },
```

- [ ] **Step 6: CSS と README**

`src/index.css` の末尾に追加:
```css
.notice { color: var(--accent); font-weight: 600; }
.sub-tabs { margin-bottom: 8px; }
.sub-tabs .tab { background: none; border: none; border-bottom: 2px solid transparent; border-radius: 0; font-size: 0.95rem; }
.sub-tabs .tab.active { border-bottom-color: var(--accent); }
tr.has-sub-row td { border-bottom: none; }
tr.sub-row td { padding-top: 0; }
.part-list { list-style: none; margin: 0; padding: 0 0 0 16px; display: grid; gap: 4px; }
```

`README.md` の「## 使い方」の 2. を次に置き換え:
```markdown
2. 「データ管理」タブでCSVをドロップし、取り込み先（新しい大会 or 既存の大会）とパート名を選んで保存。新しい大会のときはシリーズ名・回・開催期間も入力します
   - 1つの大会が複数のCSVに分かれている場合（例: 夏宵2-1 / 2-2 / 2-3）は、まとめてドロップすると2つ目以降の取り込み先が自動で同じ大会になります。参加人数は、どれか1つに出た人を1人として数えます
```

- [ ] **Step 7: テストとビルド**

Run: `npm test && npm run build`
Expected: 全テスト PASS、ビルド成功

- [ ] **Step 8: ブラウザで確認**

dev server（`npm run dev`、http://localhost:5173）で:
- `indexedDB.deleteDatabase('taikai-stats')` で空にしてから、`src/test/fixtures/kashou2-1.csv` `kashou2-2.csv` `kashou2-3.csv` を一度に取り込む（javascript_tool で fetch → File → DataTransfer → hidden input → change）。1件目は「新しい大会」（新しいシリーズ「夏宵」、回「2」、開始日 2026-08-14、終了日 2026-08-16）、2・3件目は取り込み先の初期値がその大会になっていること
- 大会タブ: 夏宵 2 の参加人数が **1474**
- 大会詳細: 「合算」「kashou2-1」「kashou2-2」「kashou2-3」のタブ。合算の行に「パート別順位」が出る。各パートタブの行数が 1067 / 1022 / 936
- プレイヤー詳細: 3パートに出た人の順位欄が「kashou2-1: n位 / kashou2-2: n位 / kashou2-3: n位」
- データ管理: 夏宵 2 の下に3パート（人数・大会ID）。パート名変更が反映され、パート削除で人数が減る。最後のパート削除で大会が消える（確認文言が最後用になる）
- 旧形式のデータ移行: `src/test/fixtures/season-708677.csv` を取り込み済みの状態でなくても良い（移行はテストで確認済み）
- 起動した dev server のプロセスだけを止める

- [ ] **Step 9: コミット**

```bash
git add -A && git commit -m "feat: 1大会に複数CSVを取り込める画面に変更

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
