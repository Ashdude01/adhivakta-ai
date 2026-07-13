export type DiffType = 'same' | 'add' | 'del';
export interface DiffRow { type: DiffType; text: string }

const MAX_LINES = 1200;

/**
 * Line-level diff between two draft versions, so "what did the AI change?" is
 * answerable without reading both documents.
 *
 * Classic LCS. Quadratic, which is fine for a pleading and not fine for a
 * 10,000-line contract — past `MAX_LINES` we stop pretending and report the
 * whole thing as replaced rather than hang the browser.
 */
export function lineDiff(before: string, after: string): DiffRow[] {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);

  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return [
      ...a.map((text): DiffRow => ({ type: 'del', text })),
      ...b.map((text): DiffRow => ({ type: 'add', text })),
    ];
  }

  // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ type: 'same', text: a[i] });
      i++; j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      rows.push({ type: 'del', text: a[i] });
      i++;
    } else {
      rows.push({ type: 'add', text: b[j] });
      j++;
    }
  }
  while (i < a.length) rows.push({ type: 'del', text: a[i++] });
  while (j < b.length) rows.push({ type: 'add', text: b[j++] });

  return rows;
}

/** Counts for a one-line summary: "+12 −3". */
export function diffStat(rows: DiffRow[]): { added: number; removed: number } {
  return {
    added: rows.filter((r) => r.type === 'add').length,
    removed: rows.filter((r) => r.type === 'del').length,
  };
}
