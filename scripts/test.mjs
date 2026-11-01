// @ts-check
// Corre los tests con node:test sobre el TypeScript sin compilar (type stripping, como Raya.js).
//
//   node scripts/test.mjs               todos los tests
//   node scripts/test.mjs --coverage    además, la cobertura de src/ con un mínimo de 95 %
//   node scripts/test.mjs test/x.test.ts  solo esos archivos
//
// guard.ts se precarga en cada proceso: ningún test puede salir de loopback.

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const coverage = argv.includes("--coverage");
const chosen = argv.filter((arg) => !arg.startsWith("--"));
const files =
  chosen.length > 0
    ? chosen
    : readdirSync(path.join(ROOT, "test"))
        .filter((name) => name.endsWith(".test.ts"))
        .sort()
        .map((name) => path.join("test", name));

const args = [];
// Node 22.18+ y 23.6+ ya sacan los tipos solos; en 22.6–22.17 hace falta el flag.
if (!process.features.typescript) {
  args.push("--experimental-strip-types", "--disable-warning=ExperimentalWarning");
}
args.push("--import", "./test/guard.ts", "--test", "--test-reporter=spec");
if (coverage) {
  args.push(
    "--experimental-test-coverage",
    "--test-coverage-include=src/**",
    "--test-coverage-lines=95",
    "--test-coverage-branches=95",
    "--test-coverage-functions=95",
  );
}
args.push(...files);

const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: "inherit" });
process.exit(result.status ?? 1);
