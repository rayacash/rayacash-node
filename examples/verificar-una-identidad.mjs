// @ts-check
// Verificar la identidad de un cliente con Identidad: sin argumentos, crea una verificación y
// muestra el link para la persona; con el id de una verificación, lee cómo salió.
//
// ATENCIÓN: correr este script sin argumentos crea una verificación en tu cuenta. Se cobra solo si
// la persona la completa y queda verified.
//
//   RAYA_SECRET_KEY=raya_sk_live_… node examples/verificar-una-identidad.mjs
//   RAYA_SECRET_KEY=raya_sk_live_… node examples/verificar-una-identidad.mjs idv_…

import { randomUUID } from "node:crypto";

import { RayaClient } from "rayacash";

const client = new RayaClient(); // lee RAYA_SECRET_KEY
const verificationId = process.argv[2];

if (!verificationId) {
  // En tu sistema: generá la clave y guardala con tu cliente ANTES de llamar, para que un
  // reintento (incluso después de un corte de tu proceso) no cree otra verificación.
  const verification = await client.identity.verifications.create(
    {
      type: "document",
      external_reference: "cliente-8812", // tu id del cliente, nunca datos personales
      metadata: { plan: "pro" },
      expires_in: 86400, // un día
    },
    { idempotencyKey: randomUUID() },
  );
  console.log(`Verificación ${verification.id}: ${verification.status}`);
  console.log(`Mandale este link a la persona: ${verification.url}`);
  console.log("(o abrila en tu web con Identity.js: npm install rayacash-identity)");
  console.log(`Vence: ${verification.expires_at}`);
  console.log("Te avisamos con identity.verification.*: después, corré este script con su id.");
} else {
  const verification = await client.identity.verifications.retrieve(verificationId);
  console.log(`Verificación ${verification.id}: ${verification.status}`);
  if (verification.status === "verified" && verification.person !== null) {
    // person son datos personales: guardalos en tu base y nunca los escribas en logs.
    console.log("Verificada: guardá verification.person con tu cliente.");
  } else if (verification.status === "declined") {
    // Decidí con el código, no con el mensaje (que puede cambiar).
    console.log(`Rechazada: ${verification.decline_reason?.code}`);
  } else if (verification.status === "pending" || verification.status === "in_progress") {
    console.log("La persona todavía no terminó. Si ya no hace falta, cancelala:");
    console.log(`  await client.identity.verifications.cancel("${verification.id}")`);
  }
  const { checks } = verification;
  console.log(
    `Controles: documento ${checks.document.status}, prueba de vida ${checks.liveness.status}, ` +
      `cara ${checks.face_match.status}, registro ${checks.registry.status}`,
  );
}
