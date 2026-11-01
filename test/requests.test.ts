// Reintentos, idempotencia y logging del núcleo de requests.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  APIConnectionError,
  APIError,
  AuthenticationError,
  ConflictError,
  config,
  IdempotencyError,
  InvalidRequestError,
  Payment,
  PermissionDeniedError,
  RateLimitError,
  type RayaClient,
  type RayaError,
  UnprocessableEntityError,
} from "../src/index.ts";
import { logSettings } from "../src/util.ts";
import {
  BALANCE,
  PAYMENT_ID,
  PAYMENT_PENDING,
  PAYMENT_REFUNDED,
  TRANSFER_OUTBOUND_PENDING,
} from "./fixtures.ts";
import {
  captureStderr,
  isolate,
  MockAPI,
  networkError,
  rejection,
  TEST_KEY,
  timeoutError,
} from "./helpers.ts";

const state = isolate();

async function createPayment(client: RayaClient, idempotencyKey?: string): Promise<Payment> {
  const options = idempotencyKey === undefined ? {} : { idempotencyKey };
  const result = await client.payments.create({ amount: 15000 }, options);
  assert.ok(result instanceof Payment);
  return result;
}

test("los reintentos usan la misma Idempotency-Key", async () => {
  const api = new MockAPI();
  api.addError(503, "TEMPORARILY_UNAVAILABLE", undefined, null, {
    headers: { "Retry-After": "5" },
  });
  api.addError(500, "INTERNAL_ERROR");
  api.add(201, PAYMENT_PENDING);
  const payment = await createPayment(api.client());
  const keys = new Set(api.requests.map((request) => request.headers.get("idempotency-key")));
  assert.equal(api.requests.length, 3);
  assert.equal(keys.size, 1);
  assert.equal(payment.lastResponse?.idempotencyKey, [...keys][0]);
  assert.deepEqual(state.sleeps, [5, 1]); // Retry-After y después el backoff (jitter en el máximo)
});

test("se rinde después de maxNetworkRetries", async () => {
  const api = new MockAPI();
  for (let i = 0; i < 3; i += 1) api.addError(500, "INTERNAL_ERROR");
  const error = await rejection(createPayment(api.client(), "pedido-1"));
  assert.ok(error instanceof APIError);
  assert.equal(api.requests.length, 3);
  assert.deepEqual(state.sleeps, [0.5, 1]);
  assert.equal(error.code, "INTERNAL_ERROR");
  assert.equal(error.idempotencyKey, "pedido-1");
});

const NOT_RETRIED: Array<[number, string, Record<string, string>, typeof APIError]> = [
  [409, "IDEMPOTENCY_KEY_REUSED", {}, IdempotencyError],
  [409, "PAYMENT_NOT_REFUNDABLE", {}, ConflictError],
  [503, "API_UNAVAILABLE", {}, APIError],
  [429, "RATE_LIMITED", { "Retry-After": "120" }, RateLimitError],
  [503, "BANK_UNAVAILABLE", { "Retry-After": "3600" }, APIError],
  [400, "PARAMETER_INVALID", {}, InvalidRequestError],
  [401, "API_KEY_EXPIRED", {}, AuthenticationError],
  [403, "API_NOT_ENABLED", {}, PermissionDeniedError],
  [422, "REFUND_FAILED", {}, UnprocessableEntityError],
];

for (const [status, code, headers, ErrorType] of NOT_RETRIED) {
  test(`no se reintenta: ${status} ${code}`, async () => {
    const api = new MockAPI();
    api.addError(status, code, undefined, null, { headers });
    const error: RayaError = await rejection(api.client().payments.refund(PAYMENT_ID));
    assert.ok(error instanceof ErrorType);
    assert.equal(api.requests.length, 1);
    assert.deepEqual(state.sleeps, []);
    if (headers["Retry-After"]) assert.equal(error.retryAfter, Number(headers["Retry-After"]));
  });
}

