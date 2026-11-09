import assert from "node:assert/strict";
import { test } from "node:test";
import util from "node:util";

import {
  APIError,
  AuthenticationError,
  ListObject,
  Payment,
  RayaClient,
  RayaObject,
  WebhookSignature,
} from "../src/index.ts";
import {
  ACCESS_TOKEN,
  BALANCE,
  CLIENT_ID,
  CLIENT_SECRET,
  EVENT_PAYMENT_SUCCEEDED,
  OAUTH_CODE,
  PAYMENT_REFUNDED,
  REDIRECT_URI,
  TRANSFER_LIST,
  USER,
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
  // Los espacios de str.strip() de Python, no los de trim(): U+001C y U+0085 sí, U+FEFF no.
  ["\x1c\x85", "API_KEY_MISSING"],
  ["\ufeff", "API_KEY_INVALID"],
];

for (const [key, code] of INVALID_KEYS) {
  test(`una clave inválida falla al construir: ${code}`, () => {
    const error = thrown(() => new RayaClient(key));
    assert.ok(error instanceof AuthenticationError);
    assert.equal(error.code, code);
  });
}

test("el access_token de una cuenta conectada vale como clave", async () => {
  const api = new MockAPI();
  api.add(200, USER);
  await api.client(ACCESS_TOKEN).users.retrieve("me");
  assert.equal(api.last.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  api.add(200, USER);
  await new RayaClient({ apiKey: ACCESS_TOKEN, fetch: api.fetch }).users.retrieve("me");
  assert.equal(api.last.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  process.env.RAYA_SECRET_KEY = ACCESS_TOKEN;
  api.add(200, USER);
  await api.client(null).users.retrieve("me");
  assert.equal(api.last.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  api.add(200, USER);
  await api.client().users.retrieve("me", { apiKey: ACCESS_TOKEN }); // por request
  assert.equal(api.last.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
});

test("los mensajes de la clave nombran también el access_token", () => {
  let error = thrown(() => new RayaClient(""));
  assert.equal(error.code, "API_KEY_MISSING");
  assert.match(error.message, /raya_sk_live_….*raya_at_live_….*RAYA_SECRET_KEY/);
  error = thrown(() => new RayaClient("raya_pk_live_x"));
  assert.equal(error.code, "API_KEY_PUBLISHABLE_NOT_ALLOWED");
  assert.match(error.message, /raya_at_live_/);
  error = thrown(() => new RayaClient(`${ACCESS_TOKEN} `));
  assert.equal(error.code, "API_KEY_INVALID");
  assert.match(error.message, /access_token/);
});

test("console.log enmascara también un access_token", () => {
  const client = new RayaClient(ACCESS_TOKEN);
  assert.equal(
    util.inspect(client),
    "RayaClient { apiBase: 'https://api.raya.cash', apiKey: 'raya_at_live_…fG9h' }",
  );
  assert.ok(!JSON.stringify(client).includes(ACCESS_TOKEN));
});

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
  // Una query o un fragmento vacíos cuentan como ausentes: sus marcas no quedan en la base.
  ["https://api.raya.cash?", "https://api.raya.cash"],
  ["https://api.raya.cash#", "https://api.raya.cash"],
  ["https://api.raya.cash/?#", "https://api.raya.cash"],
  ["https://proxy.example.com/raya/?", "https://proxy.example.com/raya"],
  ["http://localhost:8000#", "http://localhost:8000"],
  // Los espacios de los bordes son los de str.strip() de Python: también U+001C y U+0085.
  ["\x85https://api.raya.cash/\x1c", "https://api.raya.cash"],
];

for (const [base, expected] of VALID_BASES) {
  test(`apiBase válida: ${JSON.stringify(base)}`, async () => {
    const api = new MockAPI();
    api.add(200, BALANCE);
    const client = api.client(TEST_KEY, { apiBase: base });
    await client.balance.retrieve();
    assert.equal(api.last.url.href, `${expected}/v1/balance`);
    assert.equal(client.toJSON().apiBase, expected);
  });
}

for (const base of [
  "http://api.raya.cash",
  "ftp://x",
  "api.raya.cash",
  "https://",
  "https://x?y=1",
  "https://x#frag",
  "https://x??",
  "https://x?#y",
  "https://x/#?",
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

test("appInfo sin name: los espacios de Python, no los de trim()", () => {
  const error = thrown(() => new RayaClient(TEST_KEY, { appInfo: { name: "\x1c\x85" } }));
  assert.ok(error instanceof RangeError);
  assert.equal(error.message, "appInfo necesita un name.");
});

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

test("oauth.token acepta timeout y maxNetworkRetries por llamada, y nada más", async () => {
  const api = new MockAPI();
  api.addError(500, "INTERNAL_ERROR");
  const oauth = api.client(null).oauth;
  const params = {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code: OAUTH_CODE,
    redirect_uri: REDIRECT_URI,
  };
  const error = await rejection(oauth.token(params, { timeout: 5_000, maxNetworkRetries: 0 }));
  assert.ok(error instanceof APIError);
  assert.equal(error.code, "INTERNAL_ERROR");
  assert.equal(error.idempotencyKey, null); // la request no llevó ninguna
  assert.equal(api.requests.length, 1); // maxNetworkRetries: 0
  assert.deepEqual(state.timeouts, [5_000]);
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  const untyped = oauth as any;
  for (const options of [{ apiKey: ACCESS_TOKEN }, { idempotencyKey: "canje-1" }]) {
    const rejected = await rejection(untyped.token(params, options));
    assert.ok(rejected instanceof RangeError);
    assert.match(rejected.message, /^oauth\.token no acepta/);
  }
  assert.equal(api.requests.length, 1);
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

test("rawRequest manda los espacios de la ruta codificados en todas las páginas", async () => {
  // Como httpx: fetch sacaba el espacio del final en la primera página y no en la siguiente.
  const api = new MockAPI();
  const client = api.client();
  api.add(200, TRANSFER_LIST);
  const page = await client.rawRequest("get", "/v1/transfers ");
  assert.ok(page instanceof ListObject);
  assert.equal(api.last.url.pathname, "/v1/transfers%20");
  api.add(200, { ...TRANSFER_LIST, has_more: false, next_cursor: null });
  await page.nextPage();
  assert.equal(api.last.url.pathname, "/v1/transfers%20");
  assert.equal(api.last.url.searchParams.get("cursor"), TRANSFER_LIST.next_cursor);
});

// La query va en params: pegada a la ruta, la página siguiente le sumaría ?cursor a su valor.
const NO_QUERY = /^La ruta va sin query \(usá params\)\.$/;
// Como en Python y PHP: fetch convertía \ en / y sacaba los saltos y los tabs, sin avisar.
const NO_CONTROLS = /^La ruta va sin \\ ni caracteres de control \(codificá los ids\)\.$/;

const RAW_INVALID: Array<
  [string, string, Record<string, unknown>, Record<string, unknown>, RegExp]
> = [
  ["put", "/v1/balance", {}, {}, /GET y POST/],
  ["get", "v1/balance", {}, {}, /empezar con \//],
  ["get", "/v1/balance", {}, { idempotencyKey: "x" }, /solo va en los POST/],
  ["get", "/v1/balance", { body: { a: 1 } }, {}, /Un GET no lleva body/],
  ["get", "/v1/things?x=1", { params: { limit: 2 } }, {}, NO_QUERY],
  ["get", "/v1/things?", {}, {}, NO_QUERY],
  ["get", "/v1/things#x", {}, {}, NO_QUERY],
  ["post", "/v1/things?x=1", { body: { a: 1 } }, {}, NO_QUERY],
  ["get", "/v1/a\\b", {}, {}, NO_CONTROLS],
  ["get", "/v1/a\tb", {}, {}, NO_CONTROLS],
  ["get", "/v1/a\nb", {}, {}, NO_CONTROLS],
  ["get", "/v1/a\rb", {}, {}, NO_CONTROLS],
  ["get", "/v1/\x00", {}, {}, NO_CONTROLS],
  ["post", "/v1/\x7f", { body: { a: 1 } }, {}, NO_CONTROLS],
];

for (const [method, path, request, options, message] of RAW_INVALID) {
  test(`rawRequest valida: ${method} ${JSON.stringify(path)} ${JSON.stringify({ ...request, ...options })}`, async () => {
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
