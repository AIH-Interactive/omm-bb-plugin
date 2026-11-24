import { createDefaultRegistry } from "../nodes/default-registry.ts";
import { createWorkflowWorkspace } from "../ui/WorkflowWorkspace.ts";
import { WorkspaceController } from "../ui/workspace-controller.ts";
import type { WorkflowSession } from "../workflow/session.ts";
import type { BlockbenchHost, HostMode } from "./host.ts";

export const WORKFLOW_MODE_ID = "omm_lua_workflow";

export interface WorkflowModeHandle {
  readonly mode: HostMode;
  readonly controller: WorkspaceController;
  dispose(): void;
}

/** Registers the “Lua 工作流” mode; selecting it reloads the current project's sidecar. */
export function registerWorkflowMode(host: BlockbenchHost, session: WorkflowSession): WorkflowModeHandle {
  const controller = new WorkspaceController({
    registry: createDefaultRegistry(),
    session,
    playback: host.playback,
    save: () => {
      const result = session.save();
      if (result.ok) {
        host.notify(`工作流已保存：${result.path}`, "info");
      } else {
        host.notify(result.message, "error");
      }
      return result;
    },
  });

  let selected = false;
  const unsubscribeProject = host.onProjectChanged(() => {
    if (selected) {
      controller.refreshHost();
    }
  });

  const mode = host.createMode(WORKFLOW_MODE_ID, {
    name: "Lua 工作流",
    icon: "account_tree",
    component: createWorkflowWorkspace(controller, host.playback),
    condition: () => host.hasProject(),
    onSelect: () => {
      selected = true;
      session.open(host.currentModelPath());
      controller.reload();
      if (session.loadError !== null) {
        host.notify(session.loadError, "error");
      }
    },
    onUnselect: () => {
      selected = false;
    },
  });

  return {
    mode,
    controller,
    dispose() {
      unsubscribeProject();
      controller.trail.dispose();
      mode.delete();
      // Mode.delete() leaves the mounted screen in #center.
      host.removeModeScreen(WORKFLOW_MODE_ID);
    },
  };
}