const RETRIED: Array<[number, string, Record<string, string>, number]> = [
  [409, "IDEMPOTENCY_KEY_IN_USE", { "Retry-After": "2" }, 2],
  [429, "RATE_LIMITED", { "Retry-After": "7" }, 7],
  [429, "RATE_LIMITED", {}, 0.5],
  [503, "CVU_UNAVAILABLE", { "Retry-After": "5" }, 5],
  [503, "BANK_UNAVAILABLE", {}, 0.5],
  [503, "BANK_UNAVAILABLE", { "Retry-After": "30" }, 30],
];

for (const [status, code, headers, expectedSleep] of RETRIED) {
  test(`se reintenta: ${status} ${code} ${JSON.stringify(headers)}`, async () => {
    const api = new MockAPI();
    api.addError(status, code, undefined, null, { headers });
    api.add(200, PAYMENT_REFUNDED);
    const payment = await api.client().payments.refund(PAYMENT_ID);
    assert.equal(payment.status, "refunded");
    assert.equal(api.requests.length, 2);
    assert.deepEqual(state.sleeps, [expectedSleep]);
  });
}

test("los errores HTML del edge se reintentan", async () => {
  const api = new MockAPI();
  api.add(502, null, {
    text: "<html><body>Bad gateway</body></html>",
    headers: { "Content-Type": "text/html" },
  });
  api.add(200, BALANCE);
  assert.equal((await api.client().balance.retrieve()).available, 152340.5);
  assert.equal(api.requests.length, 2);
});

for (const [label, makeError, code] of [
  ["un corte de red", () => networkError("ECONNRESET"), "NETWORK_ERROR"],
  ["el timeout del intento", timeoutError, "TIMEOUT"],
  ["el timeout de conexión de undici", () => networkError("UND_ERR_CONNECT_TIMEOUT"), "TIMEOUT"],
] as const) {
  test(`se reintenta ${label} (${code}) con la misma clave`, async () => {
    const api = new MockAPI();
    api.failWith(makeError());
    api.add(201, TRANSFER_OUTBOUND_PENDING);
    const transfer = await api
      .client()
      .transfers.create(
        { amount: 25000, destination: "proveedor.ejemplo" },
        { idempotencyKey: "k" },
      );
    assert.equal(transfer.status, "pending");
    assert.deepEqual(
      api.requests.map((request) => request.headers.get("idempotency-key")),
      ["k", "k"],
    );
    assert.deepEqual(state.sleeps, [0.5]);
  });
}

test("el error de conexión después del último reintento", async () => {
  const api = new MockAPI();
  const cause = timeoutError();
  for (let i = 0; i < 3; i += 1) api.failWith(i === 2 ? cause : timeoutError());
  const error = await rejection(
    api
      .client()
      .transfers.create(
        { amount: 25000, destination: "proveedor.ejemplo" },
        { idempotencyKey: "k" },
      ),
  );
  assert.ok(error instanceof APIConnectionError);
  assert.equal(error.code, "TIMEOUT");
  assert.equal(error.shouldRetry, true);
  assert.equal(error.idempotencyKey, "k");
  assert.match(error.message, /misma Idempotency-Key/);
  assert.equal(error.cause, cause);
});

test("los errores de conexión de un GET no tienen idempotency key", async () => {
  const api = new MockAPI();
  for (let i = 0; i < 3; i += 1) api.failWith(networkError());
  const error = await rejection(api.client().balance.retrieve());
  assert.ok(error instanceof APIConnectionError);
  assert.equal(error.code, "NETWORK_ERROR");
  assert.equal(error.idempotencyKey, null);
  assert.match(error.message, /ECONNREFUSED/);
  assert.doesNotMatch(error.message, /Idempotency-Key/);
});

test("un TypeError sin cause (la request está mal) no se reintenta", async () => {
  const api = new MockAPI();
  api.failWith(new TypeError("Headers.append: header inválido"));
  const error = await rejection(api.client().balance.retrieve());
  assert.ok(error instanceof APIConnectionError);
  assert.equal(error.shouldRetry, false);
  assert.equal(api.requests.length, 1);
});

test("cualquier otro error del fetch sale tal cual", async () => {
  const api = new MockAPI();
  const bug = new Error("un bug del fetch propio");
  api.failWith(bug);
  assert.equal(await rejection(api.client().balance.retrieve()), bug);
  assert.equal(api.requests.length, 1);
});

