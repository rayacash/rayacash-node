// Los 21 endpoints: método, ruta, query, body y headers exactos.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  APIConnectionError,
  AuthenticationError,
  Balance,
  ConflictError,
  ConnectOrder,
  type ConnectOrderCreateParams,
  ConnectPayout,
  IdempotencyError,
  IdentityVerification,
  IdentityVerificationFiles,
  InvalidRequestError,
  ListObject,
  NotFoundError,
  OAuthToken,
  Payment,
  type PaymentCreateParams,
  type PaymentSimulateTransferParams,
  PermissionDeniedError,
  RateLimitError,
  Transfer,
  UnprocessableEntityError,
  User,
} from "../src/index.ts";
import {
  ACCESS_TOKEN,
  BALANCE,
  BIOMETRIC_VERIFICATION_ID,
  CLIENT_ID,
  CLIENT_SECRET,
  EVENT_VERIFICATION_VERIFIED,
  NOTIFICATION_URL,
  OAUTH_CODE,
  OAUTH_TOKEN,
  ORDER_BACK_URLS,
  ORDER_ID,
  ORDER_ITEMS,
  ORDER_PENDING,
  ORDER_REFUNDED,
  ORDER_SUCCEEDED,
  PAYMENT_ID,
  PAYMENT_PENDING,
  PAYMENT_REFUNDED,
  PAYMENT_SUCCEEDED,
  PAYOUT_COMPLETED,
  PAYOUT_DESTINATION,
  PAYOUT_ID,
  PAYOUT_LIST,
  PAYOUT_PENDING,
  REDIRECT_URI,
  SANDBOX_ORDER_ID,
  SANDBOX_ORDER_SUCCEEDED,
  SANDBOX_PAYER,
  SANDBOX_PAYMENT_FAILED,
  SANDBOX_PAYMENT_ID,
  SANDBOX_PAYMENT_PENDING,
  SANDBOX_PAYMENT_SUCCEEDED,
  SANDBOX_SECRET_KEY,
  SANDBOX_TEST_USER_ID,
  TRANSFER_INBOUND,
  TRANSFER_LIST,
  TRANSFER_OUTBOUND_PENDING,
  USER,
  USER_ID,
  VERIFICATION_BIOMETRIC_VERIFIED,
  VERIFICATION_CANCELED,
  VERIFICATION_DECLINED,
  VERIFICATION_FILES,
  VERIFICATION_ID,
  VERIFICATION_LIST,
  VERIFICATION_PENDING,
  VERIFICATION_VERIFIED,
} from "./fixtures.ts";
import { isolate, MockAPI, networkError, OTHER_KEY, rejection, TEST_KEY } from "./helpers.ts";

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
    [() => client.users.retrieve("."), "userId"],
    [() => client.connect.orders.retrieve(".."), "orderId"],
    [() => client.connect.orders.refund("."), "orderId"],
    [() => client.connect.payouts.retrieve("."), "payoutId"],
    [() => client.connect.payouts.retrieve(".."), "payoutId"],
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

// --- Raya Connect -----------------------------------------------------------------------------

const TOKEN_PARAMS = {
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
  code: OAUTH_CODE,
  redirect_uri: REDIRECT_URI,
};

const ORDER_PARAMS: ConnectOrderCreateParams = {
  items: ORDER_ITEMS,
  fee: 500,
  external_reference: "pedido-1042",
  back_urls: ORDER_BACK_URLS,
  auto_return: "approved",
  notification_url: NOTIFICATION_URL,
  metadata: { pedido_id: "1042" },
};

test("oauth.token", async () => {
  const api = new MockAPI();
  api.add(200, OAUTH_TOKEN);
  // Sin clave: la app se identifica con client_id y client_secret.
  const token = await api.client(null).oauth.token(TOKEN_PARAMS);
  assert.equal(token.constructor, OAuthToken);
  assert.equal(token.access_token, ACCESS_TOKEN);
  assert.equal(token.user_id, USER_ID);
  assert.equal(token.scope, "orders profile");
  assert.equal(token.expires_in, null);
  assert.equal(token.refresh_token, null);
  const request = api.last;
  assert.deepEqual(
    [request.method, request.url.href],
    ["POST", "https://api.raya.cash/v1/oauth/token"],
  );
  assert.equal(request.headers.get("authorization"), null);
  assert.equal(request.headers.get("content-type"), "application/json");
  // El SDK pone grant_type solo.
  assert.deepEqual(api.lastJson(), { ...TOKEN_PARAMS, grant_type: "authorization_code" });
  // Y sin Idempotency-Key: el code se canjea una sola vez y el servidor no la usa ahí.
  assert.equal(request.headers.get("idempotency-key"), null);
  assert.equal(token.lastResponse?.idempotencyKey, null);
  assert.equal(token.lastResponse?.requestId, "req_test00000000000000000001");
});

test("oauth.token nunca manda la clave del cliente ni una Idempotency-Key", async () => {
  const api = new MockAPI();
  api.add(200, OAUTH_TOKEN);
  // Con la clave en el cliente y con las opciones que sí acepta: igual no va Authorization.
  await api.client().oauth.token(TOKEN_PARAMS, { timeout: 5_000, maxNetworkRetries: 0 });
  assert.equal(api.last.headers.get("authorization"), null);
  assert.equal(api.last.headers.get("idempotency-key"), null);
  assert.deepEqual([...api.last.headers.keys()].sort(), ["accept", "content-type", "user-agent"]);
});

test("oauth.token valida antes de mandar", async () => {
  const api = new MockAPI();
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const untyped = api.client(null).oauth as any;
  let error = await rejection(untyped.token({ ...TOKEN_PARAMS, client_id: 7650337728110670 }));
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /^client_id tiene que ser un string, no number \(.*entre comillas/);
  const { redirect_uri: _omitted, ...withoutRedirect } = TOKEN_PARAMS;
  error = await rejection(untyped.token(withoutRedirect));
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /^redirect_uri tiene que ser un string, no undefined/);
  error = await rejection(untyped.token({ ...TOKEN_PARAMS, grant_type: "authorization_code" }));
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /oauth.token no acepta "grant_type"/);
  error = await rejection(untyped.token(TOKEN_PARAMS, { apiKey: ACCESS_TOKEN }));
  assert.ok(error instanceof RangeError);
  assert.match(error.message, /oauth.token no acepta apiKey/);
  // Tampoco lleva Idempotency-Key: pasarla es un error, como pasar apiKey.
  error = await rejection(untyped.token(TOKEN_PARAMS, { idempotencyKey: "canje-1" }));
  assert.ok(error instanceof RangeError);
  assert.equal(
    error.message,
    "oauth.token no acepta idempotencyKey en las opciones: no lleva Idempotency-Key, el code se " +
      "canjea una sola vez.",
  );
  error = await rejection(untyped.token(TOKEN_PARAMS, { idempotency_key: "canje-1" }));
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /¿quisiste decir idempotencyKey\?/);
  error = await rejection(untyped.token(OAUTH_CODE));
  assert.ok(error instanceof TypeError);
  assert.deepEqual(api.requests, []);
});

test("oauth.token: los errores del canje", async () => {
  const api = new MockAPI();
  const oauth = api.client(null).oauth;
  api.addError(401, "OAUTH_CLIENT_INVALID", "El client_id o el client_secret no son válidos.");
  let error = await rejection(oauth.token(TOKEN_PARAMS));
  assert.ok(error instanceof AuthenticationError);
  assert.equal(error.code, "OAUTH_CLIENT_INVALID");
  assert.equal(error.httpStatus, 401);
  assert.equal(error.idempotencyKey, null); // la request no llevó ninguna
  api.addError(400, "OAUTH_GRANT_INVALID");
  error = await rejection(oauth.token(TOKEN_PARAMS));
  assert.ok(error instanceof InvalidRequestError);
  assert.equal(error.code, "OAUTH_GRANT_INVALID");
  assert.equal(error.idempotencyKey, null);
  assert.equal(api.requests.length, 2); // los 4xx no se reintentan
});

