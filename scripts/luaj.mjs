// Runs tools/luaj/LuaRun.java against the LuaJ jars nested in the OMM release JAR.
// Usage: node scripts/luaj.mjs <file.lua> [ticks]
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const JAVA_HOME = process.env.OMM_JAVA25_HOME ?? "D:/Program Files/Java/25";
const OMM_JAR = resolve("refs/omni-morph-1.0.0-alpha.12+26.1.2-fabric-mc.jar");
const CACHE = resolve(".cache/luaj");
const CORE = join(CACHE, "META-INF/jars/luaj-core-3.0.8-figura.jar");
const JSE = join(CACHE, "META-INF/jars/luaj-jse-3.0.8-figura.jar");

export function ensureLuaj() {
  if (!existsSync(CORE) || !existsSync(JSE)) {
    mkdirSync(CACHE, { recursive: true });
    execFileSync(join(JAVA_HOME, "bin", "jar.exe"), ["xf", OMM_JAR, "META-INF/jars/luaj-core-3.0.8-figura.jar", "META-INF/jars/luaj-jse-3.0.8-figura.jar"], { cwd: CACHE });
  }
}

/** Returns { status, output } of running a Lua file under the release LuaJ. */
export function runLua(file, ticks = 0) {
  ensureLuaj();
  const result = spawnSync(
    join(JAVA_HOME, "bin", "java.exe"),
    ["-cp", `${CORE};${JSE}`, resolve("tools/luaj/LuaRun.java"), file, String(ticks)],
    { encoding: "utf8" },
  );
  const output = (result.stdout ?? "").replace(/\r\n/g, "\n");
  return { status: result.status, output, stderr: result.stderr ?? "" };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/luaj.mjs")) {
  const { status, output, stderr } = runLua(process.argv[2], Number(process.argv[3] ?? 0));
  process.stdout.write(output);
  process.stderr.write(stderr);
  process.exit(status ?? 1);
}
