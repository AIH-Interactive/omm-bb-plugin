/*
 * Read-only snapshot of the current project's bone hierarchy. Nodes never
 * expose host objects, only copied identity data.
 */

/** Minimal shape of a Blockbench outliner node (Group or element). */
export interface OutlinerNodeLike {
  readonly uuid: string;
  readonly name: string;
  readonly type?: string;
  readonly children?: readonly OutlinerNodeLike[];
}

export interface BoneInfo {
  readonly uuid: string;
  readonly name: string;
  readonly parentUuid: string | null;
  /** Names from the root, joined with '/'. */
  readonly path: string;
}

export interface BoneTree {
  readonly projectId: string;
  readonly bones: readonly BoneInfo[];
}

/** Persisted reference stored on nodes. */
export interface BoneRef {
  readonly projectId: string;
  readonly uuid: string;
  /** Last known name/path, used for display and re-binding. */
  readonly name: string;
  readonly path: string;
}

export type BoneResolution =
  | { readonly ok: true; readonly bone: BoneInfo; readonly renamed: boolean }
  | { readonly ok: false; readonly code: "bone.otherProject" | "bone.missing"; readonly message: string };

export function buildBoneTree(projectId: string, roots: readonly OutlinerNodeLike[]): BoneTree {
  const bones: BoneInfo[] = [];

  const visit = (node: OutlinerNodeLike, parent: BoneInfo | null) => {
    if (node.type !== "group") {
      return; // cubes/meshes are not bones
    }
    const path = parent === null ? node.name : `${parent.path}/${node.name}`;
    const bone: BoneInfo = { uuid: node.uuid, name: node.name, parentUuid: parent?.uuid ?? null, path };
    bones.push(bone);
    for (const child of node.children ?? []) {
      visit(child, bone);
    }
  };

  for (const root of roots) {
    visit(root, null);
  }
  return { projectId, bones };
}

export function createBoneRef(tree: BoneTree, bone: BoneInfo): BoneRef {
  return { projectId: tree.projectId, uuid: bone.uuid, name: bone.name, path: bone.path };
}

/** Resolves by UUID only; a deleted bone is never matched by a same-named one. */
export function resolveBoneRef(tree: BoneTree, ref: BoneRef): BoneResolution {
  if (ref.projectId !== tree.projectId) {
    return { ok: false, code: "bone.otherProject", message: `骨骼 ${ref.name} 属于其他工程，请重新绑定。` };
  }

  const bone = tree.bones.find((candidate) => candidate.uuid === ref.uuid);
  if (bone === undefined) {
    return { ok: false, code: "bone.missing", message: `骨骼 ${ref.path} 已不存在，请重新绑定。` };
  }
  return { ok: true, bone, renamed: bone.path !== ref.path };
}

/** Paths shared by several bones; such paths cannot identify a bone at export. */
export function ambiguousPaths(tree: BoneTree): readonly string[] {
  const counts = new Map<string, number>();
  for (const bone of tree.bones) {
    counts.set(bone.path, (counts.get(bone.path) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).map(([path]) => path);
}
