import assert from "node:assert/strict";
import { test } from "node:test";

import { digest } from "../src/lua/generator/emit.ts";
import { planFile, publishFiles } from "../src/persistence/export-plan.ts";
import type { SidecarFileSystem } from "../src/persistence/sidecar.ts";

class MemoryFs implements SidecarFileSystem {
  readonly files = new Map<string, string>();
  failOn: string | null = null;

  existsSync(path: string): boolean {
    return this.files.has(path);
  }
  readFileSync(path: string): string {
    return this.files.get(path)!;
  }
  writeFileSync(path: string, data: string): void {
    if (this.failOn !== null && path.startsWith(this.failOn)) {
      throw new Error("EACCES");
    }
    this.files.set(path, data);
  }
  renameSync(from: string, to: string): void {
    this.files.set(to, this.files.get(from)!);
    this.files.delete(from);
  }
  rmSync(path: string): void {
    this.files.delete(path);
  }
}

const file = { path: "D:/out/script.lua", content: "print(2)\n" };

test("export plan: new, unchanged, previously exported and externally edited files", () => {
  assert.equal(planFile(file, null, []).kind, "write");
  assert.equal(planFile(file, "print(2)\n", []).kind, "unchanged");

  const baseline = [{ path: file.path, fileDigest: digest("print(1)\n") }];
  assert.equal(planFile(file, "print(1)\n", baseline).kind, "write");

  const conflict = planFile(file, "print('外部')\n", baseline);
  assert.equal(conflict.kind, "conflict");
  assert.equal(conflict.kind === "conflict" && conflict.external, "print('外部')\n");
  assert.equal(planFile(file, "print('外部')\n", []).kind, "conflict");
});

test("publishing writes all files or none; old outputs survive a failure", () => {
  const fs = new MemoryFs();
  fs.files.set("D:/out/a.lua", "old a");
  fs.files.set("D:/out/libs/b.lua", "old b");

  fs.failOn = "D:/out/libs/b.lua";
  assert.throws(() =>
    publishFiles(fs, [
      { path: "D:/out/a.lua", content: "new a" },
      { path: "D:/out/libs/b.lua", content: "new b" },
    ]),
  );
  assert.deepEqual([...fs.files.entries()].sort(), [["D:/out/a.lua", "old a"], ["D:/out/libs/b.lua", "old b"]]);

  fs.failOn = null;
  const baselines = publishFiles(fs, [
    { path: "D:/out/a.lua", content: "new a" },
    { path: "D:/out/libs/b.lua", content: "new b" },
  ]);
  assert.equal(fs.files.get("D:/out/a.lua"), "new a");
  assert.equal(fs.files.get("D:/out/libs/b.lua"), "new b");
  assert.deepEqual(baselines.map((baseline) => baseline.fileDigest), [digest("new a"), digest("new b")]);
});
