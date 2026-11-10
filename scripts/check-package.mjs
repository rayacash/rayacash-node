// @ts-check
// Después del build: el paquete se carga con import (dist/esm) y con require (dist/cjs), los dos
// exportan los mismos nombres (todos los de la 1.1.0, también los alias deprecados) y hacen una
// request con un fetch falso. Nunca sale a la red.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const KEY = "raya_sk_live_0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL";

// Lo que exporta el paquete en runtime: lo de la 1.1.0 (Checkout es el alias deprecado de
// ConnectOrder, hasta la 2.0.0) más ConnectOrder. Sacar un nombre rompe el código de alguien.
const NAMES = [
  "APIConnectionError",
  "APIError",
  "AuthenticationError",
  "Balance",
  "Checkout",
  "ConflictError",
  "ConnectOrder",
  "DEFAULT_API_BASE",
  "Event",
  "IdempotencyError",
  "InvalidRequestError",
  "ListObject",
  "NotFoundError",
  "OAuth",
  "OAuthToken",
  "Payment",
  "PermissionDeniedError",
  "RateLimitError",
  "RayaClient",
  "RayaError",
  "RayaObject",
  "RayaResponse",
  "SignatureVerificationError",
  "Transfer",
  "UnprocessableEntityError",
  "User",
  "VERSION",
  "Webhook",
  "WebhookSignature",
  "config",
  "setAppInfo",
];

// client.checkout avisa con process.emitWarning: acá se guarda el código en vez de mostrarlo.
/** @type {Array<string | undefined>} */
const warnings = [];
const emitWarning = process.emitWarning;
/** @param {string | Error} _warning @param {{ code?: string }} [options] */
function recordWarning(_warning, options) {
  warnings.push(options?.code);
}
process.emitWarning = /** @type {typeof process.emitWarning} */ (recordWarning);

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

assert.deepEqual(Object.keys(esm).sort(), [...NAMES].sort(), "esm: los nombres");
assert.deepEqual(Object.keys(cjs).sort(), [...NAMES].sort(), "cjs: los nombres");
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
  // Los alias de la 1.1.0 son los mismos objetos que los de Raya Connect; client.checkout avisa
  // una vez (cada formato es una copia, con sus propios avisos).
  assert.equal(sdk.Checkout, sdk.ConnectOrder, `${format}: Checkout`);
  const before = warnings.length;
  assert.equal(client.checkout, client.connect, `${format}: client.checkout`);
  assert.equal(client.checkout.orders, client.connect.orders, `${format}: client.checkout.orders`);
  assert.deepEqual(warnings.slice(before), ["RAYACASH_DEP_CHECKOUT"], `${format}: el aviso`);
  // Y desde JavaScript se puede reasignar, como en la 1.1.0: queda como propiedad propia.
  const mock = { orders: {} };
  /** @type {{ checkout: unknown }} */ (client).checkout = mock;
  assert.equal(client.checkout, mock, `${format}: reasignar client.checkout`);
}
process.emitWarning = emitWarning;
console.log(
  `rayacash ${pkg.version}: ESM y CJS exportan lo mismo (${Object.keys(esm).length} nombres, con ` +
    "los alias de la 1.1.0) y funcionan.",
);
