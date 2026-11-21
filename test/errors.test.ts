import assert from "node:assert/strict";
import { test } from "node:test";
import util from "node:util";

import { errorFromResponse } from "../src/errors.ts";
import {
  APIConnectionError,
  APIError,
  AuthenticationError,
  ConflictError,
  IdempotencyError,
  InvalidRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  RayaError,
  SignatureVerificationError,
  UnprocessableEntityError,
} from "../src/index.ts";
import { isolate } from "./helpers.ts";

isolate();

// Los 60 códigos del contrato (api.md › Códigos de error), en el orden de
// publicapi/tests_catalog.py de la API, con los 3 del sandbox: SANDBOX_NOT_SUPPORTED (una
// credencial de prueba en un endpoint que todavía no está disponible en el sandbox, como Identidad,
// Raya PSP o el Facturador) y SANDBOX_ONLY (una credencial real en /v1/test/*), después de
// APP_DISABLED y antes de PAYOUT_ORIGIN_UNAVAILABLE, y PAYMENT_NOT_PENDING (simular la
// transferencia de un pago que ya no está pendiente), e IDENTITY_NOT_ACTIVATED (crear una
// verificación sin Identidad activada). Los 7 de Raya PSP van al final de su bloque de HTTP, como
// en la API: PSP_NOT_ACTIVATED (403), CUSTOMER_NOT_FOUND (404), CUSTOMER_ALREADY_EXISTS y
// CUSTOMER_STATUS_CONFLICT (409), y CUSTOMER_INSUFFICIENT_BALANCE, CUSTOMER_DATA_MISMATCH y
// TAX_ID_NOT_REGISTERED (422). Los 2 del Facturador van justo después de los de Raya PSP de su
// HTTP: FACTURADOR_NOT_READY (403, con el motivo en data.reason) después de PSP_NOT_ACTIVATED, e
// INVOICE_NOT_FOUND (404) después de CUSTOMER_NOT_FOUND.
const CATALOG: Array<[string, number, typeof RayaError]> = [
  ["INVALID_JSON", 400, InvalidRequestError],
  ["PARAMETER_MISSING", 400, InvalidRequestError],
  ["PARAMETER_INVALID", 400, InvalidRequestError],
  ["PARAMETER_UNKNOWN", 400, InvalidRequestError],
  ["OAUTH_GRANT_INVALID", 400, InvalidRequestError],
  ["OAUTH_GRANT_TYPE_UNSUPPORTED", 400, InvalidRequestError],
  ["API_KEY_MISSING", 401, AuthenticationError],
  ["API_KEY_INVALID", 401, AuthenticationError],
  ["API_KEY_PUBLISHABLE_NOT_ALLOWED", 401, AuthenticationError],
  ["API_KEY_EXPIRED", 401, AuthenticationError],
  ["ACCESS_TOKEN_MISSING", 401, AuthenticationError],
  ["ACCESS_TOKEN_INVALID", 401, AuthenticationError],
  ["ACCESS_TOKEN_REVOKED", 401, AuthenticationError],
  ["OAUTH_CLIENT_INVALID", 401, AuthenticationError],
  ["API_KEY_ACCOUNT_LOCKED", 403, PermissionDeniedError],
  ["API_NOT_ENABLED", 403, PermissionDeniedError],
  ["MERCHANT_NOT_CONFIGURED", 403, PermissionDeniedError],
  ["TRANSFERS_BLOCKED", 403, PermissionDeniedError],
  ["CONNECTED_ACCOUNT_LOCKED", 403, PermissionDeniedError],
  ["CONNECTED_ACCOUNT_NOT_CONFIGURED", 403, PermissionDeniedError],
  ["APP_DISABLED", 403, PermissionDeniedError],
  ["SANDBOX_NOT_SUPPORTED", 403, PermissionDeniedError],
  ["SANDBOX_ONLY", 403, PermissionDeniedError],
  ["PAYOUT_ORIGIN_UNAVAILABLE", 403, PermissionDeniedError],
  ["IDENTITY_NOT_ACTIVATED", 403, PermissionDeniedError],
  ["PSP_NOT_ACTIVATED", 403, PermissionDeniedError],
  ["FACTURADOR_NOT_READY", 403, PermissionDeniedError],
  ["TRANSFER_NOT_FOUND", 404, NotFoundError],
  ["PAYMENT_NOT_FOUND", 404, NotFoundError],
  ["NOT_FOUND", 404, NotFoundError],
  ["USER_NOT_FOUND", 404, NotFoundError],
  ["ORDER_NOT_FOUND", 404, NotFoundError],
  ["PAYOUT_NOT_FOUND", 404, NotFoundError],
  ["VERIFICATION_NOT_FOUND", 404, NotFoundError],
  ["CUSTOMER_NOT_FOUND", 404, NotFoundError],
  ["INVOICE_NOT_FOUND", 404, NotFoundError],
  ["METHOD_NOT_ALLOWED", 405, InvalidRequestError],
  ["IDEMPOTENCY_KEY_REUSED", 409, IdempotencyError],
  ["IDEMPOTENCY_KEY_IN_USE", 409, IdempotencyError],
  ["PAYMENT_NOT_REFUNDABLE", 409, ConflictError],
  ["PAYMENT_NOT_PENDING", 409, ConflictError],
  ["VERIFICATION_NOT_CANCELABLE", 409, ConflictError],
  ["CUSTOMER_ALREADY_EXISTS", 409, ConflictError],
  ["CUSTOMER_STATUS_CONFLICT", 409, ConflictError],
  ["REQUEST_TOO_LARGE", 413, InvalidRequestError],
  ["INSUFFICIENT_BALANCE", 422, UnprocessableEntityError],
  ["LIMIT_EXCEEDED", 422, UnprocessableEntityError],
  ["DESTINATION_NOT_FOUND", 422, UnprocessableEntityError],
  ["DESTINATION_INACTIVE", 422, UnprocessableEntityError],
  ["DESTINATION_NOT_SUPPORTED", 422, UnprocessableEntityError],
  ["REFUND_FAILED", 422, UnprocessableEntityError],
  ["CUSTOMER_INSUFFICIENT_BALANCE", 422, UnprocessableEntityError],
  ["CUSTOMER_DATA_MISMATCH", 422, UnprocessableEntityError],
  ["TAX_ID_NOT_REGISTERED", 422, UnprocessableEntityError],
  ["RATE_LIMITED", 429, RateLimitError],
  ["INTERNAL_ERROR", 500, APIError],
  ["BANK_UNAVAILABLE", 503, APIError],
  ["CVU_UNAVAILABLE", 503, APIError],
  ["API_UNAVAILABLE", 503, APIError],
  ["TEMPORARILY_UNAVAILABLE", 503, APIError],
];