test("maxNetworkRetries por cliente y por request", async () => {
  const api = new MockAPI();
  const client = api.client(TEST_KEY, { maxNetworkRetries: 0 });
  api.addError(500, "INTERNAL_ERROR");
  assert.ok((await rejection(client.balance.retrieve())) instanceof APIError);
  assert.equal(api.requests.length, 1);

  api.addError(500, "INTERNAL_ERROR");
  api.addError(500, "INTERNAL_ERROR");
  api.add(200, BALANCE);
  await client.balance.retrieve({ maxNetworkRetries: 4 });
  assert.equal(api.requests.length, 4);

  const fallback = api.client();
  api.addError(500, "INTERNAL_ERROR");
  assert.ok(
    (await rejection(fallback.balance.retrieve({ maxNetworkRetries: 0 }))) instanceof APIError,
  );
  const error = await rejection(fallback.balance.retrieve({ maxNetworkRetries: -1 }));
  assert.ok(error instanceof RangeError);
  assert.match(error.message, /maxNetworkRetries/);
});

for (const body of ["no es json", "[1, 2]", ""]) {
  test(`un 200 sin un objeto JSON (${JSON.stringify(body)})`, async () => {
    const api = new MockAPI();
    api.add(200, null, { text: body });
    const error = await rejection(api.client().balance.retrieve());
    assert.ok(error instanceof APIError);
    assert.equal(error.code, "INVALID_RESPONSE");
    assert.equal(error.httpStatus, 200);
    assert.equal(api.requests.length, 1);
  });
}

test("los redirects nunca se siguen", async () => {
  const api = new MockAPI();
  api.add(301, null, { text: "", headers: { Location: "https://otro.example/v1/balance" } });
  const error = await rejection(api.client().balance.retrieve());
  assert.ok(error instanceof APIError);
  assert.equal(error.httpStatus, 301);
  assert.equal(api.requests.length, 1);
});

test("un endpoint de lista que no devuelve una lista", async () => {
  const api = new MockAPI();
  api.add(200, BALANCE);
  const error = await rejection(api.client().transfers.list());
  assert.ok(error instanceof APIError);
  assert.match(error.message, /no es una lista/);
});

test("los logs info nunca incluyen la clave ni el body", async () => {
  const api = new MockAPI();
  const client = api.client();
  config.log = "info";
  api.addError(503, "TEMPORARILY_UNAVAILABLE", undefined, null, {
    headers: { "Retry-After": "5" },
  });
  api.add(201, PAYMENT_PENDING);
  const err = await captureStderr(() =>
    client.payments.create(
      { amount: 15000, description: "Pedido secreto" },
      { idempotencyKey: "clave-1" },
    ),
  );
  assert.ok(
    err.includes('message="Request a la API de Raya" method=POST path=/v1/payments attempt=1'),
  );
  assert.ok(err.includes("status=503"));
  assert.ok(err.includes("status=201"));
  assert.ok(err.includes("Reintentando"));
  assert.ok(err.includes("reason=TEMPORARILY_UNAVAILABLE"));
  assert.ok(!err.includes(TEST_KEY));
  assert.ok(!err.includes("Pedido secreto"));
  assert.ok(!err.includes("clave-1")); // la idempotency key solo sale en debug
});

test("los logs debug incluyen la idempotency key y la query", async () => {
  const api = new MockAPI();
  const client = api.client();
  logSettings.env = "debug";
  api.add(201, PAYMENT_PENDING);
  api.add(200, { object: "list", data: [], has_more: false, next_cursor: null });
  const err = await captureStderr(async () => {
    await client.payments.create({ amount: 15000 }, { idempotencyKey: "clave-1" });
    await client.transfers.list({ direction: "inbound", limit: 5 });
  });
  assert.ok(err.includes("idempotency_key=clave-1"));
  assert.ok(
    err.includes('query="direction=inbound&limit=5"') ||
      err.includes("query=direction=inbound&limit=5"),
  );
  assert.ok(!err.includes(TEST_KEY));
});

test("el logging es silencioso por defecto", async () => {
  const api = new MockAPI();
  api.add(200, BALANCE);
  const client = api.client();
  assert.equal(await captureStderr(() => client.balance.retrieve()), "");
});
