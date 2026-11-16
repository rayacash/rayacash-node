// Los 33 endpoints: método, ruta, query, body y headers exactos.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  APIConnectionError,
  APIError,
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
  PspBalance,
  PspCustomer,
  PspCustomerBalance,
  type PspCustomerCreateParams,
  PspTransfer,
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
  PSP_ACCOUNT,
  PSP_BALANCE,
  PSP_COMPANY_ID,
  PSP_COMPANY_TAX_ID,
  PSP_COMPANY_VERIFYING,
  PSP_CUSTOMER_ACTIVE,
  PSP_CUSTOMER_BALANCE,
  PSP_CUSTOMER_BLOCKED,
  PSP_CUSTOMER_CLOSED,
  PSP_CUSTOMER_FAILED,
  PSP_CUSTOMER_ID,
  PSP_CUSTOMER_LIST,
  PSP_CUSTOMER_PENDING,
  PSP_CUSTOMER_REJECTED,
  PSP_CUSTOMER_VERIFYING,
  PSP_CUSTOMER_WITH_BALANCE,
  PSP_DESTINATION,
  PSP_INBOUND_ID,
  PSP_OUTBOUND_ID,
  PSP_PHOTO_URLS,
  PSP_TAX_ID,
  PSP_TRANSFER_INBOUND,
  PSP_TRANSFER_LIST,
  PSP_TRANSFER_OUTBOUND_COMPLETED,
  PSP_TRANSFER_OUTBOUND_PENDING,
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

// --- Raya PSP ---------------------------------------------------------------------------------

const PSP_CUSTOMERS_URL = "https://api.raya.cash/v1/psp/customers";
const PSP_TRANSFERS_URL = "https://api.raya.cash/v1/psp/transfers";
const PSP_NAME = "María Laura Ejemplo";
// Como lo escribe el SDK: JSON en ASCII, como json.dumps de Python.
const PSP_NAME_JSON = '"Mar\\u00eda Laura Ejemplo"';
const PSP_TRANSFER_PARAMS = {
  customer: PSP_CUSTOMER_ID,
  amount: 18350.5,
  destination: PSP_DESTINATION,
};
const PSP_TRANSFER_BODY = `{"customer":"${PSP_CUSTOMER_ID}","amount":18350.5,"destination":"${PSP_DESTINATION}"}`;
const PSP_KEY_MESSAGE =
  "psp.transfers.create necesita idempotencyKey: generá un UUID v4 con crypto.randomUUID(), " +
  "guardalo con la transferencia antes de llamar y reusalo en cada reintento: " +
  "psp.transfers.create({ customer, amount, destination }, { idempotencyKey }).";

test("psp.customers.create con una verificación de Identidad: solo identity_verification, 201 y el body en el orden del contrato", async () => {
  const api = new MockAPI();
  api.add(201, PSP_CUSTOMER_ACTIVE);
  const customer = await api.client().psp.customers.create({
    metadata: { plan: "pro" },
    external_reference: "cliente-8812",
    identity_verification: VERIFICATION_ID,
  });
  assert.equal(customer.constructor, PspCustomer);
  assert.equal(customer.object, "psp.customer");
  assert.equal(customer.id, PSP_CUSTOMER_ID);
  assert.equal(customer.status, "active");
  assert.equal(customer.cvu?.account, PSP_ACCOUNT);
  assert.equal(customer.cvu?.alias, "maria_ejemplo");
  assert.equal(customer.identity_verification, VERIFICATION_ID);
  // El CUIL, el nombre y person_type los toma la API de la verificación.
  assert.deepEqual(
    [customer.tax_id, customer.name, customer.person_type],
    [PSP_TAX_ID, PSP_NAME, "F"],
  );
  assert.equal(customer.lastResponse?.httpStatus, 201);
  const request = api.last;
  assert.deepEqual([request.method, request.url.href], ["POST", PSP_CUSTOMERS_URL]);
  // El orden de pspexternal/api_params.py (CREATE_FIELDS), no el de los parámetros que pasaste.
  assert.equal(
    request.body,
    '{"identity_verification":"idv_3kT9vQ2mXw7Lp0aBcD4eF6gH","external_reference":"cliente-8812",' +
      '"metadata":{"plan":"pro"}}',
  );
  assert.equal(request.headers.get("content-type"), "application/json");
  assert.equal(request.headers.get("authorization"), `Bearer ${TEST_KEY}`);
  // Sin clave propia, generamos un UUID v4 para esta llamada.
  const key = request.headers.get("idempotency-key") ?? "";
  assert.match(key, UUID_V4);
  assert.equal(customer.lastResponse?.idempotencyKey, key);
});

test("psp.customers.create con las fotos: 202 verifying, con los datos y las tres URLs en orden, sin gender", async () => {
  const api = new MockAPI();
  api.add(202, PSP_CUSTOMER_VERIFYING);
  const customer = await api.client().psp.customers.create({
    selfie_url: PSP_PHOTO_URLS.selfie_url,
    document_back_url: PSP_PHOTO_URLS.document_back_url,
    document_front_url: PSP_PHOTO_URLS.document_front_url,
    person_type: "F",
    name: PSP_NAME,
    tax_id: PSP_TAX_ID,
    identity_verification: null,
  });
  // El sexo lo lee la API del frente del DNI: el body no lleva gender.
  assert.equal(
    api.last.body,
    `{"tax_id":"${PSP_TAX_ID}","name":${PSP_NAME_JSON},"person_type":"F",` +
      `"document_front_url":"${PSP_PHOTO_URLS.document_front_url}",` +
      `"document_back_url":"${PSP_PHOTO_URLS.document_back_url}",` +
      `"selfie_url":"${PSP_PHOTO_URLS.selfie_url}"}`,
  );
  // 202: seguimos en segundo plano y avisamos con psp.customer.activated o psp.customer.rejected.
  assert.equal(customer.lastResponse?.httpStatus, 202);
  assert.equal(customer.constructor, PspCustomer);
  assert.equal(customer.status, "verifying");
  assert.equal(customer.cvu, null);
  assert.equal(customer.identity_verification, null);
});

