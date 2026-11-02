// La verificación de la firma de los webhooks (header `Raya-Signature`).
//
// `Raya-Signature: t=<segundos unix>,v1=<firma>[,v1=<firma>]`, con la firma
// `HMAC-SHA256(secreto, `${t}.` + body crudo)` en hexadecimal. El secreto (`whsec_…`) se usa entero,
// como texto UTF-8. Mientras rotás el secreto llegan dos `v1`: alcanza con que coincida una. La
// firma se calcula sobre los bytes tal como llegaron: si tu framework ya parseó el JSON, volver a
// serializarlo cambia el body y la firma no coincide.

import { createHmac, timingSafeEqual } from "node:crypto";

import { isPlainObject, strip, typeName } from "./encoding.ts";
import { SignatureVerificationError } from "./errors.ts";
import { Event } from "./event.ts";
import { construct } from "./rayaObject.ts";
import type { APIRequestor } from "./requestor.ts";
import { timing } from "./retry.ts";

/** Diferencia máxima (en segundos) entre `t` y tu reloj. */
export const DEFAULT_TOLERANCE = 300;

/** El body crudo del webhook, tal como llegó. */
export type Payload = string | Uint8Array | ArrayBuffer;

// UTF-8 estricto, como Python y PHP: Buffer.toString leería lo inválido como U+FFFD. Con
// ignoreBOM, un BOM queda en el texto y JSON.parse lo rechaza, como siempre.
const STRICT_UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const TIMESTAMP = /^[0-9]{1,20}$/;
const SIGNATURE = /^[0-9a-fA-F]{64}$/;

function payloadBytes(payload: unknown): Buffer {
  if (typeof payload === "string") return Buffer.from(payload, "utf8");
  if (ArrayBuffer.isView(payload)) {
    return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
  }
  if (payload instanceof ArrayBuffer) return Buffer.from(payload);
  throw new TypeError(
    "payload tiene que ser el body crudo (string o Buffer), no ya parseado: en Express, " +
      'express.raw({ type: "application/json" }); en Next.js, await request.text(); en Fastify, ' +
      `el rawBody. Llegó ${typeName(payload)}.`,
  );
}

function checkSecret(secret: unknown): string {
  if (typeof secret !== "string") {
    throw new TypeError("secret tiene que ser el secreto del destino (whsec_…), un string.");
  }
  if (!strip(secret)) {
    throw new RangeError("Falta el secreto del webhook (whsec_…): está en Developers › Webhooks.");
  }
  return secret;
}

function checkTolerance(tolerance: unknown): number | null {
  if (tolerance === null || tolerance === undefined) return null;
  if (typeof tolerance !== "number") {
    throw new TypeError("tolerance tiene que ser un número de segundos o null.");
  }
  if (Number.isNaN(tolerance) || tolerance < 0) {
    throw new RangeError("tolerance tiene que ser un número de segundos, 0 o más.");
  }
  return tolerance;
}

function checkTimestamp(timestamp: unknown): number | bigint {
  if (typeof timestamp === "bigint" && timestamp >= 0n) return timestamp;
  if (typeof timestamp === "number" && Number.isSafeInteger(timestamp) && timestamp >= 0) {
    return timestamp;
  }
  throw new RangeError("timestamp tiene que ser un entero de segundos unix.");
}

function parseHeader(header: string): { timestamp: bigint | null; signatures: string[] } {
  let timestamp: bigint | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const trimmed = strip(part);
    const sep = trimmed.indexOf("=");
    if (sep < 0) continue;
    const key = strip(trimmed.slice(0, sep));
    const value = strip(trimmed.slice(sep + 1));
    if (key === "t" && timestamp === null && TIMESTAMP.test(value)) {
      // BigInt, como el int() de Python: exacto y sin los ceros de adelante.
      timestamp = BigInt(value);
    } else if (key === WebhookSignature.EXPECTED_SCHEME && SIGNATURE.test(value)) {
      signatures.push(value.toLowerCase());
    }
  }
  return { timestamp, signatures };
}

// biome-ignore lint/complexity/noStaticOnlyClass: la API es la de stripe (Webhook.constructEvent).
export class WebhookSignature {
  static readonly EXPECTED_SCHEME = "v1";

  /** La firma `v1` (hex) de un body con un `t` dado. */
  static computeSignature(payload: Payload, secret: string, timestamp: number | bigint): string {
    const bytes = payloadBytes(payload);
    const key = Buffer.from(checkSecret(secret), "utf8");
    return createHmac("sha256", key)
      .update(`${checkTimestamp(timestamp)}.`, "ascii")
      .update(bytes)
      .digest("hex");
  }

