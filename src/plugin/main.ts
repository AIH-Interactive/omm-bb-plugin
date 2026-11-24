import type { BlockbenchHost, Disposable } from "../blockbench/host.ts";
import { registerOmmMenu } from "../blockbench/menu.ts";
import { registerWorkflowMode } from "../blockbench/workspace.ts";
import type { SidecarFileSystem } from "../persistence/sidecar.ts";
import { WORKFLOW_WORKSPACE_STYLE } from "../ui/WorkflowWorkspace.ts";
import { WorkflowSession } from "../workflow/session.ts";

export const PLUGIN_ID = "omm_bb_plugin";

/** Installs every P1 host registration and returns one handle releasing them in reverse order. */
export function installPlugin(host: BlockbenchHost): Disposable {
  const session = new WorkflowSession(() => host.fileSystem());
  const workflowMode = registerWorkflowMode(host, session);
  const menu = registerOmmMenu(host, {
    openWorkflow: () => workflowMode.mode.select(),
  });

  return {
    dispose() {
      menu.dispose();
      workflowMode.dispose();
    },
  };
}

/* ---- Blockbench globals (provided by the host at runtime) ---- */

interface Deletable {
  delete(): void;
}

declare const Blockbench: {
  addCSS(css: string): Deletable;
  showQuickMessage(message: string, time?: number): void;
  showMessageBox(options: { title: string; message: string; icon?: string }): void;
};
declare const Plugin: {
  register(id: string, options: Record<string, unknown>): void;
};
declare const Mode: new (id: string, options: object) => { select(): void; delete(): void };
declare const Action: new (id: string, options: object) => Deletable;
declare const BarMenu: new (id: string, structure: string[], options: { name: string }) => Deletable;
declare const MenuBar: { update(): void };
declare const Project: { save_path: string; export_path: string } | 0 | null | undefined;
declare const requireNativeModule: ((id: string) => unknown) | undefined;
declare const isApp: boolean;

function createGlobalHost(): BlockbenchHost {
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
        fileSystem = canRequire ? ((requireNativeModule("fs") as SidecarFileSystem | undefined) ?? null) : null;
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
  };
}

let installed: Disposable | null = null;
let style: Deletable | null = null;

if (typeof Plugin !== "undefined") {
  Plugin.register(PLUGIN_ID, {
    title: "OMM Lua Workflow",
    author: "AI Hobbyist Interactive",
    description: "OMM 节点化 Lua 工作流",
    icon: "account_tree",
    version: "0.1.0",
    variant: "desktop",
    min_version: "5.0.0",
    tags: ["Minecraft", "Lua"],
    onload() {
      style = Blockbench.addCSS(WORKFLOW_WORKSPACE_STYLE);
      installed = installPlugin(createGlobalHost());
    },
    onunload() {
      installed?.dispose();
      style?.delete();
      installed = null;
      style = null;
    },
  });
}
