// El estilo global: config.apiKey + Payment.create(…), OAuth.token(…), ConnectOrder.create(…).

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  APIError,
  AuthenticationError,
  Balance,
  ConnectOrder,
  ConnectPayout,
  config,
  IdentityVerification,
  IdentityVerificationFiles,
  Invoice,
  ListObject,
  OAuth,
  OAuthToken,
  Payment,
  PspBalance,
  PspCustomer,
  PspCustomerBalance,
  PspTransfer,
  setAppInfo,
  Transfer,
  User,
  Webhook,
  WebhookSignature,
} from "../src/index.ts";
import {
  ACCESS_TOKEN,
  BALANCE,
  CLIENT_ID,
  CLIENT_SECRET,
  EVENT_INVOICE_ISSUED,
  EVENT_ORDER_SUCCEEDED,
  EVENT_PAYMENT_SUCCEEDED,
  EVENT_PSP_CUSTOMER_ACTIVATED,
  EVENT_VERIFICATION_VERIFIED,
  INVOICE_DNI,
  INVOICE_ID,
  INVOICE_ISSUED,
  INVOICE_LIST,
  INVOICE_PENDING,
  OAUTH_CODE,
  OAUTH_TOKEN,
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
  PSP_BALANCE,
  PSP_CUSTOMER_ACTIVE,
  PSP_CUSTOMER_BALANCE,
  PSP_CUSTOMER_BLOCKED,
  PSP_CUSTOMER_CLOSED,
  PSP_CUSTOMER_ID,
  PSP_CUSTOMER_LIST,
  PSP_CUSTOMER_PENDING,
  PSP_CUSTOMER_WITH_BALANCE,
  PSP_DESTINATION,
  PSP_INBOUND_ID,
  PSP_TAX_ID,
  PSP_TRANSFER_INBOUND,
  PSP_TRANSFER_LIST,
  PSP_TRANSFER_OUTBOUND_PENDING,
  REDIRECT_URI,
  SANDBOX_ORDER_ID,
  SANDBOX_ORDER_SUCCEEDED,
  SANDBOX_PAYMENT_FAILED,
  SANDBOX_PAYMENT_ID,
  SANDBOX_PAYMENT_SUCCEEDED,
  SANDBOX_SECRET_KEY,
  TRANSFER_INBOUND,
  TRANSFER_LIST,
  TRANSFER_OUTBOUND_PENDING,
  USER,
  USER_ID,
  VERIFICATION_CANCELED,
  VERIFICATION_FILES,
  VERIFICATION_ID,
  VERIFICATION_LIST,
  VERIFICATION_PENDING,
  VERIFICATION_VERIFIED,
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

// --- Raya Connect -----------------------------------------------------------------------------

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

  api.add(201, ORDER_PENDING);
  const order = await ConnectOrder.create({ items: ORDER_ITEMS, fee: 500 });
  assert.equal(order.constructor, ConnectOrder);
  assert.deepEqual(api.lastJson(), { items: ORDER_ITEMS, fee: 500 });
  assert.equal(api.last.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);

  api.add(200, ORDER_SUCCEEDED);
  assert.equal((await ConnectOrder.retrieve(ORDER_ID)).status, "succeeded");

  api.add(200, ORDER_REFUNDED);
  const refunded = await ConnectOrder.refund(ORDER_ID, { idempotencyKey: "r-1" });
  assert.equal(refunded.status, "refunded");
  assert.equal(api.last.url.pathname, `/v1/connect/orders/${ORDER_ID}/refund`);
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

test("order.refund() desde la instancia usa el cliente del que vino", async () => {
  const globalApi = globalAPI();
  const otherApi = new MockAPI();
  const client = otherApi.client(ACCESS_TOKEN);
  otherApi.add(200, ORDER_SUCCEEDED);
  const order = await client.connect.orders.retrieve(ORDER_ID);
  otherApi.add(200, ORDER_REFUNDED);
  const refunded = await order.refund();
  assert.equal(refunded.status, "refunded");
  assert.equal(order.status, "succeeded"); // devuelve un pago nuevo, no muta el original
  assert.equal(otherApi.last.url.pathname, `/v1/connect/orders/${ORDER_ID}/refund`);
  assert.equal(otherApi.last.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.deepEqual(globalApi.requests, []);
});

test("los eventos connect.order.* de Webhook.constructEvent usan el estilo global", async () => {
  const api = globalAPI();
  const body = JSON.stringify(EVENT_ORDER_SUCCEEDED);
  const header = WebhookSignature.generateHeader(body, WEBHOOK_SECRET);
  const order = Webhook.constructEvent(body, header, WEBHOOK_SECRET).data.object;
  assert.ok(order instanceof ConnectOrder);
  api.add(200, ORDER_REFUNDED);
  await order.refund({ idempotencyKey: "r-2" });
  assert.equal(api.last.url.pathname, `/v1/connect/orders/${ORDER_ID}/refund`);
  assert.equal(api.last.headers.get("idempotency-key"), "r-2");
});

test("el reembolso de un pago de Connect necesita un id", async () => {
  const order = ConnectOrder.constructFrom({ object: "connect.order" });
  const error = await rejection(order.refund());
  assert.ok(error instanceof RangeError);
  assert.match(error.message, /no tiene id/);
});

test("los payouts de Connect: create, retrieve y list, con la clave secreta", async () => {
  const api = globalAPI();
  api.add(201, PAYOUT_PENDING);
  const payout = await ConnectPayout.create(
    { amount: 60000, destination: PAYOUT_DESTINATION },
    { idempotencyKey: "payout-1" },
  );
  assert.equal(payout.constructor, ConnectPayout);
  assert.equal(api.last.url.pathname, "/v1/connect/payouts");
  assert.equal(api.last.headers.get("authorization"), `Bearer ${TEST_KEY}`);
  assert.equal(api.last.headers.get("idempotency-key"), "payout-1");
  assert.deepEqual(api.lastJson(), { amount: 60000, destination: PAYOUT_DESTINATION });

  api.add(200, PAYOUT_COMPLETED);
  assert.equal((await ConnectPayout.retrieve(PAYOUT_ID)).status, "completed");
  assert.equal(api.last.url.pathname, `/v1/connect/payouts/${PAYOUT_ID}`);

  api.add(200, PAYOUT_LIST);
  const page = await ConnectPayout.list({ status: "completed", limit: 2 });
  assert.equal(page.constructor, ListObject);
  assert.equal(api.last.url.pathname, "/v1/connect/payouts");
  assert.equal(api.last.url.searchParams.get("status"), "completed");
  assert.equal(api.last.url.searchParams.get("limit"), "2");
});

test("ConnectPayout.create exige la idempotencyKey", async () => {
  const api = globalAPI();
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const untyped = ConnectPayout as any;
  const error = await rejection(untyped.create({ amount: 1, destination: "x" }));
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /connect\.payouts\.create necesita idempotencyKey/);
  assert.deepEqual(api.requests, []);
});

// --- Identidad --------------------------------------------------------------------------------

test("Identidad: create, retrieve, list, cancel y files, con la clave secreta", async () => {
  const api = globalAPI();
  api.add(201, VERIFICATION_PENDING);
  const verification = await IdentityVerification.create(
    { type: "document", metadata: { plan: "pro" } },
    { idempotencyKey: "alta-1" },
  );
  assert.equal(verification.constructor, IdentityVerification);
  assert.deepEqual(
    [api.last.method, api.last.url.pathname],
    ["POST", "/v1/identity/verifications"],
  );
  assert.deepEqual(api.lastJson(), { type: "document", metadata: { plan: "pro" } });
  assert.equal(api.last.headers.get("authorization"), `Bearer ${TEST_KEY}`);
  assert.equal(api.last.headers.get("idempotency-key"), "alta-1");

  api.add(201, VERIFICATION_PENDING);
  await IdentityVerification.create({ type: "document" });
  assert.ok(api.last.headers.get("idempotency-key")); // sin clave propia, el SDK genera una

  api.add(200, VERIFICATION_VERIFIED);
  assert.equal((await IdentityVerification.retrieve(VERIFICATION_ID)).status, "verified");
  assert.deepEqual(
    [api.last.method, api.last.url.pathname],
    ["GET", `/v1/identity/verifications/${VERIFICATION_ID}`],
  );

  api.add(200, VERIFICATION_LIST);
  const page = await IdentityVerification.list({ status: "verified", limit: 2 });
  assert.equal(page.constructor, ListObject);
  assert.ok(page.data.every((item) => item instanceof IdentityVerification));
  assert.equal(api.last.url.pathname, "/v1/identity/verifications");
  assert.equal(api.last.url.searchParams.get("status"), "verified");
  assert.equal(api.last.url.searchParams.get("limit"), "2");

  api.add(200, VERIFICATION_CANCELED);
  const canceled = await IdentityVerification.cancel(VERIFICATION_ID, { idempotencyKey: "c-1" });
  assert.equal(canceled.status, "canceled");
  assert.deepEqual(
    [api.last.method, api.last.url.pathname],
    ["POST", `/v1/identity/verifications/${VERIFICATION_ID}/cancel`],
  );
  assert.equal(api.last.body, undefined);
  assert.equal(api.last.headers.get("idempotency-key"), "c-1");

  api.add(200, VERIFICATION_FILES);
  const files = await IdentityVerification.files(VERIFICATION_ID);
  assert.equal(files.constructor, IdentityVerificationFiles);
  assert.deepEqual(
    [api.last.method, api.last.url.pathname],
    ["GET", `/v1/identity/verifications/${VERIFICATION_ID}/files`],
  );
  assert.equal(api.requests.length, 6);
});

test("verification.cancel() desde la instancia devuelve una verificación nueva", async () => {
  const api = globalAPI();
  api.add(200, VERIFICATION_PENDING);
  const verification = await IdentityVerification.retrieve(VERIFICATION_ID);
  api.add(200, VERIFICATION_CANCELED);
  const canceled = await verification.cancel();
  assert.equal(canceled.status, "canceled");
  assert.equal(verification.status, "pending"); // no muta la original
  assert.deepEqual(
    [api.last.method, api.last.url.pathname],
    ["POST", `/v1/identity/verifications/${VERIFICATION_ID}/cancel`],
  );
  assert.ok(api.last.headers.get("idempotency-key")); // generada para esta llamada
});

test("verification.cancel() usa el cliente del que vino", async () => {
  const globalApi = globalAPI();
  const otherApi = new MockAPI();
  const client = otherApi.client(OTHER_KEY);
  otherApi.add(200, VERIFICATION_PENDING);
  const verification = await client.identity.verifications.retrieve(VERIFICATION_ID);
  otherApi.add(200, VERIFICATION_CANCELED);
  await verification.cancel({ idempotencyKey: "c-1" });
  assert.equal(otherApi.last.url.pathname, `/v1/identity/verifications/${VERIFICATION_ID}/cancel`);
  assert.equal(otherApi.last.headers.get("authorization"), `Bearer ${OTHER_KEY}`);
  assert.equal(otherApi.last.headers.get("idempotency-key"), "c-1");
  assert.deepEqual(globalApi.requests, []);
});

test("los eventos identity.verification.* de Webhook.constructEvent usan el estilo global", async () => {
  const api = globalAPI();
  const body = JSON.stringify(EVENT_VERIFICATION_VERIFIED);
  const header = WebhookSignature.generateHeader(body, WEBHOOK_SECRET);
  const verification = Webhook.constructEvent(body, header, WEBHOOK_SECRET).data.object;
  assert.ok(verification instanceof IdentityVerification);
  assert.equal(verification.person, null);
  api.add(200, VERIFICATION_CANCELED);
  await verification.cancel({ idempotencyKey: "c-2" });
  assert.equal(api.last.url.pathname, `/v1/identity/verifications/${VERIFICATION_ID}/cancel`);
  assert.equal(api.last.headers.get("idempotency-key"), "c-2");
});

test("con client.constructEvent, verification.cancel() usa la clave de ese cliente", async () => {
  const globalApi = globalAPI();
  const otherApi = new MockAPI();
  const body = JSON.stringify(EVENT_VERIFICATION_VERIFIED);
  const header = WebhookSignature.generateHeader(body, WEBHOOK_SECRET);
  const event = otherApi.client(OTHER_KEY).constructEvent(body, header, WEBHOOK_SECRET);
  const verification = event.data.object;
  assert.ok(verification instanceof IdentityVerification);
  otherApi.add(200, VERIFICATION_CANCELED);
  await verification.cancel();
  assert.equal(otherApi.last.headers.get("authorization"), `Bearer ${OTHER_KEY}`);
  assert.deepEqual(globalApi.requests, []);
});

test("la cancelación de una verificación necesita un id", async () => {
  const api = globalAPI();
  const verification = IdentityVerification.constructFrom({ object: "identity.verification" });
  const error = await rejection(verification.cancel());
  assert.ok(error instanceof RangeError);
  assert.equal(error.message, "Esta IdentityVerification no tiene id: no se puede cancelar.");
  assert.deepEqual(api.requests, []);
});

test("IdentityVerification lee RAYA_SECRET_KEY y, sin clave, falla sin mandar nada", async () => {
  const api = new MockAPI();
  config.fetch = api.fetch;
  const error = await rejection(IdentityVerification.retrieve(VERIFICATION_ID));
  assert.ok(error instanceof AuthenticationError);
  assert.equal(error.code, "API_KEY_MISSING");
  assert.deepEqual(api.requests, []);
  process.env.RAYA_SECRET_KEY = OTHER_KEY;
  api.add(200, VERIFICATION_PENDING);
  await IdentityVerification.retrieve(VERIFICATION_ID);
  assert.equal(api.last.headers.get("authorization"), `Bearer ${OTHER_KEY}`);
});

// --- Raya PSP ---------------------------------------------------------------------------------

test("Raya PSP: PspCustomer.create, retrieve, list y retrieveBalance, con la clave secreta", async () => {
  const api = globalAPI();
  api.add(201, PSP_CUSTOMER_ACTIVE);
  const customer = await PspCustomer.create(
    { identity_verification: VERIFICATION_ID, metadata: { plan: "pro" } },
    { idempotencyKey: "alta-1" },
  );
  assert.equal(customer.constructor, PspCustomer);
  // Con Raya Identity alcanza con la verificación: el CUIL y el nombre los pone la API.
  assert.equal(customer.tax_id, PSP_TAX_ID);
  assert.deepEqual([api.last.method, api.last.url.pathname], ["POST", "/v1/psp/customers"]);
  assert.deepEqual(api.lastJson(), {
    identity_verification: VERIFICATION_ID,
    metadata: { plan: "pro" },
  });
  assert.equal(api.last.headers.get("authorization"), `Bearer ${TEST_KEY}`);
  assert.equal(api.last.headers.get("idempotency-key"), "alta-1");

  api.add(200, PSP_CUSTOMER_WITH_BALANCE);
  assert.equal((await PspCustomer.retrieve(PSP_CUSTOMER_ID)).balance, 23649.5);
  assert.deepEqual(
    [api.last.method, api.last.url.pathname],
    ["GET", `/v1/psp/customers/${PSP_CUSTOMER_ID}`],
  );

  api.add(200, PSP_CUSTOMER_LIST);
  const page = await PspCustomer.list({ status: "active", limit: 2 });
  assert.equal(page.constructor, ListObject);
  assert.ok(page.data.every((item) => item instanceof PspCustomer));
  assert.equal(api.last.url.search, "?status=active&limit=2");

  api.add(200, PSP_CUSTOMER_BALANCE);
  const balance = await PspCustomer.retrieveBalance(PSP_CUSTOMER_ID);
  assert.equal(balance.constructor, PspCustomerBalance);
  assert.equal(api.last.url.pathname, `/v1/psp/customers/${PSP_CUSTOMER_ID}/balance`);
  assert.equal(api.requests.length, 4);
});

test("Raya PSP: PspCustomer.block, unblock, close y recreate por id, sin body", async () => {
  const api = globalAPI();
  const responses = {
    block: PSP_CUSTOMER_BLOCKED,
    unblock: PSP_CUSTOMER_WITH_BALANCE,
    close: PSP_CUSTOMER_CLOSED,
    recreate: PSP_CUSTOMER_PENDING,
  };
  for (const [action, response] of Object.entries(responses)) {
    api.add(action === "recreate" ? 202 : 200, response);
  }
  const blocked = await PspCustomer.block(PSP_CUSTOMER_ID, { idempotencyKey: "b-1" });
  assert.equal(blocked.status, "blocked");
  assert.equal(api.last.headers.get("idempotency-key"), "b-1");
  assert.equal((await PspCustomer.unblock(PSP_CUSTOMER_ID)).status, "active");
  assert.equal((await PspCustomer.close(PSP_CUSTOMER_ID)).status, "closed");
  const recreated = await PspCustomer.recreate(PSP_CUSTOMER_ID);
  assert.equal(recreated.status, "pending");
  assert.equal(recreated.lastResponse?.httpStatus, 202);
  assert.deepEqual(
    api.requests.map((request) => [request.method, request.url.pathname, request.body]),
    Object.keys(responses).map((action) => [
      "POST",
      `/v1/psp/customers/${PSP_CUSTOMER_ID}/${action}`,
      undefined,
    ]),
  );
  for (const request of api.requests) {
    assert.equal(request.headers.get("authorization"), `Bearer ${TEST_KEY}`);
    assert.ok(request.headers.get("idempotency-key")); // la tuya o una generada por llamada
  }
});

test("Raya PSP: PspTransfer.create, retrieve y list, y PspBalance.retrieve", async () => {
  const api = globalAPI();
  api.add(201, PSP_TRANSFER_OUTBOUND_PENDING);
  const transfer = await PspTransfer.create(
    { customer: PSP_CUSTOMER_ID, amount: "18350.50", destination: PSP_DESTINATION },
    { idempotencyKey: "t-1" },
  );
  assert.equal(transfer.constructor, PspTransfer);
  assert.deepEqual([api.last.method, api.last.url.pathname], ["POST", "/v1/psp/transfers"]);
  assert.equal(
    api.last.body,
    `{"customer":"${PSP_CUSTOMER_ID}","amount":18350.5,"destination":"${PSP_DESTINATION}"}`,
  );
  assert.equal(api.last.headers.get("idempotency-key"), "t-1");

  api.add(200, PSP_TRANSFER_INBOUND);
  assert.equal((await PspTransfer.retrieve(PSP_INBOUND_ID)).direction, "inbound");
  assert.equal(api.last.url.pathname, `/v1/psp/transfers/${PSP_INBOUND_ID}`);

  api.add(200, PSP_TRANSFER_LIST);
  const page = await PspTransfer.list({ customer: PSP_CUSTOMER_ID, direction: "inbound" });
  assert.equal(page.constructor, ListObject);
  assert.equal(api.last.url.search, `?customer=${PSP_CUSTOMER_ID}&direction=inbound`);

  api.add(200, PSP_BALANCE);
  const balance = await PspBalance.retrieve();
  assert.equal(balance.constructor, PspBalance);
  assert.equal(balance.customers_balance, 512875.25);
  assert.deepEqual([api.last.method, api.last.url.pathname], ["GET", "/v1/psp/balance"]);
  assert.equal(api.requests.length, 4);
});

test("PspTransfer.create exige la idempotencyKey y, sin clave, no manda nada", async () => {
  const api = globalAPI();
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const untyped = PspTransfer as any;
  let error = await rejection(
    untyped.create({ customer: PSP_CUSTOMER_ID, amount: 1, destination: "x" }),
  );
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /^psp\.transfers\.create necesita idempotencyKey/);
  config.apiKey = null;
  error = await rejection(PspBalance.retrieve());
  assert.ok(error instanceof AuthenticationError);
  assert.equal(error.code, "API_KEY_MISSING");
  assert.deepEqual(api.requests, []);
});