test("psp.customers.create de una persona jurídica: sin prueba de identidad, 202 verifying", async () => {
  const api = new MockAPI();
  api.add(202, PSP_COMPANY_VERIFYING);
  const company = await api.client().psp.customers.create(
    {
      tax_id: PSP_COMPANY_TAX_ID,
      name: "Distribuidora Ejemplo S. A.",
      person_type: "J",
      external_reference: "empresa-42",
    },
    { idempotencyKey: "alta-empresa-42" },
  );
  assert.equal(
    api.last.body,
    `{"tax_id":"${PSP_COMPANY_TAX_ID}","name":"Distribuidora Ejemplo S. A.","person_type":"J",` +
      '"external_reference":"empresa-42"}',
  );
  assert.equal(api.last.headers.get("idempotency-key"), "alta-empresa-42");
  assert.equal(company.lastResponse?.httpStatus, 202);
  assert.equal(company.id, PSP_COMPANY_ID);
  assert.equal(company.person_type, "J");
  assert.equal(company.status, "verifying");
  assert.deepEqual(company.metadata, {});
});

test("psp.customers.create manda solo lo que pasás, con tu idempotencyKey", async () => {
  const api = new MockAPI();
  api.add(201, PSP_CUSTOMER_ACTIVE);
  const customer = await api.client().psp.customers.create(
    {
      identity_verification: VERIFICATION_ID,
      tax_id: null,
      name: undefined,
      person_type: null,
      document_front_url: undefined,
      document_back_url: null,
      selfie_url: undefined,
      external_reference: null,
      metadata: null,
    },
    { idempotencyKey: "alta-cliente-8812" },
  );
  assert.equal(api.last.body, `{"identity_verification":"${VERIFICATION_ID}"}`);
  assert.equal(api.last.headers.get("idempotency-key"), "alta-cliente-8812");
  assert.equal(customer.lastResponse?.idempotencyKey, "alta-cliente-8812");
});

const PSP_CREATE_NAMES =
  "identity_verification, tax_id, name, person_type, document_front_url, document_back_url, " +
  "selfie_url, external_reference y metadata";
// Sin identity_verification, los TypeError de tax_id y name terminan con esta pista.
const PSP_IDENTITY_HINT =
  " Si tu cliente se verificó con Raya Identity, mandá solo identity_verification.";
const PSP_TAX_ID_MESSAGE =
  "tax_id tiene que ser un string con el CUIL o CUIT de tu cliente, 11 dígitos sin guiones " +
  '(como "27123456781"), no';
const PSP_VERIFICATION_MESSAGE =
  "identity_verification tiene que ser un string con el id de una verificación de Identidad " +
  "(idv_…), no";

const PSP_CREATE_INVALID: Array<
  [string, unknown, typeof TypeError | typeof RangeError, string | RegExp]
> = [
  [
    "params que no son un objeto",
    PSP_TAX_ID,
    TypeError,
    `psp.customers.create recibe un objeto con sus parámetros (${PSP_CREATE_NAMES}).`,
  ],
  [
    "terms_accepted_at, que la API no tiene",
    { identity_verification: VERIFICATION_ID, terms_accepted_at: "2026-10-24T13:05:00-03:00" },
    TypeError,
    `psp.customers.create no acepta "terms_accepted_at": los parámetros son ${PSP_CREATE_NAMES}.`,
  ],
  [
    "gender, que la API ya no tiene (el sexo sale del frente del DNI)",
    { tax_id: PSP_TAX_ID, name: PSP_NAME, person_type: "F", gender: "F", ...PSP_PHOTO_URLS },
    TypeError,
    `psp.customers.create no acepta "gender": los parámetros son ${PSP_CREATE_NAMES}.`,
  ],
  [
    "la idempotencyKey entre los parámetros",
    { identity_verification: VERIFICATION_ID, idempotencyKey: "k" },
    TypeError,
    /^psp\.customers\.create no acepta idempotencyKey entre los parámetros: .*va en las opciones/,
  ],
  [
    "la verificación entera en identity_verification, en vez de su id",
    { identity_verification: IdentityVerification.constructFrom(VERIFICATION_VERIFIED) },
    TypeError,
    `${PSP_VERIFICATION_MESSAGE} IdentityVerification.`,
  ],
  [
    "un identity_verification numérico",
    { identity_verification: 1234 },
    TypeError,
    `${PSP_VERIFICATION_MESSAGE} number.`,
  ],
  [
    "un identity_verification que es un objeto",
    { identity_verification: { id: VERIFICATION_ID }, tax_id: PSP_TAX_ID },
    TypeError,
    `${PSP_VERIFICATION_MESSAGE} un objeto.`,
  ],
  [
    "sin parámetros: falta tax_id, con la pista de Identidad",
    {},
    TypeError,
    `${PSP_TAX_ID_MESSAGE} undefined.${PSP_IDENTITY_HINT}`,
  ],
  ["sin params", undefined, TypeError, `${PSP_TAX_ID_MESSAGE} undefined.${PSP_IDENTITY_HINT}`],
  [
    "un tax_id numérico",
    { tax_id: 27123456781, name: PSP_NAME, person_type: "F", ...PSP_PHOTO_URLS },
    TypeError,
    `${PSP_TAX_ID_MESSAGE} number.${PSP_IDENTITY_HINT}`,
  ],
  [
    "sin tax_id",
    { name: PSP_NAME, person_type: "F", ...PSP_PHOTO_URLS },
    TypeError,
    `${PSP_TAX_ID_MESSAGE} undefined.${PSP_IDENTITY_HINT}`,
  ],
  [
    "identity_verification en null, que es como no mandarlo",
    { identity_verification: null, name: PSP_NAME, person_type: "F" },
    TypeError,
    `${PSP_TAX_ID_MESSAGE} undefined.${PSP_IDENTITY_HINT}`,
  ],
  [
    "un name que no es un string",
    { tax_id: PSP_COMPANY_TAX_ID, name: null, person_type: "J" },
    TypeError,
    "name tiene que ser un string con el nombre y apellido o la razón social de tu cliente, " +
      `no null.${PSP_IDENTITY_HINT}`,
  ],
  [
    "metadata que es un array",
    { identity_verification: VERIFICATION_ID, metadata: ["a"] },
    TypeError,
    'metadata tiene que ser un objeto de string a string, como { plan: "pro" }.',
  ],
  [
    "metadata que es un string",
    {
      tax_id: PSP_COMPANY_TAX_ID,
      name: "Distribuidora Ejemplo S. A.",
      person_type: "J",
      metadata: "plan=pro",
    },
    TypeError,
    /^metadata tiene que ser un objeto/,
  ],
];

for (const [label, params, ErrorType, message] of PSP_CREATE_INVALID) {
  test(`psp.customers.create valida antes de mandar: ${label}`, async () => {
    const api = new MockAPI();
    // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
    const untyped = api.client().psp.customers as any;
    const error = await rejection(untyped.create(params));
    assert.equal(error.constructor, ErrorType);
    if (typeof message === "string") assert.equal(error.message, message);
    else assert.match(error.message, message);
    assert.deepEqual(api.requests, []);
  });
}

