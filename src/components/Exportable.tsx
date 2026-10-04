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
    const node = ref.current;
    // 横スクロール領域(.table-wrap)に隠れた部分も含めた全幅で描画する
    node.classList.add('capturing');
    try {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#ffffff';
      const cs = getComputedStyle(node);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      let width = node.scrollWidth;
      node.querySelectorAll<HTMLElement>('table').forEach((t) => {
        width = Math.max(width, t.scrollWidth + padX);
      });
      width = Math.ceil(width);
      const url = await toPng(node, { backgroundColor: bg, pixelRatio: 2, width, style: { width: `${width}px` } });
      downloadUrl(url, `${title.replace(/[\/:*?"<>|]/g, '_')}.png`);
    } catch (e) {
      alert(`画像の作成に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      node.classList.remove('capturing');
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
