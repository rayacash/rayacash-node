import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import util from "node:util";

import { RayaClient, RayaResponse, VERSION } from "../src/index.ts";
import { timing } from "../src/retry.ts";
import { isolate, rejection, TEST_KEY } from "./helpers.ts";

// Los originales, antes de que isolate() los reemplace.
const REAL = { ...timing };

isolate();

test("el sleep, el jitter, el reloj y la señal reales", async () => {
  await REAL.sleep(0);
  for (let i = 0; i < 100; i += 1) {
    const jitter = REAL.jitter();
    assert.ok(jitter >= 0 && jitter < 1);
  }
  assert.ok(Math.abs(REAL.now() - Date.now() / 1000) < 5);
  const signal = REAL.timeoutSignal(1);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(signal.aborted, true);
  assert.equal((signal.reason as DOMException).name, "TimeoutError");
});

test("console.log de una RayaResponse muestra solo el status y el request id", () => {
  const response = new RayaResponse({
    httpStatus: 200,
    headers: new Headers({ "Raya-Request-Id": "req_x" }),
    body: '{"nombre":"secreto"}',
    data: { nombre: "secreto" },
    idempotencyKey: null,
  });
  assert.equal(util.inspect(response), 'RayaResponse { httpStatus: 200, requestId: "req_x" }');
  assert.equal(response.requestId, "req_x");
});

test("sin fetch global, el error dice qué hacer", async () => {
  const original = globalThis.fetch;
  // @ts-expect-error: un runtime sin fetch.
  globalThis.fetch = undefined;
  try {
    const error = await rejection(new RayaClient(TEST_KEY).balance.retrieve());
    assert.ok(error instanceof TypeError);
    assert.match(error.message, /No hay un fetch global/);
  } finally {
    globalThis.fetch = original;
  }
});

test("la versión es la de package.json y va en el User-Agent", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(VERSION, pkg.version);
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});

test("la versión es la misma en el lock, el README y el CHANGELOG, y es nueva", () => {
  const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(lock.version, VERSION);
  assert.equal(lock.packages[""].version, VERSION);
  // El README es la página de npm: su «Versión X.Y.Z.» y el User-Agent de ejemplo.
  const readme = read("README.md");
  assert.ok(readme.includes(`\nVersión ${VERSION}. `));
  const agents = [...readme.matchAll(/rayacash-node\/(\d+\.\d+\.\d+)/g)].map((match) => match[1]);
  assert.ok(agents.length > 0);
  assert.deepEqual(new Set(agents), new Set([VERSION]));
  // La primera entrada del CHANGELOG es esta versión, más nueva que todas las publicadas: una
  // versión publicada no se vuelve a publicar.
  const entries = [...read("CHANGELOG.md").matchAll(/^## (\d+)\.(\d+)\.(\d+)$/gm)].map((match) =>
    match.slice(1, 4).map(Number),
  );
  assert.equal(entries[0]?.join("."), VERSION);
  for (let index = 1; index < entries.length; index += 1) {
    const [newer = [], older = []] = [entries[index - 1], entries[index]];
    const order = newer.findIndex((part, at) => part !== older[at]);
    assert.ok(order >= 0 && (newer[order] ?? 0) > (older[order] ?? 0), older.join("."));
  }
});