test("users.retrieve con el access_token", async () => {
  const api = new MockAPI();
  api.add(200, USER);
  const user = await api.client(ACCESS_TOKEN).users.retrieve(USER_ID);
  assert.equal(user.constructor, User);
  assert.equal(user.type, "personal");
  assert.equal(user.identification?.number, "34567890");
  assert.equal(user.address?.city, "Rosario");
  assert.equal(user.business, null);
  assert.equal(user.merchant?.name, "Almacén Ejemplo");
  const request = api.last;
  assert.deepEqual([request.method, request.url.pathname], ["GET", `/v1/users/${USER_ID}`]);
  assert.equal(request.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(request.headers.get("idempotency-key"), null);
  api.add(200, USER);
  await api.client(ACCESS_TOKEN).users.retrieve("me");
  assert.equal(api.last.url.pathname, "/v1/users/me");
});

test("users.retrieve de otra cuenta da USER_NOT_FOUND", async () => {
  const api = new MockAPI();
  api.addError(404, "USER_NOT_FOUND");
  const error = await rejection(api.client(ACCESS_TOKEN).users.retrieve(PAYMENT_ID));
  assert.ok(error instanceof NotFoundError);
  assert.equal(error.code, "USER_NOT_FOUND");
});

test("connect.orders.create", async () => {
  const api = new MockAPI();
  api.add(201, ORDER_PENDING);
  const order = await api.client(ACCESS_TOKEN).connect.orders.create(ORDER_PARAMS);
  assert.equal(order.constructor, ConnectOrder);
  assert.equal(order.status, "pending");
  assert.equal(order.fee, 500);
  assert.equal(order.net_amount, 44500);
  assert.equal(order.account, USER_ID);
  assert.equal(order.items[0]?.unit_price, 45000);
  assert.equal(order.bank_transfer.cvu, "0000123390456538582824");
  assert.ok(order.checkout_url.endsWith(ORDER_ID));
  const request = api.last;
  assert.deepEqual([request.method, request.url.pathname], ["POST", "/v1/connect/orders"]);
  assert.equal(request.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.deepEqual(api.lastJson(), {
    items: [{ title: "Pedido 1042", quantity: 1, unit_price: 45000 }],
    fee: 500,
    external_reference: "pedido-1042",
    metadata: { pedido_id: "1042" },
    back_urls: ORDER_BACK_URLS,
    auto_return: "approved",
    notification_url: NOTIFICATION_URL,
  });
  // Sin clave propia, generamos un UUID v4 para esta llamada.
  const key = request.headers.get("idempotency-key") ?? "";
  assert.match(key, UUID_V4);
  assert.equal(order.lastResponse?.idempotencyKey, key);
});

test("connect.orders.create manda los montos exactos y solo lo que pasás", async () => {
  const api = new MockAPI();
  api.add(201, ORDER_PENDING);
  await api.client(ACCESS_TOKEN).connect.orders.create(
    {
      items: [
        { title: "Remera", quantity: 2, unit_price: new FakeDecimal("22500.50") },
        { title: "Envio", quantity: 1, unit_price: "1500.00" },
      ],
      fee: "500.00",
      description: undefined,
      external_reference: null,
      back_urls: { success: null },
      expires_in: 3600,
    },
    { idempotencyKey: "pedido-1042-pago" },
  );
  assert.equal(
    api.last.body,
    '{"items":[{"title":"Remera","quantity":2,"unit_price":22500.5},' +
      '{"title":"Envio","quantity":1,"unit_price":1500}],"fee":500,"expires_in":3600}',
  );
  assert.equal(api.last.headers.get("idempotency-key"), "pedido-1042-pago");
});

const ORDER_INVALID: Array<
  [Record<string, unknown>, typeof TypeError | typeof RangeError, RegExp]
> = [
  [{}, TypeError, /^items tiene que ser una lista de ítems/],
  [{ items: ORDER_ITEMS[0] }, TypeError, /^items tiene que ser una lista de ítems/],
  [{ items: ["Pedido 1042"] }, TypeError, /^items\[0\] tiene que ser un objeto/],
  [{ items: [{ ...ORDER_ITEMS[0], price: 1 }] }, TypeError, /^items\[0\] no acepta "price"/],
  [{ items: [{ ...ORDER_ITEMS[0], unit_price: true }] }, TypeError, /^items\[0\]\.unit_price/],
  [{ items: [{ ...ORDER_ITEMS[0], unit_price: "mil" }] }, RangeError, /^items\[0\]\.unit_price/],
  [{ items: ORDER_ITEMS, fee: "mil" }, RangeError, /^fee/],
  [{ items: ORDER_ITEMS, fee: false }, TypeError, /^fee/],
  [{ items: ORDER_ITEMS, back_urls: "https://tienda.example.com" }, TypeError, /^back_urls/],
  [
    { items: ORDER_ITEMS, back_urls: { cancel: "https://tienda.example.com" } },
    TypeError,
    /^back_urls no acepta "cancel"/,
  ],
  [{ items: ORDER_ITEMS, metadata: "pedido 1042" }, TypeError, /^metadata/],
  [{ items: ORDER_ITEMS, marketplace_fee: 500 }, TypeError, /no acepta "marketplace_fee"/],
];

for (const [params, ErrorType, message] of ORDER_INVALID) {
  test(`connect.orders.create valida antes de mandar: ${JSON.stringify(params)}`, async () => {
    const api = new MockAPI();
    // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
    const untyped = api.client(ACCESS_TOKEN).connect.orders as any;
    const error = await rejection(untyped.create(params));
    assert.equal(error.constructor, ErrorType);
    assert.match(error.message, message);
    assert.deepEqual(api.requests, []);
  });
}

test("connect.orders.create: la idempotencyKey va en las opciones", async () => {
  const api = new MockAPI();
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const untyped = api.client(ACCESS_TOKEN).connect.orders as any;
  let error = await rejection(untyped.create({ items: ORDER_ITEMS, idempotencyKey: "k" }));
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /va en las opciones/);
  error = await rejection(untyped.create({ items: ORDER_ITEMS }, { idempotency_key: "k" }));
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /¿quisiste decir idempotencyKey\?/);
  assert.deepEqual(api.requests, []);
});

test("connect.orders.retrieve", async () => {
  const api = new MockAPI();
  api.add(200, ORDER_SUCCEEDED);
  const order = await api.client(ACCESS_TOKEN).connect.orders.retrieve(ORDER_ID);
  assert.equal(order.status, "succeeded");
  assert.equal(order.amount_received, 45000);
  assert.equal(order.payer?.account, "0000123300602983525937");
  assert.deepEqual(
    [api.last.method, api.last.url.pathname],
    ["GET", `/v1/connect/orders/${ORDER_ID}`],
  );
  api.addError(404, "ORDER_NOT_FOUND", "No encontramos ese pago.");
  const error = await rejection(api.client(ACCESS_TOKEN).connect.orders.retrieve(PAYMENT_ID));
  assert.ok(error instanceof NotFoundError);
  assert.equal(error.code, "ORDER_NOT_FOUND");
});

test("connect.orders.refund", async () => {
  const api = new MockAPI();
  api.add(200, ORDER_REFUNDED);
  const order = await api
    .client(ACCESS_TOKEN)
    .connect.orders.refund(ORDER_ID, { idempotencyKey: "reembolso-1" });
  assert.equal(order.status, "refunded");
  assert.equal(order.refunded_at, "2026-10-24T17:20:00Z");
  const request = api.last;
  assert.deepEqual(
    [request.method, request.url.pathname],
    ["POST", `/v1/connect/orders/${ORDER_ID}/refund`],
  );
  assert.equal(request.body, undefined); // el reembolso va sin body
  assert.equal(request.headers.get("content-type"), null);
  assert.equal(request.headers.get("idempotency-key"), "reembolso-1");
});

