// @ts-check
// Operar con los clientes de Raya PSP: crear un cliente con su verificación de Identidad, ver su CVU
// y su saldo, y transferir en su nombre sin riesgo de mandarlo dos veces. Raya PSP es solo para
// empresas que son sujeto obligado, con Raya PSP activado.
//
// ATENCIÓN: «crear» le da de alta un CVU a tu cliente y, con un destino y un monto, este script
// transfiere plata del saldo de tu cliente (y del tuyo).
//
//   RAYA_SECRET_KEY=raya_sk_live_… node examples/operar-clientes-psp.mjs
//   RAYA_SECRET_KEY=raya_sk_live_… node examples/operar-clientes-psp.mjs crear <idv_…>
//   RAYA_SECRET_KEY=raya_sk_live_… node examples/operar-clientes-psp.mjs <pspc_…>
//   RAYA_SECRET_KEY=raya_sk_live_… node examples/operar-clientes-psp.mjs <pspc_…> <destino> <monto>

import { randomUUID } from "node:crypto";
import { ConflictError, RayaClient, UnprocessableEntityError } from "rayacash";

const client = new RayaClient(); // lee RAYA_SECRET_KEY
const [first, ...rest] = process.argv.slice(2);

if (!first) {
  // Tu saldo y el de tus clientes: para transferir en nombre de uno tienen que alcanzar los dos.
  const balance = await client.psp.balance.retrieve();
  console.log(`Tu saldo: ${balance.available}. El de tus clientes: ${balance.customers_balance}.`);
  const page = await client.psp.customers.list({ status: "active", limit: 100 });
  for await (const customer of page.autoPagingIter()) {
    console.log(`${customer.id}  ${customer.cvu?.account ?? "-"}  ${customer.balance}`);
  }
} else if (first === "crear") {
  const [verificationId] = rest;
  if (!verificationId) {
    console.error("Uso: node examples/operar-clientes-psp.mjs crear <idv_…>");
    process.exit(1);
  }
  // Con su verificación de Identidad alcanza: su CUIL, su nombre y su sexo los tomamos de ahí
  // (sin tax_id, name, person_type ni fotos). En tu sistema: generá la clave y guardala con tu
  // cliente ANTES de llamar, para que un reintento (incluso después de un corte) no cree otro.
  const customer = await client.psp.customers.create(
    {
      identity_verification: verificationId, // una verificación document de tu cuenta, verified
      external_reference: "cliente-8812", // tu id del cliente, nunca datos personales
    },
    { idempotencyKey: randomUUID() },
  );
  console.log(`Cliente ${customer.id}: ${customer.status}`);
  if (customer.status === "active") {
    console.log(`CVU ${customer.cvu?.account} (alias ${customer.cvu?.alias ?? "en camino"})`);
  } else if (customer.status === "verifying" || customer.status === "pending") {
    console.log("Te avisamos con psp.customer.activated, psp.customer.failed o .rejected.");
  } else {
    console.log(`No se pudo: ${customer.decline_reason?.code}`); // decidí con el código
  }
} else if (rest.length === 0) {
  const customer = await client.psp.customers.retrieve(first);
  const balance = await client.psp.customers.retrieveBalance(customer.id);
  console.log(`Cliente ${customer.id} (${customer.name}): ${customer.status}`);
  console.log(`CVU: ${customer.cvu?.account ?? "sin CVU"}, alias: ${customer.cvu?.alias ?? "-"}`);
  console.log(`Saldo: ${balance.available}. Transferible ahora: ${balance.transferable}.`);
  if (customer.status === "blocked") console.log(`Bloqueado por: ${customer.blocked_by}`);
  const movements = await client.psp.transfers.list({ customer: customer.id, limit: 5 });
  for (const movement of movements) {
    console.log(`${movement.direction} ${movement.status} ${movement.amount} (${movement.id})`);
  }
} else {
  const [destination, amount] = rest;
  if (!destination || !amount) {
    console.error("Uso: node examples/operar-clientes-psp.mjs <pspc_…> <destino> <monto>");
    process.exit(1);
  }
  // En tu sistema: generá la clave y guardala con la operación ANTES de llamar, y reusala en cada
  // reintento. Si la transferencia termina failed, para intentarla de nuevo usá una clave nueva.
  const idempotencyKey = randomUUID();
  try {
    const transfer = await client.psp.transfers.create(
      { customer: first, amount, destination },
      { idempotencyKey },
    );
    console.log(`Transferencia ${transfer.id}: ${transfer.status}`);
    console.log(`A ${transfer.counterparty.name}. Comisión de tu saldo: ${transfer.fee}.`);
  } catch (error) {
    if (error instanceof UnprocessableEntityError) {
      // INSUFFICIENT_BALANCE es tu saldo; CUSTOMER_INSUFFICIENT_BALANCE, el de tu cliente.
      console.log(`No se pudo transferir: ${error.message} (${error.code})`);
    } else if (error instanceof ConflictError && error.code === "CUSTOMER_STATUS_CONFLICT") {
      console.log(`El cliente no puede transferir: ${JSON.stringify(error.data)}`);
    } else {
      throw error; // sin respuesta: reintentá más tarde con la MISMA idempotencyKey
    }
  }
}