for (const [action, response] of [
  ["block", PSP_CUSTOMER_BLOCKED],
  ["unblock", PSP_CUSTOMER_WITH_BALANCE],
  ["close", PSP_CUSTOMER_CLOSED],
  ["recreate", PSP_CUSTOMER_ACTIVE],
] as const) {
  test(`customer.${action}() desde la instancia devuelve un cliente nuevo`, async () => {
    const api = globalAPI();
    api.add(200, PSP_CUSTOMER_WITH_BALANCE);
    const customer = await PspCustomer.retrieve(PSP_CUSTOMER_ID);
    api.add(200, response);
    const updated = await customer[action]();
    assert.equal(updated.constructor, PspCustomer);
    assert.equal(updated.status, response.status);
    assert.equal(customer.status, "active"); // no muta el original
    assert.deepEqual(
      [api.last.method, api.last.url.pathname, api.last.body],
      ["POST", `/v1/psp/customers/${PSP_CUSTOMER_ID}/${action}`, undefined],
    );
    assert.ok(api.last.headers.get("idempotency-key")); // generada para esta llamada
  });
}

test("customer.close() usa el cliente del que vino", async () => {
  const globalApi = globalAPI();
  const otherApi = new MockAPI();
  const client = otherApi.client(OTHER_KEY);
  otherApi.add(200, PSP_CUSTOMER_WITH_BALANCE);
  const customer = await client.psp.customers.retrieve(PSP_CUSTOMER_ID);
  otherApi.add(200, PSP_CUSTOMER_CLOSED);
  await customer.close({ idempotencyKey: "baja-1" });
  assert.equal(otherApi.last.url.pathname, `/v1/psp/customers/${PSP_CUSTOMER_ID}/close`);
  assert.equal(otherApi.last.headers.get("authorization"), `Bearer ${OTHER_KEY}`);
  assert.equal(otherApi.last.headers.get("idempotency-key"), "baja-1");
  assert.deepEqual(globalApi.requests, []);
});

