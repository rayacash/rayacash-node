// RayaObject: un objeto de la API, con sus campos como propiedades.
//
// Sus propiedades propias son exactamente el JSON que mandó la API (montos number, fechas en
// string ISO), así que `JSON.stringify(obj)` y `{ ...obj }` dan ese JSON. Los campos que el SDK
// todavía no conoce también quedan: la API puede sumar campos y tu código tiene que ignorarlos.
// La respuesta HTTP y el cliente del que vino el objeto van aparte (en un WeakMap), fuera de los
// datos.

import { isPlainObject } from "./encoding.ts";
import { defaultRequestor, getObjectClass } from "./registry.ts";
import type { APIRequestor } from "./requestor.ts";
import type { RayaResponse } from "./response.ts";

interface Meta {
  requestor: APIRequestor | null;
  lastResponse: RayaResponse | null;
}

const META = new WeakMap<object, Meta>();

/** Una clase de objeto de la API (`Payment`, `Transfer`…). */
export interface RayaObjectClass<T extends RayaObject = RayaObject> {
  new (): T;
  readonly OBJECT_NAME: string | null;
  readonly PLAIN_FIELDS: ReadonlySet<string>;
}

/** Un objeto de la API. Sus campos son los del JSON, con los valores crudos. */
export class RayaObject {
  /** El valor de `object` que identifica a la clase (`"payment"`, `"transfer"`…). */
  static readonly OBJECT_NAME: string | null = null;
  /** Campos que quedan como objeto plano: sus claves son tuyas (`metadata`). */
  static readonly PLAIN_FIELDS: ReadonlySet<string> = new Set();

  [field: string]: unknown;

  /**
   * Arma el objeto (y sus sub-objetos) desde el JSON de la API, sin hacer ninguna request. Sirve
   * para tus tests: `Payment.constructFrom({ object: "payment", id: "…", status: "succeeded" })`.
   */
  static constructFrom<T extends RayaObject>(
    this: RayaObjectClass<T>,
    values: Record<string, unknown>,
  ): T {
    if (!isPlainObject(values)) throw new TypeError("constructFrom necesita un objeto JSON.");
    // biome-ignore lint/complexity/noThisInStatic: `this` es la subclase (Payment.constructFrom arma un Payment).
    return construct(this, values, null, null);
  }

  /** La respuesta HTTP que trajo este objeto (`requestId`, headers…). */
  get lastResponse(): RayaResponse | null {
    return META.get(this)?.lastResponse ?? null;
  }

  /** Un objeto plano (recursivo), sin las clases del SDK. Es lo que usa `JSON.stringify`. */
  toJSON(): Record<string, unknown> {
    return toPlain(this) as Record<string, unknown>;
  }
}

function define(target: object, key: string, value: unknown): void {
  // defineProperty y no `target[key] =`: una clave "__proto__" del JSON queda como dato.
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

export function construct<T extends RayaObject>(
  cls: RayaObjectClass<T>,
  values: Record<string, unknown>,
  requestor: APIRequestor | null,
  lastResponse: RayaResponse | null,
): T {
  const obj = new cls();
  META.set(obj, { requestor, lastResponse });
  for (const [key, value] of Object.entries(values)) {
    define(obj, key, cls.PLAIN_FIELDS.has(key) ? toPlain(value) : convertValue(value, requestor));
  }
  return obj;
}

function classFor(objectName: unknown): RayaObjectClass | undefined {
  return typeof objectName === "string" ? getObjectClass(objectName) : undefined;
}

/**
 * Convierte un valor anidado: los objetos con `object` pasan a su clase (o a RayaObject si el SDK
 * no la conoce) y el resto queda como objeto plano, con sus valores convertidos.
 */
export function convertValue(value: unknown, requestor: APIRequestor | null = null): unknown {
  if (Array.isArray(value)) return value.map((item: unknown) => convertValue(item, requestor));
  if (!isPlainObject(value)) return value;
  if (typeof value.object === "string") {
    return construct(classFor(value.object) ?? RayaObject, value, requestor, null);
  }
  const plain: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value))
    define(plain, key, convertValue(item, requestor));
  return plain;
}

/** El objeto de una respuesta: la clase sale de `object`; si no, de lo que esperaba el método. */
export function hydrate(
  values: Record<string, unknown>,
  requestor: APIRequestor | null,
  expected: string | undefined,
  lastResponse: RayaResponse | null,
): RayaObject {
  const cls = classFor(values.object) ?? classFor(expected) ?? RayaObject;
  return construct(cls, values, requestor, lastResponse);
}

/** El requestor del cliente del que vino el objeto (`null` si se armó a mano). */
export function boundRequestor(obj: RayaObject): APIRequestor | null {
  return META.get(obj)?.requestor ?? null;
}

/** El requestor del objeto: el del cliente del que vino o, si no, el del estilo global. */
export function resolveRequestor(obj: RayaObject): APIRequestor {
  return boundRequestor(obj) ?? defaultRequestor();
}

export function toPlain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toPlain);
  if (value instanceof RayaObject || isPlainObject(value)) {
    const plain: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) define(plain, key, toPlain(item));
    return plain;
  }
  return value;
}
