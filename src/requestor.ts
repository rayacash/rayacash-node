// El núcleo de cada request: headers, encoding, reintentos, errores e hidratación.
//
// Lo comparten RayaClient y el estilo global: cada uno le pasa su configuración.

import { randomUUID } from "node:crypto";

import { encodeBody, isPlainObject, strip, typeName, validateIdempotencyKey } from "./encoding.ts";
import {
  APIConnectionError,
  APIError,
  AuthenticationError,
  errorFromResponse,
  type RayaError,
} from "./errors.ts";
import { ListObject, setRetrieveContext } from "./listObject.ts";
import "./objectClasses.ts";
import { hydrate, type RayaObject } from "./rayaObject.ts";
import { validateOptions } from "./requestOptions.ts";
import { RayaResponse } from "./response.ts";
import { backoffDelay, retryDelay, shouldRetryResponse, timing } from "./retry.ts";
import { formatFixed, logDebug, logInfo } from "./util.ts";

/**
 * Un `fetch` como el global: el SDK solo usa `status`, `headers` y `arrayBuffer()` de la
 * respuesta.
 */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
// Como el response.text de httpx: lo que no es UTF-8 válido queda como U+FFFD y un BOM se queda
// (así no es JSON, como en Python y PHP). Solo para los errores.
const UTF8 = new TextDecoder("utf-8", { ignoreBOM: true });
// UTF-8 estricto en los 2xx, como Python y PHP: lo que no es UTF-8 válido no es un objeto JSON.
const STRICT_UTF8 = new TextDecoder("utf-8", { fatal: true });
// AbortSignal.timeout usa setTimeout, que con más que esto dispara enseguida.
const MAX_TIMEOUT = 2_147_483_647;
const TIMEOUT_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "ETIMEDOUT",
]);

/** Rechaza antes de mandar nada lo que nunca puede andar. El formato lo valida la API. */
export function checkApiKey(key: unknown): string {
  if (typeof key !== "string") {
    throw new TypeError(`La clave secreta tiene que ser un string, no ${typeName(key)}.`);
  }
  if (!strip(key)) {
    throw new AuthenticationError(
      "Falta la clave secreta: pasala a new RayaClient({ apiKey }), asignala a config.apiKey o " +
        "definí la variable de entorno RAYA_SECRET_KEY.",
      { code: "API_KEY_MISSING" },
    );
  }
  if (key.startsWith("raya_pk_")) {
    throw new AuthenticationError(
      "Usaste la clave pública (raya_pk_…). La API se usa con la clave secreta (raya_sk_live_…), " +
        "solo desde tu servidor.",
      { code: "API_KEY_PUBLISHABLE_NOT_ALLOWED" },
    );
  }
  if (!/^[\x21-\x7e]+$/.test(key)) {
    throw new AuthenticationError(
      "La clave secreta tiene espacios o caracteres inválidos: copiala de nuevo desde " +
        "Developers › API Keys.",
      { code: "API_KEY_INVALID" },
    );
  }
  return key;
}

export function normalizeApiBase(value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError(`apiBase tiene que ser un string, no ${typeName(value)}.`);
  }
  const url = strip(value);
  let parts: URL | null = null;
  try {
    parts = new URL(url);
  } catch {
    parts = null;
  }
  const secure = parts?.protocol === "https:" && Boolean(parts.hostname);
  const local = parts?.protocol === "http:" && LOCAL_HOSTS.has(parts.hostname);
  if (
    !parts ||
    !(secure || local) ||
    parts.search ||
    parts.hash ||
    parts.username ||
    parts.password
  ) {
    throw new RangeError(
      "apiBase tiene que ser una URL https:// sin query ni credenciales (o http://localhost para " +
        "desarrollo local).",
    );
  }
  // Una query o un fragmento vacíos ("https://x?") cuentan como ausentes, y sus marcas tampoco
  // quedan: si no, cada request iría a /?/v1/… o a /.
  const end = url.search(/[?#]/);
  return (end < 0 ? url : url.slice(0, end)).replace(/\/+$/, "");
}

export function validateTimeout(value: unknown): number {
  if (typeof value !== "number") {
    throw new TypeError(
      `timeout tiene que ser un número de milisegundos, como 65_000, no ${typeName(value)}.`,
    );
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError("timeout tiene que ser un número de milisegundos mayor que 0.");
  }
  if (value > MAX_TIMEOUT) {
    throw new RangeError(`timeout no puede pasar de ${MAX_TIMEOUT} ms (unos 24 días).`);
  }
  return value;
}

export function validateMaxNetworkRetries(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new TypeError("maxNetworkRetries tiene que ser un entero.");
  }
  if (value < 0) throw new RangeError("maxNetworkRetries no puede ser negativo.");
  return value;
}

