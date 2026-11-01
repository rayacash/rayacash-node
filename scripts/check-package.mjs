// @ts-check
// Después del build: el paquete se carga con import (dist/esm) y con require (dist/cjs), los dos
// exportan lo mismo y hacen una request con un fetch falso. Nunca sale a la red.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const KEY = "raya_sk_live_0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL";

/** @param {string} url @param {RequestInit} init */
async function fakeFetch(url, init) {
  assert.equal(url, "https://api.raya.cash/v1/balance");
  assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${KEY}`);
  return new Response(JSON.stringify({ object: "balance", available: 1500, currency: "ARS" }), {
    status: 200,
    headers: { "Raya-Request-Id": "req_check" },
  });
}

// Por el nombre del paquete (self-reference), como lo cargaría quien lo instala.
const esm = await import("rayacash");
const cjs = require("rayacash");

assert.deepEqual(Object.keys(esm).sort(), Object.keys(cjs).sort());
for (const [format, sdk] of Object.entries({ esm, cjs: /** @type {typeof esm} */ (cjs) })) {
  assert.equal(sdk.VERSION, pkg.version, `${format}: VERSION`);
  const client = new sdk.RayaClient(KEY, { fetch: fakeFetch });
  const balance = await client.balance.retrieve();
  assert.ok(balance instanceof sdk.Balance, `${format}: Balance`);
  assert.equal(balance.available, 1500);
  assert.equal(balance.lastResponse?.requestId, "req_check");
  assert.match(
    new sdk.APIError("x").toString(),
    /^APIError: x$/,
    `${format}: los errores tienen su name`,
  );
}
console.log(
  `rayacash ${pkg.version}: ESM y CJS exportan lo mismo (${Object.keys(esm).length} nombres) y funcionan.`,
);
