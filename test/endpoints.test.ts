// Los 7 endpoints: método, ruta, query, body y headers exactos.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  Balance,
  ListObject,
  NotFoundError,
  Payment,
  type PaymentCreateParams,
  Transfer,
  UnprocessableEntityError,
} from "../src/index.ts";
import {
  BALANCE,
  PAYMENT_ID,
  PAYMENT_PENDING,
  PAYMENT_REFUNDED,
  PAYMENT_SUCCEEDED,
  TRANSFER_INBOUND,
  TRANSFER_LIST,
  TRANSFER_OUTBOUND_PENDING,
} from "./fixtures.ts";
import { isolate, MockAPI, rejection } from "./helpers.ts";

isolate();

const IDEMPOTENCY_KEY = "9b2f6c4e-1d3a-4e8b-a5c7-0f9e8d7c6b5a";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Un decimal exacto como el de decimal.js o Prisma. */
class FakeDecimal {
  readonly #text: string;

  constructor(text: string) {
    this.#text = text;
  }

  toFixed(): string {
    return this.#text;
  }
}

test("balance.retrieve", async () => {
  const api = new MockAPI();
  api.add(200, BALANCE);
  const balance = await api.client().balance.retrieve();
  assert.equal(balance.constructor, Balance);
  assert.equal(balance.available, 152340.5);
  assert.equal(balance.currency, "ARS");
  const request = api.last;
  assert.deepEqual([request.method, request.url.href], ["GET", "https://api.raya.cash/v1/balance"]);
  assert.equal(request.body, undefined);
  assert.equal(request.headers.get("idempotency-key"), null);
  assert.equal(balance.lastResponse?.requestId, "req_test00000000000000000001");
  assert.equal(balance.lastResponse?.httpStatus, 200);
  assert.equal(balance.lastResponse?.idempotencyKey, null);
});

test("transfers.create", async () => {
  const api = new MockAPI();
  api.add(201, TRANSFER_OUTBOUND_PENDING);
  const transfer = await api
    .client()
    .transfers.create(
      { amount: new FakeDecimal("25000.00"), destination: "0000123380736153041182" },
      { idempotencyKey: IDEMPOTENCY_KEY },
    );
  assert.equal(transfer.constructor, Transfer);
  assert.equal(transfer.status, "pending");
  assert.equal(transfer.counterparty.name, "Proveedora Ejemplo S. A.");
  const request = api.last;
  assert.deepEqual(
    [request.method, request.url.href],
    ["POST", "https://api.raya.cash/v1/transfers"],
  );
  assert.equal(request.body, '{"amount":25000,"destination":"0000123380736153041182"}');
  assert.equal(request.headers.get("content-type"), "application/json");
  assert.equal(request.headers.get("idempotency-key"), IDEMPOTENCY_KEY);
  assert.equal(transfer.lastResponse?.idempotencyKey, IDEMPOTENCY_KEY);
});

for (const [amount, expected] of [
  [25000.5, "25000.5"],
  ["25000.50", "25000.5"],
  [1, "1"],
  [25000n, "25000"],
] as const) {
  test(`transfers.create con el monto ${String(amount)}`, async () => {
    const api = new MockAPI();
    api.add(201, TRANSFER_OUTBOUND_PENDING);
    await api
      .client()
      .transfers.create({ amount, destination: "proveedor.ejemplo" }, { idempotencyKey: "k" });
    assert.equal(api.last.body, `{"amount":${expected},"destination":"proveedor.ejemplo"}`);
  });
}

test("transfers.create exige la idempotencyKey y valida antes de mandar", async () => {
  const api = new MockAPI();
  const transfers = api.client().transfers;
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const untyped = transfers as any;
  let error = await rejection(untyped.create({ amount: 1, destination: "x" }));
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /idempotencyKey/);
  error = await rejection(
    untyped.create({ amount: 1, destination: "x" }, { idempotencyKey: null }),
  );
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /idempotencyKey/);
  error = await rejection(
    transfers.create({ amount: 1, destination: "x" }, { idempotencyKey: "con espacios" }),
  );
  assert.ok(error instanceof RangeError);
  assert.match(error.message, /idempotencyKey/);
  error = await rejection(untyped.create({ amount: 1, destination: 123 }, { idempotencyKey: "k" }));
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /destination/);
  error = await rejection(
    untyped.create({ amount: true, destination: "x" }, { idempotencyKey: "k" }),
  );
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /amount/);
  error = await rejection(
    untyped.create({ amount: 1, destination: "x", idempotencyKey: "k" }, { idempotencyKey: "k" }),
  );
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /va en las opciones/);
  assert.deepEqual(api.requests, []);
});

