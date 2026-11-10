import { BalanceService } from "./balanceService.ts";
import { DEFAULT_API_BASE, DEFAULT_MAX_NETWORK_RETRIES, DEFAULT_TIMEOUT } from "./config.ts";
import { ConnectService } from "./connectService.ts";
import { warnDeprecated } from "./deprecated.ts";
import { checkParams, encodeQuery, isPlainObject, typeName } from "./encoding.ts";
import type { Event } from "./event.ts";
import { ListObject, setRetrieveContext } from "./listObject.ts";
import { OAuthService } from "./oauthService.ts";
import { PaymentService } from "./paymentService.ts";
import type { RayaObject } from "./rayaObject.ts";
import { type PostRequestOptions, validateOptions } from "./requestOptions.ts";
import {
  APIRequestor,
  checkApiKey,
  type Fetch,
  globalFetch,
  normalizeApiBase,
  type RequestorConfig,
  validateFetch,
  validateMaxNetworkRetries,
  validateTimeout,
} from "./requestor.ts";
import { TransferService } from "./transferService.ts";
import { UserService } from "./userService.ts";
import { type AppInfo, INSPECT, maskKey, userAgent, validateAppInfo } from "./util.ts";
import { constructEvent, DEFAULT_TOLERANCE, type Payload } from "./webhook.ts";

export interface RayaClientOptions {
  /**
   * Tu clave secreta (`raya_sk_live_…`) o, para cobrar a nombre de una cuenta que conectó tu app,
   * su access_token (`raya_at_live_…`). Si no la pasás, se lee de la variable de entorno
   * `RAYA_SECRET_KEY`.
   */
  apiKey?: string | null;
  /** Por defecto, `https://api.raya.cash`. */
  apiBase?: string;
  /**
   * Milisegundos por intento (por defecto, 65 000). El servidor corta a los 60 s y crear un pago
   * puede tardar ~40 s.
   */
  timeout?: number;
  /**
   * Reintentos ante cortes, 408, 429, 5xx e `IDEMPOTENCY_KEY_IN_USE` (por defecto, 2). Los POST
   * reintentan con la misma Idempotency-Key, así que nunca se ejecutan dos veces.
   */
  maxNetworkRetries?: number;
  /** Un `fetch` propio (proxies, certificados, tests). Por defecto, el `fetch` global. */
  fetch?: Fetch;
  /** `{ name, version, url }` de tu plugin, para el User-Agent. */
  appInfo?: AppInfo;
}

/** Lo que va en una `rawRequest`: `params` en la query y `body` en el JSON del POST. */
export interface RawRequestParams {
  params?: Record<string, unknown> | null;
  body?: Record<string, unknown> | null;
}

const CLIENT_OPTIONS = ["apiKey", "apiBase", "timeout", "maxNetworkRetries", "fetch", "appInfo"];
const SNAKE_CASE: Record<string, string> = {
  api_key: "apiKey",
  api_base: "apiBase",
  max_network_retries: "maxNetworkRetries",
  http_client: "fetch",
  app_info: "appInfo",
};

class ClientConfig implements RequestorConfig {
  readonly #apiKey: string | null;
  readonly #apiBase: string;
  readonly #timeout: number;
  readonly #maxNetworkRetries: number;
  readonly #userAgent: string;
  readonly #fetch: Fetch | null;

  constructor(init: {
    apiKey: string | null;
    apiBase: string;
    timeout: number;
    maxNetworkRetries: number;
    userAgent: string;
    fetch: Fetch | null;
  }) {
    this.#apiKey = init.apiKey;
    this.#apiBase = init.apiBase;
    this.#timeout = init.timeout;
    this.#maxNetworkRetries = init.maxNetworkRetries;
    this.#userAgent = init.userAgent;
    this.#fetch = init.fetch;
  }

  apiKey(): string | null {
    return this.#apiKey;
  }

  apiBase(): string {
    return this.#apiBase;
  }

  timeout(): number {
    return this.#timeout;
  }

  maxNetworkRetries(): number {
    return this.#maxNetworkRetries;
  }

