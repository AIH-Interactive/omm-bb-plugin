import { digest } from "../lua/generator/emit.ts";
import type { SidecarFileSystem } from "./sidecar.ts";

/** Hash of the file as last written by the editor, stored in the workflow. */
export interface ExportBaseline {
  readonly path: string;
  readonly fileDigest: string;
}

export interface PlannedFile {
  readonly path: string;
  readonly content: string;
}

export type FilePlan =
  | { readonly kind: "write"; readonly file: PlannedFile }
  | { readonly kind: "unchanged"; readonly file: PlannedFile }
  /**
   * The file on disk differs from both the last export and the new output:
   * it was edited outside the editor. Overwriting needs explicit confirmation.
   */
  | {
      readonly kind: "conflict";
      readonly file: PlannedFile;
      readonly external: string;
      readonly baselineDigest: string | null;
    };

export function planFile(
  file: PlannedFile,
  onDisk: string | null,
  baselines: readonly ExportBaseline[],
): FilePlan {
  if (onDisk === null) {
    return { kind: "write", file };
  }
  if (onDisk === file.content) {
    return { kind: "unchanged", file };
  }

  const baseline = baselines.find((candidate) => candidate.path === file.path) ?? null;
  if (baseline !== null && digest(onDisk) === baseline.fileDigest) {
    return { kind: "write", file };
  }
  return { kind: "conflict", file, external: onDisk, baselineDigest: baseline?.fileDigest ?? null };
}

export function planExport(
  fs: Pick<SidecarFileSystem, "existsSync" | "readFileSync">,
  files: readonly PlannedFile[],
  baselines: readonly ExportBaseline[],
): FilePlan[] {
  return files.map((file) => {
    const onDisk = fs.existsSync(file.path) ? fs.readFileSync(file.path, "utf8") : null;
    return planFile(file, onDisk, baselines);
  });
}

/**
 * Writes every file to a temporary sibling first; only when all temporary
 * files exist are they renamed into place. On failure the temporaries are
 * removed and the previous outputs stay untouched.
 */
export function publishFiles(
  fs: SidecarFileSystem & { mkdirSync?(path: string, options: { recursive: boolean }): void },
  files: readonly PlannedFile[],
): ExportBaseline[] {
  const temporaries: string[] = [];

  try {
    for (const file of files) {
      const directory = file.path.replace(/[\\/][^\\/]*$/, "");
      if (directory !== file.path) {
        fs.mkdirSync?.(directory, { recursive: true });
      }
      const temporary = `${file.path}.omm-tmp`;
      fs.writeFileSync(temporary, file.content, "utf8");
      temporaries.push(temporary);
    }
  } catch (error) {
    for (const temporary of temporaries) {
      fs.rmSync(temporary, { force: true });
    }
    throw error;
  }

  files.forEach((file, index) => fs.renameSync(temporaries[index]!, file.path));
  return files.map((file) => ({ path: file.path, fileDigest: digest(file.content) }));
}
