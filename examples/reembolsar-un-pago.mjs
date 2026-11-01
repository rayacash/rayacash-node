// @ts-check
// Reembolsar un pago: devuelve todo lo recibido a la cuenta desde la que se pagó.
//
// ATENCIÓN: no hay modo de prueba. Correr este script devuelve plata real.
//
//   RAYA_SECRET_KEY=raya_sk_live_… node examples/reembolsar-un-pago.mjs <payment_id>

import { randomUUID } from "node:crypto";

import { APIError, ConflictError, RayaClient } from "rayacash";

const paymentId = process.argv[2];
if (!paymentId) {
  console.error("Uso: node examples/reembolsar-un-pago.mjs <payment_id>");
  process.exit(1);
}
const idempotencyKey = randomUUID(); // en tu sistema, guardala con el reembolso antes de llamar
const client = new RayaClient();

try {
  const payment = await client.payments.refund(paymentId, { idempotencyKey });
  console.log(`Pago ${payment.id}: ${payment.status} (${payment.refunded_at})`);
} catch (error) {
  if (error instanceof ConflictError && error.code === "PAYMENT_NOT_REFUNDABLE") {
    // data.status es el estado actual del pago y, si está succeeded, data.reason dice por qué
    // (refund_window_expired, payer_unknown…).
    console.log(`No se puede reembolsar: ${error.data?.status} ${error.data?.reason ?? ""}`);
  } else if (error instanceof APIError && error.code === "BANK_UNAVAILABLE") {
    // Se está confirmando: nunca se manda dos veces. Esperá payment.refunded.
    console.log(
      `La devolución se está confirmando: reintentá más tarde con la clave ${idempotencyKey}.`,
    );
  } else {
    throw error;
  }
}
