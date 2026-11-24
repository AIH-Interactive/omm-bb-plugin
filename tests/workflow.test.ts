import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildBoneTree,
  createBoneRef,
  resolveBoneRef,
  type OutlinerNodeLike,
} from "../src/blockbench/bone-tree.ts";
import { AnimationTrailController } from "../src/blockbench/animation-preview.ts";
import { addControlCommand, CONTROL_PRESSED_NODE, CONTROL_READ_NODE } from "../src/nodes/avatar-controls.ts";
import { createDefaultRegistry } from "../src/nodes/default-registry.ts";
import { ControlSimulation, type ControlEvent } from "../src/workflow/controls.ts";
import { createEmptyWorkflow, type ControlDefinition, type ScriptNode } from "../src/workflow/schema.ts";
import { GraphStore } from "../src/workflow/store.ts";
import { TrailBuffer } from "../src/workflow/trail-preview.ts";
import { validateGraph } from "../src/workflow/validate.ts";

const registry = createDefaultRegistry();

function scriptNode(id: string, overrides: Partial<ScriptNode> = {}): ScriptNode {
  return {
    id,
    type: "core.customScript",
    revision: 1,
    mode: "statement",
    inputs: [{ id: "in_speed", name: "speed", type: "number", direction: "input", kind: "data", defaultValue: 1 }],
    outputs: [{ id: "out_angle", name: "angle", type: "number", direction: "output", kind: "data" }],
    source: "-- 计算摆臂角度\nreturn speed * 15\n",
    ...overrides,
  };
}

function storeWith(...nodes: Parameters<GraphStore["apply"]>[0][]): GraphStore {
  const store = new GraphStore(registry, createEmptyWorkflow());
  for (const command of nodes) {
    assert.deepEqual(store.apply(command), { ok: true });
  }
  return store;
}

const graph = (store: GraphStore) => store.document.graphs[0]!;

test("illegal edges are rejected with a diagnostic and leave the graph unchanged", () => {
  const store = storeWith(
    { kind: "addNode", graphId: "main", node: { id: "tick", type: "core.event.tick" } },
    { kind: "addNode", graphId: "main", node: { id: "if", type: "core.if" } },
    { kind: "addNode", graphId: "main", node: scriptNode("s") },
  );

  const typeMismatch = store.apply({
    kind: "connect",
    graphId: "main",
    edge: { from: { nodeId: "s", portId: "out_angle" }, to: { nodeId: "if", portId: "condition" } },
  });
  assert.equal(typeMismatch.ok, false);
  assert.equal(!typeMismatch.ok && typeMismatch.diagnostic.code, "edge.type");

  const kindMismatch = store.apply({
    kind: "connect",
    graphId: "main",
    edge: { from: { nodeId: "tick", portId: "exec_out" }, to: { nodeId: "s", portId: "in_speed" } },
  });
  assert.equal(!kindMismatch.ok && kindMismatch.diagnostic.code, "edge.kind");

  assert.equal(graph(store).edges.length, 0);
});

test("a data input accepts only one edge and a flow output only one target", () => {
  const store = storeWith(
    { kind: "addNode", graphId: "main", node: { id: "tick", type: "core.event.tick" } },
    { kind: "addNode", graphId: "main", node: { id: "c1", type: "core.constant.number", value: 1 } },
    { kind: "addNode", graphId: "main", node: { id: "c2", type: "core.constant.number", value: 2 } },
    { kind: "addNode", graphId: "main", node: scriptNode("a") },
    { kind: "addNode", graphId: "main", node: scriptNode("b") },
  );
  const connect = (from: [string, string], to: [string, string]) =>
    store.apply({
      kind: "connect",
      graphId: "main",
      edge: { from: { nodeId: from[0], portId: from[1] }, to: { nodeId: to[0], portId: to[1] } },
    });

  assert.equal(connect(["c1", "value"], ["a", "in_speed"]).ok, true);
  assert.equal(connect(["c2", "value"], ["a", "in_speed"]).ok, false);
  assert.equal(connect(["tick", "exec_out"], ["a", "exec_in"]).ok, true);
  assert.equal(connect(["tick", "exec_out"], ["b", "exec_in"]).ok, false);
  // Fan-out of a data output is allowed.
  assert.equal(connect(["c1", "value"], ["b", "in_speed"]).ok, true);
});

