import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  Event,
  Payment,
  RayaObject,
  SignatureVerificationError,
  Webhook,
  WebhookSignature,
} from "../src/index.ts";
import { timing } from "../src/retry.ts";
import {
  EVENT_PAYMENT_SUCCEEDED,
  WEBHOOK_OLD_SECRET,
  WEBHOOK_OLD_SIGNATURE,
  WEBHOOK_SECRET,
  WEBHOOK_SIGNATURE,
  WEBHOOK_TEST_BODY,
  WEBHOOK_TEST_TIMESTAMP,
} from "./fixtures.ts";
import { isolate, thrown } from "./helpers.ts";

isolate();

const T = WEBHOOK_TEST_TIMESTAMP;
const HEADER = `t=${T},v1=${WEBHOOK_SIGNATURE}`;
const verify = WebhookSignature.verifyHeader;
// Para pasar lo que pasaría alguien desde JavaScript, sin tipos.
const untypedVerify = verify as (...args: unknown[]) => unknown;
const untypedGenerate = WebhookSignature.generateHeader as (...args: unknown[]) => string;

beforeEach(() => {
  timing.now = () => T; // el reloj, congelado en el t del vector
});

test("los vectores publicados", () => {
  assert.equal(
    WebhookSignature.computeSignature(WEBHOOK_TEST_BODY, WEBHOOK_SECRET, T),
    WEBHOOK_SIGNATURE,
  );
  assert.equal(
    WebhookSignature.computeSignature(WEBHOOK_TEST_BODY, WEBHOOK_OLD_SECRET, T),
    WEBHOOK_OLD_SIGNATURE,
  );
  assert.equal(verify(WEBHOOK_TEST_BODY, HEADER, WEBHOOK_SECRET), true);
});

test("el vector de api.md con un reloj real", () => {
  timing.now = () => 2_000_000_000;
  // El t del vector es viejo: para probarlo, la doc pide saltear el chequeo de los 5 minutos.
  assert.equal(verify(WEBHOOK_TEST_BODY, HEADER, WEBHOOK_SECRET, null), true);
  const error = thrown(() => verify(WEBHOOK_TEST_BODY, HEADER, WEBHOOK_SECRET));
  assert.ok(error instanceof SignatureVerificationError);
  assert.match(error.message, /de tu reloj/);
});

test("durante una rotación llegan dos firmas", () => {
  const header = `t=${T},v1=${WEBHOOK_SIGNATURE},v1=${WEBHOOK_OLD_SIGNATURE}`;
  assert.ok(verify(WEBHOOK_TEST_BODY, header, WEBHOOK_SECRET));
  assert.ok(verify(WEBHOOK_TEST_BODY, header, WEBHOOK_OLD_SECRET));
  const error = thrown(() => verify(WEBHOOK_TEST_BODY, header, "whsec_otro"));
  assert.ok(error instanceof SignatureVerificationError);
  assert.match(error.message, /no coincide/);
});

for (const header of [
  `t=${T}, v1=${WEBHOOK_SIGNATURE}`,
  ` v1=${WEBHOOK_SIGNATURE} , t=${T} `,
  `t=${T},v0=abc,v1=${WEBHOOK_SIGNATURE},extra`,
  `t=${T},v1=${WEBHOOK_SIGNATURE.toUpperCase()}`,
  `t=,t=${T},v1=no-es-hex,v1=${WEBHOOK_SIGNATURE}`,
  `t=000${T},v1=${WEBHOOK_SIGNATURE}`,
]) {
  test(`el header se lee con tolerancia: ${header.slice(0, 40)}`, () => {
    assert.ok(verify(WEBHOOK_TEST_BODY, header, WEBHOOK_SECRET));
  });
}

const INVALID_HEADERS: Array<[string | null | undefined, string]> = [
  [null, "Falta el header"],
  [undefined, "Falta el header"],
  ["", "Falta el header"],
  ["   ", "Falta el header"],
  [`v1=${WEBHOOK_SIGNATURE}`, "No pudimos leer t"],
  [`t=abc,v1=${WEBHOOK_SIGNATURE}`, "No pudimos leer t"],
  [`t=１７００,v1=${WEBHOOK_SIGNATURE}`, "No pudimos leer t"],
  [`t=${"9".repeat(30)},v1=${WEBHOOK_SIGNATURE}`, "No pudimos leer t"],
  [`t=${T}`, "no trae firmas v1"],
  [`t=${T},v1=`, "no trae firmas v1"],
  [`t=${T},v1=${"0".repeat(64)}`, "no coincide"],
  [`t=${T + 1},v1=${WEBHOOK_SIGNATURE}`, "no coincide"],
];

for (const [header, message] of INVALID_HEADERS) {
  test(`header inválido: ${JSON.stringify(header)?.slice(0, 40)}`, () => {
    const error = thrown(() => verify(WEBHOOK_TEST_BODY, header, WEBHOOK_SECRET));
    assert.ok(error instanceof SignatureVerificationError);
    assert.match(error.message, new RegExp(message));
    assert.equal(error.sigHeader, header ?? null);
    assert.equal(error.httpBody, WEBHOOK_TEST_BODY.toString());
  });
}

