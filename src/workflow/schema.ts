export const WORKFLOW_SCHEMA_VERSION = 1;
export const DEFAULT_TARGET_PROFILE = "omni-morph:fabric:1.0.0-alpha.12+26.1.2";

export interface Endpoint {
  readonly nodeId: string;
  readonly portId: string;
}

export interface Edge {
  readonly from: Endpoint;
  readonly to: Endpoint;
}

export interface GraphNode {
  readonly id: string;
  readonly type: string;
  readonly [field: string]: unknown;
}

export interface Graph {
  readonly id: string;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly Edge[];
}

export interface GraphDocument {
  readonly schemaVersion: typeof WORKFLOW_SCHEMA_VERSION;
  readonly targetProfile: string;
  readonly graphs: readonly Graph[];
}

export function createEmptyWorkflow(): GraphDocument {
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    targetProfile: DEFAULT_TARGET_PROFILE,
    graphs: [{ id: "main", nodes: [], edges: [] }],
  };
}