function makeError(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
  idempotencyKey: string | null = null,
): RayaError {
  return errorFromResponse({
    httpStatus: status,
    headers: new Headers({ "Raya-Request-Id": "req_abc", ...headers }),
    body: typeof body === "string" ? body : JSON.stringify(body),
    idempotencyKey,
  });
}

test("el catálogo tiene los 60 códigos", () => {
  assert.equal(CATALOG.length, 60);
  assert.equal(new Set(CATALOG.map(([code]) => code)).size, 60);
});

// Un código nuevo se suma en la posición de publicapi/tests_catalog.py: los tramos que más se
// tocaron (los 403 desde APP_DISABLED y los 404) van enteros, y los status nunca bajan.
test("el catálogo va en el orden de la API", () => {
  const codes = CATALOG.map(([code]) => code);
  const run = (first: string, length: number) =>
    codes.slice(codes.indexOf(first), codes.indexOf(first) + length);
  assert.deepEqual(run("APP_DISABLED", 7), [
    "APP_DISABLED",
    "SANDBOX_NOT_SUPPORTED",
    "SANDBOX_ONLY",
    "PAYOUT_ORIGIN_UNAVAILABLE",
    "IDENTITY_NOT_ACTIVATED",
    "PSP_NOT_ACTIVATED",
    "FACTURADOR_NOT_READY",
  ]);
  assert.deepEqual(run("TRANSFER_NOT_FOUND", 9), [
    "TRANSFER_NOT_FOUND",
    "PAYMENT_NOT_FOUND",
    "NOT_FOUND",
    "USER_NOT_FOUND",
    "ORDER_NOT_FOUND",
    "PAYOUT_NOT_FOUND",
    "VERIFICATION_NOT_FOUND",
    "CUSTOMER_NOT_FOUND",
    "INVOICE_NOT_FOUND",
  ]);
  const statuses = CATALOG.map(([, status]) => status);
  assert.deepEqual(
    statuses,
    [...statuses].sort((a, b) => a - b),
  );
});

