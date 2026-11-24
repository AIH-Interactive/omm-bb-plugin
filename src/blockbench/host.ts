import type { SidecarFileSystem } from "../persistence/sidecar.ts";
import type { AnimationFrameSource } from "./animation-preview.ts";

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
export interface AnimationInfo {
  readonly uuid: string;
  readonly name: string;
}

/** Native timeline/animation controls used by the preview panel. */
export interface AnimationPlayback extends AnimationFrameSource {
  listAnimations(): readonly AnimationInfo[];
  selectAnimation(uuid: string): void;
  isPlaying(): boolean;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  /** Switches to the native animate mode whose viewport shows the overlay. */
  showNativeAnimationViewport(): void;
}

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
  /** Fires on project switch, undo/redo and finished edits (bone tree may change). */
  onProjectChanged(callback: () => void): () => void;
  /** Native directory picker; `null` when cancelled or unavailable. */
  pickDirectory(title: string): string | null;
  /** Native Lua file picker returning UTF-8 text; `null` when cancelled. */
  pickLuaFile(): Promise<{ path: string; content: string } | null>;
  confirm(message: string): boolean;
  playback: AnimationPlayback;
}
