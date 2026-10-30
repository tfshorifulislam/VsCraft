export interface ProjectFile {
  id: string;
  path: string;
  content: string;
  updatedAt: string;
}

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  file?: ProjectFile;
  children: TreeNode[];
}

export function buildFileTree(files: ProjectFile[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", type: "folder", children: [] };
  const folders = new Map<string, TreeNode>();
  folders.set("", root);

  const ensureFolder = (folderPath: string): TreeNode => {
    const existing = folders.get(folderPath);
    if (existing) return existing;

    const parts = folderPath.split("/");
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join("/");
    const parent = ensureFolder(parentPath);
    const node: TreeNode = {
      name,
      path: folderPath,
      type: "folder",
      children: [],
    };
    parent.children.push(node);
    folders.set(folderPath, node);
    return node;
  };

  for (const file of files) {
    const parts = file.path.split("/");
    const fileName = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join("/");
    const parent = ensureFolder(parentPath);
    parent.children.push({
      name: fileName,
      path: file.path,
      type: "file",
      file,
      children: [],
    });
  }

  const sortNodes = (nodes: TreeNode[]): void => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) sortNodes(node.children);
  };

  sortNodes(root.children);
  return root.children;
}
