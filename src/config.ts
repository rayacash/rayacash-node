// La configuración del estilo global (`config.apiKey = …` y `Payment.create(…)`) y los valores por
// defecto que comparte con RayaClient. No importa ningún otro módulo en runtime: así lo pueden leer
// util.ts, global.ts y requestor.ts sin ciclos al cargar.

import type { Fetch } from "./requestor.ts";
import type { AppInfo } from "./util.ts";

export const DEFAULT_API_BASE = "https://api.raya.cash";
// El servidor corta a los 60 s y crear un pago puede tardar ~40 s: con 65 s por intento recibimos
// la respuesta del servidor en vez de cortar nosotros justo antes.
export const DEFAULT_TIMEOUT = 65_000;
export const DEFAULT_MAX_NETWORK_RETRIES = 2;

/**
 * La configuración del estilo global. Un `RayaClient` tiene la suya, salvo el logging (`log` o
 * `RAYA_LOG`), que vale para todo el proceso.
 */
export interface GlobalConfig {
  /**
   * Tu clave secreta (`raya_sk_live_…`) o el access_token de una cuenta conectada
   * (`raya_at_live_…`); en un sandbox, sus pares de prueba (`raya_sk_test_…`, `raya_at_test_…`).
   * Si no la asignás, se lee de la variable de entorno `RAYA_SECRET_KEY`.
   */
  apiKey: string | null | undefined;
  /** Por defecto, `https://api.raya.cash`. */
  apiBase: string;
  /** Milisegundos por intento (por defecto, 65 000). */
  timeout: number;
  /** Reintentos ante cortes, 408, 429, 5xx e `IDEMPOTENCY_KEY_IN_USE` (por defecto, 2). */
  maxNetworkRetries: number;
  /** Un `fetch` propio (proxies, tests). Si no lo asignás, se usa el `fetch` global. */
  fetch: Fetch | null | undefined;
  /** Tu plugin, para el User-Agent. Asignalo con `setAppInfo()`. */
  appInfo: AppInfo | null | undefined;
  /** `"info"` o `"debug"` para ver las requests en stderr (también con `RAYA_LOG`). */
  log: "debug" | "info" | null | undefined;
}

function defaults(): GlobalConfig {
  return {
    apiKey: null,
    apiBase: DEFAULT_API_BASE,
    timeout: DEFAULT_TIMEOUT,
    maxNetworkRetries: DEFAULT_MAX_NETWORK_RETRIES,
    fetch: null,
    appInfo: null,
    log: null,
  };
}

/**
 * La configuración del estilo global: `Balance`, `Transfer`, `Payment`, `OAuth`, `User` y
 * `ConnectOrder` la leen en cada request, así que cambiarla entre llamadas surte efecto enseguida.
 * Está sellada: asignar una opción que no existe (`config.apikey`) falla en vez de no hacer nada.
 *
 * ```js
 * import { config, Payment } from "rayacash";
 *
 * config.apiKey = process.env.RAYA_SECRET_KEY;
 * const payment = await Payment.create({ amount: 15000 });
 * ```
 */
export const config: GlobalConfig = Object.seal(defaults());

/** Vuelve a los valores de fábrica (los tests lo usan entre caso y caso). */
export function resetConfig(): void {
  Object.assign(config, defaults());
}
