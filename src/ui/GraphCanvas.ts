import type { Edge, GraphNode, Port, Position } from "../workflow/schema.ts";
import { edgePath, intersects, type Point } from "./geometry.ts";
import { createId, type WorkspaceController } from "./workspace-controller.ts";

export const NODE_WIDTH = 200;
const HEADER_HEIGHT = 30;
const PORT_ROW_HEIGHT = 24;

interface PortLayout {
  port: Port;
  /** Row index within its side. */
  row: number;
}

interface NodeLayout {
  node: GraphNode;
  title: string;
  unknown: boolean;
  inputs: PortLayout[];
  outputs: PortLayout[];
  position: Position;
  height: number;
}

function layoutNode(controller: WorkspaceController, node: GraphNode): NodeLayout {
  const definition = controller.registry.get(node.type);
  const ports = controller.registry.portsOf(node);
  const sortFlowFirst = (a: Port, b: Port) => Number(a.kind !== "flow") - Number(b.kind !== "flow");
  const inputs = ports.filter((port) => port.direction === "input").sort(sortFlowFirst);
  const outputs = ports.filter((port) => port.direction === "output").sort(sortFlowFirst);
  const rows = Math.max(inputs.length, outputs.length, 1);

  return {
    node,
    title: definition?.title ?? `未知节点 ${node.type}`,
    unknown: definition === undefined,
    inputs: inputs.map((port, row) => ({ port, row })),
    outputs: outputs.map((port, row) => ({ port, row })),
    position: node.position ?? { x: 0, y: 0 },
    height: HEADER_HEIGHT + rows * PORT_ROW_HEIGHT + 8,
  };
}

function portAnchor(layout: NodeLayout, portId: string): Point | null {
  const input = layout.inputs.find((entry) => entry.port.id === portId);
  const output = layout.outputs.find((entry) => entry.port.id === portId);
  const entry = input ?? output;
  if (entry === undefined) {
    return null;
  }
  return {
    x: layout.position.x + (input !== undefined ? 0 : NODE_WIDTH),
    y: layout.position.y + HEADER_HEIGHT + entry.row * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2,
  };
}

type Drag =
  | { kind: "pan"; startX: number; startY: number; originX: number; originY: number }
  | { kind: "node"; nodeId: string; startX: number; startY: number; origin: Position; mergeKey: string }
  | { kind: "wire"; from: { nodeId: string; portId: string }; start: Point; current: Point };

interface CanvasVm {
  controller: WorkspaceController;
  panX: number;
  panY: number;
  zoom: number;
  drag: Drag | null;
  width: number;
  height: number;
  $el: HTMLElement;
  layouts: NodeLayout[];
  visibleLayouts: NodeLayout[];
  toGraph(event: MouseEvent): Point;
}

