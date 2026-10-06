export type Series = {
  id: string;
  name: string;
};

export type Tournament = {
  id: string;
  seriesId: string;
  /** 回の表記（自由入力。例「第3回」「弐」。空文字可） */
  label: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD。1日開催なら startDate と同じ */
  endDate: string;
  /** 取り込み時刻（ms）。開始日が同じ大会の並び順に使う */
  importedAt: number;
};

/** 大会を構成するCSV 1つ分（例: 夏宵2 の「2-1」「2-2」「2-3」） */
export type Part = {
  id: string;
  tournamentId: string;
  /** パート名。ファイル名から初期値を作り、あとで変更できる */
  name: string;
  /** 雀魂の大会ID（ファイル名から抽出。不明なら null）。同じIDの再取り込みはこのパートの上書きになる */
  mahjongSoulId: string | null;
  /** 取り込み時刻（ms） */
  importedAt: number;
};

export type Result = {
  id: string;
  tournamentId: string;
  partId: string;
  playerId: string;
  /** そのパート時点の名前 */
  playerName: string;
  rank: number;
  games: number;
  totalPoints: number;
};

export type ParsedRow = Omit<Result, 'id' | 'tournamentId' | 'partId'>;

/** パート内の順位 */
export type PartRank = { partId: string; partName: string; rank: number };

export type Dataset = {
  series: Series[];
  tournaments: Tournament[];
  parts: Part[];
  results: Result[];
};

/** パート名が空のときと、旧データ移行時に使うパート名 */
export const DEFAULT_PART_NAME = 'パート1';
