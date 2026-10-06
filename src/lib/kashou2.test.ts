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
