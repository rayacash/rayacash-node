// @ts-check
// Enviar una transferencia a un CBU, CVU o alias, sin riesgo de mandarla dos veces.
//
// ATENCIÓN: no hay modo de prueba. Correr este script transfiere plata real desde tu saldo.
//
//   RAYA_SECRET_KEY=raya_sk_live_… node examples/enviar-transferencia.mjs <destino> <monto>

import { randomUUID } from "node:crypto";

import { APIConnectionError, APIError, RayaClient, UnprocessableEntityError } from "rayacash";

/**
 * @param {RayaClient} client
 * @param {string} destination
 * @param {string} amount
 * @param {string} idempotencyKey
 */
async function paySupplier(client, destination, amount, idempotencyKey) {
  let transfer;
  try {
    // El monto viaja tal cual lo escribiste ("25000.50"): el SDK nunca redondea.
    transfer = await client.transfers.create({ amount, destination }, { idempotencyKey });
  } catch (error) {
    if (error instanceof UnprocessableEntityError) {
      // INSUFFICIENT_BALANCE, LIMIT_EXCEEDED, DESTINATION_*: no se arregla reintentando.
      console.log(`No se pudo transferir: ${error.message} (${error.code})`);
      return;
    }
    if (error instanceof APIConnectionError || error instanceof APIError) {
      // Sin respuesta o falla de nuestro lado: reintentá más tarde con la MISMA clave.
      console.log(`Reintentá más tarde con la clave ${error.idempotencyKey}: ${error.message}`);
      return;
    }
    throw error;
  }

  console.log(`Transferencia ${transfer.id}: ${transfer.status}`);
  console.log(`Titular: ${transfer.counterparty.name} (CUIT ${transfer.counterparty.tax_id})`);
  if (transfer.status === "pending") {
    console.log(
      "Te avisamos con transfer.sent o transfer.failed (en general, en uno o dos minutos).",
    );
  }
}

const [destination, amount] = process.argv.slice(2);
if (!destination || !amount) {
  console.error("Uso: node examples/enviar-transferencia.mjs <destino> <monto>");
  process.exit(1);
}
// En tu sistema: generá la clave y guardala con el pago al proveedor ANTES de llamar. Si la
// transferencia termina failed, para intentarla de nuevo usá una clave nueva.
await paySupplier(new RayaClient(), destination, amount, randomUUID());
