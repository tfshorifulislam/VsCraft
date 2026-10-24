import type { ProjectFile } from "../../types/editor";

export interface NewTreeItem {
  parentId: string | null;
  isFolder: boolean;
}

export type VisibleTreeRow =
  | { kind: "file"; key: string; file: ProjectFile; level: number }
  | { kind: "new"; key: string; parentId: string | null; level: number };

export function buildVisibleTreeRows(
  files: ProjectFile[],
  collapsedFolders: Record<string, boolean>,
  creating: NewTreeItem | null
): VisibleTreeRow[] {
  const childrenByParent = new Map<string | null, ProjectFile[]>();
  for (const file of files) {
    const parentId = file.parentId ?? null;
    const children = childrenByParent.get(parentId);
    if (children) {
      children.push(file);
    } else {
      childrenByParent.set(parentId, [file]);
    }
  }

  const rows: VisibleTreeRow[] = [];

  if (creating && creating.parentId === null) {
    rows.push({ kind: "new", key: "new:root", parentId: null, level: 0 });
  }

  const walk = (parentId: string | null, level: number) => {
    const children = childrenByParent.get(parentId);
    if (!children) return;

    for (const child of children) {
      rows.push({ kind: "file", key: `file:${child.id}`, file: child, level });
      if (!child.isFolder || collapsedFolders[child.id]) continue;

      if (creating && creating.parentId === child.id) {
        rows.push({
          kind: "new",
          key: `new:${child.id}`,
          parentId: child.id,
          level: level + 1,
        });
      }
      walk(child.id, level + 1);
    }
  };

  walk(null, 0);
  return rows;
}

export interface VirtualWindow {
  start: number;
  end: number;
  offsetY: number;
}

export function getVirtualWindow(
  scrollTop: number,
  viewportHeight: number,
  rowCount: number,
  rowHeight: number,
  overscan = 6
): VirtualWindow {
  const visibleCount = Math.max(1, Math.ceil(viewportHeight / rowHeight));
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(rowCount, start + visibleCount + overscan * 2);
  return { start, end, offsetY: start * rowHeight };
}

export function findRowIndex(rows: VisibleTreeRow[], fileId: string | null): number {
  if (!fileId) return -1;
  return rows.findIndex((row) => row.kind === "file" && row.file.id === fileId);
}
