// Bundles the plugin into one IIFE script that Blockbench loads directly.
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";

const outfile = "dist/omm_bb_plugin.js";

await build({
  entryPoints: ["src/plugin/main.ts"],
  outfile,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  charset: "utf8",
  legalComments: "none",
});

// Vue must come from the host; a bundled copy would break host components.
const output = readFileSync(outfile, "utf8");
if (/Vue\.js v\d|vue\.runtime/.test(output)) {
  throw new Error("构建产物包含了独立的 Vue，必须使用宿主 Vue。");
}

const manifest = {
  id: "omm_bb_plugin",
  file: outfile,
  bytes: Buffer.byteLength(output, "utf8"),
};
writeFileSync("dist/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`built ${outfile} (${manifest.bytes} bytes)`);
