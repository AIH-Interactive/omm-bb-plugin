import { createWorkflowWorkspace } from "../ui/WorkflowWorkspace.ts";
import type { WorkflowSession } from "../workflow/session.ts";
import type { BlockbenchHost, HostMode } from "./host.ts";

export const WORKFLOW_MODE_ID = "omm_lua_workflow";

export interface WorkflowModeHandle {
  readonly mode: HostMode;
  dispose(): void;
}

/** Registers the “Lua 工作流” mode; selecting it reloads the current project's sidecar. */
export function registerWorkflowMode(
  host: BlockbenchHost,
  session: WorkflowSession,
): WorkflowModeHandle {
  const component = createWorkflowWorkspace({
    session,
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

  const mode = host.createMode(WORKFLOW_MODE_ID, {
    name: "Lua 工作流",
    icon: "account_tree",
    component,
    condition: () => host.hasProject(),
    onSelect: () => {
      session.open(host.currentModelPath());
      if (session.loadError !== null) {
        host.notify(session.loadError, "error");
      }
    },
  });

  return {
    mode,
    dispose() {
      mode.delete();
      // Mode.delete() leaves the mounted screen in #center.
      host.removeModeScreen(WORKFLOW_MODE_ID);
    },
  };
}
