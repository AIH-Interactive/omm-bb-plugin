export const WORKFLOW_SCHEMA_VERSION = 1;
export const DEFAULT_TARGET_PROFILE = "omni-morph:fabric:1.0.0-alpha.12+26.1.2";

export type LuaLiteral = string | number | boolean | null;

export interface Port {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly direction: "input" | "output";
  readonly kind: "data" | "flow";
  readonly optional?: boolean;
  readonly defaultValue?: LuaLiteral;
}

export interface Endpoint {
  readonly nodeId: string;
  readonly portId: string;
}

export interface Edge {
  readonly from: Endpoint;
  readonly to: Endpoint;
}

export interface Position {
  readonly x: number;
  readonly y: number;
}

/**
 * Persisted node. Fields other than `id`/`type` are owned by the node
 * definition; unknown fields are kept verbatim.
 */
export interface GraphNode {
  readonly id: string;
  readonly type: string;
  readonly position?: Position;
  readonly [field: string]: unknown;
}

export interface ScriptNode extends GraphNode {
  readonly type: "core.customScript";
  readonly revision: number;
  readonly mode: "value" | "statement";
  readonly inputs: readonly Port[];
  readonly outputs: readonly Port[];
  readonly source: string;
}

export interface Graph {
  readonly id: string;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly Edge[];
  readonly [field: string]: unknown;
}

export interface GraphDocument {
  readonly schemaVersion: typeof WORKFLOW_SCHEMA_VERSION;
  readonly targetProfile: string;
  readonly graphs: readonly Graph[];
  readonly controls?: readonly ControlDefinition[];
  readonly [field: string]: unknown;
}

export type ControlType =
  | "TOGGLE"
  | "SLIDER"
  | "NUMBER"
  | "ENUM"
  | "COLOR"
  | "TEXT"
  | "KEYBIND"
  | "BUTTON"
  | "LABEL"
  | "SEPARATOR";

export interface ControlOption {
  readonly id: string;
  readonly title: string;
}

export interface ControlDefinition {
  readonly controlId: string;
  readonly type: ControlType;
  readonly title: string;
  readonly page: string;
  readonly category: string;
  readonly defaultValue: LuaLiteral;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: readonly ControlOption[];
  readonly binding?: string;
  readonly persistent?: boolean;
  readonly targetPage?: string;
}

/** True only for structurally complete script nodes; files may contain partial ones. */
export function isScriptNode(node: GraphNode): node is ScriptNode {
  return (
    node.type === "core.customScript" &&
    (node.mode === "value" || node.mode === "statement") &&
    Array.isArray(node.inputs) &&
    Array.isArray(node.outputs) &&
    typeof node.source === "string" &&
    typeof node.revision === "number"
  );
}

export function createEmptyWorkflow(): GraphDocument {
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    targetProfile: DEFAULT_TARGET_PROFILE,
    graphs: [{ id: "main", nodes: [], edges: [] }],
  };
}
