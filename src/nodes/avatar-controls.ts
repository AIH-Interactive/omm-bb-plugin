import type { ControlDefinition, ControlType, GraphNode, Port, Position } from "../workflow/schema.ts";
import type { Command } from "../workflow/store.ts";
import { FLOW_OUT } from "./builtin.ts";
import type { NodeRegistry } from "./registry.ts";

export const CONTROL_READ_NODE = "omm.control.read";
export const CONTROL_PRESSED_NODE = "omm.control.pressed";
export const CONTROL_CHANGED_NODE = "omm.control.changed";

/** Output type of the default read node; `null` for controls without business nodes. */
export function controlValueType(type: ControlType): string | null {
  switch (type) {
    case "TOGGLE":
      return "boolean";
    case "SLIDER":
    case "NUMBER":
      return "number";
    case "ENUM":
    case "COLOR":
    case "TEXT":
    case "KEYBIND":
      return "string";
    case "BUTTON":
    case "LABEL":
    case "SEPARATOR":
      return null;
  }
}

function valuePort(node: GraphNode): Port {
  const type = typeof node.valueType === "string" ? node.valueType : "any";
  return { id: "value", name: "值", type, direction: "output", kind: "data" };
}

export function registerControlNodes(registry: NodeRegistry): void {
  registry.register({
    type: CONTROL_READ_NODE,
    title: "读取控件",
    category: "控件",
    ports: (node) => [valuePort(node)],
  });
  registry.register({
    type: CONTROL_PRESSED_NODE,
    title: "按钮按下",
    category: "控件",
    ports: () => [FLOW_OUT],
  });
  registry.register({
    type: CONTROL_CHANGED_NODE,
    title: "控件值变化",
    category: "控件",
    ports: (node) => [FLOW_OUT, valuePort(node)],
  });
}

/**
 * Default business node created with a control, or `null` for navigation
 * buttons, labels and separators.
 */
export function defaultControlNode(
  control: ControlDefinition,
  nodeId: string,
): GraphNode | null {
  if (control.type === "BUTTON") {
    if (control.targetPage !== undefined) {
      return null;
    }
    return { id: nodeId, type: CONTROL_PRESSED_NODE, controlId: control.controlId };
  }

  const valueType = controlValueType(control.type);
  if (valueType === null) {
    return null;
  }

  return { id: nodeId, type: CONTROL_READ_NODE, controlId: control.controlId, valueType };
}

/** Adding a control and its default node is one undoable transaction. */
export function addControlCommand(
  control: ControlDefinition,
  graphId: string,
  nodeId: string,
  position: Position,
): Command {
  const node = defaultControlNode(control, nodeId);
  const commands: Command[] = [{ kind: "addControl", control }];
  if (node !== null) {
    commands.push({ kind: "addNode", graphId, node: { ...node, position } });
  }
  return { kind: "transaction", label: `添加控件 ${control.title}`, commands };
}
