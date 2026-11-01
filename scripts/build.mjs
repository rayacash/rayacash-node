// @ts-check
// Build dual sin bundler, como stripe-node: tsc dos veces, a dist/esm (import) y a dist/cjs
// (require), cada carpeta con su package.json para que Node sepa qué formato es.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TSC = path.join(
  ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc",
);

execFileSync(process.execPath, [path.join(ROOT, "scripts", "sync-version.mjs"), "--check"], {
  stdio: "inherit",
});
rmSync(path.join(ROOT, "dist"), { recursive: true, force: true });
for (const build of [
  { config: "tsconfig.esm.json", folder: "esm", type: "module" },
  { config: "tsconfig.cjs.json", folder: "cjs", type: "commonjs" },
]) {
  execFileSync(TSC, ["-p", path.join(ROOT, build.config)], { cwd: ROOT, stdio: "inherit" });
  const folder = path.join(ROOT, "dist", build.folder);
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, "package.json"), `${JSON.stringify({ type: build.type })}\n`);
}
console.log("dist/esm y dist/cjs listos.");
