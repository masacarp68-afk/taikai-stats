import Papa from 'papaparse';
import type { ParsedRow } from './types';

const REQUIRED_COLUMNS = ['順位', 'プレイヤーID', 'プレイヤー名', '対局数', '累計打点'];

/** UTF-8 として不正なバイトがあれば Shift_JIS として読み直す */
export function decodeCsv(buf: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder('shift_jis').decode(buf);
  }
  return text.replace(/^﻿/, '');
}

export function extractMahjongSoulId(fileName: string): string | null {
  const m = fileName.match(/大会(\d+)/);
  return m ? m[1] : null;
}

export type ParseOutcome =
  | { ok: true; rows: ParsedRow[]; skipped: number }
  | { ok: false; error: string };

function toNumber(s: string | undefined): number {
  if (s === undefined || s.trim() === '') return NaN;
  return Number(s);
}

export function parseResultsCsv(text: string): ParseOutcome {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const fields = parsed.meta.fields ?? [];
  const missing = REQUIRED_COLUMNS.filter((c) => !fields.includes(c));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `このファイルは対応形式ではありません（不足している列: ${missing.join('、')}）`,
    };
  }

  const rows: ParsedRow[] = [];
  let skipped = 0;
  for (const r of parsed.data) {
    const playerId = (r['プレイヤーID'] ?? '').trim();
    const playerName = (r['プレイヤー名'] ?? '').trim();
    const rank = toNumber(r['順位']);
    const games = toNumber(r['対局数']);
    const totalPoints = toNumber(r['累計打点']);
    if (!playerId || !playerName || ![rank, games, totalPoints].every(Number.isFinite)) {
      skipped++;
      continue;
    }
    rows.push({ rank, playerId, playerName, games, totalPoints });
  }
  if (rows.length === 0) {
    return { ok: false, error: 'このファイルには読み込めるデータ行がありません' };
  }
  return { ok: true, rows, skipped };
}
