import assert from "node:assert/strict";
import { test } from "node:test";
import util from "node:util";

import {
  Checkout,
  Event,
  ListObject,
  OAuthToken,
  Payment,
  RayaObject,
  Transfer,
  User,
} from "../src/index.ts";
import { convertValue } from "../src/rayaObject.ts";
import {
  ACCESS_TOKEN,
  CHECKOUT_SUCCEEDED,
  EVENT_CHECKOUT_SUCCEEDED,
  EVENT_PAYMENT_SUCCEEDED,
  OAUTH_TOKEN,
  PAYMENT_PENDING,
  PAYMENT_SUCCEEDED,
  TRANSFER_INBOUND,
  TRANSFER_LIST,
  USER,
} from "./fixtures.ts";
import { isolate, thrown } from "./helpers.ts";

isolate();

// biome-ignore lint/suspicious/noExplicitAny: los tests miran campos de cualquier objeto.
function convert(value: unknown): any {
  return convertValue(JSON.parse(JSON.stringify(value)));
}

test("una transferencia es su clase, con acceso por propiedad", () => {
  const transfer = convert(TRANSFER_INBOUND);
  assert.equal(transfer.constructor, Transfer);
  assert.equal(transfer instanceof RayaObject, true); // sin assert.ok: el instanceof achicaría el any
  assert.equal(transfer.id, TRANSFER_INBOUND.id);
  assert.equal(transfer.fee, 130.41);
  assert.equal(transfer.counterparty.alias, null);
  assert.equal(transfer.counterparty.account, "0000123319112992888845");
  assert.equal(Object.getPrototypeOf(transfer.counterparty), Object.prototype);
});

test("los valores quedan como el JSON crudo", () => {
  const transfer = convert(TRANSFER_INBOUND);
  assert.deepEqual(JSON.parse(JSON.stringify(transfer)), TRANSFER_INBOUND);
  assert.deepEqual(transfer.toJSON(), TRANSFER_INBOUND);
  assert.deepEqual({ ...transfer, counterparty: { ...transfer.counterparty } }, TRANSFER_INBOUND);
  assert.deepEqual(Object.keys(transfer), Object.keys(TRANSFER_INBOUND));
  assert.equal(typeof transfer.amount, "number");
  assert.equal(typeof transfer.created_at, "string");
});

test("los sub-objetos de un pago y la metadata plana", () => {
  const pending = convert(PAYMENT_PENDING);
  assert.equal(pending.constructor, Payment);
  assert.equal(pending.bank_transfer.cvu, "0000123322813466534007");
  assert.equal(pending.payer, null);
  assert.equal(Object.getPrototypeOf(pending.metadata), Object.prototype);
  const succeeded = convert(PAYMENT_SUCCEEDED);
  assert.equal(succeeded.payer.name, "María Ejemplo");
});

test("las claves de la metadata son tuyas: nunca se convierten", () => {
  const payment = convert({ ...PAYMENT_PENDING, metadata: { object: "payment", keys: "x" } });
  assert.deepEqual(payment.metadata, { object: "payment", keys: "x" });
  assert.equal(Object.getPrototypeOf(payment.metadata), Object.prototype);
});

test("los campos y objetos desconocidos se conservan", () => {
  const transfer = convert({
    ...TRANSFER_INBOUND,
    nuevo_campo: { a: 1 },
    otro: [{ object: "algo_nuevo", x: 2 }],
  });
  assert.deepEqual(transfer.nuevo_campo, { a: 1 });
  assert.equal(transfer.otro[0].constructor, RayaObject);
  assert.equal(transfer.otro[0].x, 2);
  assert.equal(convert({ object: "nuevo" }).constructor, RayaObject);
  assert.deepEqual(convert([1, "x", null]), [1, "x", null]);
});

test("un __proto__ del JSON queda como dato", () => {
  const transfer = convert(JSON.parse(`{"object":"transfer","__proto__":{"polluted":true}}`));
  assert.equal(transfer.constructor, Transfer);
  assert.equal(transfer.polluted, undefined);
  assert.ok(Object.hasOwn(transfer, "__proto__"));
});

test("console.log muestra la clase y los campos, no el cliente ni la respuesta", () => {
  const payment = convert(PAYMENT_PENDING);
  const shown = util.inspect(payment);
  assert.ok(shown.startsWith("Payment {"));
  assert.match(shown, /status: 'pending'/);
  assert.doesNotMatch(shown, /lastResponse|requestor/);
  assert.equal(String(new RayaObject()), "[object Object]");
});

test("structuredClone y el spread dan datos planos", () => {
  const payment = convert(PAYMENT_SUCCEEDED);
  const clone = structuredClone(payment);
  assert.deepEqual(clone, PAYMENT_SUCCEEDED);
  clone.metadata.cliente_id = "otro";
  assert.equal(payment.metadata.cliente_id, "8812");
});

test("un evento hidrata su objeto", () => {
  const event = Event.constructFrom(EVENT_PAYMENT_SUCCEEDED);
  assert.equal(event.constructor, Event);
  assert.equal(event.data.object.constructor, Payment);
  assert.equal((event.data.object as Payment).status, "succeeded");
  const testEvent = Event.constructFrom({
    id: "evt_x",
    object: "event",
    type: "webhook.test",
    data: { object: { object: "test" } },
  });
  assert.equal(testEvent.data.object.constructor, RayaObject);
});