test("lo demás lo valida la API: un person_type que falta o un tax_id con guiones llegan", async () => {
  const api = new MockAPI();
  const customers = api.client().psp.customers;
  api.addError(400, "PARAMETER_MISSING", "Falta el parámetro person_type.", {
    field: "person_type",
  });
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  let error = await rejection((customers as any).create({ tax_id: PSP_TAX_ID, name: PSP_NAME }));
  assert.ok(error instanceof InvalidRequestError);
  assert.equal(error.code, "PARAMETER_MISSING");
  assert.equal(error.param, "person_type");
  assert.equal(api.last.body, `{"tax_id":"${PSP_TAX_ID}","name":${PSP_NAME_JSON}}`);
  api.addError(
    400,
    "PARAMETER_INVALID",
    "tax_id tiene que ser un CUIL o CUIT válido: 11 dígitos, sin guiones.",
    { field: "tax_id" },
  );
  error = await rejection(
    customers.create({
      tax_id: "27-12345678-1",
      name: PSP_NAME,
      person_type: "F",
      ...PSP_PHOTO_URLS,
    }),
  );
  assert.ok(error instanceof InvalidRequestError);
  assert.equal(error.param, "tax_id");
  assert.equal(api.requests.length, 2); // los 4xx no se reintentan
});

test("la forma de psp.customers.create la responde la API: datos de más con identity_verification, fotos que faltan o sobran", async () => {
  const api = new MockAPI();
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const untyped = api.client().psp.customers as any;
  const extra =
    "Con identity_verification no mandes tax_id, name, person_type ni fotos: los tomamos de la " +
    "verificación.";

  // Con identity_verification, un dato de más (aunque no sea un string) viaja igual: la API
  // responde con el primero en el orden de CREATE_FIELDS.
  api.addError(400, "PARAMETER_INVALID", extra, { field: "tax_id" });
  let error = await rejection(
    untyped.create({
      person_type: "F",
      name: PSP_NAME,
      tax_id: 27123456781,
      identity_verification: VERIFICATION_ID,
    }),
  );
  assert.ok(error instanceof InvalidRequestError);
  assert.equal(error.code, "PARAMETER_INVALID");
  assert.equal(error.param, "tax_id");
  assert.equal(error.message, extra);
  assert.equal(
    api.last.body,
    `{"identity_verification":"${VERIFICATION_ID}","tax_id":27123456781,` +
      `"name":${PSP_NAME_JSON},"person_type":"F"}`,
  );

  api.addError(400, "PARAMETER_INVALID", extra, { field: "selfie_url" });
  error = await rejection(
    untyped.create({
      identity_verification: VERIFICATION_ID,
      selfie_url: PSP_PHOTO_URLS.selfie_url,
    }),
  );
  assert.equal(error.param, "selfie_url");
  assert.equal(
    api.last.body,
    `{"identity_verification":"${VERIFICATION_ID}","selfie_url":"${PSP_PHOTO_URLS.selfie_url}"}`,
  );

  // Una persona humana sin identity_verification necesita las tres fotos.
  api.addError(400, "PARAMETER_MISSING", "Falta el parámetro document_front_url.", {
    field: "document_front_url",
  });
  error = await rejection(untyped.create({ tax_id: PSP_TAX_ID, name: PSP_NAME, person_type: "F" }));
  assert.equal(error.code, "PARAMETER_MISSING");
  assert.equal(error.param, "document_front_url");
  assert.equal(
    api.last.body,
    `{"tax_id":"${PSP_TAX_ID}","name":${PSP_NAME_JSON},"person_type":"F"}`,
  );

  // Y una persona jurídica no lleva fotos.
  api.addError(400, "PARAMETER_INVALID", "document_front_url solo se usa con person_type F.", {
    field: "document_front_url",
  });
  error = await rejection(
    untyped.create({
      tax_id: PSP_COMPANY_TAX_ID,
      name: "Distribuidora Ejemplo S. A.",
      person_type: "J",
      document_front_url: PSP_PHOTO_URLS.document_front_url,
    }),
  );
  assert.equal(error.param, "document_front_url");
  assert.equal(api.requests.length, 4); // los 4xx no se reintentan
});

test("los chequeos de la verificación los responde la API, en identity_verification", async () => {
  const api = new MockAPI();
  const customers = api.client().psp.customers;
  const messages = [
    // Sin un CUIL válido (por ejemplo, sexo X sin CUIL en el RENAPER) no hay tax_id que tomar.
    "Esa verificación no tiene un CUIL válido: creá el cliente con tax_id, name, person_type y " +
      "las fotos.",
    "identity_verification no puede ser de la persona titular de tu cuenta.",
  ];
  for (const message of messages) {
    api.addError(400, "PARAMETER_INVALID", message, { field: "identity_verification" });
    const error = await rejection(customers.create({ identity_verification: VERIFICATION_ID }));
    assert.ok(error instanceof InvalidRequestError);
    assert.equal(error.code, "PARAMETER_INVALID");
    assert.equal(error.param, "identity_verification");
    assert.equal(error.message, message);
  }
  // Una verificación que ya usaste para otro cliente: el id de ese cliente, en error.data.customer.
  api.addError(409, "CUSTOMER_ALREADY_EXISTS", "Ya tenés un cliente con ese CUIL o CUIT.", {
    customer: PSP_CUSTOMER_ID,
  });
  const error = await rejection(customers.create({ identity_verification: VERIFICATION_ID }));
  assert.ok(error instanceof ConflictError);
  assert.equal(error.code, "CUSTOMER_ALREADY_EXISTS");
  assert.equal(error.data?.customer, PSP_CUSTOMER_ID);
  assert.equal(api.requests.length, 3);
  for (const request of api.requests) {
    assert.equal(request.body, `{"identity_verification":"${VERIFICATION_ID}"}`);
  }
});

