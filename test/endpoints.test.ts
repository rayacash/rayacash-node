// Los 12 endpoints: método, ruta, query, body y headers exactos.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AuthenticationError,
  Balance,
  ConnectOrder,
  type ConnectOrderCreateParams,
  InvalidRequestError,
  ListObject,
  NotFoundError,
  OAuthToken,
  Payment,
  type PaymentCreateParams,
  PermissionDeniedError,
  Transfer,
  UnprocessableEntityError,
  User,
} from "../src/index.ts";
import {
  ACCESS_TOKEN,
  BALANCE,
  CLIENT_ID,
  CLIENT_SECRET,
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
  REDIRECT_URI,
  TRANSFER_INBOUND,
  TRANSFER_LIST,
  TRANSFER_OUTBOUND_PENDING,
  USER,
  USER_ID,
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
    [() => client.users.retrieve("."), "userId"],
    [() => client.connect.orders.retrieve(".."), "orderId"],
    [() => client.connect.orders.refund("."), "orderId"],
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
