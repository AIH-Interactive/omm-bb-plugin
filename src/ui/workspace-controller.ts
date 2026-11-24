import { AnimationTrailController } from "../blockbench/animation-preview.ts";
import { createBoneRef, type BoneInfo, type BoneTree } from "../blockbench/bone-tree.ts";
import type { AnimationInfo, AnimationPlayback } from "../blockbench/host.ts";
import { addControlCommand } from "../nodes/avatar-controls.ts";
import type { NodeRegistry } from "../nodes/registry.ts";
import { ControlSimulation, type ControlEvent } from "../workflow/controls.ts";
import type { ControlDefinition, ControlType, Graph, GraphNode, Position } from "../workflow/schema.ts";
import type { SaveResult, WorkflowSession } from "../workflow/session.ts";
import { GraphStore, type Command } from "../workflow/store.ts";
import { validateGraph, type Diagnostic } from "../workflow/validate.ts";

export type RightTab = "properties" | "controls" | "preview";

/** Everything the Vue components render; a plain object so Vue 2 observes it. */
export interface WorkspaceView {
  graph: Graph;
  controls: readonly ControlDefinition[];
  diagnostics: readonly Diagnostic[];
  lastError: string | null;
  selectedNodeId: string | null;
  selectedControlId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  rightTab: RightTab;
  /** Simulation snapshot: values, field errors and page. */
  simulation: {
    page: string;
    values: Record<string, unknown>;
    errors: Record<string, string>;
    events: ControlEvent[];
  };
  boneTree: BoneTree | null;
  animations: readonly AnimationInfo[];
  selectedAnimationId: string | null;
  playing: boolean;
}

let idCounter = 0;

export function createId(prefix: string): string {
  idCounter += 1;
  const random = Math.random().toString(16).slice(2, 10);
  return `${prefix}_${Date.now().toString(16)}${random}${idCounter}`;
}

const CONTROL_TITLES: Record<ControlType, string> = {
  TOGGLE: "开关",
  SLIDER: "滑块",
  NUMBER: "数值",
  ENUM: "枚举",
  COLOR: "颜色",
  TEXT: "文本",
  KEYBIND: "按键绑定",
  BUTTON: "按钮",
  LABEL: "标签",
  SEPARATOR: "分隔线",
};

export const CONTROL_LIBRARY: readonly { type: ControlType; title: string }[] = (
  Object.keys(CONTROL_TITLES) as ControlType[]
).map((type) => ({ type, title: CONTROL_TITLES[type] }));

function defaultValueFor(type: ControlType): ControlDefinition["defaultValue"] {
  switch (type) {
    case "TOGGLE":
      return false;
    case "SLIDER":
    case "NUMBER":
      return 0;
    case "ENUM":
      return "option_1";
    case "COLOR":
      return "#FFFFFF";
    case "TEXT":
    case "KEYBIND":
      return "";
    default:
      return null;
  }
}

export class WorkspaceController {
  readonly registry: NodeRegistry;
  readonly store: GraphStore;
  readonly simulation = new ControlSimulation();
  readonly trail: AnimationTrailController;
  readonly view: WorkspaceView;
  private readonly session: WorkflowSession;
  private readonly playback: AnimationPlayback;
  private readonly saveHandler: () => SaveResult;

  constructor(options: {
    registry: NodeRegistry;
    session: WorkflowSession;
    playback: AnimationPlayback;
    save: () => SaveResult;
  }) {
    this.registry = options.registry;
    this.session = options.session;
    this.playback = options.playback;
    this.saveHandler = options.save;
    this.store = new GraphStore(this.registry, this.session.document);
    this.trail = new AnimationTrailController(this.playback);
    this.view = {
      graph: this.session.document.graphs[0]!,
      controls: [],
      diagnostics: [],
      lastError: null,
      selectedNodeId: null,
      selectedControlId: null,
      canUndo: false,
      canRedo: false,
      rightTab: "properties",
      simulation: { page: "main", values: {}, errors: {}, events: [] },
      boneTree: null,
      animations: [],
      selectedAnimationId: null,
      playing: false,
    };

    this.store.subscribe(() => {
      // The session owns persistence; keep it pointing at the latest document.
      this.session.state.document = this.store.document;
      this.refresh();
    });
    this.simulation.onEvent(() => this.refreshSimulation());
    this.refresh();
  }

