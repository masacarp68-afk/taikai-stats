# 雀魂大会 参加者統計アプリ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 雀魂「シーズン順位統計」CSVを取り込み、主催者の大会について参加回数・対局数・新規/リピーター・シリーズ集計を出すブラウザ完結のWebアプリを作る。

**Architecture:** Vite + React + TypeScript の静的SPA。CSV解析・集計・バックアップ検証は `src/lib/` の純粋関数にしてVitestでテストする。データはDexie（IndexedDB）に保存し、画面は `useLiveQuery` で全データを読み込んで純粋関数で集計して表示する。

**Tech Stack:** Vite, React 19, TypeScript, React Router (HashRouter), Dexie + dexie-react-hooks, PapaParse, html-to-image, Vitest, fake-indexeddb

**Spec:** `docs/superpowers/specs/2026-10-04-taikai-stats-design.md`

## Global Constraints

- UIの文言はすべて日本語
- サーバーなし。データは IndexedDB（DB名 `taikai-stats`）にのみ保存する
- ルーティングは HashRouter、Vite の `base` は `'./'`（GitHub Pages のどのパスでも動くように）
- 必須CSV列: `順位, プレイヤーID, プレイヤー名, 対局数, 累計打点`
- 文字コード: UTF-8（BOM有無）/ Shift_JIS 両対応
- 大会は開始日 `startDate`・終了日 `endDate`（YYYY-MM-DD）を持つ。終了日未入力なら開始日と同じ値で保存する
- 大会の並び順: `startDate` 昇順 → 同日なら `importedAt` 昇順
- 打点の表示は小数1桁（`298.6`, `280.0`）
- 同じ雀魂大会IDの再取り込みは確認ダイアログの上で上書き
- 対象外: 平均順位等の成績系統計、名前変更履歴、CSV出力、サーバー保存
- Node v24 / npm 11（Windows, Git Bash で作業）
- コミットメッセージの末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` を付ける

## File Structure

```
index.html
package.json / vite.config.ts / tsconfig*.json / .gitignore
.claude/launch.json                 dev server 起動設定
.github/workflows/deploy.yml        GitHub Pages デプロイ
README.md
src/
  main.tsx                          エントリ（HashRouter）
  App.tsx                           ヘッダー・タブ・ルート定義
  index.css                         全体スタイル（ライト/ダーク）
  lib/types.ts                      データ型
  lib/format.ts                     表示用フォーマット（期間・打点・%）
  lib/csv.ts                        CSVデコード・解析
  lib/stats.ts                      集計ロジック
  lib/backup.ts                     バックアップJSONの作成・検証
  lib/download.ts                   ファイルダウンロード補助
  db/schema.ts                      Dexie定義
  db/repo.ts                        DB読み書き
  db/useDataset.ts                  全データ読み込みフック
  components/DataTable.tsx          並び替え可能な表
  components/Exportable.tsx         件数指定＋PNG保存
  components/NoData.tsx             データ未登録時の案内
  pages/PlayersPage.tsx
  pages/PlayerDetailPage.tsx
  pages/TournamentsPage.tsx
  pages/TournamentDetailPage.tsx
  pages/SeriesPage.tsx
  pages/DataPage.tsx
  pages/data/ImportSection.tsx
  pages/data/TournamentManager.tsx
  pages/data/SeriesManager.tsx
  pages/data/BackupSection.tsx
  test/fixtures/season-708677.csv   実データ（UTF-8）
  test/fixtures/sjis-sample.csv     Shift_JIS サンプル
  lib/*.test.ts, db/repo.test.ts
```

---

### Task 1: プロジェクト雛形・型・表示フォーマット

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `index.html`, `.gitignore`, `.claude/launch.json`
- Create: `src/main.tsx`, `src/App.tsx`, `src/index.css`
- Create: `src/lib/types.ts`, `src/lib/format.ts`
- Test: `src/lib/format.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `Series`, `Tournament`, `Result`, `ParsedRow`, `Dataset`（下記コード参照）
  - `format.ts`: `formatPeriod(t: { startDate: string; endDate: string }): string`, `formatPoints(n: number): string`, `formatPercent(r: number | null): string`

- [ ] **Step 1: ブランチ名を main にする**

```bash
cd /e/taikai-stats && git branch -M main
```

- [ ] **Step 2: 設定ファイルを作成**

`package.json`:
```json
{
  "name": "taikai-stats",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'node' },
});
```

`tsconfig.json`:
```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

`tsconfig.app.json`:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client"]
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts"]
}
```

`index.html`:
```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>大会参加者統計</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`.gitignore`:
```
node_modules
dist
*.tsbuildinfo
```

`.claude/launch.json`:
```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "taikai-stats", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173 }
  ]
}
```

- [ ] **Step 3: 依存関係をインストール**

```bash
cd /e/taikai-stats && npm install react react-dom react-router dexie dexie-react-hooks papaparse html-to-image && npm install -D vite @vitejs/plugin-react typescript vitest @types/react @types/react-dom @types/papaparse @types/node fake-indexeddb
```
Expected: エラーなく完了し `package-lock.json` が生成される

- [ ] **Step 4: 型定義を作成**

`src/lib/types.ts`:
```ts
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
```

- [ ] **Step 5: フォーマットの失敗するテストを書く**

`src/lib/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatPercent, formatPeriod, formatPoints } from './format';

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
```

- [ ] **Step 6: テストが失敗することを確認**

Run: `npm test -- src/lib/format.test.ts`
Expected: FAIL（`./format` が見つからない）

- [ ] **Step 7: 実装**

`src/lib/format.ts`:
```ts
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
```

- [ ] **Step 8: テストが通ることを確認**

Run: `npm test -- src/lib/format.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 9: 最小の画面を作成**

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
```

`src/App.tsx`（Task 6 で置き換える）:
```tsx
export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>大会参加者統計</h1>
      </header>
    </div>
  );
}
```

`src/index.css`:
```css
:root {
  --bg: #f6f7f5;
  --surface: #ffffff;
  --text: #1d2421;
  --muted: #66706b;
  --border: #dde2de;
  --accent: #1f7a55;
  --on-accent: #ffffff;
  --accent-weak: #e3f1ea;
  --danger: #b3261e;
  font-family: system-ui, 'Hiragino Sans', 'Yu Gothic UI', sans-serif;
  color: var(--text);
  background: var(--bg);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #141816;
    --surface: #1d2320;
    --text: #e6ebe8;
    --muted: #9aa49f;
    --border: #323b37;
    --accent: #4fbf8b;
    --on-accent: #0f1a14;
    --accent-weak: #203a2e;
    --danger: #f2b8b5;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); }
a { color: var(--accent); }
.app { max-width: 1100px; margin: 0 auto; padding: 16px; }
.app-header h1 { font-size: 1.3rem; margin: 0 0 12px; }
.tabs { display: flex; gap: 4px; overflow-x: auto; border-bottom: 1px solid var(--border); margin-bottom: 16px; }
.tab { padding: 8px 14px; color: var(--muted); text-decoration: none; border-bottom: 2px solid transparent; white-space: nowrap; }
.tab.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
.card h2 { font-size: 1.1rem; margin: 0 0 12px; }
.card h3 { font-size: 1rem; margin: 16px 0 8px; }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 0.9rem; }
input, select, button { font: inherit; }
input, select { padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); }
button, .button-like { display: inline-block; padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; font-size: 1rem; }
button:disabled { opacity: 0.5; cursor: default; }
button.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
button.danger { color: var(--danger); }
.muted { color: var(--muted); font-size: 0.9rem; }
.error { color: var(--danger); }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
th, td { padding: 6px 8px; border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }
th { color: var(--muted); font-weight: 600; }
th.sortable { cursor: pointer; user-select: none; }
th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
tr.clickable { cursor: pointer; }
tr.clickable:hover { background: var(--accent-weak); }
.dropzone { display: block; border: 2px dashed var(--border); border-radius: 8px; padding: 24px; text-align: center; color: var(--muted); cursor: pointer; }
.dropzone.over { border-color: var(--accent); background: var(--accent-weak); }
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-bottom: 12px; }
.stat { background: var(--accent-weak); border-radius: 6px; padding: 8px 12px; font-size: 0.9rem; }
.stat b { display: block; font-size: 1.3rem; }
.ranking-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
.export-controls { justify-content: flex-end; margin-bottom: 8px; }
.capture { background: var(--surface); padding: 12px; }
.capture-title { margin: 0 0 8px; font-size: 1rem; }
```

- [ ] **Step 10: ビルドが通ることを確認**

Run: `npm run build`
Expected: エラーなく `dist/` が生成される

- [ ] **Step 11: コミット**

```bash
git add -A && git commit -m "chore: プロジェクト雛形と型・表示フォーマットを追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: CSV解析

**Files:**
- Create: `src/lib/csv.ts`
- Create: `src/test/fixtures/season-708677.csv`, `src/test/fixtures/sjis-sample.csv`
- Test: `src/lib/csv.test.ts`

**Interfaces:**
- Consumes: `ParsedRow`（`src/lib/types.ts`）
- Produces:
  - `decodeCsv(buf: ArrayBuffer): string`
  - `extractMahjongSoulId(fileName: string): string | null`
  - `type ParseOutcome = { ok: true; rows: ParsedRow[]; skipped: number } | { ok: false; error: string }`
  - `parseResultsCsv(text: string): ParseOutcome`

- [ ] **Step 1: テスト用フィクスチャを用意**

```bash
cd /e/taikai-stats && mkdir -p src/test/fixtures && cp "/e/シーズン順位統計-大会708677.csv" src/test/fixtures/season-708677.csv
```

Shift_JIS サンプルは PowerShell で作成:
```powershell
$t = "順位,プレイヤーID,プレイヤー名,対局数,累計打点,表示得点,備考,点数修正,`r`n1,111,テスト太郎,10,50.5,50.5,,0.0`r`n"
[System.IO.File]::WriteAllText("E:\taikai-stats\src\test\fixtures\sjis-sample.csv", $t, [System.Text.Encoding]::GetEncoding(932))
```

- [ ] **Step 2: 失敗するテストを書く**

`src/lib/csv.test.ts`:
```ts
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
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `npm test -- src/lib/csv.test.ts`
Expected: FAIL（`./csv` が見つからない）

- [ ] **Step 4: 実装**

`src/lib/csv.ts`:
```ts
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
  return text.replace(/^\uFEFF/, '');
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
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), {
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
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npm test -- src/lib/csv.test.ts`
Expected: PASS（10 tests）

- [ ] **Step 6: コミット**

```bash
git add -A && git commit -m "feat: シーズン順位統計CSVの解析を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 集計ロジック

**Files:**
- Create: `src/lib/stats.ts`
- Test: `src/lib/stats.test.ts`

**Interfaces:**
- Consumes: `Dataset`, `Series`, `Tournament`, `Result`（`src/lib/types.ts`）
- Produces:
  - `sortTournaments(ts: Tournament[]): Tournament[]`
  - `tournamentTitle(t: Tournament, series: Series | undefined): string`
  - `type PlayerSummary = { playerId: string; name: string; tournamentCount: number; totalGames: number; totalPoints: number; lastTournamentId: string }`
  - `summarizePlayers(data: Dataset, seriesId?: string): PlayerSummary[]`
  - `type PlayerHistoryEntry = { tournament: Tournament; title: string; rank: number; games: number; totalPoints: number }`
  - `type SeriesAttendance = { seriesId: string; seriesName: string; attended: number; total: number }`
  - `type PlayerDetail = { playerId: string; name: string; history: PlayerHistoryEntry[]; seriesAttendance: SeriesAttendance[] }`
  - `getPlayerDetail(data: Dataset, playerId: string): PlayerDetail | null`
  - `type TournamentStat = { tournament: Tournament; title: string; participants: number; newcomers: number; repeaters: number; retention: number | null }`
  - `tournamentStats(data: Dataset): TournamentStat[]`（開始日昇順）
  - `type SeriesPlayerStat = { playerId: string; name: string; attended: number; totalGames: number; totalPoints: number }`
  - `type SeriesStat = { series: Series; tournamentCount: number; totalEntries: number; uniquePlayers: number; perfectAttendance: SeriesPlayerStat[]; players: SeriesPlayerStat[] }`
  - `seriesStats(data: Dataset): SeriesStat[]`（大会0件のシリーズは除外）

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/stats.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Dataset, Result, Series, Tournament } from './types';
import {
  getPlayerDetail,
  seriesStats,
  sortTournaments,
  summarizePlayers,
  tournamentStats,
  tournamentTitle,
} from './stats';

const S = (id: string, name: string): Series => ({ id, name });
const T = (
  id: string,
  seriesId: string,
  label: string,
  startDate: string,
  endDate = startDate,
  importedAt = 0,
): Tournament => ({ id, seriesId, label, startDate, endDate, mahjongSoulId: null, importedAt });
let seq = 0;
const R = (
  tournamentId: string,
  playerId: string,
  playerName: string,
  games: number,
  totalPoints: number,
  rank: number,
): Result => ({ id: `r${seq++}`, tournamentId, playerId, playerName, rank, games, totalPoints });

// 深海杯(A): 第1回 1/10, 第2回 3/1〜3/15 ／ 夏宵(B): 2/1〜2/7（回の表記なし）／ 空シリーズ(C)
const data: Dataset = {
  series: [S('A', '深海杯'), S('B', '夏宵'), S('C', '空シリーズ')],
  tournaments: [
    T('a2', 'A', '第2回', '2026-03-01', '2026-03-15'),
    T('a1', 'A', '第1回', '2026-01-10'),
    T('b1', 'B', '', '2026-02-01', '2026-02-07'),
  ],
  results: [
    R('a1', 'p1', 'Alice', 10, 100.5, 1),
    R('a1', 'p2', 'Bob', 8, -20, 2),
    R('b1', 'p1', 'Alice2', 5, 30, 1),
    R('b1', 'p3', 'Carol', 6, 10, 2),
    R('a2', 'p1', 'Alice3', 12, 50.2, 2),
    R('a2', 'p3', 'Carol', 9, 40, 1),
  ],
};

describe('sortTournaments', () => {
  it('開始日順に並べる', () => {
    expect(sortTournaments(data.tournaments).map((t) => t.id)).toEqual(['a1', 'b1', 'a2']);
  });
  it('開始日が同じなら取り込み順', () => {
    const ts = [T('x', 'A', '', '2026-01-01', '2026-01-01', 200), T('y', 'A', '', '2026-01-01', '2026-01-01', 100)];
    expect(sortTournaments(ts).map((t) => t.id)).toEqual(['y', 'x']);
  });
});

describe('tournamentTitle', () => {
  it('シリーズ名と回をつなげる。回が空ならシリーズ名だけ', () => {
    expect(tournamentTitle(data.tournaments[0], data.series[0])).toBe('深海杯 第2回');
    expect(tournamentTitle(data.tournaments[2], data.series[1])).toBe('夏宵');
  });
});

describe('summarizePlayers', () => {
  it('全大会の参加数・対局数・打点を合計し、最新の名前を使う', () => {
    const ps = summarizePlayers(data);
    expect(ps.map((p) => p.playerId)).toEqual(['p1', 'p3', 'p2']);
    expect(ps[0]).toEqual({
      playerId: 'p1',
      name: 'Alice3',
      tournamentCount: 3,
      totalGames: 27,
      totalPoints: 180.7,
      lastTournamentId: 'a2',
    });
    expect(ps[1]).toMatchObject({ tournamentCount: 2, totalGames: 15, totalPoints: 50, lastTournamentId: 'a2' });
  });
  it('シリーズで絞り込める', () => {
    const ps = summarizePlayers(data, 'A');
    expect(ps.map((p) => [p.playerId, p.tournamentCount, p.totalGames])).toEqual([
      ['p1', 2, 22],
      ['p3', 1, 9],
      ['p2', 1, 8],
    ]);
    expect(ps[0].totalPoints).toBe(150.7);
    expect(ps[0].name).toBe('Alice3');
  });
});

describe('getPlayerDetail', () => {
  it('参加履歴とシリーズ別参加回数を返す', () => {
    const d = getPlayerDetail(data, 'p3');
    expect(d).not.toBeNull();
    expect(d!.name).toBe('Carol');
    expect(d!.history.map((h) => [h.title, h.rank, h.games, h.totalPoints])).toEqual([
      ['夏宵', 2, 6, 10],
      ['深海杯 第2回', 1, 9, 40],
    ]);
    expect(d!.seriesAttendance).toEqual([
      { seriesId: 'B', seriesName: '夏宵', attended: 1, total: 1 },
      { seriesId: 'A', seriesName: '深海杯', attended: 1, total: 2 },
    ]);
  });
  it('存在しないプレイヤーは null', () => {
    expect(getPlayerDetail(data, 'nope')).toBeNull();
  });
});

describe('tournamentStats', () => {
  it('参加人数・新規・リピーター・継続率を出す', () => {
    const st = tournamentStats(data);
    expect(st.map((s) => [s.tournament.id, s.title, s.participants, s.newcomers, s.repeaters, s.retention])).toEqual([
      ['a1', '深海杯 第1回', 2, 2, 0, null],
      ['b1', '夏宵', 2, 1, 1, null],
      ['a2', '深海杯 第2回', 2, 0, 2, 0.5],
    ]);
  });
});

describe('seriesStats', () => {
  it('シリーズごとの集計と皆勤者を出し、大会のないシリーズは除く', () => {
    const st = seriesStats(data);
    expect(st.map((s) => s.series.id)).toEqual(['A', 'B']);

    const a = st[0];
    expect([a.tournamentCount, a.totalEntries, a.uniquePlayers]).toEqual([2, 4, 3]);
    expect(a.perfectAttendance.map((p) => p.playerId)).toEqual(['p1']);
    expect(a.players.map((p) => [p.playerId, p.attended, p.totalGames, p.totalPoints])).toEqual([
      ['p1', 2, 22, 150.7],
      ['p3', 1, 9, 40],
      ['p2', 1, 8, -20],
    ]);

    const b = st[1];
    expect([b.tournamentCount, b.totalEntries, b.uniquePlayers]).toEqual([1, 2, 2]);
    expect(b.perfectAttendance.map((p) => p.playerId)).toEqual(['p3', 'p1']);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- src/lib/stats.test.ts`
Expected: FAIL（`./stats` が見つからない）

- [ ] **Step 3: 実装**

`src/lib/stats.ts`:
```ts
import type { Dataset, Result, Series, Tournament } from './types';

const UNKNOWN_SERIES = '(不明なシリーズ)';
const round1 = (n: number) => Math.round(n * 10) / 10;

export function sortTournaments(ts: Tournament[]): Tournament[] {
  return [...ts].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.importedAt - b.importedAt);
}

export function tournamentTitle(t: Tournament, series: Series | undefined): string {
  return `${series?.name ?? UNKNOWN_SERIES} ${t.label}`.trim();
}

type Index = {
  ordered: Tournament[];
  seriesById: Map<string, Series>;
  resultsByTournament: Map<string, Result[]>;
  /** 最新の大会での名前 */
  latestName: Map<string, string>;
};