test("los errores de la cuenta conectada", async () => {
  const api = new MockAPI();
  const client = api.client(ACCESS_TOKEN);
  api.addError(401, "ACCESS_TOKEN_REVOKED");
  let error = await rejection(client.connect.orders.create(ORDER_PARAMS));
  assert.ok(error instanceof AuthenticationError);
  assert.equal(error.code, "ACCESS_TOKEN_REVOKED");
  api.addError(403, "CONNECTED_ACCOUNT_LOCKED", undefined, { reason: "kyc_required" });
  error = await rejection(client.connect.orders.create(ORDER_PARAMS));
  assert.ok(error instanceof PermissionDeniedError);
  assert.deepEqual(error.data, { reason: "kyc_required" });
  api.addError(403, "CONNECTED_ACCOUNT_NOT_CONFIGURED");
  error = await rejection(client.connect.orders.create(ORDER_PARAMS));
  assert.ok(error instanceof PermissionDeniedError);
  assert.equal(error.code, "CONNECTED_ACCOUNT_NOT_CONFIGURED");
  assert.equal(api.requests.length, 3); // los 4xx no se reintentan
});

// --- Raya Connect: payouts --------------------------------------------------------------------

const PAYOUT_PARAMS = { amount: 60000, destination: PAYOUT_DESTINATION };
const ORIGIN_UNAVAILABLE_MESSAGE =
  "Para enviar payouts, primero configurá el descriptor del comercio en Configuración › Negocio.";

test("connect.payouts.create", async () => {
  const api = new MockAPI();
  api.add(201, PAYOUT_PENDING);
  const payout = await api
    .client()
    .connect.payouts.create(
      { amount: new FakeDecimal("60000.00"), destination: PAYOUT_DESTINATION },
      { idempotencyKey: IDEMPOTENCY_KEY },
    );
  assert.equal(payout.constructor, ConnectPayout);
  assert.equal(payout.object, "connect.payout");
  assert.equal(payout.status, "pending");
  assert.equal(payout.amount, 60000);
  assert.equal(payout.processing_fee, 870.25);
  assert.equal(payout.net_amount, 59129.75);
  assert.equal(payout.origin.name, "Tienda Ejemplo");
  assert.equal(payout.counterparty.tax_id, "20345678902");
  assert.equal(payout.reference, null);
  const request = api.last;
  assert.deepEqual(
    [request.method, request.url.href],
    ["POST", "https://api.raya.cash/v1/connect/payouts"],
  );
  // Solo amount y destination, y con la clave secreta: no lleva un access_token.
  assert.equal(request.body, `{"amount":60000,"destination":"${PAYOUT_DESTINATION}"}`);
  assert.equal(request.headers.get("content-type"), "application/json");
  assert.equal(request.headers.get("idempotency-key"), IDEMPOTENCY_KEY);
  assert.equal(request.headers.get("authorization"), `Bearer ${TEST_KEY}`);
  assert.equal(payout.lastResponse?.idempotencyKey, IDEMPOTENCY_KEY);
});

for (const [amount, expected] of [
  [60000.5, "60000.5"],
  ["60000.50", "60000.5"],
  [1, "1"],
  [60000n, "60000"],
] as const) {
  test(`connect.payouts.create con el monto ${String(amount)}`, async () => {
    const api = new MockAPI();
    api.add(201, PAYOUT_PENDING);
    await api
      .client()
      .connect.payouts.create({ amount, destination: "ana.ejemplo" }, { idempotencyKey: "k" });
    assert.equal(api.last.body, `{"amount":${expected},"destination":"ana.ejemplo"}`);
  });
}

test("connect.payouts.create exige la idempotencyKey y valida antes de mandar", async () => {
  const api = new MockAPI();
  const payouts = api.client().connect.payouts;
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const untyped = payouts as any;
  let error = await rejection(untyped.create(PAYOUT_PARAMS));
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /^connect\.payouts\.create necesita idempotencyKey/);
  error = await rejection(untyped.create(PAYOUT_PARAMS, { idempotencyKey: null }));
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /idempotencyKey/);
  error = await rejection(payouts.create(PAYOUT_PARAMS, { idempotencyKey: "con espacios" }));
  assert.ok(error instanceof RangeError);
  assert.match(error.message, /idempotencyKey/);
  error = await rejection(untyped.create({ amount: 1, destination: 123 }, { idempotencyKey: "k" }));
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /destination/);
  error = await rejection(untyped.create({ destination: "x" }, { idempotencyKey: "k" }));
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /amount/);
  error = await rejection(
    untyped.create({ amount: true, destination: "x" }, { idempotencyKey: "k" }),
  );
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /amount/);
  error = await rejection(
    untyped.create({ ...PAYOUT_PARAMS, idempotencyKey: "k" }, { idempotencyKey: "k" }),
  );
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /va en las opciones/);
  assert.deepEqual(api.requests, []);
});

for (const field of ["external_reference", "description", "metadata"]) {
  test(`connect.payouts.create no acepta ${field}: el body es amount y destination`, async () => {
    const api = new MockAPI();
    // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
    const untyped = api.client().connect.payouts as any;
    const error = await rejection(
      untyped.create({ ...PAYOUT_PARAMS, [field]: "x" }, { idempotencyKey: "k" }),
    );
    assert.ok(error instanceof TypeError);
    assert.equal(
      error.message,
      `connect.payouts.create no acepta "${field}": los parámetros son amount y destination.`,
    );
    assert.deepEqual(api.requests, []);
  });
}

test("connect.payouts.create reintenta con la misma Idempotency-Key y el mismo body", async () => {
  const api = new MockAPI();
  api.addError(503, "TEMPORARILY_UNAVAILABLE");
  api.add(201, PAYOUT_PENDING);
  const payout = await api
    .client()
    .connect.payouts.create(PAYOUT_PARAMS, { idempotencyKey: IDEMPOTENCY_KEY });
  assert.equal(payout.id, PAYOUT_ID);
  assert.equal(api.requests.length, 2);
  for (const request of api.requests) {
    assert.equal(request.headers.get("idempotency-key"), IDEMPOTENCY_KEY);
    assert.equal(request.body, `{"amount":60000,"destination":"${PAYOUT_DESTINATION}"}`);
  }
});

test("connect.payouts.retrieve", async () => {
  const api = new MockAPI();
  api.add(200, PAYOUT_COMPLETED);
  const payout = await api.client().connect.payouts.retrieve(PAYOUT_ID);
  assert.equal(payout.constructor, ConnectPayout);
  assert.equal(payout.status, "completed");
  assert.equal(payout.reference, "M7Q2X9T4K1V6N3B8R5W0ZD");
  assert.equal(payout.origin.account, "0000123368198805021689");
  const request = api.last;
  assert.deepEqual(
    [request.method, request.url.pathname],
    ["GET", `/v1/connect/payouts/${PAYOUT_ID}`],
  );
  assert.equal(request.body, undefined);
  assert.equal(request.headers.get("idempotency-key"), null);
  assert.equal(request.headers.get("authorization"), `Bearer ${TEST_KEY}`);
  assert.equal(payout.lastResponse?.idempotencyKey, null);

  api.addError(404, "PAYOUT_NOT_FOUND", "No encontramos ese payout.");
  const error = await rejection(api.client().connect.payouts.retrieve("../balance"));
  assert.ok(error instanceof NotFoundError);
  assert.equal(error.code, "PAYOUT_NOT_FOUND");
  assert.equal(error.message, "No encontramos ese payout.");
  assert.equal(error.data, null);
  assert.equal(api.last.url.pathname, "/v1/connect/payouts/..%2Fbalance"); // el id va codificado
});

test("connect.payouts.list", async () => {
  const api = new MockAPI();
  api.add(200, PAYOUT_LIST);
  const page = await api.client().connect.payouts.list({
    status: "completed",
    created_gte: new Date(Date.UTC(2026, 9, 23, 3)),
    created_lt: "2026-10-24T00:00:00-03:00",
    limit: 2,
    cursor: "c1",
  });
  assert.equal(page.constructor, ListObject);
  assert.deepEqual(
    [...page].map((payout) => payout.constructor),
    [ConnectPayout],
  );
  assert.equal(page.has_more, false);
  assert.equal(page.next_cursor, null);
  const request = api.last;
  assert.deepEqual([request.method, request.url.pathname], ["GET", "/v1/connect/payouts"]);
  assert.deepEqual(Object.fromEntries(request.url.searchParams), {
    status: "completed",
    created_gte: "2026-10-23T03:00:00.000Z",
    created_lt: "2026-10-24T00:00:00-03:00",
    limit: "2",
    cursor: "c1",
  });
  assert.equal(request.headers.get("authorization"), `Bearer ${TEST_KEY}`);
  // El "+" de un offset viaja codificado: si no, el servidor lo leería como un espacio.
  api.add(200, PAYOUT_LIST);
  await api.client().connect.payouts.list({ created_gte: "2026-10-23T00:00:00+00:00" });
  assert.match(api.last.url.search, /created_gte=2026-10-23T00%3A00%3A00%2B00%3A00/);
});

