import assert from "node:assert/strict";
import { test } from "node:test";
import util from "node:util";

import {
  AuthenticationError,
  ListObject,
  Payment,
  RayaClient,
  RayaObject,
  WebhookSignature,
} from "../src/index.ts";
import {
  BALANCE,
  EVENT_PAYMENT_SUCCEEDED,
  PAYMENT_REFUNDED,
  TRANSFER_LIST,
  WEBHOOK_SECRET,
} from "./fixtures.ts";
import { isolate, MockAPI, OTHER_KEY, rejection, TEST_KEY, thrown } from "./helpers.ts";

const state = isolate();

test("la clave del argumento", async () => {
  const api = new MockAPI();
  api.add(200, BALANCE);
  await api.client(TEST_KEY).balance.retrieve();
  assert.equal(api.last.headers.get("authorization"), `Bearer ${TEST_KEY}`);
});

test("la clave en el objeto de opciones", async () => {
  const api = new MockAPI();
  api.add(200, BALANCE);
  await new RayaClient({ apiKey: TEST_KEY, fetch: api.fetch }).balance.retrieve();
  assert.equal(api.last.headers.get("authorization"), `Bearer ${TEST_KEY}`);
});

test("la clave de la variable de entorno", async () => {
  process.env.RAYA_SECRET_KEY = OTHER_KEY;
  const api = new MockAPI();
  api.add(200, BALANCE);
  await api.client(null).balance.retrieve();
  assert.equal(api.last.headers.get("authorization"), `Bearer ${OTHER_KEY}`);
});

test("sin clave falla antes de cualquier request", async () => {
  const api = new MockAPI();
  const error = await rejection(api.client(null).balance.retrieve());
  assert.ok(error instanceof AuthenticationError);
  assert.equal(error.code, "API_KEY_MISSING");
  assert.match(error.message, /RAYA_SECRET_KEY/);
  assert.deepEqual(api.requests, []);
});

const INVALID_KEYS: Array<[string, string]> = [
  ["", "API_KEY_MISSING"],
  ["   ", "API_KEY_MISSING"],
  [`raya_pk_live_${"a".repeat(48)}`, "API_KEY_PUBLISHABLE_NOT_ALLOWED"],
  [`${TEST_KEY} `, "API_KEY_INVALID"],
  ["raya_sk_live_ñ", "API_KEY_INVALID"],
  [`${TEST_KEY}\n`, "API_KEY_INVALID"],
];

for (const [key, code] of INVALID_KEYS) {
  test(`una clave inválida falla al construir: ${code}`, () => {
    const error = thrown(() => new RayaClient(key));
    assert.ok(error instanceof AuthenticationError);
    assert.equal(error.code, code);
  });
}

test("la clave tiene que ser un string", () => {
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  assert.ok(thrown(() => new RayaClient(123 as any)) instanceof TypeError);
});

test("una clave por request", async () => {
  const api = new MockAPI();
  const client = api.client();
  api.add(200, BALANCE);
  await client.balance.retrieve({ apiKey: OTHER_KEY });
  assert.equal(api.last.headers.get("authorization"), `Bearer ${OTHER_KEY}`);
  const error = await rejection(client.balance.retrieve({ apiKey: "raya_pk_live_x" }));
  assert.ok(error instanceof AuthenticationError);
  assert.equal(error.code, "API_KEY_PUBLISHABLE_NOT_ALLOWED");
  assert.equal(api.requests.length, 1);
});

test("las opciones desconocidas o mal puestas se rechazan", async () => {
  const client = new MockAPI().client();
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const untyped = client.balance as any;
  let error = await rejection(untyped.retrieve({ idempotency_key: "x" }));
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /idempotency_key.*¿quisiste decir idempotencyKey\?/);
  error = await rejection(untyped.retrieve({ idempotencyKey: "x" }));
  assert.ok(error instanceof RangeError);
  assert.match(error.message, /solo va en los POST/);
  error = await rejection(untyped.retrieve("x"));
  assert.ok(error instanceof TypeError);
});