test("transfers.retrieve", async () => {
  const api = new MockAPI();
  api.add(200, TRANSFER_INBOUND);
  const transfer = await api.client().transfers.retrieve(TRANSFER_INBOUND.id);
  assert.equal(transfer.constructor, Transfer);
  assert.equal(transfer.direction, "inbound");
  assert.equal(transfer.net_amount, 48169.59);
  assert.deepEqual(
    [api.last.method, api.last.url.pathname],
    ["GET", `/v1/transfers/${TRANSFER_INBOUND.id}`],
  );
});

test("los ids se codifican y nunca van vacíos", async () => {
  const api = new MockAPI();
  const client = api.client();
  api.add(404, { error: { code: "TRANSFER_NOT_FOUND", message: "x", data: null } });
  assert.ok((await rejection(client.transfers.retrieve("../balance"))) instanceof NotFoundError);
  assert.equal(api.last.url.pathname, "/v1/transfers/..%2Fbalance");
  let error = await rejection(client.transfers.retrieve(""));
  assert.ok(error instanceof RangeError);
  assert.match(error.message, /transferId/);
  error = await rejection(client.payments.refund(" "));
  assert.ok(error instanceof RangeError);
  assert.match(error.message, /paymentId/);
  assert.equal(api.requests.length, 1);
});

test("un id «.» o «..» falla sin mandar nada", async () => {
  const api = new MockAPI();
  const client = api.client();
  const calls: Array<[() => Promise<unknown>, string]> = [
    [() => client.transfers.retrieve("."), "transferId"],
    [() => client.transfers.retrieve(".."), "transferId"],
    [() => client.payments.retrieve("."), "paymentId"],
    [() => client.payments.retrieve(".."), "paymentId"],
    [() => client.payments.refund(".."), "paymentId"],
  ];
  for (const [call, name] of calls) {
    const error = await rejection(call());
    assert.ok(error instanceof RangeError);
    assert.equal(error.message, `${name} no puede ser "." ni "..".`);
  }
  assert.deepEqual(api.requests, []);
});

test("transfers.list", async () => {
  const api = new MockAPI();
  api.add(200, TRANSFER_LIST);
  const page = await api.client().transfers.list({
    direction: "inbound",
    created_gte: new Date(Date.UTC(2026, 9, 23, 3)),
    created_lt: "2026-10-24T00:00:00-03:00",
    limit: 2,
  });
  assert.equal(page.constructor, ListObject);
  assert.deepEqual(
    [...page].map((transfer) => transfer.constructor),
    [Transfer, Transfer],
  );
  assert.equal(page.has_more, true);
  const request = api.last;
  assert.deepEqual([request.method, request.url.pathname], ["GET", "/v1/transfers"]);
  assert.deepEqual(Object.fromEntries(request.url.searchParams), {
    direction: "inbound",
    created_gte: "2026-10-23T03:00:00.000Z",
    created_lt: "2026-10-24T00:00:00-03:00",
    limit: "2",
  });
  // El "+" de un offset viaja codificado: si no, el servidor lo leería como un espacio.
  api.add(200, { ...TRANSFER_LIST, has_more: false, next_cursor: null });
  await api.client().transfers.list({ created_gte: "2026-10-23T00:00:00+00:00" });
  assert.match(api.last.url.search, /created_gte=2026-10-23T00%3A00%3A00%2B00%3A00/);
});

test("transfers.list sin filtros", async () => {
  const api = new MockAPI();
  api.add(200, { ...TRANSFER_LIST, has_more: false, next_cursor: null });
  await api.client().transfers.list();
  assert.equal(api.last.url.href, "https://api.raya.cash/v1/transfers");
});