export function validateFetch(value: unknown): Fetch {
  if (typeof value !== "function") {
    throw new TypeError(
      `fetch tiene que ser una función, como el fetch global, no ${typeName(value)}.`,
    );
  }
  return value as Fetch;
}

/** El fetch global, leído en cada request: así valen los polyfills y los mocks que lo reemplazan. */
export function globalFetch(): Fetch {
  const fetchImpl: unknown = globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new TypeError(
      "No hay un fetch global: usá Node.js 22 o más nuevo, o pasá tu propio fetch en las opciones.",
    );
  }
  return fetchImpl as Fetch;
}

/** Lo que el requestor le pregunta a su dueño (RayaClient o el estilo global). */
export interface RequestorConfig {
  apiKey(): string | null;
  apiBase(): string;
  timeout(): number;
  maxNetworkRetries(): number;
  userAgent(): string;
  fetch(): Fetch;
}

interface Prepared {
  method: string;
  path: string;
  url: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string | undefined;
  timeout: number;
  maxRetries: number;
  idempotencyKey: string | null;
}

/** Lo que va en la URL y en el body de una request. */
export interface RequestParts {
  query?: Record<string, string> | null;
  body?: Record<string, unknown> | null;
}

function nameOf(error: unknown): unknown {
  return typeof error === "object" && error !== null
    ? (error as { name?: unknown }).name
    : undefined;
}

function causeCode(error: unknown): unknown {
  const cause: unknown =
    typeof error === "object" && error !== null ? (error as { cause?: unknown }).cause : undefined;
  return typeof cause === "object" && cause !== null
    ? (cause as { code?: unknown }).code
    : undefined;
}

export class APIRequestor {
  readonly #config: RequestorConfig;

  constructor(config: RequestorConfig) {
    this.#config = config;
  }

  // --- API del requestor --------------------------------------------------------------------

  async request(
    method: string,
    path: string,
    parts: RequestParts = {},
    options?: unknown,
    expected?: string,
  ): Promise<RayaObject> {
    const prepared = this.#prepare(method, path, parts, options);
    const { response, bytes } = await this.#send(prepared);
    return this.#hydrate(prepared, response, bytes, expected);
  }

  async requestList(
    path: string,
    query: Record<string, string>,
    options?: unknown,
  ): Promise<ListObject<unknown>> {
    const page = await this.request("GET", path, { query }, options, "list");
    if (!(page instanceof ListObject)) {
      // Con la respuesta, como todo error que sale de una respuesta de la API.
      const response = page.lastResponse;
      throw new APIError("La API respondió algo que no es una lista.", {
        code: "INVALID_RESPONSE",
        httpStatus: response?.httpStatus ?? null,
        requestId: response?.requestId ?? null,
        headers: response?.headers ?? null,
        httpBody: response?.body ?? null,
        idempotencyKey: response?.idempotencyKey ?? null,
      });
    }
    setRetrieveContext(page, path, query, validateOptions(options));
    return page;
  }

  // --- Preparación --------------------------------------------------------------------------

