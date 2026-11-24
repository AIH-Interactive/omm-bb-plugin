import type { BlockbenchHost, Disposable } from "./host.ts";

export const OMM_MENU_ID = "omm";
export const OPEN_WORKFLOW_ACTION_ID = "omm_open_lua_workflow";

export interface OmmMenuActions {
  openWorkflow(): void;
}

/** Adds the top-level “OMM” menu with its P1 entry “Lua 工作流”. */
export function registerOmmMenu(host: BlockbenchHost, actions: OmmMenuActions): Disposable {
  const openAction = host.createAction(OPEN_WORKFLOW_ACTION_ID, {
    name: "Lua 工作流",
    icon: "account_tree",
    condition: () => host.hasProject(),
    click: () => actions.openWorkflow(),
  });
  const menu = host.createBarMenu(OMM_MENU_ID, "OMM", [OPEN_WORKFLOW_ACTION_ID]);

  host.updateMenuBar();

  return {
    dispose() {
      menu.delete();
      openAction.dispose();
      host.updateMenuBar();
    },
  };
}