test("psp: las opciones se validan antes de mandar y los GET no llevan Idempotency-Key", async () => {
  const api = new MockAPI();
  const psp = api.client().psp;
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const untyped = psp as any;
  const params: PspCustomerCreateParams = { tax_id: PSP_TAX_ID, name: PSP_NAME, person_type: "J" };
  let error = await rejection(psp.customers.create(params, { idempotencyKey: "con espacios" }));
  assert.ok(error instanceof RangeError);
  assert.match(error.message, /^idempotencyKey tiene que tener de 1 a 255 caracteres/);
  error = await rejection(untyped.customers.block(PSP_CUSTOMER_ID, { idempotency_key: "k" }));
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /¿quisiste decir idempotencyKey\?/);
  for (const call of [
    () => untyped.customers.retrieve(PSP_CUSTOMER_ID, { idempotencyKey: "k" }),
    () => untyped.customers.retrieveBalance(PSP_CUSTOMER_ID, { idempotencyKey: "k" }),
    () => untyped.customers.list({ status: "active" }, { idempotencyKey: "k" }),
    () => untyped.transfers.retrieve(PSP_OUTBOUND_ID, { idempotencyKey: "k" }),
    () => untyped.transfers.list({ customer: PSP_CUSTOMER_ID }, { idempotencyKey: "k" }),
    () => untyped.balance.retrieve({ idempotencyKey: "k" }),
  ]) {
    error = await rejection(call());
    assert.ok(error instanceof RangeError);
    assert.equal(error.message, "La Idempotency-Key solo va en los POST.");
  }
  assert.deepEqual(api.requests, []);
});

test("psp.customers.retrieve", async () => {
  const api = new MockAPI();
  api.add(200, PSP_CUSTOMER_WITH_BALANCE);
  const customer = await api.client().psp.customers.retrieve(PSP_CUSTOMER_ID);
  const request = api.last;
  assert.deepEqual(
    [request.method, request.url.href],
    ["GET", `${PSP_CUSTOMERS_URL}/${PSP_CUSTOMER_ID}`],
  );
  assert.equal(request.body, undefined);
  assert.equal(request.headers.get("content-type"), null);
  assert.equal(request.headers.get("idempotency-key"), null);
  assert.equal(request.headers.get("authorization"), `Bearer ${TEST_KEY}`);
  assert.equal(customer.constructor, PspCustomer);
  assert.equal(customer.balance, 23649.5);
  assert.equal(customer.cvu?.holder_name, "MARIA LAURA EJEMPLO");
  assert.equal(customer.cvu?.status, "active");
  assert.equal(customer.blocked_by, null);
  assert.equal(customer.decline_reason, null);
  assert.equal(Object.getPrototypeOf(customer.cvu), Object.prototype);
  assert.equal(customer.lastResponse?.httpStatus, 200);
  assert.equal(customer.lastResponse?.idempotencyKey, null);
});

test("psp.customers.retrieve: rejected y failed traen su motivo", async () => {
  const api = new MockAPI();
  api.add(200, PSP_CUSTOMER_REJECTED);
  api.add(200, PSP_CUSTOMER_FAILED);
  const rejected = await api.client().psp.customers.retrieve(PSP_CUSTOMER_ID);
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.decline_reason?.code, "face_mismatch");
  assert.equal(rejected.cvu, null);
  const failed = await api.client().psp.customers.retrieve(PSP_CUSTOMER_ID);
  assert.equal(failed.status, "failed");
  assert.equal(failed.decline_reason?.code, "bank_rejected");
});

test("psp: los ids van codificados en la ruta y con la clave de la llamada", async () => {
  const api = new MockAPI();
  api.add(200, PSP_CUSTOMER_ACTIVE);
  await api.client().psp.customers.retrieve("../balance");
  assert.equal(api.last.url.href, `${PSP_CUSTOMERS_URL}/..%2Fbalance`);
  api.add(200, PSP_CUSTOMER_BLOCKED);
  await api.client().psp.customers.block("pspc x/y", { apiKey: OTHER_KEY });
  assert.equal(api.last.url.pathname, "/v1/psp/customers/pspc%20x%2Fy/block");
  assert.equal(api.last.headers.get("authorization"), `Bearer ${OTHER_KEY}`);
  api.add(200, PSP_TRANSFER_INBOUND);
  await api.client().psp.transfers.retrieve("pspt_1?x=#y");
  assert.equal(api.last.url.pathname, "/v1/psp/transfers/pspt_1%3Fx%3D%23y");
  assert.equal(api.last.url.search, "");
});

for (const method of ["retrieve", "retrieveBalance", "block", "unblock", "close", "recreate"]) {
  for (const [value, message] of [
    ["", "customerId no puede estar vacío."],
    ["   ", "customerId no puede estar vacío."],
    [".", 'customerId no puede ser "." ni "..".'],
    ["..", 'customerId no puede ser "." ni "..".'],
  ]) {
    test(`psp.customers.${method} rechaza el id ${JSON.stringify(value)}`, async () => {
      const api = new MockAPI();
      // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
      const untyped = api.client().psp.customers as any;
      const error = await rejection(untyped[method](value));
      assert.ok(error instanceof RangeError);
      assert.equal(error.message, message);
      assert.deepEqual(api.requests, []);
    });
  }

  test(`psp.customers.${method}: el id tiene que ser un string`, async () => {
    const api = new MockAPI();
    // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
    const untyped = api.client().psp.customers as any;
    const error = await rejection(untyped[method](1234));
    assert.ok(error instanceof TypeError);
    assert.equal(error.message, "customerId tiene que ser un string, no number.");
    assert.deepEqual(api.requests, []);
  });
}

test("psp.transfers.retrieve rechaza los ids vacíos, «.» y «..» y los que no son string", async () => {
  const api = new MockAPI();
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const untyped = api.client().psp.transfers as any;
  for (const [value, ErrorType, message] of [
    ["", RangeError, "transferId no puede estar vacío."],
    ["..", RangeError, 'transferId no puede ser "." ni "..".'],
    [42, TypeError, "transferId tiene que ser un string, no number."],
  ] as const) {
    const error = await rejection(untyped.retrieve(value));
    assert.equal(error.constructor, ErrorType);
    assert.equal(error.message, message);
  }
  assert.deepEqual(api.requests, []);
});

test("psp.customers.list con todos los filtros, en el orden del contrato", async () => {
  const api = new MockAPI();
  api.add(200, PSP_CUSTOMER_LIST);
  const page = await api.client().psp.customers.list({
    cursor: "c1",
    limit: 50,
    created_lt: "2026-11-01T00:00:00-03:00",
    created_gte: new Date("2026-10-01T03:00:00Z"),
    external_reference: "cliente 8812",
    status: "active",
  });
  assert.equal(page.constructor, ListObject);
  assert.deepEqual(
    [...page].map((customer) => customer.constructor),
    [PspCustomer, PspCustomer],
  );
  assert.equal(page.has_more, true);
  assert.equal(page.next_cursor, PSP_CUSTOMER_LIST.next_cursor);
  const request = api.last;
  assert.deepEqual([request.method, request.url.pathname], ["GET", "/v1/psp/customers"]);
  assert.equal(request.body, undefined);
  // El orden de LIST_CUSTOMER_FIELDS de la API.
  assert.equal(
    request.url.search,
    "?status=active&external_reference=cliente+8812&created_gte=2026-10-01T03%3A00%3A00.000Z" +
      "&created_lt=2026-11-01T00%3A00%3A00-03%3A00&limit=50&cursor=c1",
  );
});

