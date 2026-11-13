// Logging (RAYA_LOG), User-Agent, appInfo y enmascarado de la clave.

import { config } from "./config.ts";
import { isPlainObject, strip, typeName } from "./encoding.ts";
import { VERSION } from "./version.ts";

/** Identifica tu integración o plugin en el User-Agent (lo ves en Developers › Logs). */
export interface AppInfo {
  name: string;
  version?: string;
  url?: string;
}

// RAYA_LOG se lee una vez, al cargar. config.log lo pisa en runtime.
export const logSettings: { env: string | null } = { env: process.env.RAYA_LOG ?? null };

/** Para `util.inspect` (console.log) sin importar node:util. */
export const INSPECT = Symbol.for("nodejs.util.inspect.custom");

function consoleLevel(): "debug" | "info" | null {
  const level = config.log || logSettings.env;
  return level === "debug" || level === "info" ? level : null;
}

// Un valor va entre comillas si está vacío o tiene espacios, =, comillas, barras o caracteres de
// control, y adentro se escapan las comillas, las barras y los de control: así, un valor nunca
// corta la línea ni inventa otra. Las líneas salen iguales que en Python y PHP.
// biome-ignore lint/suspicious/noControlCharactersInRegex: los caracteres de control se escapan.
const NEEDS_QUOTES = /[ ="\\\x00-\x1f\x7f]/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: los caracteres de control se escapan.
const TO_ESCAPE = /["\\\x00-\x1f\x7f]/g;
const ESCAPES: Record<string, string> = {
  "\\": "\\\\",
  '"': '\\"',
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
};

function logfmt(props: Record<string, unknown>): string {
  return Object.entries(props)
    .map(([key, value]) => {
      let text = String(value);
      if (!text || NEEDS_QUOTES.test(text)) {
        const escaped = text.replace(
          TO_ESCAPE,
          (char) => ESCAPES[char] ?? `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
        );
        text = `"${escaped}"`;
      }
      return `${key}=${text}`;
    })
    .join(" ");
}

/**
 * `value.toFixed(digits)` con los empates exactos al par, como `f"{value:.2f}"` en Python y
 * `sprintf("%.2F")` en PHP: así las líneas de log salen iguales. toFixed los sube (0.625 da "0.63";
 * Python y PHP, "0.62"). Para los números de los logs, que nunca son negativos.
 */
export function formatFixed(value: number, digits: number): string {
  const text = value.toFixed(digits);
  // Un empate exacto: value · 2^(digits + 1) es un entero impar (multiplicar por 2 no redondea).
  // toFixed eligió el de arriba; si su última cifra es impar, el par es el de abajo, sin acarreo.
  const scaled = value * 2 ** (digits + 1);
  const last = Number(text.slice(-1));
  if (Number.isInteger(scaled) && scaled % 2 === 1 && last % 2 === 1) {
    return `${text.slice(0, -1)}${last - 1}`;
  }
  return text;
}

export function logDebug(message: string, params: Record<string, unknown>): void {
  if (consoleLevel() === "debug") process.stderr.write(`${logfmt({ message, ...params })}\n`);
}

export function logInfo(message: string, params: Record<string, unknown>): void {
  if (consoleLevel() !== null) process.stderr.write(`${logfmt({ message, ...params })}\n`);
}

function isHeaderSafe(text: string): boolean {
  return /^[\x20-\x7e]*$/.test(text);
}

export function validateAppInfo(info: unknown): AppInfo {
  if (!isPlainObject(info)) {
    throw new TypeError(
      `appInfo tiene que ser un objeto como { name: "mi-plugin", version: "1.2.0" }, no ${typeName(info)}.`,
    );
  }
  const unknown = Object.keys(info).filter((key) => !["name", "version", "url"].includes(key));
  if (unknown.length) {
    throw new RangeError(`appInfo no acepta "${unknown.sort()[0]}": usá name, version y url.`);
  }
  const name = info.name;
  if (typeof name !== "string" || !strip(name)) throw new RangeError("appInfo necesita un name.");
  const result: AppInfo = { name };
  for (const field of ["version", "url"] as const) {
    const value = info[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") throw new TypeError(`appInfo.${field} tiene que ser un string.`);
    result[field] = value;
  }
  for (const value of [result.name, result.version, result.url]) {
    if (value !== undefined && !isHeaderSafe(value)) {
      throw new RangeError(
        "appInfo solo admite caracteres ASCII visibles: va en el header User-Agent.",
      );
    }
  }
  return result;
}

export function formatAppInfo(info: AppInfo): string {
  let text = info.name;
  if (info.version) text += `/${info.version}`;
  if (info.url) text += ` (${info.url})`;
  return text;
}

export function userAgent(appInfo: AppInfo | null): string {
  let ua = `rayacash-node/${VERSION} Node/${process.versions.node}`;
  const undici = process.versions.undici;
  if (undici) ua += ` undici/${undici}`;
  if (appInfo) ua += ` ${formatAppInfo(appInfo)}`;
  return ua;
}

// Los prefijos que se conservan al enmascarar: la clave secreta y el access_token de una cuenta
// conectada, cada uno con su par de prueba de un sandbox (la clave secreta de prueba y el
// access_token de un usuario de prueba).
const KEY_PREFIXES = ["raya_sk_live_", "raya_sk_test_", "raya_at_live_", "raya_at_test_"];

/**
 * `raya_sk_live_…AbCd` (o `raya_sk_test_…AbCd`, `raya_at_live_…AbCd` o `raya_at_test_…AbCd`): para
 * inspect y logs. Nunca mostramos la clave ni el access_token enteros.
 */
export function maskKey(key: string | null): string | null {
  if (!key) return null;
  const prefix = KEY_PREFIXES.find((candidate) => key.startsWith(candidate)) ?? "";
  if (key.length <= prefix.length + 8) return `${prefix}…`;
  return `${prefix}…${key.slice(-4)}`;
}
