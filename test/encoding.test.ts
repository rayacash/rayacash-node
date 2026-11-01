import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicalAmount,
  checkParams,
  dumps,
  encodeBody,
  encodeQuery,
  pathId,
  validateIdempotencyKey,
} from "../src/encoding.ts";
import { isolate, thrown } from "./helpers.ts";

isolate();

/** Un decimal exacto como el de decimal.js o Prisma: toFixed() sin argumentos da su valor entero. */
class FakeDecimal {
  readonly #text: string;

  constructor(text: string) {
    this.#text = text;
  }

  toFixed(): string {
    return this.#text;
  }
}

const AMOUNTS: Array<[unknown, string]> = [
  [1500, "1500"],
  [1500.5, "1500.5"],
  [1500.1, "1500.1"],
  [25000.5, "25000.5"],
  [new FakeDecimal("1500.50"), "1500.5"],
  [new FakeDecimal("1500.00"), "1500"],
  [new FakeDecimal("1E+3"), "1000"],
  [new FakeDecimal("0.10"), "0.1"],
  ["1500.50", "1500.5"],
  [" 25 ", "25"],
  ["1.5e3", "1500"],
  [0.1 + 0.2, "0.30000000000000004"], // sin redondear: la API lo rechaza
  [new FakeDecimal("1500.505"), "1500.505"],
  [1500n, "1500"],
  ["+5", "5"],
  [".5", "0.5"],
  ["-0.00", "-0"],
  [1e21, "1000000000000000000000"],
  [1e-7, "0.0000001"],
];

for (const [value, expected] of AMOUNTS) {
  test(`el monto ${String(value)} viaja como el número JSON ${expected}`, () => {
    assert.equal(dumps({ amount: canonicalAmount(value) }), `{"amount":${expected}}`);
  });
}

const INVALID_AMOUNTS: Array<[unknown, typeof TypeError | typeof RangeError]> = [
  [true, TypeError],
  [false, TypeError],
  [null, TypeError],
  [undefined, TypeError],
  [[1500], TypeError],
  [{}, TypeError],
  [new Number(1500), TypeError],
  [Number.NaN, RangeError],
  [Number.POSITIVE_INFINITY, RangeError],
  [new FakeDecimal("NaN"), RangeError],
  [new FakeDecimal("-Infinity"), RangeError],
  ["abc", RangeError],
  ["1.500,50", RangeError],
  ["Infinity", RangeError],
  ["", RangeError],
  ["1e999999", RangeError],
];

for (const [value, ErrorType] of INVALID_AMOUNTS) {
  test(`el monto ${String(value)} falla antes de mandar nada (${ErrorType.name})`, () => {
    const error = thrown(() => canonicalAmount(value));
    assert.equal(error.constructor, ErrorType);
    assert.match(error.message, /amount/);
  });
}

test("dumps maneja cada tipo de JSON en ASCII, como json.dumps", () => {
  const value = {
    s: "ñandú «hola»",
    i: 1,
    f: 1.25,
    d: new FakeDecimal("2.50"),
    b: true,
    n: null,
    l: [1, false, ["x"]],
    o: { k: "v" },
    big: 10n,
  };
  assert.equal(
    dumps(value),
    '{"s":"\\u00f1and\\u00fa \\u00abhola\\u00bb","i":1,"f":1.25,"d":2.5,"b":true,"n":null,' +
      '"l":[1,false,["x"]],"o":{"k":"v"},"big":10}',
  );
  assert.equal(dumps({ emoji: "😀", del: "\u007f" }), '{"emoji":"\\ud83d\\ude00","del":"\\u007f"}');
  assert.equal(dumps({ a: undefined, l: [undefined] }), '{"l":[null]}');
});

const UNSENDABLE: Array<[unknown, typeof TypeError | typeof RangeError]> = [
  [{ x: () => 1 }, TypeError],
  [{ x: Symbol("x") }, TypeError],
  [{ x: new Date() }, TypeError],
  [{ x: new Map() }, TypeError],
  [{ x: Number.NaN }, RangeError],
  [{ x: new FakeDecimal("sNaN") }, RangeError],
];