test("payments.create", async () => {
  const api = new MockAPI();
  api.add(201, PAYMENT_PENDING);
  const payment = await api.client().payments.create({
    amount: 15000,
    description: "Pedido #1042",
    external_reference: "pedido-1042",
    return_url: "https://tienda.example.com/pedidos/1042",
    metadata: { cliente_id: "8812" },
  });
  assert.equal(payment.constructor, Payment);
  assert.equal(payment.bank_transfer.cvu, "0000123322813466534007");
  assert.ok(payment.checkout_url.endsWith(PAYMENT_ID));
  const request = api.last;
  assert.deepEqual([request.method, request.url.pathname], ["POST", "/v1/payments"]);
  assert.deepEqual(api.lastJson(), {
    amount: 15000,
    description: "Pedido #1042",
    external_reference: "pedido-1042",
    return_url: "https://tienda.example.com/pedidos/1042",
    metadata: { cliente_id: "8812" },
  });
  // Sin clave propia, generamos un UUID v4 para esta llamada.
  assert.match(request.headers.get("idempotency-key") ?? "", UUID_V4);
});

test("sin clave propia, cada llamada genera la suya", async () => {
  const api = new MockAPI();
  const client = api.client();
  api.add(201, PAYMENT_PENDING);
  api.add(201, PAYMENT_PENDING);
  api.add(200, PAYMENT_REFUNDED);
  api.add(200, PAYMENT_REFUNDED);
  const results = [
    await client.payments.create({ amount: 15000 }),
    await client.payments.create({ amount: 15000 }),
    await client.payments.refund(PAYMENT_ID),
    await client.payments.refund(PAYMENT_ID),
  ];
  const keys = api.requests.map((request) => request.headers.get("idempotency-key") ?? "");
  for (const key of keys) assert.match(key, UUID_V4);
  assert.equal(new Set(keys).size, 4);
  assert.deepEqual(
    results.map((payment) => payment.lastResponse?.idempotencyKey),
    keys,
  );
});

test("payments.create manda solo lo que pasás", async () => {
  const api = new MockAPI();
  const client = api.client();
  api.add(201, PAYMENT_PENDING);
  await client.payments.create(
    { amount: new FakeDecimal("15000.50"), description: undefined, return_url: null },
    { idempotencyKey: "pedido-1042-pago" },
  );
  assert.equal(api.last.body, '{"amount":15000.5}');
  assert.equal(api.last.headers.get("idempotency-key"), "pedido-1042-pago");
  const badParams = { amount: 1, metadata: [["a", "b"]] } as unknown as PaymentCreateParams;
  const error = await rejection(client.payments.create(badParams));
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /metadata/);
  assert.equal(api.requests.length, 1);
});

test("payments.retrieve", async () => {
  const api = new MockAPI();
  api.add(200, PAYMENT_SUCCEEDED);
  const payment = await api.client().payments.retrieve(PAYMENT_ID);
  assert.equal(payment.status, "succeeded");
  assert.equal(payment.payer?.account, "0000123300602983525937");
  assert.deepEqual([api.last.method, api.last.url.pathname], ["GET", `/v1/payments/${PAYMENT_ID}`]);
});

test("payments.refund", async () => {
  const api = new MockAPI();
  api.add(200, PAYMENT_REFUNDED);
  const payment = await api.client().payments.refund(PAYMENT_ID, { idempotencyKey: "reembolso-1" });
  assert.equal(payment.status, "refunded");
  const request = api.last;
  assert.deepEqual(
    [request.method, request.url.pathname],
    ["POST", `/v1/payments/${PAYMENT_ID}/refund`],
  );
  assert.equal(request.body, undefined); // el reembolso va sin body
  assert.equal(request.headers.get("content-type"), null);
  assert.equal(request.headers.get("idempotency-key"), "reembolso-1");
});

test("los errores traen el request id", async () => {
  const api = new MockAPI();
  api.addError(422, "INSUFFICIENT_BALANCE", "El monto supera tu saldo disponible.");
  const error = await rejection(
    api
      .client()
      .transfers.create({ amount: 10 ** 9, destination: "alias.prueba" }, { idempotencyKey: "k" }),
  );
  assert.ok(error instanceof UnprocessableEntityError);
  assert.equal(error.code, "INSUFFICIENT_BALANCE");
  assert.equal(error.requestId, "req_test00000000000000000001");
  assert.equal(error.idempotencyKey, "k");
  assert.equal(api.requests.length, 1); // los 4xx no se reintentan
});
