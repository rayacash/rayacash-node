// La respuesta HTTP detrás de cada objeto (`obj.lastResponse`).

import { INSPECT } from "./util.ts";

/** Status, headers y body crudos de la última respuesta de la API para un objeto. */
export class RayaResponse {
  readonly httpStatus: number;
  /** Los headers de la respuesta (`headers.get()` no distingue mayúsculas). */
  readonly headers: Headers;
  readonly body: string;
  /** El JSON ya parseado. */
  readonly data: unknown;
  /** El `Raya-Request-Id` (`req_…`). En un replay idempotente es uno nuevo. */
  readonly requestId: string | null;
  /** La Idempotency-Key que mandamos (solo en los POST). */
  readonly idempotencyKey: string | null;

  constructor(init: {
    httpStatus: number;
    headers: Headers;
    body: string;
    data: unknown;
    idempotencyKey: string | null;
  }) {
    this.httpStatus = init.httpStatus;
    this.headers = init.headers;
    this.body = init.body;
    this.data = init.data;
    this.requestId = init.headers.get("raya-request-id");
    this.idempotencyKey = init.idempotencyKey;
  }
}

// console.log muestra solo el status y el request id: el body puede traer nombres, CUIT y CBU.
Object.defineProperty(RayaResponse.prototype, INSPECT, {
  value(this: RayaResponse): string {
    return `RayaResponse { httpStatus: ${this.httpStatus}, requestId: ${JSON.stringify(this.requestId)} }`;
  },
});
