import type { BlockbenchHost } from "../blockbench/host.ts";
import { exportLua, importLua, type ExportManifest, type PendingBody } from "../lua/roundtrip.ts";
import {
  planExport,
  publishFiles,
  type ExportBaseline,
  type FilePlan,
  type PlannedFile,
} from "../persistence/export-plan.ts";
import type { Graph } from "../workflow/schema.ts";
import type { Diagnostic } from "../workflow/validate.ts";
import { createId, type WorkspaceController } from "./workspace-controller.ts";

/** Persisted in the workflow document under `luaExport`. */
export interface LuaExportSettings {
  readonly directory: string;
  readonly file: string;
  readonly baselines: readonly ExportBaseline[];
  readonly manifest: ExportManifest | null;
}

export type LuaDialog =
  | { kind: "none" }
  | { kind: "diagnostics"; title: string; diagnostics: readonly Diagnostic[] }
  | { kind: "conflict"; plans: FilePlan[]; conflict: Extract<FilePlan, { kind: "conflict" }> }
  | {
      kind: "import";
      path: string;
      method: "manifest" | "structural";
      graph: Graph;
      pendingBodies: PendingBody[];
      accepted: Record<string, boolean>;
      diagnostics: readonly Diagnostic[];
    };

export const DEFAULT_LUA_FILE = "script.lua";

function joinPath(directory: string, file: string): string {
  return `${directory.replace(/[\\/]+$/, "")}/${file}`;
}

export class LuaIoController {
  /** Plain object so Vue 2 observes it. */
  readonly state: { dialog: LuaDialog; preview: string | null } = { dialog: { kind: "none" }, preview: null };
  private readonly host: BlockbenchHost;
  private readonly workspace: WorkspaceController;

  constructor(host: BlockbenchHost, workspace: WorkspaceController) {
    this.host = host;
    this.workspace = workspace;
  }

  settings(): LuaExportSettings | null {
    const value = this.workspace.store.document.luaExport as LuaExportSettings | undefined;
    return value ?? null;
  }

  close(): void {
    this.state.dialog = { kind: "none" };
  }

  /** Generated Lua for the preview panel, or diagnostics when blocked. */
  refreshPreview(): void {
    const result = exportLua(this.workspace.registry, this.workspace.view.graph, this.settings()?.file ?? DEFAULT_LUA_FILE);
    this.state.preview = result.source;
    if (result.source === null) {
      this.state.dialog = { kind: "diagnostics", title: "无法生成 Lua", diagnostics: result.diagnostics };
    }
  }

  exportToDisk(): void {
    const fs = this.host.fileSystem();
    if (fs === null) {
      this.host.notify("当前环境不支持写入本地文件，请使用 Blockbench 桌面版。", "error");
      return;
    }

    const settings = this.settings();
    const directory = settings?.directory ?? this.host.pickDirectory("选择 Lua 导出目录");
    if (directory === null) {
      return;
    }
    const file = settings?.file ?? DEFAULT_LUA_FILE;

    const result = exportLua(this.workspace.registry, this.workspace.view.graph, file);
    if (result.source === null) {
      this.state.dialog = { kind: "diagnostics", title: "导出被阻止", diagnostics: result.diagnostics };
      return;
    }

    const files: PlannedFile[] = [{ path: joinPath(directory, file), content: result.source }];
    const plans = planExport(fs, files, settings?.baselines ?? []);
    const conflict = plans.find((plan): plan is Extract<FilePlan, { kind: "conflict" }> => plan.kind === "conflict");
    if (conflict !== undefined) {
      this.state.dialog = { kind: "conflict", plans, conflict };
      return;
    }
    this.publish(directory, file, plans, result.manifest!);
  }

  /** Explicitly confirmed overwrite of externally modified files. */
  overwriteConflicts(): void {
    const dialog = this.state.dialog;
    if (dialog.kind !== "conflict") {
      return;
    }
    if (!this.host.confirm("外部修改将被覆盖且无法恢复，确定继续？")) {
      return;
    }
    const settings = this.settings();
    const directory = settings?.directory ?? dialog.conflict.file.path.replace(/[\\/][^\\/]*$/, "");
    const file = settings?.file ?? DEFAULT_LUA_FILE;
    const result = exportLua(this.workspace.registry, this.workspace.view.graph, file);
    this.publish(directory, file, dialog.plans, result.manifest!);
  }

  /** Saves the generated text next to the original instead of overwriting it. */
  saveAsCopy(): void {
    const dialog = this.state.dialog;
    const fs = this.host.fileSystem();
    if (dialog.kind !== "conflict" || fs === null) {
      return;
    }
    const copyPath = dialog.conflict.file.path.replace(/\.lua$/, ".generated.lua");
    publishFiles(fs, [{ path: copyPath, content: dialog.conflict.file.content }]);
    this.host.notify(`已另存为 ${copyPath}，原文件未改动。`, "info");
    this.close();
  }

  /** Re-imports the externally modified file instead of overwriting it. */
  reimportConflict(): void {
    const dialog = this.state.dialog;
    if (dialog.kind === "conflict") {
      this.openImport(dialog.conflict.file.path, dialog.conflict.external);
    }
  }

  private publish(directory: string, file: string, plans: FilePlan[], manifest: ExportManifest): void {
    const fs = this.host.fileSystem()!;
    const toWrite = plans.filter((plan) => plan.kind !== "unchanged").map((plan) => plan.file);
    try {
      const written = publishFiles(fs, toWrite);
      const unchanged = plans
        .filter((plan) => plan.kind === "unchanged")
        .map((plan) => ({ path: plan.file.path, fileDigest: manifest.fileDigest }));
      const settings: LuaExportSettings = { directory, file, baselines: [...written, ...unchanged], manifest };
      this.workspace.apply({ kind: "setDocumentField", field: "luaExport", value: settings });
      this.host.notify(`Lua 已导出：${joinPath(directory, file)}`, "info");
      this.close();
    } catch (error) {
      this.host.notify(`导出失败，原文件保持不变：${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  async importFromDisk(): Promise<void> {
    const picked = await this.host.pickLuaFile();
    if (picked !== null) {
      this.openImport(picked.path, picked.content);
    }
  }

  openImport(path: string, content: string): void {
    const settings = this.settings();
    const manifestPath = settings === null ? null : joinPath(settings.directory, settings.file);
    const sameFile = manifestPath !== null && manifestPath.replace(/\\/g, "/") === path.replace(/\\/g, "/");
    const outcome = importLua(this.workspace.registry, content, sameFile ? settings?.manifest : null, () => createId("n"));

    this.state.dialog = {
      kind: "import",
      path,
      method: outcome.method,
      graph: outcome.graph,
      pendingBodies: [...outcome.pendingBodies],
      accepted: Object.fromEntries(outcome.pendingBodies.map((pending) => [pending.nodeId, false])),
      diagnostics: outcome.diagnostics,
    };
  }

  /** Replaces the main graph with the import (one undo step), applying accepted body edits. */
  confirmImport(): void {
    const dialog = this.state.dialog;
    if (dialog.kind !== "import") {
      return;
    }
    const graph: Graph = {
      ...dialog.graph,
      id: this.workspace.view.graph.id,
      nodes: dialog.graph.nodes.map((node) => {
        const pending = dialog.pendingBodies.find((candidate) => candidate.nodeId === node.id);
        if (pending === undefined || !dialog.accepted[node.id]) {
          return node;
        }
        return { ...node, source: pending.next, revision: (node.revision as number) + 1 };
      }),
    };
    if (this.workspace.apply({ kind: "replaceGraph", graph })) {
      this.close();
    }
  }
}