test("los eventos psp.customer.* de Webhook.constructEvent usan el estilo global", async () => {
  const api = globalAPI();
  const body = JSON.stringify(EVENT_PSP_CUSTOMER_ACTIVATED);
  const header = WebhookSignature.generateHeader(body, WEBHOOK_SECRET);
  const customer = Webhook.constructEvent(body, header, WEBHOOK_SECRET).data.object;
  assert.ok(customer instanceof PspCustomer);
  api.add(200, PSP_CUSTOMER_BLOCKED);
  await customer.block({ idempotencyKey: "b-2" });
  assert.equal(api.last.url.pathname, `/v1/psp/customers/${PSP_CUSTOMER_ID}/block`);
  assert.equal(api.last.headers.get("authorization"), `Bearer ${TEST_KEY}`);
  assert.equal(api.last.headers.get("idempotency-key"), "b-2");
});

test("con client.constructEvent, customer.recreate() usa la clave de ese cliente", async () => {
  const globalApi = globalAPI();
  const otherApi = new MockAPI();
  const body = JSON.stringify(EVENT_PSP_CUSTOMER_ACTIVATED);
  const header = WebhookSignature.generateHeader(body, WEBHOOK_SECRET);
  const event = otherApi.client(OTHER_KEY).constructEvent(body, header, WEBHOOK_SECRET);
  const customer = event.data.object;
  assert.ok(customer instanceof PspCustomer);
  otherApi.add(202, PSP_CUSTOMER_PENDING);
  await customer.recreate();
  assert.equal(otherApi.last.headers.get("authorization"), `Bearer ${OTHER_KEY}`);
  assert.deepEqual(globalApi.requests, []);
});

