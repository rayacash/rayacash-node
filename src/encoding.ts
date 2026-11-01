// Cómo viajan los parámetros: JSON con montos exactos, query de las listas e ids en la ruta.
//
// La API parsea los montos como números exactos y rechaza los que tienen más de 2 decimales
// (PARAMETER_INVALID). Por eso un monto viaja como número JSON canónico, nunca como string, y el
// SDK no redondea nunca: si un number trae ruido (0.1 + 0.2), lo responde el servidor.

/**
 * Un monto en pesos: `1500`, `1500.5`, `"1500.50"`, `1500n` o un decimal exacto, como el `Decimal`
 * de decimal.js o de Prisma.
 */
export type Amount = number | string | bigint | DecimalLike;

/**
 * Un decimal exacto de una librería (decimal.js, `Prisma.Decimal`, big.js, bignumber.js):
 * `toFixed()` sin argumentos da su valor completo, sin redondear.
 */
export interface DecimalLike {
  toFixed(): string;
}

/** Un número JSON ya canónico: su texto va tal cual en el body. */
export class RawNumber {
  readonly text: string;

  constructor(text: string) {
    this.text = text;
  }
}

const IDEMPOTENCY_KEY = /^[\x21-\x7e]{1,255}$/;
const DECIMAL = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;
const NON_FINITE = /^[+-]?(?:inf|infinity|s?nan)$/i;
// Ningún monto real se acerca: corta antes de armar un string gigante con "1e999999".
const MAX_DIGITS = 1000;

/** Un objeto literal (`{…}` o `JSON.parse`), de este realm o de otro. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

/** El tipo de un valor, para los mensajes de error. */
export function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "un array";
  if (typeof value === "object") {
    const name: unknown = (value as { constructor?: { name?: unknown } }).constructor?.name;
    return typeof name === "string" && name && name !== "Object" ? name : "un objeto";
  }
  return typeof value;
}

/** "a", "a y b", "a, b y c". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

function isDecimalLike(value: unknown): value is DecimalLike {
  return (
    typeof value === "object" &&
    value !== null &&
    !(value instanceof Number) &&
    typeof (value as { toFixed?: unknown }).toFixed === "function"
  );
}

/** El decimal en notación normal y sin ceros de más (`"1.5e3"` → `"1500"`); `null` si no es un número. */
function canonicalDecimal(text: string, name: string): string | null {
  const match = DECIMAL.exec(text);
  if (!match) return null;
  const [, sign, intPart = "", fracPart = "", expPart = "0"] = match;
  if (!intPart && !fracPart) return null;
  const exponent = Number(expPart) - fracPart.length;
  const significant = (intPart + fracPart).replace(/^0+/, "");
  if (!significant) return sign === "-" ? "-0" : "0";
  const digits = significant.replace(/0+$/, "");
  const shift = exponent + significant.length - digits.length;
  const point = digits.length + shift;
  if (Math.max(point, digits.length - point) > MAX_DIGITS) {
    throw new RangeError(`${name} tiene demasiados dígitos.`);
  }
  let plain: string;
  if (shift >= 0) {
    plain = digits + "0".repeat(shift);
  } else if (point > 0) {
    plain = `${digits.slice(0, point)}.${digits.slice(point)}`;
  } else {
    plain = `0.${"0".repeat(-point)}${digits}`;
  }
  return sign === "-" ? `-${plain}` : plain;
}

function decimalFromText(text: string, original: unknown, name: string): RawNumber {
  const canonical = canonicalDecimal(text, name);
  if (canonical !== null) return new RawNumber(canonical);
  if (NON_FINITE.test(text)) {
    throw new RangeError(`${name} tiene que ser un número finito, no ${String(original)}.`);
  }
  throw new RangeError(
    `${name} ${JSON.stringify(String(original))} no es un número: usá punto decimal y nada más, como "1500.50".`,
  );
}

/** El monto como número JSON exacto, sin redondear. El rango lo valida la API. */
export function canonicalAmount(value: unknown, name = "amount"): RawNumber {
  if (typeof value === "boolean") {
    throw new TypeError(
      `${name} no puede ser un boolean: mandá un número en pesos, como 1500 o 1500.5.`,
    );
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RangeError(`${name} tiene que ser un número finito, no ${value}.`);
    }
    // String da el decimal más corto que representa el number: 1500.1 → "1500.1".
    return decimalFromText(String(value), value, name);
  }
  if (typeof value === "bigint") return new RawNumber(value.toString());
  if (typeof value === "string") return decimalFromText(value.trim(), value, name);
  if (isDecimalLike(value)) {
    const text: unknown = value.toFixed();
    if (typeof text === "string") return decimalFromText(text.trim(), text, name);
  }
  throw new TypeError(
    `${name} tiene que ser un número en pesos (number, string decimal, bigint o un decimal como el ` +
      `Decimal de decimal.js), no ${typeName(value)}.`,
  );
}

