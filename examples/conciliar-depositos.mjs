// @ts-check
// Conciliar depósitos: suma las transferencias recibidas en un día, página por página.
//
// Solo lee (GET /v1/transfers): no crea ni mueve nada.
//
//   RAYA_SECRET_KEY=raya_sk_live_… node examples/conciliar-depositos.mjs 2026-10-23

import { RayaClient } from "rayacash";

/**
 * El día (YYYY-MM-DD) en la hora de Argentina, como rango semiabierto [inicio, fin): los días
 * seguidos no se pisan.
 *
 * @param {string} day
 */
function dayRange(day) {
  const start = new Date(`${day}T00:00:00-03:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/**
 * Lo que se sumó a tu saldo ese día, en centavos.
 *
 * @param {RayaClient} client
 * @param {string} day
 */
async function depositsOf(client, day) {
  const { start, end } = dayRange(day);
  const page = await client.transfers.list({
    direction: "inbound",
    created_gte: start,
    created_lt: end,
    limit: 100,
  });
  let cents = 0;
  for await (const transfer of page.autoPagingIter()) {
    // net_amount es lo que se sumó a tu saldo. En centavos enteros, la suma es exacta.
    cents += Math.round(transfer.net_amount * 100);
    console.log(transfer.id, transfer.counterparty.name, transfer.net_amount);
  }
  return cents;
}

const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
const day = process.argv[2] ?? today;
const cents = await depositsOf(new RayaClient(), day);
console.log(`Total del ${day}: $${(cents / 100).toFixed(2)}`);
