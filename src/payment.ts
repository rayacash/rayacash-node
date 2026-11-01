import { type PaymentCreateParams, PaymentService } from "./paymentService.ts";
import { RayaObject, resolveRequestor } from "./rayaObject.ts";
import { defaultRequestor, registerObjectClass } from "./registry.ts";
import type { PostRequestOptions, RequestOptions } from "./requestOptions.ts";

export type PaymentStatus = "pending" | "succeeded" | "failed" | "expired" | "refunded";

function paymentIdOf(payment: Payment): string {
  const id: unknown = payment.id;
  if (typeof id !== "string" || !id) {
    throw new RangeError("Este Payment no tiene id: no se puede reembolsar.");
  }
  return id;
}

/**
 * Un cobro único por transferencia bancaria, con un CVU y un alias exclusivos.
 *
 * Entregá el pedido solo cuando `status` es `succeeded`. Mientras está `pending`, el CVU y el
 * alias son exclusivos de este pago; cuando deja de estarlo, dejá de mostrarlos.
 */
export class Payment extends RayaObject {
  static override readonly OBJECT_NAME = "payment";
  static override readonly PLAIN_FIELDS: ReadonlySet<string> = new Set(["metadata"]);

  declare id: string;
  declare object: "payment";
  /** `pending`, `succeeded`, `failed`, `expired` o `refunded` (pueden sumarse valores). */
  declare status: PaymentStatus;
  /** Cuánto tiene que transferir quien paga, en pesos. */
  declare amount: number;
  /** Cuánto recibimos (`null` hasta que llega una transferencia). */
  declare amount_received: number | null;
  /** Siempre `"ARS"`. */
  declare currency: string;
  declare description: string | null;
  /** Tu identificador del pago (por ejemplo, el número de pedido). */
  declare external_reference: string | null;
  declare bank_transfer: Payment.BankTransfer;
  /** Nuestra página de pago, que se actualiza sola cuando llega la transferencia. */
  declare checkout_url: string;
  declare return_url: string | null;
  declare payer: Payment.Payer | null;
  /** `amount_mismatch` si transfirieron de menos; `null` si no falló. */
  declare failure_code: "amount_mismatch" | null;
  /** Tus pares clave-valor (un objeto común). `{}` si no mandaste ninguno. */
  declare metadata: Record<string, string>;
  /** Hasta cuándo se puede pagar (ISO 8601 en UTC). */
  declare expires_at: string;
  declare paid_at: string | null;
  declare refunded_at: string | null;
  declare created_at: string;

  /**
   * Reembolsa este pago completo, con el cliente del que vino (o con la configuración global, si
   * lo armaste a mano). Devuelve el pago actualizado: este objeto no cambia.
   */
  async refund(options?: PostRequestOptions): Promise<Payment> {
    const id = paymentIdOf(this);
    return new PaymentService(resolveRequestor(this)).refund(id, options);
  }

  // --- Estilo global (Payment.create/retrieve/refund); ver PaymentService para el detalle. ---

  /** Crea un pago con un CVU exclusivo. Usá un timeout de al menos 60 s (es el default). */
  static async create(params: PaymentCreateParams, options?: PostRequestOptions): Promise<Payment> {
    return new PaymentService(defaultRequestor()).create(params, options);
  }

  static async retrieve(paymentId: string, options?: RequestOptions): Promise<Payment> {
    return new PaymentService(defaultRequestor()).retrieve(paymentId, options);
  }

  /** Reembolsa un pago por id: `Payment.refund(payment.id)`. */
  static async refund(paymentId: string, options?: PostRequestOptions): Promise<Payment> {
    return new PaymentService(defaultRequestor()).refund(paymentId, options);
  }
}

export declare namespace Payment {
  /** Los datos para pagar por transferencia. */
  interface BankTransfer {
    /** El CVU al que hay que transferir: 22 dígitos. */
    cvu: string;
    /** El alias del CVU. Si es `null`, mostrá solo el CVU. */
    alias: string | null;
  }

  /** Quién transfirió, con los datos que informa su entidad. */
  interface Payer {
    name: string | null;
    tax_id: string | null;
    /** CBU o CVU de origen: si reembolsás el pago, el dinero vuelve acá. */
    account: string | null;
  }
}

registerObjectClass("payment", Payment);
