import type { Dataset } from '../lib/types';
import { BackupSection } from './data/BackupSection';
import { ImportSection } from './data/ImportSection';
import { SeriesManager } from './data/SeriesManager';
import { TournamentManager } from './data/TournamentManager';

export function DataPage({ data }: { data: Dataset }) {
  return (
    <>
      <ImportSection data={data} />
      <TournamentManager data={data} />
      <SeriesManager data={data} />
      <BackupSection data={data} />
    </>
  );
}
