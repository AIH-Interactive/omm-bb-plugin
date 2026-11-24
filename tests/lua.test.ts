import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { exportLua, importLua, type ExportManifest } from "../src/lua/roundtrip.ts";
import { createDefaultRegistry } from "../src/nodes/default-registry.ts";
import type { Edge, Graph, GraphNode, Port, ScriptNode } from "../src/workflow/schema.ts";

const registry = createDefaultRegistry();
const TEMP = join(".cache", "lua-tests");
mkdirSync(TEMP, { recursive: true });

let fileCounter = 0;

/** Runs Lua under the LuaJ shipped in the OMM release JAR (see scripts/luaj.mjs). */
function runLua(source: string, ticks = 1): { status: number | null; output: string } {
  fileCounter += 1;
  const file = join(TEMP, `case${fileCounter}.lua`);
  writeFileSync(file, source, "utf8");
  const result = spawnSync(process.execPath, ["scripts/luaj.mjs", file, String(ticks)], { encoding: "utf8" });
  return { status: result.status, output: (result.stdout ?? "").replace(/\r\n/g, "\n") };
}

function idGenerator(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `id${next}`;
  };
}

const flow = (fromNode: string, fromPort: string, toNode: string, toPort = "exec_in"): Edge => ({
  from: { nodeId: fromNode, portId: fromPort },
  to: { nodeId: toNode, portId: toPort },
});

const dataPort = (id: string, name: string, direction: "input" | "output", type = "any"): Port => ({
  id, name, type, direction, kind: "data",
});

function script(id: string, mode: "value" | "statement", inputs: Port[], outputs: Port[], source: string): ScriptNode {
  return { id, type: "core.customScript", revision: 1, mode, inputs, outputs, source };
}

function raw(id: string, source: string): GraphNode {
  return { id, type: "core.rawLua", source };
}

function graphOf(nodes: GraphNode[], edges: Edge[]): Graph {
  return { id: "main", nodes, edges };
}

test("custom script: two inputs, two outputs, nil, comments and long strings run correctly", () => {
  const body = [
    "-- 注释 end",
    "local text = [[",
    "end ]] .. \"]]\"",
    "if b == nil then return a * 2, nil end",
    "return a + b, text -- trailing comment without newline",
  ].join("\n");
  const graph = graphOf(
    [
      { id: "tick", type: "core.event.tick" },
      { id: "c3", type: "core.constant.number", value: 3 },
      { id: "c4", type: "core.constant.number", value: 4 },
      script("s", "statement", [dataPort("a", "a", "input", "number"), dataPort("b", "b", "input", "number")], [dataPort("sum", "sum", "output"), dataPort("txt", "txt", "output")], body),
      script("s2", "statement", [dataPort("a", "a", "input", "number"), dataPort("b", "b", "input", "number")], [dataPort("sum", "sum", "output"), dataPort("txt", "txt", "output")], body),
      script("p", "statement", [dataPort("x", "x", "input"), dataPort("y", "y", "input"), dataPort("z", "z", "input"), dataPort("w", "w", "input")], [], "print(x, y, z, w)"),
    ],
    [
      flow("tick", "exec_out", "s"),
      flow("s", "exec_out", "s2"),
      flow("s2", "exec_out", "p"),
      { from: { nodeId: "c3", portId: "value" }, to: { nodeId: "s", portId: "a" } },
      { from: { nodeId: "c4", portId: "value" }, to: { nodeId: "s", portId: "b" } },
      { from: { nodeId: "c3", portId: "value" }, to: { nodeId: "s2", portId: "a" } },
      { from: { nodeId: "s", portId: "sum" }, to: { nodeId: "p", portId: "x" } },
      { from: { nodeId: "s", portId: "txt" }, to: { nodeId: "p", portId: "y" } },
      { from: { nodeId: "s2", portId: "sum" }, to: { nodeId: "p", portId: "z" } },
      { from: { nodeId: "s2", portId: "txt" }, to: { nodeId: "p", portId: "w" } },
    ],
  );

  const result = exportLua(registry, graph, "script.lua");
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.source!.includes(body + "\nend"), "body is inserted literally");

  const run = runLua(result.source!);
  assert.equal(run.status, 0, run.output);
  assert.equal(run.output, "7\tend ]]\t6\tnil\n");
});

