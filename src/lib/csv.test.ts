import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeCsv, extractMahjongSoulId, parseResultsCsv } from './csv';

function fixture(name: string): ArrayBuffer {
  const b = readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

const HEADER = '順位,プレイヤーID,プレイヤー名,対局数,累計打点,表示得点,備考,点数修正,';

describe('extractMahjongSoulId', () => {
  it('ファイル名から大会IDを取り出す', () => {
    expect(extractMahjongSoulId('シーズン順位統計-大会708677.csv')).toBe('708677');
    expect(extractMahjongSoulId('シーズン順位統計-大会708677 (1).csv')).toBe('708677');
  });
  it('見つからなければ null', () => {
    expect(extractMahjongSoulId('results.csv')).toBeNull();
  });
});

describe('decodeCsv', () => {
  it('UTF-8 を読める', () => {
    expect(decodeCsv(fixture('season-708677.csv'))).toContain('プレイヤー01');
  });
  it('Shift_JIS を読める', () => {
    const text = decodeCsv(fixture('sjis-sample.csv'));
    expect(text.startsWith('順位')).toBe(true);
    expect(text).toContain('テスト太郎');
  });
  it('UTF-8 の BOM を取り除く', () => {
    const body = new TextEncoder().encode('順位');
    const buf = new Uint8Array([0xef, 0xbb, 0xbf, ...body]).buffer;
    expect(decodeCsv(buf)).toBe('順位');
  });
});

describe('parseResultsCsv', () => {
  it('対局数の代わりに対戦数の列がある形式も読み込む', () => {
    const text =
      '順位,プレイヤーID,プレイヤー名,点数,累計打点,対戦数,1位獲得回数,2位獲得回数,3位獲得回数,4位獲得回数,\n' +
      '1,111,A,733.2000,733.2,78,26,22,16,14\n' +
      '123,222,B,131.2000,131.2,9,4,2,0,3\n';
    const outcome = parseResultsCsv(text);
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.rows).toEqual([
      { rank: 1, playerId: '111', playerName: 'A', games: 78, totalPoints: 733.2 },
      { rank: 123, playerId: '222', playerName: 'B', games: 9, totalPoints: 131.2 },
    ]);
  });

  it('チーム名の列がある形式も読み込む', () => {
    const text =
      '順位,プレイヤーID,プレイヤー名,チーム名,対局数,累計打点,表示得点,備考,点数修正,\n' +
      '1,111,A,柳に小野 副将,79,563,563.0,,0.0\n' +
      '2,222,B,,27,555.8,555.8,,0.0\n';
    const outcome = parseResultsCsv(text);
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.rows.map((r) => [r.playerId, r.games, r.totalPoints])).toEqual([
      ['111', 79, 563],
      ['222', 27, 555.8],
    ]);
  });

  it('対局数も対戦数もなければエラー', () => {
    const outcome = parseResultsCsv('順位,プレイヤーID,プレイヤー名,累計打点\n1,1,a,3\n');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toContain('対局数');
  });

  it('実データを全行読み込む', () => {
    const outcome = parseResultsCsv(decodeCsv(fixture('season-708677.csv')));
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.rows).toHaveLength(61);
    expect(outcome.skipped).toBe(0);
    expect(outcome.rows[0]).toEqual({
      rank: 1,
      playerId: '900000001',
      playerName: 'プレイヤー01',
      games: 33,
      totalPoints: 298.6,
    });
    expect(outcome.rows[60]).toEqual({
      rank: 61,
      playerId: '900000061',
      playerName: 'プレイヤー61',
      games: 5,
      totalPoints: -73,
    });
  });

  it('Shift_JIS のデータも読み込む', () => {
    const outcome = parseResultsCsv(decodeCsv(fixture('sjis-sample.csv')));
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.rows).toEqual([
      { rank: 1, playerId: '111', playerName: 'テスト太郎', games: 10, totalPoints: 50.5 },
    ]);
  });

  it('必須列が足りなければエラー', () => {
    const outcome = parseResultsCsv('順位,プレイヤーID,プレイヤー名,対局数\n1,1,a,3\n');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toContain('累計打点');
  });

  it('数値として読めない行はスキップして数える', () => {
    const text = `${HEADER}\n1,111,A,10,5.5,5.5,,0.0\n2,222,B,abc,1,1,,0.0\n3,,C,3,1,1,,0.0\n`;
    const outcome = parseResultsCsv(text);
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.rows.map((r) => r.playerId)).toEqual(['111']);
    expect(outcome.skipped).toBe(2);
  });

  it('データ行がなければエラー', () => {
    const outcome = parseResultsCsv(`${HEADER}\n`);
    expect(outcome.ok).toBe(false);
  });
});
