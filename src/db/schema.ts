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
