import type { SidecarFileSystem } from "../persistence/sidecar.ts";

/** Disposable registration handle. */
export interface Disposable {
  dispose(): void;
}

export interface HostMode {
  select(): void;
  delete(): void;
}

export interface HostModeOptions {
  name: string;
  icon: string;
  component: object;
  condition?: () => boolean;
  onSelect?(): void;
  onUnselect?(): void;
}

export interface HostActionOptions {
  name: string;
  icon: string;
  condition?: () => boolean;
  click(): void;
}

export interface HostMenu {
  delete(): void;
}

/**
 * Narrow adapter over the Blockbench globals the plugin uses.
 * Keeping it explicit lets business behavior be tested without the host.
 */
export interface BlockbenchHost {
  createMode(id: string, options: HostModeOptions): HostMode;
  createAction(id: string, options: HostActionOptions): Disposable;
  createBarMenu(id: string, name: string, actionIds: string[]): HostMenu;
  updateMenuBar(): void;
  removeModeScreen(id: string): void;
  /** Absolute model path of the open project, or `null` when unsaved/none. */
  currentModelPath(): string | null;
  hasProject(): boolean;
  fileSystem(): SidecarFileSystem | null;
  notify(message: string, kind: "info" | "error"): void;
}