for (const [value, ErrorType] of UNSENDABLE) {
  test(`dumps rechaza lo que JSON no puede llevar (${ErrorType.name})`, () => {
    assert.equal(thrown(() => dumps(value)).constructor, ErrorType);
  });
}

test("encodeBody saca solo los null/undefined de primer nivel", () => {
  const body = encodeBody({
    amount: new FakeDecimal("15000"),
    description: null,
    external_reference: undefined,
    metadata: { a: null },
  });
  assert.equal(body, '{"amount":15000,"metadata":{"a":null}}');
});

test("encodeQuery", () => {
  const query = encodeQuery({
    direction: "inbound",
    status: null,
    created_gte: new Date("2026-10-23T03:00:00Z"),
    created_lt: "2026-10-24T00:00:00-03:00",
    limit: 100,
    cursor: undefined,
  });
  assert.deepEqual(query, {
    direction: "inbound",
    created_gte: "2026-10-23T03:00:00.000Z",
    created_lt: "2026-10-24T00:00:00-03:00",
    limit: "100",
  });
});

test("encodeQuery rechaza una fecha inválida", () => {
  const error = thrown(() => encodeQuery({ created_lt: new Date("no es una fecha") }));
  assert.ok(error instanceof RangeError);
  assert.match(error.message, /created_lt es una fecha inválida/);
});

for (const value of [true, 1.5, {}, [1]]) {
  test(`encodeQuery rechaza ${JSON.stringify(value)}`, () => {
    const error = thrown(() => encodeQuery({ limit: value }));
    assert.ok(error instanceof TypeError);
    assert.match(error.message, /limit/);
  });
}

test("pathId codifica todo", () => {
  assert.equal(pathId("paymentId", "a/b c?"), "a%2Fb%20c%3F");
  assert.equal(pathId("paymentId", "!'()*~-_."), "%21%27%28%29%2A~-_.");
  const paymentId = "c2a7e5d1-9b34-4f0a-8e62-71d5b3c9a0f8";
  assert.equal(pathId("paymentId", paymentId), paymentId);
});

const EMPTY_IDS: Array<[unknown, typeof TypeError | typeof RangeError]> = [
  ["", RangeError],
  ["  ", RangeError],
  [123, TypeError],
  [null, TypeError],
];

for (const [value, ErrorType] of EMPTY_IDS) {
  test(`pathId rechaza ${JSON.stringify(value)}`, () => {
    const error = thrown(() => pathId("paymentId", value));
    assert.equal(error.constructor, ErrorType);
    assert.match(error.message, /paymentId/);
  });
}

for (const key of ["9b2f6c4e-1d3a-4e8b-a5c7-0f9e8d7c6b5a", "x", "~".repeat(255), "!#$%"]) {
  test(`la idempotency key ${key.slice(0, 20)} es válida`, () => {
    assert.equal(validateIdempotencyKey(key), key);
  });
}

for (const key of ["", "a b", "ñ", "x".repeat(256), "tab\there", "line\n"]) {
  test(`la idempotency key ${JSON.stringify(key.slice(0, 20))} es inválida`, () => {
    const error = thrown(() => validateIdempotencyKey(key));
    assert.ok(error instanceof RangeError);
    assert.match(error.message, /idempotencyKey/);
  });
}

test("la idempotency key tiene que ser un string", () => {
  const error = thrown(() => validateIdempotencyKey(123));
  assert.ok(error instanceof TypeError);
  assert.match(error.message, /idempotencyKey/);
});

test("checkParams rechaza parámetros desconocidos y avisa dónde va la idempotencyKey", () => {
  assert.deepEqual(checkParams("transfers.create", undefined, ["amount"]), {});
  const unknown = thrown(() =>
    checkParams("transfers.create", { amount: 1, destinaton: "x" }, ["amount", "destination"]),
  );
  assert.ok(unknown instanceof TypeError);
  assert.match(unknown.message, /no acepta "destinaton": los parámetros son amount y destination/);
  const key = thrown(() =>
    checkParams("payments.create", { amount: 1, idempotencyKey: "k" }, ["amount"]),
  );
  assert.match(key.message, /va en las opciones/);
  const notObject = thrown(() =>
    checkParams("transfers.list", "inbound", ["direction", "status", "limit"]),
  );
  assert.match(notObject.message, /direction, status y limit/);
});
