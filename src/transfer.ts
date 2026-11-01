import type { ListObject } from "./listObject.ts";
import { RayaObject } from "./rayaObject.ts";
import { defaultRequestor, registerObjectClass } from "./registry.ts";
import type { RequestOptions, TransferCreateOptions } from "./requestOptions.ts";
import {
  type TransferCreateParams,
  type TransferListParams,
  TransferService,
} from "./transferService.ts";

export type TransferDirection = "inbound" | "outbound";
export type TransferStatus = "pending" | "completed" | "failed" | "reversed";

/**
 * Una transferencia: enviada (`outbound`) o recibida (`inbound`, un depósito).
 *
 * Es el mismo objeto que llega en los webhooks `transfer.*`. Los cobros de tus pagos no son
 * transferencias: se siguen en cada `Payment`.
 */
export class Transfer extends RayaObject {
  static override readonly OBJECT_NAME = "transfer";

  declare id: string;
  declare object: "transfer";
  /** `inbound`: la recibiste. `outbound`: la enviaste. */
  declare direction: TransferDirection;
  /** `pending`, `completed`, `failed` o `reversed` (pueden sumarse valores). */
  declare status: TransferStatus;
  /** El monto en pesos. En las recibidas, antes de la comisión. */
  declare amount: number;
  /** La comisión que te cobramos. */
  declare fee: number;
  /** `amount` menos `fee`. En las recibidas, lo que se sumó a tu saldo. */
  declare net_amount: number;
  /** Siempre `"ARS"`. */
  declare currency: string;
  declare counterparty: Transfer.Counterparty;
  declare description: string | null;
  /** El identificador en la red de transferencias (`null` mientras está `pending`). */
  declare reference: string | null;
  /** Fecha ISO 8601 en UTC, como `"2026-10-24T13:58:12Z"`. */
  declare created_at: string;

  // --- Estilo global (Transfer.create/retrieve/list); ver TransferService para el detalle. ---

  /** Envía pesos a un CBU, CVU o alias. La `idempotencyKey` es obligatoria. */
  static async create(
    params: TransferCreateParams,
    options: TransferCreateOptions,
  ): Promise<Transfer> {
    return new TransferService(defaultRequestor()).create(params, options);
  }

  static async retrieve(transferId: string, options?: RequestOptions): Promise<Transfer> {
    return new TransferService(defaultRequestor()).retrieve(transferId, options);
  }

  static async list(
    params?: TransferListParams,
    options?: RequestOptions,
  ): Promise<ListObject<Transfer>> {
    return new TransferService(defaultRequestor()).list(params, options);
  }
}

export declare namespace Transfer {
  /** La otra cuenta, con los datos que informa su entidad. */
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

registerObjectClass("transfer", Transfer);
