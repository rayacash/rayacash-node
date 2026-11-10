// Los ejemplos del README, de examples/ y de scripts/ tienen que compilar (y uno, correr).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { isolate } from "./helpers.ts";

isolate();

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const README = readFileSync(path.join(ROOT, "README.md"), "utf8");
const BLOCKS = [...README.matchAll(/```js\n([\s\S]*?)```/g)].map((match) => match[1] ?? "");
const TMP = mkdtempSync(path.join(tmpdir(), "rayacash-readme-"));

after(() => rmSync(TMP, { recursive: true, force: true }));

/** `node --check` sobre un archivo .mjs: solo la sintaxis, sin resolver imports. */
function checkSyntax(file: string): void {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

test("el README tiene ejemplos de JavaScript", () => {
  assert.ok(BLOCKS.length >= 10, `solo hay ${BLOCKS.length} bloques`);
});

BLOCKS.forEach((block, index) => {
  test(`el bloque ${index} del README compila`, () => {
    const file = path.join(TMP, `bloque-${index}.mjs`);
    writeFileSync(file, block);
    checkSyntax(file);
  });
});

test("el ejemplo de tests sin red corre de verdad", async () => {
  const blocks = BLOCKS.filter((block) => block.includes("fetch: fakeFetch"));
  assert.equal(blocks.length, 1);
  const sdk = pathToFileURL(path.join(ROOT, "src", "index.ts")).href;
  const file = path.join(TMP, "offline.mjs");
  writeFileSync(file, (blocks[0] ?? "").replace('from "rayacash"', `from "${sdk}"`));
  await import(pathToFileURL(file).href); // no sale a la red: usa un fetch falso
});

test("el README y los ejemplos usan los nombres de Raya Connect, no los deprecados", () => {
  // Los de la 1.1.0 (client.checkout, Checkout…) solo aparecen en la oración para quien viene de
  // la 1.1.0, al final de «Raya Connect». Las guías para IA salen de este README.
  const legacy =
    /\bcheckout\.orders\b|\bclient\.checkout\b|\bCheckout(?:Status|\w*Params|\w*Service)?\b/;
  BLOCKS.forEach((block, index) => {
    assert.doesNotMatch(block, legacy, `bloque ${index}`);
  });
  for (const name of readdirSync(path.join(ROOT, "examples"))) {
    assert.doesNotMatch(readFileSync(path.join(ROOT, "examples", name), "utf8"), legacy, name);
  }
  const lines = README.split("\n").filter((line) => legacy.test(line));
  assert.equal(lines.length, 1, lines.join("\n"));
  assert.ok(
    lines[0]?.endsWith(
      "Si venís de la 1.1.0: `client.checkout.orders` y `Checkout` siguen andando como alias " +
        "deprecados hasta la 2.0.0; en código nuevo usá los nombres de arriba.",
    ),
  );
  const connect = README.slice(
    README.indexOf("\n## Raya Connect\n"),
    README.indexOf("\n## Errores\n"),
  );
  assert.ok(connect.trimEnd().endsWith(lines[0] ?? "-"), "va al final de «Raya Connect»");
});

for (const folder of ["examples", "scripts"]) {
  for (const name of readdirSync(path.join(ROOT, folder)).filter((file) => file.endsWith(".mjs"))) {
    test(`${folder}/${name} compila`, () => {
      checkSyntax(path.join(ROOT, folder, name));
    });
  }
}
