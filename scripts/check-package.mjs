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
// ConnectOrder, hasta la 2.0.0) más ConnectOrder, ConnectPayout, IdentityVerification e
// IdentityVerificationFiles (1.2.0), las clases de Raya PSP: PspBalance, PspCustomer,
// PspCustomerBalance, PspDocumentRequest y PspTransfer (1.3.0), e Invoice, del Facturador (1.4.0).
// Sacar un nombre rompe el código de alguien.
const NAMES = [
  "APIConnectionError",
  "APIError",
  "AuthenticationError",
  "Balance",
  "Checkout",
  "ConflictError",
  "ConnectOrder",
  "ConnectPayout",
  "DEFAULT_API_BASE",
  "Event",
  "IdempotencyError",
  "IdentityVerification",
  "IdentityVerificationFiles",
  "InvalidRequestError",
  "Invoice",
  "ListObject",
  "NotFoundError",
  "OAuth",
  "OAuthToken",
  "Payment",
  "PermissionDeniedError",
  "PspBalance",
  "PspCustomer",
  "PspCustomerBalance",
  "PspDocumentRequest",
  "PspTransfer",
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

// Identidad: client.identity llega a dist y su respuesta se hidrata como IdentityVerification.
/** @param {string} url @param {RequestInit} init */
async function identityFetch(url, init) {
  assert.equal(url, "https://api.raya.cash/v1/identity/verifications/idv_check");
  assert.equal(init.method, "GET");
  const verification = { id: "idv_check", object: "identity.verification", status: "pending" };
  return new Response(JSON.stringify(verification), {
    status: 200,
    headers: { "Raya-Request-Id": "req_check_identity" },
  });
}

// Raya PSP: client.psp llega a dist y su respuesta se hidrata como PspCustomer (el object con el
// punto, como los de Identidad).
/** @param {string} url @param {RequestInit} init */
async function pspFetch(url, init) {
  assert.equal(url, "https://api.raya.cash/v1/psp/customers/pspc_check/block");
  assert.equal(init.method, "POST");
  assert.equal(init.body, undefined);
  const customer = { id: "pspc_check", object: "psp.customer", status: "blocked" };
  return new Response(JSON.stringify(customer), {
    status: 200,
    headers: { "Raya-Request-Id": "req_check_psp" },
  });
}

// Facturador: client.invoices llega a dist, crear manda el body en el orden de la API con la
// idempotencyKey obligatoria, y la respuesta (202) se hidrata como Invoice.
/** @param {string} url @param {RequestInit} init */
async function invoiceFetch(url, init) {
  assert.equal(url, "https://api.raya.cash/v1/invoices");
  assert.equal(init.method, "POST");
  assert.equal(init.body, '{"dni":"12345678","amount":15000}');
  assert.equal(new Headers(init.headers).get("idempotency-key"), "factura-check");
  const invoice = { id: "inv_check", object: "invoice", status: "pending" };
  return new Response(JSON.stringify(invoice), {
    status: 202,
    headers: { "Raya-Request-Id": "req_check_invoice" },
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
  const identity = new sdk.RayaClient(KEY, { fetch: identityFetch }).identity;
  const verification = await identity.verifications.retrieve("idv_check");
  assert.ok(verification instanceof sdk.IdentityVerification, `${format}: IdentityVerification`);
  assert.equal(verification.lastResponse?.requestId, "req_check_identity");
  const psp = new sdk.RayaClient(KEY, { fetch: pspFetch }).psp;
  const customer = await psp.customers.block("pspc_check");
  assert.ok(customer instanceof sdk.PspCustomer, `${format}: PspCustomer`);
  assert.equal(customer.lastResponse?.requestId, "req_check_psp");
  const invoices = new sdk.RayaClient(KEY, { fetch: invoiceFetch }).invoices;
  const invoice = await invoices.create(
    { dni: "12345678", amount: 15000 },
    { idempotencyKey: "factura-check" },
  );
  assert.ok(invoice instanceof sdk.Invoice, `${format}: Invoice`);
  assert.equal(invoice.lastResponse?.httpStatus, 202);
  assert.equal(invoice.lastResponse?.requestId, "req_check_invoice");
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
