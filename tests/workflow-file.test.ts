import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeWorkflow, encodeWorkflow } from "../src/persistence/workflow-file.ts";
import { createEmptyWorkflow } from "../src/workflow/schema.ts";

test("empty workflow survives encode/decode", () => {
  const document = createEmptyWorkflow();

  assert.deepEqual(decodeWorkflow(encodeWorkflow(document)), document);
});

test("unknown document, graph and node fields are preserved", () => {
  const source = JSON.stringify({
    schemaVersion: 1,
    targetProfile: "omni-morph:test",
    futureField: { keep: true },
    graphs: [
      {
        id: "main",
        layout: { zoom: 2 },
        nodes: [{ id: "n1", type: "core.customScript", source: "-- 原文\nreturn 1" }],
        edges: [],
      },
    ],
  });

  const decoded = decodeWorkflow(source);

  assert.deepEqual(JSON.parse(encodeWorkflow(decoded)), JSON.parse(source));
});

test("UTF-8 BOM is accepted", () => {
  const encoded = String.fromCharCode(0xfeff) + encodeWorkflow(createEmptyWorkflow());

  assert.equal(decodeWorkflow(encoded).schemaVersion, 1);
});

test("missing or unsupported versions are rejected", () => {
  assert.throws(() => decodeWorkflow("{}"), /格式版本/);
  assert.throws(
    () => decodeWorkflow(JSON.stringify({ schemaVersion: 99, targetProfile: "x", graphs: [] })),
    /不支持的工作流格式版本：99/,
  );
});

test("invalid graph structure is rejected", () => {
  const badEdge = {
    schemaVersion: 1,
    targetProfile: "x",
    graphs: [{ id: "main", nodes: [], edges: [{ from: { nodeId: "a" }, to: {} }] }],
  };

  assert.throws(() => decodeWorkflow(JSON.stringify(badEdge)), /图结构无效/);
  assert.throws(() => decodeWorkflow("not json"), SyntaxError);
});
