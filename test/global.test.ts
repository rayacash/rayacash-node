// El estilo global: config.apiKey + Payment.create(…), OAuth.token(…), Checkout.create(…).

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  APIError,
  AuthenticationError,
  Balance,
  Checkout,
  config,
  ListObject,
  OAuth,
  OAuthToken,
  Payment,
  setAppInfo,
  Transfer,
  User,
  Webhook,
  WebhookSignature,
} from "../src/index.ts";
import {
  ACCESS_TOKEN,
  BALANCE,
  CHECKOUT_ID,
  CHECKOUT_ITEMS,
  CHECKOUT_PENDING,
  CHECKOUT_REFUNDED,
  CHECKOUT_SUCCEEDED,
  CLIENT_ID,
  CLIENT_SECRET,
  EVENT_CHECKOUT_SUCCEEDED,
  EVENT_PAYMENT_SUCCEEDED,
  OAUTH_CODE,
  OAUTH_TOKEN,
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
  WEBHOOK_SECRET,
} from "./fixtures.ts";
import { isolate, MockAPI, OTHER_KEY, rejection, TEST_KEY, thrown } from "./helpers.ts";

const state = isolate();

function globalAPI(): MockAPI {
  const api = new MockAPI();
  config.apiKey = TEST_KEY;
  config.fetch = api.fetch;
  return api;
}

test("cada endpoint", async () => {
  const api = globalAPI();
  api.add(200, BALANCE);
  assert.equal((await Balance.retrieve()).constructor, Balance);
  assert.equal(api.last.headers.get("authorization"), `Bearer ${TEST_KEY}`);

  api.add(201, TRANSFER_OUTBOUND_PENDING);
  const transfer = await Transfer.create(
    { amount: 25000, destination: "proveedor.ejemplo" },
    { idempotencyKey: "k" },
  );
  assert.equal(transfer.constructor, Transfer);
  assert.equal(api.last.headers.get("idempotency-key"), "k");

  api.add(200, TRANSFER_INBOUND);
  assert.equal((await Transfer.retrieve(TRANSFER_INBOUND.id)).direction, "inbound");

  api.add(200, TRANSFER_LIST);
  const page = await Transfer.list({ direction: "inbound", limit: 2 });
  assert.equal(page.constructor, ListObject);
  assert.equal(api.last.url.searchParams.get("limit"), "2");

  api.add(201, PAYMENT_PENDING);
  const payment = await Payment.create({ amount: 15000, metadata: { cliente_id: "8812" } });
  assert.equal(payment.constructor, Payment);
  assert.deepEqual(api.lastJson(), { amount: 15000, metadata: { cliente_id: "8812" } });

  api.add(200, PAYMENT_SUCCEEDED);
  assert.equal((await Payment.retrieve(PAYMENT_ID)).status, "succeeded");

  api.add(200, PAYMENT_REFUNDED);
  assert.equal((await Payment.refund(PAYMENT_ID, { idempotencyKey: "r-1" })).status, "refunded");
  assert.equal(api.last.url.pathname, `/v1/payments/${PAYMENT_ID}/refund`);
  assert.equal(api.last.headers.get("idempotency-key"), "r-1");
});

test("payment.refund() desde la instancia", async () => {
  const api = globalAPI();
  api.add(200, PAYMENT_SUCCEEDED);
  const payment = await Payment.retrieve(PAYMENT_ID);
  api.add(200, PAYMENT_REFUNDED);
  const refunded = await payment.refund();
  assert.equal(refunded.status, "refunded");
  assert.equal(payment.status, "succeeded"); // devuelve un pago nuevo, no muta el original
  assert.equal(api.last.url.pathname, `/v1/payments/${PAYMENT_ID}/refund`);
});

test("payment.refund() usa el cliente del que vino", async () => {
  const globalApi = globalAPI();
  const otherApi = new MockAPI();
  const client = otherApi.client(OTHER_KEY);
  otherApi.add(200, PAYMENT_SUCCEEDED);
  const payment = await client.payments.retrieve(PAYMENT_ID);
  otherApi.add(200, PAYMENT_REFUNDED);
  await payment.refund();
  assert.equal(otherApi.last.headers.get("authorization"), `Bearer ${OTHER_KEY}`);
  assert.deepEqual(globalApi.requests, []);
});

