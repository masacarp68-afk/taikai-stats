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