test("constructFrom necesita un objeto y no tiene respuesta HTTP", () => {
  const payment = Payment.constructFrom({ object: "payment", id: "p" });
  assert.equal(payment.lastResponse, null);
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  assert.ok(thrown(() => Payment.constructFrom([] as any)) instanceof TypeError);
});

test("una ListObject recorre su data", () => {
  const page = convert(TRANSFER_LIST);
  assert.equal(page.constructor, ListObject);
  assert.deepEqual(
    [...page].map((transfer: Transfer) => transfer.id),
    [TRANSFER_LIST.data[0]?.id, TRANSFER_LIST.data[1]?.id],
  );
  assert.equal(page.data.length, 2);
  assert.ok(page.data.every((transfer: unknown) => transfer instanceof Transfer));
  assert.equal(page.has_more, true);
  assert.equal(page.next_cursor, TRANSFER_LIST.next_cursor);
  assert.deepEqual(JSON.parse(JSON.stringify(page)), TRANSFER_LIST);
  assert.deepEqual(page.toJSON(), TRANSFER_LIST);
});

test("una ListObject sin data", () => {
  const page = ListObject.constructFrom({ object: "list" });
  assert.deepEqual([...page], []);
});

test("un checkout: ítems y back_urls planos, metadata tuya", () => {
  const checkout = convert(CHECKOUT_SUCCEEDED);
  assert.equal(checkout.constructor, Checkout);
  assert.equal(checkout.net_amount, 44500);
  assert.equal(checkout.items[0].unit_price, 45000);
  assert.equal(Object.getPrototypeOf(checkout.items[0]), Object.prototype);
  assert.equal(checkout.back_urls.failure, "https://tienda.example.com/pedidos/1042/error");
  assert.equal(checkout.payer.name, "María Ejemplo");
  assert.equal(Object.getPrototypeOf(checkout.metadata), Object.prototype);
  assert.deepEqual(JSON.parse(JSON.stringify(checkout)), CHECKOUT_SUCCEEDED);
  assert.deepEqual(Object.keys(checkout), Object.keys(CHECKOUT_SUCCEEDED));
  assert.ok(util.inspect(checkout).startsWith("Checkout {"));
});

test("un usuario y sus sub-objetos", () => {
  const user = convert(USER);
  assert.equal(user.constructor, User);
  assert.equal(user.identification.type, "DNI");
  assert.equal(user.address.province, "Santa Fe");
  assert.equal(user.business, null);
  assert.equal(user.merchant.name, "Almacén Ejemplo");
  assert.equal(user.identity_verified, true);
  assert.deepEqual(user.toJSON(), USER);
  const business = convert({
    ...USER,
    type: "business",
    business: {
      legal_name: "Almacén Ejemplo S. A.",
      tax_id: "30123456782",
      company_type: "SA",
      representative: { first_name: "Lucía", last_name: "Ejemplo", tax_id: "27345678901" },
    },
  });
  assert.equal(business.business.representative.last_name, "Ejemplo");
});

test("una empresa: los campos sin dato llegan en null y quedan null", () => {
  const business = convert({
    ...USER,
    type: "business",
    first_name: "Almacén Ejemplo S. A.",
    last_name: null,
    full_name: "Almacén Ejemplo S. A.",
    identification: { type: "CUIT", number: "30123456782" },
    tax_id: "30123456782",
    business: {
      legal_name: "Almacén Ejemplo S. A.",
      tax_id: "30123456782",
      company_type: null,
      representative: { first_name: "Lucía", last_name: "Ejemplo", tax_id: null },
    },
  });
  assert.equal(business.last_name, null);
  assert.equal(business.full_name, "Almacén Ejemplo S. A.");
  assert.equal(business.identification.type, "CUIT");
  assert.equal(business.business.company_type, null);
  assert.equal(business.business.representative.tax_id, null);
});

test("console.log de un OAuthToken enmascara el access_token", () => {
  const token = convert(OAUTH_TOKEN);
  assert.equal(token.constructor, OAuthToken);
  assert.equal(token.access_token, ACCESS_TOKEN); // el valor está entero
  const shown = util.inspect(token);
  assert.ok(shown.startsWith("OAuthToken {"));
  assert.match(shown, /access_token: 'raya_at_live_…fG9h'/);
  assert.ok(!shown.includes(ACCESS_TOKEN));
  assert.match(shown, /user_id: '9d4f2b7e-3c61-4e0a-9b8f-2a5c7d1e6f40'/);
  // Para guardarlo, entero.
  assert.equal(JSON.stringify(token), JSON.stringify(OAUTH_TOKEN));
  assert.deepEqual(token.toJSON(), OAUTH_TOKEN);
  const empty = OAuthToken.constructFrom({ object: "oauth_token" });
  assert.equal(util.inspect(empty), "OAuthToken { object: 'oauth_token' }");
});

test("un evento checkout.* hidrata un Checkout", () => {
  const event = Event.constructFrom(EVENT_CHECKOUT_SUCCEEDED);
  assert.equal(event.type, "checkout.succeeded");
  assert.equal(event.data.object.constructor, Checkout);
  assert.equal((event.data.object as Checkout).fee, 500);
});