// Los 7 de Raya PSP con el mensaje textual de publicapi/errors.py de la API y la data que manda
// cada uno (DESIGN §5.8): la clase sale del status y `param`, de data.field.
const PSP_ERRORS: Array<
  [string, number, typeof RayaError, string, Record<string, unknown> | null]
> = [
  [
    "PSP_NOT_ACTIVATED",
    403,
    PermissionDeniedError,
    "Raya PSP todavía no está activado para tu cuenta. Activalo o mirá el estado de tu solicitud " +
      "en Negocios › Raya PSP.",
    null,
  ],
  ["CUSTOMER_NOT_FOUND", 404, NotFoundError, "No encontramos ese cliente.", { field: "customer" }],
  [
    "CUSTOMER_ALREADY_EXISTS",
    409,
    ConflictError,
    "Ya tenés un cliente con ese CUIL o CUIT.",
    { customer: "pspc_7Hq2Lm9Xw4Tz1Bv8Nc3Kd6Rf" },
  ],
  [
    "CUSTOMER_STATUS_CONFLICT",
    409,
    ConflictError,
    "El cliente no está en un estado que permita esta operación. Revisá su status.",
    { status: "blocked", blocked_by: "raya" },
  ],
  [
    "CUSTOMER_INSUFFICIENT_BALANCE",
    422,
    UnprocessableEntityError,
    "Tu cliente no tiene saldo suficiente para esta transferencia.",
    null,
  ],
  [
    "CUSTOMER_DATA_MISMATCH",
    422,
    UnprocessableEntityError,
    "Los datos del cliente no coinciden con los registros oficiales.",
    { field: "name" },
  ],
  [
    "TAX_ID_NOT_REGISTERED",
    422,
    UnprocessableEntityError,
    "No encontramos ese CUIT en el Registro Nacional de Sociedades.",
    null,
  ],
];

test("los 7 de Raya PSP están en el catálogo, con el mismo HTTP", () => {
  assert.equal(PSP_ERRORS.length, 7);
  for (const [code, status, ErrorType] of PSP_ERRORS) {
    assert.ok(
      CATALOG.some(([c, s, t]) => c === code && s === status && t === ErrorType),
      code,
    );
  }
});

// Los 2 del Facturador, con el mensaje textual de la API y la data que manda cada uno:
// FACTURADOR_NOT_READY trae el motivo en data.reason.
const FACTURADOR_NOT_READY_MESSAGE =
  "El Facturador todavía no está listo para emitir facturas. Configuralo o mirá su estado en " +
  "Negocios › Facturador.";
const FACTURADOR_ERRORS: Array<
  [string, number, typeof RayaError, string, Record<string, unknown> | null]
> = [
  [
    "FACTURADOR_NOT_READY",
    403,
    PermissionDeniedError,
    FACTURADOR_NOT_READY_MESSAGE,
    { reason: "not_configured" },
  ],
  ["INVOICE_NOT_FOUND", 404, NotFoundError, "No encontramos esa factura.", null],
];