for (const [action, verb] of [
  ["block", "bloquear"],
  ["unblock", "desbloquear"],
  ["close", "dar de baja"],
  ["recreate", "recrear"],
] as const) {
  test(`customer.${action}() necesita un id`, async () => {
    const api = globalAPI();
    const customer = PspCustomer.constructFrom({ object: "psp.customer" });
    const error = await rejection(customer[action]());
    assert.ok(error instanceof RangeError);
    assert.equal(error.message, `Este PspCustomer no tiene id: no se puede ${verb}.`);
    assert.deepEqual(api.requests, []);
  });
}

// --- Facturador -------------------------------------------------------------------------------

test("Facturador: Invoice.create, retrieve y list, con la clave secreta", async () => {
  const api = globalAPI();
  api.add(202, INVOICE_PENDING);
  const invoice = await Invoice.create(
    { dni: INVOICE_DNI, amount: "15000.00", metadata: { pedido_id: "1042" } },
    { idempotencyKey: "factura-1" },
  );
  assert.equal(invoice.constructor, Invoice);
  assert.equal(invoice.status, "pending");
  assert.equal(invoice.lastResponse?.httpStatus, 202);
  assert.deepEqual([api.last.method, api.last.url.pathname], ["POST", "/v1/invoices"]);
  assert.equal(
    api.last.body,
    `{"dni":"${INVOICE_DNI}","amount":15000,"metadata":{"pedido_id":"1042"}}`,
  );
  assert.equal(api.last.headers.get("authorization"), `Bearer ${TEST_KEY}`);
  assert.equal(api.last.headers.get("idempotency-key"), "factura-1");

  api.add(200, INVOICE_ISSUED);
  const issued = await Invoice.retrieve(INVOICE_ID);
  assert.equal(issued.cae, INVOICE_ISSUED.cae);
  assert.deepEqual(
    [api.last.method, api.last.url.pathname, api.last.headers.get("idempotency-key")],
    ["GET", `/v1/invoices/${INVOICE_ID}`, null],
  );

  api.add(200, INVOICE_LIST);
  const page = await Invoice.list({ status: "issued", limit: 2 });
  assert.equal(page.constructor, ListObject);
  assert.ok(page.data.every((item) => item instanceof Invoice));
  assert.equal(api.last.url.search, "?status=issued&limit=2");
  assert.equal(api.requests.length, 3);
});