  /** Reloads after the mode is selected or the project changes. */
  reload(): void {
    this.store.reset(this.session.document);
    this.view.selectedNodeId = null;
    this.view.selectedControlId = null;
    this.simulation.resetAll(this.store.document.controls ?? []);
    this.refreshHost();
  }

  refreshHost(): void {
    this.view.boneTree = this.playback.boneTree();
    this.view.animations = this.playback.listAnimations();
    this.view.selectedAnimationId = this.playback.selectedAnimationId();
    this.view.playing = this.playback.isPlaying();
    this.trail.revalidate();
  }

  apply(command: Command): boolean {
    const result = this.store.apply(command);
    this.view.lastError = result.ok ? null : result.diagnostic.message;
    return result.ok;
  }

  save(): SaveResult {
    return this.saveHandler();
  }

  undo(): void {
    this.store.undo();
  }

  redo(): void {
    this.store.redo();
  }

  /* ---- graph ---- */

  addNode(type: string, position: Position): string | null {
    const definition = this.registry.get(type);
    if (definition === undefined) {
      return null;
    }
    const node: GraphNode = { id: createId("n"), type, position, ...definition.create?.() };
    if (!this.apply({ kind: "addNode", graphId: this.view.graph.id, node })) {
      return null;
    }
    this.view.selectedNodeId = node.id;
    return node.id;
  }

  removeSelected(): void {
    const nodeId = this.view.selectedNodeId;
    if (nodeId !== null) {
      this.apply({ kind: "removeNodes", graphId: this.view.graph.id, nodeIds: [nodeId] });
      this.view.selectedNodeId = null;
    }
  }

  selectedNode(): GraphNode | null {
    return this.view.graph.nodes.find((node) => node.id === this.view.selectedNodeId) ?? null;
  }

  /* ---- controls ---- */

  addControl(type: ControlType, position: Position): void {
    const controlId = createId("control");
    const control: ControlDefinition = {
      controlId,
      type,
      title: CONTROL_TITLES[type],
      page: this.view.simulation.page,
      category: "",
      defaultValue: defaultValueFor(type),
      ...(type === "SLIDER" || type === "NUMBER" ? { min: 0, max: 1, step: 0.05 } : {}),
      ...(type === "ENUM" ? { options: [{ id: "option_1", title: "选项 1" }] } : {}),
    };
    const nodeId = createId("n");
    if (this.apply(addControlCommand(control, this.view.graph.id, nodeId, position))) {
      this.view.selectedControlId = controlId;
      this.view.rightTab = "controls";
    }
  }

  updateControl(controlId: string, changes: Partial<ControlDefinition>): void {
    this.apply({ kind: "updateControl", controlId, changes });
  }

  /** Removing a control also removes its bound nodes in the same undo step. */
  removeControl(controlId: string): void {
    const bound = this.store.nodesBoundTo(controlId);
    const commands: Command[] = bound.map(({ graphId, node }) => ({
      kind: "removeNodes" as const,
      graphId,
      nodeIds: [node.id],
    }));
    commands.push({ kind: "removeControl", controlId });
    this.apply({ kind: "transaction", label: "删除控件", commands });
    this.view.selectedControlId = null;
  }

  boundNodeCount(controlId: string): number {
    return this.store.nodesBoundTo(controlId).length;
  }

  /* ---- preview ---- */

  bindBone(bone: BoneInfo): void {
    const tree = this.view.boneTree;
    if (tree !== null) {
      this.trail.bind(createBoneRef(tree, bone));
    }
  }

  private refresh(): void {
    const document = this.store.document;
    this.view.graph = document.graphs[0]!;
    this.view.controls = document.controls ?? [];
    this.view.diagnostics = validateGraph(this.registry, this.view.graph);
    this.view.canUndo = this.store.canUndo;
    this.view.canRedo = this.store.canRedo;
    if (this.view.selectedNodeId !== null && this.selectedNode() === null) {
      this.view.selectedNodeId = null;
    }
    this.refreshSimulation();
  }

  refreshSimulation(): void {
    const values: Record<string, unknown> = {};
    const errors: Record<string, string> = {};
    for (const control of this.view.controls) {
      values[control.controlId] = this.simulation.valueOf(control);
      const error = this.simulation.errorOf(control.controlId);
      if (error !== undefined) {
        errors[control.controlId] = error;
      }
    }
    this.view.simulation = {
      page: this.simulation.page,
      values,
      errors,
      events: this.simulation.eventLog.slice(-20),
    };
  }
}
