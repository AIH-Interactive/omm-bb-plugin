import type { SidecarFileSystem } from "../persistence/sidecar.ts";
import type { Vector3 } from "../workflow/trail-preview.ts";
import { buildBoneTree, type OutlinerNodeLike } from "./bone-tree.ts";
import type { AnimationPlayback, BlockbenchHost } from "./host.ts";

/* Blockbench globals provided by the host at runtime (see refs/blockbench). */

interface Deletable {
  delete(): void;
}

interface Object3DLike {
  getWorldPosition(target: unknown): { x: number; y: number; z: number };
}

interface AnimationLike {
  uuid: string;
  name: string;
  select(): void;
}

declare const Blockbench: {
  showQuickMessage(message: string, time?: number): void;
  showMessageBox(options: { title: string; message: string; icon?: string }): void;
  on(event: string, callback: (data: unknown) => void): void;
  pickDirectory(options: { title?: string; resource_id?: string }): string | null | undefined;
  import(
    options: { extensions: string[]; type: string; readtype: string; resource_id?: string },
    callback: (files: { path: string; content: string | ArrayBuffer }[]) => void,
  ): void;
  removeListener(event: string, callback: (data: unknown) => void): void;
};
declare const Mode: new (id: string, options: object) => { select(): void; delete(): void };
declare const Modes: { options: Record<string, { select(): void } | undefined> };
declare const Action: new (id: string, options: object) => Deletable;
declare const BarMenu: new (id: string, structure: string[], options: { name: string }) => Deletable;
declare const MenuBar: { update(): void };
declare const Project:
  | { uuid: string; save_path: string; export_path: string; nodes_3d: Record<string, Object3DLike | undefined> }
  | 0
  | null
  | undefined;
declare const Outliner: { root: OutlinerNodeLike[] };
declare const Animation: { all: AnimationLike[]; selected: AnimationLike | null };
declare const Timeline: { time: number; playing: boolean; start(): void; pause(): void; setTime(seconds: number): void };
declare const Canvas: { scene: { add(object: unknown): void; remove(object: unknown): void } };
declare const THREE: {
  Vector3: new (x?: number, y?: number, z?: number) => unknown;
  BufferGeometry: new () => { setFromPoints(points: unknown[]): unknown; dispose(): void };
  LineBasicMaterial: new (options: object) => { dispose(): void };
  Line: new (geometry: unknown, material: unknown) => { renderOrder: number };
};
declare const requireNativeModule: ((id: string) => unknown) | undefined;
declare const isApp: boolean;

function subscribe(events: readonly string[], callback: () => void): () => void {
  const handler = () => callback();
  for (const event of events) {
    Blockbench.on(event, handler);
  }
  return () => {
    for (const event of events) {
      Blockbench.removeListener(event, handler);
    }
  };
}

function createTrailOverlay(): (points: readonly Vector3[] | null) => void {
  let line: { geometry: { dispose(): void }; material: { dispose(): void }; object: unknown } | null = null;

  return (points) => {
    if (line !== null) {
      Canvas.scene.remove(line.object);
      line.geometry.dispose();
      line.material.dispose();
      line = null;
    }
    if (points === null || points.length < 2) {
      return;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setFromPoints(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    const material = new THREE.LineBasicMaterial({ color: 0x3e90ff, depthTest: false, transparent: true });
    const object = new THREE.Line(geometry, material);
    object.renderOrder = 999;
    Canvas.scene.add(object);
    line = { geometry, material, object };
  };
}

function createPlayback(): AnimationPlayback {
  return {
    onAnimationFrame: (callback) => subscribe(["display_animation_frame"], callback),
    boneTree: () => (Project ? buildBoneTree(Project.uuid, Outliner.root) : null),
    timelineTime: () => Timeline.time,
    selectedAnimationId: () => Animation.selected?.uuid ?? null,
    boneWorldPosition: (uuid) => {
      const node = Project ? Project.nodes_3d[uuid] : undefined;
      if (node === undefined) {
        return null;
      }
      const { x, y, z } = node.getWorldPosition(new THREE.Vector3());
      return [x, y, z];
    },
    setTrailOverlay: createTrailOverlay(),
    listAnimations: () => (Project ? Animation.all.map(({ uuid, name }) => ({ uuid, name })) : []),
    selectAnimation: (uuid) => Animation.all.find((animation) => animation.uuid === uuid)?.select(),
    isPlaying: () => Timeline.playing,
    play: () => Timeline.start(),
    pause: () => Timeline.pause(),
    seek: (seconds) => Timeline.setTime(seconds),
    showNativeAnimationViewport: () => Modes.options.animate?.select(),
  };
}

export function createGlobalHost(): BlockbenchHost {
  let fileSystem: SidecarFileSystem | null | undefined;

  return {
    createMode: (id, options) => new Mode(id, options),
    createAction: (id, options) => {
      const action = new Action(id, options);
      return { dispose: () => action.delete() };
    },
    createBarMenu: (id, name, actionIds) => new BarMenu(id, actionIds, { name }),
    updateMenuBar: () => MenuBar.update(),
    removeModeScreen: (id) => document.getElementById(`mode_screen_${id}`)?.remove(),
    hasProject: () => Boolean(Project),
    currentModelPath: () => {
      if (!Project) {
        return null;
      }
      return Project.save_path || Project.export_path || null;
    },
    fileSystem: () => {
      if (fileSystem === undefined) {
        const canRequire = isApp && typeof requireNativeModule === "function";
        fileSystem = canRequire
          ? ((requireNativeModule("fs") as SidecarFileSystem | undefined) ?? null)
          : null;
      }
      return fileSystem;
    },
    notify: (message, kind) => {
      if (kind === "error") {
        Blockbench.showMessageBox({ title: "OMM Lua 工作流", message, icon: "error" });
      } else {
        Blockbench.showQuickMessage(message, 2000);
      }
    },
    pickDirectory: (title) => Blockbench.pickDirectory({ title, resource_id: "omm_lua_export" }) ?? null,
    pickLuaFile: () =>
      new Promise((resolve) => {
        Blockbench.import(
          { extensions: ["lua"], type: "Lua", readtype: "text", resource_id: "omm_lua_import" },
          (files) => {
            const file = files[0];
            resolve(file !== undefined && typeof file.content === "string" ? { path: file.path, content: file.content } : null);
          },
        );
      }),
    confirm: (message) => window.confirm(message),
    onProjectChanged: (callback) =>
      subscribe(["select_project", "finished_edit", "undo", "redo"], callback),
    playback: createPlayback(),
  };
}