test("los 2 del Facturador están en el catálogo, con el mismo HTTP y en el lugar de la API", () => {
  assert.equal(FACTURADOR_ERRORS.length, 2);
  for (const [code, status, ErrorType] of FACTURADOR_ERRORS) {
    assert.ok(
      CATALOG.some(([c, s, t]) => c === code && s === status && t === ErrorType),
      code,
    );
  }
  const codes = CATALOG.map(([code]) => code);
  assert.equal(codes.indexOf("FACTURADOR_NOT_READY"), codes.indexOf("PSP_NOT_ACTIVATED") + 1);
  assert.equal(codes.indexOf("INVOICE_NOT_FOUND"), codes.indexOf("CUSTOMER_NOT_FOUND") + 1);
});

for (const [code, status, ErrorType, message, data] of [...PSP_ERRORS, ...FACTURADOR_ERRORS]) {
  test(`${code}: ${ErrorType.name}, con su mensaje y su data`, () => {
    const body = { error: { code, message, data } };
    const error = makeError(status, body, {}, "key-psp");
    assert.equal(error.constructor, ErrorType);
    assert.equal(error.code, code);
    assert.equal(error.httpStatus, status);
    assert.equal(error.message, message);
    assert.deepEqual(error.data, data);
    assert.equal(error.idempotencyKey, "key-psp");
    assert.equal(error.retryAfter, null);
    if (error instanceof InvalidRequestError) {
      assert.equal(error.param, (data?.field as string | undefined) ?? null);
    }
  });
}

for (const [code, status, ErrorType] of CATALOG) {
  test(`${code} (${status}) es ${ErrorType.name}`, () => {
    const error = makeError(status, { error: { code, message: "Texto.", data: null } });
    assert.equal(error.constructor, ErrorType);
    assert.ok(error instanceof RayaError);
    assert.ok(error instanceof Error);
    assert.equal(error.code, code);
    assert.equal(error.httpStatus, status);
    assert.equal(error.message, "Texto.");
    assert.equal(error.requestId, "req_abc");
    assert.equal(error.name, ErrorType.name);
  });
}

test("los atributos del error", () => {
  const body = {
    error: {
      code: "PARAMETER_INVALID",
      message: "amount tiene que ser un número con hasta 2 decimales.",
      data: { field: "amount" },
    },
  };
  const error = makeError(400, body, { "Retry-After": "3" }, "key-1");
  assert.ok(error instanceof InvalidRequestError);
  assert.equal(error.param, "amount");
  assert.deepEqual(error.data, { field: "amount" });
  assert.deepEqual(error.jsonBody, body);
  assert.equal(error.httpBody, JSON.stringify(body));
  assert.equal(error.headers.get("raya-request-id"), "req_abc");
  assert.equal(error.idempotencyKey, "key-1");
  assert.equal(error.retryAfter, 3);
  assert.equal(error.userMessage, error.message);
  assert.equal(
    String(error),
    "InvalidRequestError: Request req_abc: amount tiene que ser un número con hasta 2 decimales. " +
      "(PARAMETER_INVALID)",
  );
  // console.log(error) muestra lo útil y no los headers ni el body.
  assert.deepEqual(Object.keys(error), [
    "code",
    "data",
    "httpStatus",
    "requestId",
    "idempotencyKey",
    "retryAfter",
  ]);
  const shown = util.inspect(error);
  assert.match(shown, /code: 'PARAMETER_INVALID'/);
  assert.doesNotMatch(shown, /Headers/);
  assert.ok(error.stack?.startsWith("InvalidRequestError: amount tiene que ser"));
});

test("param es null sin field", () => {
  const error = makeError(400, { error: { code: "INVALID_JSON", message: "x", data: null } });
  assert.ok(error instanceof InvalidRequestError);
  assert.equal(error.param, null);
});

