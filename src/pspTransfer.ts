import type { ListObject } from "./listObject.ts";
import {
  type PspTransferCreateParams,
  type PspTransferListParams,
  PspTransferService,
} from "./pspService.ts";
import { RayaObject } from "./rayaObject.ts";
import { defaultRequestor, registerObjectClass } from "./registry.ts";
import type { PspTransferCreateOptions, RequestOptions } from "./requestOptions.ts";

/** `inbound`: la recibió tu cliente. `outbound`: la enviaste en su nombre. */
export type PspTransferDirection = "inbound" | "outbound";
export type PspTransferStatus = "pending" | "completed" | "failed" | "reversed";

/**
 * Una transferencia de un cliente de Raya PSP: una que recibió en su CVU (`inbound`) o una que
 * enviaste en su nombre (`outbound`).
 *
 * Es el mismo objeto que llega en los webhooks `psp.transfer.*`. No aparece en
 * `client.transfers.list()` ni emite `transfer.*`.
 */
export class PspTransfer extends RayaObject {
  static override readonly OBJECT_NAME = "psp.transfer";

  /** `pspt_…` */
  declare id: string;
  declare object: "psp.transfer";
  /** El `id` del cliente (`pspc_…`). */
  declare customer: string;
  /** `inbound`: la recibió tu cliente. `outbound`: la enviaste en su nombre. */
  declare direction: PspTransferDirection;
  /**
   * `pending` (solo una enviada a otra entidad, mientras se procesa), `completed`, `failed` o
   * `reversed` (pueden sumarse valores). En `failed` y `reversed`, el monto vuelve al saldo del
   * cliente y al tuyo.
   */
  declare status: PspTransferStatus;
  /** Lo que se movió en el saldo del cliente, en pesos. */
  declare amount: number;
  /**
   * La comisión, que se descuenta de tu saldo: `0` entre dos clientes de tu cuenta. Si falla o se
   * revierte, te la devolvemos y este campo se mantiene.
   */
  declare fee: number;
  /**
   * `amount` menos `fee`: en una enviada, lo que recibió el destino; en una recibida, lo que se sumó
   * a tu saldo.
   */
  declare net_amount: number;
  /** Siempre `"ARS"`. */
  declare currency: "ARS";
  /** El CVU del cliente que se usó: el de origen en una enviada, el de destino en una recibida. */
  declare account: string;
  /** La otra parte, con los datos que informa su entidad. */
  declare counterparty: PspTransfer.Counterparty;
  /**
   * En una enviada, siempre `"Transferencia"`. En una recibida, el concepto que informó el banco o
   * `null` (entre dos cuentas de Raya, `"Transferencia"`).
   */
  declare description: string | null;
  /**
   * El identificador en la red de transferencias. Es `null` mientras está `pending`, si falló y en
   * las transferencias entre cuentas de Raya.
   */
  declare reference: string | null;
  /** Fecha ISO 8601 en UTC, como `"2026-10-24T15:20:31Z"`. */
  declare created_at: string;

  // --- Estilo global (PspTransfer.create/retrieve/list); ver PspTransferService. ---

  /** Transfiere en nombre de un cliente. La `idempotencyKey` es obligatoria. */
  static async create(
    params: PspTransferCreateParams,
    options: PspTransferCreateOptions,
  ): Promise<PspTransfer> {
    return new PspTransferService(defaultRequestor()).create(params, options);
  }

  static async retrieve(transferId: string, options?: RequestOptions): Promise<PspTransfer> {
    return new PspTransferService(defaultRequestor()).retrieve(transferId, options);
  }

  static async list(
    params?: PspTransferListParams,
    options?: RequestOptions,
  ): Promise<ListObject<PspTransfer>> {
    return new PspTransferService(defaultRequestor()).list(params, options);
  }
}

export declare namespace PspTransfer {
  /** La otra parte de la transferencia: quien le transfirió a tu cliente o a quien le enviaste. */
  interface Counterparty {
    /** Nombre del titular. */
    name: string | null;
    /** CUIT o CUIL del titular: 11 dígitos, sin guiones. */
    tax_id: string | null;
    /** CBU o CVU: 22 dígitos. */
    account: string | null;
    /** Alias de la cuenta, si lo conocemos. */
    alias: string | null;
  }
}

// "psp.transfer", con el punto: el registro es por el valor entero de `object`.
registerObjectClass("psp.transfer", PspTransfer);