test("psp.customers.list sin filtros pide la URL pelada", async () => {
  const api = new MockAPI();
  api.add(200, { ...PSP_CUSTOMER_LIST, has_more: false, next_cursor: null });
  await api.client().psp.customers.list();
  assert.equal(api.last.url.href, PSP_CUSTOMERS_URL);
});

const PSP_LIST_INVALID: Array<
  [string, string, unknown, typeof TypeError | typeof RangeError, string]
> = [
  [
    "customers",
    "tax_id, que iría en la URL (es un dato personal)",
    { tax_id: PSP_TAX_ID },
    TypeError,
    'psp.customers.list no acepta "tax_id": los parámetros son status, external_reference, ' +
      "created_gte, created_lt, limit y cursor.",
  ],
  [
    "customers",
    "direction, que es de las transferencias",
    { direction: "inbound" },
    TypeError,
    'psp.customers.list no acepta "direction": los parámetros son status, external_reference, ' +
      "created_gte, created_lt, limit y cursor.",
  ],
  [
    "customers",
    "params que no son un objeto",
    "active",
    TypeError,
    "psp.customers.list recibe un objeto con sus parámetros (status, external_reference, " +
      "created_gte, created_lt, limit y cursor).",
  ],
  [
    "customers",
    "limit con decimales",
    { limit: 1.5 },
    TypeError,
    "limit no acepta un número con decimales.",
  ],
  ["customers", "un boolean", { status: true }, TypeError, "status no puede ser un boolean."],
  [
    "customers",
    "un Date inválido",
    { created_gte: new Date("x") },
    RangeError,
    "created_gte es una fecha inválida.",
  ],
  [
    "transfers",
    "external_reference, que es de los clientes",
    { external_reference: "cliente-8812" },
    TypeError,
    'psp.transfers.list no acepta "external_reference": los parámetros son customer, direction, ' +
      "status, created_gte, created_lt, limit y cursor.",
  ],
  [
    "transfers",
    "params que no son un objeto",
    PSP_CUSTOMER_ID,
    TypeError,
    "psp.transfers.list recibe un objeto con sus parámetros (customer, direction, status, " +
      "created_gte, created_lt, limit y cursor).",
  ],
  [
    "transfers",
    "un customer que es un objeto",
    { customer: {} },
    TypeError,
    "customer no acepta un objeto.",
  ],
];

for (const [service, label, params, ErrorType, message] of PSP_LIST_INVALID) {
  test(`psp.${service}.list valida antes de mandar: ${label}`, async () => {
    const api = new MockAPI();
    // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
    const untyped = api.client().psp as any;
    const error = await rejection(untyped[service].list(params));
    assert.equal(error.constructor, ErrorType);
    assert.equal(error.message, message);
    assert.deepEqual(api.requests, []);
  });
}

test("psp.customers.retrieveBalance", async () => {
  const api = new MockAPI();
  api.add(200, PSP_CUSTOMER_BALANCE);
  const balance = await api.client().psp.customers.retrieveBalance(PSP_CUSTOMER_ID);
  const request = api.last;
  assert.deepEqual(
    [request.method, request.url.href],
    ["GET", `${PSP_CUSTOMERS_URL}/${PSP_CUSTOMER_ID}/balance`],
  );
  assert.equal(request.body, undefined);
  assert.equal(request.headers.get("idempotency-key"), null);
  assert.equal(balance.constructor, PspCustomerBalance);
  assert.equal(balance.object, "psp.customer_balance");
  assert.equal(balance.customer, PSP_CUSTOMER_ID);
  assert.equal(balance.available, 23649.5);
  assert.equal(balance.transferable, 23649.5);
  assert.equal(balance.currency, "ARS");
});

const PSP_ACTIONS: Array<["block" | "unblock" | "close" | "recreate", Record<string, unknown>]> = [
  ["block", PSP_CUSTOMER_BLOCKED],
  ["unblock", PSP_CUSTOMER_WITH_BALANCE],
  ["close", PSP_CUSTOMER_CLOSED],
  ["recreate", PSP_CUSTOMER_ACTIVE],
];

for (const [action, response] of PSP_ACTIONS) {
  test(`psp.customers.${action} va sin body y con una Idempotency-Key generada`, async () => {
    const api = new MockAPI();
    api.add(200, response);
    const customer = await api.client().psp.customers[action](PSP_CUSTOMER_ID);
    const request = api.last;
    assert.deepEqual(
      [request.method, request.url.href],
      ["POST", `${PSP_CUSTOMERS_URL}/${PSP_CUSTOMER_ID}/${action}`],
    );
    assert.equal(request.body, undefined); // sin body, como un reembolso
    assert.equal(request.headers.get("content-type"), null);
    assert.equal(request.headers.get("authorization"), `Bearer ${TEST_KEY}`);
    const key = request.headers.get("idempotency-key") ?? "";
    assert.match(key, UUID_V4);
    assert.equal(customer.lastResponse?.idempotencyKey, key);
    assert.equal(customer.constructor, PspCustomer);
    assert.equal(customer.status, response.status);
  });

  test(`psp.customers.${action} con tu idempotencyKey`, async () => {
    const api = new MockAPI();
    api.add(200, response);
    const customer = await api
      .client()
      .psp.customers[action](PSP_CUSTOMER_ID, { idempotencyKey: `${action}-1` });
    assert.equal(api.last.headers.get("idempotency-key"), `${action}-1`);
    assert.equal(customer.lastResponse?.idempotencyKey, `${action}-1`);
  });
}

test("psp.customers.close: el CVU queda closing, con el saldo intacto", async () => {
  const api = new MockAPI();
  api.add(200, PSP_CUSTOMER_CLOSED);
  const customer = await api.client().psp.customers.close(PSP_CUSTOMER_ID);
  assert.equal(customer.status, "closed");
  assert.equal(customer.balance, 23649.5);
  assert.equal(customer.cvu?.status, "closing");
  assert.equal(customer.cvu?.closed_at, "2026-10-24T19:00:00Z");
});

