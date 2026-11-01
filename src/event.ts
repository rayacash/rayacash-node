import type { Payment } from "./payment.ts";
import { RayaObject } from "./rayaObject.ts";
import { registerObjectClass } from "./registry.ts";
import type { Transfer } from "./transfer.ts";

/** Los tipos de evento que existen hoy. Pueden sumarse otros: tu código tiene que ignorarlos. */
export type EventType =
  | "transfer.received"
  | "transfer.sent"
  | "transfer.failed"
  | "payment.created"
  | "payment.succeeded"
  | "payment.failed"
  | "payment.refunded"
  | "webhook.test";

/**
 * Un evento de webhook. Armalo con `Webhook.constructEvent(…)`.
 *
 * `event.data.object` es el `Transfer` o el `Payment` tal como estaba cuando ocurrió el evento.
 * `webhook.test` (el botón «Enviar evento de prueba») trae `{ object: "test", … }`: respondé 2xx e
 * ignoralo.
 */
export class Event extends RayaObject {
  static override readonly OBJECT_NAME = "event";

  /** `evt_…`: el mismo valor que el header `Raya-Event-Id`. Procesá cada uno una vez. */
  declare id: string;
  declare object: "event";
  declare type: EventType;
  /** Versión del formato del evento, por ahora `"2026-10-23"`. */
  declare api_version: string;
  /** Cuándo ocurrió (ISO 8601 en UTC). */
  declare created_at: string;
  declare data: Event.Data;
}

export declare namespace Event {
  interface Data {
    object: Transfer | Payment | RayaObject;
  }
}

registerObjectClass("event", Event);
