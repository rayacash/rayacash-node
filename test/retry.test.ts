import assert from "node:assert/strict";
import { test } from "node:test";

import {
  backoffDelay,
  parseRetryAfter,
  retryDelay,
  shouldRetryResponse,
  timing,
} from "../src/retry.ts";
import { isolate } from "./helpers.ts";

isolate();

const SECONDS: Array<[string | null | undefined, number | null]> = [
  [null, null],
  [undefined, null],
  ["", null],
  ["  ", null],
  ["2", 2],
  [" 5 ", 5],
  ["abc", null],
  ["-1", null],
  ["1.5", null],
];

for (const [header, expected] of SECONDS) {
  test(`parseRetryAfter(${JSON.stringify(header)}) da ${expected}`, () => {
    assert.equal(parseRetryAfter(header), expected);
  });
}

test("parseRetryAfter saca los espacios de Python, no los de trim()", () => {
  assert.equal(parseRetryAfter("\x1c5\x85"), 5);
  assert.equal(parseRetryAfter("\ufeff5"), null);
});

test("parseRetryAfter acepta la fecha HTTP", () => {
  timing.now = () => 1_700_000_000;
  const future = new Date(1_700_000_030_000).toUTCString();
  const past = new Date(1_699_999_000_000).toUTCString();
  assert.equal(parseRetryAfter(future), 30);
  assert.equal(parseRetryAfter(past), 0);
  // Sin zona se toma UTC, como email.utils.parsedate_to_datetime.
  const naive = new Date(1_700_000_010_000).toUTCString().replace(/ GMT$/, "");
  assert.equal(parseRetryAfter(naive), 10);
  assert.equal(parseRetryAfter("14 Nov 2023 23:13:30 +0100"), 10);
  assert.equal(parseRetryAfter("Tue, 31 Feb 2023 22:13:30 GMT"), null);
  assert.equal(parseRetryAfter("mañana"), null);
});

// Como datetime.timezone en Python: una zona de 24 h o más no es una fecha.
const ZONES: Array<[string, number | null]> = [
  ["14 Nov 2023 23:13:30 +2400", null],
  ["14 Nov 2023 23:13:30 -2400", null],
  ["14 Nov 2023 23:13:30 +2360", null],
  ["14 Nov 2023 23:13:30 +9999", null],
  ["14 Nov 2023 23:13:30 +2359", 0],
  ["15 Nov 2023 22:13:20 +2359", 60],
  ["13 Nov 2023 22:14:30 -2359", 10],
  ["14 Nov 2023 23:52:30 +0099", 10],
];

for (const [header, expected] of ZONES) {
  test(`parseRetryAfter(${JSON.stringify(header)}) da ${expected}, como en Python`, () => {
    timing.now = () => 1_700_000_000;
    assert.equal(parseRetryAfter(header), expected);
  });
}

// Un año de dos cifras, aunque venga con cuatro ("0030"), como parsedate_to_datetime en Python y
// en PHP: de 0 a 68 es 20xx y de 69 a 99, 19xx. Date.UTC los leía todos como 19xx.
const SHORT_YEARS: Array<[string, number | null]> = [
  ["Sat, 02 Nov 0030 00:01:00 GMT", Date.UTC(2030, 10, 2, 0, 1) / 1000 - 1_700_000_000],
  ["31 Dec 0068 23:59:59 GMT", Date.UTC(2068, 11, 31, 23, 59, 59) / 1000 - 1_700_000_000],
  ["01 Jan 0069 00:00:00 GMT", 0], // 1969
  ["29 Feb 0000 10:00:00 GMT", 0], // 2000, que es bisiesto (1900 no lo era: daba null)
  ["31 Jan 0100 10:00:00 GMT", 0], // el año 100, tal cual
];

for (const [header, expected] of SHORT_YEARS) {
  test(`parseRetryAfter(${JSON.stringify(header)}) da ${expected}, como en Python y PHP`, () => {
    timing.now = () => 1_700_000_000;
    assert.equal(parseRetryAfter(header), expected);
  });
}

// Solo la forma de RFC 9110, como PHP. Python (parsedate_to_datetime) acepta además RFC 850,
// asctime y zonas como EST.
for (const header of [
  "Monday, 02-Nov-26 00:01:00 GMT",
  "Mon Nov  2 00:01:00 2026",
  "Mon, 02 Nov 2026 00:01:00 EST",
  "Mon, 02 Nov 26 00:01:00 GMT",
]) {
  test(`parseRetryAfter(${JSON.stringify(header)}) da null, como en PHP`, () => {
    assert.equal(parseRetryAfter(header), null);
  });
}

test("el backoff crece exponencialmente con un tope", () => {
  // isolate() fija el jitter en el máximo (1).
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map((n) => backoffDelay(n)),
    [0.5, 1, 2, 4, 8, 8],
  );
});

test("el jitter recorta a lo sumo la mitad", () => {
  timing.jitter = () => 0;
  assert.equal(backoffDelay(3), 1);
});

test("el Retry-After es un piso", () => {
  assert.equal(retryDelay(1, 5), 5);
  assert.equal(retryDelay(4, 2), 4);
  assert.equal(retryDelay(1, null), 0.5);
});

const POLICY: Array<[number, string, number | null, boolean]> = [
  [409, "IDEMPOTENCY_KEY_IN_USE", 2, true],
  [409, "IDEMPOTENCY_KEY_REUSED", null, false],
  [409, "PAYMENT_NOT_REFUNDABLE", null, false],
  [429, "RATE_LIMITED", 30, true],
  [429, "RATE_LIMITED", 60, true],
  [429, "RATE_LIMITED", 61, false],
  [429, "RATE_LIMITED", null, true],
  [408, "INTERNAL_ERROR", null, true],
  [500, "INTERNAL_ERROR", null, true],
  [502, "INTERNAL_ERROR", null, true],
  [503, "BANK_UNAVAILABLE", null, true],
  [503, "BANK_UNAVAILABLE", 3600, false],
  [503, "CVU_UNAVAILABLE", 5, true],
  [503, "TEMPORARILY_UNAVAILABLE", 5, true],
  [503, "API_UNAVAILABLE", null, false],
  [504, "INTERNAL_ERROR", null, true],
  [400, "PARAMETER_INVALID", null, false],
  [401, "API_KEY_INVALID", null, false],
  [404, "NOT_FOUND", null, false],
  [422, "INSUFFICIENT_BALANCE", null, false],
  [302, "INVALID_RESPONSE", null, false],
];

for (const [status, code, retryAfter, expected] of POLICY) {
  test(`política de reintentos: ${status} ${code} (Retry-After ${retryAfter}) → ${expected}`, () => {
    assert.equal(shouldRetryResponse(status, code, retryAfter), expected);
  });
}
