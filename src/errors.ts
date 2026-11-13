// Errores del SDK.
//
// La clase sale del código HTTP, como pide la API («si llega un código que no conocés, tratalo
// según su código HTTP»). Para decidir qué hacer, usá `error.code` (estable), nunca
// `error.message` (texto para personas, puede cambiar).

import { isPlainObject } from "./encoding.ts";
import { parseRetryAfter } from "./retry.ts";

export interface RayaErrorOptions {
  code?: string | null;
  data?: Record<string, unknown> | null;
  httpStatus?: number | null;
  requestId?: string | null;
  headers?: Headers | null;
  httpBody?: string | null;
  jsonBody?: unknown;
  idempotencyKey?: string | null;
  retryAfter?: number | null;
  /** El error original (por ejemplo, el del `fetch`). */
  cause?: unknown;
}

function hidden(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: false,
    writable: true,
    configurable: true,
  });
}

/** Base de todos los errores del SDK. */
export class RayaError extends Error {
  /** Código estable, como `INSUFFICIENT_BALANCE`. Decidí con esto. */
  code: string | null;
  /** Detalles del error: `field`, `status`, `reason`… o `null`. */
  data: Record<string, unknown> | null;
  httpStatus: number | null;
  /** El `Raya-Request-Id` (`req_…`): mandalo si escribís a soporte. */
  requestId: string | null;
  /** La Idempotency-Key con la que se mandó el POST: reintentá con la misma. */
  idempotencyKey: string | null;
  /** Segundos que pidió esperar el servidor (header `Retry-After`). */
  retryAfter: number | null;
  /** Los headers de la respuesta (vacíos si no hubo respuesta). */
  declare headers: Headers;
  /** El body crudo de la respuesta. */
  declare httpBody: string | null;
  /** El body parseado, si era JSON. */
  declare jsonBody: unknown;

  constructor(message?: string | null, options: RayaErrorOptions = {}) {
    super(message ?? "", options.cause === undefined ? undefined : { cause: options.cause });
    this.code = options.code ?? null;
    this.data = options.data ?? null;
    this.httpStatus = options.httpStatus ?? null;
    this.requestId = options.requestId ?? null;
    this.idempotencyKey = options.idempotencyKey ?? null;
    this.retryAfter = options.retryAfter ?? null;
    // Fuera de console.log(error): son largos y no ayudan a leer el error.
    hidden(this, "headers", options.headers ?? new Headers());
    hidden(this, "httpBody", options.httpBody ?? null);
    hidden(this, "jsonBody", options.jsonBody ?? null);
  }

  /** El mismo `message`: un alias para quien lo busca con este nombre. */
  get userMessage(): string {
    return this.message;
  }

  override toString(): string {
    let text = this.message || "<sin mensaje>";
    if (this.code) text = `${text} (${this.code})`;
    if (this.requestId) text = `Request ${this.requestId}: ${text}`;
    return `${this.name}: ${text}`;
  }
}

/** No llegó respuesta: timeout o corte (`code` es `TIMEOUT` o `NETWORK_ERROR`). */
export class APIConnectionError extends RayaError {
  /** Si se puede reintentar sin riesgo: los POST siempre llevan Idempotency-Key. */
  shouldRetry: boolean;

  constructor(message?: string | null, options: RayaErrorOptions & { shouldRetry?: boolean } = {}) {
    super(message, options);
    this.shouldRetry = options.shouldRetry ?? false;
  }
}

/** 400, 405, 413: falta un parámetro, sobra uno o tiene un valor inválido. */
export class InvalidRequestError extends RayaError {
  /** El parámetro que falló (`data.field`). */
  get param(): string | null {
    const field = this.data?.field;
    return typeof field === "string" ? field : null;
  }
}

/** 404: no existe o no es de tu cuenta. */
export class NotFoundError extends InvalidRequestError {}

/** 401: falta la clave secreta o no es válida. */
export class AuthenticationError extends RayaError {}

/** 403: la cuenta no puede hacer esta operación o no tiene la API habilitada. */
export class PermissionDeniedError extends RayaError {}

/** 409: choca con el estado del recurso (por ejemplo, `PAYMENT_NOT_REFUNDABLE`). */
export class ConflictError extends RayaError {}

/** 409 `IDEMPOTENCY_KEY_REUSED` o `IDEMPOTENCY_KEY_IN_USE`. */
export class IdempotencyError extends ConflictError {}

/** 422: la request está bien, pero no se pudo hacer (saldo insuficiente, destino inválido…). */
export class UnprocessableEntityError extends RayaError {}

