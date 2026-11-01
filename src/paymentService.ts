import { type Amount, canonicalAmount, checkParams, isPlainObject, pathId } from "./encoding.ts";
import type { Payment } from "./payment.ts";
import type { PostRequestOptions, RequestOptions } from "./requestOptions.ts";
import type { APIRequestor } from "./requestor.ts";

export interface PaymentCreateParams {
  /** Pesos, hasta 2 decimales, entre 0.01 y 99999999.99: `15000`, `"15000.50"` o un `Decimal`. */
  amount: Amount;
  /** Qué se vendió (hasta 255 caracteres). */
  description?: string | null;
  /** Tu identificador, como el número de pedido. */
  external_reference?: string | null;
  /** A dónde vuelve quien paga desde `checkout_url`. */
  return_url?: string | null;
  /** Hasta 20 pares clave-valor de texto. */
  metadata?: Record<string, string> | null;
}

const CREATE_PARAMS = [
  "amount",
  "description",
  "external_reference",
  "return_url",
  "metadata",
] as const;

function createBody(params: unknown): Record<string, unknown> {
  const values = checkParams("payments.create", params, CREATE_PARAMS);
  const metadata = values.metadata;
  if (metadata !== undefined && metadata !== null && !isPlainObject(metadata)) {
    throw new TypeError(
      'metadata tiene que ser un objeto de string a string, como { cliente_id: "8812" }.',
    );
  }
  return {
    amount: canonicalAmount(values.amount),
    description: values.description,
    external_reference: values.external_reference,
    return_url: values.return_url,
    metadata,
  };
}

function refundPath(paymentId: string): string {
  return `/v1/payments/${pathId("paymentId", paymentId)}/refund`;
}

/** `client.payments`: cobrar por transferencia con un CVU exclusivo por pago. */
export class PaymentService {
  readonly #requestor: APIRequestor;

  constructor(requestor: APIRequestor) {
    this.#requestor = requestor;
  }

  /**
   * Crea un pago `pending` con un CVU y un alias exclusivos (`POST /v1/payments`).
   *
   * Mostrale a quien paga `bank_transfer.cvu` y `bank_transfer.alias`, o mandalo a `checkout_url`.
   * Te avisamos con `payment.succeeded` cuando llega la transferencia. Puede tardar hasta 40 s si
   * damos de alta un CVU nuevo (el timeout por defecto es de 65 s).
   *
   * La `idempotencyKey` es opcional pero recomendada: guardala con el pedido y reusala si
   * reintentás. Si no la pasás, generamos una que protege los reintentos de esta llamada.
   */
  async create(params: PaymentCreateParams, options?: PostRequestOptions): Promise<Payment> {
    const body = createBody(params);
    return (await this.#requestor.request(
      "POST",
      "/v1/payments",
      { body },
      options,
      "payment",
    )) as Payment;
  }

  /** Un pago de tu negocio (`GET /v1/payments/:id`). */
  async retrieve(paymentId: string, options?: RequestOptions): Promise<Payment> {
    const path = `/v1/payments/${pathId("paymentId", paymentId)}`;
    return (await this.#requestor.request("GET", path, {}, options, "payment")) as Payment;
  }

  /**
   * Devuelve todo lo recibido a la cuenta desde la que se pagó (`POST /v1/payments/:id/refund`).
   *
   * Solo pagos `succeeded`, hasta 30 días después de `paid_at`. Es total: no hay reembolsos
   * parciales. Si la confirmación tarda, sale `APIError` con `code === "BANK_UNAVAILABLE"`:
   * reintentá más tarde con la misma `idempotencyKey` (nunca se manda dos veces) o esperá el
   * webhook `payment.refunded`.
   */
  async refund(paymentId: string, options?: PostRequestOptions): Promise<Payment> {
    return (await this.#requestor.request(
      "POST",
      refundPath(paymentId),
      {},
      options,
      "payment",
    )) as Payment;
  }
}
