import Dexie, { type Table } from 'dexie';
import type { Result, Series, Tournament } from '../lib/types';

export class TaikaiDB extends Dexie {
  series!: Table<Series, string>;
  tournaments!: Table<Tournament, string>;
  results!: Table<Result, string>;

  constructor(name = 'taikai-stats') {
    super(name);
    this.version(1).stores({
      series: 'id',
      tournaments: 'id, seriesId, mahjongSoulId',
      results: 'id, tournamentId, playerId',
    });
  }
}

export const db = new TaikaiDB();
