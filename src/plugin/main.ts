import { createGlobalHost } from "../blockbench/globals.ts";
import type { BlockbenchHost, Disposable } from "../blockbench/host.ts";
import { registerOmmMenu } from "../blockbench/menu.ts";
import { registerWorkflowMode } from "../blockbench/workspace.ts";
import { WORKFLOW_WORKSPACE_STYLE } from "../ui/styles.ts";
import { WorkflowSession } from "../workflow/session.ts";

export const PLUGIN_ID = "omm_bb_plugin";

/** Installs every host registration and returns one handle releasing them in reverse order. */
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

interface Deletable {
  delete(): void;
}

declare const Blockbench: { addCSS(css: string): Deletable };
declare const Plugin: { register(id: string, options: Record<string, unknown>): void };

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
