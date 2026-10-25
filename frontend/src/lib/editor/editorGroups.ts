import type {
  EditorGroup,
  EditorGroupsState,
  EditorLayoutNode,
  EditorSplitDirection,
  EditorSplitOrientation,
} from "@/types/editor";

export const EDITOR_TAB_DRAG_TYPE = "application/x-code-editor-tab";

const MIN_SPLIT_RATIO = 0.15;
const MAX_SPLIT_RATIO = 0.85;

let groupCounter = 0;
let splitCounter = 0;

function createEditorGroupId(): string {
  groupCounter += 1;
  return `editor-group-${Date.now().toString(36)}-${groupCounter}`;
}

function createEditorSplitId(): string {
  splitCounter += 1;
  return `editor-split-${Date.now().toString(36)}-${splitCounter}`;
}

function clampSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.5;
  return Math.min(Math.max(ratio, MIN_SPLIT_RATIO), MAX_SPLIT_RATIO);
}

function replaceLayoutLeaf(
  node: EditorLayoutNode,
  groupId: string,
  replacement: EditorLayoutNode
): EditorLayoutNode {
  if (node.type === "group") {
    return node.groupId === groupId ? replacement : node;
  }
  return {
    ...node,
    first: replaceLayoutLeaf(node.first, groupId, replacement),
    second: replaceLayoutLeaf(node.second, groupId, replacement),
  };
}