function buildIndex(data: Dataset): Index {
  const ordered = sortTournaments(data.tournaments);
  const seriesById = new Map(data.series.map((s) => [s.id, s]));
  const resultsByTournament = new Map<string, Result[]>();
  for (const r of data.results) {
    const list = resultsByTournament.get(r.tournamentId) ?? [];
    list.push(r);
    resultsByTournament.set(r.tournamentId, list);
  }
  const latestName = new Map<string, string>();
  for (const t of ordered) {
    for (const r of resultsByTournament.get(t.id) ?? []) latestName.set(r.playerId, r.playerName);
  }
  return { ordered, seriesById, resultsByTournament, latestName };
}

export type PlayerSummary = {
  playerId: string;
  name: string;
  tournamentCount: number;
  totalGames: number;
  totalPoints: number;
  lastTournamentId: string;
};

export function summarizePlayers(data: Dataset, seriesId?: string): PlayerSummary[] {
  const idx = buildIndex(data);
  const map = new Map<string, PlayerSummary>();
  for (const t of idx.ordered) {
    if (seriesId && t.seriesId !== seriesId) continue;
    for (const r of idx.resultsByTournament.get(t.id) ?? []) {
      const s = map.get(r.playerId) ?? {
        playerId: r.playerId,
        name: idx.latestName.get(r.playerId) ?? r.playerName,
        tournamentCount: 0,
        totalGames: 0,
        totalPoints: 0,
        lastTournamentId: t.id,
      };
      s.tournamentCount += 1;
      s.totalGames += r.games;
      s.totalPoints += r.totalPoints;
      s.lastTournamentId = t.id;
      map.set(r.playerId, s);
    }
  }
  return [...map.values()]
    .map((s) => ({ ...s, totalPoints: round1(s.totalPoints) }))
    .sort((a, b) => b.tournamentCount - a.tournamentCount || b.totalGames - a.totalGames);
}