test("connect.payouts.list sin filtros", async () => {
  const api = new MockAPI();
  api.add(200, PAYOUT_LIST);
  await api.client().connect.payouts.list();
  assert.equal(api.last.url.href, "https://api.raya.cash/v1/connect/payouts");
});

test("connect.payouts.list no acepta direction ni otros filtros", async () => {
  const api = new MockAPI();
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const untyped = api.client().connect.payouts as any;
  const error = await rejection(untyped.list({ direction: "outbound" }));
  assert.ok(error instanceof TypeError);
  assert.equal(
    error.message,
    'connect.payouts.list no acepta "direction": los parámetros son status, created_gte, ' +
      "created_lt, limit y cursor.",
  );
  assert.deepEqual(api.requests, []);
});

test("los errores de un payout", async () => {
  const api = new MockAPI();
  const client = api.client();
  const create = () => client.connect.payouts.create(PAYOUT_PARAMS, { idempotencyKey: "k" });

  api.addError(403, "PAYOUT_ORIGIN_UNAVAILABLE", ORIGIN_UNAVAILABLE_MESSAGE);
  let error = await rejection(create());
  assert.ok(error instanceof PermissionDeniedError);
  assert.equal(error.code, "PAYOUT_ORIGIN_UNAVAILABLE");
  assert.equal(error.httpStatus, 403);
  assert.equal(error.message, ORIGIN_UNAVAILABLE_MESSAGE);
  assert.equal(error.data, null);
  assert.equal(error.idempotencyKey, "k");

  api.addError(403, "TRANSFERS_BLOCKED");
  error = await rejection(create());
  assert.ok(error instanceof PermissionDeniedError);
  assert.equal(error.code, "TRANSFERS_BLOCKED");

  api.addError(422, "INSUFFICIENT_BALANCE");
  error = await rejection(create());
  assert.ok(error instanceof UnprocessableEntityError);
  assert.equal(error.code, "INSUFFICIENT_BALANCE");

  api.addError(422, "DESTINATION_NOT_FOUND");
  error = await rejection(create());
  assert.ok(error instanceof UnprocessableEntityError);
  assert.equal(error.code, "DESTINATION_NOT_FOUND");

  api.addError(409, "IDEMPOTENCY_KEY_REUSED");
  error = await rejection(create());
  assert.ok(error instanceof IdempotencyError);
  assert.equal(error.code, "IDEMPOTENCY_KEY_REUSED");

  assert.equal(api.requests.length, 5); // los 4xx (salvo IN_USE) no se reintentan
});

// --- Identidad --------------------------------------------------------------------------------

const VERIFICATIONS_URL = "https://api.raya.cash/v1/identity/verifications";

test("identity.verifications.create manda el body en el orden del contrato", async () => {
  const api = new MockAPI();
  api.add(201, VERIFICATION_PENDING);
  const verification = await api.client().identity.verifications.create({
    expires_in: 86400,
    return_url: "https://tienda.example.com/cuenta",
    metadata: { plan: "pro" },
    external_reference: "cliente-8812",
    type: "document",
  });
  assert.equal(verification.constructor, IdentityVerification);
  assert.equal(verification.object, "identity.verification");
  assert.equal(verification.status, "pending");
  assert.equal(verification.url, VERIFICATION_PENDING.url);
  const request = api.last;
  assert.deepEqual([request.method, request.url.href], ["POST", VERIFICATIONS_URL]);
  // El orden de identity/api_params.py, no el de los parámetros que pasaste.
  assert.equal(
    request.body,
    '{"type":"document","external_reference":"cliente-8812","metadata":{"plan":"pro"},' +
      '"return_url":"https://tienda.example.com/cuenta","expires_in":86400}',
  );
  assert.equal(request.headers.get("content-type"), "application/json");
  assert.equal(request.headers.get("authorization"), `Bearer ${TEST_KEY}`);
  // Sin clave propia, generamos un UUID v4 para esta llamada.
  const key = request.headers.get("idempotency-key") ?? "";
  assert.match(key, UUID_V4);
  assert.equal(verification.lastResponse?.idempotencyKey, key);
});

test("identity.verifications.create: una biometric manda su reference", async () => {
  const api = new MockAPI();
  api.add(201, VERIFICATION_BIOMETRIC_VERIFIED);
  const verification = await api
    .client()
    .identity.verifications.create({ type: "biometric", reference: VERIFICATION_ID });
  assert.equal(api.last.body, `{"type":"biometric","reference":"${VERIFICATION_ID}"}`);
  assert.equal(verification.id, BIOMETRIC_VERIFICATION_ID);
  assert.equal(verification.type, "biometric");
  assert.equal(verification.reference, VERIFICATION_ID);
  assert.equal(verification.checks.document.status, "not_applicable");
});

test("identity.verifications.create manda solo lo que pasás, con tu idempotencyKey", async () => {
  const api = new MockAPI();
  api.add(201, VERIFICATION_PENDING);
  const verification = await api.client().identity.verifications.create(
    {
      type: "document",
      external_reference: undefined,
      metadata: null,
      return_url: null,
      expires_in: undefined,
      reference: null,
    },
    { idempotencyKey: "alta-cliente-8812" },
  );
  assert.equal(api.last.body, '{"type":"document"}');
  assert.equal(api.last.headers.get("idempotency-key"), "alta-cliente-8812");
  assert.equal(verification.lastResponse?.idempotencyKey, "alta-cliente-8812");
});

const VERIFICATION_CREATE_INVALID: Array<
  [string, unknown, typeof TypeError | typeof RangeError, string | RegExp]
> = [
  [
    "params que no son un objeto",
    "document",
    TypeError,
    "identity.verifications.create recibe un objeto con sus parámetros (type, " +
      "external_reference, metadata, return_url, expires_in y reference).",
  ],
  [
    "un parámetro desconocido",
    { type: "document", expires: 3600 },
    TypeError,
    'identity.verifications.create no acepta "expires": los parámetros son type, ' +
      "external_reference, metadata, return_url, expires_in y reference.",
  ],
  [
    "la idempotencyKey entre los parámetros",
    { type: "document", idempotencyKey: "k" },
    TypeError,
    /^identity\.verifications\.create no acepta idempotencyKey entre los parámetros: .*va en las opciones/,
  ],
  [
    "metadata que es un array",
    { type: "document", metadata: ["a"] },
    TypeError,
    'metadata tiene que ser un objeto de string a string, como { plan: "pro" }.',
  ],
  ["metadata que es un string", { type: "document", metadata: "plan=pro" }, TypeError, /^metadata/],
];

for (const [label, params, ErrorType, message] of VERIFICATION_CREATE_INVALID) {
  test(`identity.verifications.create valida antes de mandar: ${label}`, async () => {
    const api = new MockAPI();
    // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
    const untyped = api.client().identity.verifications as any;
    const error = await rejection(untyped.create(params));
    assert.equal(error.constructor, ErrorType);
    if (typeof message === "string") assert.equal(error.message, message);
    else assert.match(error.message, message);
    assert.deepEqual(api.requests, []);
  });
}