function removeLayoutLeaf(node: EditorLayoutNode, groupId: string): EditorLayoutNode | null {
  if (node.type === "group") {
    return node.groupId === groupId ? null : node;
  }

  const first = removeLayoutLeaf(node.first, groupId);
  const second = removeLayoutLeaf(node.second, groupId);
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

function resizeLayoutSplit(
  node: EditorLayoutNode,
  splitId: string,
  ratio: number
): EditorLayoutNode {
  if (node.type === "group") return node;
  if (node.id === splitId) {
    return { ...node, ratio: clampSplitRatio(ratio) };
  }
  return {
    ...node,
    first: resizeLayoutSplit(node.first, splitId, ratio),
    second: resizeLayoutSplit(node.second, splitId, ratio),
  };
}

function closeGroupInternal(state: EditorGroupsState, groupId: string): EditorGroupsState {
  if (state.groups.length <= 1) return state;

  const groupIndex = state.groups.findIndex((group) => group.id === groupId);
  if (groupIndex < 0) return state;

  const remainingGroups = state.groups.filter((group) => group.id !== groupId);
  const fallbackGroup =
    remainingGroups[Math.min(groupIndex, remainingGroups.length - 1)] || remainingGroups[0];
  const layout = removeLayoutLeaf(state.layout, groupId);
  const activeGroupId =
    state.activeGroupId === groupId ||
    !remainingGroups.some((group) => group.id === state.activeGroupId)
      ? fallbackGroup.id
      : state.activeGroupId;

  return {
    groups: remainingGroups,
    activeGroupId,
    layout: layout || { type: "group", groupId: remainingGroups[0].id },
  };
}

export function createEditorGroups(
  openFileIds: readonly string[],
  activeFileId: string | null
): EditorGroupsState {
  const fileIds = [...new Set(openFileIds)];
  if (activeFileId && !fileIds.includes(activeFileId)) {
    fileIds.push(activeFileId);
  }

  const active = activeFileId || fileIds[0] || null;
  const group: EditorGroup = {
    id: createEditorGroupId(),
    fileIds,
    activeFileId: active,
  };

  return {
    groups: [group],
    activeGroupId: group.id,
    layout: { type: "group", groupId: group.id },
  };
}

export function getEditorGroup(
  state: EditorGroupsState,
  groupId: string
): EditorGroup | undefined {
  return state.groups.find((group) => group.id === groupId);
}

export function getEditorGroupIds(layout: EditorLayoutNode): string[] {
  if (layout.type === "group") return [layout.groupId];
  return [...getEditorGroupIds(layout.first), ...getEditorGroupIds(layout.second)];
}

export function isEditorFileOpenInGroup(
  groups: readonly EditorGroup[],
  fileId: string,
  exceptGroupId?: string
): boolean {
  return groups.some(
    (group) => group.id !== exceptGroupId && group.fileIds.includes(fileId)
  );
}

export function focusEditorGroup(
  state: EditorGroupsState,
  groupId: string
): EditorGroupsState {
  if (!state.groups.some((group) => group.id === groupId)) return state;
  if (state.activeGroupId === groupId) return state;
  return { ...state, activeGroupId: groupId };
}

export function openEditorFileInGroup(
  state: EditorGroupsState,
  groupId: string,
  fileId: string
): EditorGroupsState {
  let changed = state.activeGroupId !== groupId;
  const groups = state.groups.map((group) => {
    if (group.id !== groupId) return group;
    const fileIds = group.fileIds.includes(fileId)
      ? group.fileIds
      : [...group.fileIds, fileId];
    if (fileIds !== group.fileIds || group.activeFileId !== fileId) changed = true;
    return { ...group, fileIds, activeFileId: fileId };
  });

  return changed ? { ...state, groups, activeGroupId: groupId } : state;
}

export function closeEditorFileInGroup(
  state: EditorGroupsState,
  groupId: string,
  fileId: string
): EditorGroupsState {
  const group = getEditorGroup(state, groupId);
  if (!group || !group.fileIds.includes(fileId)) return state;

  const closingIndex = group.fileIds.indexOf(fileId);
  const fileIds = group.fileIds.filter((id) => id !== fileId);
  const activeFileId =
    group.activeFileId === fileId
      ? fileIds[Math.min(closingIndex, fileIds.length - 1)] || null
      : group.activeFileId;

  return {
    ...state,
    activeGroupId: groupId,
    groups: state.groups.map((candidate) =>
      candidate.id === groupId ? { ...candidate, fileIds, activeFileId } : candidate
    ),
  };
}

export function splitEditorGroup(
  state: EditorGroupsState,
  groupId: string,
  direction: EditorSplitDirection
): EditorGroupsState {
  const sourceIndex = state.groups.findIndex((group) => group.id === groupId);
  if (sourceIndex < 0) return state;

  const source = state.groups[sourceIndex];
  const newGroup: EditorGroup = {
    id: createEditorGroupId(),
    fileIds: source.activeFileId ? [source.activeFileId] : [],
    activeFileId: source.activeFileId,
  };
  const orientation: EditorSplitOrientation =
    direction === "right" ? "horizontal" : "vertical";
  const splitNode: EditorLayoutNode = {
    type: "split",
    id: createEditorSplitId(),
    orientation,
    ratio: 0.5,
    first: { type: "group", groupId: source.id },
    second: { type: "group", groupId: newGroup.id },
  };

  const groups = [...state.groups];
  groups.splice(sourceIndex + 1, 0, newGroup);

  return {
    groups,
    activeGroupId: newGroup.id,
    layout: replaceLayoutLeaf(state.layout, source.id, splitNode),
  };
}

export function closeEditorGroup(
  state: EditorGroupsState,
  groupId: string
): EditorGroupsState {
  return closeGroupInternal(state, groupId);
}

export function moveEditorFileBetweenGroups(
  state: EditorGroupsState,
  sourceGroupId: string,
  targetGroupId: string,
  fileId: string
): EditorGroupsState {
  if (sourceGroupId === targetGroupId) {
    return openEditorFileInGroup(state, targetGroupId, fileId);
  }

  const source = getEditorGroup(state, sourceGroupId);
  const target = getEditorGroup(state, targetGroupId);
  if (!source || !target || !source.fileIds.includes(fileId)) return state;

  const groups = state.groups.map((group) => {
    if (group.id === sourceGroupId) {
      const fileIds = group.fileIds.filter((id) => id !== fileId);
      return {
        ...group,
        fileIds,
        activeFileId:
          group.activeFileId === fileId
            ? fileIds[fileIds.length - 1] || null
            : group.activeFileId,
      };
    }
    if (group.id === targetGroupId) {
      return {
        ...group,
        fileIds: group.fileIds.includes(fileId)
          ? group.fileIds
          : [...group.fileIds, fileId],
        activeFileId: fileId,
      };
    }
    return group;
  });

  const movedState: EditorGroupsState = {
    ...state,
    groups,
    activeGroupId: targetGroupId,
  };

  const updatedSource = groups.find((group) => group.id === sourceGroupId);
  if (updatedSource && updatedSource.fileIds.length === 0 && groups.length > 1) {
    return closeGroupInternal(movedState, sourceGroupId);
  }

  return movedState;
}

export function resizeEditorSplit(
  state: EditorGroupsState,
  splitId: string,
  ratio: number
): EditorGroupsState {
  const layout = resizeLayoutSplit(state.layout, splitId, ratio);
  return layout === state.layout ? state : { ...state, layout };
}

export function removeEditorFiles(
  state: EditorGroupsState,
  removedFileIds: ReadonlySet<string>
): EditorGroupsState {
  return {
    ...state,
    groups: state.groups.map((group) => {
      const fileIds = group.fileIds.filter((id) => !removedFileIds.has(id));
      const activeFileId =
        group.activeFileId && removedFileIds.has(group.activeFileId)
          ? fileIds[fileIds.length - 1] || null
          : group.activeFileId;
      return { ...group, fileIds, activeFileId };
    }),
  };
}

export { MIN_SPLIT_RATIO, MAX_SPLIT_RATIO };