export type PlayerHistoryEntry = {
  tournament: Tournament;
  title: string;
  rank: number;
  games: number;
  totalPoints: number;
};

export type SeriesAttendance = {
  seriesId: string;
  seriesName: string;
  attended: number;
  total: number;
};

export type PlayerDetail = {
  playerId: string;
  name: string;
  history: PlayerHistoryEntry[];
  seriesAttendance: SeriesAttendance[];
};

export function getPlayerDetail(data: Dataset, playerId: string): PlayerDetail | null {
  const idx = buildIndex(data);
  const history: PlayerHistoryEntry[] = [];
  const totals = new Map<string, number>();
  const attended = new Map<string, number>();
  for (const t of idx.ordered) {
    totals.set(t.seriesId, (totals.get(t.seriesId) ?? 0) + 1);
    const r = idx.resultsByTournament.get(t.id)?.find((x) => x.playerId === playerId);
    if (!r) continue;
    attended.set(t.seriesId, (attended.get(t.seriesId) ?? 0) + 1);
    history.push({
      tournament: t,
      title: tournamentTitle(t, idx.seriesById.get(t.seriesId)),
      rank: r.rank,
      games: r.games,
      totalPoints: r.totalPoints,
    });
  }
  if (history.length === 0) return null;
  const seriesAttendance = [...attended].map(([seriesId, n]) => ({
    seriesId,
    seriesName: idx.seriesById.get(seriesId)?.name ?? UNKNOWN_SERIES,
    attended: n,
    total: totals.get(seriesId) ?? n,
  }));
  return { playerId, name: idx.latestName.get(playerId) ?? '', history, seriesAttendance };
}

export type TournamentStat = {
  tournament: Tournament;
  title: string;
  participants: number;
  newcomers: number;
  repeaters: number;
  /** 同シリーズ前回参加者のうち今回も参加した割合。前回がなければ null */
  retention: number | null;
};

export function tournamentStats(data: Dataset): TournamentStat[] {
  const idx = buildIndex(data);
  const seen = new Set<string>();
  const prevBySeries = new Map<string, Set<string>>();
  return idx.ordered.map((t) => {
    const ids = new Set((idx.resultsByTournament.get(t.id) ?? []).map((r) => r.playerId));
    let newcomers = 0;
    for (const id of ids) {
      if (!seen.has(id)) newcomers++;
      seen.add(id);
    }
    const prev = prevBySeries.get(t.seriesId);
    let retention: number | null = null;
    if (prev && prev.size > 0) {
      let kept = 0;
      for (const id of prev) if (ids.has(id)) kept++;
      retention = kept / prev.size;
    }
    prevBySeries.set(t.seriesId, ids);
    return {
      tournament: t,
      title: tournamentTitle(t, idx.seriesById.get(t.seriesId)),
      participants: ids.size,
      newcomers,
      repeaters: ids.size - newcomers,
      retention,
    };
  });
}

export type SeriesPlayerStat = {
  playerId: string;
  name: string;
  attended: number;
  totalGames: number;
  totalPoints: number;
};

export type SeriesStat = {
  series: Series;
  tournamentCount: number;
  totalEntries: number;
  uniquePlayers: number;
  perfectAttendance: SeriesPlayerStat[];
  /** 参加回数の多い順（同数なら対局数の多い順） */
  players: SeriesPlayerStat[];
};

export function seriesStats(data: Dataset): SeriesStat[] {
  const idx = buildIndex(data);
  return data.series
    .map((series) => {
      const ts = idx.ordered.filter((t) => t.seriesId === series.id);
      const map = new Map<string, SeriesPlayerStat>();
      let totalEntries = 0;
      for (const t of ts) {
        for (const r of idx.resultsByTournament.get(t.id) ?? []) {
          totalEntries++;
          const p = map.get(r.playerId) ?? {
            playerId: r.playerId,
            name: idx.latestName.get(r.playerId) ?? r.playerName,
            attended: 0,
            totalGames: 0,
            totalPoints: 0,
          };
          p.attended += 1;
          p.totalGames += r.games;
          p.totalPoints += r.totalPoints;
          map.set(r.playerId, p);
        }
      }
      const players = [...map.values()]
        .map((p) => ({ ...p, totalPoints: round1(p.totalPoints) }))
        .sort((a, b) => b.attended - a.attended || b.totalGames - a.totalGames);
      return {
        series,
        tournamentCount: ts.length,
        totalEntries,
        uniquePlayers: players.length,
        perfectAttendance: players.filter((p) => p.attended === ts.length),
        players,
      };
    })
    .filter((s) => s.tournamentCount > 0);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- src/lib/stats.test.ts`
Expected: PASS（9 tests）

- [ ] **Step 5: コミット**

```bash
git add -A && git commit -m "feat: 参加者・大会・シリーズの集計ロジックを追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: バックアップの作成・検証

**Files:**
- Create: `src/lib/backup.ts`
- Test: `src/lib/backup.test.ts`

**Interfaces:**
- Consumes: `Dataset`
- Produces:
  - `type Backup = { app: 'taikai-stats'; version: 1; exportedAt: string; data: Dataset }`
  - `createBackup(data: Dataset, now?: Date): Backup`
  - `type BackupParse = { ok: true; data: Dataset } | { ok: false; error: string }`
  - `parseBackup(json: string): BackupParse`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/backup.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Dataset } from './types';
import { createBackup, parseBackup } from './backup';

const data: Dataset = {
  series: [{ id: 's1', name: '深海杯' }],
  tournaments: [
    { id: 't1', seriesId: 's1', label: '第1回', startDate: '2026-01-10', endDate: '2026-01-12', mahjongSoulId: '708677', importedAt: 1 },
  ],
  results: [
    { id: 'r1', tournamentId: 't1', playerId: '111', playerName: 'A', rank: 1, games: 10, totalPoints: 12.3 },
  ],
};

