import {
  loadWorkflowSidecar,
  saveWorkflowSidecar,
  sidecarPathFor,
  type SidecarFileSystem,
} from "../persistence/sidecar.ts";
import { createEmptyWorkflow, type GraphDocument } from "./schema.ts";

export type SaveResult =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly message: string };

/**
 * Plain object so the host's Vue 2 can observe it; Vue 2 does not observe
 * class instances.
 */
export interface WorkflowSessionState {
  document: GraphDocument;
  modelPath: string | null;
  loadError: string | null;
}

/** Workflow state bound to one Blockbench project. */
export class WorkflowSession {
  readonly state: WorkflowSessionState = {
    document: createEmptyWorkflow(),
    modelPath: null,
    loadError: null,
  };

  get document(): GraphDocument {
    return this.state.document;
  }

  get loadError(): string | null {
    return this.state.loadError;
  }

  /**
   * `getFileSystem` is resolved lazily because Blockbench asks the user for
   * the fs permission on first access.
   */
  private readonly getFileSystem: () => SidecarFileSystem | null;

  constructor(getFileSystem: () => SidecarFileSystem | null) {
    this.getFileSystem = getFileSystem;
  }

  /** Loads the sidecar of `modelPath`; unreadable files keep an empty graph and report. */
  open(modelPath: string | null): void {
    this.state.modelPath = modelPath;
    this.state.document = createEmptyWorkflow();
    this.state.loadError = null;

    if (modelPath === null) {
      return;
    }

    const fs = this.getFileSystem();
    if (fs === null) {
      return;
    }

    try {
      this.state.document = loadWorkflowSidecar(fs, sidecarPathFor(modelPath));
    } catch (error) {
      this.state.loadError = `无法读取工作流文件：${describeError(error)}`;
    }
  }

  save(): SaveResult {
    const fs = this.getFileSystem();

    if (fs === null) {
      return { ok: false, message: "当前环境不支持写入本地文件，请使用 Blockbench 桌面版。" };
    }
    if (this.state.modelPath === null) {
      return { ok: false, message: "请先保存模型，工作流文件会保存在模型旁边。" };
    }
    if (this.loadError !== null) {
      // Overwriting would silently destroy the unreadable original file.
      return { ok: false, message: `${this.loadError}；为避免覆盖原文件，已取消保存。` };
    }

    const path = sidecarPathFor(this.state.modelPath);

    try {
      saveWorkflowSidecar(fs, path, this.document);
      return { ok: true, path };
    } catch (error) {
      return { ok: false, message: `保存工作流失败：${describeError(error)}` };
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
