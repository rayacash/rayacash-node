// El estilo global: `config.apiKey = …` y `await Payment.create(…)`.
//
// La configuración se lee de `config` en cada request, así que cambiarla entre llamadas surte
// efecto enseguida.

import { config } from "./config.ts";
import { isPlainObject, typeName } from "./encoding.ts";
import { setDefaultRequestorProvider } from "./registry.ts";
import {
  APIRequestor,
  type Fetch,
  globalFetch,
  normalizeApiBase,
  type RequestorConfig,
  validateFetch,
  validateMaxNetworkRetries,
  validateTimeout,
} from "./requestor.ts";
import { userAgent, validateAppInfo } from "./util.ts";

class GlobalRequestorConfig implements RequestorConfig {
  apiKey(): string | null {
    if (config.apiKey !== null && config.apiKey !== undefined) return config.apiKey;
    return process.env.RAYA_SECRET_KEY || null;
  }

  apiBase(): string {
    return normalizeApiBase(config.apiBase);
  }

  timeout(): number {
    return validateTimeout(config.timeout);
  }

  maxNetworkRetries(): number {
    return validateMaxNetworkRetries(config.maxNetworkRetries);
  }

  userAgent(): string {
    const info = config.appInfo;
    return userAgent(info !== null && info !== undefined ? validateAppInfo(info) : null);
  }

  fetch(): Fetch {
    const fetchImpl = config.fetch;
    return fetchImpl !== null && fetchImpl !== undefined ? validateFetch(fetchImpl) : globalFetch();
  }
}

let requestor: APIRequestor | null = null;

export function defaultRequestor(): APIRequestor {
  requestor ??= new APIRequestor(new GlobalRequestorConfig());
  return requestor;
}

/** Olvida el requestor del estilo global (los tests lo usan entre caso y caso). */
export function resetGlobal(): void {
  requestor = null;
}

setDefaultRequestorProvider(defaultRequestor);

/** Identifica tu plugin en el User-Agent del estilo global (lo ves en Developers › Logs). */
export function setAppInfo(name: string, info: { version?: string; url?: string } = {}): void {
  if (!isPlainObject(info)) {
    throw new TypeError(
      `setAppInfo recibe { version, url } como segundo argumento, no ${typeName(info)}.`,
    );
  }
  config.appInfo = validateAppInfo({ name, ...info });
}
