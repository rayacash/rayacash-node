import type { ConnectOrder } from "./connectOrder.ts";
import type { IdentityVerification } from "./identityVerification.ts";
import type { Invoice } from "./invoice.ts";
import type { Payment } from "./payment.ts";
import type { PspCustomer } from "./pspCustomer.ts";
import type { PspDocumentRequest } from "./pspDocumentRequest.ts";
import type { PspTransfer } from "./pspTransfer.ts";
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
  | "identity.verification.verified"
  | "identity.verification.declined"
  | "identity.verification.expired"
  | "identity.verification.canceled"
  | "invoice.issued"
  | "invoice.rejected"
  | "invoice.failed"
  | "psp.customer.activated"
  | "psp.customer.updated"
  | "psp.customer.failed"
  | "psp.customer.rejected"
  | "psp.customer.blocked"
  | "psp.customer.unblocked"
  | "psp.customer.closed"
  | "psp.transfer.received"
  | "psp.transfer.sent"
  | "psp.transfer.failed"
  | "psp.document_request.created"
  | "psp.document_request.closed"
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
 * recibe los `payment.*` de ese mismo cobro. Los `identity.verification.*` traen la
 * `IdentityVerification`, siempre con `person` en `null`: pedí los datos de la persona con
 * `client.identity.verifications.retrieve(id)`. Los `invoice.*` (Facturador) traen la `Invoice`.
 * Los `psp.*` (Raya PSP) traen el `PspCustomer`, la `PspTransfer` o el `PspDocumentRequest`.
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
  /**
   * `true` en tu cuenta real y `false` en un sandbox. Un evento emitido antes de que la API sumara
   * este campo no lo trae si se reenvía (queda `undefined`): tratalo como `true`.
   */
  declare livemode?: boolean;
  declare data: Event.Data;
}

export declare namespace Event {
  interface Data {
    object:
      | Transfer
      | Payment
      | ConnectOrder
      | IdentityVerification
      | Invoice
      | PspCustomer
      | PspTransfer
      | PspDocumentRequest
      | RayaObject;
  }
}

registerObjectClass("event", Event);
