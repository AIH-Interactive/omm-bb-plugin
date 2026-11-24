import { registerControlNodes } from "./avatar-controls.ts";
import { registerBuiltinNodes } from "./builtin.ts";
import { NodeRegistry } from "./registry.ts";

export function createDefaultRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  registerBuiltinNodes(registry);
  registerControlNodes(registry);
  return registry;
}
