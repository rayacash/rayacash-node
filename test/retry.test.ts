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