test("identity.verifications: las opciones se validan antes de mandar", async () => {
  const api = new MockAPI();
  const verifications = api.client().identity.verifications;
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const untyped = verifications as any;
  let error = await rejection(
    verifications.create({ type: "document" }, { idempotencyKey: "con espacios" }),
  );
  assert.ok(error instanceof RangeError);
  assert.match(error.message, /^idempotencyKey tiene que tener de 1 a 255 caracteres/);
  error = await rejection(untyped.cancel(VERIFICATION_ID, { idempotency_key: "k" }));
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /¿quisiste decir idempotencyKey\?/);
  // Los GET no llevan Idempotency-Key.
  for (const call of [
    () => untyped.retrieve(VERIFICATION_ID, { idempotencyKey: "k" }),
    () => untyped.files(VERIFICATION_ID, { idempotencyKey: "k" }),
    () => untyped.list({ status: "verified" }, { idempotencyKey: "k" }),
  ]) {
    error = await rejection(call());
    assert.ok(error instanceof RangeError);
    assert.equal(error.message, "La Idempotency-Key solo va en los POST.");
  }
  assert.deepEqual(api.requests, []);
});

test("lo demás lo valida la API: identity.verifications.create({}) llega y vuelve PARAMETER_MISSING", async () => {
  const api = new MockAPI();
  api.addError(400, "PARAMETER_MISSING", "Falta el parámetro type.", { field: "type" });
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const untyped = api.client().identity.verifications as any;
  const error = await rejection(untyped.create({}));
  assert.ok(error instanceof InvalidRequestError);
  assert.equal(error.code, "PARAMETER_MISSING");
  assert.equal(error.param, "type");
  assert.equal(api.requests.length, 1); // los 4xx no se reintentan
  assert.equal(api.last.body, "{}");
});

test("identity.verifications.retrieve", async () => {
  const api = new MockAPI();
  api.add(200, VERIFICATION_VERIFIED);
  const verification = await api.client().identity.verifications.retrieve(VERIFICATION_ID);
  const request = api.last;
  assert.deepEqual(
    [request.method, request.url.href],
    ["GET", `${VERIFICATIONS_URL}/${VERIFICATION_ID}`],
  );
  assert.equal(request.body, undefined);
  assert.equal(request.headers.get("content-type"), null);
  assert.equal(request.headers.get("idempotency-key"), null);
  assert.equal(request.headers.get("authorization"), `Bearer ${TEST_KEY}`);
  assert.equal(verification.constructor, IdentityVerification);
  assert.equal(verification.status, "verified");
  assert.equal(verification.person?.first_name, "María Laura");
  assert.equal(verification.person?.address.city, "Rosario");
  assert.equal(verification.person?.document.copy, "A");
  assert.equal(verification.checks.registry.face_match, "hit");
  assert.equal(verification.checks.liveness.confidence, 99.1);
  assert.equal(verification.amount, 1000);
  assert.equal(verification.lastResponse?.idempotencyKey, null);
});

test("identity.verifications.retrieve: una rechazada trae su motivo y nunca person", async () => {
  const api = new MockAPI();
  api.add(200, VERIFICATION_DECLINED);
  const verification = await api.client().identity.verifications.retrieve(VERIFICATION_ID);
  assert.equal(verification.status, "declined");
  assert.equal(verification.decline_reason?.code, "registry_data_mismatch");
  assert.equal(verification.checks.registry.data_match, false);
  assert.equal(verification.person, null);
  assert.equal(verification.amount, null);
});

test("identity.verifications: los ids van codificados en la ruta y con la clave de la llamada", async () => {
  const api = new MockAPI();
  api.add(200, VERIFICATION_PENDING);
  await api.client().identity.verifications.retrieve("../cancel");
  assert.equal(api.last.url.href, `${VERIFICATIONS_URL}/..%2Fcancel`);
  api.add(200, VERIFICATION_FILES);
  await api.client().identity.verifications.files("idv x/y", { apiKey: OTHER_KEY });
  assert.equal(api.last.url.pathname, "/v1/identity/verifications/idv%20x%2Fy/files");
  assert.equal(api.last.headers.get("authorization"), `Bearer ${OTHER_KEY}`);
});

for (const method of ["retrieve", "cancel", "files"]) {
  for (const [value, message] of [
    ["", "verificationId no puede estar vacío."],
    ["   ", "verificationId no puede estar vacío."],
    [".", 'verificationId no puede ser "." ni "..".'],
    ["..", 'verificationId no puede ser "." ni "..".'],
  ]) {
    test(`identity.verifications.${method} rechaza el id ${JSON.stringify(value)}`, async () => {
      const api = new MockAPI();
      // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
      const untyped = api.client().identity.verifications as any;
      const error = await rejection(untyped[method](value));
      assert.ok(error instanceof RangeError);
      assert.equal(error.message, message);
      assert.deepEqual(api.requests, []);
    });
  }

  test(`identity.verifications.${method}: el id tiene que ser un string`, async () => {
    const api = new MockAPI();
    // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
    const untyped = api.client().identity.verifications as any;
    const error = await rejection(untyped[method](1234));
    assert.ok(error instanceof TypeError);
    assert.equal(error.message, "verificationId tiene que ser un string, no number.");
    assert.deepEqual(api.requests, []);
  });
}

test("identity.verifications.list con todos los filtros, en el orden del contrato", async () => {
  const api = new MockAPI();
  api.add(200, VERIFICATION_LIST);
  const page = await api.client().identity.verifications.list({
    limit: 50,
    cursor: "c1",
    created_lt: "2026-10-25T00:00:00+00:00",
    created_gte: new Date("2026-11-10T03:00:00Z"),
    external_reference: "cliente 8812",
    type: "document",
    status: "verified",
  });
  assert.equal(page.constructor, ListObject);
  assert.deepEqual(
    [...page].map((verification) => verification.constructor),
    [IdentityVerification, IdentityVerification],
  );
  assert.equal(page.has_more, true);
  assert.equal(page.next_cursor, VERIFICATION_LIST.next_cursor);
  const request = api.last;
  assert.deepEqual([request.method, request.url.pathname], ["GET", "/v1/identity/verifications"]);
  assert.equal(request.body, undefined);
  // El "+" de un offset viaja codificado: si no, el servidor lo leería como un espacio.
  assert.equal(
    request.url.search,
    "?status=verified&type=document&external_reference=cliente+8812" +
      "&created_gte=2026-11-10T03%3A00%3A00.000Z&created_lt=2026-10-25T00%3A00%3A00%2B00%3A00" +
      "&limit=50&cursor=c1",
  );
});

test("identity.verifications.list sin filtros pide la URL pelada", async () => {
  const api = new MockAPI();
  api.add(200, { ...VERIFICATION_LIST, has_more: false, next_cursor: null });
  await api.client().identity.verifications.list();
  assert.equal(api.last.url.href, VERIFICATIONS_URL);
});

const VERIFICATION_LIST_INVALID: Array<
  [string, unknown, typeof TypeError | typeof RangeError, string]
> = [
  [
    "un filtro desconocido",
    { estado: "verified" },
    TypeError,
    'identity.verifications.list no acepta "estado": los parámetros son status, type, ' +
      "external_reference, created_gte, created_lt, limit y cursor.",
  ],
  [
    "direction, que es de las transferencias",
    { direction: "inbound" },
    TypeError,
    'identity.verifications.list no acepta "direction": los parámetros son status, type, ' +
      "external_reference, created_gte, created_lt, limit y cursor.",
  ],
  [
    "params que no son un objeto",
    "verified",
    TypeError,
    "identity.verifications.list recibe un objeto con sus parámetros (status, type, " +
      "external_reference, created_gte, created_lt, limit y cursor).",
  ],
  ["limit con decimales", { limit: 1.5 }, TypeError, "limit no acepta un número con decimales."],
  ["un boolean", { status: true }, TypeError, "status no puede ser un boolean."],
  [
    "un Date inválido",
    { created_gte: new Date("x") },
    RangeError,
    "created_gte es una fecha inválida.",
  ],
];

for (const [label, params, ErrorType, message] of VERIFICATION_LIST_INVALID) {
  test(`identity.verifications.list valida antes de mandar: ${label}`, async () => {
    const api = new MockAPI();
    // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
    const untyped = api.client().identity.verifications as any;
    const error = await rejection(untyped.list(params));
    assert.equal(error.constructor, ErrorType);
    assert.equal(error.message, message);
    assert.deepEqual(api.requests, []);
  });
}

