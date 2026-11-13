import assert from "node:assert/strict";
import { test } from "node:test";
import util from "node:util";

import {
  ConnectOrder,
  ConnectPayout,
  Event,
  IdentityVerification,
  IdentityVerificationFiles,
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
  EVENT_ORDER_SUCCEEDED,
  EVENT_PAYMENT_SUCCEEDED,
  EVENT_SANDBOX_PAYMENT_SUCCEEDED,
  EVENT_VERIFICATION_CANCELED,
  EVENT_VERIFICATION_VERIFIED,
  OAUTH_TOKEN,
  ORDER_SUCCEEDED,
  PAYMENT_PENDING,
  PAYMENT_SUCCEEDED,
  PAYOUT_COMPLETED,
  PAYOUT_PENDING,
  SANDBOX_ACCESS_TOKEN,
  SANDBOX_ORDER_SUCCEEDED,
  SANDBOX_PAYMENT_SUCCEEDED,
  TRANSFER_INBOUND,
  TRANSFER_LIST,
  USER,
  VERIFICATION_DECLINED,
  VERIFICATION_FILES,
  VERIFICATION_ID,
  VERIFICATION_LIST,
  VERIFICATION_PENDING,
  VERIFICATION_PERSON,
  VERIFICATION_VERIFIED,
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

test("un pago de Connect: ítems y back_urls planos, metadata tuya", () => {
  const order = convert(ORDER_SUCCEEDED);
  assert.equal(order.constructor, ConnectOrder);
  assert.equal(order.net_amount, 44500);
  assert.equal(order.items[0].unit_price, 45000);
  assert.equal(Object.getPrototypeOf(order.items[0]), Object.prototype);
  assert.equal(order.back_urls.failure, "https://tienda.example.com/pedidos/1042/error");
  assert.equal(order.payer.name, "María Ejemplo");
  assert.equal(Object.getPrototypeOf(order.metadata), Object.prototype);
  assert.deepEqual(JSON.parse(JSON.stringify(order)), ORDER_SUCCEEDED);
  assert.deepEqual(Object.keys(order), Object.keys(ORDER_SUCCEEDED));
  assert.ok(util.inspect(order).startsWith("ConnectOrder {"));
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

test("console.log de un OAuthToken de prueba lo enmascara con su prefijo", () => {
  // El de un usuario de prueba de un sandbox (raya_at_test_…): la misma máscara, con su prefijo.
  const fields = { ...OAUTH_TOKEN, access_token: SANDBOX_ACCESS_TOKEN };
  const token = convert(fields);
  assert.equal(token.constructor, OAuthToken);
  assert.equal(token.access_token, SANDBOX_ACCESS_TOKEN);
  const shown = util.inspect(token);
  assert.match(shown, /access_token: 'raya_at_test_…hgfe'/);
  assert.ok(!shown.includes(SANDBOX_ACCESS_TOKEN));
  assert.deepEqual(token.toJSON(), fields); // para guardarlo, entero
});

test("un evento connect.order.* hidrata un ConnectOrder", () => {
  const event = Event.constructFrom(EVENT_ORDER_SUCCEEDED);
  assert.equal(event.type, "connect.order.succeeded");
  assert.equal(event.data.object.constructor, ConnectOrder);
  assert.equal((event.data.object as ConnectOrder).fee, 500);
});

test("un payout de Connect es su clase, con origin y counterparty planos", () => {
  const payout = convert(PAYOUT_PENDING);
  assert.equal(payout.constructor, ConnectPayout);
  assert.equal(ConnectPayout.OBJECT_NAME, "connect.payout");
  assert.equal(payout.origin.name, "Tienda Ejemplo");
  assert.equal(payout.counterparty.alias, "ana.ejemplo");
  assert.equal(Object.getPrototypeOf(payout.origin), Object.prototype);
  assert.equal(Object.getPrototypeOf(payout.counterparty), Object.prototype);
  assert.deepEqual(JSON.parse(JSON.stringify(payout)), PAYOUT_PENDING);
  assert.deepEqual(Object.keys(payout), Object.keys(PAYOUT_PENDING));
  assert.equal(typeof payout.processing_fee, "number");
  assert.ok(util.inspect(payout).startsWith("ConnectPayout {"));
});

test("el registro de connect.payout: una lista hidrata cada payout con su clase", () => {
  const page = convert({
    object: "list",
    data: [PAYOUT_PENDING, PAYOUT_COMPLETED],
    has_more: false,
    next_cursor: null,
  });
  assert.equal(page.constructor, ListObject);
  assert.deepEqual(
    page.data.map((payout: unknown) => (payout as object).constructor),
    [ConnectPayout, ConnectPayout],
  );
  assert.equal(page.data[1].reference, "M7Q2X9T4K1V6N3B8R5W0ZD");
});

// --- Identidad --------------------------------------------------------------------------------

test("una verificación es su clase (el object lleva un punto), con acceso por propiedad", () => {
  const verification = convert(VERIFICATION_VERIFIED);
  assert.equal(verification.constructor, IdentityVerification);
  assert.equal(IdentityVerification.OBJECT_NAME, "identity.verification");
  assert.equal(verification instanceof RayaObject, true); // sin assert.ok: el instanceof achicaría el any
  assert.equal(verification.id, VERIFICATION_ID);
  assert.equal(verification.amount, 1000);
  assert.equal(verification.currency, "ARS");
  assert.equal(verification.checks.liveness.confidence, 99.1);
  assert.equal(verification.checks.registry.face_match, "hit");
  assert.equal(verification.person.cuil, VERIFICATION_PERSON.cuil);
  assert.equal(verification.person.address.municipality, "Rosario");
});

test("una verificación queda como el JSON crudo y en su orden (19 claves)", () => {
  const verification = convert(VERIFICATION_VERIFIED);
  assert.deepEqual(JSON.parse(JSON.stringify(verification)), VERIFICATION_VERIFIED);
  assert.deepEqual(verification.toJSON(), VERIFICATION_VERIFIED);
  assert.deepEqual(Object.keys(verification), Object.keys(VERIFICATION_VERIFIED));
  assert.equal(Object.keys(verification).length, 19);
  assert.equal(typeof verification.amount, "number");
  assert.equal(typeof verification.created_at, "string");
});

test("los sub-objetos de una verificación son planos", () => {
  const verification = convert(VERIFICATION_VERIFIED);
  for (const value of [
    verification.person,
    verification.person.address,
    verification.person.document,
    verification.checks,
    verification.checks.document,
    verification.checks.liveness,
    verification.checks.face_match,
    verification.checks.registry,
    verification.metadata,
  ]) {
    assert.equal(Object.getPrototypeOf(value), Object.prototype);
  }
  const declined = convert(VERIFICATION_DECLINED);
  assert.equal(Object.getPrototypeOf(declined.decline_reason), Object.prototype);
  assert.equal(declined.decline_reason.code, "registry_data_mismatch");
  assert.equal(declined.person, null);
});

test("las claves de la metadata de una verificación son tuyas: nunca se convierten", () => {
  const verification = convert({
    ...VERIFICATION_PENDING,
    metadata: { object: "identity.verification", keys: "x" },
  });
  assert.deepEqual(verification.metadata, { object: "identity.verification", keys: "x" });
  assert.equal(Object.getPrototypeOf(verification.metadata), Object.prototype);
});

test("una verificación conserva los campos y objetos desconocidos", () => {
  const verification = convert({
    ...VERIFICATION_PENDING,
    nuevo_campo: { a: 1 },
    otro: [{ object: "algo_nuevo", x: 2 }],
  });
  assert.equal(verification.constructor, IdentityVerification);
  assert.deepEqual(verification.nuevo_campo, { a: 1 });
  assert.equal(verification.otro[0].constructor, RayaObject);
  assert.equal(verification.otro[0].x, 2);
});

test("console.log de una verificación muestra la clase y los campos, no el cliente ni la respuesta", () => {
  const shown = util.inspect(convert(VERIFICATION_PENDING));
  assert.ok(shown.startsWith("IdentityVerification {"));
  assert.match(shown, /status: 'pending'/);
  assert.doesNotMatch(shown, /lastResponse|requestor/);
});

test("structuredClone de una verificación da datos planos", () => {
  const verification = convert(VERIFICATION_VERIFIED);
  const clone = structuredClone(verification);
  assert.deepEqual(clone, VERIFICATION_VERIFIED);
  clone.metadata.plan = "otro";
  assert.equal(verification.metadata.plan, "pro");
});

test("un evento identity.verification.* hidrata una IdentityVerification, siempre con person en null", () => {
  for (const fixture of [EVENT_VERIFICATION_VERIFIED, EVENT_VERIFICATION_CANCELED]) {
    const event = Event.constructFrom(fixture);
    assert.equal(event.constructor, Event);
    assert.equal(event.type, fixture.type);
    const verification = event.data.object;
    assert.ok(verification instanceof IdentityVerification);
    assert.equal(verification.id, VERIFICATION_ID);
    assert.equal(verification.status, fixture.data.object.status);
    assert.equal(verification.person, null);
  }
});

test("IdentityVerification.constructFrom arma una verificación sin respuesta HTTP", () => {
  const verification = IdentityVerification.constructFrom({
    object: "identity.verification",
    id: "idv_x",
  });
  assert.equal(verification.constructor, IdentityVerification);
  assert.equal(verification.lastResponse, null);
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
  assert.ok(thrown(() => IdentityVerification.constructFrom([] as any)) instanceof TypeError);
});

test("una lista de verificaciones hidrata cada una con su clase", () => {
  const page = convert(VERIFICATION_LIST);
  assert.equal(page.constructor, ListObject);
  assert.deepEqual(
    [...page].map((verification: IdentityVerification) => verification.id),
    [VERIFICATION_LIST.data[0]?.id, VERIFICATION_LIST.data[1]?.id],
  );
  assert.ok(page.data.every((item: unknown) => item instanceof IdentityVerification));
  assert.equal(page.has_more, true);
  assert.equal(page.next_cursor, VERIFICATION_LIST.next_cursor);
  assert.deepEqual(JSON.parse(JSON.stringify(page)), VERIFICATION_LIST);
});

test("IdentityVerificationFiles: su clase, sus entradas planas y las que faltan en null", () => {
  const files = convert(VERIFICATION_FILES);
  assert.equal(files.constructor, IdentityVerificationFiles);
  assert.equal(IdentityVerificationFiles.OBJECT_NAME, "identity.verification_files");
  assert.equal(Object.getPrototypeOf(files.front), Object.prototype);
  assert.equal(files.front.url, VERIFICATION_FILES.front.url);
  assert.deepEqual(files.toJSON(), VERIFICATION_FILES);
  assert.ok(util.inspect(files).startsWith("IdentityVerificationFiles {"));
  // Una biometric no tiene el DNI: front y back vienen en null.
  const biometric = convert({ ...VERIFICATION_FILES, front: null, back: null });
  assert.equal(biometric.constructor, IdentityVerificationFiles);
  assert.equal(biometric.front, null);
  assert.equal(biometric.back, null);
  assert.equal(biometric.selfie.url, VERIFICATION_FILES.selfie.url);
  assert.equal(Object.getPrototypeOf(biometric.selfie), Object.prototype);
});

// --- Sandbox ----------------------------------------------------------------------------------

test("un evento de un sandbox trae livemode en false, en su lugar del sobre", () => {
  const event = Event.constructFrom(EVENT_SANDBOX_PAYMENT_SUCCEEDED);
  assert.equal(event.constructor, Event);
  assert.equal(event.livemode, false);
  assert.deepEqual(Object.keys(event), [
    "id",
    "object",
    "type",
    "api_version",
    "created_at",
    "livemode",
    "data",
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(event)), EVENT_SANDBOX_PAYMENT_SUCCEEDED);
  // El pago de prueba es un Payment como cualquiera, con el CVU y el alias de prueba.
  const payment = event.data.object;
  assert.ok(payment instanceof Payment);
  assert.match(payment.bank_transfer.cvu, /^00000002\d{14}$/);
  assert.equal(payment.bank_transfer.alias, "sandbox.no.transferir");
  assert.ok(payment.checkout_url.endsWith(`/sandbox/pay/${payment.id}`));
  assert.equal(payment.payer?.name, "Pagador de prueba");
});

test("un evento de una cuenta real trae livemode en true", () => {
  for (const fixture of [EVENT_VERIFICATION_VERIFIED, EVENT_VERIFICATION_CANCELED]) {
    assert.equal(Event.constructFrom(fixture).livemode, true);
  }
});

test("un evento sin livemode (emitido antes de que la API lo sumara) se arma igual", () => {
  // Si se reenvía, el body es el que se guardó: sin el campo. livemode queda undefined y el JSON,
  // como llegó.
  assert.equal(Object.hasOwn(EVENT_PAYMENT_SUCCEEDED, "livemode"), false);
  const event = Event.constructFrom(EVENT_PAYMENT_SUCCEEDED);
  assert.equal(event.livemode, undefined);
  assert.equal(Object.hasOwn(event, "livemode"), false);
  assert.equal(event.data.object.constructor, Payment);
  assert.deepEqual(JSON.parse(JSON.stringify(event)), EVENT_PAYMENT_SUCCEEDED);
  assert.deepEqual(Object.keys(event), Object.keys(EVENT_PAYMENT_SUCCEEDED));
});

test("un pago y una orden de un sandbox son su clase, con el JSON tal cual", () => {
  const payment = convert(SANDBOX_PAYMENT_SUCCEEDED);
  assert.equal(payment.constructor, Payment);
  assert.deepEqual(payment.toJSON(), SANDBOX_PAYMENT_SUCCEEDED);
  assert.deepEqual(Object.keys(payment), Object.keys(PAYMENT_SUCCEEDED)); // las mismas que en live
  const order = convert(SANDBOX_ORDER_SUCCEEDED);
  assert.equal(order.constructor, ConnectOrder);
  assert.deepEqual(order.toJSON(), SANDBOX_ORDER_SUCCEEDED);
  assert.deepEqual(Object.keys(order), Object.keys(ORDER_SUCCEEDED));
  assert.equal(order.checkout_url, `https://raya.cash/checkout/${order.id}`);
});
