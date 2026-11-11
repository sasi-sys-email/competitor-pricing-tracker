import { diffLines } from 'diff';

export type LineDiff = {
  removed: string[];
  added: string[];
};

/** Line diff of two normalized snapshots. Empty on both sides means no change. */
export function diffNormalized(before: string, after: string): LineDiff {
  if (before === after) {
    return { removed: [], added: [] };
  }
  const removed: string[] = [];
  const added: string[] = [];
  for (const part of diffLines(before, after)) {
    const lines = part.value
      .replace(/\n$/, '')
      .split('\n')
      .filter((line) => line.length > 0);
    if (part.added) added.push(...lines);
    else if (part.removed) removed.push(...lines);
  }
  return { removed, added };
}

export function diffIsEmpty(diff: LineDiff): boolean {
  return diff.removed.length === 0 && diff.added.length === 0;
}