test("los eventos de Webhook.constructEvent usan el estilo global", async () => {
  const api = globalAPI();
  const body = JSON.stringify(EVENT_PAYMENT_SUCCEEDED);
  const header = WebhookSignature.generateHeader(body, WEBHOOK_SECRET);
  const payment = Webhook.constructEvent(body, header, WEBHOOK_SECRET).data.object;
  assert.ok(payment instanceof Payment);
  api.add(200, PAYMENT_REFUNDED);
  await payment.refund({ idempotencyKey: "r-2" });
  assert.equal(api.last.headers.get("idempotency-key"), "r-2");
});

test("el reembolso necesita un id", async () => {
  const payment = Payment.constructFrom({ object: "payment" });
  const error = await rejection(payment.refund());
  assert.ok(error instanceof RangeError);
  assert.match(error.message, /no tiene id/);
});

test("la clave de la variable de entorno, y los cambios entre llamadas", async () => {
  const api = new MockAPI();
  config.fetch = api.fetch;
  process.env.RAYA_SECRET_KEY = OTHER_KEY;
  api.add(200, BALANCE);
  await Balance.retrieve();
  assert.equal(api.last.headers.get("authorization"), `Bearer ${OTHER_KEY}`);

  config.apiKey = TEST_KEY; // gana sobre la variable de entorno
  api.add(200, BALANCE);
  await Balance.retrieve();
  assert.equal(api.last.headers.get("authorization"), `Bearer ${TEST_KEY}`);
});

test("sin clave", async () => {
  const api = new MockAPI();
  config.fetch = api.fetch;
  const error = await rejection(Balance.retrieve());
  assert.ok(error instanceof AuthenticationError);
  assert.equal(error.code, "API_KEY_MISSING");
  assert.deepEqual(api.requests, []);
});

test("la configuración global", async () => {
  const api = globalAPI();
  config.apiBase = "http://localhost:8000/";
  config.timeout = 12_000;
  config.maxNetworkRetries = 0;
  setAppInfo("mi-plugin", { version: "2.0.0", url: "https://plugin.example" });
  api.addError(500, "INTERNAL_ERROR");
  assert.ok((await rejection(Balance.retrieve())) instanceof APIError);
  assert.equal(api.last.url.href, "http://localhost:8000/v1/balance");
  assert.deepEqual(state.timeouts, [12_000]);
  assert.ok(
    api.last.headers.get("user-agent")?.endsWith(" mi-plugin/2.0.0 (https://plugin.example)"),
  );
  assert.equal(api.requests.length, 1);
  assert.deepEqual(state.sleeps, []);

  setAppInfo("solo");
  assert.deepEqual(config.appInfo, { name: "solo" });
  config.apiBase = "http://inseguro.example";
  const error = await rejection(Balance.retrieve());
  assert.ok(error instanceof RangeError);
  assert.match(error.message, /apiBase/);
});

test("config está sellado y setAppInfo valida", () => {
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const untyped = config as any;
  assert.ok(thrown(() => (untyped.apikey = TEST_KEY)) instanceof TypeError);
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  assert.ok(thrown(() => setAppInfo("x", "1.0" as any)) instanceof TypeError);
  assert.ok(thrown(() => setAppInfo("")) instanceof RangeError);
});

test("cambiar el fetch global entre llamadas", async () => {
  const api = new MockAPI();
  config.apiKey = TEST_KEY;
  config.fetch = api.fetch;
  api.add(200, BALANCE);
  await Balance.retrieve();

  const other = new MockAPI();
  config.fetch = other.fetch;
  other.add(200, BALANCE);
  await Balance.retrieve();
  assert.equal(api.requests.length, 1);
  assert.equal(other.requests.length, 1);
});

test("los valores inválidos de config fallan en la request", async () => {
  config.apiKey = TEST_KEY;
  config.fetch = new MockAPI().fetch;
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const untyped = config as any;
  untyped.timeout = "60";
  assert.ok((await rejection(Balance.retrieve())) instanceof TypeError);
  untyped.timeout = 65_000;
  untyped.maxNetworkRetries = -1;
  assert.ok((await rejection(Balance.retrieve())) instanceof RangeError);
  untyped.maxNetworkRetries = 2;
  untyped.fetch = "fetch";
  assert.ok((await rejection(Balance.retrieve())) instanceof TypeError);
  untyped.fetch = null;
  untyped.appInfo = { name: "x", otra: "y" };
  assert.ok((await rejection(Balance.retrieve())) instanceof RangeError);
});