test("identity.verifications.cancel va sin body y con una Idempotency-Key generada", async () => {
  const api = new MockAPI();
  api.add(200, VERIFICATION_CANCELED);
  const verification = await api.client().identity.verifications.cancel(VERIFICATION_ID);
  const request = api.last;
  assert.deepEqual(
    [request.method, request.url.href],
    ["POST", `${VERIFICATIONS_URL}/${VERIFICATION_ID}/cancel`],
  );
  assert.equal(request.body, undefined); // sin body, como un reembolso
  assert.equal(request.headers.get("content-type"), null);
  const key = request.headers.get("idempotency-key") ?? "";
  assert.match(key, UUID_V4);
  assert.equal(verification.lastResponse?.idempotencyKey, key);
  assert.equal(verification.constructor, IdentityVerification);
  assert.equal(verification.status, "canceled");
  assert.equal(verification.completed_at, "2026-10-24T18:30:00Z");
});

test("identity.verifications.cancel con tu idempotencyKey; repetido, devuelve la misma", async () => {
  const api = new MockAPI();
  const verifications = api.client().identity.verifications;
  api.add(200, VERIFICATION_CANCELED);
  api.add(200, VERIFICATION_CANCELED);
  const first = await verifications.cancel(VERIFICATION_ID, { idempotencyKey: "cancelar-1" });
  // Cancelar una que ya está canceled no es un error: la API la devuelve igual.
  const again = await verifications.cancel(VERIFICATION_ID);
  assert.equal(api.requests[0]?.headers.get("idempotency-key"), "cancelar-1");
  assert.equal(first.lastResponse?.idempotencyKey, "cancelar-1");
  assert.deepEqual([first.status, again.status], ["canceled", "canceled"]);
});

test("identity.verifications.files", async () => {
  const api = new MockAPI();
  api.add(200, VERIFICATION_FILES);
  const files = await api.client().identity.verifications.files(VERIFICATION_ID);
  const request = api.last;
  assert.deepEqual(
    [request.method, request.url.href],
    ["GET", `${VERIFICATIONS_URL}/${VERIFICATION_ID}/files`],
  );
  assert.equal(request.body, undefined);
  assert.equal(request.headers.get("idempotency-key"), null);
  assert.equal(files.constructor, IdentityVerificationFiles);
  assert.equal(files.object, "identity.verification_files");
  assert.equal(files.front?.url, VERIFICATION_FILES.front.url);
  assert.equal(files.back?.url, VERIFICATION_FILES.back.url);
  assert.equal(files.selfie?.expires_at, VERIFICATION_FILES.selfie.expires_at);
  assert.equal(Object.getPrototypeOf(files.front), Object.prototype);
});

test("identity.verifications: sin clave propia, cada create y cada cancel genera la suya", async () => {
  const api = new MockAPI();
  const verifications = api.client().identity.verifications;
  api.add(201, VERIFICATION_PENDING);
  api.add(201, VERIFICATION_PENDING);
  api.add(200, VERIFICATION_CANCELED);
  api.add(200, VERIFICATION_CANCELED);
  const results = [
    await verifications.create({ type: "document" }),
    await verifications.create({ type: "document" }),
    await verifications.cancel(VERIFICATION_ID),
    await verifications.cancel(VERIFICATION_ID),
  ];
  const keys = api.requests.map((request) => request.headers.get("idempotency-key") ?? "");
  for (const key of keys) assert.match(key, UUID_V4);
  assert.equal(new Set(keys).size, 4);
  assert.deepEqual(
    results.map((verification) => verification.lastResponse?.idempotencyKey),
    keys,
  );
});

test("identity.verifications.create reintenta con la misma Idempotency-Key y el mismo body", async () => {
  const api = new MockAPI();
  api.addError(503, "TEMPORARILY_UNAVAILABLE");
  api.add(201, VERIFICATION_PENDING);
  const verification = await api
    .client()
    .identity.verifications.create({ type: "document", external_reference: "cliente-8812" });
  assert.equal(verification.id, VERIFICATION_ID);
  assert.equal(api.requests.length, 2);
  const [first, second] = api.requests;
  assert.match(first?.headers.get("idempotency-key") ?? "", UUID_V4);
  assert.equal(second?.headers.get("idempotency-key"), first?.headers.get("idempotency-key"));
  assert.equal(second?.body, first?.body);
  assert.equal(verification.lastResponse?.idempotencyKey, first?.headers.get("idempotency-key"));
});

test("identity.verifications: VERIFICATION_NOT_FOUND es NotFoundError", async () => {
  const api = new MockAPI();
  api.addError(404, "VERIFICATION_NOT_FOUND", "No encontramos esa verificación.");
  const error = await rejection(api.client().identity.verifications.retrieve(VERIFICATION_ID));
  assert.ok(error instanceof NotFoundError);
  assert.equal(error.code, "VERIFICATION_NOT_FOUND");
  assert.equal(error.message, "No encontramos esa verificación.");
  assert.equal(error.requestId, "req_test00000000000000000001");
  assert.equal(api.requests.length, 1);
});

test("identity.verifications.cancel: VERIFICATION_NOT_CANCELABLE, una sola request y el estado en data", async () => {
  const api = new MockAPI();
  api.addError(
    409,
    "VERIFICATION_NOT_CANCELABLE",
    "Solo podés cancelar verificaciones pending o in_progress.",
    { status: "processing" },
  );
  const error = await rejection(
    api.client().identity.verifications.cancel(VERIFICATION_ID, { idempotencyKey: "c-1" }),
  );
  assert.ok(error instanceof ConflictError);
  assert.equal(error.code, "VERIFICATION_NOT_CANCELABLE");
  assert.deepEqual(error.data, { status: "processing" });
  assert.equal(error.idempotencyKey, "c-1");
  assert.equal(api.requests.length, 1); // un 409 que no es de idempotencia no se reintenta
});

test("identity.verifications.create: el tope de verificaciones (429 con Retry-After: 3600) no se reintenta", async () => {
  const api = new MockAPI();
  api.addError(
    429,
    "RATE_LIMITED",
    "Llegaste al máximo de verificaciones por día.",
    { limit: "daily" },
    { headers: { "Retry-After": "3600" } },
  );
  const error = await rejection(api.client().identity.verifications.create({ type: "document" }));
  assert.ok(error instanceof RateLimitError);
  assert.equal(error.retryAfter, 3600);
  assert.deepEqual(error.data, { limit: "daily" });
  assert.equal(api.requests.length, 1); // más de 60 s: el SDK no espera, lanza el error
});

test("identity.verifications: una cuenta sin Identidad activada o una clave de prueba dan PermissionDeniedError", async () => {
  const api = new MockAPI();
  const verifications = api.client().identity.verifications;
  api.addError(403, "IDENTITY_NOT_ACTIVATED");
  let error = await rejection(verifications.create({ type: "document" }));
  assert.ok(error instanceof PermissionDeniedError);
  assert.equal(error.code, "IDENTITY_NOT_ACTIVATED");
  api.addError(
    403,
    "SANDBOX_NOT_SUPPORTED",
    "Este endpoint todavía no está disponible en un sandbox.",
  );
  error = await rejection(verifications.list());
  assert.ok(error instanceof PermissionDeniedError);
  assert.equal(error.code, "SANDBOX_NOT_SUPPORTED");
  assert.equal(api.requests.length, 2); // los 4xx no se reintentan
});

// --- Sandbox: test helpers --------------------------------------------------------------------

const SIMULATE_PATH = `/v1/test/payments/${SANDBOX_PAYMENT_ID}/simulate_transfer`;
const NOT_PENDING_MESSAGE = "Solo podés simular la transferencia de un pago pendiente.";

test("en un sandbox, payments.create es el mismo endpoint, con la clave secreta de prueba", async () => {
  const api = new MockAPI();
  api.add(201, SANDBOX_PAYMENT_PENDING);
  const payment = await api
    .client(SANDBOX_SECRET_KEY)
    .payments.create({ amount: 15000, description: "Pedido #1042" });
  assert.equal(payment.constructor, Payment);
  assert.match(payment.bank_transfer.cvu, /^00000002\d{14}$/); // un CVU de prueba, que no existe
  assert.equal(payment.bank_transfer.alias, "sandbox.no.transferir");
  assert.equal(payment.checkout_url, `https://raya.cash/sandbox/pay/${SANDBOX_PAYMENT_ID}`);
  assert.deepEqual(
    [api.last.method, api.last.url.href],
    ["POST", "https://api.raya.cash/v1/payments"],
  );
  assert.equal(api.last.headers.get("authorization"), `Bearer ${SANDBOX_SECRET_KEY}`);
  assert.match(api.last.headers.get("idempotency-key") ?? "", UUID_V4); // como en tu cuenta real
});

