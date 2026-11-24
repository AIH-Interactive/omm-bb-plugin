import type { CallStatement, Chunk, FunctionDeclaration, Statement as LuaStatement } from "luaparse";

import type { Edge, Graph, GraphNode } from "../../workflow/schema.ts";
import type { Diagnostic } from "../../workflow/validate.ts";
import { parseLua } from "../parser/index.ts";

/*
 * Structural import without a manifest. Top-level `events.TICK/RENDER:register`
 * callbacks become event nodes; every other statement becomes a raw Lua node
 * holding the exact source slice (including leading comments and blank
 * lines), so an unedited import exports byte-for-byte identical text.
 * Loops, conditions and other structures stay raw in this version.
 */

export interface ImportResult {
  readonly graph: Graph;
  readonly diagnostics: readonly Diagnostic[];
}

const EVENT_TYPES: Readonly<Record<string, string>> = {
  TICK: "core.event.tick",
  RENDER: "core.event.render",
};

type Range = [number, number];

/** luaparse adds `range` when `ranges: true`; its type definitions omit it. */
function rangeOf(node: object): Range {
  const range = (node as { range?: Range }).range;
  if (range === undefined) {
    throw new Error("parser ranges are required");
  }
  return range;
}

interface EventMatch {
  readonly event: string;
  readonly fn: FunctionDeclaration;
  readonly params: string[];
}

function matchEventRegistration(statement: LuaStatement): EventMatch | null {
  if (statement.type !== "CallStatement") {
    return null;
  }
  const call = (statement as CallStatement).expression;
  if (call.type !== "CallExpression" || call.base.type !== "MemberExpression") {
    return null;
  }
  const method = call.base;
  if (method.indexer !== ":" || method.identifier.name !== "register" || method.base.type !== "MemberExpression") {
    return null;
  }
  const target = method.base;
  if (target.indexer !== "." || target.base.type !== "Identifier" || target.base.name !== "events") {
    return null;
  }
  const event = target.identifier.name;
  const fn = call.arguments[0];
  if (EVENT_TYPES[event] === undefined || fn?.type !== "FunctionDeclaration" || fn.identifier !== null) {
    return null;
  }
  if (call.arguments.length > 2 || fn.parameters.some((parameter) => parameter.type !== "Identifier")) {
    return null;
  }
  const params = fn.parameters.map((parameter) => (parameter as { name: string }).name);
  return { event, fn, params };
}

/** Offset just after the closing parenthesis of the parameter list, or -1. */
function bodyStartOf(source: string, fn: FunctionDeclaration): number {
  const [fnStart] = rangeOf(fn);
  const lastParam = fn.parameters.at(-1);
  const searchFrom = lastParam === undefined ? fnStart : rangeOf(lastParam)[1];
  const close = source.indexOf(")", searchFrom);
  if (close < 0) {
    return -1;
  }
  // Verify the header is only `function (names)`; anything else stays raw.
  const header = source.slice(fnStart, close + 1);
  return /^function\s*\([\sA-Za-z0-9_,]*\)$/.test(header) ? close + 1 : -1;
}

export function importLuaStructural(source: string, newId: () => string): ImportResult {
  const diagnostics: Diagnostic[] = [];
  const nodes: GraphNode[] = [];
  const edges: Edge[] = [];
  const load: { id: string; type: string; position: { x: number; y: number }; trailer?: string } = {
    id: newId(),
    type: "core.event.load",
    position: { x: 0, y: 0 },
  };
  nodes.push(load);

  const chain = (fromId: string, fromPort: string, toId: string) => {
    edges.push({ from: { nodeId: fromId, portId: fromPort }, to: { nodeId: toId, portId: "exec_in" } });
  };

  const parsed = parseLua(source);
  if (!parsed.ok) {
    const raw = { id: newId(), type: "core.rawLua", verbatim: true, source, order: 0, position: { x: 280, y: 0 } };
    nodes.push(raw);
    chain(load.id, "exec_out", raw.id);
    load.trailer = "";
    diagnostics.push({
      code: "lua.syntax",
      severity: "error",
      nodeId: raw.id,
      message: `Lua 语法错误，整个文件保留为原始 Lua：${parsed.message}`,
    });
    return { graph: { id: "main", nodes, edges }, diagnostics };
  }

  const chunk: Chunk = parsed.ast;
  let cursor = 0;
  let loadTail: { id: string; port: string } = { id: load.id, port: "exec_out" };
  let eventColumn = 0;
  let rawCount = 0;

  chunk.body.forEach((statement, order) => {
    const [, end] = rangeOf(statement);
    const sliceStart = cursor;
    cursor = end;

    const match = matchEventRegistration(statement);
    const bodyStart = match === null ? -1 : bodyStartOf(source, match.fn);
    if (match === null || bodyStart < 0) {
      const raw = { id: newId(), type: "core.rawLua", verbatim: true, source: source.slice(sliceStart, end), order, position: { x: 280, y: rawCount * 90 } };
      rawCount += 1;
      nodes.push(raw);
      chain(loadTail.id, loadTail.port, raw.id);
      loadTail = { id: raw.id, port: "exec_out" };
      return;
    }

    eventColumn += 1;
    const x = 280 + eventColumn * 300;
    const eventNode: GraphNode = {
      id: newId(),
      type: EVENT_TYPES[match.event]!,
      order,
      params: match.params,
      header: source.slice(sliceStart, bodyStart),
      position: { x, y: 0 },
    };
    nodes.push(eventNode);

    let bodyCursor = bodyStart;
    let tail = { id: eventNode.id, port: "exec_out" };
    match.fn.body.forEach((inner, index) => {
      const [, innerEnd] = rangeOf(inner);
      const raw = { id: newId(), type: "core.rawLua", verbatim: true, source: source.slice(bodyCursor, innerEnd), position: { x, y: 90 * (index + 1) } };
      bodyCursor = innerEnd;
      nodes.push(raw);
      chain(tail.id, tail.port, raw.id);
      tail = { id: raw.id, port: "exec_out" };
    });
    (eventNode as { footer?: string }).footer = source.slice(bodyCursor, end);
  });

  load.trailer = source.slice(cursor);
  return { graph: { id: "main", nodes, edges }, diagnostics };
}