test("value node with fan-out is evaluated once per execution", () => {
  const graph = graphOf(
    [
      { id: "tick", type: "core.event.tick" },
      raw("init", "calls = 0"),
      { id: "load", type: "core.event.load" },
      script("v", "value", [], [dataPort("out", "out", "output", "number")], "calls = calls + 1\nreturn calls * 10"),
      script("a", "statement", [dataPort("x", "x", "input")], [], "print('a', x)"),
      script("b", "statement", [dataPort("x", "x", "input")], [], "print('b', x, calls)"),
    ],
    [
      flow("load", "exec_out", "init"),
      flow("tick", "exec_out", "a"),
      flow("a", "exec_out", "b"),
      { from: { nodeId: "v", portId: "out" }, to: { nodeId: "a", portId: "x" } },
      { from: { nodeId: "v", portId: "out" }, to: { nodeId: "b", portId: "x" } },
    ],
  );

  const result = exportLua(registry, graph, "script.lua");
  assert.deepEqual(result.diagnostics, []);
  const run = runLua(result.source!, 2);
  assert.equal(run.output, "a\t10\nb\t10\t1\na\t20\nb\t20\t2\n");
});

test("numeric for with break: documented example prints 12", () => {
  const graph = graphOf(
    [
      { id: "load", type: "core.event.load" },
      raw("total", "local total = 0"),
      { id: "c5", type: "core.constant.number", value: 5 },
      { id: "c1", type: "core.constant.number", value: 1 },
      { id: "cm1", type: "core.constant.number", value: -1 },
      { id: "for", type: "core.for.numeric" },
      script("isTwo", "value", [dataPort("i", "i", "input", "number")], [dataPort("r", "r", "output", "boolean")], "return i == 2"),
      { id: "if", type: "core.if" },
      { id: "brk", type: "core.break" },
      script("add", "statement", [dataPort("i", "i", "input", "number")], [], "total = total + i"),
      raw("print", "print(total)"),
    ],
    [
      flow("load", "exec_out", "total"),
      flow("total", "exec_out", "for"),
      { from: { nodeId: "c5", portId: "value" }, to: { nodeId: "for", portId: "start" } },
      { from: { nodeId: "c1", portId: "value" }, to: { nodeId: "for", portId: "limit" } },
      { from: { nodeId: "cm1", portId: "value" }, to: { nodeId: "for", portId: "step" } },
      flow("for", "body", "if"),
      { from: { nodeId: "for", portId: "index" }, to: { nodeId: "isTwo", portId: "i" } },
      { from: { nodeId: "isTwo", portId: "r" }, to: { nodeId: "if", portId: "condition" } },
      flow("if", "then", "brk"),
      flow("if", "exec_out", "add"),
      { from: { nodeId: "for", portId: "index" }, to: { nodeId: "add", portId: "i" } },
      flow("for", "exec_out", "print"),
    ],
  );

  const result = exportLua(registry, graph, "script.lua");
  assert.deepEqual(result.diagnostics, []);
  const run = runLua(result.source!, 0);
  assert.equal(run.status, 0, run.output);
  assert.equal(run.output, "12\n");
});

test("pairs/ipairs loops expose key and value only inside the body", () => {
  const graph = graphOf(
    [
      { id: "load", type: "core.event.load" },
      script("t", "value", [], [dataPort("t", "t", "output", "table")], "return { 'x', 'y' }"),
      { id: "for", type: "core.for.ipairs" },
      script("p", "statement", [dataPort("k", "k", "input"), dataPort("v", "v", "input")], [], "print(k, v)"),
      script("after", "statement", [dataPort("v", "v", "input")], [], "print(v)"),
    ],
    [
      flow("load", "exec_out", "for"),
      { from: { nodeId: "t", portId: "t" }, to: { nodeId: "for", portId: "source" } },
      flow("for", "body", "p"),
      { from: { nodeId: "for", portId: "key" }, to: { nodeId: "p", portId: "k" } },
      { from: { nodeId: "for", portId: "value" }, to: { nodeId: "p", portId: "v" } },
      flow("for", "exec_out", "after"),
      { from: { nodeId: "for", portId: "value" }, to: { nodeId: "after", portId: "v" } },
    ],
  );

  const result = exportLua(registry, graph, "script.lua");
  assert.deepEqual(result.diagnostics.map((d) => d.code), ["export.notVisible"]);
  assert.equal(result.source, null);
});

test("blocked exports: value used across branches, break outside loop, unaudited nodes", () => {
  const graph = graphOf(
    [
      { id: "tick", type: "core.event.tick" },
      { id: "if", type: "core.if" },
      script("v", "value", [], [dataPort("o", "o", "output")], "return 1"),
      script("a", "statement", [dataPort("x", "x", "input")], [], "print(x)"),
      script("b", "statement", [dataPort("x", "x", "input")], [], "print(x)"),
      { id: "brk", type: "core.break" },
      { id: "rot", type: "model.bone.setRotation" },
    ],
    [
      flow("tick", "exec_out", "if"),
      flow("if", "then", "a"),
      flow("if", "else", "b"),
      flow("if", "exec_out", "brk"),
      { from: { nodeId: "v", portId: "o" }, to: { nodeId: "a", portId: "x" } },
      { from: { nodeId: "v", portId: "o" }, to: { nodeId: "b", portId: "x" } },
    ],
  );
  (graph.nodes as GraphNode[]).push({ id: "tick2", type: "core.event.tick" });
  (graph.edges as Edge[]).push(flow("tick2", "exec_out", "rot"));

  const codes = exportLua(registry, graph, "script.lua").diagnostics.map((d) => d.code).sort();
  assert.deepEqual(codes, ["export.breakOutsideLoop", "export.notDominated", "export.notExportable"]);
});

