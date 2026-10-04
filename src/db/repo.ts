import type { Dataset, ParsedRow, Tournament } from '../lib/types';
import type { TaikaiDB } from './schema';

export async function loadDataset(db: TaikaiDB): Promise<Dataset> {
  const [series, tournaments, results] = await Promise.all([
    db.series.toArray(),
    db.tournaments.toArray(),
    db.results.toArray(),
  ]);
  // 主キーがランダムUUIDのため取得順が不定。順位順に揃えて決定的にする
  results.sort((a, b) => a.rank - b.rank);
  return { series, tournaments, results };
}

export function findTournamentByMahjongSoulId(db: TaikaiDB, mahjongSoulId: string): Promise<Tournament | undefined> {
  return db.tournaments.where('mahjongSoulId').equals(mahjongSoulId).first();
}

export type ImportInput = {
  series: { id: string } | { newName: string };
  label: string;
  startDate: string;
  endDate: string;
  mahjongSoulId: string | null;
  rows: ParsedRow[];
};

export function importTournament(db: TaikaiDB, input: ImportInput, overwriteTournamentId?: string): Promise<string> {
  return db.transaction('rw', db.series, db.tournaments, db.results, async () => {
    let seriesId: string;
    if ('id' in input.series) {
      if (!(await db.series.get(input.series.id))) throw new Error('選択したシリーズが見つかりません');
      seriesId = input.series.id;
    } else {
      seriesId = crypto.randomUUID();
      await db.series.add({ id: seriesId, name: input.series.newName.trim() });
    }
    const existing = overwriteTournamentId ? await db.tournaments.get(overwriteTournamentId) : undefined;
    const tournamentId = existing?.id ?? crypto.randomUUID();
    if (existing) await db.results.where('tournamentId').equals(existing.id).delete();
    await db.tournaments.put({
      id: tournamentId,
      seriesId,
      label: input.label.trim(),
      startDate: input.startDate,
      endDate: input.endDate || input.startDate,
      mahjongSoulId: input.mahjongSoulId,
      importedAt: existing?.importedAt ?? Date.now(),
    });
    await db.results.bulkAdd(input.rows.map((r) => ({ ...r, id: crypto.randomUUID(), tournamentId })));
    return tournamentId;
  });
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
  await db.transaction('rw', db.tournaments, db.results, async () => {
    await db.results.where('tournamentId').equals(id).delete();
    await db.tournaments.delete(id);
  });
}

export async function renameSeries(db: TaikaiDB, id: string, name: string): Promise<void> {
  await db.series.update(id, { name: name.trim() });
}

export async function replaceAll(db: TaikaiDB, data: Dataset): Promise<void> {
  await db.transaction('rw', db.series, db.tournaments, db.results, async () => {
    await Promise.all([db.series.clear(), db.tournaments.clear(), db.results.clear()]);
    await db.series.bulkAdd(data.series);
    await db.tournaments.bulkAdd(data.tournaments);
    await db.results.bulkAdd(data.results);
  });
}
