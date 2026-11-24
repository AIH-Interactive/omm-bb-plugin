import type { NodeRegistry } from "../nodes/registry.ts";
import { isScriptNode, type Graph } from "../workflow/schema.ts";
import type { Diagnostic } from "../workflow/validate.ts";
import { importLuaStructural } from "./ast/lower.ts";
import { beginMarker, digest, emitLua, endMarker } from "./generator/emit.ts";
import { graphToIr } from "./ir/graph.ts";

export const MANIFEST_FORMAT = "omm-lua-manifest";
export const MANIFEST_VERSION = 1;

export interface ManifestScript {
  readonly nodeId: string;
  readonly revision: number;
  readonly bodyDigest: string;
  /** Whether the stored body ended with a newline (the emitter adds one otherwise). */
  readonly bodyEndsWithNewline: boolean;
}

/** Return-import manifest kept next to the editing source, never in the runtime pack. */
export interface ExportManifest {
  readonly format: typeof MANIFEST_FORMAT;
  readonly version: number;
  readonly file: string;
  readonly fileDigest: string;
  readonly graph: Graph;
  readonly scripts: readonly ManifestScript[];
}

export interface ExportResult {
  /** `null` when an error diagnostic blocks the export. */
  readonly source: string | null;
  readonly manifest: ExportManifest | null;
  readonly diagnostics: readonly Diagnostic[];
}

export function exportLua(registry: NodeRegistry, graph: Graph, file: string): ExportResult {
  const { program, diagnostics } = graphToIr(registry, graph);
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return { source: null, manifest: null, diagnostics };
  }

  const { source, scripts } = emitLua(program);
  const manifest: ExportManifest = {
    format: MANIFEST_FORMAT,
    version: MANIFEST_VERSION,
    file,
    fileDigest: digest(source),
    graph,
    scripts: scripts.map((script) => {
      const node = graph.nodes.find((candidate) => candidate.id === script.nodeId);
      const body = node !== undefined && isScriptNode(node) ? node.source : "";
      return {
        nodeId: script.nodeId,
        revision: script.revision,
        bodyDigest: script.bodyDigest,
        bodyEndsWithNewline: body.endsWith("\n"),
      };
    }),
  };
  return { source, manifest, diagnostics };
}

/** A body changed outside the editor; applied only after the user accepts it. */
export interface PendingBody {
  readonly nodeId: string;
  readonly previous: string;
  readonly next: string;
}

export interface ImportOutcome {
  readonly graph: Graph;
  /** `manifest`: IDs and layout restored; `structural`: rebuilt from Lua text. */
  readonly method: "manifest" | "structural";
  readonly pendingBodies: readonly PendingBody[];
  readonly diagnostics: readonly Diagnostic[];
}

function isManifest(value: unknown): value is ExportManifest {
  const manifest = value as ExportManifest | null;
  return (
    typeof manifest === "object" &&
    manifest !== null &&
    manifest.format === MANIFEST_FORMAT &&
    typeof manifest.version === "number" &&
    typeof manifest.graph === "object" &&
    Array.isArray(manifest.graph?.nodes) &&
    Array.isArray(manifest.scripts)
  );
}

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  for (let index = text.indexOf(needle); index >= 0; index = text.indexOf(needle, index + needle.length)) {
    count += 1;
  }
  return count;
}

type Extraction = { ok: true; bodies: Map<string, string> } | { ok: false; reason: string };

/** Reads each custom script body between its unique begin/end markers. */
function extractBodies(source: string, manifest: ExportManifest): Extraction {
  const bodies = new Map<string, string>();

  for (const script of manifest.scripts) {
    const begin = beginMarker(script.nodeId, script.revision);
    const end = endMarker(script.nodeId);
    if (countOccurrences(source, `--[[omm:begin ${script.nodeId} `) !== 1 || countOccurrences(source, end) !== 1) {
      return { ok: false, reason: `节点 ${script.nodeId} 的标记缺失或重复。` };
    }

    const beginAt = source.indexOf(begin);
    if (beginAt < 0) {
      return { ok: false, reason: `节点 ${script.nodeId} 的版本标记与清单不符。` };
    }
    const headerEnd = source.indexOf("\n", source.indexOf("\n", beginAt) + 1);
    const endAt = source.indexOf(`end\n${end}`);
    if (headerEnd < 0 || endAt < headerEnd) {
      return { ok: false, reason: `节点 ${script.nodeId} 的函数范围无法确认。` };
    }

    let body = source.slice(headerEnd + 1, endAt);
    if (!script.bodyEndsWithNewline && body.endsWith("\n")) {
      body = body.slice(0, -1);
    }
    bodies.set(script.nodeId, body);
  }
  return { ok: true, bodies };
}

/**
 * Imports Lua. With a trustworthy manifest the original graph (IDs, layout)
 * is restored and externally edited custom bodies are staged for review.
 * Any doubt falls back to a structural import of the actual text; the
 * manifest's old bodies never overwrite the imported source.
 */
export function importLua(
  registry: NodeRegistry,
  source: string,
  manifestValue: unknown,
  newId: () => string,
): ImportOutcome {
  const fallback = (reason: string | null): ImportOutcome => {
    const structural = importLuaStructural(source, newId);
    const diagnostics: Diagnostic[] = [...structural.diagnostics];
    if (reason !== null) {
      diagnostics.unshift({ code: "import.manifestRejected", severity: "warning", message: `未使用回导清单：${reason}已按实际 Lua 文本导入。` });
    }
    return { graph: structural.graph, method: "structural", pendingBodies: [], diagnostics };
  };

  if (manifestValue === null || manifestValue === undefined) {
    return fallback(null);
  }
  if (!isManifest(manifestValue)) {
    return fallback("清单损坏或格式不符。");
  }
  if (manifestValue.version !== MANIFEST_VERSION) {
    return fallback(`清单版本 ${manifestValue.version} 不受支持。`);
  }

  const manifest = manifestValue;
  if (digest(source) === manifest.fileDigest) {
    return { graph: manifest.graph, method: "manifest", pendingBodies: [], diagnostics: [] };
  }

  const extraction = extractBodies(source, manifest);
  if (!extraction.ok) {
    return fallback(extraction.reason);
  }

  // Rebuild the file from the manifest graph with the bodies found in the text;
  // only body-only edits may differ from the original export.
  const candidate: Graph = {
    ...manifest.graph,
    nodes: manifest.graph.nodes.map((node) =>
      extraction.bodies.has(node.id) ? { ...node, source: extraction.bodies.get(node.id)! } : node,
    ),
  };
  const regenerated = exportLua(registry, candidate, manifest.file);
  if (regenerated.source !== source) {
    return fallback("Lua 结构在编辑器外被改写。");
  }

  const pendingBodies: PendingBody[] = [];
  for (const node of manifest.graph.nodes) {
    const next = extraction.bodies.get(node.id);
    if (next !== undefined && isScriptNode(node) && next !== node.source) {
      pendingBodies.push({ nodeId: node.id, previous: node.source, next });
    }
  }

  const diagnostics: Diagnostic[] = pendingBodies.map((pending) => ({
    code: "import.externalEdit",
    severity: "info",
    nodeId: pending.nodeId,
    message: "自定义脚本正文在编辑器外被修改，接受后沿用原节点 ID。",
  }));
  return { graph: manifest.graph, method: "manifest", pendingBodies, diagnostics };
}
