// Los nombres de la 1.1.0, deprecados hasta la 2.0.0: son los mismos objetos que los de Raya
// Connect, llaman a las rutas nuevas y `client.checkout` avisa una vez por proceso.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";

import { resetDeprecationWarnings } from "../src/deprecated.ts";
import * as sdk from "../src/index.ts";
import {
  Checkout,
  type CheckoutCreateParams,
  ConnectOrder,
  config,
  RayaClient,
  Webhook,
  WebhookSignature,
} from "../src/index.ts";
import { convertValue } from "../src/rayaObject.ts";
import {
  ACCESS_TOKEN,
  EVENT_ORDER_SUCCEEDED,
  ORDER_ID,
  ORDER_ITEMS,
  ORDER_PENDING,
  ORDER_REFUNDED,
  ORDER_SUCCEEDED,
  WEBHOOK_SECRET,
} from "./fixtures.ts";
import { isolate, MockAPI, TEST_KEY } from "./helpers.ts";

isolate();

const WARNING = {
  message:
    "client.checkout está deprecado: usá client.connect, que es el mismo objeto. Se elimina en " +
    "rayacash 2.0.0.",
  options: { type: "DeprecationWarning", code: "RAYACASH_DEP_CHECKOUT" },
};

// Lo que exportaba la 1.1.0 en runtime (`import * as sdk from "rayacash"`).
const EXPORTS_1_1_0 = [
  "APIConnectionError",
  "APIError",
  "AuthenticationError",
  "Balance",
  "Checkout",
  "ConflictError",
  "DEFAULT_API_BASE",
  "Event",
  "IdempotencyError",
  "InvalidRequestError",
  "ListObject",
  "NotFoundError",
  "OAuth",
  "OAuthToken",
  "Payment",
  "PermissionDeniedError",
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

// El body de un webhook emitido antes del cambio de nombre de la API, como quedó guardado.
const LEGACY_ORDER = { ...ORDER_SUCCEEDED, object: "checkout" };
const LEGACY_EVENT = {
  ...EVENT_ORDER_SUCCEEDED,
  type: "checkout.succeeded",
  data: { object: LEGACY_ORDER },
};

// process.emitWarning, reemplazado en cada caso: guarda los avisos en vez de mostrarlos.
const ORIGINAL_EMIT_WARNING = process.emitWarning;
const warnings: Array<{ message: unknown; options: unknown }> = [];

beforeEach(() => {
  resetDeprecationWarnings();
  warnings.length = 0;
  process.emitWarning = ((message: unknown, options: unknown) => {
    warnings.push({ message, options });
  }) as typeof process.emitWarning;
});

afterEach(() => {
  process.emitWarning = ORIGINAL_EMIT_WARNING;
  resetDeprecationWarnings();
});

test("todo lo que exportaba la 1.1.0 sigue exportado", () => {
  const names = Object.keys(sdk);
  for (const name of EXPORTS_1_1_0) assert.ok(names.includes(name), name);
  // Y lo único nuevo son ConnectOrder, ConnectPayout y las clases de Identidad.
  assert.deepEqual(
    names.filter((name) => !EXPORTS_1_1_0.includes(name)),
    ["ConnectOrder", "ConnectPayout", "IdentityVerification", "IdentityVerificationFiles"],
  );
});

test("Checkout es la misma clase que ConnectOrder", () => {
  assert.equal(Checkout, ConnectOrder);
  const order = ConnectOrder.constructFrom(ORDER_SUCCEEDED);
  assert.ok(order instanceof Checkout);
  const checkout = Checkout.constructFrom(ORDER_SUCCEEDED);
  assert.ok(checkout instanceof ConnectOrder);
  assert.equal(checkout.constructor, ConnectOrder);
  assert.equal(checkout.items[0]?.unit_price, 45000);
  assert.deepEqual(warnings, []); // solo client.checkout avisa en runtime
});

test("client.checkout es client.connect: llama a /v1/connect/orders", async () => {
  const api = new MockAPI();
  const client = api.client(ACCESS_TOKEN);
  assert.equal(client.checkout, client.connect);
  assert.equal(client.checkout.orders, client.connect.orders);

  api.add(201, ORDER_PENDING);
  const params: CheckoutCreateParams = { items: ORDER_ITEMS, fee: 500 };
  const checkout = await client.checkout.orders.create(params, { idempotencyKey: "pedido-1042" });
  assert.equal(checkout.constructor, ConnectOrder);
  assert.deepEqual([api.last.method, api.last.url.pathname], ["POST", "/v1/connect/orders"]);
  assert.equal(api.last.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(api.last.headers.get("idempotency-key"), "pedido-1042");
  assert.deepEqual(api.lastJson(), { items: ORDER_ITEMS, fee: 500 });

  api.add(200, ORDER_SUCCEEDED);
  const paid = await client.checkout.orders.retrieve(ORDER_ID);
  assert.equal(paid.status, "succeeded");
  assert.deepEqual(
    [api.last.method, api.last.url.pathname],
    ["GET", `/v1/connect/orders/${ORDER_ID}`],
  );

  api.add(200, ORDER_REFUNDED);
  const refunded = await client.checkout.orders.refund(ORDER_ID, { idempotencyKey: "r-1" });
  assert.equal(refunded.status, "refunded");
  assert.deepEqual(
    [api.last.method, api.last.url.pathname],
    ["POST", `/v1/connect/orders/${ORDER_ID}/refund`],
  );
  assert.equal(api.last.headers.get("idempotency-key"), "r-1");

  // refund() de la instancia, con el cliente del que vino.
  api.add(200, ORDER_REFUNDED);
  await paid.refund({ idempotencyKey: "r-2" });
  assert.equal(api.last.url.pathname, `/v1/connect/orders/${ORDER_ID}/refund`);
  assert.equal(api.last.headers.get("idempotency-key"), "r-2");
  assert.equal(api.requests.length, 4);
});

test("client.checkout avisa una sola vez por proceso, con un DeprecationWarning", () => {
  const first = new RayaClient(TEST_KEY);
  const second = new RayaClient(TEST_KEY);
  assert.equal(first.checkout, first.connect);
  assert.deepEqual(warnings, [WARNING]);
  assert.equal(first.checkout.orders, first.connect.orders);
  assert.equal(second.checkout, second.connect);
  assert.deepEqual(warnings, [WARNING]);
});

test("client.checkout se puede reasignar desde JavaScript, como en la 1.1.0", () => {
  // En la 1.1.0 era una propiedad propia de cada cliente (un test la cambia por un mock). En
  // TypeScript sigue siendo de solo lectura, como entonces: de ahí el cast.
  const client = new RayaClient(TEST_KEY);
  const writable = client as { checkout: unknown };
  const mock = { orders: { create: async () => ({ id: "fake" }) } };
  writable.checkout = mock;
  assert.equal(client.checkout, mock);
  assert.deepEqual(Object.getOwnPropertyDescriptor(client, "checkout"), {
    value: mock,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  assert.ok(Object.keys(client).includes("checkout"));
  writable.checkout = null; // se puede volver a asignar
  assert.equal(client.checkout, null);
  assert.ok(client.connect.orders); // client.connect sigue igual
  assert.deepEqual(warnings, []); // ni asignar ni leer lo asignado avisa

  // Sin asignar, el getter sigue igual: devuelve client.connect y avisa una sola vez.
  const other = new RayaClient(TEST_KEY);
  assert.equal(other.checkout, other.connect);
  assert.equal(other.checkout.orders, other.connect.orders);
  assert.deepEqual(warnings, [WARNING]);
  assert.ok(!Object.keys(other).includes("checkout"));

  // La propiedad es configurable: borrada, vuelve el getter.
  assert.ok(Reflect.deleteProperty(client, "checkout"));
  assert.equal(client.checkout, client.connect);
  assert.deepEqual(warnings, [WARNING]);
});

test("los nombres nuevos no avisan", async () => {
  const api = new MockAPI();
  const client = api.client(ACCESS_TOKEN);
  api.add(201, ORDER_PENDING);
  await client.connect.orders.create({ items: ORDER_ITEMS });
  // client.checkout es un getter del prototipo: copiar el cliente o listar sus claves no lo toca.
  const copy = { ...client };
  assert.ok(!("checkout" in copy));
  assert.ok(!Object.keys(client).includes("checkout"));
  assert.deepEqual(warnings, []);
});

test("sin process.emitWarning, o sin process, client.checkout anda y no lanza", () => {
  const client = new RayaClient(TEST_KEY);
  // Un process sin emitWarning.
  process.emitWarning = undefined as unknown as typeof process.emitWarning;
  assert.equal(client.checkout, client.connect);
  // Un runtime sin process (edge, navegadores): solo dentro de este bloque, sin await.
  resetDeprecationWarnings();
  const original = globalThis.process;
  let same = false;
  try {
    // @ts-expect-error: un runtime sin process.
    globalThis.process = undefined;
    same = client.checkout === client.connect;
  } finally {
    globalThis.process = original;
  }
  assert.ok(same);
  assert.deepEqual(warnings, []);
});

test("Checkout.create, retrieve y refund (estilo global) llaman a /v1/connect/orders", async () => {
  const api = new MockAPI();
  config.apiKey = ACCESS_TOKEN;
  config.fetch = api.fetch;
  api.add(201, ORDER_PENDING);
  const checkout = await Checkout.create({ items: ORDER_ITEMS, fee: 500 });
  assert.equal(checkout.constructor, ConnectOrder);
  assert.deepEqual([api.last.method, api.last.url.pathname], ["POST", "/v1/connect/orders"]);
  api.add(200, ORDER_SUCCEEDED);
  assert.equal((await Checkout.retrieve(ORDER_ID)).status, "succeeded");
  assert.equal(api.last.url.pathname, `/v1/connect/orders/${ORDER_ID}`);
  api.add(200, ORDER_REFUNDED);
  assert.equal((await Checkout.refund(ORDER_ID)).status, "refunded");
  assert.equal(api.last.url.pathname, `/v1/connect/orders/${ORDER_ID}/refund`);
  assert.equal(api.last.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.deepEqual(warnings, []);
});

test('object: "checkout" (un webhook de antes del cambio de nombre) es un ConnectOrder', async () => {
  const order = convertValue(LEGACY_ORDER);
  assert.ok(order instanceof ConnectOrder);
  assert.ok(order instanceof Checkout);
  assert.equal(order.object, "checkout");

  // Firmado y reenviado: el evento conserva su tipo y su objeto, y refund() va a la ruta nueva.
  const body = JSON.stringify(LEGACY_EVENT);
  const header = WebhookSignature.generateHeader(body, WEBHOOK_SECRET);
  const api = new MockAPI();
  const event = api.client(ACCESS_TOKEN).constructEvent(body, header, WEBHOOK_SECRET);
  assert.equal(event.type, "checkout.succeeded");
  const object = event.data.object;
  assert.ok(object instanceof ConnectOrder);
  assert.equal(object.fee, 500);
  api.add(200, ORDER_REFUNDED);
  const refunded = await object.refund();
  assert.equal(refunded.object, "connect.order");
  assert.equal(api.last.url.pathname, `/v1/connect/orders/${ORDER_ID}/refund`);

  // También con el estilo global.
  const global = Webhook.constructEvent(body, header, WEBHOOK_SECRET);
  assert.ok(global.data.object instanceof Checkout);
});

test("cada alias deprecado lleva @deprecated en su JSDoc", () => {
  // Es lo que muestra el editor (tachado, con el nombre nuevo): sin el tag, nadie se entera.
  const read = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const jsDocBefore = (source: string, index: number): string => {
    const before = source.slice(0, index).trimEnd();
    return before.endsWith("*/") ? before.slice(before.lastIndexOf("/**")) : "";
  };

  const source = read("deprecated.ts");
  // Las declaraciones (no los `type …,` del import): las que siguen con ` =` o ` {`.
  const declarations = [
    ...source.matchAll(/^ *(?:export (?:const|type|declare namespace) |type )(\w+)(?= =| \{)/gm),
  ];
  assert.deepEqual(declarations.map((match) => match[1]).sort(), [
    "BackUrls",
    "BankTransfer",
    "Checkout",
    "Checkout",
    "Checkout",
    "CheckoutBackUrlsParams",
    "CheckoutCreateParams",
    "CheckoutItemParams",
    "CheckoutOrdersService",
    "CheckoutOrdersService",
    "CheckoutService",
    "CheckoutService",
    "CheckoutStatus",
    "Item",
    "Payer",
  ]);
  for (const match of declarations) {
    assert.match(jsDocBefore(source, match.index), /@deprecated /, match[1]);
  }

  const client = read("client.ts");
  const getter = client.indexOf("  get checkout(): ConnectService {");
  assert.ok(getter > 0);
  assert.match(
    jsDocBefore(client, getter),
    /@deprecated Desde la 1\.2\.0 se llama `client\.connect`/,
  );
});
