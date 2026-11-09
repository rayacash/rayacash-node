import { type CheckoutCreateParams, CheckoutOrdersService } from "./checkoutService.ts";
import { RayaObject, resolveRequestor } from "./rayaObject.ts";
import { defaultRequestor, registerObjectClass } from "./registry.ts";
import type { PostRequestOptions, RequestOptions } from "./requestOptions.ts";

export type CheckoutStatus = "pending" | "succeeded" | "failed" | "expired" | "refunded";

function checkoutIdOf(checkout: Checkout): string {
  const id: unknown = checkout.id;
  if (typeof id !== "string" || !id) {
    throw new RangeError("Este Checkout no tiene id: no se puede reembolsar.");
  }
  return id;
}

/**
 * Un cobro por transferencia a nombre de una cuenta que conectó tu app, con tu comisión (`fee`).
 *
 * Lo creás con el access_token de esa cuenta. Quien paga transfiere a `bank_transfer` o en
 * `checkout_url` (nuestra página, con el nombre y la imagen del comercio conectado). Al
 * acreditarse, `net_amount` se liquida al comercio conectado y `fee`, a tu cuenta, cada uno con
 * su plazo. Es el mismo objeto que llega en los webhooks `checkout.*`; su `id` es el del pago que
 * ve el comercio conectado.
 */
export class Checkout extends RayaObject {
  static override readonly OBJECT_NAME = "checkout";
  static override readonly PLAIN_FIELDS: ReadonlySet<string> = new Set(["metadata"]);

  declare id: string;
  declare object: "checkout";
  /** `pending`, `succeeded`, `failed`, `expired` o `refunded` (pueden sumarse valores). */
  declare status: CheckoutStatus;
  /** El total que tiene que transferir quien paga: la suma de `quantity` × `unit_price`. */
  declare amount: number;
  /** Tu comisión, en pesos. `0` si no mandaste `fee`. */
  declare fee: number;
  /** Lo que recibe la cuenta conectada: `amount` (o lo recibido, si fue más) menos `fee`. */
  declare net_amount: number;
  /** Cuánto recibimos (`null` hasta que llega una transferencia). */
  declare amount_received: number | null;
  /** Siempre `"ARS"`. */
  declare currency: string;
  /** Lo que se cobra, como lo mandaste. */
  declare items: Checkout.Item[];
  declare description: string | null;
  /** Tu identificador del cobro (por ejemplo, el número de pedido). */
  declare external_reference: string | null;
  /** La cuenta conectada a cuyo nombre se cobra: el `user_id` de su access_token. */
  declare account: string;
  declare bank_transfer: Checkout.BankTransfer;
  /** Nuestra página de pago, que se actualiza sola cuando llega la transferencia. */
  declare checkout_url: string;
  /** A dónde vuelve quien paga; las dos claves están siempre. */
  declare back_urls: Checkout.BackUrls;
  /** `"approved"` si al acreditarse mandamos solos a quien paga a `back_urls.success`. */
  declare auto_return: "approved" | null;
  /** El destino de Developers › Webhooks (`we_…`) de este checkout, o `null`. */
  declare notification_url: string | null;
  declare payer: Checkout.Payer | null;
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
   * Reembolsa este checkout completo, con el cliente del que vino (o con la configuración global,
   * si lo armaste a mano). Devuelve el checkout actualizado: este objeto no cambia.
   */
  async refund(options?: PostRequestOptions): Promise<Checkout> {
    const id = checkoutIdOf(this);
    return new CheckoutOrdersService(resolveRequestor(this)).refund(id, options);
  }

  // --- Estilo global (Checkout.create/retrieve/refund); ver CheckoutOrdersService. ---

  /** Crea un checkout a nombre de la cuenta conectada de `config.apiKey` (su access_token). */
  static async create(
    params: CheckoutCreateParams,
    options?: PostRequestOptions,
  ): Promise<Checkout> {
    return new CheckoutOrdersService(defaultRequestor()).create(params, options);
  }

  static async retrieve(checkoutId: string, options?: RequestOptions): Promise<Checkout> {
    return new CheckoutOrdersService(defaultRequestor()).retrieve(checkoutId, options);
  }

  /** Reembolsa un checkout por id: `Checkout.refund(checkout.id)`. */
  static async refund(checkoutId: string, options?: PostRequestOptions): Promise<Checkout> {
    return new CheckoutOrdersService(defaultRequestor()).refund(checkoutId, options);
  }
}

export declare namespace Checkout {
  /** Un ítem de lo que se cobra. */
  interface Item {
    title: string;
    quantity: number;
    /** El precio unitario, en pesos. */
    unit_price: number;
  }

  /** Los datos para pagar por transferencia, exclusivos mientras está `pending`. */
  interface BankTransfer {
    /** El CVU al que hay que transferir: 22 dígitos. */
    cvu: string;
    /** El alias del CVU. Si es `null`, mostrá solo el CVU. */
    alias: string | null;
  }

  /** A dónde vuelve quien paga desde `checkout_url`; `null` donde no mandaste URL. */
  interface BackUrls {
    success: string | null;
    failure: string | null;
  }

  /** Quién transfirió, con los datos que informa su entidad. */
  interface Payer {
    name: string | null;
    tax_id: string | null;
    /** CBU o CVU de origen: si reembolsás el checkout, el dinero vuelve acá. */
    account: string | null;
  }
}

registerObjectClass("checkout", Checkout);