test("console.log nunca muestra la clave", () => {
  const client = new RayaClient(TEST_KEY);
  assert.equal(
    util.inspect(client),
    "RayaClient { apiBase: 'https://api.raya.cash', apiKey: 'raya_sk_live_…IJKL' }",
  );
  assert.equal(
    JSON.stringify(client),
    '{"apiBase":"https://api.raya.cash","apiKey":"raya_sk_live_…IJKL"}',
  );
  assert.ok(!util.inspect(client, { showHidden: true, depth: 5 }).includes(TEST_KEY));
  assert.ok(!JSON.stringify(Object.entries(client)).includes(TEST_KEY));
  assert.equal(
    util.inspect(new RayaClient()),
    "RayaClient { apiBase: 'https://api.raya.cash', apiKey: null }",
  );
  assert.match(util.inspect(new RayaClient("otra_clave_cualquiera_larga")), /'…arga'/);
  assert.match(util.inspect(new RayaClient("corta")), /apiKey: '…'/);
});

const VALID_BASES: Array<[string, string]> = [
  ["https://api.raya.cash/", "https://api.raya.cash"],
  ["https://proxy.example.com/raya", "https://proxy.example.com/raya"],
  ["http://localhost:8000", "http://localhost:8000"],
  ["http://127.0.0.1:8000/", "http://127.0.0.1:8000"],
  ["http://[::1]:8000", "http://[::1]:8000"],
];

for (const [base, expected] of VALID_BASES) {
  test(`apiBase válida: ${base}`, async () => {
    const api = new MockAPI();
    api.add(200, BALANCE);
    await api.client(TEST_KEY, { apiBase: base }).balance.retrieve();
    assert.equal(api.last.url.href, `${expected}/v1/balance`);
  });
}

for (const base of [
  "http://api.raya.cash",
  "ftp://x",
  "api.raya.cash",
  "https://",
  "https://x?y=1",
  "https://x#frag",
  "https://u:p@x",
]) {
  test(`apiBase inválida: ${base}`, () => {
    const error = thrown(() => new RayaClient(TEST_KEY, { apiBase: base }));
    assert.ok(error instanceof RangeError);
    assert.match(error.message, /apiBase/);
  });
}

test("apiBase tiene que ser un string", () => {
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  assert.ok(thrown(() => new RayaClient(TEST_KEY, { apiBase: 1 as any })) instanceof TypeError);
});

const INVALID_OPTIONS: Array<[Record<string, unknown>, typeof TypeError | typeof RangeError]> = [
  [{ timeout: 0 }, RangeError],
  [{ timeout: Number.POSITIVE_INFINITY }, RangeError],
  [{ timeout: 2 ** 31 }, RangeError],
  [{ timeout: "60000" }, TypeError],
  [{ timeout: true }, TypeError],
  [{ maxNetworkRetries: -1 }, RangeError],
  [{ maxNetworkRetries: 1.5 }, TypeError],
  [{ fetch: {} }, TypeError],
  [{ http_client: () => null }, TypeError],
  [{ appInfo: { name: "" } }, RangeError],
  [{ appInfo: { name: "x", otra: "y" } }, RangeError],
  [{ appInfo: { name: "x", version: 1 } }, TypeError],
  [{ appInfo: { name: "plugin\r\nX-Inyectado: 1" } }, RangeError],
  [{ appInfo: "x" }, TypeError],
];

for (const [options, ErrorType] of INVALID_OPTIONS) {
  test(`opciones inválidas del cliente: ${util.inspect(options)} → ${ErrorType.name}`, () => {
    // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
    const error = thrown(() => new RayaClient(TEST_KEY, options as any));
    assert.equal(error.constructor, ErrorType);
  });
}

test("la forma de los argumentos del constructor", () => {
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const Untyped = RayaClient as any;
  assert.ok(thrown(() => new Untyped({ apiKey: TEST_KEY }, {})) instanceof TypeError);
  assert.ok(thrown(() => new Untyped(TEST_KEY, { apiKey: TEST_KEY })) instanceof TypeError);
  assert.ok(thrown(() => new Untyped(TEST_KEY, "x")) instanceof TypeError);
});

test("los timeouts", async () => {
  const api = new MockAPI();
  for (let i = 0; i < 3; i += 1) api.add(200, BALANCE);
  const client = api.client();
  await client.balance.retrieve();
  await client.balance.retrieve({ timeout: 5_000 });
  await api.client(TEST_KEY, { timeout: 90_000 }).balance.retrieve();
  assert.deepEqual(state.timeouts, [65_000, 5_000, 90_000]);
});

test("los headers por defecto", async () => {
  const api = new MockAPI();
  api.add(200, BALANCE);
  await api.client().balance.retrieve();
  const headers = api.last.headers;
  assert.equal(headers.get("accept"), "application/json");
  assert.match(
    headers.get("user-agent") ?? "",
    /^rayacash-node\/\d+\.\d+\.\d+ Node\/\d+\.\d+\.\d+ undici\/\S+$/,
  );
  assert.equal(headers.get("content-type"), null);
  assert.equal(headers.get("idempotency-key"), null);
});

