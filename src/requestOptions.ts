// Opciones por request: pisan las del cliente (o las globales) solo en esa llamada.

import { isPlainObject, typeName } from "./encoding.ts";

/**
 * Opciones de una sola request (el último argumento de cada método).
 *
 * - `apiKey`: otra clave secreta para esta llamada.
 * - `timeout`: milisegundos por intento.
 * - `maxNetworkRetries`: reintentos para esta llamada (`0` los apaga).
 */
export interface RequestOptions {
  apiKey?: string;
  timeout?: number;
  maxNetworkRetries?: number;
}

/** Las de un POST: suman la `idempotencyKey`. */
export interface PostRequestOptions extends RequestOptions {
  /**
   * Una clave por operación (por ejemplo, un UUID v4 guardado con el pedido): reintentar con la
   * misma nunca la ejecuta dos veces. Si no la pasás, el SDK genera una para esa llamada.
   */
  idempotencyKey?: string;
}

/** Las de `transfers.create`: la `idempotencyKey` es obligatoria. */
export interface TransferCreateOptions extends RequestOptions {
  /** Un UUID v4 que guardás con la operación **antes** de llamar y reusás en cada reintento. */
  idempotencyKey: string;
}

/** Las de `connect.payouts.create`: la `idempotencyKey` es obligatoria. */
export interface ConnectPayoutCreateOptions extends RequestOptions {
  /** Un UUID v4 que guardás con el payout **antes** de llamar y reusás en cada reintento. */
  idempotencyKey: string;
}

const KEYS = ["apiKey", "timeout", "maxNetworkRetries", "idempotencyKey"];
const SNAKE_CASE: Record<string, string> = {
  api_key: "apiKey",
  max_network_retries: "maxNetworkRetries",
  idempotency_key: "idempotencyKey",
};

/** Las opciones que vinieron (sin las `undefined`/`null`). Los valores los valida el requestor. */
export function validateOptions(options: unknown): Record<string, unknown> {
  if (options === undefined || options === null) return {};
  if (!isPlainObject(options)) {
    throw new TypeError(
      `options tiene que ser un objeto, como { timeout: 90_000 }, no ${typeName(options)}.`,
    );
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) {
    if (!KEYS.includes(key)) {
      const hint = SNAKE_CASE[key] ? ` (¿quisiste decir ${SNAKE_CASE[key]}?)` : "";
      throw new TypeError(
        `options no acepta "${key}"${hint}: las opciones son apiKey, timeout, maxNetworkRetries ` +
          "e idempotencyKey (solo en los POST).",
      );
    }
    if (value !== undefined && value !== null) result[key] = value;
  }
  return result;
}
