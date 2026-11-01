// Webhooks con Fastify: en esta ruta, el body de application/json llega crudo (un Buffer).
//
//   npm install fastify rayacash
//   RAYA_WEBHOOK_SECRET=whsec_… node examples/webhook-fastify.mjs

import Fastify from "fastify";
import { SignatureVerificationError, Webhook } from "rayacash";

const secret = process.env.RAYA_WEBHOOK_SECRET;
if (!secret) throw new Error("Falta RAYA_WEBHOOK_SECRET (el whsec_… de Developers › Webhooks).");

const app = Fastify();
const processedEvents = new Set(); // en producción, tu base de datos

// Un plugin propio: el parser crudo vale solo para estas rutas, el resto sigue parseando JSON.
app.register(async (webhooks) => {
  webhooks.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) =>
    done(null, body),
  );

  webhooks.post("/webhooks/raya", async (request, reply) => {
    let event;
    try {
      event = Webhook.constructEvent(request.body, request.headers["raya-signature"], secret);
    } catch (error) {
      if (error instanceof SignatureVerificationError)
        return reply.code(400).send("Firma inválida");
      throw error;
    }

    // El mismo evento puede llegar más de una vez: procesá cada id una sola vez.
    if (processedEvents.has(event.id)) return reply.code(200).send();
    processedEvents.add(event.id);

    if (event.type === "payment.succeeded") {
      console.log(`Pagaron el pedido ${event.data.object.external_reference}: entregalo.`);
    } else if (event.type === "transfer.received") {
      console.log(`Depósito de $${event.data.object.net_amount}`);
    }
    // webhook.test y los tipos que no conocés: respondé 2xx e ignoralos.
    return reply.code(200).send();
  });
});

await app.listen({ port: 3000 });
