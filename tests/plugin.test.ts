import assert from "node:assert/strict";
import { test } from "node:test";

import type { BlockbenchHost, HostModeOptions } from "../src/blockbench/host.ts";
import { OPEN_WORKFLOW_ACTION_ID } from "../src/blockbench/menu.ts";
import { WORKFLOW_MODE_ID } from "../src/blockbench/workspace.ts";
import type { SidecarFileSystem } from "../src/persistence/sidecar.ts";
import { installPlugin } from "../src/plugin/main.ts";

class MemoryFileSystem implements SidecarFileSystem {
  readonly files = new Map<string, string>();
  failWrites = false;

  existsSync(path: string): boolean {
    return this.files.has(path);
  }
  readFileSync(path: string): string {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT ${path}`);
    }
    return content;
  }
  writeFileSync(path: string, data: string): void {
    if (this.failWrites) {
      throw new Error("EACCES");
    }
    this.files.set(path, data);
  }
  renameSync(from: string, to: string): void {
    this.files.set(to, this.readFileSync(from));
    this.files.delete(from);
  }
  rmSync(path: string): void {
    this.files.delete(path);
  }
}

function createFakeHost(fs: SidecarFileSystem | null, modelPath: string | null) {
  const log: string[] = [];
  const messages: { message: string; kind: string }[] = [];
  const modes = new Map<string, HostModeOptions>();
  const actions = new Map<string, () => void>();

  const host: BlockbenchHost = {
    createMode(id, options) {
      modes.set(id, options);
      return {
        select: () => options.onSelect?.(),
        delete: () => log.push(`delete mode ${id}`),
      };
    },
    createAction(id, options) {
      actions.set(id, options.click);
      return { dispose: () => log.push(`delete action ${id}`) };
    },
    createBarMenu(id, name, actionIds) {
      log.push(`menu ${name}: ${actionIds.join(",")}`);
      return { delete: () => log.push(`delete menu ${id}`) };
    },
    updateMenuBar: () => log.push("update menu bar"),
    removeModeScreen: (id) => log.push(`remove screen ${id}`),
    hasProject: () => true,
    currentModelPath: () => modelPath,
    fileSystem: () => fs,
    notify: (message, kind) => messages.push({ message, kind }),
    onProjectChanged: () => () => {},
    playback: {
      onAnimationFrame: () => () => {},
      boneTree: () => null,
      timelineTime: () => 0,
      selectedAnimationId: () => null,
      boneWorldPosition: () => null,
      setTrailOverlay: () => {},
      listAnimations: () => [],
      selectAnimation: () => {},
      isPlaying: () => false,
      play: () => {},
      pause: () => {},
      seek: () => {},
      showNativeAnimationViewport: () => {},
    },
  };

  return { host, log, messages, modes, actions };
}

type WorkspaceComponent = { data(): { controller: { save(): void } } };

/** Same call path as the toolbar “保存” button. */
function clickSave(modes: Map<string, HostModeOptions>): void {
  (modes.get(WORKFLOW_MODE_ID)!.component as WorkspaceComponent).data().controller.save();
}

test("OMM menu entry opens the workflow mode and saving writes the sidecar", () => {
  const fs = new MemoryFileSystem();
  const fake = createFakeHost(fs, "D:\models\fox.bbmodel");
  installPlugin(fake.host);

  assert.ok(fake.log.includes(`menu OMM: ${OPEN_WORKFLOW_ACTION_ID}`));
  fake.actions.get(OPEN_WORKFLOW_ACTION_ID)!();
  clickSave(fake.modes);

  const saved = JSON.parse(fs.files.get("D:\models\fox.omm-workflow.json")!);
  assert.equal(saved.schemaVersion, 1);
  assert.deepEqual(saved.graphs, [{ id: "main", nodes: [], edges: [] }]);
  assert.equal(fs.files.has("D:\models\fox.omm-workflow.json.tmp"), false);
  assert.equal(fake.messages.at(-1)!.kind, "info");
});

test("existing sidecar is loaded on mode selection", () => {
  const fs = new MemoryFileSystem();
  const node = { id: "n1", type: "core.customScript", source: "return 1" };
  fs.files.set(
    "D:/m/a.omm-workflow.json",
    JSON.stringify({ schemaVersion: 1, targetProfile: "p", graphs: [{ id: "main", nodes: [node], edges: [] }] }),
  );
  const fake = createFakeHost(fs, "D:/m/a.bbmodel");
  installPlugin(fake.host);

  fake.actions.get(OPEN_WORKFLOW_ACTION_ID)!();
  clickSave(fake.modes);

  const saved = JSON.parse(fs.files.get("D:/m/a.omm-workflow.json")!);
  assert.deepEqual(saved.graphs[0].nodes, [node]);
});

test("invalid sidecar is reported and never overwritten", () => {
  const fs = new MemoryFileSystem();
  fs.files.set("D:/m/a.omm-workflow.json", '{"schemaVersion": 7}');
  const fake = createFakeHost(fs, "D:/m/a.bbmodel");
  installPlugin(fake.host);

  fake.actions.get(OPEN_WORKFLOW_ACTION_ID)!();
  clickSave(fake.modes);

  assert.equal(fs.files.get("D:/m/a.omm-workflow.json"), '{"schemaVersion": 7}');
  assert.match(fake.messages[0]!.message, /不支持的工作流格式版本：7/);
  assert.match(fake.messages.at(-1)!.message, /已取消保存/);
});

test("write failure is reported and keeps the previous file", () => {
  const fs = new MemoryFileSystem();
  fs.files.set("D:/m/a.omm-workflow.json", JSON.stringify({ schemaVersion: 1, targetProfile: "p", graphs: [{ id: "main", nodes: [], edges: [] }] }));
  const before = fs.files.get("D:/m/a.omm-workflow.json");
  const fake = createFakeHost(fs, "D:/m/a.bbmodel");
  installPlugin(fake.host);

  fake.actions.get(OPEN_WORKFLOW_ACTION_ID)!();
  fs.failWrites = true;
  clickSave(fake.modes);

  assert.equal(fs.files.get("D:/m/a.omm-workflow.json"), before);
  assert.match(fake.messages.at(-1)!.message, /保存工作流失败：EACCES/);
});

test("unsaved model gets an observable save error", () => {
  const fake = createFakeHost(new MemoryFileSystem(), null);
  installPlugin(fake.host);

  fake.actions.get(OPEN_WORKFLOW_ACTION_ID)!();
  clickSave(fake.modes);

  assert.match(fake.messages.at(-1)!.message, /请先保存模型/);
});

test("dispose releases menu, action, mode and its screen", () => {
  const fake = createFakeHost(null, null);
  installPlugin(fake.host).dispose();

  for (const entry of [
    "delete menu omm",
    `delete action ${OPEN_WORKFLOW_ACTION_ID}`,
    `delete mode ${WORKFLOW_MODE_ID}`,
    `remove screen ${WORKFLOW_MODE_ID}`,
  ]) {
    assert.ok(fake.log.includes(entry), entry);
  }
});