test("renaming a script port keeps its edges; removing a port drops only its edges", () => {
  const store = storeWith(
    { kind: "addNode", graphId: "main", node: { id: "c", type: "core.constant.number", value: 1 } },
    { kind: "addNode", graphId: "main", node: scriptNode("s") },
    {
      kind: "connect",
      graphId: "main",
      edge: { from: { nodeId: "c", portId: "value" }, to: { nodeId: "s", portId: "in_speed" } },
    },
  );

  store.apply({
    kind: "updateScript",
    graphId: "main",
    nodeId: "s",
    changes: { inputs: [{ id: "in_speed", name: "velocity", type: "number", direction: "input", kind: "data" }] },
  });
  assert.equal(graph(store).edges.length, 1);
  const renamed = graph(store).nodes.find((node) => node.id === "s") as ScriptNode;
  assert.equal(renamed.inputs[0]!.name, "velocity");
  assert.equal(renamed.revision, 2);

  store.apply({ kind: "updateScript", graphId: "main", nodeId: "s", changes: { inputs: [] } });
  assert.equal(graph(store).edges.length, 0);
});

test("changing a connected port type to an incompatible one is rejected atomically", () => {
  const store = storeWith(
    { kind: "addNode", graphId: "main", node: { id: "c", type: "core.constant.number", value: 1 } },
    { kind: "addNode", graphId: "main", node: scriptNode("s") },
    {
      kind: "connect",
      graphId: "main",
      edge: { from: { nodeId: "c", portId: "value" }, to: { nodeId: "s", portId: "in_speed" } },
    },
  );
  const before = store.document;

  const result = store.apply({
    kind: "updateScript",
    graphId: "main",
    nodeId: "s",
    changes: { inputs: [{ id: "in_speed", name: "speed", type: "string", direction: "input", kind: "data" }] },
  });

  assert.equal(result.ok, false);
  assert.equal(store.document, before);
});

test("script body text is stored verbatim and value mode has no flow ports", () => {
  const source = "  -- 注释\r\n\r\nlocal s = [[\n]]\nreturn speed\t\n";
  const store = storeWith({ kind: "addNode", graphId: "main", node: scriptNode("s", { source, mode: "value" }) });

  const node = graph(store).nodes[0]!;
  assert.equal((node as ScriptNode).source, source);
  assert.deepEqual(registry.portsOf(node).map((port) => port.id), ["in_speed", "out_angle"]);
});

test("adding a control with its default node undoes as one step", () => {
  const slider: ControlDefinition = {
    controlId: "arm_speed", type: "SLIDER", title: "摆臂速度", page: "main", category: "动作",
    defaultValue: 1, min: 0, max: 2, step: 0.5,
  };
  const store = storeWith({ kind: "addNode", graphId: "main", node: { id: "tick", type: "core.event.tick" } });

  assert.equal(store.apply(addControlCommand(slider, "main", "n_arm", { x: 0, y: 0 })).ok, true);
  assert.equal(store.document.controls?.length, 1);
  const readNode = graph(store).nodes.find((node) => node.id === "n_arm")!;
  assert.equal(readNode.type, CONTROL_READ_NODE);
  assert.equal(registry.portsOf(readNode)[0]!.type, "number");

  store.undo();
  assert.equal(store.document.controls?.length ?? 0, 0);
  assert.equal(graph(store).nodes.some((node) => node.id === "n_arm"), false);
  assert.equal(graph(store).nodes.length, 1);
});