test("PAYMENT_NOT_REFUNDABLE con y sin reason", () => {
  const withReason = makeError(409, {
    error: {
      code: "PAYMENT_NOT_REFUNDABLE",
      message: "x",
      data: { status: "succeeded", reason: "refund_window_expired" },
    },
  });
  assert.deepEqual(withReason.data, { status: "succeeded", reason: "refund_window_expired" });
  const without = makeError(409, {
    error: { code: "PAYMENT_NOT_REFUNDABLE", message: "x", data: { status: "refunded" } },
  });
  assert.equal(without.constructor, ConflictError);
  assert.deepEqual(without.data, { status: "refunded" });
});

test("CONNECTED_ACCOUNT_LOCKED trae la razón, como API_KEY_ACCOUNT_LOCKED", () => {
  const error = makeError(403, {
    error: {
      code: "CONNECTED_ACCOUNT_LOCKED",
      message: "La cuenta conectada no puede operar en este momento.",
      data: { reason: "user_blocked" },
    },
  });
  assert.equal(error.constructor, PermissionDeniedError);
  assert.deepEqual(error.data, { reason: "user_blocked" });
});

test("PAYMENT_NOT_PENDING lleva el estado del pago en data", () => {
  const error = makeError(409, {
    error: {
      code: "PAYMENT_NOT_PENDING",
      message: "Solo podés simular la transferencia de un pago pendiente.",
      data: { status: "expired" },
    },
  });
  assert.equal(error.constructor, ConflictError);
  assert.equal(error.code, "PAYMENT_NOT_PENDING");
  assert.deepEqual(error.data, { status: "expired" });
});

test("SANDBOX_ONLY y SANDBOX_NOT_SUPPORTED son PermissionDeniedError, sin data", () => {
  const only = makeError(403, {
    error: {
      code: "SANDBOX_ONLY",
      message: "Este endpoint solo funciona en un sandbox: usá una credencial de prueba.",
      data: null,
    },
  });
  assert.equal(only.constructor, PermissionDeniedError);
  assert.equal(only.data, null);
  const notSupported = makeError(403, {
    error: {
      code: "SANDBOX_NOT_SUPPORTED",
      message: "Este endpoint todavía no está disponible en un sandbox.",
      data: null,
    },
  });
  assert.equal(notSupported.constructor, PermissionDeniedError);
  assert.equal(notSupported.code, "SANDBOX_NOT_SUPPORTED");
});

// Por qué el Facturador todavía no puede emitir: el motivo viene en data.reason.
for (const reason of [
  "not_configured",
  "checking",
  "action_required",
  "certificate_expired",
  "disabled",
]) {
  test(`FACTURADOR_NOT_READY con data.reason ${reason}: PermissionDeniedError, sin param`, () => {
    const error = makeError(403, {
      error: {
        code: "FACTURADOR_NOT_READY",
        message: FACTURADOR_NOT_READY_MESSAGE,
        data: { reason },
      },
    });
    assert.equal(error.constructor, PermissionDeniedError);
    assert.equal(error.code, "FACTURADOR_NOT_READY");
    assert.deepEqual(error.data, { reason });
    assert.equal(error.retryAfter, null);
    assert.equal("param" in error, false); // param es de InvalidRequestError
  });
}

test("VERIFICATION_NOT_CANCELABLE lleva el estado de la verificación en data", () => {
  const error = makeError(409, {
    error: {
      code: "VERIFICATION_NOT_CANCELABLE",
      message: "Solo podés cancelar verificaciones pending o in_progress.",
      data: { status: "processing" },
    },
  });
  assert.equal(error.constructor, ConflictError);
  assert.equal(error.code, "VERIFICATION_NOT_CANCELABLE");
  assert.deepEqual(error.data, { status: "processing" });
});

