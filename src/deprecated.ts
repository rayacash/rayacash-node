// Los nombres de la 1.1.0, de antes de Raya Connect: alias deprecados de los de ahora, que se van
// en la 2.0.0. Son los mismos objetos (`Checkout === ConnectOrder`), así que usan las rutas nuevas
// (`/v1/connect/orders`) y `instanceof` anda con los dos nombres. Nunca van en docs ni ejemplos.
//
// Fuera de acá quedan `client.checkout` (client.ts), los `checkout.*` de `EventType` (event.ts) y
// el registro de `object: "checkout"` (connectOrder.ts).

import { ConnectOrder, type ConnectOrderStatus } from "./connectOrder.ts";
import {
  type ConnectOrderBackUrlsParams,
  type ConnectOrderCreateParams,
  type ConnectOrderItemParams,
  ConnectOrderService,
  ConnectService,
} from "./connectService.ts";

const warned = new Set<string>();

/**
 * Un `DeprecationWarning` por código y por proceso, con `process.emitWarning`: Node lo muestra en
 * stderr, `--no-deprecation` lo calla y `--throw-deprecation` lo lanza. Donde no hay `process`
 * (edge, navegadores) no hace nada.
 */
export function warnDeprecated(code: string, message: string): void {
  if (warned.has(code)) return;
  warned.add(code);
  // globalThis.process y no process suelto: sin process, nombrarlo es un ReferenceError.
  const proc = globalThis.process as { emitWarning?: unknown } | undefined;
  if (proc && typeof proc.emitWarning === "function") {
    proc.emitWarning(message, { type: "DeprecationWarning", code });
  }
}

/** Olvida qué avisos ya salieron (los tests lo usan entre caso y caso). */
export function resetDeprecationWarnings(): void {
  warned.clear();
}

/** @deprecated Desde la 1.2.0 se llama `ConnectOrder`: es la misma clase. Se va en la 2.0.0. */
export const Checkout = ConnectOrder;
/** @deprecated Desde la 1.2.0 se llama `ConnectOrder`: es el mismo tipo. Se va en la 2.0.0. */
export type Checkout = ConnectOrder;
/** @deprecated Desde la 1.2.0 son los de `ConnectOrder` (`ConnectOrder.Item`…). Se van en la 2.0.0. */
export declare namespace Checkout {
  /** @deprecated Usá `ConnectOrder.Item` (es el mismo tipo). Se va en la 2.0.0. */
  type Item = ConnectOrder.Item;
  /** @deprecated Usá `ConnectOrder.BankTransfer` (es el mismo tipo). Se va en la 2.0.0. */
  type BankTransfer = ConnectOrder.BankTransfer;
  /** @deprecated Usá `ConnectOrder.BackUrls` (es el mismo tipo). Se va en la 2.0.0. */
  type BackUrls = ConnectOrder.BackUrls;
  /** @deprecated Usá `ConnectOrder.Payer` (es el mismo tipo). Se va en la 2.0.0. */
  type Payer = ConnectOrder.Payer;
}

/** @deprecated Usá `ConnectOrderStatus` (es el mismo tipo). Se va en la 2.0.0. */
export type CheckoutStatus = ConnectOrderStatus;
/** @deprecated Usá `ConnectOrderCreateParams` (es el mismo tipo). Se va en la 2.0.0. */
export type CheckoutCreateParams = ConnectOrderCreateParams;
/** @deprecated Usá `ConnectOrderItemParams` (es el mismo tipo). Se va en la 2.0.0. */
export type CheckoutItemParams = ConnectOrderItemParams;
/** @deprecated Usá `ConnectOrderBackUrlsParams` (es el mismo tipo). Se va en la 2.0.0. */
export type CheckoutBackUrlsParams = ConnectOrderBackUrlsParams;

// Los servicios: index.ts los exporta solo como tipos, como la 1.1.0. Las constantes son para que
// `typeof CheckoutService` siga compilando, como con la clase de la 1.1.0.
/** @deprecated Usá `ConnectService` (`client.checkout` es `client.connect`). Se va en la 2.0.0. */
export const CheckoutService = ConnectService;
/** @deprecated Usá `ConnectService` (`client.checkout` es `client.connect`). Se va en la 2.0.0. */
export type CheckoutService = ConnectService;
/** @deprecated Usá `ConnectOrderService` (es la misma clase). Se va en la 2.0.0. */
export const CheckoutOrdersService = ConnectOrderService;
/** @deprecated Usá `ConnectOrderService` (es la misma clase). Se va en la 2.0.0. */
export type CheckoutOrdersService = ConnectOrderService;