test("testHelpers.payments.simulateTransfer: POST sin body ni Idempotency-Key, con la clave de prueba", async () => {
  const api = new MockAPI();
  api.add(200, SANDBOX_PAYMENT_SUCCEEDED);
  const client = api.client(SANDBOX_SECRET_KEY);
  const payment = await client.testHelpers.payments.simulateTransfer(SANDBOX_PAYMENT_ID);
  assert.equal(payment.constructor, Payment);
  assert.equal(payment.status, "succeeded");
  assert.equal(payment.amount_received, 15000);
  assert.deepEqual(payment.payer, SANDBOX_PAYER);
  assert.deepEqual(payment.toJSON(), SANDBOX_PAYMENT_SUCCEEDED);
  const request = api.last;
  assert.deepEqual(
    [request.method, request.url.href],
    ["POST", `https://api.raya.cash${SIMULATE_PATH}`],
  );
  assert.equal(request.headers.get("authorization"), `Bearer ${SANDBOX_SECRET_KEY}`);
  // Sin amount no va body (la API simula el monto exacto) y nunca va Idempotency-Key.
  assert.equal(request.body, undefined);
  assert.equal(request.headers.get("content-type"), null);
  assert.equal(request.headers.get("idempotency-key"), null);
  assert.deepEqual([...request.headers.keys()].sort(), ["accept", "authorization", "user-agent"]);
  assert.equal(payment.lastResponse?.idempotencyKey, null);
  assert.equal(payment.lastResponse?.requestId, "req_test00000000000000000001");
  // El pago que devuelve recuerda su cliente: el reembolso de prueba va con la misma clave.
  api.add(200, { ...SANDBOX_PAYMENT_SUCCEEDED, status: "refunded" });
  await payment.refund({ idempotencyKey: "reembolso-1" });
  assert.equal(api.last.url.pathname, `/v1/payments/${SANDBOX_PAYMENT_ID}/refund`);
  assert.equal(api.last.headers.get("authorization"), `Bearer ${SANDBOX_SECRET_KEY}`);
  assert.equal(api.last.headers.get("idempotency-key"), "reembolso-1");
});

test("testHelpers.payments.simulateTransfer con amount: el monto viaja exacto, como número JSON", async () => {
  const api = new MockAPI();
  const helpers = api.client(SANDBOX_SECRET_KEY).testHelpers.payments;
  // Menos que el pago: failed con amount_mismatch (en un sandbox, sin el reembolso automático).
  api.add(200, SANDBOX_PAYMENT_FAILED);
  const failed = await helpers.simulateTransfer(SANDBOX_PAYMENT_ID, { amount: 1000 });
  assert.equal(failed.status, "failed");
  assert.equal(failed.failure_code, "amount_mismatch");
  assert.equal(failed.amount_received, 1000);
  assert.equal(api.last.body, '{"amount":1000}');
  assert.equal(api.last.headers.get("content-type"), "application/json");
  assert.equal(api.last.headers.get("idempotency-key"), null);
  const amounts: Array<[PaymentSimulateTransferParams["amount"], string | undefined]> = [
    ["16000.50", '{"amount":16000.5}'],
    [new FakeDecimal("16000.00"), '{"amount":16000}'],
    [16000n, '{"amount":16000}'],
    [1.6e4, '{"amount":16000}'],
    [null, undefined],
    [undefined, undefined],
  ];
  for (const [amount, body] of amounts) {
    api.add(200, SANDBOX_PAYMENT_SUCCEEDED);
    await helpers.simulateTransfer(SANDBOX_PAYMENT_ID, { amount });
    assert.equal(api.last.body, body, String(amount));
    assert.equal(api.last.headers.get("idempotency-key"), null);
  }
  // Sin parámetros, con null o con {}, tampoco va body.
  for (const params of [undefined, null, {}]) {
    api.add(200, SANDBOX_PAYMENT_SUCCEEDED);
    await helpers.simulateTransfer(SANDBOX_PAYMENT_ID, params);
    assert.equal(api.last.body, undefined);
    assert.equal(api.last.url.pathname, SIMULATE_PATH);
  }
  assert.equal(api.pending, 0);
});

test("testHelpers.payments.simulateTransfer con el id de una orden de Raya Connect da un ConnectOrder", async () => {
  const api = new MockAPI();
  const helpers = api.client(SANDBOX_SECRET_KEY).testHelpers.payments;
  api.add(200, SANDBOX_ORDER_SUCCEEDED);
  const order = await helpers.simulateTransfer(SANDBOX_ORDER_ID);
  assert.ok(order instanceof ConnectOrder);
  assert.equal(order.fee, 10);
  assert.equal(order.net_amount, 1490);
  assert.equal(order.account, SANDBOX_TEST_USER_ID);
  assert.deepEqual(order.toJSON(), SANDBOX_ORDER_SUCCEEDED);
  assert.deepEqual(
    [api.last.method, api.last.url.pathname],
    ["POST", `/v1/test/payments/${SANDBOX_ORDER_ID}/simulate_transfer`],
  );
  // Con la clave secreta de prueba del sandbox (la dueña de la app), no con el access_token.
  assert.equal(api.last.headers.get("authorization"), `Bearer ${SANDBOX_SECRET_KEY}`);
  assert.equal(api.last.headers.get("idempotency-key"), null);
  // La clase sale de object; sin object, el respaldo es Payment.
  api.add(200, { id: SANDBOX_PAYMENT_ID, status: "succeeded" });
  assert.equal((await helpers.simulateTransfer(SANDBOX_PAYMENT_ID)).constructor, Payment);
  // Los ids van codificados en la ruta.
  api.add(200, SANDBOX_PAYMENT_SUCCEEDED);
  await helpers.simulateTransfer("pago/1 x");
  assert.equal(api.last.url.pathname, "/v1/test/payments/pago%2F1%20x/simulate_transfer");
});

test("testHelpers.payments.simulateTransfer: los errores, con su clase y sin reintentos", async () => {
  const api = new MockAPI();
  const helpers = api.client(SANDBOX_SECRET_KEY).testHelpers.payments;
  api.addError(404, "PAYMENT_NOT_FOUND", "No encontramos ese pago.");
  let error = await rejection(helpers.simulateTransfer(PAYMENT_ID));
  assert.ok(error instanceof NotFoundError);
  assert.equal(error.code, "PAYMENT_NOT_FOUND");
  assert.equal(error.httpStatus, 404);
  assert.equal(error.idempotencyKey, null);
  // Ya simulado, reembolsado o vencido: el estado actual en data.
  api.addError(409, "PAYMENT_NOT_PENDING", NOT_PENDING_MESSAGE, { status: "succeeded" });
  error = await rejection(helpers.simulateTransfer(SANDBOX_PAYMENT_ID));
  assert.ok(error instanceof ConflictError);
  assert.ok(!(error instanceof IdempotencyError));
  assert.equal(error.code, "PAYMENT_NOT_PENDING");
  assert.equal(error.message, NOT_PENDING_MESSAGE);
  assert.deepEqual(error.data, { status: "succeeded" });
  assert.equal(error.idempotencyKey, null);
  // Con una clave real, la API responde 403 SANDBOX_ONLY.
  api.addError(
    403,
    "SANDBOX_ONLY",
    "Este endpoint solo funciona en un sandbox: usá una credencial de prueba.",
  );
  error = await rejection(
    api.client(TEST_KEY).testHelpers.payments.simulateTransfer(SANDBOX_PAYMENT_ID),
  );
  assert.ok(error instanceof PermissionDeniedError);
  assert.equal(error.code, "SANDBOX_ONLY");
  assert.equal(api.last.headers.get("authorization"), `Bearer ${TEST_KEY}`);
  // El amount lo valida la API: el SDK no redondea.
  api.addError(
    400,
    "PARAMETER_INVALID",
    "amount tiene que ser un número con hasta 2 decimales (por ejemplo, 1500 o 1500.5).",
    { field: "amount" },
  );
  error = await rejection(helpers.simulateTransfer(SANDBOX_PAYMENT_ID, { amount: "1500.505" }));
  assert.ok(error instanceof InvalidRequestError);
  assert.equal(error.param, "amount");
  assert.equal(api.last.body, '{"amount":1500.505}');
  assert.equal(api.requests.length, 4); // los 4xx no se reintentan
  assert.ok(api.requests.every((request) => request.headers.get("idempotency-key") === null));
});