// --- Apps y cuentas conectadas ----------------------------------------------------------------

const TOKEN_PARAMS = {
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
  code: OAUTH_CODE,
  redirect_uri: REDIRECT_URI,
};

test("los endpoints de apps y cuentas conectadas", async () => {
  const api = globalAPI();
  api.add(200, OAUTH_TOKEN);
  const token = await OAuth.token(TOKEN_PARAMS);
  assert.equal(token.constructor, OAuthToken);
  assert.equal(api.last.headers.get("authorization"), null); // la app se identifica en el body
  assert.deepEqual(api.lastJson(), { ...TOKEN_PARAMS, grant_type: "authorization_code" });

  config.apiKey = token.access_token; // el access_token vale como clave
  api.add(200, USER);
  const user = await User.retrieve(token.user_id);
  assert.equal(user.constructor, User);
  assert.equal(api.last.url.pathname, `/v1/users/${USER_ID}`);
  assert.equal(api.last.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);

  api.add(201, CHECKOUT_PENDING);
  const checkout = await Checkout.create({ items: CHECKOUT_ITEMS, fee: 500 });
  assert.equal(checkout.constructor, Checkout);
  assert.deepEqual(api.lastJson(), { items: CHECKOUT_ITEMS, fee: 500 });
  assert.equal(api.last.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);

  api.add(200, CHECKOUT_SUCCEEDED);
  assert.equal((await Checkout.retrieve(CHECKOUT_ID)).status, "succeeded");

  api.add(200, CHECKOUT_REFUNDED);
  const refunded = await Checkout.refund(CHECKOUT_ID, { idempotencyKey: "r-1" });
  assert.equal(refunded.status, "refunded");
  assert.equal(api.last.url.pathname, `/v1/checkout/orders/${CHECKOUT_ID}/refund`);
  assert.equal(api.last.headers.get("idempotency-key"), "r-1");
});

test("OAuth.token no necesita clave", async () => {
  const api = new MockAPI();
  config.fetch = api.fetch;
  api.add(200, OAUTH_TOKEN);
  const token = await OAuth.token(TOKEN_PARAMS);
  assert.equal(token.user_id, USER_ID);
  assert.equal(api.last.headers.get("authorization"), null);
  assert.equal(api.last.headers.get("idempotency-key"), null); // el code se canjea una sola vez
});

test("checkout.refund() desde la instancia usa el cliente del que vino", async () => {
  const globalApi = globalAPI();
  const otherApi = new MockAPI();
  const client = otherApi.client(ACCESS_TOKEN);
  otherApi.add(200, CHECKOUT_SUCCEEDED);
  const checkout = await client.checkout.orders.retrieve(CHECKOUT_ID);
  otherApi.add(200, CHECKOUT_REFUNDED);
  const refunded = await checkout.refund();
  assert.equal(refunded.status, "refunded");
  assert.equal(checkout.status, "succeeded"); // devuelve un checkout nuevo, no muta el original
  assert.equal(otherApi.last.url.pathname, `/v1/checkout/orders/${CHECKOUT_ID}/refund`);
  assert.equal(otherApi.last.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.deepEqual(globalApi.requests, []);
});

test("los eventos checkout.* de Webhook.constructEvent usan el estilo global", async () => {
  const api = globalAPI();
  const body = JSON.stringify(EVENT_CHECKOUT_SUCCEEDED);
  const header = WebhookSignature.generateHeader(body, WEBHOOK_SECRET);
  const checkout = Webhook.constructEvent(body, header, WEBHOOK_SECRET).data.object;
  assert.ok(checkout instanceof Checkout);
  api.add(200, CHECKOUT_REFUNDED);
  await checkout.refund({ idempotencyKey: "r-2" });
  assert.equal(api.last.url.pathname, `/v1/checkout/orders/${CHECKOUT_ID}/refund`);
  assert.equal(api.last.headers.get("idempotency-key"), "r-2");
});

test("el reembolso de un checkout necesita un id", async () => {
  const checkout = Checkout.constructFrom({ object: "checkout" });
  const error = await rejection(checkout.refund());
  assert.ok(error instanceof RangeError);
  assert.match(error.message, /no tiene id/);
});