test("Invoice.create exige la idempotencyKey y, sin clave, no manda nada", async () => {
  const api = globalAPI();
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const untyped = Invoice as any;
  let error = await rejection(untyped.create({ dni: INVOICE_DNI, amount: 15000 }));
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /^invoices\.create necesita idempotencyKey/);
  config.apiKey = null;
  error = await rejection(Invoice.retrieve(INVOICE_ID));
  assert.ok(error instanceof AuthenticationError);
  assert.equal(error.code, "API_KEY_MISSING");
  error = await rejection(
    Invoice.create({ dni: INVOICE_DNI, amount: 15000 }, { idempotencyKey: "factura-2" }),
  );
  assert.ok(error instanceof AuthenticationError);
  assert.deepEqual(api.requests, []);
});

test("Invoice lee RAYA_SECRET_KEY y la apiKey de la llamada pisa la global", async () => {
  const api = new MockAPI();
  config.fetch = api.fetch;
  process.env.RAYA_SECRET_KEY = OTHER_KEY;
  api.add(200, INVOICE_ISSUED);
  await Invoice.retrieve(INVOICE_ID);
  assert.equal(api.last.headers.get("authorization"), `Bearer ${OTHER_KEY}`);
  config.apiKey = TEST_KEY;
  api.add(200, INVOICE_LIST);
  await Invoice.list({}, { apiKey: OTHER_KEY });
  assert.equal(api.last.headers.get("authorization"), `Bearer ${OTHER_KEY}`);
});