const HANDWRITTEN = [
  "-- 头部注释",
  "local count = 0 local step = 2",
  "",
  "local function helper(x) return x * step end",
  "events.TICK:register(function()",
  "  count = count + 1 -- 计数",
  "  print('tick', helper(count))",
  "  -- 尾注释",
  "end, 'named')",
  "events.RENDER:register(function(delta, ctx)",
  "  print('render', delta)",
  "end)",
  "for i = 1, 2 do",
  "  ::top:: print('loop', i, bit32.band(i, 1))",
  "end",
  "print([[long",
  "string]])  -- 无结尾换行",
].join("\n");

test("handwritten Lua imports structurally and exports byte-identical with the same LuaJ output", () => {
  const imported = importLua(registry, HANDWRITTEN, null, idGenerator());
  assert.equal(imported.method, "structural");
  assert.deepEqual(imported.diagnostics, []);
  const types = imported.graph.nodes.map((node) => node.type);
  assert.equal(types.filter((type) => type === "core.event.tick").length, 1);
  assert.equal(types.filter((type) => type === "core.event.render").length, 1);

  const exported = exportLua(registry, imported.graph, "script.lua");
  assert.deepEqual(exported.diagnostics, []);
  assert.equal(exported.source, HANDWRITTEN);

  const original = runLua(HANDWRITTEN, 2);
  assert.equal(original.status, 0, original.output);
  assert.equal(runLua(exported.source!, 2).output, original.output);
});

test("syntax errors keep the whole file as one raw node", () => {
  const broken = "local x = = 1\nprint(x)";
  const imported = importLua(registry, broken, null, idGenerator());
  assert.deepEqual(imported.diagnostics.map((d) => d.code), ["lua.syntax"]);
  assert.equal(exportLua(registry, imported.graph, "script.lua").source, broken);
});

function exportedFixture(): { source: string; manifest: ExportManifest; graph: Graph } {
  const graph = graphOf(
    [
      { id: "tick", type: "core.event.tick", position: { x: 10, y: 20 } },
      script("s", "statement", [], [], "-- 原正文\nprint('hello')\n"),
    ],
    [flow("tick", "exec_out", "s")],
  );
  const result = exportLua(registry, graph, "script.lua");
  return { source: result.source!, manifest: result.manifest!, graph };
}

test("manifest import restores IDs and layout; external body edits are staged, not applied", () => {
  const { source, manifest, graph } = exportedFixture();

  const unchanged = importLua(registry, source, manifest, idGenerator());
  assert.equal(unchanged.method, "manifest");
  assert.deepEqual(unchanged.graph, graph);

  const edited = source.replace("print('hello')", "print('changed')");
  const outcome = importLua(registry, edited, manifest, idGenerator());
  assert.equal(outcome.method, "manifest");
  assert.deepEqual(outcome.pendingBodies, [{ nodeId: "s", previous: "-- 原正文\nprint('hello')\n", next: "-- 原正文\nprint('changed')\n" }]);
  assert.equal((outcome.graph.nodes[1] as ScriptNode).source, "-- 原正文\nprint('hello')\n");
});

test("missing, corrupted or forged manifests and structural rewrites fall back to the actual text", () => {
  const { source, manifest } = exportedFixture();
  const check = (text: string, value: unknown, reason: RegExp | null) => {
    const outcome = importLua(registry, text, value, idGenerator());
    assert.equal(outcome.method, "structural");
    if (reason !== null) {
      assert.match(outcome.diagnostics[0]!.message, reason);
    }
    // The imported text is never replaced by the manifest's old body.
    assert.equal(exportLua(registry, outcome.graph, "script.lua").source, text);
  };

  check(source, null, null);
  check(source, { format: "something-else" }, /清单损坏/);
  check(source, { ...manifest, version: 99 }, /版本 99/);
  check(source.replace("print('hello')", "print('x')") + "\n--[[omm:begin s r1]]\n", manifest, /缺失或重复/);
  check(source.replace("print('hello')", "print('x')").replace("events.TICK", "events.RENDER"), manifest, /结构在编辑器外被改写/);
});
