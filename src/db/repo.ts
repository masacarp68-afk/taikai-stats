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