  #prepare(method: string, path: string, parts: RequestParts, options: unknown): Prepared {
    const opts = validateOptions(options);
    if (typeof method !== "string") {
      throw new TypeError(`method tiene que ser un string, no ${typeName(method)}.`);
    }
    const verb = method.toUpperCase();
    if (verb !== "GET" && verb !== "POST") throw new RangeError("La API solo acepta GET y POST.");
    if (typeof path !== "string" || !path.startsWith("/")) {
      throw new RangeError("La ruta tiene que empezar con /, como /v1/balance.");
    }
    // La query va aparte: pegada a la ruta, la página siguiente le sumaría ?cursor a su último
    // valor.
    if (/[?#]/.test(path)) throw new RangeError("La ruta va sin query (usá params).");
    // Como en Python y PHP: el parser de URL de fetch convertiría \ en / y sacaría los saltos y
    // los tabs, y la request iría a otra ruta sin avisar.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: los caracteres de control se rechazan.
    if (/[\\\x00-\x1f\x7f]/.test(path)) {
      throw new RangeError("La ruta va sin \\ ni caracteres de control (codificá los ids).");
    }

    // Sin clave levanta API_KEY_MISSING antes de cualquier I/O.
    const apiKey = checkApiKey(opts.apiKey ?? this.#config.apiKey() ?? "");

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "User-Agent": this.#config.userAgent(),
    };
    let body: string | undefined;
    if (parts.body !== undefined && parts.body !== null) {
      if (verb === "GET") {
        throw new RangeError("Un GET no lleva body: mandá los filtros en la query.");
      }
      if (!isPlainObject(parts.body)) {
        throw new TypeError(`El body tiene que ser un objeto, no ${typeName(parts.body)}.`);
      }
      body = encodeBody(parts.body);
      headers["Content-Type"] = "application/json";
    }

    let idempotencyKey: string | null = null;
    if (verb === "POST") {
      // Una sola clave por llamada, la misma en cada reintento: nunca se ejecuta dos veces.
      idempotencyKey =
        opts.idempotencyKey !== undefined
          ? validateIdempotencyKey(opts.idempotencyKey)
          : randomUUID();
      headers["Idempotency-Key"] = idempotencyKey;
    } else if (opts.idempotencyKey !== undefined) {
      throw new RangeError("La Idempotency-Key solo va en los POST.");
    }

    const timeout =
      opts.timeout !== undefined ? validateTimeout(opts.timeout) : this.#config.timeout();
    const maxRetries =
      opts.maxNetworkRetries !== undefined
        ? validateMaxNetworkRetries(opts.maxNetworkRetries)
        : this.#config.maxNetworkRetries();

    const query = { ...(parts.query ?? {}) };
    const search = new URLSearchParams(query).toString();
    return {
      method: verb,
      path,
      // fetch saca los espacios del final de la URL: sin query, "/v1/x " iría a /v1/x y su página
      // siguiente, a /v1/x%20. Van codificados en todas, como en httpx.
      url: this.#config.apiBase() + path.replaceAll(" ", "%20") + (search ? `?${search}` : ""),
      query,
      headers,
      body,
      timeout,
      maxRetries,
      idempotencyKey,
    };
  }

  // --- Envío con reintentos -----------------------------------------------------------------

  async #send(p: Prepared): Promise<{ response: Response; bytes: ArrayBuffer }> {
    const fetchImpl = this.#config.fetch();
    let retry = 0;
    for (;;) {
      logRequest(p, retry);
      const started = performance.now();
      let response: Response;
      let bytes: ArrayBuffer;
      try {
        response = await fetchImpl(p.url, {
          method: p.method,
          headers: p.headers,
          body: p.body,
          redirect: "manual",
          signal: timing.timeoutSignal(Math.ceil(p.timeout)),
        });
        // El body se lee acá adentro: un corte a mitad de la respuesta también es un corte.
        bytes = await response.arrayBuffer();
      } catch (cause) {
        const error = connectionError(p, cause);
        if (!error.shouldRetry || retry >= p.maxRetries) throw error;
        retry += 1;
        const delay = backoffDelay(retry);
        logRetry(p, retry, error.code, delay);
        await timing.sleep(delay);
        continue;
      }
      const outcome = check(p, response, bytes, started);
      if (outcome === null) return { response, bytes };
      if (retry >= p.maxRetries || !shouldRetry(outcome)) throw outcome;
      retry += 1;
      const delay = retryDelay(retry, outcome.retryAfter);
      logRetry(p, retry, outcome.code, delay);
      await timing.sleep(delay);
    }
  }

  // --- Respuesta ----------------------------------------------------------------------------

