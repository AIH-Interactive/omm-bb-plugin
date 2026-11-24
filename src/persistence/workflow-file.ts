import {
  WORKFLOW_SCHEMA_VERSION,
  type Edge,
  type Endpoint,
  type Graph,
  type GraphDocument,
  type GraphNode,
} from "../workflow/schema.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isEndpoint(value: unknown): value is Endpoint {
  return isRecord(value) && isIdentifier(value.nodeId) && isIdentifier(value.portId);
}

function isEdge(value: unknown): value is Edge {
  return isRecord(value) && isEndpoint(value.from) && isEndpoint(value.to);
}

function isNode(value: unknown): value is GraphNode {
  return isRecord(value) && isIdentifier(value.id) && isIdentifier(value.type);
}

function isGraph(value: unknown): value is Graph {
  return (
    isRecord(value) &&
    isIdentifier(value.id) &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isNode) &&
    Array.isArray(value.edges) &&
    value.edges.every(isEdge)
  );
}

export function decodeWorkflow(source: string): GraphDocument {
  const document: unknown = JSON.parse(source.replace(/^\uFEFF/, ""));

  if (!isRecord(document) || typeof document.schemaVersion !== "number") {
    throw new Error("工作流文件缺少有效的格式版本。");
  }
  if (document.schemaVersion !== WORKFLOW_SCHEMA_VERSION) {
    throw new Error(`不支持的工作流格式版本：${document.schemaVersion}。`);
  }
  if (
    !isIdentifier(document.targetProfile) ||
    !Array.isArray(document.graphs) ||
    document.graphs.length === 0 ||
    !document.graphs.every(isGraph)
  ) {
    throw new Error("工作流文件的配置或图结构无效。");
  }

  return {
    ...document,
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    targetProfile: document.targetProfile,
    graphs: document.graphs,
  };
}

export function encodeWorkflow(document: GraphDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