test("appInfo va en el User-Agent", async () => {
  const api = new MockAPI();
  api.add(200, BALANCE);
  api.add(200, BALANCE);
  await api
    .client(TEST_KEY, {
      appInfo: { name: "mi-plugin", version: "1.2.0", url: "https://plugin.example" },
    })
    .balance.retrieve();
  assert.ok(
    api.last.headers.get("user-agent")?.endsWith(" mi-plugin/1.2.0 (https://plugin.example)"),
  );
  await api.client(TEST_KEY, { appInfo: { name: "solo-nombre" } }).balance.retrieve();
  assert.ok(api.last.headers.get("user-agent")?.endsWith(" solo-nombre"));
});

test("rawRequest", async () => {
  const api = new MockAPI();
  const client = api.client();
  api.add(200, { object: "nuevo", x: 1 });
  const obj = await client.rawRequest("get", "/v1/algo", { params: { limit: 5, skip: null } });
  assert.equal(obj.constructor, RayaObject);
  assert.equal(obj.x, 1);
  assert.equal(api.last.method, "GET");
  assert.equal(api.last.url.href, "https://api.raya.cash/v1/algo?limit=5");

  api.add(201, PAYMENT_REFUNDED);
  const payment = await client.rawRequest("post", "/v1/algo", { body: { a: 1 } });
  assert.equal(payment.constructor, Payment);
  assert.deepEqual(api.lastJson(), { a: 1 });
  assert.equal(api.last.headers.get("content-type"), "application/json");
  assert.equal(api.last.headers.get("idempotency-key"), payment.lastResponse?.idempotencyKey);
});

test("las listas de rawRequest se pueden paginar", async () => {
  const api = new MockAPI();
  const client = api.client();
  api.add(200, TRANSFER_LIST);
  const page = await client.rawRequest("get", "/v1/transfers", { params: { limit: 2 } });
  assert.ok(page instanceof ListObject);
  api.add(200, { ...TRANSFER_LIST, has_more: false, next_cursor: null });
  await page.nextPage();
  assert.equal(api.last.url.searchParams.get("cursor"), TRANSFER_LIST.next_cursor);
  assert.equal(api.last.url.searchParams.get("limit"), "2");
});

const RAW_INVALID: Array<
  [string, string, Record<string, unknown>, Record<string, unknown>, RegExp]
> = [
  ["put", "/v1/balance", {}, {}, /GET y POST/],
  ["get", "v1/balance", {}, {}, /empezar con \//],
  ["get", "/v1/balance", {}, { idempotencyKey: "x" }, /solo va en los POST/],
  ["get", "/v1/balance", { body: { a: 1 } }, {}, /Un GET no lleva body/],
];

for (const [method, path, request, options, message] of RAW_INVALID) {
  test(`rawRequest valida: ${method} ${path} ${JSON.stringify({ ...request, ...options })}`, async () => {
    const error = await rejection(
      new MockAPI().client().rawRequest(method, path, request, options),
    );
    assert.ok(error instanceof RangeError);
    assert.match(error.message, message);
  });
}

test("rawRequest valida params y body", async () => {
  const client = new MockAPI().client();
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const untyped = client as any;
  assert.ok(
    (await rejection(untyped.rawRequest("get", "/v1/x", { params: "a=1" }))) instanceof TypeError,
  );
  assert.ok(
    (await rejection(untyped.rawRequest("post", "/v1/x", { body: [1] }))) instanceof TypeError,
  );
  assert.ok(
    (await rejection(untyped.rawRequest("post", "/v1/x", { query: {} }))) instanceof TypeError,
  );
  assert.ok((await rejection(untyped.rawRequest(1, "/v1/x"))) instanceof TypeError);
});

test("constructEvent liga el evento al cliente", async () => {
  const api = new MockAPI();
  const client = api.client();
  const body = JSON.stringify(EVENT_PAYMENT_SUCCEEDED);
  const header = WebhookSignature.generateHeader(body, WEBHOOK_SECRET);
  const event = client.constructEvent(body, header, WEBHOOK_SECRET);
  const payment = event.data.object;
  assert.ok(payment instanceof Payment);
  api.add(200, PAYMENT_REFUNDED);
  const refunded = await payment.refund();
  assert.equal(refunded.status, "refunded");
  assert.equal(api.last.url.pathname, `/v1/payments/${payment.id}/refund`);
});