test("a failing transaction applies nothing", () => {
  const store = storeWith({ kind: "addNode", graphId: "main", node: { id: "tick", type: "core.event.tick" } });
  const before = store.document;

  const result = store.apply({
    kind: "transaction",
    label: "bad",
    commands: [
      { kind: "addNode", graphId: "main", node: { id: "x", type: "core.event.tick" } },
      { kind: "addNode", graphId: "main", node: { id: "x", type: "core.event.tick" } },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(store.document, before);
  assert.equal(store.canUndo, true); // only the setup step
  store.undo();
  assert.equal(graph(store).nodes.length, 0);
});

test("one drag merges into a single undo step", () => {
  const store = storeWith({ kind: "addNode", graphId: "main", node: { id: "tick", type: "core.event.tick", position: { x: 0, y: 0 } } });

  for (let x = 1; x <= 5; x++) {
    store.apply({ kind: "moveNodes", graphId: "main", positions: { tick: { x, y: 0 } }, mergeKey: "drag-1" });
  }
  assert.deepEqual(graph(store).nodes[0]!.position, { x: 5, y: 0 });

  store.undo();
  assert.deepEqual(graph(store).nodes[0]!.position, { x: 0, y: 0 });
  store.redo();
  assert.deepEqual(graph(store).nodes[0]!.position, { x: 5, y: 0 });
});

test("navigation buttons create no node; plain buttons create a pressed node", () => {
  const store = new GraphStore(registry, createEmptyWorkflow());
  const nav: ControlDefinition = { controlId: "to_adv", type: "BUTTON", title: "高级", page: "main", category: "", defaultValue: null, targetPage: "advanced" };
  const wave: ControlDefinition = { controlId: "wave", type: "BUTTON", title: "挥手", page: "main", category: "", defaultValue: null };

  store.apply(addControlCommand(nav, "main", "n_nav", { x: 0, y: 0 }));
  store.apply(addControlCommand(wave, "main", "n_wave", { x: 0, y: 0 }));

  assert.deepEqual(graph(store).nodes.map((node) => node.type), [CONTROL_PRESSED_NODE]);
});

test("invalid control input is not dispatched and keeps the last valid value", () => {
  const number: ControlDefinition = { controlId: "n", type: "NUMBER", title: "数值", page: "main", category: "", defaultValue: 1, min: 0, max: 10 };
  const color: ControlDefinition = { controlId: "c", type: "COLOR", title: "颜色", page: "main", category: "", defaultValue: "#FFFFFF" };
  const sim = new ControlSimulation();
  const events: ControlEvent[] = [];
  sim.onEvent((event) => events.push(event));

  assert.equal(sim.setValue(number, "abc"), false);
  assert.equal(sim.valueOf(number), 1);
  assert.match(sim.errorOf("n")!, /有效数字/);
  assert.equal(sim.setValue(color, "#GG0000"), false);
  assert.equal(events.length, 0);

  assert.equal(sim.setValue(number, "42"), true);
  assert.equal(sim.valueOf(number), 10); // clamped like normalizeValue
  assert.equal(sim.errorOf("n"), undefined);
  assert.equal(sim.setValue(number, 10), true); // unchanged: no event
  assert.deepEqual(events, [{ kind: "changed", controlId: "n", value: 10 }]);
});

test("slider snaps to step, buttons press or navigate, reset restores defaults", () => {
  const slider: ControlDefinition = { controlId: "s", type: "SLIDER", title: "滑块", page: "main", category: "", defaultValue: 0, min: 0, max: 1, step: 0.25 };
  const wave: ControlDefinition = { controlId: "wave", type: "BUTTON", title: "挥手", page: "main", category: "", defaultValue: null };
  const nav: ControlDefinition = { controlId: "nav", type: "BUTTON", title: "高级", page: "main", category: "", defaultValue: null, targetPage: "advanced" };
  const label: ControlDefinition = { controlId: "l", type: "LABEL", title: "说明", page: "main", category: "", defaultValue: null };
  const sim = new ControlSimulation();

  sim.setValue(slider, 0.6);
  assert.equal(sim.valueOf(slider), 0.5);
  assert.equal(sim.isModified(slider), true);

  sim.press(wave);
  sim.press(nav);
  assert.equal(sim.page, "advanced");

  sim.resetAll([slider, wave, nav, label]);
  assert.equal(sim.valueOf(slider), 0);
  assert.deepEqual(sim.eventLog.map((event) => event.kind), ["changed", "pressed", "pageChanged", "changed"]);
});

test("bone refs follow renames by UUID and report deleted bones", () => {
  const roots: OutlinerNodeLike[] = [
    { uuid: "body", name: "body", type: "group", children: [
      { uuid: "arm", name: "right_arm", type: "group", children: [{ uuid: "cube1", name: "cube", type: "cube" }] },
    ] },
  ];
  const tree = buildBoneTree("project-1", roots);
  assert.deepEqual(tree.bones.map((bone) => bone.path), ["body", "body/right_arm"]);

  const ref = createBoneRef(tree, tree.bones[1]!);
  const renamedTree = buildBoneTree("project-1", [
    { uuid: "body", name: "body", type: "group", children: [{ uuid: "arm", name: "RightArm", type: "group" }] },
  ]);
  const renamed = resolveBoneRef(renamedTree, ref);
  assert.equal(renamed.ok && renamed.bone.name, "RightArm");
  assert.equal(renamed.ok && renamed.renamed, true);

  // A new bone with the old name must not be silently bound.
  const deletedTree = buildBoneTree("project-1", [
    { uuid: "body", name: "body", type: "group", children: [{ uuid: "other", name: "right_arm", type: "group" }] },
  ]);
  const deleted = resolveBoneRef(deletedTree, ref);
  assert.equal(!deleted.ok && deleted.code, "bone.missing");

  const otherProject = resolveBoneRef(buildBoneTree("project-2", roots), ref);
  assert.equal(!otherProject.ok && otherProject.code, "bone.otherProject");
});

test("trail is bounded, ignores duplicate frames and restarts on time reversal or animation switch", () => {
  const trail = new TrailBuffer(3);

  for (const time of [0, 0.1, 0.1, 0.2, 0.3]) {
    trail.push({ time, animationId: "swing", position: [time, 0, 0] });
  }
  assert.deepEqual(trail.points.map((point) => point.time), [0.1, 0.2, 0.3]);

  trail.push({ time: 0.05, animationId: "swing", position: [0, 0, 0] });
  assert.deepEqual(trail.points.map((point) => point.time), [0.05]);

  trail.push({ time: 0.2, animationId: "idle", position: [0, 0, 0] });
  assert.deepEqual(trail.points.map((point) => point.animationId), ["idle"]);

  trail.clear();
  assert.equal(trail.points.length, 0);
});

test("unknown nodes are kept with their edges and reported", () => {
  const document = createEmptyWorkflow();
  const unknown = { id: "u", type: "future.node", payload: { a: 1 } };
  const store = new GraphStore(registry, {
    ...document,
    graphs: [{ id: "main", nodes: [unknown, scriptNode("s")], edges: [{ from: { nodeId: "u", portId: "x" }, to: { nodeId: "s", portId: "in_speed" } }] }],
  });

  const diagnostics = validateGraph(registry, graph(store));
  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), ["node.unknown"]);
  assert.equal(graph(store).edges.length, 1);
  assert.deepEqual(graph(store).nodes[0], unknown);
});

test("invalid script port names are diagnosed", () => {
  const node = scriptNode("s", {
    inputs: [
      { id: "a", name: "end", type: "number", direction: "input", kind: "data" },
      { id: "b", name: "x", type: "number", direction: "input", kind: "data" },
      { id: "c", name: "x", type: "number", direction: "input", kind: "data" },
    ],
  });
  const codes = validateGraph(registry, { id: "main", nodes: [node], edges: [] }).map((d) => d.code);
  assert.deepEqual(codes, ["script.portName", "script.duplicatePort"]);
});

test("registry rejects duplicate node types", () => {
  assert.throws(
    () => registry.register({ type: "core.if", title: "x", category: "x", ports: () => [] }),
    /节点类型重复/,
  );
  assert.ok(registry.search("tick").some((definition) => definition.type === "core.event.tick"));
  assert.ok(registry.search("自定义").some((definition) => definition.type === "core.customScript"));
});

test("trail controller stops sampling a deleted bone and restarts after scrubbing back", () => {
  const animationId = "swing";
  let time = 0;
  let bones: OutlinerNodeLike[] = [{ uuid: "arm", name: "right_arm", type: "group" }];
  let frame: () => void = () => {};
  let overlay: readonly (readonly number[])[] | null = null;

  const controller = new AnimationTrailController({
    onAnimationFrame: (callback) => {
      frame = callback;
      return () => {};
    },
    boneTree: () => buildBoneTree("p", bones),
    timelineTime: () => time,
    selectedAnimationId: () => animationId,
    boneWorldPosition: (uuid) => (uuid === "arm" ? [time, 1, 0] : null),
    setTrailOverlay: (points) => {
      overlay = points;
    },
  });

  const tree = buildBoneTree("p", bones);
  controller.bind(createBoneRef(tree, tree.bones[0]!));
  for (const t of [0, 0.1, 0.2]) {
    time = t;
    frame();
  }
  assert.deepEqual(controller.state.points.map((point) => point.time), [0, 0.1, 0.2]);
  assert.equal(overlay!.length, 3);

  time = 0.05;
  frame();
  assert.deepEqual(controller.state.points.map((point) => point.time), [0.05]);

  bones = [];
  time = 0.3;
  frame();
  assert.equal(controller.state.points.length, 0);
  assert.equal(overlay, null);
  assert.match(controller.state.diagnostic!, /已不存在/);
});

test("a malformed script node from a file is reported instead of crashing", () => {
  const node = { id: "s", type: "core.customScript", source: "return 1" };
  const codes = validateGraph(registry, { id: "main", nodes: [node], edges: [] }).map((d) => d.code);
  assert.deepEqual(codes, ["script.malformed"]);
  assert.deepEqual(registry.portsOf(node), []);
});
