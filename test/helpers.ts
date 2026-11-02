// Un servidor falso para los tests (nada sale a la red) y el aislamiento entre caso y caso.

import { afterEach, beforeEach } from "node:test";

import { resetConfig } from "../src/config.ts";
import { resetGlobal } from "../src/global.ts";
import { RayaClient, type RayaClientOptions } from "../src/index.ts";
import { timing } from "../src/retry.ts";
import { logSettings } from "../src/util.ts";

export const TEST_KEY = "raya_sk_live_0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL";
export const OTHER_KEY = "raya_sk_live_ZYXWVUTSRQPONMLKJIHGFEDCBAzyxwvutsrqponmlkjihgfe";

export interface RecordedRequest {
  method: string;
  url: URL;
  headers: Headers;
  /** El body tal como lo mandó el SDK (`undefined` si no llevaba). */
  body: string | undefined;
}

interface QueuedResponse {
  status: number;
  body: string | Uint8Array<ArrayBuffer>;
  headers: Record<string, string>;
}

/** Devuelve las respuestas encoladas, en orden, y guarda cada request. */
export class MockAPI {
  readonly requests: RecordedRequest[] = [];
  readonly #queue: Array<QueuedResponse | { error: unknown }> = [];
  #count = 0;

  /** `text` es el body tal cual, en vez del JSON: un string o sus bytes. */
  add(
    status = 200,
    json: unknown = null,
    options: { headers?: Record<string, string>; text?: string | Uint8Array<ArrayBuffer> } = {},
  ): void {
    this.#count += 1;
    const headers = {
      "Raya-Request-Id": `req_test${String(this.#count).padStart(20, "0")}`,
      ...(options.text === undefined ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    };
    const body = options.text ?? JSON.stringify(json);
    this.#queue.push({ status, body, headers });
  }

  addError(
    status: number,
    code: string,
    message = "Mensaje de prueba.",
    data: Record<string, unknown> | null = null,
    options: { headers?: Record<string, string> } = {},
  ): void {
    this.add(status, { error: { code, message, data } }, options);
  }

  /** La próxima request falla con `error` (como un corte de red). */
  failWith(error: unknown): void {
    this.#queue.push({ error });
  }

  readonly fetch = async (url: string, init: RequestInit): Promise<Response> => {
    const method = init.method ?? "GET";
    this.requests.push({
      method,
      url: new URL(url),
      headers: new Headers(init.headers),
      body: init.body === undefined || init.body === null ? undefined : String(init.body),
    });
    const item = this.#queue.shift();
    if (item === undefined) throw new Error(`Request inesperada: ${method} ${url}`);
    if ("error" in item) throw item.error;
    return new Response(item.body, { status: item.status, headers: item.headers });
  };

  get last(): RecordedRequest {
    const request = this.requests[this.requests.length - 1];
    if (request === undefined) throw new Error("No hubo ninguna request.");
    return request;
  }

  lastJson(): unknown {
    return JSON.parse(this.last.body ?? "");
  }

  get pending(): number {
    return this.#queue.length;
  }

  client(
    apiKey: string | null = TEST_KEY,
    options: Omit<RayaClientOptions, "apiKey"> = {},
  ): RayaClient {
    return new RayaClient(apiKey, { fetch: this.fetch, ...options });
  }
}

/** Un corte de red como los del fetch de Node: TypeError("fetch failed") con la causa en `cause`. */
export function networkError(code = "ECONNREFUSED"): TypeError {
  const cause = Object.assign(new Error(`connect ${code} 127.0.0.1:443`), { code });
  return new TypeError("fetch failed", { cause });
}

/** El timeout de un intento, como lo lanza AbortSignal.timeout. */
export function timeoutError(): DOMException {
  return new DOMException("The operation was aborted due to timeout", "TimeoutError");
}

export interface Isolation {
  /** Las esperas de los reintentos, en segundos (sin dormir). El jitter queda fijo en el máximo. */
  sleeps: number[];
  /** El timeout de cada intento, en ms. */
  timeouts: number[];
}

/**
 * Sin claves del entorno de quien corre los tests, con la configuración global de fábrica y sin
 * dormir en los reintentos. Cada archivo de tests lo llama una vez, arriba de todo.
 */
export function isolate(): Isolation {
  const state: Isolation = { sleeps: [], timeouts: [] };
  const original = { ...timing };
  beforeEach(() => {
    delete process.env.RAYA_SECRET_KEY;
    logSettings.env = null;
    resetConfig();
    resetGlobal();
    state.sleeps.length = 0;
    state.timeouts.length = 0;
    timing.sleep = async (seconds) => {
      state.sleeps.push(seconds);
    };
    timing.jitter = () => 1;
    timing.timeoutSignal = (ms) => {
      state.timeouts.push(ms);
      return new AbortController().signal;
    };
  });
  afterEach(() => {
    Object.assign(timing, original);
    resetConfig();
    resetGlobal();
    delete process.env.RAYA_SECRET_KEY;
    logSettings.env = null;
  });
  return state;
}

/** El error con el que falla `promise` (falla el test si no falla). */
// biome-ignore lint/suspicious/noExplicitAny: los tests miran propiedades de cualquier error.
export async function rejection(promise: Promise<unknown>): Promise<any> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Se esperaba que la promesa fallara.");
}

/** El error que lanza `fn` (falla el test si no lanza). */
// biome-ignore lint/suspicious/noExplicitAny: los tests miran propiedades de cualquier error.
export function thrown(fn: () => unknown): any {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("Se esperaba que la función lanzara un error.");
}

/** Lo que el SDK escribió en stderr mientras corría `fn`. */
export async function captureStderr(fn: () => Promise<unknown>): Promise<string> {
  const chunks: string[] = [];
  const write = process.stderr.write;
  process.stderr.write = ((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    await fn();
  } finally {
    process.stderr.write = write;
  }
  return chunks.join("");
}
