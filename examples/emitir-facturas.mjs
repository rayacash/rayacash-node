// @ts-check
// Emitir facturas electrónicas de ARCA con el Facturador: sin argumentos, lista tus facturas
// emitidas; con un DNI y un monto, crea una factura; con el id de una factura, lee cómo salió.
// Antes, configurá el Facturador en Negocios › Facturador: el punto de venta, el certificado y la
// clave privada de ARCA, tu condición frente al IVA y el concepto. Solo funciona en tu cuenta real.
//
// ATENCIÓN: con un DNI y un monto, este script emite una factura de verdad en ARCA, con tu punto
// de venta y tu certificado.
//
//   RAYA_SECRET_KEY=raya_sk_live_… node examples/emitir-facturas.mjs
//   RAYA_SECRET_KEY=raya_sk_live_… node examples/emitir-facturas.mjs <dni> <monto>
//   RAYA_SECRET_KEY=raya_sk_live_… node examples/emitir-facturas.mjs <inv_…>

import { randomUUID } from "node:crypto";
import { PermissionDeniedError, RayaClient } from "rayacash";

/**
 * El comprobante como lo muestra ARCA: el punto de venta y el número, como `00005-00001234`.
 * @param {number} pointOfSale
 * @param {number | null} number
 */
function voucher(pointOfSale, number) {
  return `${String(pointOfSale).padStart(5, "0")}-${String(number ?? "").padStart(8, "0")}`;
}

const client = new RayaClient(); // lee RAYA_SECRET_KEY
const [first, amount] = process.argv.slice(2);

if (!first) {
  // Tus facturas emitidas, de la más nueva a la más vieja (la lista no filtra por DNI).
  const page = await client.invoices.list({ status: "issued", limit: 100 });
  for await (const invoice of page.autoPagingIter()) {
    const number = voucher(invoice.point_of_sale, invoice.number);
    console.log(`${invoice.id}  ${invoice.type} ${number}  ${invoice.amount}  CAE ${invoice.cae}`);
  }
} else if (amount) {
  // En tu sistema: generá la clave y guardala con la factura ANTES de llamar, y reusala en cada
  // reintento: así nunca se factura dos veces. Si la factura termina rejected o failed, para
  // intentarla de nuevo usá una clave nueva.
  try {
    const invoice = await client.invoices.create(
      { dni: first, amount, metadata: { pedido_id: "1042" } }, // el DNI va como texto
      { idempotencyKey: randomUUID() },
    );
    console.log(`Factura ${invoice.id}: ${invoice.status}`); // pending: la emitimos en segundo plano
    console.log("Te avisamos con invoice.issued, invoice.rejected o invoice.failed.");
    console.log("Después, corré este script con su id.");
  } catch (error) {
    if (error instanceof PermissionDeniedError && error.code === "FACTURADOR_NOT_READY") {
      // not_configured, checking, action_required, certificate_expired o disabled.
      console.log(`Tu Facturador no está listo (${error.data?.reason}): revisalo en el dashboard.`);
    } else {
      throw error; // sin respuesta: reintentá más tarde con la MISMA idempotencyKey
    }
  }
} else {
  const invoice = await client.invoices.retrieve(first);
  console.log(`Factura ${invoice.type} ${invoice.id}: ${invoice.status}`);
  if (invoice.status === "issued") {
    const number = voucher(invoice.point_of_sale, invoice.number);
    console.log(`Comprobante ${number}, CAE ${invoice.cae} (vence ${invoice.cae_expires_on}).`);
    const vat = invoice.vat_amount ?? "no discrimina (Factura C)";
    console.log(`Total ${invoice.amount}: neto ${invoice.net_amount}, IVA ${vat}.`);
  } else if (invoice.status === "rejected" || invoice.status === "failed") {
    // Decidí con el código, no con el mensaje (que puede cambiar).
    const reason = invoice.failure_reason;
    console.log(`No se emitió (${reason?.code}): ${reason?.message}`);
  } else {
    console.log("Todavía la estamos emitiendo: esperá el webhook o consultala en un rato.");
  }
  for (const message of invoice.arca_messages) {
    console.log(`  ARCA (${message.type} ${message.code}): ${message.message}`);
  }
}