  #hydrate(
    p: Prepared,
    response: Response,
    bytes: ArrayBuffer,
    expected: string | undefined,
  ): RayaObject {
    let text: string | null = null;
    let data: unknown = null;
    try {
      text = STRICT_UTF8.decode(bytes);
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    const invalid = (cause?: unknown): APIError =>
      new APIError(`La API respondió ${response.status} con un body que no es un objeto JSON.`, {
        code: "INVALID_RESPONSE",
        httpStatus: response.status,
        requestId: response.headers.get("raya-request-id"),
        headers: response.headers,
        httpBody: text ?? UTF8.decode(bytes),
        idempotencyKey: p.idempotencyKey,
        cause,
      });
    if (text === null || !isPlainObject(data)) throw invalid();
    const lastResponse = new RayaResponse({
      httpStatus: response.status,
      headers: response.headers,
      body: text,
      data,
      idempotencyKey: p.idempotencyKey,
    });
    try {
      return hydrate(data, this, expected, lastResponse);
    } catch (cause) {
      // JSON.parse lee cualquier profundidad, pero armar el objeto convierte cada nivel con una
      // llamada: uno muy anidado llena la pila (RangeError). Como en Python y PHP, no es un objeto.
      if (!(cause instanceof RangeError)) throw cause;
      throw invalid(cause);
    }
  }
}

function shouldRetry(error: RayaError): boolean {
  return shouldRetryResponse(error.httpStatus ?? 0, error.code, error.retryAfter);
}

/** `null` si salió bien (2xx); si no, el error que corresponde. */
function check(
  p: Prepared,
  response: Response,
  bytes: ArrayBuffer,
  started: number,
): RayaError | null {
  logInfo("Respuesta de la API de Raya", {
    method: p.method,
    path: p.path,
    status: response.status,
    request_id: response.headers.get("raya-request-id") ?? "",
    elapsed: `${formatFixed((performance.now() - started) / 1000, 3)}s`,
  });
  if (response.status >= 200 && response.status < 300) return null;
  return errorFromResponse({
    httpStatus: response.status,
    headers: response.headers,
    body: UTF8.decode(bytes),
    idempotencyKey: p.idempotencyKey,
  });
}

/**
 * Un corte o un timeout, como APIConnectionError. fetch rechaza con TypeError cuando falla la red:
 * con `cause` (ECONNRESET, "terminated"…) se reintenta; sin `cause` es la request la que está mal
 * (un header inválido) y reintentar daría lo mismo. Cualquier otro error sale tal cual.
 */
function connectionError(p: Prepared, cause: unknown): APIConnectionError {
  const name = nameOf(cause);
  const code = causeCode(cause);
  const timeout =
    name === "TimeoutError" ||
    name === "AbortError" ||
    (typeof code === "string" && TIMEOUT_CODES.has(code));
  if (!timeout && !(cause instanceof TypeError)) throw cause;
  const retryable = timeout || (cause as TypeError).cause !== undefined;
  let message: string;
  if (timeout) {
    message = "La API de Raya no respondió a tiempo.";
  } else {
    const detail = typeof code === "string" ? code : (cause as TypeError).message;
    message = `No pudimos conectarnos con la API de Raya (${detail}).`;
  }
  if (p.method === "POST") {
    message += " Reintentá con la misma Idempotency-Key: nunca se ejecuta dos veces.";
  }
  return new APIConnectionError(message, {
    code: timeout ? "TIMEOUT" : "NETWORK_ERROR",
    shouldRetry: retryable,
    idempotencyKey: p.idempotencyKey,
    cause,
  });
}

function logRequest(p: Prepared, retry: number): void {
  logInfo("Request a la API de Raya", { method: p.method, path: p.path, attempt: retry + 1 });
  const query = Object.entries(p.query);
  if (query.length || p.idempotencyKey) {
    logDebug("Detalle de la request", {
      query: query.map(([key, value]) => `${key}=${value}`).join("&"),
      idempotency_key: p.idempotencyKey ?? "",
    });
  }
}

function logRetry(p: Prepared, retry: number, reason: string | null, delay: number): void {
  logInfo("Reintentando la request", {
    method: p.method,
    path: p.path,
    retry,
    reason: reason ?? "",
    delay: `${formatFixed(delay, 2)}s`,
  });
}