/** 429: demasiadas requests. `retryAfter` dice cuántos segundos esperar. */
export class RateLimitError extends RayaError {}

/** 5xx, 408 o una respuesta inesperada: falló algo del lado de Raya. */
export class APIError extends RayaError {}

/** La firma de un webhook no es válida. */
export class SignatureVerificationError extends RayaError {
  /** El header `Raya-Signature` que llegó. */
  sigHeader: string | null;

  constructor(message: string, sigHeader: string | null = null, httpBody: string | null = null) {
    super(message, { httpBody });
    this.sigHeader = sigHeader;
  }
}

// El name va en el prototipo, con el nombre literal: sobrevive a un minificador y no aparece
// como propiedad propia en console.log(error).
for (const [cls, name] of [
  [RayaError, "RayaError"],
  [APIConnectionError, "APIConnectionError"],
  [InvalidRequestError, "InvalidRequestError"],
  [NotFoundError, "NotFoundError"],
  [AuthenticationError, "AuthenticationError"],
  [PermissionDeniedError, "PermissionDeniedError"],
  [ConflictError, "ConflictError"],
  [IdempotencyError, "IdempotencyError"],
  [UnprocessableEntityError, "UnprocessableEntityError"],
  [RateLimitError, "RateLimitError"],
  [APIError, "APIError"],
  [SignatureVerificationError, "SignatureVerificationError"],
] as const) {
  Object.defineProperty(cls.prototype, "name", {
    value: name,
    enumerable: false,
    writable: true,
    configurable: true,
  });
}

type ErrorClass = new (message?: string | null, options?: RayaErrorOptions) => RayaError;

export function errorClass(httpStatus: number, code: string | null): ErrorClass {
  if (httpStatus === 400 || httpStatus === 405 || httpStatus === 413) return InvalidRequestError;
  if (httpStatus === 401) return AuthenticationError;
  if (httpStatus === 403) return PermissionDeniedError;
  if (httpStatus === 404) return NotFoundError;
  if (httpStatus === 409) {
    return code?.startsWith("IDEMPOTENCY_KEY_") ? IdempotencyError : ConflictError;
  }
  if (httpStatus === 422) return UnprocessableEntityError;
  if (httpStatus === 429) return RateLimitError;
  if (httpStatus === 408 || httpStatus >= 500) return APIError;
  if (httpStatus >= 400 && httpStatus < 500) return InvalidRequestError;
  return APIError;
}

/** Código y mensaje para respuestas sin el objeto `error` (HTML del edge, body vacío…). */
function fallback(httpStatus: number): [string, string] {
  if (httpStatus === 429) {
    return [
      "RATE_LIMITED",
      "Superaste el límite de requests. Esperá los segundos que indica Retry-After y reintentá.",
    ];
  }
  if (httpStatus === 408 || httpStatus >= 500) {
    return [
      "INTERNAL_ERROR",
      `Falló algo del lado de Raya (HTTP ${httpStatus}). Reintentá en unos minutos; en los POST, ` +
        "con la misma Idempotency-Key.",
    ];
  }
  return ["INVALID_RESPONSE", `La API respondió algo inesperado (HTTP ${httpStatus}).`];
}

/** Arma el error de una respuesta que no es 2xx. */
export function errorFromResponse(response: {
  httpStatus: number;
  headers: Headers;
  body: string;
  idempotencyKey: string | null;
}): RayaError {
  const { httpStatus, headers, body, idempotencyKey } = response;
  let jsonBody: unknown = null;
  if (body) {
    try {
      jsonBody = JSON.parse(body);
    } catch {
      jsonBody = null;
    }
  }

  let code: string | null = null;
  let message: string | null = null;
  let data: Record<string, unknown> | null = null;
  const envelope = isPlainObject(jsonBody) ? jsonBody.error : undefined;
  if (isPlainObject(envelope)) {
    if (typeof envelope.code === "string") code = envelope.code;
    if (typeof envelope.message === "string") message = envelope.message;
    if (isPlainObject(envelope.data)) data = envelope.data;
  }
  if (code === null) {
    const [fallbackCode, fallbackMessage] = fallback(httpStatus);
    code = fallbackCode;
    message = message || fallbackMessage;
  }

  const ErrorType = errorClass(httpStatus, code);
  return new ErrorType(message, {
    code,
    data,
    httpStatus,
    requestId: headers.get("raya-request-id"),
    headers,
    httpBody: body,
    jsonBody,
    idempotencyKey,
    retryAfter: parseRetryAfter(headers.get("retry-after")),
  });
}
