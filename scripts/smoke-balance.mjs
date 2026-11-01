// Prueba manual contra la API real: solo consulta el saldo (GET /v1/balance).
//
// No crea ni mueve nada. Nunca corre en CI: lo corrés vos, después de `npm run build`, con tu
// clave en la variable de entorno (nunca la pegues en un chat ni en el repositorio).
//
//   RAYA_SECRET_KEY=raya_sk_live_… node scripts/smoke-balance.mjs

import { config, RayaClient } from "rayacash";

config.log = "info";
const client = new RayaClient();
const balance = await client.balance.retrieve();
console.log(
  `Saldo disponible: $${balance.available} ${balance.currency} (request ${balance.lastResponse?.requestId})`,
);
