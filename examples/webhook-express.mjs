// Webhooks con Express: express.raw() deja el body crudo (un Buffer) para verificar la firma.
//
//   npm install express rayacash
//   RAYA_WEBHOOK_SECRET=whsec_… node examples/webhook-express.mjs

import express from "express";
import { SignatureVerificationError, Webhook } from "rayacash";

const secret = process.env.RAYA_WEBHOOK_SECRET;
if (!secret) throw new Error("Falta RAYA_WEBHOOK_SECRET (el whsec_… de Developers › Webhooks).");

const app = express();
const processedEvents = new Set(); // en producción, tu base de datos

// express.raw y no express.json: re-serializar el JSON cambia el body y la firma no coincide.
app.post("/webhooks/raya", express.raw({ type: "application/json" }), (req, res) => {
  let event;
  try {
    event = Webhook.constructEvent(req.body, req.get("Raya-Signature"), secret);
  } catch (error) {
    if (error instanceof SignatureVerificationError) return res.status(400).send("Firma inválida");
    throw error;
  }

  // El mismo evento puede llegar más de una vez: procesá cada id una sola vez.
  if (processedEvents.has(event.id)) return res.sendStatus(200);
  processedEvents.add(event.id);

  if (event.type === "payment.succeeded") {
    console.log(`Pagaron el pedido ${event.data.object.external_reference}: entregalo.`);
  } else if (event.type === "payment.failed") {
    console.log("Transfirieron de menos: devolvemos el dinero solos. No entregues el pedido.");
  } else if (event.type === "transfer.received") {
    console.log(`Depósito de $${event.data.object.net_amount}`);
  }
  // webhook.test y los tipos que no conocés: respondé 2xx e ignoralos.
  return res.sendStatus(200);
});

app.listen(3000, () => console.log("Webhooks en http://localhost:3000/webhooks/raya"));
