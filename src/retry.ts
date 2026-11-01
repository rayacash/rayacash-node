// Cuándo y cuánto esperar para reintentar. Funciones puras: el requestor las usa en su bucle.
//
// Política (api.md › «Qué hacer según la respuesta»):
//
// - Sin respuesta (corte, timeout): se reintenta. Los POST siempre llevan Idempotency-Key, así que
//   nunca se ejecutan dos veces.
// - 409 IDEMPOTENCY_KEY_IN_USE, 429, 408 y 5xx: se reintenta, esperando el Retry-After si viene.
//   Si pide más de MAX_RETRY_AFTER (un reembolso puede pedir 3600 s), no se reintenta: el error
//   sale con retryAfter para que lo reprogrames.
// - 503 API_UNAVAILABLE es un interruptor (mantenimiento): no se reintenta.
// - Cualquier otro 4xx: no se hizo nada; reintentar igual da lo mismo.

export const INITIAL_DELAY = 0.5;
export const MAX_DELAY = 8;
export const MAX_RETRY_AFTER = 60;

/** El reloj, las esperas y el jitter, en un objeto: los tests los reemplazan para no dormir. */
export const timing = {
  /** Espera `seconds` segundos. */
  sleep: (seconds: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, seconds * 1000);
    }),
  /** Un número en [0, 1). */
  jitter: (): number => Math.random(),
  /** Ahora, en segundos unix. */
  now: (): number => Date.now() / 1000,
  /** La señal que corta un intento a los `ms` milisegundos. */
  timeoutSignal: (ms: number): AbortSignal => AbortSignal.timeout(ms),
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// La fecha HTTP de RFC 9110 (IMF-fixdate), con el día de la semana opcional y sin zona = UTC, como
// email.utils.parsedate_to_datetime. Nunca Date.parse: acepta casi cualquier cosa ("1.5" es una fecha).
const HTTP_DATE =
  /^(?:[a-z]{3},\s*)?(\d{1,2})\s+([a-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?(?:\s+(gmt|utc|ut|z|[+-]\d{4}))?$/i;

function parseHttpDate(value: string): number | null {
  const match = HTTP_DATE.exec(value);
  if (!match) return null;
  const [, day, monthName, year, hour, minute, second = "0", zone = "gmt"] = match;
  const month = MONTHS.indexOf((monthName as string).toLowerCase());
  const parts = [Number(year), month, Number(day), Number(hour), Number(minute), Number(second)];
  const [y, mo, d, h, mi, s] = parts as [number, number, number, number, number, number];
  const time = Date.UTC(y, mo, d, h, mi, s);
  const date = new Date(time);
  if (
    month < 0 ||
    date.getUTCDate() !== d ||
    date.getUTCMonth() !== mo ||
    h > 23 ||
    mi > 59 ||
    s > 59
  ) {
    return null;
  }
  let offsetMinutes = 0;
  if (zone[0] === "+" || zone[0] === "-") {
    const sign = zone[0] === "-" ? -1 : 1;
    offsetMinutes = sign * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(3, 5)));
  }
  return (time - offsetMinutes * 60_000) / 1000;
}

/** Segundos del header Retry-After (también acepta la forma de fecha HTTP). */
export function parseRetryAfter(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const text = value.trim();
  if (!text) return null;
  if (/^[0-9]+$/.test(text)) return Number(text);
  const when = parseHttpDate(text);
  if (when === null) return null;
  return Math.max(0, when - timing.now());
}

/** Espera antes del reintento número `retryNumber` (1, 2, …): exponencial con jitter. */
export function backoffDelay(retryNumber: number): number {
  const base = Math.min(INITIAL_DELAY * 2 ** (retryNumber - 1), MAX_DELAY);
  return base / 2 + (base / 2) * timing.jitter();
}

export function retryDelay(retryNumber: number, retryAfter: number | null): number {
  const delay = backoffDelay(retryNumber);
  return retryAfter === null ? delay : Math.max(delay, retryAfter);
}

export function shouldRetryResponse(
  status: number,
  code: string | null,
  retryAfter: number | null,
): boolean {
  let retryable: boolean;
  if (status === 409) {
    retryable = code === "IDEMPOTENCY_KEY_IN_USE";
  } else if (status === 503 && code === "API_UNAVAILABLE") {
    retryable = false;
  } else {
    retryable = status === 408 || status === 429 || status >= 500;
  }
  if (retryable && retryAfter !== null && retryAfter > MAX_RETRY_AFTER) return false;
  return retryable;
}
