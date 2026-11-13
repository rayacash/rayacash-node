// @ts-check
// Cobrar a nombre de una cuenta conectada con Raya Connect: canjea el code de la autorización, lee
// la cuenta y crea un pago con tu comisión.
//
// ATENCIÓN: correr este script crea un pago a nombre del comercio conectado, que reserva un CVU
// suyo hasta que vence (24 h, salvo que el comercio tenga otro plazo).
//
//   RAYA_CLIENT_ID=7650337728110670 RAYA_CLIENT_SECRET=raya_cs_live_… \
//   RAYA_REDIRECT_URI=https://tienda.example.com/raya/callback \
//   node examples/cobrar-para-una-cuenta-conectada.mjs <code>

import { randomUUID } from "node:crypto";

import { RayaClient } from "rayacash";

const code = process.argv[2];
const { RAYA_CLIENT_ID, RAYA_CLIENT_SECRET, RAYA_REDIRECT_URI } = process.env;
if (!code || !RAYA_CLIENT_ID || !RAYA_CLIENT_SECRET || !RAYA_REDIRECT_URI) {
  console.error(
    "Uso: RAYA_CLIENT_ID=… RAYA_CLIENT_SECRET=… RAYA_REDIRECT_URI=… " +
      "node examples/cobrar-para-una-cuenta-conectada.mjs <code>",
  );
  process.exit(1);
}

// 1. El code que llegó a tu redirect_uri se canjea una sola vez y sin clave: la app se identifica
//    con client_id y client_secret.
const token = await new RayaClient().oauth.token({
  client_id: RAYA_CLIENT_ID,
  client_secret: RAYA_CLIENT_SECRET,
  code,
  redirect_uri: RAYA_REDIRECT_URI, // la misma del link de autorización
});
// Guardá user_id y access_token juntos en tu servidor: el token no vence.
console.log(`Cuenta conectada ${token.user_id}`);

// 2. Con el access_token, un cliente para esa cuenta.
const connected = new RayaClient(token.access_token);
const user = await connected.users.retrieve(token.user_id);
console.log(`${user.full_name} (${user.identification?.type} ${user.identification?.number})`);
// No hace falta que haya configurado su negocio: si user.merchant es null, el primer pago se lo crea.

// 3. Un pago a su nombre, con tu comisión fija. En tu sistema: generá la clave y guardala con el
//    pedido ANTES de llamar, para que un reintento no cree otro pago.
const order = await connected.connect.orders.create(
  {
    items: [{ title: "Pedido 1042", quantity: 1, unit_price: 45000 }],
    fee: 500, // se retiene del pago y se liquida a tu cuenta
    external_reference: "pedido-1042",
    back_urls: { success: "https://tienda.example.com/pedidos/1042" },
    auto_return: "approved",
  },
  { idempotencyKey: randomUUID() },
);
console.log(`Pago ${order.id}: ${order.status}`);
console.log(`Pagá en ${order.checkout_url} antes de ${order.expires_at}`);
console.log(`El comercio recibe $${order.net_amount} y vos, $${order.fee}`);
// Te avisamos con connect.order.succeeded cuando llega la transferencia; el comercio recibe
// payment.*.
