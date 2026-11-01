// Logging (RAYA_LOG), User-Agent, appInfo y enmascarado de la clave.

import { config } from "./config.ts";
import { isPlainObject, typeName } from "./encoding.ts";
import { VERSION } from "./version.ts";

/** Identifica tu integración o plugin en el User-Agent (lo ves en Developers › Logs). */
export interface AppInfo {
  name: string;
  version?: string;
  url?: string;
}

// Como STRIPE_LOG: RAYA_LOG se lee una vez, al cargar. config.log lo pisa en runtime.
export const logSettings: { env: string | null } = { env: process.env.RAYA_LOG ?? null };

/** Para `util.inspect` (console.log) sin importar node:util. */
export const INSPECT = Symbol.for("nodejs.util.inspect.custom");

function consoleLevel(): "debug" | "info" | null {
  const level = config.log || logSettings.env;
  return level === "debug" || level === "info" ? level : null;
}

function logfmt(props: Record<string, unknown>): string {
  return Object.entries(props)
    .map(([key, value]) => {
      let text = String(value);
      if (!text || /[ ="\\]/.test(text)) {
        text = `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      }
      return `${key}=${text}`;
    })
    .join(" ");
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
  if (typeof name !== "string" || !name.trim()) throw new RangeError("appInfo necesita un name.");
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

/** `raya_sk_live_…AbCd`: para inspect y logs. Nunca mostramos la clave entera. */
export function maskKey(key: string | null): string | null {
  if (!key) return null;
  const prefix = key.startsWith("raya_sk_live_") ? "raya_sk_live_" : "";
  if (key.length <= prefix.length + 8) return `${prefix}…`;
  return `${prefix}…${key.slice(-4)}`;
}
