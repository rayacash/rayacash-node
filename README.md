# rayacash

El SDK oficial de Node.js para la [API de Raya Cash](https://raya.cash/api). Te deja cobrar por transferencia con un CVU exclusivo por pago, mandar plata a cualquier CBU, CVU o alias, consultar tu saldo, conciliar tus depósitos y verificar los webhooks, con reintentos seguros e idempotencia incluidos.

```js
import { RayaClient } from "rayacash";

const client = new RayaClient(); // lee tu clave secreta de RAYA_SECRET_KEY

const payment = await client.payments.create({ amount: 15000, description: "Pedido #1042" });
console.log(payment.bank_transfer.cvu, payment.checkout_url);
```

Versión 1.0.2. Requiere Node.js 22 o más nuevo. Los cambios de cada versión están en [CHANGELOG.md](CHANGELOG.md).

## Contenido

- [Antes de empezar](#antes-de-empezar)
- [Instalación](#instalación)
- [Inicio rápido](#inicio-rápido)
- [Estilo global](#estilo-global)
- [ESM, CommonJS y TypeScript](#esm-commonjs-y-typescript)
- [Montos](#montos)
- [Idempotencia](#idempotencia)
- [Reintentos y timeouts](#reintentos-y-timeouts)
- [Paginación](#paginación)
- [Errores](#errores)
- [Webhooks](#webhooks)
- [Tests de tu integración](#tests-de-tu-integración)
- [Configuración avanzada](#configuración-avanzada)
- [Seguridad](#seguridad)
- [Versionado y compatibilidad](#versionado-y-compatibilidad)
- [Desarrollo](#desarrollo)

## Antes de empezar

1. **Tu cuenta de Raya con la identidad verificada** (si no, `API_KEY_ACCOUNT_LOCKED`) y la API habilitada (si no, `API_NOT_ENABLED`: escribinos a soporte@raya.cash).
2. **Tu clave secreta** (`raya_sk_live_…`), de [Developers › API Keys](https://raya.cash/dashboard/developers/api-keys). La vas a ver completa una sola vez: guardala en una variable de entorno de tu servidor.
3. **Para cobrar:** tu negocio configurado en [Configuración › Negocio](https://raya.cash/dashboard/settings/business). Sin eso, crear un pago da `MERCHANT_NOT_CONFIGURED`.
4. **Para los webhooks:** un destino en [Developers › Webhooks](https://raya.cash/dashboard/developers/webhooks) y su secreto (`whsec_…`).

## Instalación

```bash
npm install rayacash
# o
pnpm add rayacash
# o
yarn add rayacash
```

No tiene dependencias: usa el `fetch` y el `crypto` de Node.

## Inicio rápido

```js
import { RayaClient } from "rayacash";

const client = new RayaClient(process.env.RAYA_SECRET_KEY);

// Tu saldo disponible, en pesos.
const balance = await client.balance.retrieve();
console.log(balance.available);

// Cobrar: un pago con un CVU y un alias exclusivos.
let payment = await client.payments.create(
  {
    amount: 15000,
    description: "Pedido #1042",
    external_reference: "pedido-1042",
    return_url: "https://tienda.example.com/pedidos/1042",
    metadata: { cliente_id: "8812" },
  },
  { idempotencyKey: order.paymentIdempotencyKey }, // un UUID v4 guardado con el pedido
);
// Mostrá payment.bank_transfer.cvu y payment.bank_transfer.alias, o mandá a quien paga a:
console.log(payment.checkout_url);

// Consultar un pago (por ejemplo, cuando quien paga vuelve a return_url).
payment = await client.payments.retrieve(payment.id);
if (payment.status === "succeeded") {
  // entregá el pedido
}

// Reembolsar un pago (total, hasta 30 días después de pagado).
payment = await client.payments.refund(payment.id, { idempotencyKey: refund.idempotencyKey });

// Enviar una transferencia a un CBU, CVU o alias. La idempotencyKey es obligatoria.
const transfer = await client.transfers.create(
  { amount: "25000.50", destination: "0000123380736153041182" },
  { idempotencyKey: payout.idempotencyKey }, // guardala ANTES de llamar
);
console.log(transfer.status, transfer.counterparty.name); // "pending" (otro banco) o "completed" (Raya)

// Tus depósitos de un día, página por página.
const page = await client.transfers.list({
  direction: "inbound",
  created_gte: "2026-10-23T00:00:00-03:00",
  created_lt: "2026-10-24T00:00:00-03:00",
  limit: 100,
});
for await (const deposit of page.autoPagingIter()) {
  console.log(deposit.id, deposit.net_amount);
}
```

Cada método devuelve una promesa. Los parámetros van con los nombres de la API (`external_reference`, `created_gte`) y las opciones de la llamada, como la `idempotencyKey`, en el último argumento.

Cada respuesta es un objeto del SDK (`Balance`, `Transfer`, `Payment`, `Event` o `ListObject`) cuyos campos son exactamente el JSON de la API: `JSON.stringify(payment)` y `{ ...payment }` dan ese JSON. Los valores vienen tal como los manda la API: montos `number` y fechas en string ISO 8601 (`"2026-10-24T14:00:00Z"`). Si la API suma un campo nuevo, lo ves igual (`payment.campo_nuevo`).

Cada objeto trae `lastResponse`, con el `requestId` (`req_…`) que nos tenés que mandar si escribís a soporte:

```js
console.log(payment.lastResponse.requestId);
```

## Estilo global

También podés configurar una clave para todo el proceso y llamar a las clases:

```js
import { Balance, config, Payment, Transfer } from "rayacash";

config.apiKey = process.env.RAYA_SECRET_KEY; // si no la asignás, se lee de RAYA_SECRET_KEY

const balance = await Balance.retrieve();
let payment = await Payment.create({ amount: 15000, description: "Pedido #1042" });
payment = await Payment.retrieve(payment.id);
const refunded = await payment.refund(); // o Payment.refund(payment.id)
const transfer = await Transfer.create(
  { amount: 25000, destination: "proveedor.ejemplo" },
  { idempotencyKey: payout.idempotencyKey },
);
const page = await Transfer.list({ direction: "inbound" });
```

Los dos estilos usan el mismo núcleo y se comportan igual. `config` se lee en cada request, así que cambiarlo entre llamadas surte efecto enseguida, y está sellado: asignar una opción que no existe (`config.apikey`) falla en vez de no hacer nada. Preferí `RayaClient` si tu proceso usa más de una clave o si querés configurar cada cliente por separado. `payment.refund()` usa el cliente del que vino el pago: si lo trajiste con un `RayaClient`, usa ese cliente; si no, la configuración global.

## ESM, CommonJS y TypeScript

El paquete trae las dos versiones, ESM y CommonJS, y los tipos:

```js
import { RayaClient } from "rayacash"; // ESM
// const { RayaClient } = require("rayacash"); // CommonJS
```

En TypeScript, cada objeto conoce sus campos (`payment.bank_transfer.cvu` es `string`) y los enums son uniones (`payment.status` es `"pending" | "succeeded" | …`). `transfers.create` sin `idempotencyKey` no compila. Para distinguir el objeto de un evento, usá `instanceof`:

```js
import { Payment, Transfer } from "rayacash";

const object = event.data.object; // Transfer | Payment | RayaObject
if (object instanceof Payment) {
  console.log(object.external_reference);
} else if (object instanceof Transfer) {
  console.log(object.net_amount);
}
```

## Montos

- La API trabaja en **pesos** (no en centavos), con hasta 2 decimales. `currency` es siempre `"ARS"`.
- **Para mandar** un monto podés pasar un `number`, un `string` decimal, un `bigint` o un decimal exacto, como el `Decimal` de decimal.js o de Prisma (y los de big.js o bignumber.js): `15000`, `15000.5`, `"15000.50"`, `15000n` o `new Decimal("15000.50")`. Viaja como número JSON (nunca como string).
- **El SDK nunca redondea.** Si mandás más de 2 decimales (por ejemplo, un `number` con ruido como `0.1 + 0.2`), la API responde `PARAMETER_INVALID` y no se hace nada. Si tus montos salen de cuentas o de tu base de datos, pasalos como string o como `Decimal`.
- **Los montos que recibís** (`amount`, `fee`, `net_amount`, `available`…) llegan como `number`. Para sumar o comparar con exactitud, pasalos a centavos enteros:

```js
let cents = 0;
for (const transfer of page) cents += Math.round(transfer.net_amount * 100);
console.log((cents / 100).toFixed(2)); // exacto: "48169.59"
```

## Idempotencia

Con una `Idempotency-Key` podés reintentar un POST sin miedo a que se haga dos veces: si ya lo procesamos, te devolvemos el mismo resultado.

- **`transfers.create` exige la `idempotencyKey`.** Generá un UUID v4 (`crypto.randomUUID()`) para cada transferencia, **guardalo con la operación en tu base antes de llamar** y reusalo en cada reintento. Así, si tu proceso se corta después de mandar la request, el reintento no transfiere dos veces.
- En `payments.create` y `payments.refund` es opcional pero recomendada. Si no la pasás, el SDK genera una que protege solo los reintentos de esa llamada.
- El SDK reintenta siempre con la misma clave. La que usó queda en `obj.lastResponse.idempotencyKey` y en `error.idempotencyKey`, para que puedas reintentar más tarde.
- Guardamos cada clave 24 horas, para toda tu cuenta. Usar la misma clave con otros parámetros da `IdempotencyError` con `code === "IDEMPOTENCY_KEY_REUSED"`.
- Si una transferencia terminó `failed`, para intentarla de nuevo usá una clave **nueva**: con la misma te devolvemos la respuesta original.

```js
import { randomUUID } from "node:crypto";

import { APIConnectionError } from "rayacash";

const key = randomUUID();
await payout.saveIdempotencyKey(key); // primero guardala

try {
  const transfer = await client.transfers.create(
    { amount: 25000, destination: "proveedor.ejemplo" },
    { idempotencyKey: key },
  );
} catch (error) {
  if (error instanceof APIConnectionError) {
    // no sabemos si salió: reintentá más tarde con la MISMA key (nunca se hace dos veces)
  }
}
```

## Reintentos y timeouts

El SDK reintenta solo lo que es seguro reintentar, siempre con la misma `Idempotency-Key`:

| Respuesta | ¿Reintenta? | Espera |
|---|---|---|
| Sin respuesta (corte de conexión, timeout) | Sí | Exponencial con jitter (0,5 s, 1 s, 2 s… hasta 8 s) |
| `409 IDEMPOTENCY_KEY_IN_USE` | Sí | Lo que pide `Retry-After` |
| `429 RATE_LIMITED` | Sí | `Retry-After` |
| `408` y los `5xx` (`500`, `502`, `503`, `504`…) | Sí | `Retry-After` o exponencial |
| `503 API_UNAVAILABLE` (mantenimiento) | No | — |
| Cualquier otro `4xx` | No: no se hizo nada | — |

- Por defecto, **2 reintentos** (3 intentos en total). Cambialo con `new RayaClient({ maxNetworkRetries: … })` o por llamada con `{ maxNetworkRetries: 0 }` en las opciones.
- Si el servidor pide esperar más de 60 s (`Retry-After`), el SDK no se queda esperando: lanza el error con `error.retryAfter` (en segundos) para que lo reprogrames.
- **Timeout:** 65 s por intento (10 s para conectar), en **milisegundos**: `65_000`. Crear un pago puede tardar hasta 40 s si damos de alta un CVU nuevo y el servidor corta a los 60 s, así que no lo bajes de 60 000. Cambialo con `new RayaClient({ timeout: … })` o por llamada con `{ timeout: 90_000 }`.

```js
const client = new RayaClient({ maxNetworkRetries: 4, timeout: 90_000 });
const balance = await client.balance.retrieve({ timeout: 10_000, maxNetworkRetries: 0 });
```

## Paginación

`transfers.list()` devuelve una página (`ListObject`), de la más nueva a la más vieja. `for…of` recorre esa página; `autoPagingIter()` recorre todas, pidiendo las siguientes con los mismos filtros y opciones:

```js
const page = await client.transfers.list({
  direction: "inbound", // o "outbound"
  status: "completed", // pending, completed, failed o reversed
  created_gte: new Date("2026-10-01T00:00:00-03:00"), // un Date o un string ISO 8601 con zona
  created_lt: new Date("2026-11-01T00:00:00-03:00"), // rango semiabierto: los meses no se pisan
  limit: 100, // de 1 a 100 (por defecto, 20)
});
for await (const transfer of page.autoPagingIter()) {
  console.log(transfer.id, transfer.amount);
}

// A mano: page.data, page.has_more, page.next_cursor y await page.nextPage().
```

Los cobros de tus pagos no aparecen en Transferencias: se siguen en cada `Payment` y con los webhooks `payment.*`.

## Errores

Todos los errores extienden `RayaError` (que extiende `Error`). **Decidí con `error.code`** (estable), nunca con `error.message` (texto en castellano para personas, puede cambiar). Si llega un código que el SDK no conoce, la clase sale del código HTTP.

| Clase | HTTP | Códigos | Qué hacer |
|---|---|---|---|
| `InvalidRequestError` | 400, 405, 413 y los demás `4xx` | `PARAMETER_MISSING`, `PARAMETER_INVALID`, `PARAMETER_UNKNOWN`, `INVALID_JSON`… | Corregí la request: `error.param` dice qué parámetro falló. |
| `NotFoundError` (subclase de la anterior) | 404 | `PAYMENT_NOT_FOUND`, `TRANSFER_NOT_FOUND`, `NOT_FOUND` | No existe o no es de tu cuenta. |
| `AuthenticationError` | 401 | `API_KEY_MISSING`, `API_KEY_INVALID`, `API_KEY_EXPIRED`… | Revisá la clave secreta. |
| `PermissionDeniedError` | 403 | `API_KEY_ACCOUNT_LOCKED`, `API_NOT_ENABLED`, `MERCHANT_NOT_CONFIGURED`, `TRANSFERS_BLOCKED` | La cuenta no puede hacer esto todavía. |
| `IdempotencyError` | 409 | `IDEMPOTENCY_KEY_REUSED`, `IDEMPOTENCY_KEY_IN_USE` | Una clave por operación; si está en uso, reintentá más tarde con la misma. |
| `ConflictError` | 409 | `PAYMENT_NOT_REFUNDABLE` | Mirá `error.data.status` y `error.data.reason`. |
| `UnprocessableEntityError` | 422 | `INSUFFICIENT_BALANCE`, `LIMIT_EXCEEDED`, `DESTINATION_NOT_FOUND`, `DESTINATION_INACTIVE`, `DESTINATION_NOT_SUPPORTED`, `REFUND_FAILED` | No se arregla reintentando: mostráselo a la persona. |
| `RateLimitError` | 429 | `RATE_LIMITED` | Esperá `error.retryAfter` segundos. |
| `APIError` | 5xx y 408 | `INTERNAL_ERROR`, `BANK_UNAVAILABLE`, `CVU_UNAVAILABLE`, `API_UNAVAILABLE`, `TEMPORARILY_UNAVAILABLE` | Reintentá más tarde, en los POST con la misma `idempotencyKey`. |
| `APIConnectionError` | — | `NETWORK_ERROR`, `TIMEOUT` | No llegó respuesta: reintentá con la misma `idempotencyKey`. |

Cada error trae `code`, `message`, `data`, `httpStatus`, `requestId`, `idempotencyKey`, `retryAfter`, `headers` y el body crudo (`httpBody`, `jsonBody`). Los errores de programación (un parámetro con el tipo equivocado, una opción que no existe) son `TypeError` o `RangeError` y saltan antes de mandar nada.

```js
import { APIError, RayaError, UnprocessableEntityError } from "rayacash";

try {
  const transfer = await client.transfers.create(
    { amount: 25000, destination: "proveedor.ejemplo" },
    { idempotencyKey: key },
  );
} catch (error) {
  if (error instanceof UnprocessableEntityError) {
    console.log(error.code === "INSUFFICIENT_BALANCE" ? "No te alcanza el saldo." : error.message);
  } else if (error instanceof APIError && error.code === "BANK_UNAVAILABLE") {
    // no se descontó nada: reintentá más tarde con la misma key
  } else if (error instanceof RayaError) {
    console.log(`Falló (${error.code}). Request: ${error.requestId}`);
  } else {
    throw error;
  }
}
```

Un reembolso que la red todavía no confirmó sale como `APIError` con `code === "BANK_UNAVAILABLE"`: el pago sigue `succeeded` y la devolución nunca se manda dos veces. Esperá el webhook `payment.refunded` o reintentá más tarde con la misma clave.

## Webhooks

Te avisamos en tu servidor apenas pasa algo: `payment.succeeded` cuando llega la transferencia de un pago, `transfer.received` cuando te depositan, etc. **Antes de procesar un evento, verificá la firma**:

```js
import express from "express";
import { SignatureVerificationError, Webhook } from "rayacash";

const app = express();

app.post("/webhooks/raya", express.raw({ type: "application/json" }), (req, res) => {
  let event;
  try {
    event = Webhook.constructEvent(
      req.body, // el body crudo (un Buffer), sin parsear
      req.get("Raya-Signature"),
      process.env.RAYA_WEBHOOK_SECRET, // whsec_…
    );
  } catch (error) {
    if (error instanceof SignatureVerificationError) return res.status(400).send("Firma inválida");
    throw error;
  }

  if (alreadyProcessed(event.id)) return res.sendStatus(200); // el mismo evento puede llegar más de una vez

  if (event.type === "payment.succeeded") {
    fulfillOrder(event.data.object.external_reference);
  } else if (event.type === "transfer.received") {
    recordDeposit(event.data.object);
  }
  return res.sendStatus(200);
});
```

- **Usá el body crudo, tal como llegó.** Si tu framework ya parseó el JSON, volver a serializarlo cambia el body y la firma no coincide. En Express, `express.raw({ type: "application/json" })` en esa ruta (no `express.json()`); en Next.js (App Router), `await request.text()`; en Fastify, un parser de `application/json` con `parseAs: "buffer"`. Hay ejemplos completos en [`examples/`](examples).
- Respondé `2xx` en menos de 15 segundos. Si tenés que hacer algo lento, guardá el evento, respondé y procesalo después.
- El mismo evento puede llegar más de una vez y desordenado: guardá los `event.id` que procesaste y, si necesitás el estado actual, consultá el objeto con la API.
- `event.data.object` es el `Transfer` o el `Payment` tal como estaba cuando ocurrió el evento.
- «Enviar evento de prueba» (en Developers › Webhooks) manda un `webhook.test`: respondé `2xx` e ignoralo.
- La firma tolera 5 minutos de diferencia con tu reloj (`tolerance = 300`, en segundos). Mientras rotás el secreto llegan dos firmas: alcanza con que coincida una.
- Con `client.constructEvent(…)` el evento queda ligado a ese cliente: `event.data.object.refund()` usa su clave.

## Tests de tu integración

Para probar tu código sin llamar a la API, usá un `fetch` falso: no sale nada a la red.

```js
import assert from "node:assert/strict";

import { RayaClient } from "rayacash";

async function fakeFetch(url) {
  assert.equal(new URL(url).pathname, "/v1/balance");
  return Response.json({ object: "balance", available: 1500, currency: "ARS" });
}

const client = new RayaClient("raya_sk_live_test", { fetch: fakeFetch });
const balance = await client.balance.retrieve();
assert.equal(balance.available, 1500);
```

Para probar tu endpoint de webhooks, firmá el body con `WebhookSignature.generateHeader(body, secret)` y mandalo en el header `Raya-Signature`. Para armar objetos sin hacer requests: `Payment.constructFrom({ object: "payment", id: "…", status: "succeeded" })`.

## Configuración avanzada

```js
import { RayaClient } from "rayacash";

const client = new RayaClient({
  apiKey: "raya_sk_live_…",
  apiBase: "https://api.raya.cash", // https:// (o http://localhost para desarrollo)
  timeout: 65_000, // milisegundos por intento
  maxNetworkRetries: 2,
  fetch: myFetch, // el tuyo (proxies, certificados, tests)
  appInfo: { name: "mi-plugin", version: "1.2.0", url: "https://plugin.example" },
});
```

- **Proxies y certificados:** pasá tu propio `fetch`. Por ejemplo, con el paquete [undici](https://undici.nodejs.org/) y su `ProxyAgent`:

```js
import { RayaClient } from "rayacash";
import { fetch, ProxyAgent } from "undici";

const dispatcher = new ProxyAgent("http://proxy.interno:3128");
const client = new RayaClient({ fetch: (url, init) => fetch(url, { ...init, dispatcher }) });
```

- **`appInfo`:** identifica tu plugin en el `User-Agent` (`rayacash-node/1.0.2 … mi-plugin/1.2.0`), que ves en [Developers › Logs](https://raya.cash/dashboard/developers/logs). En el estilo global: `setAppInfo("mi-plugin", { version: "1.2.0" })`.
- **Logging:** con `RAYA_LOG=info` (o `config.log = "info"`) ves en stderr cada request, su status, su `request_id` y los reintentos; con `debug`, también la query y la idempotency key. Nunca logueamos la clave ni los bodies.
- **Endpoints nuevos:** si la API suma un endpoint antes que el SDK, usá `client.rawRequest("get", "/v1/…", { params, body })`: tiene la misma autenticación, reintentos y errores. La query va en `params`, nunca en la ruta.
- **Estilo global:** `config.apiBase`, `config.timeout`, `config.maxNetworkRetries`, `config.fetch`, `config.log` y `setAppInfo()`.

## Seguridad

- **La clave secreta va solo en tu servidor**, leída de una variable de entorno. Nunca en el navegador, en una app mobile ni en el repositorio. Para cobrar desde el navegador está [Raya.js](https://raya.cash/raya-js), con la clave pública.
- El SDK rechaza la clave pública (`raya_pk_…`) sin mandar nada, nunca la muestra completa (`console.log(client)` y `JSON.stringify(client)` la enmascaran) y nunca sigue redirects.
- Si la clave se filtró, rotala en Developers › API Keys con vencimiento «Ahora»: la anterior deja de funcionar al instante.
- Las requests que hacés con la clave secreta quedan 30 días en [Developers › Logs](https://raya.cash/dashboard/developers/logs).

## Versionado y compatibilidad

- [Semver](https://semver.org/lang/es/): los cambios incompatibles solo llegan en una versión mayor (`2.0.0`). Las menores (`1.1.0`) suman cosas sin romper nada y las de parche (`1.0.1`) corrigen errores. Todo queda anotado en el [CHANGELOG](CHANGELOG.md).
- La API puede sumar campos, valores de enums, eventos, códigos de error y endpoints. El SDK los deja pasar: tu código tiene que ignorar lo que no conoce.
- Node.js 22 o más nuevo, con ESM o CommonJS. Trae sus tipos de TypeScript.

## Desarrollo

```bash
npm ci                    # dependencias de desarrollo (no hay de runtime)
npm test                  # tests con node:test (nunca llaman a la API: usan un fetch falso)
npm run test:coverage     # lo mismo, con cobertura mínima del 95 %
npm run lint && npm run typecheck
npm run build             # dist/esm y dist/cjs
npm run check:package     # build, publint, attw y el paquete cargado con import y con require
```

Los ejemplos de [`examples/`](examples) importan `rayacash`: desde este repo, corré `npm run build` antes.

Para publicar una versión: subila con `npm version patch|minor|major --no-git-tag-version`, actualizá el CHANGELOG y creá un release `vX.Y.Z` en GitHub. El workflow `release.yml` corre los chequeos y publica en npm con Trusted Publishing.

---

Referencia de la API: https://raya.cash/api · Soporte: soporte@raya.cash