  userAgent(): string {
    return this.#userAgent;
  }

  fetch(): Fetch {
    return this.#fetch ?? globalFetch();
  }
}

function splitArguments(
  first: unknown,
  second: unknown,
): { apiKey: unknown; options: Record<string, unknown> } {
  if (isPlainObject(first)) {
    if (second !== undefined) {
      throw new TypeError(
        "Pasá las opciones en un solo objeto: new RayaClient({ apiKey, timeout, … }).",
      );
    }
    return { apiKey: first.apiKey, options: first };
  }
  if (second === undefined || second === null) return { apiKey: first, options: {} };
  if (!isPlainObject(second)) {
    throw new TypeError(
      `Las opciones de RayaClient van en un objeto, como { timeout: 90_000 }, no ${typeName(second)}.`,
    );
  }
  if ("apiKey" in second) {
    throw new TypeError("Pasaste la clave dos veces: como primer argumento y en apiKey.");
  }
  return { apiKey: first, options: second };
}

/**
 * Cliente de la API de Raya Cash.
 *
 * ```js
 * const client = new RayaClient(); // lee la clave de RAYA_SECRET_KEY
 * const balance = await client.balance.retrieve();
 * ```
 *
 * La clave secreta va solo en tu servidor, leída de una variable de entorno: nunca en el
 * navegador, en una app mobile ni en el repositorio.
 *
 * Para cobrar a nombre de una cuenta que conectó tu app, el cliente se arma con su access_token
 * (`new RayaClient(token.access_token)`): `client.connect` y `client.users` usan ese token;
 * `client.oauth.token()` lo consigue y no necesita clave.
 */
export class RayaClient {
  readonly balance: BalanceService;
  readonly transfers: TransferService;
  readonly payments: PaymentService;
  /** Canjear el `code` de una cuenta que conectó tu app por su access_token. */
  readonly oauth: OAuthService;
  /** Los datos de la cuenta conectada (con su access_token). */
  readonly users: UserService;
  /** Raya Connect: los pagos a nombre de la cuenta conectada (con su access_token). */
  readonly connect: ConnectService;

  readonly #config: ClientConfig;
  readonly #requestor: APIRequestor;

