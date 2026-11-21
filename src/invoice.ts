import {
  type InvoiceCreateParams,
  type InvoiceListParams,
  InvoiceService,
} from "./invoiceService.ts";
import type { ListObject } from "./listObject.ts";
import { RayaObject } from "./rayaObject.ts";
import { defaultRequestor, registerObjectClass } from "./registry.ts";
import type { InvoiceCreateOptions, RequestOptions } from "./requestOptions.ts";

/**
 * `B`: Factura B (en tu Facturador sos Responsable Inscripto: el IVA va incluido en `amount`).
 * `C`: Factura C (sos Monotributista: sin IVA).
 */
export type InvoiceType = "B" | "C";
export type InvoiceStatus = "pending" | "issued" | "rejected" | "failed";
/** El concepto de tu Facturador: productos, servicios o productos y servicios. */
export type InvoiceConcept = "products" | "services" | "products_and_services";
/** Por qué no se emitió una factura (`failure_reason.code`). */
export type InvoiceFailureCode =
  | "arca_rejected"
  | "facturador_not_ready"
  | "not_issued"
  | "numbering_conflict"
  | "account_unavailable";

/**
 * Una factura electrónica de ARCA que creaste con el Facturador: una Factura B o C a un consumidor
 * final identificado con su DNI, desde tu punto de venta.
 *
 * Se crea `pending` y la emitimos en segundo plano: dala por emitida solo cuando `status` es
 * `issued` (con su `number` y su `cae`). Es el mismo objeto que llega en los webhooks `invoice.*`.
 */
export class Invoice extends RayaObject {
  static override readonly OBJECT_NAME = "invoice";
  static override readonly PLAIN_FIELDS: ReadonlySet<string> = new Set(["metadata"]);

  /** `inv_…` */
  declare id: string;
  declare object: "invoice";
  /**
   * `B` (Factura B: sos Responsable Inscripto y el IVA va incluido en `amount`) o `C` (Factura C:
   * sos Monotributista, sin IVA). Sale de tu condición frente al IVA en el Facturador.
   */
  declare type: InvoiceType;
  /**
   * `pending` (la estamos emitiendo), `issued` (ARCA la autorizó y le asignó su CAE), `rejected`
   * (ARCA la rechazó) o `failed` (no pudimos emitirla y no quedó registrada en ARCA). Pueden
   * sumarse valores.
   */
  declare status: InvoiceStatus;
  /** El total en pesos (en una Factura B, con el IVA incluido): el `amount` que mandaste. */
  declare amount: number;
  /** El neto: en una Factura B, `amount` sin el IVA; en una Factura C, igual a `amount`. */
  declare net_amount: number;
  /** El IVA (21 %) de una Factura B: `amount` menos `net_amount`. En una Factura C, `null`. */
  declare vat_amount: number | null;
  /** Siempre `"ARS"`. */
  declare currency: "ARS";
  /** El DNI de tu cliente, el receptor: es un dato personal, no lo escribas en logs. */
  declare dni: string;
  /** Tu punto de venta de ARCA: el de tu Facturador cuando creaste la factura. */
  declare point_of_sale: number;
  /**
   * El número del comprobante en tu punto de venta. Es `null` hasta que le asignamos uno: una
   * factura `issued` siempre lo tiene.
   */
  declare number: number | null;
  /** `products`, `services` o `products_and_services`: el concepto de tu Facturador. */
  declare concept: InvoiceConcept;
  /** El CAE que le asignó ARCA (14 dígitos). `null` si no está `issued`. */
  declare cae: string | null;
  /** Hasta cuándo vale el CAE, como `"2026-11-28"`. `null` si no está `issued`. */
  declare cae_expires_on: string | null;
  /** La fecha del comprobante que registró ARCA, como `"2026-11-18"`. `null` si no está `issued`. */
  declare issued_on: string | null;
  /**
   * Por qué no se emitió: solo en `rejected` y `failed` (`null` en el resto). Decidí con `code`, no
   * con `message`.
   */
  declare failure_reason: Invoice.FailureReason | null;
  /**
   * Los errores y las observaciones de ARCA, tal como los mandó (hasta 20); `[]` si no hay. Una
   * factura `issued` también puede traer observaciones.
   */
  declare arca_messages: Invoice.ArcaMessage[];
  /** Tus pares clave-valor (un objeto común). `{}` si no mandaste ninguno. */
  declare metadata: Record<string, string>;
  /**
   * Cuándo la dimos por emitida (ISO 8601 en UTC); la fecha del comprobante es `issued_on`. `null`
   * si no está `issued`.
   */
  declare issued_at: string | null;
  /** Fecha ISO 8601 en UTC, como `"2026-11-18T14:30:05Z"`. */
  declare created_at: string;

  // --- Estilo global (Invoice.create/retrieve/list); ver InvoiceService. ---

  /** Crea una factura con `config.apiKey` (tu clave secreta). La `idempotencyKey` es obligatoria. */
  static async create(
    params: InvoiceCreateParams,
    options: InvoiceCreateOptions,
  ): Promise<Invoice> {
    return new InvoiceService(defaultRequestor()).create(params, options);
  }

  static async retrieve(invoiceId: string, options?: RequestOptions): Promise<Invoice> {
    return new InvoiceService(defaultRequestor()).retrieve(invoiceId, options);
  }

  static async list(
    params?: InvoiceListParams,
    options?: RequestOptions,
  ): Promise<ListObject<Invoice>> {
    return new InvoiceService(defaultRequestor()).list(params, options);
  }
}

export declare namespace Invoice {
  /** Por qué no se emitió una factura. */
  interface FailureReason {
    /**
     * `arca_rejected` (ARCA la rechazó: `arca_messages` dice por qué), `facturador_not_ready`,
     * `not_issued`, `numbering_conflict` o `account_unavailable` (pueden sumarse).
     */
    code: InvoiceFailureCode;
    /** Texto para personas, en castellano: dice qué hacer y puede cambiar. */
    message: string;
  }

  /** Un error o una observación de ARCA, tal como lo mandó. */
  interface ArcaMessage {
    /** `error` u `observation`. */
    type: "error" | "observation";
    /** El código de ARCA. */
    code: number;
    /** El texto de ARCA (hasta 500 caracteres). */
    message: string;
  }
}

registerObjectClass("invoice", Invoice);