test("el secreto y el header usan los espacios de Python, no los de trim()", () => {
  const blank = thrown(() => verify(WEBHOOK_TEST_BODY, HEADER, "\x1c\x85"));
  assert.ok(blank instanceof RangeError);
  assert.match(blank.message, /Falta el secreto/);
  timing.now = () => T;
  assert.equal(
    verify(WEBHOOK_TEST_BODY, `\x85t=${T},\x1cv1=${WEBHOOK_SIGNATURE}\x1f`, WEBHOOK_SECRET),
    true,
  );
  // U+FEFF no es un espacio: el secreto "\ufeff" no está vacío (y la firma no coincide).
  const feff = thrown(() => verify(WEBHOOK_TEST_BODY, HEADER, "\ufeff"));
  assert.ok(feff instanceof SignatureVerificationError);
});

test("un body modificado", () => {
  const tampered = Buffer.from(
    WEBHOOK_TEST_BODY.toString().replace("webhook.test", "payment.succeeded"),
  );
  const error = thrown(() => verify(tampered, HEADER, WEBHOOK_SECRET));
  assert.ok(error instanceof SignatureVerificationError);
  assert.match(error.message, /body crudo/);
});

for (const skew of [-300, 300, -1, 1]) {
  test(`dentro de la tolerancia (${skew} s)`, () => {
    timing.now = () => T + skew;
    assert.ok(verify(WEBHOOK_TEST_BODY, HEADER, WEBHOOK_SECRET));
  });
}

for (const skew of [-301, 301, 3600]) {
  test(`la tolerancia es simétrica (${skew} s)`, () => {
    timing.now = () => T + skew;
    const error = thrown(() => verify(WEBHOOK_TEST_BODY, HEADER, WEBHOOK_SECRET));
    assert.ok(error instanceof SignatureVerificationError);
    assert.match(error.message, /300 s/);
    assert.ok(verify(WEBHOOK_TEST_BODY, HEADER, WEBHOOK_SECRET, null));
    assert.ok(verify(WEBHOOK_TEST_BODY, HEADER, WEBHOOK_SECRET, 0));
    assert.ok(verify(WEBHOOK_TEST_BODY, HEADER, WEBHOOK_SECRET, 4000));
  });
}

test("las formas del payload", () => {
  const text = WEBHOOK_TEST_BODY.toString();
  assert.ok(verify(text, HEADER, WEBHOOK_SECRET));
  assert.ok(verify(new Uint8Array(WEBHOOK_TEST_BODY), HEADER, WEBHOOK_SECRET));
  const arrayBuffer = new Uint8Array(WEBHOOK_TEST_BODY).buffer;
  assert.ok(verify(arrayBuffer, HEADER, WEBHOOK_SECRET));
  assert.ok(verify(new DataView(arrayBuffer) as unknown as Uint8Array, HEADER, WEBHOOK_SECRET));
  // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien que ya parseó el JSON.
  const error = thrown(() => verify({ id: "evt_test" } as any, HEADER, WEBHOOK_SECRET));
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /body crudo/);
});

const PROGRAMMING_ERRORS: Array<[Record<string, unknown>, typeof TypeError | typeof RangeError]> = [
  [{ secret: "" }, RangeError],
  [{ secret: null }, TypeError],
  [{ tolerance: -1 }, RangeError],
  [{ tolerance: Number.NaN }, RangeError],
  [{ tolerance: "300" }, TypeError],
  [{ header: Buffer.from("t=1,v1=x") }, TypeError],
];

for (const [args, ErrorType] of PROGRAMMING_ERRORS) {
  test(`errores de programación: ${Object.keys(args)[0]} → ${ErrorType.name}`, () => {
    const all = { header: HEADER, secret: WEBHOOK_SECRET, tolerance: 300, ...args };
    const error = thrown(() =>
      untypedVerify(WEBHOOK_TEST_BODY, all.header, all.secret, all.tolerance),
    );
    assert.equal(error.constructor, ErrorType);
  });
}

// NaN apagaría el chequeo del reloj (la protección contra replays) sin avisar.
for (const tolerance of [Number.NaN, -1, Number.NEGATIVE_INFINITY]) {
  test(`tolerance ${tolerance} falla con el mismo mensaje que en Python y PHP`, () => {
    for (const run of [
      () => verify(WEBHOOK_TEST_BODY, HEADER, WEBHOOK_SECRET, tolerance),
      () => Webhook.constructEvent(WEBHOOK_TEST_BODY, HEADER, WEBHOOK_SECRET, tolerance),
    ]) {
      const error = thrown(run);
      assert.equal(error.constructor, RangeError);
      assert.equal(error.message, "tolerance tiene que ser un número de segundos, 0 o más.");
    }
  });
}

test("tolerance Infinity vale: acepta cualquier t", () => {
  timing.now = () => T + 10 ** 9;
  assert.ok(verify(WEBHOOK_TEST_BODY, HEADER, WEBHOOK_SECRET, Number.POSITIVE_INFINITY));
});