  constructor(apiKey?: string | null, options?: Omit<RayaClientOptions, "apiKey">);
  constructor(options?: RayaClientOptions);
  constructor(
    apiKeyOrOptions?: string | null | RayaClientOptions,
    maybeOptions?: Omit<RayaClientOptions, "apiKey">,
  ) {
    const { apiKey: given, options } = splitArguments(apiKeyOrOptions, maybeOptions);
    for (const key of Object.keys(options)) {
      if (CLIENT_OPTIONS.includes(key)) continue;
      const hint = SNAKE_CASE[key] ? ` (¿quisiste decir ${SNAKE_CASE[key]}?)` : "";
      throw new TypeError(
        `RayaClient no acepta la opción "${key}"${hint}: las opciones son apiKey, apiBase, ` +
          "timeout, maxNetworkRetries, fetch y appInfo.",
      );
    }

    let apiKey: string | null = null;
    if (given !== undefined && given !== null) apiKey = checkApiKey(given);
    else if (process.env.RAYA_SECRET_KEY) apiKey = checkApiKey(process.env.RAYA_SECRET_KEY);

    const { apiBase, timeout, maxNetworkRetries, fetch, appInfo } = options;
    this.#config = new ClientConfig({
      apiKey,
      apiBase: normalizeApiBase(apiBase ?? DEFAULT_API_BASE),
      timeout:
        timeout !== undefined && timeout !== null ? validateTimeout(timeout) : DEFAULT_TIMEOUT,
      maxNetworkRetries:
        maxNetworkRetries !== undefined && maxNetworkRetries !== null
          ? validateMaxNetworkRetries(maxNetworkRetries)
          : DEFAULT_MAX_NETWORK_RETRIES,
      userAgent: userAgent(
        appInfo !== undefined && appInfo !== null ? validateAppInfo(appInfo) : null,
      ),
      fetch: fetch !== undefined && fetch !== null ? validateFetch(fetch) : null,
    });
    this.#requestor = new APIRequestor(this.#config);
    this.balance = new BalanceService(this.#requestor);
    this.transfers = new TransferService(this.#requestor);
    this.payments = new PaymentService(this.#requestor);
    this.oauth = new OAuthService(this.#requestor);
    this.users = new UserService(this.#requestor);
    this.connect = new ConnectService(this.#requestor);
  }

  /**
   * @deprecated Desde la 1.2.0 se llama `client.connect`: es el mismo objeto, así que
   * `client.checkout.orders` es `client.connect.orders` y llama a `/v1/connect/orders`. Avisa una
   * vez por proceso con un `DeprecationWarning`. Se va en la 2.0.0.
   */
  get checkout(): ConnectService {
    warnDeprecated(
      "RAYACASH_DEP_CHECKOUT",
      "client.checkout está deprecado: usá client.connect, que es el mismo objeto. Se elimina en " +
        "rayacash 2.0.0.",
    );
    return this.connect;
  }

  /**
   * Una request a cualquier ruta, con la misma autenticación, reintentos y errores.
   *
   * Para endpoints que el SDK todavía no tiene: `client.rawRequest("get", "/v1/…", { params })`.
   * `params` va en la query (la ruta va sin `?` ni `#`) y `body` en el JSON del POST.
   */
  async rawRequest(
    method: string,
    path: string,
    request: RawRequestParams = {},
    options?: PostRequestOptions,
  ): Promise<RayaObject> {
    const values = checkParams("rawRequest", request, ["params", "body"]);
    const params = values.params;
    const body = values.body;
    if (params !== undefined && params !== null && !isPlainObject(params)) {
      throw new TypeError("params tiene que ser un objeto: va en la query.");
    }
    if (body !== undefined && body !== null && !isPlainObject(body)) {
      throw new TypeError("body tiene que ser un objeto: va como JSON en el POST.");
    }
    const query = params ? encodeQuery(params) : {};
    const result = await this.#requestor.request(
      method,
      path,
      { query, body: body ?? null },
      options,
    );
    if (result instanceof ListObject && method.toUpperCase() === "GET") {
      setRetrieveContext(result, path, query, validateOptions(options));
    }
    return result;
  }

  /**
   * Como `Webhook.constructEvent`, con el evento ligado a este cliente: así,
   * `event.data.object.refund()` usa la clave de este cliente.
   */
  constructEvent(
    payload: Payload,
    header: string | null | undefined,
    secret: string,
    tolerance: number | null = DEFAULT_TOLERANCE,
  ): Event {
    return constructEvent(payload, header, secret, tolerance, this.#requestor);
  }

  /** Lo que muestran `JSON.stringify(client)` y `console.log(client)`: la clave, enmascarada. */
  toJSON(): { apiBase: string; apiKey: string | null } {
    return { apiBase: this.#config.apiBase(), apiKey: maskKey(this.#config.apiKey()) };
  }
}

// En la 1.1.0, `checkout` era una propiedad propia de cada cliente y desde JavaScript se podía
// reasignar (`client.checkout = mock`, en los tests de una integración). Este setter lo sigue
// permitiendo: lo asignado queda como esa propiedad propia (escribible, configurable y enumerable,
// como en la 1.1.0), que tapa al getter, así que las lecturas siguientes lo devuelven, sin aviso.
// Va acá y no en la clase para que TypeScript la siga viendo de solo lectura, como la declaraba la
// 1.1.0. Redefinir solo `set` conserva el getter de la clase y sus atributos.
Object.defineProperty(RayaClient.prototype, "checkout", {
  set(this: RayaClient, value: unknown): void {
    Object.defineProperty(this, "checkout", {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  },
});

Object.defineProperty(RayaClient.prototype, INSPECT, {
  value(
    this: RayaClient,
    _depth: number,
    options: unknown,
    inspect?: (value: unknown, options: unknown) => string,
  ): string {
    const fields = this.toJSON();
    return `RayaClient ${inspect ? inspect(fields, options) : JSON.stringify(fields)}`;
  },
});
