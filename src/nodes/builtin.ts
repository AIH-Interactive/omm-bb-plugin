import { isScriptNode, type GraphNode, type Port } from "../workflow/schema.ts";
import type { NodeRegistry } from "./registry.ts";

export const FLOW_IN: Port = { id: "exec_in", name: "执行", type: "flow", direction: "input", kind: "flow" };
export const FLOW_OUT: Port = { id: "exec_out", name: "执行", type: "flow", direction: "output", kind: "flow" };

function staticPorts(ports: readonly Port[]): (node: GraphNode) => readonly Port[] {
  return () => ports;
}

/** Ports of a custom script node: flow ports only exist in statement mode. */
export function customScriptPorts(node: GraphNode): readonly Port[] {
  if (!isScriptNode(node)) {
    return [];
  }

  const flow = node.mode === "statement" ? [FLOW_IN, FLOW_OUT] : [];
  return [...flow, ...node.inputs, ...node.outputs];
}

export function registerBuiltinNodes(registry: NodeRegistry): void {
  registry.register({
    type: "core.event.tick",
    title: "Tick 事件",
    category: "事件",
    luaName: "events.TICK",
    ports: staticPorts([FLOW_OUT]),
  });
  registry.register({
    type: "core.event.render",
    title: "渲染事件",
    category: "事件",
    luaName: "events.RENDER",
    ports: staticPorts([
      FLOW_OUT,
      { id: "delta", name: "delta", type: "number", direction: "output", kind: "data" },
    ]),
  });
  registry.register({
    type: "core.if",
    title: "条件",
    category: "基础流程",
    luaName: "if",
    ports: staticPorts([
      FLOW_IN,
      { id: "condition", name: "条件", type: "boolean", direction: "input", kind: "data" },
      { id: "then", name: "成立", type: "flow", direction: "output", kind: "flow" },
      { id: "else", name: "否则", type: "flow", direction: "output", kind: "flow" },
    ]),
  });
  registry.register({
    type: "core.constant.number",
    title: "数值常量",
    category: "基础流程",
    ports: staticPorts([{ id: "value", name: "值", type: "number", direction: "output", kind: "data" }]),
    create: () => ({ value: 0 }),
  });
  registry.register({
    type: "core.customScript",
    title: "自定义 Lua 脚本",
    category: "Lua 脚本",
    ports: customScriptPorts,
    create: () => ({
      revision: 1,
      mode: "statement",
      inputs: [],
      outputs: [],
      source: "",
    }),
  });
  registry.register({
    type: "model.bone.setRotation",
    title: "设置骨骼旋转",
    category: "模型与骨骼",
    luaName: "ModelPart:setRot",
    ports: staticPorts([
      FLOW_IN,
      FLOW_OUT,
      { id: "bone", name: "骨骼", type: "ModelPart", direction: "input", kind: "data" },
      { id: "rotZ", name: "旋转 Z", type: "number", direction: "input", kind: "data" },
    ]),
  });
  registry.register({
    type: "model.bone.ref",
    title: "骨骼引用",
    category: "模型与骨骼",
    ports: staticPorts([{ id: "bone", name: "骨骼", type: "ModelPart", direction: "output", kind: "data" }]),
    create: () => ({ bone: null }),
  });
  registry.register({
    type: "model.bone.sampleWorld",
    title: "采样骨骼世界变换",
    category: "模型与骨骼",
    ports: staticPorts([
      { id: "bone", name: "骨骼", type: "ModelPart", direction: "input", kind: "data" },
      { id: "position", name: "位置", type: "Vector3", direction: "output", kind: "data" },
      { id: "rotation", name: "旋转", type: "Vector3", direction: "output", kind: "data" },
    ]),
  });
}
