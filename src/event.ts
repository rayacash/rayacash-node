import type { ConnectOrder } from "./connectOrder.ts";
import type { Payment } from "./payment.ts";
import { RayaObject } from "./rayaObject.ts";
import { registerObjectClass } from "./registry.ts";
import type { Transfer } from "./transfer.ts";

/**
 * Los tipos de evento que existen hoy. Pueden sumarse otros: tu código tiene que ignorarlos.
 *
 * Los `checkout.*` son los nombres de la 1.1.0 (deprecados): la API ya no los emite, ahora son
 * `connect.order.*`. Siguen en la unión hasta la 2.0.0 solo para que el código de la 1.1.0
 * compile: compará `event.type` con los nuevos.
 */
export type EventType =
  | "transfer.received"
  | "transfer.sent"
  | "transfer.failed"
  | "payment.created"
  | "payment.succeeded"
  | "payment.failed"
  | "payment.refunded"
  | "connect.order.created"
  | "connect.order.succeeded"
  | "connect.order.failed"
  | "connect.order.refunded"
  | "webhook.test"
  // Deprecados: los de la 1.1.0, que la API ya no emite.
  | "checkout.created"
  | "checkout.succeeded"
  | "checkout.failed"
  | "checkout.refunded";

/**
 * Un evento de webhook. Armalo con `Webhook.constructEvent(…)`.
 *
 * `event.data.object` es el `Transfer`, el `Payment` o el `ConnectOrder` tal como estaba cuando
 * ocurrió el evento. Los `connect.order.*` le llegan al dueño de la app: el comercio conectado
 * recibe los `payment.*` de ese mismo cobro. `webhook.test` (el botón «Enviar evento de prueba»)
 * trae `{ object: "test", … }`: respondé 2xx e ignoralo.
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
    object: Transfer | Payment | ConnectOrder | RayaObject;
  }
}

registerObjectClass("event", Event);