export function createGraphCanvas(controller: WorkspaceController): object {
  return {
    name: "omm-graph-canvas",
    data() {
      return { controller, view: controller.view, panX: 40, panY: 40, zoom: 1, drag: null, width: 800, height: 600 };
    },
    computed: {
      layouts(this: CanvasVm & { view: WorkspaceController["view"] }): NodeLayout[] {
        return this.view.graph.nodes.map((node) => layoutNode(this.controller, node));
      },
      /** Viewport clipping: only nodes intersecting the visible area are rendered. */
      visibleLayouts(this: CanvasVm): NodeLayout[] {
        const viewport = {
          x: -this.panX / this.zoom,
          y: -this.panY / this.zoom,
          width: this.width / this.zoom,
          height: this.height / this.zoom,
        };
        return this.layouts.filter((layout) =>
          intersects(viewport, { ...layout.position, width: NODE_WIDTH, height: layout.height }),
        );
      },
      edgePaths(this: CanvasVm & { view: WorkspaceController["view"] }) {
        const byId = new Map(this.layouts.map((layout) => [layout.node.id, layout]));
        const errorNodes = new Set(
          this.view.diagnostics.filter((d) => d.severity === "error").map((d) => d.nodeId),
        );
        return this.view.graph.edges.flatMap((edge: Edge, index: number) => {
          const from = byId.get(edge.from.nodeId);
          const to = byId.get(edge.to.nodeId);
          const start = from && portAnchor(from, edge.from.portId);
          const end = to && portAnchor(to, edge.to.portId);
          if (!start || !end) {
            return [];
          }
          const flow = from.outputs.some((entry) => entry.port.id === edge.from.portId && entry.port.kind === "flow");
          const state = errorNodes.has(edge.to.nodeId) ? "error" : flow ? "flow" : "data";
          return [{ key: `${index}`, d: edgePath(start, end), state, edge }];
        });
      },
      wirePath(this: CanvasVm): string | null {
        const drag = this.drag;
        return drag?.kind === "wire" ? edgePath(drag.start, drag.current) : null;
      },
      transform(this: CanvasVm): string {
        return `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
      },
    },
    mounted(this: CanvasVm & { onResize(): void; resizeObserver?: ResizeObserver }) {
      this.onResize();
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(this.$el);
    },
    beforeDestroy(this: { resizeObserver?: ResizeObserver }) {
      this.resizeObserver?.disconnect();
    },
    methods: {
      onResize(this: CanvasVm) {
        this.width = this.$el.clientWidth;
        this.height = this.$el.clientHeight;
      },
      toGraph(this: CanvasVm, event: MouseEvent): Point {
        const rect = this.$el.getBoundingClientRect();
        return {
          x: (event.clientX - rect.left - this.panX) / this.zoom,
          y: (event.clientY - rect.top - this.panY) / this.zoom,
        };
      },
      viewportCenter(this: CanvasVm): Position {
        return {
          x: Math.round((this.width / 2 - this.panX) / this.zoom - NODE_WIDTH / 2),
          y: Math.round((this.height / 2 - this.panY) / this.zoom - 40),
        };
      },
      onBackgroundDown(this: CanvasVm, event: MouseEvent) {
        if (event.button !== 0) {
          return;
        }
        this.controller.view.selectedNodeId = null;
        this.drag = { kind: "pan", startX: event.clientX, startY: event.clientY, originX: this.panX, originY: this.panY };
      },
      onNodeDown(this: CanvasVm, event: MouseEvent, layout: NodeLayout) {
        if (event.button !== 0) {
          return;
        }
        this.controller.view.selectedNodeId = layout.node.id;
        this.controller.view.rightTab = "properties";
        this.drag = {
          kind: "node",
          nodeId: layout.node.id,
          startX: event.clientX,
          startY: event.clientY,
          origin: layout.position,
          mergeKey: createId("drag"),
        };
      },
      onOutputDown(this: CanvasVm, event: MouseEvent, layout: NodeLayout, port: Port) {
        const start = portAnchor(layout, port.id);
        if (start !== null) {
          this.drag = { kind: "wire", from: { nodeId: layout.node.id, portId: port.id }, start, current: this.toGraph(event) };
        }
      },
      onInputUp(this: CanvasVm, layout: NodeLayout, port: Port) {
        const drag = this.drag;
        if (drag?.kind === "wire") {
          this.controller.apply({
            kind: "connect",
            graphId: this.controller.view.graph.id,
            edge: { from: drag.from, to: { nodeId: layout.node.id, portId: port.id } },
          });
        }
        this.drag = null;
      },
      onEdgeContext(this: CanvasVm, edge: Edge) {
        this.controller.apply({ kind: "disconnect", graphId: this.controller.view.graph.id, edge });
      },
      onMove(this: CanvasVm, event: MouseEvent) {
        const drag = this.drag;
        if (drag === null) {
          return;
        }
        if (drag.kind === "pan") {
          this.panX = drag.originX + event.clientX - drag.startX;
          this.panY = drag.originY + event.clientY - drag.startY;
        } else if (drag.kind === "node") {
          const position = {
            x: Math.round(drag.origin.x + (event.clientX - drag.startX) / this.zoom),
            y: Math.round(drag.origin.y + (event.clientY - drag.startY) / this.zoom),
          };
          this.controller.apply({
            kind: "moveNodes",
            graphId: this.controller.view.graph.id,
            positions: { [drag.nodeId]: position },
            mergeKey: drag.mergeKey,
          });
        } else {
          this.drag = { ...drag, current: this.toGraph(event) };
        }
      },
      /** Drop from the node or control library (see NodeLibrary). */
      onDrop(this: CanvasVm, event: DragEvent) {
        const position = this.toGraph(event);
        const nodeType = event.dataTransfer?.getData("application/x-omm-node");
        const controlType = event.dataTransfer?.getData("application/x-omm-control");
        if (nodeType) {
          this.controller.addNode(nodeType, position);
        } else if (controlType) {
          this.controller.addControl(controlType as never, position);
        }
      },
      onUp(this: CanvasVm) {
        this.drag = null;
      },
      onWheel(this: CanvasVm, event: WheelEvent) {
        const rect = this.$el.getBoundingClientRect();
        const cursorX = event.clientX - rect.left;
        const cursorY = event.clientY - rect.top;
        const zoom = Math.min(2, Math.max(0.25, this.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
        // Keep the point under the cursor fixed.
        this.panX = cursorX - ((cursorX - this.panX) * zoom) / this.zoom;
        this.panY = cursorY - ((cursorY - this.panY) * zoom) / this.zoom;
        this.zoom = zoom;
      },
      fitView(this: CanvasVm) {
        if (this.layouts.length === 0) {
          this.panX = 40;
          this.panY = 40;
          this.zoom = 1;
          return;
        }
        const minX = Math.min(...this.layouts.map((l) => l.position.x));
        const minY = Math.min(...this.layouts.map((l) => l.position.y));
        const maxX = Math.max(...this.layouts.map((l) => l.position.x + NODE_WIDTH));
        const maxY = Math.max(...this.layouts.map((l) => l.position.y + l.height));
        const zoom = Math.min(1, (this.width - 80) / (maxX - minX), (this.height - 80) / (maxY - minY));
        this.zoom = Math.max(0.25, zoom);
        this.panX = 40 - minX * this.zoom;
        this.panY = 40 - minY * this.zoom;
      },
      onKey(this: CanvasVm, event: KeyboardEvent) {
        // Shortcuts only apply while the canvas has focus.
        if (event.key === "Delete" || event.key === "Backspace") {
          this.controller.removeSelected();
          event.preventDefault();
        }
      },
      portRowStyle(row: number): string {
        return `top: ${HEADER_HEIGHT + row * PORT_ROW_HEIGHT}px`;
      },
    },
    template: `
<div class="omm-canvas" tabindex="0" @mousedown.self="onBackgroundDown" @mousemove="onMove" @mouseup="onUp"
     @mouseleave="onUp" @wheel.prevent="onWheel" @keydown="onKey"
     @dragover.prevent @drop.prevent="onDrop">
  <div class="omm-canvas__layer" :style="{ transform }" @mousedown.self="onBackgroundDown">
    <svg class="omm-canvas__edges" width="1" height="1">
      <path v-for="edge in edgePaths" :key="edge.key" :d="edge.d" :class="'omm-edge omm-edge--' + edge.state"
            @contextmenu.prevent="onEdgeContext(edge.edge)"><title>右键删除连线</title></path>
      <path v-if="wirePath" :d="wirePath" class="omm-edge omm-edge--pending"></path>
    </svg>
    <div v-for="layout in visibleLayouts" :key="layout.node.id"
         :class="['omm-node', { 'omm-node--selected': layout.node.id === view.selectedNodeId, 'omm-node--unknown': layout.unknown }]"
         :style="{ left: layout.position.x + 'px', top: layout.position.y + 'px', height: layout.height + 'px' }">
      <div class="omm-node__header" @mousedown.stop="onNodeDown($event, layout)">{{ layout.title }}</div>
      <div v-for="entry in layout.inputs" :key="'i' + entry.port.id" class="omm-port omm-port--input" :style="portRowStyle(entry.row)"
           @mouseup.stop="onInputUp(layout, entry.port)">
        <span :class="['omm-port__dot', 'omm-port__dot--' + entry.port.kind]"></span>
        <span class="omm-port__label">{{ entry.port.name }}<template v-if="entry.port.kind === 'data'"> · {{ entry.port.type }}</template></span>
      </div>
      <div v-for="entry in layout.outputs" :key="'o' + entry.port.id" class="omm-port omm-port--output" :style="portRowStyle(entry.row)"
           @mousedown.stop="onOutputDown($event, layout, entry.port)">
        <span class="omm-port__label">{{ entry.port.name }}<template v-if="entry.port.kind === 'data'"> · {{ entry.port.type }}</template></span>
        <span :class="['omm-port__dot', 'omm-port__dot--' + entry.port.kind]"></span>
      </div>
    </div>
  </div>
  <div v-if="view.graph.nodes.length === 0" class="omm-canvas__empty">
    <div class="omm-canvas__empty-title">此工作流还没有节点</div>
    <div class="omm-muted">从节点库拖入节点，或打开搜索。</div>
  </div>
  <div class="omm-canvas__zoom">{{ Math.round(zoom * 100) }}%</div>
</div>`,
  };
}
