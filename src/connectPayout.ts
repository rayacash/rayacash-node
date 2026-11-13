import {
  type ConnectPayoutCreateParams,
  type ConnectPayoutListParams,
  ConnectPayoutService,
} from "./connectService.ts";
import type { ListObject } from "./listObject.ts";
import { RayaObject } from "./rayaObject.ts";
import { defaultRequestor, registerObjectClass } from "./registry.ts";
import type { ConnectPayoutCreateOptions, RequestOptions } from "./requestOptions.ts";

export type ConnectPayoutStatus = "pending" | "completed" | "failed" | "reversed";

/**
 * Un payout de Raya Connect: pesos que enviás desde tu saldo a un vendedor de tu plataforma, por
 * CBU, CVU o alias.
 *
 * Se crea con tu clave secreta, no con el access_token de una cuenta conectada: la plata sale de
 * la cuenta de tu negocio. `amount` es lo que sale de tu saldo y el destino recibe `net_amount`.
 * En `GET /v1/transfers` y en los webhooks `transfer.*` aparece como una transferencia con el
 * mismo `id`, `amount` y el `processing_fee` en `fee`.
 */
export class ConnectPayout extends RayaObject {
  static override readonly OBJECT_NAME = "connect.payout";

  declare id: string;
  declare object: "connect.payout";
  /**
   * `pending`: lo creaste y todavía se está procesando. `completed`: se acreditó en la cuenta de
   * destino. `failed`: no se pudo completar. `reversed`: la entidad de destino lo revirtió. En
   * `failed` y `reversed` te devolvimos `amount` entero a tu saldo, incluida la comisión (pueden
   * sumarse valores).
   */
  declare status: ConnectPayoutStatus;
  /** Lo que sale de tu saldo, en pesos: lo que mandaste en `amount`. */
  declare amount: number;
  /**
   * La comisión de este payout, en pesos. Puede ser `0`. Si falla o se revierte, te la devolvemos
   * y este campo se mantiene.
   */
  declare processing_fee: number;
  /** Lo que recibe la cuenta de destino: `amount` menos `processing_fee`. */
  declare net_amount: number;
  /** Siempre `"ARS"`. */
  declare currency: string;
  declare origin: ConnectPayout.Origin;
  declare counterparty: ConnectPayout.Counterparty;
  /**
   * El identificador en la red de transferencias. Es `null` mientras está `pending`, si falló y
   * cuando el destino es una cuenta de Raya.
   */
  declare reference: string | null;
  /** Fecha ISO 8601 en UTC, como `"2026-10-24T17:40:06Z"`. */
  declare created_at: string;

  // --- Estilo global (ConnectPayout.create/retrieve/list); ver ConnectPayoutService. ---

  /** Envía pesos desde tu saldo, con `config.apiKey`. La `idempotencyKey` es obligatoria. */
  static async create(
    params: ConnectPayoutCreateParams,
    options: ConnectPayoutCreateOptions,
  ): Promise<ConnectPayout> {
    return new ConnectPayoutService(defaultRequestor()).create(params, options);
  }

  static async retrieve(payoutId: string, options?: RequestOptions): Promise<ConnectPayout> {
    return new ConnectPayoutService(defaultRequestor()).retrieve(payoutId, options);
  }

  static async list(
    params?: ConnectPayoutListParams,
    options?: RequestOptions,
  ): Promise<ListObject<ConnectPayout>> {
    return new ConnectPayoutService(defaultRequestor()).list(params, options);
  }
}

export declare namespace ConnectPayout {
  /** La cuenta de tu negocio desde la que sale el payout. */
  interface Origin {
    /** CVU de origen: 22 dígitos. */
    account: string;
    /** Alias de esa cuenta, si tiene. */
    alias: string | null;
    /** El nombre con el que la ve quien recibe la transferencia. */
    name: string;
  }

  /** A quién le enviaste: el titular que encontramos al validar el destino. */
  interface Counterparty {
    /** Nombre del titular. */
    name: string | null;
    /** CUIT o CUIL del titular: 11 dígitos, sin guiones. */
    tax_id: string | null;
    /** CBU o CVU de destino: 22 dígitos. */
    account: string | null;
    /** Alias de la cuenta, si lo conocemos. */
    alias: string | null;
  }
}

// "connect.payout", con el punto: el registro es por el valor entero de `object`.
registerObjectClass("connect.payout", ConnectPayout);
