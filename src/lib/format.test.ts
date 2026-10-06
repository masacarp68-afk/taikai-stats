import { describe, expect, it } from 'vitest';
import { formatPercent, formatPeriod, formatPoints, formatRanks } from './format';

describe('formatPeriod', () => {
  it('1日開催は日付1つ', () => {
    expect(formatPeriod({ startDate: '2026-10-01', endDate: '2026-10-01' })).toBe('2026/10/1');
  });
  it('同じ年の期間は終了日の年を省略', () => {
    expect(formatPeriod({ startDate: '2026-10-01', endDate: '2026-10-14' })).toBe('2026/10/1〜10/14');
  });
  it('年をまたぐ期間は終了日にも年を付ける', () => {
    expect(formatPeriod({ startDate: '2025-12-30', endDate: '2026-01-02' })).toBe('2025/12/30〜2026/1/2');
  });
});

describe('formatPoints', () => {
  it('小数1桁で表示', () => {
    expect(formatPoints(298.6)).toBe('298.6');
    expect(formatPoints(280)).toBe('280.0');
    expect(formatPoints(-73)).toBe('-73.0');
  });
});

describe('formatPercent', () => {
  it('整数の%で表示、null は —', () => {
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(2 / 3)).toBe('67%');
    expect(formatPercent(null)).toBe('—');
  });
});

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