  /**
   * Devuelve `true` si la firma es válida; si no, lanza `SignatureVerificationError`.
   *
   * @param payload El body crudo, sin parsear.
   * @param header El valor del header `Raya-Signature`.
   * @param secret El secreto del destino (`whsec_…`).
   * @param tolerance Segundos de diferencia aceptados entre `t` y tu reloj, para los dos lados.
   *   `null` (o `0`) desactiva el chequeo: solo para probar con firmas viejas.
   */
  static verifyHeader(
    payload: Payload,
    header: string | null | undefined,
    secret: string,
    tolerance: number | null = DEFAULT_TOLERANCE,
  ): true {
    const raw = payloadBytes(payload);
    checkSecret(secret);
    const maxSkew = checkTolerance(tolerance);
    const body = raw.toString("utf8");

    if (header !== null && header !== undefined && typeof header !== "string") {
      throw new TypeError("header tiene que ser el valor del header Raya-Signature, un string.");
    }
    const sigHeader = header ?? null;
    if (sigHeader === null || !strip(sigHeader)) {
      throw new SignatureVerificationError("Falta el header Raya-Signature.", sigHeader, body);
    }
    const { timestamp, signatures } = parseHeader(sigHeader);
    if (timestamp === null) {
      throw new SignatureVerificationError(
        "No pudimos leer t (el momento del envío) del header Raya-Signature.",
        sigHeader,
        body,
      );
    }
    if (!signatures.length) {
      throw new SignatureVerificationError(
        "El header Raya-Signature no trae firmas v1.",
        sigHeader,
        body,
      );
    }

    const expected = Buffer.from(
      WebhookSignature.computeSignature(raw, secret, timestamp),
      "ascii",
    );
    let matched = false;
    for (const signature of signatures) {
      // Las dos tienen 64 caracteres hex: timingSafeEqual compara en tiempo constante.
      if (timingSafeEqual(expected, Buffer.from(signature, "ascii"))) matched = true;
    }
    if (!matched) {
      throw new SignatureVerificationError(
        "La firma no coincide: revisá el secreto (whsec_…) y que uses el body crudo, sin parsear.",
        sigHeader,
        body,
      );
    }
    if (maxSkew && Math.abs(timing.now() - Number(timestamp)) > maxSkew) {
      throw new SignatureVerificationError(
        `El momento de la firma (t=${timestamp}) está a más de ${maxSkew} s de tu reloj. Si es un ` +
          "reintento, se firma con un t nuevo: revisá la hora del servidor.",
        sigHeader,
        body,
      );
    }
    return true;
  }

  /** Un header `Raya-Signature` válido, para tus propios tests. */
  static generateHeader(
    payload: Payload,
    secret: string,
    options: { timestamp?: number } = {},
  ): string {
    if (!isPlainObject(options)) {
      throw new TypeError("generateHeader recibe { timestamp } como tercer argumento.");
    }
    const given: unknown = options.timestamp;
    if (given !== undefined && typeof given !== "number") {
      throw new RangeError("timestamp tiene que ser un entero de segundos unix.");
    }
    const timestamp = given === undefined ? Math.floor(timing.now()) : checkTimestamp(given);
    const signature = WebhookSignature.computeSignature(payload, secret, timestamp);
    return `t=${timestamp},${WebhookSignature.EXPECTED_SCHEME}=${signature}`;
  }
}

export function constructEvent(
  payload: Payload,
  header: string | null | undefined,
  secret: string,
  tolerance: number | null = DEFAULT_TOLERANCE,
  requestor: APIRequestor | null = null,
): Event {
  WebhookSignature.verifyHeader(payload, header, secret, tolerance);
  let data: unknown;
  try {
    data = JSON.parse(STRICT_UTF8.decode(payloadBytes(payload)));
  } catch (cause) {
    throw new RangeError("El body del webhook no es un objeto JSON.", { cause });
  }
  if (!isPlainObject(data)) throw new RangeError("El body del webhook no es un objeto JSON.");
  try {
    return construct(Event, data, requestor, null);
  } catch (cause) {
    // Armar el evento convierte cada nivel con una llamada: uno muy anidado llena la pila
    // (RangeError). Es el mismo error que un JSON inválido, como en Python y PHP.
    if (!(cause instanceof RangeError)) throw cause;
    throw new RangeError("El body del webhook no es un objeto JSON.", { cause });
  }
}

// biome-ignore lint/complexity/noStaticOnlyClass: la API es la de stripe (Webhook.constructEvent).
export class Webhook {
  static readonly DEFAULT_TOLERANCE = DEFAULT_TOLERANCE;

  /**
   * Verifica la firma y devuelve el `Event`.
   *
   * Lanza `SignatureVerificationError` si la firma no es válida: respondé 400 y no lo proceses. El
   * mismo evento puede llegar más de una vez y desordenado: guardá los `event.id` que ya
   * procesaste.
   */
  static constructEvent(
    payload: Payload,
    header: string | null | undefined,
    secret: string,
    tolerance: number | null = DEFAULT_TOLERANCE,
  ): Event {
    return constructEvent(payload, header, secret, tolerance);
  }
}