describe('backup', () => {
  it('書き出したものを読み戻せる', () => {
    const json = JSON.stringify(createBackup(data, new Date('2026-10-04T00:00:00Z')));
    expect(JSON.parse(json).exportedAt).toBe('2026-10-04T00:00:00.000Z');
    expect(parseBackup(json)).toEqual({ ok: true, data });
  });

  it('JSONでなければエラー', () => {
    expect(parseBackup('not json').ok).toBe(false);
  });

  it('このアプリのバックアップでなければエラー', () => {
    expect(parseBackup(JSON.stringify({ app: 'other', version: 1, data })).ok).toBe(false);
  });

  it('項目が欠けていればエラー', () => {
    const broken = { ...data, results: [{ ...data.results[0], games: undefined }] };
    expect(parseBackup(JSON.stringify(createBackup(broken as unknown as Dataset))).ok).toBe(false);
  });

  it('存在しない大会・シリーズへの参照があればエラー', () => {
    const badResult = { ...data, results: [{ ...data.results[0], tournamentId: 'zzz' }] };
    expect(parseBackup(JSON.stringify(createBackup(badResult))).ok).toBe(false);
    const badTournament = { ...data, tournaments: [{ ...data.tournaments[0], seriesId: 'zzz' }] };
    expect(parseBackup(JSON.stringify(createBackup(badTournament))).ok).toBe(false);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- src/lib/backup.test.ts`
Expected: FAIL（`./backup` が見つからない）

- [ ] **Step 3: 実装**

`src/lib/backup.ts`:
```ts
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
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- src/lib/backup.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: コミット**

```bash
git add -A && git commit -m "feat: バックアップJSONの作成と検証を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: データベース（Dexie）

**Files:**
- Create: `src/db/schema.ts`, `src/db/repo.ts`, `src/db/useDataset.ts`
- Test: `src/db/repo.test.ts`

**Interfaces:**
- Consumes: `Series`, `Tournament`, `Result`, `ParsedRow`, `Dataset`
- Produces:
  - `class TaikaiDB extends Dexie`（テーブル `series`, `tournaments`, `results`）、`db: TaikaiDB`（本番用インスタンス）
  - `loadDataset(db: TaikaiDB): Promise<Dataset>`
  - `findTournamentByMahjongSoulId(db: TaikaiDB, mahjongSoulId: string): Promise<Tournament | undefined>`
  - `type ImportInput = { series: { id: string } | { newName: string }; label: string; startDate: string; endDate: string; mahjongSoulId: string | null; rows: ParsedRow[] }`
  - `importTournament(db: TaikaiDB, input: ImportInput, overwriteTournamentId?: string): Promise<string>`（大会IDを返す）
  - `type TournamentPatch = Pick<Tournament, 'seriesId' | 'label' | 'startDate' | 'endDate'>`
  - `updateTournament(db: TaikaiDB, id: string, patch: TournamentPatch): Promise<void>`
  - `deleteTournament(db: TaikaiDB, id: string): Promise<void>`
  - `renameSeries(db: TaikaiDB, id: string, name: string): Promise<void>`
  - `replaceAll(db: TaikaiDB, data: Dataset): Promise<void>`
  - `useDataset(): Dataset | undefined`（読み込み中は undefined）

- [ ] **Step 1: 失敗するテストを書く**

`src/db/repo.test.ts`:
```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ParsedRow } from '../lib/types';
import { TaikaiDB } from './schema';
import {
  deleteTournament,
  findTournamentByMahjongSoulId,
  importTournament,
  loadDataset,
  renameSeries,
  replaceAll,
  updateTournament,
} from './repo';

const rows: ParsedRow[] = [
  { rank: 1, playerId: '111', playerName: 'A', games: 10, totalPoints: 12.3 },
  { rank: 2, playerId: '222', playerName: 'B', games: 8, totalPoints: -5 },
];

let db: TaikaiDB;
beforeEach(() => {
  db = new TaikaiDB(`test-${crypto.randomUUID()}`);
});

const baseInput = {
  label: '第1回',
  startDate: '2026-01-10',
  endDate: '2026-01-12',
  mahjongSoulId: '708677',
  rows,
};

describe('importTournament', () => {
  it('新しいシリーズを作って大会と成績を保存する', async () => {
    const id = await importTournament(db, { ...baseInput, series: { newName: ' 深海杯 ' } });
    const data = await loadDataset(db);
    expect(data.series).toHaveLength(1);
    expect(data.series[0].name).toBe('深海杯');
    expect(data.tournaments).toEqual([
      expect.objectContaining({ id, seriesId: data.series[0].id, label: '第1回', startDate: '2026-01-10', endDate: '2026-01-12', mahjongSoulId: '708677' }),
    ]);
    expect(data.results.map((r) => [r.tournamentId, r.playerId])).toEqual([
      [id, '111'],
      [id, '222'],
    ]);
  });

  it('既存シリーズに追加できる', async () => {
    await importTournament(db, { ...baseInput, series: { newName: '深海杯' } });
    const seriesId = (await loadDataset(db)).series[0].id;
    await importTournament(db, { ...baseInput, label: '第2回', mahjongSoulId: null, series: { id: seriesId } });
    const data = await loadDataset(db);
    expect(data.series).toHaveLength(1);
    expect(data.tournaments.map((t) => t.seriesId)).toEqual([seriesId, seriesId]);
  });

  it('終了日が空なら開始日と同じにする', async () => {
    await importTournament(db, { ...baseInput, endDate: '', series: { newName: 'X' } });
    expect((await loadDataset(db)).tournaments[0].endDate).toBe('2026-01-10');
  });

  it('上書きすると成績を差し替え、IDと取り込み時刻は維持する', async () => {
    const id = await importTournament(db, { ...baseInput, series: { newName: 'X' } });
    const before = (await loadDataset(db)).tournaments[0];
    const found = await findTournamentByMahjongSoulId(db, '708677');
    expect(found?.id).toBe(id);

    const newRows: ParsedRow[] = [{ rank: 1, playerId: '333', playerName: 'C', games: 3, totalPoints: 1 }];
    const id2 = await importTournament(db, { ...baseInput, rows: newRows, series: { id: before.seriesId } }, id);
    const data = await loadDataset(db);
    expect(id2).toBe(id);
    expect(data.tournaments).toHaveLength(1);
    expect(data.tournaments[0].importedAt).toBe(before.importedAt);
    expect(data.results.map((r) => r.playerId)).toEqual(['333']);
  });
});

describe('大会・シリーズの編集', () => {
  it('大会を更新できる（終了日が空なら開始日）', async () => {
    const id = await importTournament(db, { ...baseInput, series: { newName: 'X' } });
    const seriesId = (await loadDataset(db)).series[0].id;
    await updateTournament(db, id, { seriesId, label: '第9回', startDate: '2026-05-01', endDate: '' });
    const t = (await loadDataset(db)).tournaments[0];
    expect([t.label, t.startDate, t.endDate]).toEqual(['第9回', '2026-05-01', '2026-05-01']);
  });

  it('大会を削除すると成績も消える', async () => {
    const id = await importTournament(db, { ...baseInput, series: { newName: 'X' } });
    await deleteTournament(db, id);
    const data = await loadDataset(db);
    expect(data.tournaments).toHaveLength(0);
    expect(data.results).toHaveLength(0);
  });

  it('シリーズ名を変更できる', async () => {
    await importTournament(db, { ...baseInput, series: { newName: 'X' } });
    const seriesId = (await loadDataset(db)).series[0].id;
    await renameSeries(db, seriesId, '夏宵');
    expect((await loadDataset(db)).series[0].name).toBe('夏宵');
  });
});

describe('replaceAll', () => {
  it('全データを置き換える', async () => {
    await importTournament(db, { ...baseInput, series: { newName: 'X' } });
    await replaceAll(db, {
      series: [{ id: 's9', name: 'Y' }],
      tournaments: [{ id: 't9', seriesId: 's9', label: '', startDate: '2026-02-01', endDate: '2026-02-01', mahjongSoulId: null, importedAt: 5 }],
      results: [{ id: 'r9', tournamentId: 't9', playerId: '999', playerName: 'Z', rank: 1, games: 1, totalPoints: 0 }],
    });
    const data = await loadDataset(db);
    expect(data.series.map((s) => s.id)).toEqual(['s9']);
    expect(data.tournaments.map((t) => t.id)).toEqual(['t9']);
    expect(data.results.map((r) => r.id)).toEqual(['r9']);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- src/db/repo.test.ts`
Expected: FAIL（`./schema` が見つからない）

- [ ] **Step 3: 実装**

`src/db/schema.ts`:
```ts
import Dexie, { type Table } from 'dexie';
import type { Result, Series, Tournament } from '../lib/types';

export class TaikaiDB extends Dexie {
  series!: Table<Series, string>;
  tournaments!: Table<Tournament, string>;
  results!: Table<Result, string>;

  constructor(name = 'taikai-stats') {
    super(name);
    this.version(1).stores({
      series: 'id',
      tournaments: 'id, seriesId, mahjongSoulId',
      results: 'id, tournamentId, playerId',
    });
  }
}

export const db = new TaikaiDB();
```

`src/db/repo.ts`:
```ts
import type { Dataset, ParsedRow, Tournament } from '../lib/types';
import type { TaikaiDB } from './schema';

export async function loadDataset(db: TaikaiDB): Promise<Dataset> {
  const [series, tournaments, results] = await Promise.all([
    db.series.toArray(),
    db.tournaments.toArray(),
    db.results.toArray(),
  ]);
  return { series, tournaments, results };
}

export function findTournamentByMahjongSoulId(db: TaikaiDB, mahjongSoulId: string): Promise<Tournament | undefined> {
  return db.tournaments.where('mahjongSoulId').equals(mahjongSoulId).first();
}

export type ImportInput = {
  series: { id: string } | { newName: string };
  label: string;
  startDate: string;
  endDate: string;
  mahjongSoulId: string | null;
  rows: ParsedRow[];
};

export function importTournament(db: TaikaiDB, input: ImportInput, overwriteTournamentId?: string): Promise<string> {
  return db.transaction('rw', db.series, db.tournaments, db.results, async () => {
    let seriesId: string;
    if ('id' in input.series) {
      seriesId = input.series.id;
    } else {
      seriesId = crypto.randomUUID();
      await db.series.add({ id: seriesId, name: input.series.newName.trim() });
    }
    const existing = overwriteTournamentId ? await db.tournaments.get(overwriteTournamentId) : undefined;
    const tournamentId = existing?.id ?? crypto.randomUUID();
    if (existing) await db.results.where('tournamentId').equals(existing.id).delete();
    await db.tournaments.put({
      id: tournamentId,
      seriesId,
      label: input.label.trim(),
      startDate: input.startDate,
      endDate: input.endDate || input.startDate,
      mahjongSoulId: input.mahjongSoulId,
      importedAt: existing?.importedAt ?? Date.now(),
    });
    await db.results.bulkAdd(input.rows.map((r) => ({ ...r, id: crypto.randomUUID(), tournamentId })));
    return tournamentId;
  });
}

export type TournamentPatch = Pick<Tournament, 'seriesId' | 'label' | 'startDate' | 'endDate'>;

export async function updateTournament(db: TaikaiDB, id: string, patch: TournamentPatch): Promise<void> {
  await db.tournaments.update(id, {
    ...patch,
    label: patch.label.trim(),
    endDate: patch.endDate || patch.startDate,
  });
}

export async function deleteTournament(db: TaikaiDB, id: string): Promise<void> {
  await db.transaction('rw', db.tournaments, db.results, async () => {
    await db.results.where('tournamentId').equals(id).delete();
    await db.tournaments.delete(id);
  });
}

export async function renameSeries(db: TaikaiDB, id: string, name: string): Promise<void> {
  await db.series.update(id, { name: name.trim() });
}

export async function replaceAll(db: TaikaiDB, data: Dataset): Promise<void> {
  await db.transaction('rw', db.series, db.tournaments, db.results, async () => {
    await Promise.all([db.series.clear(), db.tournaments.clear(), db.results.clear()]);
    await db.series.bulkAdd(data.series);
    await db.tournaments.bulkAdd(data.tournaments);
    await db.results.bulkAdd(data.results);
  });
}
```

`src/db/useDataset.ts`:
```ts
import { useLiveQuery } from 'dexie-react-hooks';
import type { Dataset } from '../lib/types';
import { loadDataset } from './repo';
import { db } from './schema';

/** 全データを読み込む。読み込み中は undefined。DB更新時に自動で再読み込みされる */
export function useDataset(): Dataset | undefined {
  return useLiveQuery(() => loadDataset(db));
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- src/db/repo.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 5: 全テストとビルドを確認**

Run: `npm test && npm run build`
Expected: 全テスト PASS、ビルド成功

- [ ] **Step 6: コミット**

```bash
git add -A && git commit -m "feat: IndexedDBへの保存処理を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 画面の骨組みとCSV取り込み画面

**Files:**
- Modify: `src/App.tsx`（全体を置き換え）
- Create: `src/pages/DataPage.tsx`, `src/pages/data/ImportSection.tsx`

**Interfaces:**
- Consumes: `useDataset`, `db`, `findTournamentByMahjongSoulId`, `importTournament`, `decodeCsv`, `extractMahjongSoulId`, `parseResultsCsv`, `Dataset`, `ParsedRow`
- Produces: `DataPage({ data }: { data: Dataset })`, `ImportSection({ data }: { data: Dataset })`

- [ ] **Step 1: 取り込み画面を作成**

`src/pages/data/ImportSection.tsx`:
```tsx
import { useState } from 'react';
import { findTournamentByMahjongSoulId, importTournament } from '../../db/repo';
import { db } from '../../db/schema';
import { decodeCsv, extractMahjongSoulId, parseResultsCsv } from '../../lib/csv';
import type { Dataset, ParsedRow } from '../../lib/types';

type PendingFile = {
  key: string;
  fileName: string;
  mahjongSoulId: string | null;
  rows: ParsedRow[];
  skipped: number;
};
type Rejected = { fileName: string; error: string };

export function ImportSection({ data }: { data: Dataset }) {
  const [queue, setQueue] = useState<PendingFile[]>([]);
  const [rejected, setRejected] = useState<Rejected[]>([]);
  const [message, setMessage] = useState('');
  const [dragOver, setDragOver] = useState(false);

  async function addFiles(files: FileList) {
    const accepted: PendingFile[] = [];
    const errors: Rejected[] = [];
    for (const f of Array.from(files)) {
      const outcome = parseResultsCsv(decodeCsv(await f.arrayBuffer()));
      if (outcome.ok) {
        accepted.push({
          key: crypto.randomUUID(),
          fileName: f.name,
          mahjongSoulId: extractMahjongSoulId(f.name),
          rows: outcome.rows,
          skipped: outcome.skipped,
        });
      } else {
        errors.push({ fileName: f.name, error: outcome.error });
      }
    }
    setQueue((q) => [...q, ...accepted]);
    setRejected(errors);
    setMessage('');
  }

  const current = queue[0];
  return (
    <section className="card">
      <h2>CSV取り込み</h2>
      <label
        className={`dropzone${dragOver ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void addFiles(e.dataTransfer.files);
        }}
      >
        雀魂の「シーズン順位統計」CSVをここにドロップ（複数可）、またはクリックして選択
        <input
          type="file"
          accept=".csv,text/csv"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </label>
      {rejected.map((r) => (
        <p key={r.fileName} className="error">
          {r.fileName}: {r.error}
        </p>
      ))}
      {message && <p className="muted">{message}</p>}
      {current && (
        <ImportForm
          key={current.key}
          file={current}
          remaining={queue.length - 1}
          data={data}
          onDone={(msg) => {
            setQueue((q) => q.slice(1));
            setMessage(msg);
          }}
        />
      )}
    </section>
  );
}

const NEW_SERIES = '__new__';

function ImportForm({
  file,
  remaining,
  data,
  onDone,
}: {
  file: PendingFile;
  remaining: number;
  data: Dataset;
  onDone: (message: string) => void;
}) {
  const [seriesChoice, setSeriesChoice] = useState(data.series[0]?.id ?? NEW_SERIES);
  const [newSeriesName, setNewSeriesName] = useState('');
  const [label, setLabel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setError('');
    if (seriesChoice === NEW_SERIES && !newSeriesName.trim()) return setError('シリーズ名を入力してください');
    if (!startDate) return setError('開始日を入力してください');
    if (endDate && endDate < startDate) return setError('終了日は開始日以降にしてください');

    let overwriteId: string | undefined;
    if (file.mahjongSoulId) {
      const existing = await findTournamentByMahjongSoulId(db, file.mahjongSoulId);
      if (existing) {
        if (!confirm(`大会ID ${file.mahjongSoulId} は取り込み済みです。上書きしますか？`)) return;
        overwriteId = existing.id;
      }
    }
    setSaving(true);
    try {
      await importTournament(
        db,
        {
          series: seriesChoice === NEW_SERIES ? { newName: newSeriesName } : { id: seriesChoice },
          label,
          startDate,
          endDate,
          mahjongSoulId: file.mahjongSoulId,
          rows: file.rows,
        },
        overwriteId,
      );
      onDone(`${file.fileName} を取り込みました（${file.rows.length}人）`);
    } catch (e) {
      setError(`保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
      setSaving(false);
    }
  }

  return (
    <div>
      <h3>
        {file.fileName}
        {remaining > 0 && <span className="muted">（このあと {remaining} 件）</span>}
      </h3>
      <p className="muted">
        大会ID: {file.mahjongSoulId ?? '不明'} ／ {file.rows.length}人
        {file.skipped > 0 && ` ／ ${file.skipped}行スキップ`}
      </p>
      <ol className="muted">
        {file.rows.slice(0, 5).map((r) => (
          <li key={r.playerId}>
            {r.playerName}（{r.games}局 {r.totalPoints}）
          </li>
        ))}
      </ol>
      <div className="row">
        <label className="field">
          シリーズ
          <select value={seriesChoice} onChange={(e) => setSeriesChoice(e.target.value)}>
            {data.series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value={NEW_SERIES}>＋ 新しいシリーズ</option>
          </select>
        </label>
        {seriesChoice === NEW_SERIES && (
          <label className="field">
            シリーズ名
            <input value={newSeriesName} onChange={(e) => setNewSeriesName(e.target.value)} placeholder="例：深海杯" />
          </label>
        )}
        <label className="field">
          回
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例：第3回" />
        </label>
        <label className="field">
          開始日
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="field">
          終了日（1日開催なら空欄）
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" disabled={saving} onClick={() => void save()}>
          保存
        </button>
        <button disabled={saving} onClick={() => onDone(`${file.fileName} をスキップしました`)}>
          スキップ
        </button>
      </div>
    </div>
  );
}
```

`src/pages/DataPage.tsx`:
```tsx
import type { Dataset } from '../lib/types';
import { ImportSection } from './data/ImportSection';

export function DataPage({ data }: { data: Dataset }) {
  return <ImportSection data={data} />;
}
```

- [ ] **Step 2: App を置き換え**

`src/App.tsx`:
```tsx
import { Navigate, NavLink, Route, Routes } from 'react-router';
import { useDataset } from './db/useDataset';
import { DataPage } from './pages/DataPage';

const TABS = [{ to: '/data', label: 'データ管理' }];

export default function App() {
  const data = useDataset();
  return (
    <div className="app">
      <header className="app-header">
        <h1>大会参加者統計</h1>
        <nav className="tabs">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main>
        {data === undefined ? (
          <p className="muted">読み込み中…</p>
        ) : (
          <Routes>
            <Route path="/data" element={<DataPage data={data} />} />
            <Route path="*" element={<Navigate to="/data" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: ビルド確認**

Run: `npm run build`
Expected: 成功

- [ ] **Step 4: ブラウザで動作確認**

`preview_start`（name: `taikai-stats`）で開き、以下を確認:
- `src/test/fixtures/season-708677.csv` を選択 → 「大会ID: 708677 ／ 61人」と上位5名が表示される
- 新しいシリーズ「テスト」、回「第1回」、開始日を入力して保存 → 「取り込みました（61人）」
- 同じファイルを再度取り込み → 上書き確認ダイアログが出る
- 開始日なしで保存 → 「開始日を入力してください」
- 必須列のないCSV（例: `sjis-sample.csv` の1行目から「累計打点」を消したもの）→ エラー表示

- [ ] **Step 5: コミット**

```bash
git add -A && git commit -m "feat: 画面の骨組みとCSV取り込み画面を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: データ管理（大会編集・削除・シリーズ名変更・バックアップ）

**Files:**
- Create: `src/lib/download.ts`, `src/pages/data/TournamentManager.tsx`, `src/pages/data/SeriesManager.tsx`, `src/pages/data/BackupSection.tsx`
- Modify: `src/pages/DataPage.tsx`（全体を置き換え）

**Interfaces:**
- Consumes: `db`, `updateTournament`, `deleteTournament`, `renameSeries`, `replaceAll`, `createBackup`, `parseBackup`, `sortTournaments`, `tournamentTitle`, `formatPeriod`
- Produces: `downloadUrl(url: string, fileName: string): void`, `downloadBlob(blob: Blob, fileName: string): void`

- [ ] **Step 1: ダウンロード補助を作成**

`src/lib/download.ts`:
```ts
export function downloadUrl(url: string, fileName: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, fileName);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 2: 大会の編集・削除**

`src/pages/data/TournamentManager.tsx`:
```tsx
import { useState } from 'react';
import { deleteTournament, updateTournament } from '../../db/repo';
import { db } from '../../db/schema';
import { formatPeriod } from '../../lib/format';
import { sortTournaments, tournamentTitle } from '../../lib/stats';
import type { Dataset, Series, Tournament } from '../../lib/types';

export function TournamentManager({ data }: { data: Dataset }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  if (data.tournaments.length === 0) return null;

  const seriesById = new Map(data.series.map((s) => [s.id, s]));
  const counts = new Map<string, number>();
  for (const r of data.results) counts.set(r.tournamentId, (counts.get(r.tournamentId) ?? 0) + 1);
  const ordered = sortTournaments(data.tournaments).reverse();

  return (
    <section className="card">
      <h2>取り込み済みの大会</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>大会</th>
              <th>開催期間</th>
              <th className="num">人数</th>
              <th>雀魂大会ID</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ordered.map((t) => {
              const title = tournamentTitle(t, seriesById.get(t.seriesId));
              return editingId === t.id ? (
                <TournamentEditRow key={t.id} t={t} series={data.series} onClose={() => setEditingId(null)} />
              ) : (
                <tr key={t.id}>
                  <td>{title}</td>
                  <td>{formatPeriod(t)}</td>
                  <td className="num">{counts.get(t.id) ?? 0}</td>
                  <td>{t.mahjongSoulId ?? '—'}</td>
                  <td>
                    <div className="row">
                      <button onClick={() => setEditingId(t.id)}>編集</button>
                      <button
                        className="danger"
                        onClick={() => {
                          if (confirm(`「${title}」を削除しますか？この操作は取り消せません。`)) void deleteTournament(db, t.id);
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TournamentEditRow({ t, series, onClose }: { t: Tournament; series: Series[]; onClose: () => void }) {
  const [seriesId, setSeriesId] = useState(t.seriesId);
  const [label, setLabel] = useState(t.label);
  const [startDate, setStartDate] = useState(t.startDate);
  const [endDate, setEndDate] = useState(t.endDate === t.startDate ? '' : t.endDate);
  const [error, setError] = useState('');

  async function save() {
    if (!startDate) return setError('開始日を入力してください');
    if (endDate && endDate < startDate) return setError('終了日は開始日以降にしてください');
    await updateTournament(db, t.id, { seriesId, label, startDate, endDate });
    onClose();
  }

  return (
    <tr>
      <td colSpan={5}>
        <div className="row">
          <label className="field">
            シリーズ
            <select value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
              {series.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            回
            <input value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="field">
            開始日
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="field">
            終了日（1日開催なら空欄）
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <button className="primary" onClick={() => void save()}>
            保存
          </button>
          <button onClick={onClose}>キャンセル</button>
        </div>
        {error && <p className="error">{error}</p>}
      </td>
    </tr>
  );
}
```

- [ ] **Step 3: シリーズ名変更**

`src/pages/data/SeriesManager.tsx`:
```tsx
import { useState } from 'react';
import { renameSeries } from '../../db/repo';
import { db } from '../../db/schema';
import type { Dataset } from '../../lib/types';

export function SeriesManager({ data }: { data: Dataset }) {
  if (data.series.length === 0) return null;
  return (
    <section className="card">
      <h2>シリーズ名の変更</h2>
      {data.series.map((s) => (
        <SeriesRenameRow key={s.id} id={s.id} name={s.name} />
      ))}
    </section>
  );
}

function SeriesRenameRow({ id, name }: { id: string; name: string }) {
  const [value, setValue] = useState(name);
  const trimmed = value.trim();
  return (
    <div className="row" style={{ marginBottom: 8 }}>
      <input value={value} onChange={(e) => setValue(e.target.value)} />
      <button disabled={!trimmed || trimmed === name} onClick={() => void renameSeries(db, id, trimmed)}>
        変更
      </button>
    </div>
  );
}
```

- [ ] **Step 4: バックアップ**

`src/pages/data/BackupSection.tsx`:
```tsx
import { useState } from 'react';
import { replaceAll } from '../../db/repo';
import { db } from '../../db/schema';
import { createBackup, parseBackup } from '../../lib/backup';
import { downloadBlob } from '../../lib/download';
import type { Dataset } from '../../lib/types';

export function BackupSection({ data }: { data: Dataset }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function exportBackup() {
    const blob = new Blob([JSON.stringify(createBackup(data), null, 2)], { type: 'application/json' });
    downloadBlob(blob, `taikai-stats-backup-${new Date().toISOString().slice(0, 10)}.json`);
  }

  async function restore(file: File) {
    setMessage('');
    setError('');
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) return setError(parsed.error);
    if (!confirm(`現在のデータをすべて置き換えます（大会 ${parsed.data.tournaments.length} 件）。よろしいですか？`)) return;
    await replaceAll(db, parsed.data);
    setMessage('バックアップを読み込みました');
  }

  return (
    <section className="card">
      <h2>バックアップ</h2>
      <p className="muted">
        データはこのブラウザにだけ保存されています。ブラウザのデータを消すと失われるので、定期的に書き出してください。
      </p>
      <div className="row">
        <button className="primary" disabled={data.tournaments.length === 0} onClick={exportBackup}>
          バックアップを書き出す
        </button>
        <label className="button-like">
          バックアップを読み込む
          <input
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void restore(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {message && <p className="muted">{message}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 5: DataPage を置き換え**

`src/pages/DataPage.tsx`:
```tsx
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
```

- [ ] **Step 6: ビルドとブラウザ確認**

Run: `npm run build` → 成功

ブラウザで確認:
- 大会の編集で回・開催期間を変えて保存 → 一覧に反映
- シリーズ名変更 → 大会一覧のタイトルに反映
- バックアップを書き出す → JSONがダウンロードされる
- 大会を削除 → 一覧から消える
- 書き出したJSONを読み込む → 確認後に削除前の状態に戻る
- 適当なテキストファイルを読み込む → エラー表示、データは変わらない

- [ ] **Step 7: コミット**

```bash
git add -A && git commit -m "feat: 大会編集・シリーズ名変更・バックアップを追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 表コンポーネントとプレイヤー画面

**Files:**
- Create: `src/components/DataTable.tsx`, `src/components/NoData.tsx`, `src/pages/PlayersPage.tsx`, `src/pages/PlayerDetailPage.tsx`
- Modify: `src/App.tsx`（全体を置き換え）

**Interfaces:**
- Consumes: `summarizePlayers`, `PlayerSummary`, `getPlayerDetail`, `PlayerHistoryEntry`, `tournamentTitle`, `formatPoints`, `formatPeriod`
- Produces:
  - `type Column<T> = { key: string; label: string; render: (row: T) => ReactNode; sortValue?: (row: T) => number | string; num?: boolean }`
  - `DataTable<T>(props: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; onRowClick?: (row: T) => void; sortable?: boolean; limit?: number; empty?: string })` — 並び替え後に `limit` 件に絞る
  - `NoData()`
  - `PlayersPage({ data })`, `PlayerDetailPage({ data })`

- [ ] **Step 1: 表コンポーネント**

`src/components/DataTable.tsx`:
```tsx
import { useState, type ReactNode } from 'react';

export type Column<T> = {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => number | string;
  num?: boolean;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  sortable?: boolean;
  /** 並び替えた後に先頭から何件表示するか */
  limit?: number;
  empty?: string;
};

export function DataTable<T>({ columns, rows, rowKey, onRowClick, sortable = false, limit, empty = 'データがありません' }: Props<T>) {
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  if (rows.length === 0) return <p className="muted">{empty}</p>;

  const sortCol = sort ? columns.find((c) => c.key === sort.key) : undefined;
  let shown = rows;
  if (sort && sortCol?.sortValue) {
    const value = sortCol.sortValue;
    shown = [...rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ja');
      return sort.desc ? -cmp : cmp;
    });
  }
  if (limit !== undefined) shown = shown.slice(0, limit);

  function toggle(c: Column<T>) {
    if (!sortable || !c.sortValue) return;
    setSort((s) => (s?.key === c.key ? { key: c.key, desc: !s.desc } : { key: c.key, desc: true }));
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={[c.num && 'num', sortable && c.sortValue && 'sortable'].filter(Boolean).join(' ') || undefined}
                onClick={() => toggle(c)}
              >
                {c.label}
                {sort?.key === c.key && (sort.desc ? ' ▼' : ' ▲')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr
              key={rowKey(r)}
              className={onRowClick ? 'clickable' : undefined}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.num ? 'num' : undefined}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`src/components/NoData.tsx`:
```tsx
import { Link } from 'react-router';

export function NoData() {
  return (
    <section className="card">
      <p className="muted">
        まだ大会データがありません。<Link to="/data">データ管理</Link>からCSVを取り込んでください。
      </p>
    </section>
  );
}
```

- [ ] **Step 2: プレイヤー一覧**

`src/pages/PlayersPage.tsx`:
```tsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { DataTable, type Column } from '../components/DataTable';
import { NoData } from '../components/NoData';
import { formatPoints } from '../lib/format';
import { summarizePlayers, tournamentTitle, type PlayerSummary } from '../lib/stats';
import type { Dataset } from '../lib/types';

export function PlayersPage({ data }: { data: Dataset }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [seriesId, setSeriesId] = useState('');
  const players = useMemo(() => summarizePlayers(data, seriesId || undefined), [data, seriesId]);
  const titles = useMemo(() => {
    const seriesById = new Map(data.series.map((s) => [s.id, s]));
    return new Map(data.tournaments.map((t) => [t.id, tournamentTitle(t, seriesById.get(t.seriesId))]));
  }, [data]);

  if (data.tournaments.length === 0) return <NoData />;

  const q = query.trim().toLowerCase();
  const rows = q ? players.filter((p) => p.name.toLowerCase().includes(q) || p.playerId.includes(q)) : players;
  const columns: Column<PlayerSummary>[] = [
    { key: 'name', label: '名前', render: (p) => p.name, sortValue: (p) => p.name },
    { key: 'count', label: '参加大会数', num: true, render: (p) => p.tournamentCount, sortValue: (p) => p.tournamentCount },
    { key: 'games', label: '通算対局数', num: true, render: (p) => p.totalGames, sortValue: (p) => p.totalGames },
    { key: 'points', label: '通算打点', num: true, render: (p) => formatPoints(p.totalPoints), sortValue: (p) => p.totalPoints },
    { key: 'last', label: '最終参加大会', render: (p) => titles.get(p.lastTournamentId) ?? '' },
  ];

  return (
    <section className="card">
      <h2>プレイヤー一覧</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <input placeholder="名前・IDで検索" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
          <option value="">全シリーズ</option>
          {data.series.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="muted">{rows.length}人</span>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(p) => p.playerId}
        sortable
        onRowClick={(p) => navigate(`/players/${p.playerId}`)}
      />
    </section>
  );
}
```

- [ ] **Step 3: プレイヤー詳細**

`src/pages/PlayerDetailPage.tsx`:
```tsx
import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { DataTable, type Column } from '../components/DataTable';
import { formatPeriod, formatPoints } from '../lib/format';
import { getPlayerDetail, type PlayerHistoryEntry } from '../lib/stats';
import type { Dataset } from '../lib/types';

const columns: Column<PlayerHistoryEntry>[] = [
  { key: 'title', label: '大会', render: (h) => h.title },
  { key: 'period', label: '開催期間', render: (h) => formatPeriod(h.tournament) },
  { key: 'rank', label: '順位', num: true, render: (h) => h.rank },
  { key: 'games', label: '対局数', num: true, render: (h) => h.games },
  { key: 'points', label: '打点', num: true, render: (h) => formatPoints(h.totalPoints) },
];

export function PlayerDetailPage({ data }: { data: Dataset }) {
  const navigate = useNavigate();
  const { playerId = '' } = useParams();
  const detail = useMemo(() => getPlayerDetail(data, playerId), [data, playerId]);

  if (!detail) {
    return (
      <section className="card">
        <p>プレイヤーが見つかりません。</p>
        <Link to="/players">← プレイヤー一覧へ</Link>
      </section>
    );
  }

  return (
    <>
      <p>
        <Link to="/players">← プレイヤー一覧へ</Link>
      </p>
      <section className="card">
        <h2>
          {detail.name} <span className="muted">ID: {detail.playerId}</span>
        </h2>
        <div className="stat-grid">
          <div className="stat">
            参加大会数<b>{detail.history.length}</b>
          </div>
          {detail.seriesAttendance.map((s) => (
            <div className="stat" key={s.seriesId}>
              {s.seriesName}
              <b>
                {s.attended}/{s.total}回
              </b>
            </div>
          ))}
        </div>
        <DataTable
          columns={columns}
          rows={detail.history}
          rowKey={(h) => h.tournament.id}
          onRowClick={(h) => navigate(`/tournaments/${h.tournament.id}`)}
        />
      </section>
    </>
  );
}
```

注: 行クリック先の `/tournaments/:id` は Task 9 で作る。Task 9 までは `*` ルートで `/players` に戻る。

- [ ] **Step 4: App を置き換え**

`src/App.tsx`:
```tsx
import { Navigate, NavLink, Route, Routes } from 'react-router';
import { useDataset } from './db/useDataset';
import { DataPage } from './pages/DataPage';
import { PlayerDetailPage } from './pages/PlayerDetailPage';
import { PlayersPage } from './pages/PlayersPage';

const TABS = [
  { to: '/players', label: 'プレイヤー' },
  { to: '/data', label: 'データ管理' },
];

export default function App() {
  const data = useDataset();
  return (
    <div className="app">
      <header className="app-header">
        <h1>大会参加者統計</h1>
        <nav className="tabs">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main>
        {data === undefined ? (
          <p className="muted">読み込み中…</p>
        ) : (
          <Routes>
            <Route path="/players" element={<PlayersPage data={data} />} />
            <Route path="/players/:playerId" element={<PlayerDetailPage data={data} />} />
            <Route path="/data" element={<DataPage data={data} />} />
            <Route path="*" element={<Navigate to={data.tournaments.length > 0 ? '/players' : '/data'} replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 5: ビルドとブラウザ確認**

Run: `npm run build` → 成功

ブラウザで確認（`season-708677.csv` を2つのシリーズに別々の大会として取り込んでおく）:
- プレイヤー一覧に61人、参加大会数 2
- 「通算打点」クリックで降順 ▼、再クリックで昇順 ▲
- 「プレイヤー01」で検索 → プレイヤー01のみ
- シリーズ絞り込み → 参加大会数が1になる
- 行クリック → 詳細に参加大会2件、シリーズ別「1/1回」が2つ
- スマホ幅（resize_window mobile）で表が横スクロールでき、ページ全体は横にはみ出さない

- [ ] **Step 6: コミット**

```bash
git add -A && git commit -m "feat: プレイヤー一覧・詳細画面を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 大会集計画面

**Files:**
- Create: `src/pages/TournamentsPage.tsx`, `src/pages/TournamentDetailPage.tsx`
- Modify: `src/App.tsx`（全体を置き換え）

**Interfaces:**
- Consumes: `tournamentStats`, `TournamentStat`, `DataTable`, `Column`, `NoData`, `formatPeriod`, `formatPercent`, `formatPoints`
- Produces: `TournamentsPage({ data })`, `TournamentDetailPage({ data })`

- [ ] **Step 1: 大会集計一覧**

`src/pages/TournamentsPage.tsx`:
```tsx
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { DataTable, type Column } from '../components/DataTable';
import { NoData } from '../components/NoData';
import { formatPercent, formatPeriod } from '../lib/format';
import { tournamentStats, type TournamentStat } from '../lib/stats';
import type { Dataset } from '../lib/types';

const columns: Column<TournamentStat>[] = [
  { key: 'title', label: '大会', render: (s) => s.title, sortValue: (s) => s.title },
  { key: 'period', label: '開催期間', render: (s) => formatPeriod(s.tournament), sortValue: (s) => s.tournament.startDate },
  { key: 'participants', label: '参加人数', num: true, render: (s) => s.participants, sortValue: (s) => s.participants },
  { key: 'newcomers', label: '新規', num: true, render: (s) => s.newcomers, sortValue: (s) => s.newcomers },
  { key: 'repeaters', label: 'リピーター', num: true, render: (s) => s.repeaters, sortValue: (s) => s.repeaters },
  { key: 'retention', label: '継続率', num: true, render: (s) => formatPercent(s.retention), sortValue: (s) => s.retention ?? -1 },
];

export function TournamentsPage({ data }: { data: Dataset }) {
  const navigate = useNavigate();
  const stats = useMemo(() => tournamentStats(data).reverse(), [data]);
  if (stats.length === 0) return <NoData />;
  return (
    <section className="card">
      <h2>大会集計</h2>
      <p className="muted">新規＝全大会を通じて初参加。継続率＝同じシリーズの前回参加者のうち今回も参加した割合。</p>
      <DataTable
        columns={columns}
        rows={stats}
        rowKey={(s) => s.tournament.id}
        sortable
        onRowClick={(s) => navigate(`/tournaments/${s.tournament.id}`)}
      />
    </section>
  );
}
```

- [ ] **Step 2: 大会の順位表**

`src/pages/TournamentDetailPage.tsx`:
```tsx
import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { DataTable, type Column } from '../components/DataTable';
import { formatPercent, formatPeriod, formatPoints } from '../lib/format';
import { tournamentStats } from '../lib/stats';
import type { Dataset, Result } from '../lib/types';

const columns: Column<Result>[] = [
  { key: 'rank', label: '順位', num: true, render: (r) => r.rank },
  { key: 'name', label: '名前', render: (r) => r.playerName },
  { key: 'games', label: '対局数', num: true, render: (r) => r.games },
  { key: 'points', label: '累計打点', num: true, render: (r) => formatPoints(r.totalPoints) },
];

export function TournamentDetailPage({ data }: { data: Dataset }) {
  const navigate = useNavigate();
  const { tournamentId = '' } = useParams();
  const stat = useMemo(() => tournamentStats(data).find((s) => s.tournament.id === tournamentId), [data, tournamentId]);
  const results = useMemo(
    () => data.results.filter((r) => r.tournamentId === tournamentId).sort((a, b) => a.rank - b.rank),
    [data, tournamentId],
  );

  if (!stat) {
    return (
      <section className="card">
        <p>大会が見つかりません。</p>
        <Link to="/tournaments">← 大会集計へ</Link>
      </section>
    );
  }

  return (
    <>
      <p>
        <Link to="/tournaments">← 大会集計へ</Link>
      </p>
      <section className="card">
        <h2>
          {stat.title} <span className="muted">{formatPeriod(stat.tournament)}</span>
        </h2>
        <div className="stat-grid">
          <div className="stat">参加人数<b>{stat.participants}</b></div>
          <div className="stat">新規<b>{stat.newcomers}</b></div>
          <div className="stat">リピーター<b>{stat.repeaters}</b></div>
          <div className="stat">継続率<b>{formatPercent(stat.retention)}</b></div>
        </div>
        <DataTable columns={columns} rows={results} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/players/${r.playerId}`)} />
      </section>
    </>
  );
}
```

- [ ] **Step 3: App を置き換え**

`src/App.tsx`:
```tsx
import { Navigate, NavLink, Route, Routes } from 'react-router';
import { useDataset } from './db/useDataset';
import { DataPage } from './pages/DataPage';
import { PlayerDetailPage } from './pages/PlayerDetailPage';
import { PlayersPage } from './pages/PlayersPage';
import { TournamentDetailPage } from './pages/TournamentDetailPage';
import { TournamentsPage } from './pages/TournamentsPage';

const TABS = [
  { to: '/players', label: 'プレイヤー' },
  { to: '/tournaments', label: '大会' },
  { to: '/data', label: 'データ管理' },
];

export default function App() {
  const data = useDataset();
  return (
    <div className="app">
      <header className="app-header">
        <h1>大会参加者統計</h1>
        <nav className="tabs">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main>
        {data === undefined ? (
          <p className="muted">読み込み中…</p>
        ) : (
          <Routes>
            <Route path="/players" element={<PlayersPage data={data} />} />
            <Route path="/players/:playerId" element={<PlayerDetailPage data={data} />} />
            <Route path="/tournaments" element={<TournamentsPage data={data} />} />
            <Route path="/tournaments/:tournamentId" element={<TournamentDetailPage data={data} />} />
            <Route path="/data" element={<DataPage data={data} />} />
            <Route path="*" element={<Navigate to={data.tournaments.length > 0 ? '/players' : '/data'} replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: ビルドとブラウザ確認**

Run: `npm run build` → 成功

ブラウザで確認（同じCSVを同じシリーズに「第1回」「第2回」として2回取り込んだ状態。2回目はファイル名を `copy.csv` に変えて取り込む。大会IDが付かないので上書き確認は出ず、別の大会として保存される）:
- 第1回: 参加61・新規61・リピーター0・継続率 —
- 第2回: 参加61・新規0・リピーター61・継続率 100%
- 行クリックで順位表、名前クリックでプレイヤー詳細

- [ ] **Step 5: コミット**

```bash
git add -A && git commit -m "feat: 大会集計画面を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: シリーズ集計画面

**Files:**
- Create: `src/pages/SeriesPage.tsx`
- Modify: `src/App.tsx`（全体を置き換え）

**Interfaces:**
- Consumes: `seriesStats`, `SeriesStat`, `SeriesPlayerStat`, `DataTable`, `Column`, `NoData`, `formatPoints`
- Produces: `SeriesPage({ data })`

- [ ] **Step 1: シリーズ集計**

`src/pages/SeriesPage.tsx`:
```tsx
import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { DataTable, type Column } from '../components/DataTable';
import { NoData } from '../components/NoData';
import { formatPoints } from '../lib/format';
import { seriesStats, type SeriesPlayerStat, type SeriesStat } from '../lib/stats';
import type { Dataset } from '../lib/types';

type Ranked = SeriesPlayerStat & { place: number };
const withPlace = (ps: SeriesPlayerStat[]): Ranked[] => ps.map((p, i) => ({ ...p, place: i + 1 }));

function rankingColumns(label: string, value: (p: Ranked) => ReactNode): Column<Ranked>[] {
  return [
    { key: 'place', label: '#', num: true, render: (p) => p.place },
    { key: 'name', label: '名前', render: (p) => p.name },
    { key: 'value', label, num: true, render: value },
  ];
}

export function SeriesPage({ data }: { data: Dataset }) {
  const stats = useMemo(() => seriesStats(data), [data]);
  if (stats.length === 0) return <NoData />;
  return (
    <>
      {stats.map((s) => (
        <SeriesCard key={s.series.id} stat={s} />
      ))}
    </>
  );
}

function SeriesCard({ stat }: { stat: SeriesStat }) {
  const navigate = useNavigate();
  const toPlayer = (p: Ranked) => navigate(`/players/${p.playerId}`);
  const byAttended = withPlace(stat.players);
  const byGames = withPlace([...stat.players].sort((a, b) => b.totalGames - a.totalGames));
  const byPoints = withPlace([...stat.players].sort((a, b) => b.totalPoints - a.totalPoints));

  return (
    <section className="card">
      <h2>{stat.series.name}</h2>
      <div className="stat-grid">
        <div className="stat">開催回数<b>{stat.tournamentCount}回</b></div>
        <div className="stat">のべ参加人数<b>{stat.totalEntries}人</b></div>
        <div className="stat">ユニーク参加人数<b>{stat.uniquePlayers}人</b></div>
        <div className="stat">皆勤者<b>{stat.perfectAttendance.length}人</b></div>
      </div>
      <h3>皆勤者（全{stat.tournamentCount}回参加）</h3>
      {stat.perfectAttendance.length > 0 ? (
        <p>{stat.perfectAttendance.map((p) => p.name).join('、')}</p>
      ) : (
        <p className="muted">なし</p>
      )}
      <div className="ranking-grid">
        <div>
          <h3>参加回数ランキング</h3>
          <DataTable columns={rankingColumns('参加', (p) => `${p.attended}回`)} rows={byAttended} rowKey={(p) => p.playerId} onRowClick={toPlayer} limit={20} />
        </div>
        <div>
          <h3>通算対局数ランキング</h3>
          <DataTable columns={rankingColumns('対局数', (p) => p.totalGames)} rows={byGames} rowKey={(p) => p.playerId} onRowClick={toPlayer} limit={20} />
        </div>
        <div>
          <h3>通算打点ランキング</h3>
          <DataTable columns={rankingColumns('打点', (p) => formatPoints(p.totalPoints))} rows={byPoints} rowKey={(p) => p.playerId} onRowClick={toPlayer} limit={20} />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: App を置き換え**

`src/App.tsx`:
```tsx
import { Navigate, NavLink, Route, Routes } from 'react-router';
import { useDataset } from './db/useDataset';
import { DataPage } from './pages/DataPage';
import { PlayerDetailPage } from './pages/PlayerDetailPage';
import { PlayersPage } from './pages/PlayersPage';
import { SeriesPage } from './pages/SeriesPage';
import { TournamentDetailPage } from './pages/TournamentDetailPage';
import { TournamentsPage } from './pages/TournamentsPage';

const TABS = [
  { to: '/players', label: 'プレイヤー' },
  { to: '/tournaments', label: '大会' },
  { to: '/series', label: 'シリーズ' },
  { to: '/data', label: 'データ管理' },
];

export default function App() {
  const data = useDataset();
  return (
    <div className="app">
      <header className="app-header">
        <h1>大会参加者統計</h1>
        <nav className="tabs">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main>
        {data === undefined ? (
          <p className="muted">読み込み中…</p>
        ) : (
          <Routes>
            <Route path="/players" element={<PlayersPage data={data} />} />
            <Route path="/players/:playerId" element={<PlayerDetailPage data={data} />} />
            <Route path="/tournaments" element={<TournamentsPage data={data} />} />
            <Route path="/tournaments/:tournamentId" element={<TournamentDetailPage data={data} />} />
            <Route path="/series" element={<SeriesPage data={data} />} />
            <Route path="/data" element={<DataPage data={data} />} />
            <Route path="*" element={<Navigate to={data.tournaments.length > 0 ? '/players' : '/data'} replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: ビルドとブラウザ確認**

Run: `npm run build` → 成功

ブラウザで確認（Task 9 の状態）:
- 開催回数2・のべ122人・ユニーク61人・皆勤者61人
- 3つのランキングが各20件、打点ランキング1位がプレイヤー01（597.2）
- スマホ幅でランキングが縦に並ぶ

- [ ] **Step 4: コミット**

```bash
git add -A && git commit -m "feat: シリーズ集計画面を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 画像出力

**Files:**
- Create: `src/components/Exportable.tsx`
- Modify: `src/pages/PlayersPage.tsx`, `src/pages/TournamentsPage.tsx`, `src/pages/SeriesPage.tsx`

**Interfaces:**
- Consumes: `downloadUrl`, `DataTable`（`limit` prop）
- Produces: `Exportable(props: { title: string; defaultLimit?: number | null; children: (limit: number | undefined) => ReactNode })` — 件数セレクト＋「画像で保存」。`title` は画像内の見出しとファイル名に使う

- [ ] **Step 1: Exportable を作成**

`src/components/Exportable.tsx`:
```tsx
import { toPng } from 'html-to-image';
import { useRef, useState, type ReactNode } from 'react';
import { downloadUrl } from '../lib/download';

const LIMITS = [10, 20, 30, 50];

type Props = {
  title: string;
  /** null は全件 */
  defaultLimit?: number | null;
  children: (limit: number | undefined) => ReactNode;
};

export function Exportable({ title, defaultLimit = null, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState<number | null>(defaultLimit);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#ffffff';
      const url = await toPng(ref.current, { backgroundColor: bg, pixelRatio: 2 });
      downloadUrl(url, `${title.replace(/[\\/:*?"<>|]/g, '_')}.png`);
    } catch (e) {
      alert(`画像の作成に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row export-controls">
        <label className="muted">
          表示件数{' '}
          <select value={limit ?? ''} onChange={(e) => setLimit(e.target.value ? Number(e.target.value) : null)}>
            <option value="">全件</option>
            {LIMITS.map((n) => (
              <option key={n} value={n}>
                上位{n}件
              </option>
            ))}
          </select>
        </label>
        <button disabled={busy} onClick={() => void save()}>
          {busy ? '作成中…' : '画像で保存'}
        </button>
      </div>
      <div ref={ref} className="capture">
        <h3 className="capture-title">{title}</h3>
        {children(limit ?? undefined)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: プレイヤー一覧に組み込む**

`src/pages/PlayersPage.tsx` で import を追加:
```tsx
import { Exportable } from '../components/Exportable';
```
`const columns` の下に追加:
```tsx
  const seriesName = data.series.find((s) => s.id === seriesId)?.name ?? '全シリーズ';
```
`<DataTable ... />` を次で置き換え:
```tsx
      <Exportable title={`${seriesName} 参加者一覧`}>
        {(limit) => (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(p) => p.playerId}
            sortable
            limit={limit}
            onRowClick={(p) => navigate(`/players/${p.playerId}`)}
          />
        )}
      </Exportable>
```

- [ ] **Step 3: 大会集計に組み込む**

`src/pages/TournamentsPage.tsx` で import を追加:
```tsx
import { Exportable } from '../components/Exportable';
```
`<DataTable ... />` を次で置き換え:
```tsx
      <Exportable title="大会集計">
        {(limit) => (
          <DataTable
            columns={columns}
            rows={stats}
            rowKey={(s) => s.tournament.id}
            sortable
            limit={limit}
            onRowClick={(s) => navigate(`/tournaments/${s.tournament.id}`)}
          />
        )}
      </Exportable>
```

- [ ] **Step 4: シリーズ集計に組み込む**

`src/pages/SeriesPage.tsx` で import を追加:
```tsx
import { Exportable } from '../components/Exportable';
```
`<div className="ranking-grid">…</div>` 全体を次で置き換え:
```tsx
      <div className="ranking-grid">
        <Exportable title={`${stat.series.name} 参加回数ランキング`} defaultLimit={20}>
          {(limit) => (
            <DataTable columns={rankingColumns('参加', (p) => `${p.attended}回`)} rows={byAttended} rowKey={(p) => p.playerId} onRowClick={toPlayer} limit={limit} />
          )}
        </Exportable>
        <Exportable title={`${stat.series.name} 通算対局数ランキング`} defaultLimit={20}>
          {(limit) => (
            <DataTable columns={rankingColumns('対局数', (p) => p.totalGames)} rows={byGames} rowKey={(p) => p.playerId} onRowClick={toPlayer} limit={limit} />
          )}
        </Exportable>
        <Exportable title={`${stat.series.name} 通算打点ランキング`} defaultLimit={20}>
          {(limit) => (
            <DataTable columns={rankingColumns('打点', (p) => formatPoints(p.totalPoints))} rows={byPoints} rowKey={(p) => p.playerId} onRowClick={toPlayer} limit={limit} />
          )}
        </Exportable>
      </div>
```

- [ ] **Step 5: ビルドとブラウザ確認**

Run: `npm run build` → 成功

ブラウザで確認:
- プレイヤー一覧を「通算打点」で並べて「上位10件」→ 打点上位10人が表示される
- 「画像で保存」→ 「全シリーズ 参加者一覧.png」がダウンロードされ、見出しと10行が写っている
- シリーズ集計の各ランキングでも保存できる
- ダークモードでも画像の背景が文字と見分けられる色になっている

- [ ] **Step 6: コミット**

```bash
git add -A && git commit -m "feat: 表のPNG画像出力を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: GitHub Pages デプロイ設定とREADME

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`

**Interfaces:**
- Consumes: `npm test`, `npm run build`（`dist/` を出力）

- [ ] **Step 1: ワークフローを作成**

`.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: README を作成**

`README.md`:
```markdown
# 大会参加者統計

雀魂の大会管理からエクスポートした「シーズン順位統計」CSVを取り込んで、参加者の参加回数・対局数・打点、大会ごとの新規/リピーター、シリーズの皆勤者などを集計するツールです。

データはすべてお使いのブラウザ内に保存され、どこにも送信されません。

## 使い方

1. 雀魂の大会管理画面で「シーズン順位統計」をCSVでエクスポート
2. 「データ管理」タブでCSVをドロップし、シリーズ名・回・開催期間を入力して保存
3. 「プレイヤー」「大会」「シリーズ」タブで集計を確認。表は「画像で保存」でPNGにできます
4. ときどき「バックアップを書き出す」で保存しておいてください（ブラウザのデータを消すと失われます）

## 開発

npm install
npm run dev      # 開発サーバー
npm test         # テスト
npm run build    # dist/ に出力

main ブランチに push すると GitHub Actions で GitHub Pages にデプロイされます（リポジトリの Settings → Pages → Source を「GitHub Actions」にしてください）。
```

- [ ] **Step 3: 全テストとビルドを確認**

Run: `npm test && npm run build`
Expected: 全テスト PASS、ビルド成功

- [ ] **Step 4: コミット**

```bash
git add -A && git commit -m "chore: GitHub Pagesデプロイ設定とREADMEを追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: GitHub への公開はユーザーに確認してから**

リポジトリ作成・push は外部公開になるため、実行前にユーザーに確認する。確認が取れたら:
```bash
gh repo create taikai-stats --public --source . --push
```
その後、Settings → Pages → Source を「GitHub Actions」に設定するようユーザーに案内する。