function quote(text: string): string {
  // ASCII puro, como json.dumps de Python: el body no depende del charset.
  return JSON.stringify(text).replace(
    /[\u007f-￿]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/** JSON compacto en ASCII, con los montos exactos como números. */
export function dumps(value: unknown): string {
  const out: string[] = [];
  encode(value, out);
  return out.join("");
}

function encode(value: unknown, out: string[]): void {
  if (value === null) {
    out.push("null");
  } else if (typeof value === "boolean") {
    out.push(value ? "true" : "false");
  } else if (typeof value === "string") {
    out.push(quote(value));
  } else if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError(`No se puede mandar ${value} en JSON.`);
    out.push(String(value));
  } else if (typeof value === "bigint") {
    out.push(value.toString());
  } else if (value instanceof RawNumber) {
    out.push(value.text);
  } else if (Array.isArray(value)) {
    out.push("[");
    value.forEach((item: unknown, index) => {
      if (index) out.push(",");
      encode(item === undefined ? null : item, out);
    });
    out.push("]");
  } else if (isPlainObject(value)) {
    out.push("{");
    let first = true;
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      if (!first) out.push(",");
      first = false;
      out.push(quote(key), ":");
      encode(item, out);
    }
    out.push("}");
  } else if (isDecimalLike(value)) {
    encode(canonicalAmount(value, "Un decimal"), out);
  } else {
    throw new TypeError(`No se puede mandar ${typeName(value)} en JSON.`);
  }
}

/** El body de un POST: solo los parámetros que vinieron (la API rechaza los desconocidos). */
export function encodeBody(params: Record<string, unknown>): string {
  const present = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null,
  );
  return dumps(Object.fromEntries(present));
}

/** La query de una lista: solo los filtros que vinieron. */
export function encodeQuery(params: Record<string, unknown>): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "boolean") throw new TypeError(`${name} no puede ser un boolean.`);
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new RangeError(`${name} es una fecha inválida.`);
      query[name] = value.toISOString();
    } else if (typeof value === "string" || typeof value === "bigint") {
      query[name] = String(value);
    } else if (typeof value === "number") {
      if (!Number.isInteger(value))
        throw new TypeError(`${name} no acepta un número con decimales.`);
      query[name] = String(value);
    } else {
      throw new TypeError(`${name} no acepta ${typeName(value)}.`);
    }
  }
  return query;
}

/** Un id para la ruta, codificado: nunca deja una barra final ni un segmento vacío. */
export function pathId(name: string, value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError(`${name} tiene que ser un string, no ${typeName(value)}.`);
  }
  if (!value.trim()) throw new RangeError(`${name} no puede estar vacío.`);
  // Como quote(safe="") de Python: solo quedan sin codificar las letras, los dígitos y -_.~
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function validateIdempotencyKey(value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError(
      "idempotencyKey tiene que ser un string: generá un UUID v4 con crypto.randomUUID() y " +
        "guardalo junto a la operación antes de llamar.",
    );
  }
  if (!IDEMPOTENCY_KEY.test(value)) {
    throw new RangeError(
      "idempotencyKey tiene que tener de 1 a 255 caracteres ASCII visibles, sin espacios " +
        "(por ejemplo, un UUID v4).",
    );
  }
  return value;
}

/**
 * Los parámetros de un método como objeto plano. Una clave desconocida falla acá: la API la
 * rechazaría igual (PARAMETER_UNKNOWN), pero así no sale nada.
 */
export function checkParams(
  method: string,
  params: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (params === undefined || params === null) return {};
  if (!isPlainObject(params)) {
    throw new TypeError(`${method} recibe un objeto con sus parámetros (${listNames(allowed)}).`);
  }
  for (const key of Object.keys(params)) {
    if (allowed.includes(key)) continue;
    if (key === "idempotencyKey" || key === "idempotency_key") {
      throw new TypeError(
        `${method} no acepta ${key} entre los parámetros: la idempotencyKey va en las opciones, ` +
          `el último argumento ({ idempotencyKey }).`,
      );
    }
    throw new TypeError(`${method} no acepta "${key}": los parámetros son ${listNames(allowed)}.`);
  }
  return params;
}
