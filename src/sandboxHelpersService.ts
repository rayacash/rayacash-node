// Los test helpers del sandbox: lo que en tu cuenta real hace el banco, simulado con la clave
// secreta de prueba de un sandbox (`raya_sk_test_…`). Con una clave real, la API responde 403
// SANDBOX_ONLY.

import type { ConnectOrder } from "./connectOrder.ts";
import { type Amount, canonicalAmount, checkParams, isPlainObject, pathId } from "./encoding.ts";
import type { Payment } from "./payment.ts";
import { type RequestOptions, validateOptions } from "./requestOptions.ts";
import type { APIRequestor } from "./requestor.ts";

export interface PaymentSimulateTransferParams {
  /**
   * Lo que se simula recibir, en pesos, hasta 2 decimales: `1500`, `"1500.50"` o un `Decimal`. Sin
   * él, el monto exacto del pago. Menos que el pago lo deja `failed` (`failure_code` en
   * `amount_mismatch`); igual o más, `succeeded`, con lo simulado en `amount_received`.
   */
  amount?: Amount | null;
}

const METHOD = "testHelpers.payments.simulateTransfer";
const SIMULATE_PARAMS = ["amount"] as const;

// La API no usa Idempotency-Key acá: simular dos veces el mismo pago responde 409
// PAYMENT_NOT_PENDING. Por eso no se acepta ni en los parámetros ni en las opciones.
function noIdempotencyKey(key: string, where: string): string {
  return (
    `${METHOD} no acepta ${key} ${where}: no lleva Idempotency-Key, un pago se simula una ` +
    "sola vez (repetirlo responde PAYMENT_NOT_PENDING)."
  );
}

// Sin amount no va body, como en los reembolsos: la API simula el monto exacto del pago.
function simulateBody(params: unknown): Record<string, unknown> | null {
  if (isPlainObject(params)) {
    // Antes de checkParams, que diría que la idempotencyKey va en las opciones.
    for (const key of ["idempotencyKey", "idempotency_key"]) {
      if (Object.hasOwn(params, key)) {
        throw new TypeError(noIdempotencyKey(key, "entre los parámetros"));
      }
    }
  }
  const amount = checkParams(METHOD, params, SIMULATE_PARAMS).amount;
  if (amount === undefined || amount === null) return null;
  return { amount: canonicalAmount(amount) };
}

function checkOptions(options: unknown): void {
  if ("idempotencyKey" in validateOptions(options)) {
    throw new RangeError(noIdempotencyKey("idempotencyKey", "en las opciones"));
  }
}

/**
 * `client.testHelpers.payments`: simular la transferencia de un pago de prueba. Solo en un sandbox,
 * con su clave secreta de prueba (`raya_sk_test_…`).
 */
export class SandboxPaymentHelpersService {
  readonly #requestor: APIRequestor;

  constructor(requestor: APIRequestor) {
    this.#requestor = requestor;
  }

  /**
   * Simula la transferencia de quien paga un pago de prueba
   * (`POST /v1/test/payments/:id/simulate_transfer`). Solo en un sandbox, con su clave secreta de
   * prueba (`raya_sk_test_…`): con tu clave real da `PermissionDeniedError` con
   * `code === "SANDBOX_ONLY"`.
   *
   * Sin `amount`, por el monto exacto: el pago queda `succeeded`. Con un `amount` menor queda
   * `failed`, con `failure_code` en `amount_mismatch` y sin reembolso automático; igual o mayor,
   * `succeeded`, con lo simulado en `amount_received`. El saldo de prueba sube por lo recibido y
   * los webhooks salen como siempre, con `livemode: false`.
   *
   * Devuelve el `Payment` o, si `paymentId` es el `id` de una orden de Raya Connect de una app del
   * sandbox, su `ConnectOrder`. Si el pago ya no está `pending` (ya simulado, reembolsado o
   * vencido), da `ConflictError` con `code === "PAYMENT_NOT_PENDING"` y el estado en
   * `error.data.status`; si no es del sandbox, `NotFoundError` con `code === "PAYMENT_NOT_FOUND"`.
   *
   * No lleva Idempotency-Key (ni acepta `idempotencyKey`): un pago se simula una sola vez. Si un
   * corte de red deja sin respuesta un intento que sí llegó, el reintento da `PAYMENT_NOT_PENDING`:
   * consultá el pago con `payments.retrieve` (una orden, con `connect.orders.retrieve`).
   */
  async simulateTransfer(
    paymentId: string,
    params?: PaymentSimulateTransferParams | null,
    options?: RequestOptions,
  ): Promise<Payment | ConnectOrder> {
    const body = simulateBody(params);
    checkOptions(options);
    const path = `/v1/test/payments/${pathId("paymentId", paymentId)}/simulate_transfer`;
    // La clase sale de `object` (payment o connect.order); "payment" es solo el respaldo.
    return (await this.#requestor.request(
      "POST",
      path,
      { body, idempotent: false },
      options,
      "payment",
    )) as Payment | ConnectOrder;
  }
}

/**
 * `client.testHelpers`: lo que solo existe en un sandbox, con su clave secreta de prueba
 * (`raya_sk_test_…`).
 */
export class SandboxHelpersService {
  /** `client.testHelpers.payments.simulateTransfer`. */
  readonly payments: SandboxPaymentHelpersService;

  constructor(requestor: APIRequestor) {
    this.payments = new SandboxPaymentHelpersService(requestor);
  }
}
