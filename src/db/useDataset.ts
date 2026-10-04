import { useLiveQuery } from 'dexie-react-hooks';
import type { Dataset } from '../lib/types';
import { loadDataset } from './repo';
import { db } from './schema';

/** 全データを読み込む。読み込み中は undefined。DB更新時に自動で再読み込みされる */
export function useDataset(): Dataset | undefined {
  return useLiveQuery(() => loadDataset(db));
}