test("psp.customers.recreate: 202 pending mientras creamos el CVU", async () => {
  const api = new MockAPI();
  api.add(202, PSP_CUSTOMER_PENDING);
  const customer = await api.client().psp.customers.recreate(PSP_CUSTOMER_ID);
  assert.equal(customer.lastResponse?.httpStatus, 202);
  assert.equal(customer.status, "pending");
  assert.equal(customer.cvu?.account, PSP_ACCOUNT);
  assert.equal(customer.cvu?.alias, null);
});

test("psp.customers: CUSTOMER_STATUS_CONFLICT es ConflictError, con status y blocked_by, sin reintentos", async () => {
  const api = new MockAPI();
  const customers = api.client().psp.customers;
  const message = "El cliente no está en un estado que permita esta operación. Revisá su status.";
  api.addError(409, "CUSTOMER_STATUS_CONFLICT", message, { status: "blocked", blocked_by: "raya" });
  let error = await rejection(customers.unblock(PSP_CUSTOMER_ID, { idempotencyKey: "u-1" }));
  assert.ok(error instanceof ConflictError);
  assert.ok(!(error instanceof IdempotencyError));
  assert.equal(error.code, "CUSTOMER_STATUS_CONFLICT");
  assert.equal(error.message, message);
  assert.deepEqual(error.data, { status: "blocked", blocked_by: "raya" });
  assert.equal(error.idempotencyKey, "u-1");
  api.addError(409, "CUSTOMER_STATUS_CONFLICT", message, { status: "verifying", blocked_by: null });
  error = await rejection(customers.block(PSP_CUSTOMER_ID));
  assert.ok(error instanceof ConflictError);
  assert.deepEqual(error.data, { status: "verifying", blocked_by: null });
  api.addError(404, "CUSTOMER_NOT_FOUND", "No encontramos ese cliente.");
  error = await rejection(customers.close(PSP_CUSTOMER_ID));
  assert.ok(error instanceof NotFoundError);
  assert.equal(error.code, "CUSTOMER_NOT_FOUND");
  assert.equal(error.data, null);
  assert.equal(api.requests.length, 3); // un 409 que no es de idempotencia no se reintenta
});

test("psp: sin clave propia, cada create y cada acción genera la suya", async () => {
  const api = new MockAPI();
  const customers = api.client().psp.customers;
  api.add(201, PSP_CUSTOMER_ACTIVE);
  api.add(201, PSP_CUSTOMER_ACTIVE);
  api.add(200, PSP_CUSTOMER_BLOCKED);
  api.add(200, PSP_CUSTOMER_BLOCKED);
  const params: PspCustomerCreateParams = { identity_verification: VERIFICATION_ID };
  const results = [
    await customers.create(params),
    await customers.create(params),
    await customers.block(PSP_CUSTOMER_ID),
    await customers.block(PSP_CUSTOMER_ID),
  ];
  const keys = api.requests.map((request) => request.headers.get("idempotency-key") ?? "");
  for (const key of keys) assert.match(key, UUID_V4);
  assert.equal(new Set(keys).size, 4);
  assert.deepEqual(
    results.map((customer) => customer.lastResponse?.idempotencyKey),
    keys,
  );
});

test("psp.customers.create reintenta con la misma Idempotency-Key y el mismo body", async () => {
  const api = new MockAPI();
  // El banco no respondió y no se creó nada: el SDK reintenta (Retry-After de 60 s o menos).
  api.addError(503, "BANK_UNAVAILABLE", "No pudimos completar la operación.", null, {
    headers: { "Retry-After": "60" },
  });
  api.add(201, PSP_CUSTOMER_ACTIVE);
  const customer = await api.client().psp.customers.create({
    identity_verification: VERIFICATION_ID,
    external_reference: "cliente-8812",
  });
  assert.equal(customer.id, PSP_CUSTOMER_ID);
  assert.equal(api.requests.length, 2);
  const [first, second] = api.requests;
  assert.match(first?.headers.get("idempotency-key") ?? "", UUID_V4);
  assert.equal(second?.headers.get("idempotency-key"), first?.headers.get("idempotency-key"));
  assert.equal(
    first?.body,
    `{"identity_verification":"${VERIFICATION_ID}","external_reference":"cliente-8812"}`,
  );
  assert.equal(second?.body, first?.body);
});

test("psp.transfers.create: el body en el orden del contrato y la idempotencyKey tuya", async () => {
  const api = new MockAPI();
  api.add(201, PSP_TRANSFER_OUTBOUND_PENDING);
  const transfer = await api.client().psp.transfers.create(
    {
      destination: PSP_DESTINATION,
      amount: new FakeDecimal("18350.50"),
      customer: PSP_CUSTOMER_ID,
    },
    { idempotencyKey: IDEMPOTENCY_KEY },
  );
  assert.equal(transfer.constructor, PspTransfer);
  assert.equal(transfer.object, "psp.transfer");
  assert.equal(transfer.id, PSP_OUTBOUND_ID);
  assert.equal(transfer.customer, PSP_CUSTOMER_ID);
  assert.equal(transfer.direction, "outbound");
  assert.equal(transfer.status, "pending");
  assert.equal(transfer.amount, 18350.5);
  assert.equal(transfer.fee, 61.37);
  assert.equal(transfer.net_amount, 18289.13);
  assert.equal(transfer.account, PSP_ACCOUNT);
  assert.equal(transfer.counterparty.name, "Proveedora Ejemplo S. A.");
  assert.equal(Object.getPrototypeOf(transfer.counterparty), Object.prototype);
  assert.equal(transfer.reference, null);
  assert.equal(transfer.lastResponse?.httpStatus, 201);
  const request = api.last;
  assert.deepEqual([request.method, request.url.href], ["POST", PSP_TRANSFERS_URL]);
  // customer, amount y destination: el orden de TRANSFER_FIELDS, con el monto exacto.
  assert.equal(request.body, PSP_TRANSFER_BODY);
  assert.equal(request.headers.get("content-type"), "application/json");
  assert.equal(request.headers.get("idempotency-key"), IDEMPOTENCY_KEY);
  assert.equal(request.headers.get("authorization"), `Bearer ${TEST_KEY}`);
  assert.equal(transfer.lastResponse?.idempotencyKey, IDEMPOTENCY_KEY);
});

