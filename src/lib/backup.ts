import type { Dataset } from './types';

export type Backup = {
  app: 'taikai-stats';
  version: 1;
  exportedAt: string;
  data: Dataset;
};

export function createBackup(data: Dataset, now: Date = new Date()): Backup {
  return { app: 'taikai-stats', version: 1, exportedAt: now.toISOString(), data };
}

export type BackupParse = { ok: true; data: Dataset } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const fail = (error: string): BackupParse => ({ ok: false, error });

export function parseBackup(json: string): BackupParse {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return fail('JSONとして読み込めません');
  }
  if (!isObj(raw) || raw.app !== 'taikai-stats' || raw.version !== 1 || !isObj(raw.data)) {
    return fail('このアプリのバックアップファイルではありません');
  }
  const { series, tournaments, results } = raw.data;
  if (!Array.isArray(series) || !series.every((s) => isObj(s) && isStr(s.id) && isStr(s.name))) {
    return fail('シリーズのデータが壊れています');
  }
  if (
    !Array.isArray(tournaments) ||
    !tournaments.every(
      (t) =>
        isObj(t) &&
        isStr(t.id) &&
        isStr(t.seriesId) &&
        isStr(t.label) &&
        isStr(t.startDate) &&
        isStr(t.endDate) &&
        (t.mahjongSoulId === null || isStr(t.mahjongSoulId)) &&
        isNum(t.importedAt),
    )
  ) {
    return fail('大会のデータが壊れています');
  }
  if (
    !Array.isArray(results) ||
    !results.every(
      (r) =>
        isObj(r) &&
        isStr(r.id) &&
        isStr(r.tournamentId) &&
        isStr(r.playerId) &&
        isStr(r.playerName) &&
        isNum(r.rank) &&
        isNum(r.games) &&
        isNum(r.totalPoints),
    )
  ) {
    return fail('成績のデータが壊れています');
  }
  const typed = { series, tournaments, results } as Dataset;
  const seriesIds = new Set(typed.series.map((s) => s.id));
  const tournamentIds = new Set(typed.tournaments.map((t) => t.id));
  if (!typed.tournaments.every((t) => seriesIds.has(t.seriesId))) {
    return fail('存在しないシリーズを参照している大会があります');
  }
  if (!typed.results.every((r) => tournamentIds.has(r.tournamentId))) {
    return fail('存在しない大会を参照している成績があります');
  }
  return { ok: true, data: typed };
}