test("testHelpers.payments.simulateTransfer: un corte se reintenta, siempre sin Idempotency-Key", async () => {
  const api = new MockAPI();
  const helpers = api.client(SANDBOX_SECRET_KEY).testHelpers.payments;
  // El primer intento llegó y simuló, pero se cortó la respuesta: el reintento recibe el 409.
  api.failWith(networkError("ECONNRESET"));
  api.addError(409, "PAYMENT_NOT_PENDING", NOT_PENDING_MESSAGE, { status: "succeeded" });
  const error = await rejection(helpers.simulateTransfer(SANDBOX_PAYMENT_ID));
  assert.ok(error instanceof ConflictError);
  assert.equal(error.code, "PAYMENT_NOT_PENDING");
  assert.equal(api.requests.length, 2);
  assert.ok(api.requests.every((request) => request.headers.get("idempotency-key") === null));
  // Sin reintentos, el corte sale como APIConnectionError, sin una clave para reintentar.
  api.failWith(networkError("ECONNRESET"));
  const cut = await rejection(
    helpers.simulateTransfer(SANDBOX_PAYMENT_ID, null, { maxNetworkRetries: 0 }),
  );
  assert.ok(cut instanceof APIConnectionError);
  assert.equal(cut.code, "NETWORK_ERROR");
  assert.equal(cut.idempotencyKey, null);
  assert.doesNotMatch(cut.message, /Idempotency-Key/);
});

test("testHelpers.payments.simulateTransfer no acepta idempotencyKey: no lleva Idempotency-Key", async () => {
  const api = new MockAPI();
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const untyped = api.client(SANDBOX_SECRET_KEY).testHelpers.payments as any;
  let error = await rejection(
    untyped.simulateTransfer(SANDBOX_PAYMENT_ID, {}, { idempotencyKey: "simular-1" }),
  );
  assert.ok(error instanceof RangeError);
  assert.equal(
    error.message,
    "testHelpers.payments.simulateTransfer no acepta idempotencyKey en las opciones: no lleva " +
      "Idempotency-Key, un pago se simula una sola vez (repetirlo responde PAYMENT_NOT_PENDING).",
  );
  // Entre los parámetros, el mismo motivo (no «va en las opciones», como en los demás POST).
  error = await rejection(
    untyped.simulateTransfer(SANDBOX_PAYMENT_ID, { amount: 1, idempotencyKey: "simular-1" }),
  );
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /no acepta idempotencyKey entre los parámetros: no lleva Idem/);
  error = await rejection(
    untyped.simulateTransfer(SANDBOX_PAYMENT_ID, { idempotency_key: "simular-1" }),
  );
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /no acepta idempotency_key entre los parámetros/);
  error = await rejection(
    untyped.simulateTransfer(SANDBOX_PAYMENT_ID, null, { idempotency_key: "simular-1" }),
  );
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /¿quisiste decir idempotencyKey\?/);
  assert.deepEqual(api.requests, []);
  // Las opciones que sí acepta: apiKey, timeout y maxNetworkRetries.
  api.add(200, SANDBOX_PAYMENT_SUCCEEDED);
  await api.client(TEST_KEY).testHelpers.payments.simulateTransfer(SANDBOX_PAYMENT_ID, null, {
    apiKey: SANDBOX_SECRET_KEY,
    timeout: 5_000,
    maxNetworkRetries: 0,
  });
  assert.equal(api.last.headers.get("authorization"), `Bearer ${SANDBOX_SECRET_KEY}`);
  assert.equal(api.last.headers.get("idempotency-key"), null);
});

const SIMULATE_INVALID: Array<[unknown[], typeof TypeError | typeof RangeError, RegExp]> = [
  [[SANDBOX_PAYMENT_ID, { amount: true }], TypeError, /^amount no puede ser un boolean/],
  [[SANDBOX_PAYMENT_ID, { amount: "mil" }], RangeError, /^amount "mil" no es un número/],
  [
    [SANDBOX_PAYMENT_ID, { amount: "Infinity" }],
    RangeError,
    /^amount tiene que ser un número finito/,
  ],
  [
    [SANDBOX_PAYMENT_ID, { amount: 1, status: "succeeded" }],
    TypeError,
    /^testHelpers\.payments\.simulateTransfer no acepta "status": los parámetros son amount\.$/,
  ],
  [
    [SANDBOX_PAYMENT_ID, 1500],
    TypeError,
    /^testHelpers\.payments\.simulateTransfer recibe un objeto con sus parámetros \(amount\)\.$/,
  ],
  [[""], RangeError, /^paymentId no puede estar vacío\.$/],
  [[".."], RangeError, /^paymentId no puede ser "\." ni "\.\."\.$/],
  [[1234], TypeError, /^paymentId tiene que ser un string, no number\.$/],
  [[SANDBOX_PAYMENT_ID, {}, "rápido"], TypeError, /^options tiene que ser un objeto/],
];

for (const [args, ErrorType, message] of SIMULATE_INVALID) {
  test(`testHelpers.payments.simulateTransfer valida antes de mandar: ${JSON.stringify(args)}`, async () => {
    const api = new MockAPI();
    // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
    const untyped = api.client(SANDBOX_SECRET_KEY).testHelpers.payments as any;
    const error = await rejection(untyped.simulateTransfer(...args));
    assert.equal(error.constructor, ErrorType);
    assert.match(error.message, message);
    assert.deepEqual(api.requests, []);
  });
}

// Los JSON que vuelca identity/tests_e2e.py de la API (con IDN_FIXTURES_DIR definido): las fixtures
// tienen que tener las mismas claves, a todos los niveles. Solo corre si la variable está definida.
const IDN_FIXTURES_DIR = process.env.IDN_FIXTURES_DIR;

function keyDiff(fixture: unknown, dumped: unknown, at: string, out: string[]): void {
  if (fixture === null || dumped === null) return;
  if (typeof fixture !== "object" || typeof dumped !== "object") return;
  const left = Object.keys(fixture).sort();
  const right = Object.keys(dumped).sort();
  if (left.join() !== right.join()) out.push(`${at}: ${left} ≠ ${right}`);
  for (const key of left) {
    if (at === "" && key === "metadata") continue; // las claves de metadata son del integrador
    const a = (fixture as Record<string, unknown>)[key];
    const b = (dumped as Record<string, unknown>)[key];
    keyDiff(a, b, at ? `${at}.${key}` : key, out);
  }
}

if (IDN_FIXTURES_DIR) {
  const pairs: Array<[string, unknown]> = [
    ["verification_pending.json", VERIFICATION_PENDING],
    ["verification_verified.json", VERIFICATION_VERIFIED],
    ["verification_declined.json", VERIFICATION_DECLINED],
    ["verification_biometric.json", VERIFICATION_BIOMETRIC_VERIFIED],
    ["files.json", VERIFICATION_FILES],
    ["event.json", EVENT_VERIFICATION_VERIFIED],
  ];
  assert.ok(readdirSync(IDN_FIXTURES_DIR).length > 0, "IDN_FIXTURES_DIR está vacía");
  for (const [name, fixture] of pairs) {
    test(`las claves de la fixture de Identidad coinciden con ${name} de la API`, () => {
      const dumped = JSON.parse(readFileSync(path.join(IDN_FIXTURES_DIR, name), "utf8"));
      const out: string[] = [];
      keyDiff(fixture, dumped, "", out);
      assert.deepEqual(out, []);
    });
  }
}
