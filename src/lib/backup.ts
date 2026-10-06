import { migrateLegacy, type LegacyResult, type LegacyTournament } from './legacy';
import type { Dataset } from './types';

export type Backup = {
  app: 'taikai-stats';
  version: 2;
  exportedAt: string;
  data: Dataset;
};

export function createBackup(data: Dataset, now: Date = new Date()): Backup {
  return { app: 'taikai-stats', version: 2, exportedAt: now.toISOString(), data };
}

export type BackupParse = { ok: true; data: Dataset } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNullableStr = (v: unknown) => v === null || isStr(v);
const fail = (error: string): BackupParse => ({ ok: false, error });

const isSeries = (s: unknown) => isObj(s) && isStr(s.id) && isStr(s.name);
const isTournament = (t: unknown, legacy: boolean) =>
  isObj(t) &&
  isStr(t.id) &&
  isStr(t.seriesId) &&
  isStr(t.label) &&
  isStr(t.startDate) &&
  isStr(t.endDate) &&
  isNum(t.importedAt) &&
  (!legacy || isNullableStr(t.mahjongSoulId));
const isPart = (p: unknown) =>
  isObj(p) && isStr(p.id) && isStr(p.tournamentId) && isStr(p.name) && isNullableStr(p.mahjongSoulId) && isNum(p.importedAt);
const isResult = (r: unknown, legacy: boolean) =>
  isObj(r) &&
  isStr(r.id) &&
  isStr(r.tournamentId) &&
  (legacy || isStr(r.partId)) &&
  isStr(r.playerId) &&
  isStr(r.playerName) &&
  isNum(r.rank) &&
  isNum(r.games) &&
  isNum(r.totalPoints);

/** バックアップを検証して読み込む。version 1（パートなし）はパート1つの大会に変換する */
export function parseBackup(json: string): BackupParse {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return fail('JSONとして読み込めません');
  }
  if (!isObj(raw) || raw.app !== 'taikai-stats' || (raw.version !== 1 && raw.version !== 2) || !isObj(raw.data)) {
    return fail('このアプリのバックアップファイルではありません');
  }
  const legacy = raw.version === 1;
  const { series, tournaments, parts, results } = raw.data;
  if (!Array.isArray(series) || !series.every(isSeries)) return fail('シリーズのデータが壊れています');
  if (!Array.isArray(tournaments) || !tournaments.every((t) => isTournament(t, legacy))) {
    return fail('大会のデータが壊れています');
  }
  if (!legacy && (!Array.isArray(parts) || !parts.every(isPart))) return fail('パートのデータが壊れています');
  if (!Array.isArray(results) || !results.every((r) => isResult(r, legacy))) return fail('成績のデータが壊れています');

  const data: Dataset = legacy
    ? { series, ...migrateLegacy(tournaments as LegacyTournament[], results as LegacyResult[]) }
    : ({ series, tournaments, parts, results } as Dataset);
  return checkReferences(data);
}

function checkReferences(data: Dataset): BackupParse {
  const seriesIds = new Set(data.series.map((s) => s.id));
  const tournamentIds = new Set(data.tournaments.map((t) => t.id));
  const partById = new Map(data.parts.map((p) => [p.id, p]));
  if (!data.tournaments.every((t) => seriesIds.has(t.seriesId))) {
    return fail('存在しないシリーズを参照している大会があります');
  }
  if (!data.parts.every((p) => tournamentIds.has(p.tournamentId))) {
    return fail('存在しない大会を参照しているパートがあります');
  }
  if (!data.results.every((r) => partById.get(r.partId)?.tournamentId === r.tournamentId)) {
    return fail('存在しないパートを参照している成績があります');
  }
  return { ok: true, data };
}