for (const [amount, expected] of [
  [18350.5, "18350.5"],
  ["18350.50", "18350.5"],
  [" 1500 ", "1500"],
  [1, "1"],
  [18350n, "18350"],
] as const) {
  test(`psp.transfers.create con el monto ${JSON.stringify(String(amount))}`, async () => {
    const api = new MockAPI();
    api.add(201, PSP_TRANSFER_OUTBOUND_PENDING);
    await api
      .client()
      .psp.transfers.create(
        { customer: PSP_CUSTOMER_ID, amount, destination: "proveedor.ejemplo" },
        { idempotencyKey: "k" },
      );
    assert.equal(
      api.last.body,
      `{"customer":"${PSP_CUSTOMER_ID}","amount":${expected},"destination":"proveedor.ejemplo"}`,
    );
  });
}

test("psp.transfers.create a una cuenta de Raya vuelve completed, con reference", async () => {
  const api = new MockAPI();
  api.add(201, PSP_TRANSFER_OUTBOUND_COMPLETED);
  const transfer = await api
    .client()
    .psp.transfers.create(PSP_TRANSFER_PARAMS, { idempotencyKey: "k" });
  assert.equal(transfer.status, "completed");
  assert.equal(transfer.reference, "P5W9K2T7N4X1R8M3V6B0QH");
});

test("psp.transfers.create exige la idempotencyKey y valida antes de mandar", async () => {
  const api = new MockAPI();
  const transfers = api.client().psp.transfers;
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const untyped = transfers as any;
  let error = await rejection(untyped.create(PSP_TRANSFER_PARAMS));
  assert.ok(error instanceof TypeError);
  assert.equal(error.message, PSP_KEY_MESSAGE);
  error = await rejection(untyped.create(PSP_TRANSFER_PARAMS, {}));
  assert.ok(error instanceof TypeError);
  assert.equal(error.message, PSP_KEY_MESSAGE);
  error = await rejection(untyped.create(PSP_TRANSFER_PARAMS, { idempotencyKey: null }));
  assert.ok(error instanceof TypeError);
  assert.equal(error.message, PSP_KEY_MESSAGE);
  error = await rejection(untyped.create(PSP_TRANSFER_PARAMS, { idempotencyKey: 123 }));
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /^idempotencyKey tiene que ser un string/);
  error = await rejection(
    transfers.create(PSP_TRANSFER_PARAMS, { idempotencyKey: "con espacios" }),
  );
  assert.ok(error instanceof RangeError);
  assert.match(error.message, /idempotencyKey/);
  error = await rejection(
    untyped.create({ ...PSP_TRANSFER_PARAMS, customer: 42 }, { idempotencyKey: "k" }),
  );
  assert.ok(error instanceof TypeError);
  assert.equal(
    error.message,
    "customer tiene que ser un string con el id del cliente (pspc_…), no number.",
  );
  error = await rejection(
    untyped.create({ amount: 1, destination: PSP_DESTINATION }, { idempotencyKey: "k" }),
  );
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /^customer tiene que ser un string/);
  error = await rejection(
    untyped.create({ ...PSP_TRANSFER_PARAMS, destination: 123 }, { idempotencyKey: "k" }),
  );
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /^destination tiene que ser un string/);
  error = await rejection(
    untyped.create({ customer: PSP_CUSTOMER_ID, destination: "x" }, { idempotencyKey: "k" }),
  );
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /^amount/);
  error = await rejection(
    untyped.create({ ...PSP_TRANSFER_PARAMS, amount: true }, { idempotencyKey: "k" }),
  );
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /^amount no puede ser un boolean/);
  error = await rejection(
    untyped.create({ ...PSP_TRANSFER_PARAMS, amount: "NaN" }, { idempotencyKey: "k" }),
  );
  assert.ok(error instanceof RangeError);
  assert.match(error.message, /^amount tiene que ser un número finito/);
  error = await rejection(
    untyped.create({ ...PSP_TRANSFER_PARAMS, idempotencyKey: "k" }, { idempotencyKey: "k" }),
  );
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /va en las opciones/);
  assert.deepEqual(api.requests, []);
});

for (const field of ["description", "external_reference", "tax_id"]) {
  test(`psp.transfers.create no acepta ${field}: el body es customer, amount y destination`, async () => {
    const api = new MockAPI();
    // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
    const untyped = api.client().psp.transfers as any;
    const error = await rejection(
      untyped.create({ ...PSP_TRANSFER_PARAMS, [field]: "x" }, { idempotencyKey: "k" }),
    );
    assert.ok(error instanceof TypeError);
    assert.equal(
      error.message,
      `psp.transfers.create no acepta "${field}": los parámetros son customer, amount y destination.`,
    );
    assert.deepEqual(api.requests, []);
  });
}

test("psp.transfers.create reintenta con la misma Idempotency-Key y el mismo body", async () => {
  const api = new MockAPI();
  api.failWith(networkError("ECONNRESET"));
  api.addError(503, "TEMPORARILY_UNAVAILABLE");
  api.add(201, PSP_TRANSFER_OUTBOUND_PENDING);
  const transfer = await api
    .client()
    .psp.transfers.create(PSP_TRANSFER_PARAMS, { idempotencyKey: IDEMPOTENCY_KEY });
  assert.equal(transfer.id, PSP_OUTBOUND_ID);
  assert.equal(api.requests.length, 3);
  for (const request of api.requests) {
    assert.equal(request.headers.get("idempotency-key"), IDEMPOTENCY_KEY);
    assert.equal(request.body, PSP_TRANSFER_BODY);
  }
});

test("psp.transfers.retrieve", async () => {
  const api = new MockAPI();
  api.add(200, PSP_TRANSFER_INBOUND);
  const transfer = await api.client().psp.transfers.retrieve(PSP_INBOUND_ID);
  const request = api.last;
  assert.deepEqual(
    [request.method, request.url.href],
    ["GET", `${PSP_TRANSFERS_URL}/${PSP_INBOUND_ID}`],
  );
  assert.equal(request.body, undefined);
  assert.equal(request.headers.get("idempotency-key"), null);
  assert.equal(transfer.constructor, PspTransfer);
  assert.equal(transfer.direction, "inbound");
  assert.equal(transfer.status, "completed");
  assert.equal(transfer.net_amount, 41866.1);
  assert.equal(transfer.counterparty.alias, null);
  assert.equal(transfer.description, "Alquiler noviembre");

  api.addError(404, "TRANSFER_NOT_FOUND", "No encontramos esa transferencia.");
  const error = await rejection(api.client().psp.transfers.retrieve(PSP_OUTBOUND_ID));
  assert.ok(error instanceof NotFoundError);
  assert.equal(error.code, "TRANSFER_NOT_FOUND");
  assert.equal(api.requests.length, 2);
});