test("constructEvent", () => {
  const body = Buffer.from(JSON.stringify(EVENT_PAYMENT_SUCCEEDED));
  const header = WebhookSignature.generateHeader(body, WEBHOOK_SECRET);
  assert.equal(header, `t=${T},v1=${WebhookSignature.computeSignature(body, WEBHOOK_SECRET, T)}`);
  const event = Webhook.constructEvent(body, header, WEBHOOK_SECRET);
  assert.equal(event.constructor, Event);
  assert.equal(event.id, "evt_4mQ8sT2vX7bN1kR5wZ9cH3jL");
  assert.equal(event.type, "payment.succeeded");
  assert.equal(event.data.object.constructor, Payment);
  assert.equal((event.data.object as Payment).status, "succeeded");
});

test("constructEvent con webhook.test y con tipos desconocidos", () => {
  const event = Webhook.constructEvent(WEBHOOK_TEST_BODY, HEADER, WEBHOOK_SECRET);
  assert.equal(event.type, "webhook.test");
  const body = JSON.stringify({
    id: "evt_x",
    object: "event",
    type: "algo.nuevo",
    data: { object: { object: "nuevo" } },
  });
  const unknown = Webhook.constructEvent(
    body,
    WebhookSignature.generateHeader(body, WEBHOOK_SECRET),
    WEBHOOK_SECRET,
  );
  assert.equal(unknown.type, "algo.nuevo"); // un tipo que el SDK todavía no conoce
  assert.equal(unknown.data.object.constructor, RayaObject);
});

test("constructEvent rechaza una firma mala antes de parsear", () => {
  const error = thrown(() => Webhook.constructEvent("no es json", HEADER, WEBHOOK_SECRET));
  assert.ok(error instanceof SignatureVerificationError);
});

for (const body of ["[1, 2]", "no es json"]) {
  test(`constructEvent necesita un objeto JSON (${body})`, () => {
    const header = WebhookSignature.generateHeader(body, WEBHOOK_SECRET);
    const error = thrown(() => Webhook.constructEvent(body, header, WEBHOOK_SECRET));
    assert.ok(error instanceof RangeError);
    assert.match(error.message, /objeto JSON/);
  });
}

/** Los bytes de `before`, `middle` y `after`, en ese orden. */
function bytes(before: string, middle: number[], after: string): Uint8Array {
  const encoder = new TextEncoder();
  return new Uint8Array([...encoder.encode(before), ...middle, ...encoder.encode(after)]);
}

// Lo que no es UTF-8 válido no es un objeto JSON, como en Python y PHP: Buffer.toString lo leía
// con U+FFFD en lugar de los bytes inválidos. Un BOM tampoco pasa, como hasta ahora.
const NOT_UTF8: Array<[string, Uint8Array]> = [
  ["un byte inválido", bytes('{"id":"evt_', [0xff], '","object":"event"}')],
  ["un surrogate codificado", bytes('{"id":"evt_', [0xed, 0xa0, 0x80], '","object":"event"}')],
  ["un BOM", bytes("", [0xef, 0xbb, 0xbf], '{"id":"evt_x","object":"event"}')],
];

for (const [label, body] of NOT_UTF8) {
  test(`constructEvent rechaza un body con ${label}`, () => {
    const header = WebhookSignature.generateHeader(body, WEBHOOK_SECRET);
    const error = thrown(() => Webhook.constructEvent(body, header, WEBHOOK_SECRET));
    assert.ok(error instanceof RangeError);
    assert.equal(error.message, "El body del webhook no es un objeto JSON.");
  });
}

test("constructEvent con un JSON muy anidado: el mismo error que un JSON inválido", () => {
  // JSON.parse lo lee, pero armar el evento desbordaba la pila con un RangeError sin mensaje propio.
  const deep = 100_000;
  const body = `{"id":"evt_x","object":"event","data":${"[".repeat(deep)}${"]".repeat(deep)}}`;
  const header = WebhookSignature.generateHeader(body, WEBHOOK_SECRET);
  const error = thrown(() => Webhook.constructEvent(body, header, WEBHOOK_SECRET));
  assert.ok(error instanceof RangeError);
  assert.equal(error.message, "El body del webhook no es un objeto JSON.");
  assert.ok(error.cause instanceof RangeError);
});

test("generateHeader con un timestamp explícito", () => {
  assert.equal(
    WebhookSignature.generateHeader(WEBHOOK_TEST_BODY, WEBHOOK_SECRET, { timestamp: T }),
    HEADER,
  );
  for (const bad of [-1, true, 1.5, "1700000000", 2 ** 60]) {
    const error = thrown(() =>
      // biome-ignore lint/suspicious/noExplicitAny: lo que haría alguien desde JavaScript.
      WebhookSignature.generateHeader(WEBHOOK_TEST_BODY, WEBHOOK_SECRET, { timestamp: bad as any }),
    );
    assert.ok(error instanceof RangeError);
    assert.match(error.message, /timestamp/);
  }
  assert.ok(
    thrown(() => untypedGenerate(WEBHOOK_TEST_BODY, WEBHOOK_SECRET, T)) instanceof TypeError,
  );
});
