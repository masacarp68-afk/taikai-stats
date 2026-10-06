import type { PartRank } from './types';

function formatDate(date: string, withYear: boolean): string {
  const [y, m, d] = date.split('-').map(Number);
  return withYear ? `${y}/${m}/${d}` : `${m}/${d}`;
}

export function formatPeriod(t: { startDate: string; endDate: string }): string {
  if (!t.endDate || t.endDate === t.startDate) return formatDate(t.startDate, true);
  const sameYear = t.startDate.slice(0, 4) === t.endDate.slice(0, 4);
  return `${formatDate(t.startDate, true)}〜${formatDate(t.endDate, !sameYear)}`;
}

export function formatPoints(n: number): string {
  return n.toFixed(1);
}

export function formatPercent(r: number | null): string {
  return r === null ? '—' : `${Math.round(r * 100)}%`;
}

/** パートが1つなら「5」、複数なら「2-1: 5位 / 2-3: 12位」 */
export function formatRanks(ranks: PartRank[]): string {
  if (ranks.length === 1) return String(ranks[0].rank);
  return ranks.map((r) => `${r.partName}: ${r.rank}位`).join(' / ');
}