test("el tope de verificaciones de Identidad: RATE_LIMITED con limit y Retry-After", () => {
  const error = makeError(
    429,
    {
      error: {
        code: "RATE_LIMITED",
        message: "Llegaste al máximo de verificaciones abiertas.",
        data: { limit: "open" },
      },
    },
    { "Retry-After": "3600" },
  );
  assert.equal(error.constructor, RateLimitError);
  assert.equal(error.retryAfter, 3600);
  assert.deepEqual(error.data, { limit: "open" });
});

const UNKNOWN_CODES: Array<[number, string, typeof RayaError]> = [
  [422, "NEW_BUSINESS_RULE", UnprocessableEntityError],
  [409, "NEW_CONFLICT", ConflictError],
  [409, "IDEMPOTENCY_KEY_NEW", IdempotencyError],
  [418, "TEAPOT", InvalidRequestError],
  [410, "GONE", InvalidRequestError],
  [599, "WEIRD", APIError],
  [302, "MOVED", APIError],
];

for (const [status, code, ErrorType] of UNKNOWN_CODES) {
  test(`un código desconocido sigue al status: ${status} ${code} → ${ErrorType.name}`, () => {
    const error = makeError(status, { error: { code, message: "x", data: null } });
    assert.equal(error.constructor, ErrorType);
    assert.equal(error.code, code);
  });
}

const WITHOUT_ENVELOPE: Array<[number, unknown, typeof RayaError, string]> = [
  [502, "<html>Bad gateway</html>", APIError, "INTERNAL_ERROR"],
  [504, "", APIError, "INTERNAL_ERROR"],
  [408, "timeout", APIError, "INTERNAL_ERROR"],
  [429, "<html>Cloudflare</html>", RateLimitError, "RATE_LIMITED"],
  [404, "<h1>Not Found</h1>", NotFoundError, "INVALID_RESPONSE"],
  [403, { detail: "CSRF" }, PermissionDeniedError, "INVALID_RESPONSE"],
  [400, { error: "texto" }, InvalidRequestError, "INVALID_RESPONSE"],
  [500, ["no", "es", "un", "objeto"], APIError, "INTERNAL_ERROR"],
];

for (const [status, body, ErrorType, code] of WITHOUT_ENVELOPE) {
  test(`una respuesta ${status} sin el objeto error da ${code}`, () => {
    const error = makeError(status, body);
    assert.equal(error.constructor, ErrorType);
    assert.equal(error.code, code);
    assert.ok(error.message); // siempre hay un mensaje en castellano
    assert.equal(error.data, null);
  });
}

test("el mensaje se completa si falta el código", () => {
  const error = makeError(500, { error: { message: "Algo falló.", data: { x: 1 } } });
  assert.equal(error.code, "INTERNAL_ERROR");
  assert.equal(error.message, "Algo falló.");
  assert.deepEqual(error.data, { x: 1 });
});

test("toString sin request id ni código", () => {
  assert.equal(String(new RayaError("Hola")), "RayaError: Hola");
  assert.equal(String(new RayaError()), "RayaError: <sin mensaje>");
  assert.equal(String(new RayaError("Hola", { code: "X" })), "RayaError: Hola (X)");
});

test("los errores de conexión y de firma", () => {
  const cause = new TypeError("fetch failed");
  const error = new APIConnectionError("Sin red.", {
    code: "NETWORK_ERROR",
    shouldRetry: true,
    cause,
  });
  assert.equal(error.shouldRetry, true);
  assert.equal(error.httpStatus, null);
  assert.equal(error.cause, cause);
  assert.equal(error.headers.get("raya-request-id"), null);
  const signature = new SignatureVerificationError("Mala firma.", "t=1,v1=x", "{}");
  assert.equal(signature.sigHeader, "t=1,v1=x");
  assert.equal(signature.httpBody, "{}");
  assert.equal(signature.code, null);
  assert.equal(signature.name, "SignatureVerificationError");
});
