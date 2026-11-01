// Webhooks con Next.js (App Router): copialo a app/webhooks/raya/route.js. request.text() da el
// body crudo, sin parsear.
//
//   npm install rayacash
//   RAYA_WEBHOOK_SECRET=whsec_… en .env.local

import { SignatureVerificationError, Webhook } from "rayacash";

export const runtime = "nodejs"; // el SDK usa node:crypto: no corre en el runtime edge

export async function POST(request) {
  const secret = process.env.RAYA_WEBHOOK_SECRET;
  if (!secret) return new Response("Falta RAYA_WEBHOOK_SECRET", { status: 500 });

  const body = await request.text(); // crudo: request.json() lo re-serializaría
  let event;
  try {
    event = Webhook.constructEvent(body, request.headers.get("raya-signature"), secret);
  } catch (error) {
    if (error instanceof SignatureVerificationError) {
      return new Response("Firma inválida", { status: 400 });
    }
    throw error;
  }

  // El mismo evento puede llegar más de una vez y desordenado: guardá los event.id que procesaste.
  if (event.type === "payment.succeeded") {
    console.log(`Pagaron el pedido ${event.data.object.external_reference}: entregalo.`);
  }
  // Respondé 2xx en menos de 15 segundos; si tenés que hacer algo lento, guardalo y procesalo después.
  return new Response(null, { status: 200 });
}
