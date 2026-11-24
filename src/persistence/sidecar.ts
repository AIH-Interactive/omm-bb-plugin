import { decodeWorkflow, encodeWorkflow } from "./workflow-file.ts";
import { createEmptyWorkflow, type GraphDocument } from "../workflow/schema.ts";

export const WORKFLOW_SIDECAR_SUFFIX = ".omm-workflow.json";

/** Subset of Node's fs module used for sidecar persistence. */
export interface SidecarFileSystem {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: "utf8"): string;
  writeFileSync(path: string, data: string, encoding: "utf8"): void;
  renameSync(from: string, to: string): void;
  rmSync(path: string, options: { force: boolean }): void;
}

/** `D:/a/model.bbmodel` → `D:/a/model.omm-workflow.json`. */
export function sidecarPathFor(modelPath: string): string {
  const extensionStart = modelPath.lastIndexOf(".");
  const separatorEnd = Math.max(modelPath.lastIndexOf("/"), modelPath.lastIndexOf("\\"));
  const hasExtension = extensionStart > separatorEnd + 1;
  const basePath = hasExtension ? modelPath.slice(0, extensionStart) : modelPath;

  return basePath + WORKFLOW_SIDECAR_SUFFIX;
}

export function loadWorkflowSidecar(fs: SidecarFileSystem, path: string): GraphDocument {
  if (!fs.existsSync(path)) {
    return createEmptyWorkflow();
  }

  return decodeWorkflow(fs.readFileSync(path, "utf8"));
}

/**
 * Writes to a temporary file in the same directory and then replaces the
 * target, so a failed write never truncates the previous workflow.
 */
export function saveWorkflowSidecar(
  fs: SidecarFileSystem,
  path: string,
  document: GraphDocument,
): void {
  const temporaryPath = `${path}.tmp`;
  const content = encodeWorkflow(document);

  try {
    fs.writeFileSync(temporaryPath, content, "utf8");
    fs.renameSync(temporaryPath, path);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}