test("los eventos invoice.* de Webhook.constructEvent traen la Invoice", () => {
  globalAPI();
  const body = JSON.stringify(EVENT_INVOICE_ISSUED);
  const header = WebhookSignature.generateHeader(body, WEBHOOK_SECRET);
  const invoice = Webhook.constructEvent(body, header, WEBHOOK_SECRET).data.object;
  assert.ok(invoice instanceof Invoice);
  assert.equal(invoice.status, "issued");
  assert.equal(invoice.cae, INVOICE_ISSUED.cae);
  assert.equal(invoice.lastResponse, null);
});

// --- Sandbox ----------------------------------------------------------------------------------

test("Payment.simulateTransfer: el helper del sandbox en el estilo global", async () => {
  const api = globalAPI();
  config.apiKey = SANDBOX_SECRET_KEY; // la clave secreta de prueba del sandbox
  api.add(200, SANDBOX_PAYMENT_SUCCEEDED);
  const payment = await Payment.simulateTransfer(SANDBOX_PAYMENT_ID);
  assert.equal(payment.constructor, Payment);
  assert.deepEqual(
    [api.last.method, api.last.url.pathname],
    ["POST", `/v1/test/payments/${SANDBOX_PAYMENT_ID}/simulate_transfer`],
  );
  assert.equal(api.last.headers.get("authorization"), `Bearer ${SANDBOX_SECRET_KEY}`);
  assert.equal(api.last.headers.get("idempotency-key"), null);
  assert.equal(api.last.body, undefined);

  api.add(200, SANDBOX_PAYMENT_FAILED);
  const failed = await Payment.simulateTransfer(SANDBOX_PAYMENT_ID, { amount: "1000.00" });
  assert.equal(failed.status, "failed");
  assert.equal(api.last.body, '{"amount":1000}');
  assert.equal(api.last.headers.get("idempotency-key"), null);

  // Con el id de una orden de Raya Connect, su ConnectOrder.
  api.add(200, SANDBOX_ORDER_SUCCEEDED);
  const order = await Payment.simulateTransfer(SANDBOX_ORDER_ID);
  assert.equal(order.constructor, ConnectOrder);

  // Lo que devuelve usa la configuración global: el reembolso de prueba va con config.apiKey.
  api.add(200, { ...SANDBOX_PAYMENT_SUCCEEDED, status: "refunded" });
  await payment.refund();
  assert.equal(api.last.url.pathname, `/v1/payments/${SANDBOX_PAYMENT_ID}/refund`);
  assert.equal(api.last.headers.get("authorization"), `Bearer ${SANDBOX_SECRET_KEY}`);
  assert.equal(api.requests.length, 4);
});

test("Payment.simulateTransfer tampoco acepta idempotencyKey y, sin clave, no manda nada", async () => {
  const api = new MockAPI();
  config.fetch = api.fetch;
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const untyped = Payment as any;
  config.apiKey = SANDBOX_SECRET_KEY;
  let error = await rejection(
    untyped.simulateTransfer(SANDBOX_PAYMENT_ID, null, { idempotencyKey: "k" }),
  );
  assert.ok(error instanceof RangeError);
  assert.match(error.message, /no acepta idempotencyKey en las opciones/);
  config.apiKey = null;
  error = await rejection(Payment.simulateTransfer(SANDBOX_PAYMENT_ID));
  assert.ok(error instanceof AuthenticationError);
  assert.equal(error.code, "API_KEY_MISSING");
  assert.deepEqual(api.requests, []);
});
