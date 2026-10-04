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
  /** 雀魂の大会ID（ファイル名から抽出。不明なら null） */
  mahjongSoulId: string | null;
  /** 取り込み時刻（ms）。開始日が同じ大会の並び順に使う */
  importedAt: number;
};

export type Result = {
  id: string;
  tournamentId: string;
  playerId: string;
  /** その大会時点の名前 */
  playerName: string;
  rank: number;
  games: number;
  totalPoints: number;
};

export type ParsedRow = Omit<Result, 'id' | 'tournamentId'>;

export type Dataset = {
  series: Series[];
  tournaments: Tournament[];
  results: Result[];
};