test("psp.transfers.list con todos los filtros, en el orden del contrato", async () => {
  const api = new MockAPI();
  api.add(200, PSP_TRANSFER_LIST);
  const page = await api.client().psp.transfers.list({
    cursor: "c1",
    limit: 2,
    created_lt: "2026-10-25T00:00:00+00:00",
    created_gte: new Date(Date.UTC(2026, 9, 24, 3)),
    status: "completed",
    direction: "outbound",
    customer: PSP_CUSTOMER_ID,
  });
  assert.equal(page.constructor, ListObject);
  assert.deepEqual(
    [...page].map((transfer) => transfer.constructor),
    [PspTransfer, PspTransfer],
  );
  assert.equal(page.has_more, false);
  const request = api.last;
  assert.deepEqual([request.method, request.url.pathname], ["GET", "/v1/psp/transfers"]);
  // El orden de LIST_TRANSFER_FIELDS de la API; el "+" de un offset viaja codificado.
  assert.equal(
    request.url.search,
    `?customer=${PSP_CUSTOMER_ID}&direction=outbound&status=completed` +
      "&created_gte=2026-10-24T03%3A00%3A00.000Z&created_lt=2026-10-25T00%3A00%3A00%2B00%3A00" +
      "&limit=2&cursor=c1",
  );
  api.add(200, PSP_TRANSFER_LIST);
  await api.client().psp.transfers.list();
  assert.equal(api.last.url.href, PSP_TRANSFERS_URL);
});

test("psp.balance.retrieve", async () => {
  const api = new MockAPI();
  api.add(200, PSP_BALANCE);
  const balance = await api.client().psp.balance.retrieve();
  const request = api.last;
  assert.deepEqual(
    [request.method, request.url.href],
    ["GET", "https://api.raya.cash/v1/psp/balance"],
  );
  assert.equal(request.body, undefined);
  assert.equal(request.headers.get("idempotency-key"), null);
  assert.equal(request.headers.get("authorization"), `Bearer ${TEST_KEY}`);
  assert.equal(balance.constructor, PspBalance);
  assert.equal(balance.object, "psp.balance");
  assert.equal(balance.available, 640200.5);
  assert.equal(balance.customers_balance, 512875.25);
  assert.equal(balance.currency, "ARS");
  api.add(200, PSP_BALANCE);
  await api.client().psp.balance.retrieve({ apiKey: OTHER_KEY, timeout: 5_000 });
  assert.equal(api.last.headers.get("authorization"), `Bearer ${OTHER_KEY}`);
});

test("los errores de Raya PSP: la clase sale del status y ninguno se reintenta", async () => {
  const api = new MockAPI();
  const psp = api.client().psp;
  const create = () => psp.customers.create({ identity_verification: VERIFICATION_ID });
  // CUSTOMER_DATA_MISMATCH y TAX_ID_NOT_REGISTERED son de una persona jurídica (el RNS).
  const createCompany = () =>
    psp.customers.create({
      tax_id: PSP_COMPANY_TAX_ID,
      name: "Distribuidora Ejemplo S. A.",
      person_type: "J",
    });
  const transfer = () => psp.transfers.create(PSP_TRANSFER_PARAMS, { idempotencyKey: "t-1" });

  api.addError(403, "PSP_NOT_ACTIVATED");
  let error = await rejection(create());
  assert.ok(error instanceof PermissionDeniedError);
  assert.equal(error.code, "PSP_NOT_ACTIVATED");

  api.addError(409, "CUSTOMER_ALREADY_EXISTS", "Ya tenés un cliente con ese CUIL o CUIT.", {
    customer: PSP_CUSTOMER_ID,
  });
  error = await rejection(create());
  assert.ok(error instanceof ConflictError);
  assert.equal(error.data?.customer, PSP_CUSTOMER_ID);

  api.addError(422, "CUSTOMER_DATA_MISMATCH", "Mensaje.", { field: "name" });
  error = await rejection(createCompany());
  assert.ok(error instanceof UnprocessableEntityError);
  assert.deepEqual(error.data, { field: "name" });

  api.addError(422, "TAX_ID_NOT_REGISTERED");
  error = await rejection(createCompany());
  assert.ok(error instanceof UnprocessableEntityError);
  assert.equal(error.code, "TAX_ID_NOT_REGISTERED");

  api.addError(404, "CUSTOMER_NOT_FOUND", "No encontramos ese cliente.", { field: "customer" });
  error = await rejection(transfer());
  assert.ok(error instanceof NotFoundError);
  assert.equal(error.param, "customer");
  assert.equal(error.idempotencyKey, "t-1");

  for (const code of [
    "INSUFFICIENT_BALANCE",
    "CUSTOMER_INSUFFICIENT_BALANCE",
    "DESTINATION_INACTIVE",
    "DESTINATION_NOT_SUPPORTED",
  ]) {
    api.addError(422, code);
    error = await rejection(transfer());
    assert.ok(error instanceof UnprocessableEntityError, code);
    assert.equal(error.code, code);
  }

  api.addError(403, "TRANSFERS_BLOCKED");
  error = await rejection(transfer());
  assert.ok(error instanceof PermissionDeniedError);

  api.addError(
    403,
    "SANDBOX_NOT_SUPPORTED",
    "Este endpoint todavía no está disponible en un sandbox.",
  );
  error = await rejection(psp.customers.list());
  assert.ok(error instanceof PermissionDeniedError);
  assert.equal(error.code, "SANDBOX_NOT_SUPPORTED");

  // 503 API_UNAVAILABLE es un interruptor: tampoco se reintenta.
  api.addError(503, "API_UNAVAILABLE");
  error = await rejection(psp.balance.retrieve());
  assert.ok(error instanceof APIError);
  assert.equal(error.code, "API_UNAVAILABLE");

  assert.equal(api.requests.length, 12);
});

test("psp.customers.create: el tope de rechazos por CUIL (429 con Retry-After largo) no se reintenta", async () => {
  const api = new MockAPI();
  api.addError(
    429,
    "RATE_LIMITED",
    "Hiciste demasiadas requests. Esperá unos segundos y probá de nuevo.",
    { limit: "kyc_per_tax_id" },
    { headers: { "Retry-After": "3600" } },
  );
  const error = await rejection(
    api.client().psp.customers.create({
      tax_id: PSP_TAX_ID,
      name: PSP_NAME,
      person_type: "F",
      ...PSP_PHOTO_URLS,
    }),
  );
  assert.ok(error instanceof RateLimitError);
  assert.equal(error.retryAfter, 3600);
  assert.deepEqual(error.data, { limit: "kyc_per_tax_id" });
  assert.equal(api.requests.length, 1); // más de 60 s: el SDK no espera, lanza el error
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
