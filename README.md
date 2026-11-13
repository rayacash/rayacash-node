# rayacash

El SDK oficial de Node.js para la [API de Raya Cash](https://raya.cash/api). Te deja cobrar por transferencia con un CVU exclusivo por pago, mandar plata a cualquier CBU, CVU o alias, consultar tu saldo, conciliar tus depósitos, verificar los webhooks, cobrar a nombre de las cuentas que conecten tu app, con tu comisión, y confirmar la identidad de tus clientes con su DNI y una prueba de vida; todo con reintentos seguros e idempotencia incluidos.

```js
import { RayaClient } from "rayacash";

const client = new RayaClient(); // lee tu clave secreta de RAYA_SECRET_KEY

const payment = await client.payments.create({ amount: 15000, description: "Pedido #1042" });
console.log(payment.bank_transfer.cvu, payment.checkout_url);
```

Versión 1.2.0. Requiere Node.js 22 o más nuevo. Los cambios de cada versión están en [CHANGELOG.md](CHANGELOG.md).

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
- [Identidad](#identidad)
- [Raya Connect](#raya-connect)
- [Errores](#errores)
- [Webhooks](#webhooks)
- [Sandbox](#sandbox)
- [Tests de tu integración](#tests-de-tu-integración)
- [Configuración avanzada](#configuración-avanzada)
- [Seguridad](#seguridad)
- [Versionado y compatibilidad](#versionado-y-compatibilidad)
- [Desarrollo](#desarrollo)

## Antes de empezar

1. **Tu cuenta de Raya con la identidad verificada** (si no, `API_KEY_ACCOUNT_LOCKED`) y la API habilitada (si no, `API_NOT_ENABLED`: escribinos a soporte@raya.cash).
2. **Tu clave secreta** (`raya_sk_live_…`), de [Developers › API Keys](https://raya.cash/dashboard/developers/api-keys). La vas a ver completa una sola vez: guardala en una variable de entorno de tu servidor. Si tu cuenta tiene [sandbox](#sandbox), cada sandbox tiene además su clave secreta de prueba (`raya_sk_test_…`), para probar sin plata real.
3. **Para cobrar:** tu negocio configurado en [Configuración › Negocio](https://raya.cash/dashboard/settings/business). Sin eso, crear un pago da `MERCHANT_NOT_CONFIGURED`.
4. **Para los webhooks:** un destino en [Developers › Webhooks](https://raya.cash/dashboard/developers/webhooks) y su secreto (`whsec_…`).
5. **Para cobrar a nombre de otras cuentas:** una aplicación en [Developers › Apps](https://raya.cash/dashboard/developers/apps), con su `client_id`, su `client_secret` y tus URLs de redirección. Ver [Raya Connect](#raya-connect).
6. **Para enviar [payouts](#payouts):** el descriptor del comercio configurado en [Configuración › Negocio](https://raya.cash/dashboard/settings/business). Sin eso, crear un payout da `PAYOUT_ORIGIN_UNAVAILABLE`.
7. **Para verificar identidades con [Identidad](#identidad):** Identidad activada en tu cuenta (la pedís desde [Identidad](https://raya.cash/dashboard/identity), en el dashboard: nos contás para qué la vas a usar y revisamos tu solicitud; hasta que la aprobemos, crear una verificación da `IDENTITY_NOT_ACTIVATED`) y, para el resultado, un destino de webhooks suscripto a los eventos de «Identidad». Identidad todavía no está disponible en el [sandbox](#sandbox): con una clave de prueba (`raya_sk_test_…`) responde 403 `SANDBOX_NOT_SUPPORTED`.

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

Cada respuesta es un objeto del SDK (`Balance`, `Transfer`, `Payment`, `ConnectOrder`, `ConnectPayout`, `User`, `OAuthToken`, `IdentityVerification`, `IdentityVerificationFiles`, `Event` o `ListObject`) cuyos campos son exactamente el JSON de la API: `JSON.stringify(payment)` y `{ ...payment }` dan ese JSON. Los valores vienen tal como los manda la API: montos `number` y fechas en string ISO 8601 (`"2026-10-24T14:00:00Z"`). Si la API suma un campo nuevo, lo ves igual (`payment.campo_nuevo`).

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

Los dos estilos usan el mismo núcleo y se comportan igual. `config` se lee en cada request, así que cambiarlo entre llamadas surte efecto enseguida, y está sellado: asignar una opción que no existe (`config.apikey`) falla en vez de no hacer nada. Preferí `RayaClient` si tu proceso usa más de una clave o si querés configurar cada cliente por separado. `payment.refund()` usa el cliente del que vino el pago: si lo trajiste con un `RayaClient`, usa ese cliente; si no, la configuración global. Las apps tienen lo mismo: `OAuth.token(…)`, `User.retrieve(…)`, `ConnectOrder.create/retrieve/refund(…)` y `order.refund()`, con `config.apiKey` igual al access_token de la cuenta conectada. `ConnectPayout.create/retrieve/list(…)` va con tu clave secreta, igual que Identidad: `IdentityVerification.create/retrieve/list/cancel/files(…)` y `verification.cancel()`. En un [sandbox](#sandbox), con su clave secreta de prueba, también `Payment.simulateTransfer(…)`.

## ESM, CommonJS y TypeScript

El paquete trae las dos versiones, ESM y CommonJS, y los tipos:

```js
import { RayaClient } from "rayacash"; // ESM
// const { RayaClient } = require("rayacash"); // CommonJS
```

En TypeScript, cada objeto conoce sus campos (`payment.bank_transfer.cvu` es `string`) y los enums son uniones (`payment.status` es `"pending" | "succeeded" | …`). `transfers.create` sin `idempotencyKey` no compila. Para distinguir el objeto de un evento, usá `instanceof`:

```js
import { ConnectOrder, Payment, Transfer } from "rayacash";

const object = event.data.object; // Transfer | Payment | ConnectOrder | IdentityVerification | RayaObject
if (object instanceof Payment) {
  console.log(object.external_reference);
} else if (object instanceof Transfer) {
  console.log(object.net_amount);
} else if (object instanceof ConnectOrder) {
  console.log(object.fee); // tu comisión
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

- **`transfers.create` y `connect.payouts.create` exigen la `idempotencyKey`.** Generá un UUID v4 (`crypto.randomUUID()`) para cada transferencia o payout, **guardalo con la operación en tu base antes de llamar** y reusalo en cada reintento. Así, si tu proceso se corta después de mandar la request, el reintento no transfiere dos veces.
- En `payments.create`, `payments.refund`, `connect.orders.create`, `connect.orders.refund`, `identity.verifications.create` e `identity.verifications.cancel` es opcional pero recomendada. Si no la pasás, el SDK genera una que protege solo los reintentos de esa llamada. `oauth.token` y `testHelpers.payments.simulateTransfer` (del [sandbox](#sandbox)) son los únicos POST que no la llevan: el `code` se canjea una sola vez y un pago se simula una sola vez.
- El SDK reintenta siempre con la misma clave. La que usó queda en `obj.lastResponse.idempotencyKey` y en `error.idempotencyKey`, para que puedas reintentar más tarde.
- Guardamos cada clave 24 horas, para toda tu cuenta. Usar la misma clave con otros parámetros da `IdempotencyError` con `code === "IDEMPOTENCY_KEY_REUSED"`.
- Si una transferencia o un payout terminó `failed`, para intentarlo de nuevo usá una clave **nueva**: con la misma te devolvemos la respuesta original.

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

Los cobros de tus pagos no aparecen en Transferencias: se siguen en cada `Payment` y con los webhooks `payment.*`. Los [payouts](#payouts) sí aparecen, con el mismo `id`: no los cuentes dos veces.

## Identidad

Con **Identidad** verificás la identidad de tus clientes: la persona le saca una foto a su DNI, hace una prueba de vida y validamos sus datos y su cara contra el Registro Nacional de las Personas (RENAPER). Creás la verificación desde tu servidor, con tu clave secreta, y la persona la completa en nuestra página, desde su teléfono o su computadora: vos no manejás fotos ni datos biométricos. El resultado te llega por webhook. La guía completa está en la [referencia de la API › Identidad](https://raya.cash/api/identity).

| Método | Endpoint | Devuelve |
|---|---|---|
| `client.identity.verifications.create(params, options?)` | `POST /v1/identity/verifications` | `IdentityVerification` |
| `client.identity.verifications.retrieve(verificationId, options?)` | `GET /v1/identity/verifications/:id` | `IdentityVerification` |
| `client.identity.verifications.list(params?, options?)` | `GET /v1/identity/verifications` | `ListObject<IdentityVerification>` |
| `client.identity.verifications.cancel(verificationId, options?)` | `POST /v1/identity/verifications/:id/cancel` | `IdentityVerification` |
| `client.identity.verifications.files(verificationId, options?)` | `GET /v1/identity/verifications/:id/files` | `IdentityVerificationFiles` |

En el estilo global son `IdentityVerification.create`, `retrieve`, `list`, `cancel` y `files`, más `verification.cancel()` en la instancia, que usa el cliente del que vino.

Hay dos tipos:

- **`document`** es la completa: DNI (frente y dorso), prueba de vida y validación de los datos y de la cara contra el registro.
- **`biometric`** es solo una prueba de vida, comparada con la de una `document` anterior de la misma persona: en `reference` va el `id` de una verificación `document` de tu cuenta ya `verified`, con `checks.registry.face_match` en `hit`. Sirve para volver a confirmar a alguien antes de una operación sensible: no pide el documento y se resuelve en el momento.

El flujo:

1. **Creá la verificación** y mandale a la persona su `url`, o abrila adentro de tu sitio con [Identity.js](#en-el-navegador-identityjs).

   ```js
   import { RayaClient } from "rayacash";

   const client = new RayaClient(process.env.RAYA_SECRET_KEY);

   const verification = await client.identity.verifications.create(
     {
       type: "document",
       external_reference: "cliente-8812", // tu id del cliente, nunca datos personales
       return_url: "https://tienda.example.com/cuenta",
       expires_in: 86400, // un día (por defecto, 7)
       metadata: { plan: "pro" },
     },
     { idempotencyKey: customer.verificationKey }, // un UUID v4 guardado con tu cliente
   );
   console.log(verification.url); // mandale este link a la persona
   ```

2. **Esperá el webhook.** Cuando la verificación llega a un estado final, te avisamos con `identity.verification.verified`, `identity.verification.declined`, `identity.verification.expired` o `identity.verification.canceled` (ver [Webhooks](#webhooks)). En los eventos, `person` viene siempre en `null`.

3. **Leé el resultado** desde tu servidor. Los datos de la persona (`person`) vienen solo acá y solo si está `verified`:

   ```js
   const result = await client.identity.verifications.retrieve(verification.id);
   if (result.status === "verified") {
     await savePerson(customer.id, result.person); // nombre, DNI, CUIL, nacimiento y domicilio
   } else if (result.status === "declined") {
     console.log(result.decline_reason?.code); // decidí con code, no con message
   }
   ```

4. **Las imágenes**, si te hacen falta: el frente y el dorso del DNI y la selfie, cada una con una URL firmada que vence a los 5 minutos. Bajalas enseguida, con tu propio `fetch`, y no guardes las URLs. Las que esa verificación no tiene (`front` y `back` en una `biometric`) vienen en `null`.

   ```js
   const files = await client.identity.verifications.files(verification.id);
   if (files.selfie) {
     const image = await fetch(files.selfie.url);
     await saveImage(verification.id, await image.arrayBuffer());
   }
   ```

5. **Cancelá** la que ya no hace falta, mientras la persona no la terminó (`pending` o `in_progress`): su link deja de andar y no se cobra. Y **listá** las tuyas, de la más nueva a la más vieja (las de la API y las del dashboard):

   ```js
   await client.identity.verifications.cancel(verification.id);

   const page = await client.identity.verifications.list({
     status: "verified", // pending, in_progress, processing, verified, declined, expired o canceled
     type: "document", // o "biometric"
     external_reference: "cliente-8812", // coincidencia exacta
     created_gte: new Date("2026-11-01T00:00:00-03:00"),
     limit: 100,
   });
   for await (const item of page.autoPagingIter()) {
     console.log(item.id, item.status);
   }
   ```

| Estado | Qué quiere decir |
|---|---|
| `pending` | Nadie empezó todavía. |
| `in_progress` | La persona tocó «Empezar» y la está haciendo. |
| `processing` | Terminó la captura y estamos validando contra el registro (dura segundos). |
| `verified` | Aprobada: es la única que da por buena la identidad. |
| `declined` | Rechazada: mirá `decline_reason.code`. |
| `expired` | Pasó `expires_at` sin que la persona la terminara. |
| `canceled` | La cancelaste antes de que la persona la terminara. |

| Evento | Cuándo |
|---|---|
| `identity.verification.verified` | La persona completó la verificación y validamos su identidad. |
| `identity.verification.declined` | No pudimos validar la identidad de la persona. |
| `identity.verification.expired` | El link venció antes de que la persona completara la verificación. |
| `identity.verification.canceled` | Cancelaste la verificación antes de que la persona la completara. |

- `checks` trae cada control (`document`, `liveness`, `face_match` y `registry`) con su `status`: `passed`, `failed`, `pending`, `unavailable` o `not_applicable`. Los motivos de `decline_reason.code` son `face_mismatch`, `registry_not_found`, `registry_data_mismatch`, `registry_unavailable` y `attempts_exhausted`.
- Se cobra solo cada verificación que termina `verified`: `amount` es lo que se cobra, fijo desde que pasa a `verified` (`null` en cualquier otro estado). Las tarifas de tu cuenta están en Identidad › Tarifas.
- `expires_in` va en segundos, entre 3600 (1 hora) y 2592000 (30 días). Por defecto, 7 días.
- La `idempotencyKey` es opcional en `create` y en `cancel` (ver [Idempotencia](#idempotencia)): si no la pasás, el SDK genera una por llamada.
- Cancelar una que ya está `canceled` la devuelve igual. Si la persona ya terminó la captura, da `ConflictError` con `code === "VERIFICATION_NOT_CANCELABLE"` y el estado en `error.data.status`.
- Un id que no existe o no es de tu cuenta da `NotFoundError` con `code === "VERIFICATION_NOT_FOUND"`. Si tu cuenta todavía no tiene Identidad activada (no la pediste, la estamos revisando o no la aprobamos), `create` da `PermissionDeniedError` con `code === "IDENTITY_NOT_ACTIVATED"`.
- Cada cuenta tiene un tope de verificaciones abiertas y otro de creaciones por día. Al llegar, `create` da `RateLimitError` con `retryAfter` en 3600 y `error.data.limit` en `open` o `daily`: el SDK no se queda esperando.
- **`person` y las imágenes son datos personales** de quien se verifica: usalos solo para lo que esa persona aceptó, guardá lo mínimo y no los escribas en logs (`console.log(verification)` los muestra). Tampoco pongas datos personales en `external_reference` ni en `return_url`: viajan en URLs.

### En el navegador: Identity.js

Para que la persona haga la verificación sin salir de tu sitio, tu página la abre con **Identity.js**. No usa ninguna clave: solo el `id` de una verificación que creó tu servidor. Este SDK y tu clave secreta van solo en tu servidor. Identity.js se carga de dos formas, con el mismo código: el paquete `rayacash-identity` de npm, si tu sitio usa un bundler, o un `<script>` desde el CDN de Raya.

```bash
npm install rayacash-identity
```

En tu servidor, creá la verificación y devolvele el `id` a tu página:

```js
app.post("/verificaciones", async (request, response) => {
  const verification = await client.identity.verifications.create({
    type: "document",
    external_reference: String(request.user.id), // va como texto
  });
  response.json({ id: verification.id });
});
```

En tu página, abrila cuando la persona toca tu botón (`<button id="verificar" type="button">Verificar mi identidad</button>`):

```js
import { RayaIdentity } from "rayacash-identity";

const identity = RayaIdentity();
document.querySelector("#verificar").addEventListener("click", async () => {
  const response = await fetch("/verificaciones", { method: "POST" });
  const { id } = await response.json();
  const result = await identity.open(id);
  if (result.status === "completed") {
    // mostrale que ya terminó: el resultado que cuenta te llega por webhook
  }
});
```

- Lo que ves en el navegador es solo para la pantalla: antes de dar por verificada a la persona, esperá el webhook `identity.verification.verified` o consultá `client.identity.verifications.retrieve(id)` en tu servidor. Un `result.status` en `closed` no quiere decir que no se verificó: pudo haber seguido en otra pestaña.
- Sin bundler, con un `<script>` desde el CDN de Raya: `<script src="https://cdn.raya.cash/identity/v1/identity.js"></script>` deja `RayaIdentity` en `window`. Después va el mismo código, sin el `import`, en un `<script>` tuyo y después del botón. `v1` es siempre la última 1.x; para fijar una versión, `https://cdn.raya.cash/identity/v1.0.0/identity.js` con el `integrity` que publica el CHANGELOG de `rayacash-identity` y `crossorigin="anonymous"`. Nunca lo cargues desde un CDN de terceros.
- Si tu sitio manda una Content-Security-Policy, sumá `frame-src https://raya.cash` (y, si mandás `Permissions-Policy`, `camera=(self "https://raya.cash")`). Con el `<script>`, sumá también `https://cdn.raya.cash` a `script-src`, y el código de tu página va en un archivo tuyo (lo cubre `'self'`) o con tu nonce: un `<script>` inline sin nonce no corre. Con npm, `script-src` no cambia. Tu página tiene que estar en `https://`.
- Sin Identity.js también funciona: mandá a la persona a `verification.url` y usá `return_url` para que vuelva.

`client.identity`, `IdentityVerification` e `IdentityVerificationFiles` existen desde la 1.2.0. Hay un ejemplo completo en [`examples/verificar-una-identidad.mjs`](examples/verificar-una-identidad.mjs).

## Raya Connect

Con **Raya Connect** cobrás con una **app** a nombre de otras cuentas de Raya (las **cuentas conectadas**) y te quedás con una comisión fija por cobro. Es el modelo de las plataformas y los marketplaces: creás la app en [Developers › Apps](https://raya.cash/dashboard/developers/apps), cada comercio la conecta una vez y desde ahí creás **pagos** a su nombre. Al acreditarse, lo cobrado menos tu comisión se liquida al comercio y la comisión, a tu cuenta, cada uno con su plazo de liquidación (que se puede adelantar). Para enviarles dinero a tus vendedores desde tu saldo, con tu clave secreta y sin pasar por una app, están los [payouts](#payouts).

El flujo tiene cuatro pasos:

1. **El link de autorización.** Ponelo en tu web, por ejemplo en un botón «Conectar con Raya». Cuando el comercio lo toca, ve tu app y los permisos, y autoriza: lo redirigimos a tu `redirect_uri` (una de las registradas en la app, idéntica) con un `code` que dura 10 minutos y se canjea una sola vez.

   ```text
   https://raya.cash/authorization?client_id=7650337728110670&response_type=code&redirect_uri=https%3A%2F%2Ftienda.example.com%2Fraya%2Fcallback
   ```

   `state` es opcional, pero recomendado: evita que alguien le haga conectar a tu usuario una cuenta que no es la suya (CSRF). No es un valor fijo ni se escribe a mano, y no sirve para pasar datos (como el id del comercio en tu sistema): viaja en la URL y cualquiera lo puede cambiar. Tu botón apunta a una ruta de tu servidor que, en cada clic, genera uno aleatorio nuevo, lo guarda en la sesión y redirige al link con `&state=<ese valor>`. Te lo devolvemos tal cual en la `redirect_uri` y ahí comprobás que sea el mismo (paso 2). Con Express:

   ```js
   import crypto from "node:crypto";

   // Tu botón «Conectar con Raya» apunta acá.
   app.get("/raya/conectar", (request, response) => {
     const state = crypto.randomBytes(32).toString("hex"); // aleatorio y nuevo en cada clic
     request.session.rayaState = state;
     const query = new URLSearchParams({
       client_id: process.env.RAYA_CLIENT_ID,
       response_type: "code",
       redirect_uri: "https://tienda.example.com/raya/callback",
       state,
     });
     response.redirect(`https://raya.cash/authorization?${query}`);
   });
   ```

2. **Canjeá el `code` por el access_token.** Antes, si mandaste `state`, sacalo de la sesión (se usa una sola vez) y comparalo con el que volvió: si no había uno o no coincide, no canjees el `code`. `oauth.token` no lleva clave (la app se identifica con `client_id` y `client_secret`) ni `Idempotency-Key` (el `code` se canjea una sola vez). Guardá `access_token` y `user_id` juntos en tu servidor, con la cuenta de tu plataforma (la de tu login, nunca la del `state`): el token no vence y deja de valer si la cuenta desconecta tu app o la vuelve a autorizar (ahí recibís uno nuevo).

   ```js
   import { RayaClient } from "rayacash";

   const raya = new RayaClient(); // el canje no necesita clave

   // Tu redirect_uri: GET /raya/callback?code=…&state=…
   app.get("/raya/callback", async (request, response) => {
     // El state se usa una sola vez: sacalo de la sesión y comparalo con el que volvió.
     const expected = request.session.rayaState;
     delete request.session.rayaState;
     if (!expected || request.query.state !== expected) {
       return response.status(400).send("state inválido"); // no salió de tu botón
     }
     if (request.query.error === "access_denied") {
       return response.redirect("/conectar?cancelado=1"); // la cuenta no autorizó
     }
     const token = await raya.oauth.token({
       client_id: process.env.RAYA_CLIENT_ID,
       client_secret: process.env.RAYA_CLIENT_SECRET,
       code: request.query.code,
       redirect_uri: "https://tienda.example.com/raya/callback", // la misma del link
     });
     await saveConnection(request.session.sellerId, token.user_id, token.access_token);
     response.redirect("/conectar?ok=1");
   });
   ```

3. **Leé la cuenta conectada.** Con un cliente armado con su access_token: nombre, documento, CUIL o CUIT, los datos de identidad que verificó Raya y su negocio (`merchant`: lo que ve quien paga).

   ```js
   // connection: el access_token y el user_id que guardaste en el paso 2.
   const connected = new RayaClient(connection.access_token);

   const user = await connected.users.retrieve(connection.user_id); // o "me"
   console.log(user.full_name, user.identification?.number, user.merchant?.name);
   ```

4. **Cobrá a su nombre.** Un pago de Connect es como un `Payment`, con ítems y tu comisión (`fee`: un monto en pesos, no un porcentaje). Mandá a quien paga a `checkout_url`: nuestra página con el nombre y la imagen del comercio conectado, que se actualiza sola cuando llega la transferencia y, con `auto_return`, lo devuelve a tu `back_urls.success`.

   ```js
   const order = await connected.connect.orders.create(
     {
       items: [{ title: "Pedido 1042", quantity: 1, unit_price: 45000 }],
       fee: 500, // tu comisión: se retiene del pago y se liquida a tu cuenta
       external_reference: "pedido-1042",
       back_urls: {
         success: "https://tienda.example.com/pedidos/1042",
         failure: "https://tienda.example.com/pedidos/1042/error",
       },
       auto_return: "approved",
       notification_url: "we_3fN8kQ2vX7mB1pR5tZ9cW4yD", // tu destino de Developers › Webhooks
       metadata: { pedido_id: "1042" },
     },
     { idempotencyKey: pedido.idempotencyKey }, // un UUID v4 guardado con el pedido
   );
   console.log(order.checkout_url, order.net_amount, order.fee); // 44500 para el comercio, 500 para vos

   // Después: consultarlo o reembolsarlo (total, hasta 30 días después de pagado).
   const paid = await connected.connect.orders.retrieve(order.id);
   if (paid.status === "succeeded") {
     // entregá el pedido
   }
   const refunded = await paid.refund({ idempotencyKey: refund.idempotencyKey }); // o connected.connect.orders.refund(id)
   ```

- Los eventos de los pagos que crea tu app (`connect.order.created`, `connect.order.succeeded`, `connect.order.failed` y `connect.order.refunded`) llegan a tus webhooks con el `ConnectOrder` en `event.data.object`; el comercio conectado recibe los `payment.*` del mismo cobro con su propia clave. Con `notification_url` elegís el destino, por id (`we_…`) o por URL; sin él, van a tus destinos suscriptos a `connect.order.*`.
- `expires_in` (de 300 a 864000 segundos) acorta o alarga el plazo de pago; por defecto es el del comercio conectado (24 horas). Cada pago `pending` ocupa un CVU del comercio: no lo alargues más de lo necesario.
- Si la cuenta desconecta tu app (Configuración › Apps externas), el access_token deja de valer: `AuthenticationError` con `code === "ACCESS_TOKEN_REVOKED"`. Pedile que vuelva a autorizar y guardá el token nuevo. Los pagos `pending` siguen hasta vencer.
- La cuenta conectada no necesita haber configurado su negocio en Raya: si no lo hizo (`user.merchant` es `null`), el primer pago le crea el comercio con sus datos legales. `PermissionDeniedError` con `code === "CONNECTED_ACCOUNT_NOT_CONFIGURED"` queda para el caso raro de una cuenta sin CUIT/CUIL válido (lo resuelve soporte); si no puede operar, `CONNECTED_ACCOUNT_LOCKED` (con `error.data.reason`). Un code vencido, ya usado o con otra `redirect_uri` da `InvalidRequestError` con `code === "OAUTH_GRANT_INVALID"`.
- El access_token vale en todos los lugares donde va la clave: `new RayaClient(accessToken)`, `config.apiKey`, `RAYA_SECRET_KEY` o la opción `apiKey` de una llamada. Con él solo podés usar `users` y `connect.orders`; el resto de la API, incluidos los payouts, va con tu clave secreta.

**Probar en un sandbox.** Si tu cuenta tiene [sandbox](#sandbox), ahí recorrés el flujo entero sin una segunda cuenta de Raya y sin plata real: creás la app y usuarios de prueba, los conectás con tu link de autorización, `oauth.token` te da un access_token de prueba (`raya_at_test_…`) y con él cobrás a su nombre; después simulás la transferencia y te llegan los webhooks.

Hay un ejemplo completo en [`examples/cobrar-para-una-cuenta-conectada.mjs`](examples/cobrar-para-una-cuenta-conectada.mjs) y la guía entera, con la pantalla de autorización y la liquidación, en la [referencia de la API › Connect](https://raya.cash/api/connect).

### Payouts

Cobrás a nombre de tu negocio con `client.payments.create` y después les enviás el dinero a tus vendedores desde tu saldo, por CBU, CVU o alias. Los payouts no pasan por una app: salen de la cuenta de tu negocio y se autentican con **tu clave secreta**, no con el access_token de una cuenta conectada.

```js
import { randomUUID } from "node:crypto";
import { RayaClient } from "rayacash";

const client = new RayaClient(); // tu clave secreta, de RAYA_SECRET_KEY

const key = randomUUID();
await liquidacion.saveIdempotencyKey(key); // primero guardala

const payout = await client.connect.payouts.create(
  { amount: 60000, destination: "0000123305838495183140" }, // un CBU, un CVU o un alias
  { idempotencyKey: key },
);
console.log(payout.status, payout.counterparty.name); // "pending" y el titular del destino
console.log(payout.amount, payout.processing_fee, payout.net_amount); // 60000, 870.25 y 59129.75

// Después: consultar uno o recorrer todos (status, created_gte, created_lt, limit y cursor).
const current = await client.connect.payouts.retrieve(payout.id);
const page = await client.connect.payouts.list({ status: "completed", limit: 100 });
for await (const sent of page.autoPagingIter()) {
  console.log(sent.id, sent.net_amount, sent.counterparty.name);
}
```

- `amount` es lo que sale de tu saldo y la comisión se descuenta de ahí: la cuenta de destino recibe `net_amount`, que es `amount` menos `processing_fee`.
- Solo mandás `amount` y `destination`: buscamos al titular y te lo devolvemos en `counterparty`. No hay paso de confirmación, así que revisá el destino antes de llamar.
- Descontamos `amount` de tu saldo apenas lo creás. Si el destino es una cuenta de Raya, vuelve `completed`; si no, queda `pending` hasta que se procesa (en general, en uno o dos minutos) y te avisamos con `transfer.sent` o `transfer.failed`, con el mismo `id`, el mismo `amount` y el `processing_fee` en `fee`. Si falla o se revierte (`failed` o `reversed`), te devolvemos `amount` entero a tu saldo, incluida la comisión.
- La `idempotencyKey` es obligatoria (ver [Idempotencia](#idempotencia)): guardala antes de llamar y reusala en cada reintento, y nunca se envía dos veces.
- Sale solo de tu saldo disponible (si no alcanza, `UnprocessableEntityError` con `code === "INSUFFICIENT_BALANCE"`). Los cobros de tus pagos se suman cuando se liquidan: un pago `succeeded` no significa que ya puedas enviar ese dinero.
- Si tu negocio todavía no tiene una cuenta propia desde la que enviar, `connect.payouts.create` da `PermissionDeniedError` con `code === "PAYOUT_ORIGIN_UNAVAILABLE"`: primero configurá el descriptor del comercio en [Configuración › Negocio](https://raya.cash/dashboard/settings/business). Un id que no existe o que no es de un payout tuyo da `NotFoundError` con `code === "PAYOUT_NOT_FOUND"`.
- Los payouts todavía no están disponibles en el sandbox: con una clave de prueba (`raya_sk_test_…`) responden 403 `SANDBOX_NOT_SUPPORTED`.

`client.oauth` y `client.users` existen desde la 1.1.0, y `client.connect`, `ConnectOrder` y `ConnectPayout`, desde la 1.2.0. Si venís de la 1.1.0: `client.checkout.orders` y `Checkout` siguen andando como alias deprecados hasta la 2.0.0; en código nuevo usá los nombres de arriba.

## Errores

Todos los errores extienden `RayaError` (que extiende `Error`). **Decidí con `error.code`** (estable), nunca con `error.message` (texto en castellano para personas, puede cambiar). Si llega un código que el SDK no conoce, la clase sale del código HTTP.

| Clase | HTTP | Códigos | Qué hacer |
|---|---|---|---|
| `InvalidRequestError` | 400, 405, 413 y los demás `4xx` | `PARAMETER_MISSING`, `PARAMETER_INVALID`, `PARAMETER_UNKNOWN`, `INVALID_JSON`, `OAUTH_GRANT_INVALID`, `OAUTH_GRANT_TYPE_UNSUPPORTED`… | Corregí la request: `error.param` dice qué parámetro falló. |
| `NotFoundError` (subclase de la anterior) | 404 | `PAYMENT_NOT_FOUND`, `TRANSFER_NOT_FOUND`, `ORDER_NOT_FOUND`, `USER_NOT_FOUND`, `NOT_FOUND`, `PAYOUT_NOT_FOUND`, `VERIFICATION_NOT_FOUND` | No existe o no es de tu cuenta (ni de la cuenta conectada). |
| `AuthenticationError` | 401 | `API_KEY_MISSING`, `API_KEY_INVALID`, `API_KEY_EXPIRED`, `ACCESS_TOKEN_MISSING`, `ACCESS_TOKEN_INVALID`, `ACCESS_TOKEN_REVOKED`, `OAUTH_CLIENT_INVALID`… | Revisá la clave secreta o el access_token. `ACCESS_TOKEN_REVOKED`: la cuenta desconectó tu app. |
| `PermissionDeniedError` | 403 | `API_KEY_ACCOUNT_LOCKED`, `API_NOT_ENABLED`, `MERCHANT_NOT_CONFIGURED`, `TRANSFERS_BLOCKED`, `CONNECTED_ACCOUNT_LOCKED`, `CONNECTED_ACCOUNT_NOT_CONFIGURED`, `APP_DISABLED`, `PAYOUT_ORIGIN_UNAVAILABLE`, `SANDBOX_NOT_SUPPORTED`, `SANDBOX_ONLY`, `IDENTITY_NOT_ACTIVATED` | La cuenta (o la cuenta conectada) no puede hacer esto todavía. `SANDBOX_NOT_SUPPORTED`: ese endpoint todavía no está disponible en el sandbox (usaste una credencial de prueba). `SANDBOX_ONLY`: `testHelpers` solo funciona en un sandbox, con su clave secreta de prueba. `IDENTITY_NOT_ACTIVATED`: activá Identidad desde el dashboard antes de crear verificaciones. Si no la aprobamos, escribinos a soporte@raya.cash. |
| `IdempotencyError` | 409 | `IDEMPOTENCY_KEY_REUSED`, `IDEMPOTENCY_KEY_IN_USE` | Una clave por operación; si está en uso, reintentá más tarde con la misma. |
| `ConflictError` | 409 | `PAYMENT_NOT_REFUNDABLE`, `PAYMENT_NOT_PENDING`, `VERIFICATION_NOT_CANCELABLE` | Mirá `error.data.status` (y, en un reembolso, `error.data.reason`). `PAYMENT_NOT_PENDING`: ese pago de prueba ya no está pendiente, así que no se puede simular. |
| `UnprocessableEntityError` | 422 | `INSUFFICIENT_BALANCE`, `LIMIT_EXCEEDED`, `DESTINATION_NOT_FOUND`, `DESTINATION_INACTIVE`, `DESTINATION_NOT_SUPPORTED`, `REFUND_FAILED` | No se arregla reintentando: mostráselo a la persona. |
| `RateLimitError` | 429 | `RATE_LIMITED` | Esperá `error.retryAfter` segundos. Si es el tope de verificaciones de Identidad, `error.data.limit` es `open` o `daily`. |
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

Te avisamos en tu servidor apenas pasa algo: `payment.succeeded` cuando llega la transferencia de un pago, `transfer.received` cuando te depositan, `connect.order.succeeded` cuando se acredita un pago de tu app, `identity.verification.verified` cuando verificamos a una persona, etc. **Antes de procesar un evento, verificá la firma**:

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
- `event.data.object` es el `Transfer`, el `Payment`, el `ConnectOrder` o la `IdentityVerification` tal como estaba cuando ocurrió el evento. Los `connect.order.*` le llegan al dueño de la app; el comercio conectado recibe los `payment.*` del mismo cobro. Los `identity.verification.*` traen la verificación siempre con `person` en `null`: pedí los datos con `client.identity.verifications.retrieve(id)`.
- «Enviar evento de prueba» (en Developers › Webhooks) manda un `webhook.test`: respondé `2xx` e ignoralo.
- `event.livemode` es `true` en tu cuenta real y `false` en un [sandbox](#sandbox). Un evento emitido antes de que existiera el campo no lo trae si se reenvía (es `undefined`): tratalo como `true`.
- La firma tolera 5 minutos de diferencia con tu reloj (`tolerance = 300`, en segundos). Mientras rotás el secreto llegan dos firmas: alcanza con que coincida una.
- Con `client.constructEvent(…)` el evento queda ligado a ese cliente: `event.data.object.refund()` (o `.cancel()`, en una verificación) usa su clave.

## Sandbox

Si en el menú de tu perfil del dashboard aparece «Crear sandbox» o «Sandboxes», tu cuenta ya puede usar el sandbox: una cuenta aparte de la real, con sus propias claves, webhooks y apps, donde probás tu integración de punta a punta sin mover plata. Si no aparece, tu cuenta todavía no lo tiene.

Cada sandbox nace con dos claves de prueba, que ves en Developers › API Keys adentro del sandbox: la secreta (`raya_sk_test_…`) y la pública (`raya_pk_test_…`, para Raya.js, que todavía no está disponible en el sandbox). El SDK y la URL de la API son los mismos que en tu cuenta real: la clave decide en cuál operás. El cliente acepta la clave secreta de prueba y el access_token de un usuario de prueba (`raya_at_test_…`) en los mismos lugares que `raya_sk_live_…` y `raya_at_live_…`: `new RayaClient(…)`, `config.apiKey`, `RAYA_SECRET_KEY` o la opción `apiKey` de una llamada.

```js
import { RayaClient } from "rayacash";

const client = new RayaClient(process.env.RAYA_SECRET_KEY); // la clave secreta de prueba

// Un pago de prueba: el mismo método y el mismo objeto que en tu cuenta real.
const payment = await client.payments.create({ amount: 15000, description: "Pedido #1042" });
console.log(payment.bank_transfer.cvu); // 00000002…: un CVU de prueba, que no existe
console.log(payment.checkout_url); // https://raya.cash/sandbox/pay/…, con «Simular transferencia»

// Simulá la transferencia de quien paga: sin amount, por el monto exacto.
const paid = await client.testHelpers.payments.simulateTransfer(payment.id);
console.log(paid.status); // "succeeded": tus destinos del sandbox reciben payment.succeeded

// Con un monto menor, el pago queda failed.
const other = await client.payments.create({ amount: 2500 });
const failed = await client.testHelpers.payments.simulateTransfer(other.id, { amount: 1000 });
console.log(failed.status, failed.failure_code); // "failed" "amount_mismatch"

// El saldo de prueba ya suma lo recibido.
const balance = await client.balance.retrieve();
console.log(balance.available);
```

| Método | Endpoint | Devuelve |
|---|---|---|
| `client.testHelpers.payments.simulateTransfer(paymentId, params?, options?)` | `POST /v1/test/payments/:id/simulate_transfer` | `Payment`, o `ConnectOrder` con el `id` de una orden de Raya Connect |

En el estilo global es `Payment.simulateTransfer(paymentId, params?)`, con `config.apiKey` en la clave secreta de prueba. En TypeScript devuelve `Payment | ConnectOrder`: si necesitás uno de los dos, usá `instanceof`.

- **Nunca transfieras plata a un pago de prueba.** Su `bank_transfer.cvu` empieza con `00000002` y su alias es `sandbox.no.transferir`: no son de una cuenta real, y todos los pagos que creás con la clave de prueba muestran los mismos (las órdenes de Raya Connect, el CVU de su usuario de prueba). `checkout_url` es la misma página de pago que en tu cuenta real, en `https://raya.cash/sandbox/pay/<id>`, con un botón «Simular transferencia» (por el monto exacto) que puede tocar cualquiera que tenga el link. Un pago de prueba vence a las 24 horas.
- **`simulateTransfer` hace lo que en tu cuenta real hace la transferencia de quien paga.** Sin `amount`, simula el monto exacto y el pago queda `succeeded`. Con un `amount` menor queda `failed`, con `failure_code` en `amount_mismatch` (en tu cuenta real, un pago de menos se devuelve solo; acá no); igual o mayor, `succeeded`, con lo simulado en `amount_received`. `amount` acepta lo mismo que en `payments.create` (ver [Montos](#montos)).
- Va solo con la clave secreta de prueba: con tu clave real da `PermissionDeniedError` con `code === "SANDBOX_ONLY"`. Un pago que ya no está `pending` (ya simulado, reembolsado o vencido) da `ConflictError` con `code === "PAYMENT_NOT_PENDING"` y el estado en `error.data.status`; uno que no es del sandbox, `NotFoundError` con `code === "PAYMENT_NOT_FOUND"`.
- No lleva `Idempotency-Key` ni acepta `idempotencyKey`: un pago se simula una sola vez. Si un corte de red deja sin respuesta un intento que sí llegó, el SDK reintenta y el reintento da `PAYMENT_NOT_PENDING`: consultá el pago con `payments.retrieve` (una orden de Raya Connect, con `connected.connect.orders.retrieve` y el access_token de prueba).
- **Saldo y reembolsos.** `balance.retrieve()` devuelve el saldo de prueba, que sube al simular, por lo recibido y sin plazo de liquidación. `payments.refund` devuelve un pago de prueba al instante, hasta 30 días después de pagado, y lo descuenta del saldo de prueba.
- **Webhooks.** Los destinos que creás adentro del sandbox (hasta 3) reciben sus `payment.*` y `connect.order.*` con `event.livemode` en `false` (en tu cuenta real, `true`), con hasta 3 intentos automáticos por entrega. La firma y el resto son iguales: tu endpoint se prueba con eventos de verdad. Creá el destino antes de simular: cada destino recibe solo los eventos que ocurren después de crearlo, así que los de un pago que simulaste antes no le llegan ni se pueden reenviar. Para probar en tu máquina sin publicar una URL, usá rayacash-cli (necesita Node.js 22 o más nuevo): copiá a `RAYA_WEBHOOK_SECRET` el secreto de tu máquina que muestra `npx rayacash-cli listen --print-secret` y abrí la escucha con `npx rayacash-cli listen --forward-to localhost:3000/webhooks/raya` (toma la clave secreta de prueba de la variable `RAYA_SECRET_KEY` de esa terminal, no de tu `.env`, o de `npx rayacash-cli login`): le reenvía a tu servidor los eventos del sandbox que ocurren con la escucha abierta, firmados con ese secreto.
- **Raya Connect con usuarios de prueba.** Adentro del sandbox creás tu app en Developers › Apps (su `client_secret` es `raya_cs_test_…`) y hasta 20 usuarios de prueba en «Usuarios de prueba», cada uno con su email, su contraseña y su comercio de prueba. Tu link de autorización les pide ese email y esa contraseña; `oauth.token`, con el `client_secret` de prueba, devuelve un access_token de prueba (`raya_at_test_…`), y con él `users.retrieve` y `connect.orders.*` andan igual que en tu cuenta real. Para simular una orden, pasale su `id` a `testHelpers.payments.simulateTransfer` con la clave secreta de prueba del sandbox (no con el access_token): devuelve el `ConnectOrder`, ligado al cliente de esa clave. Para consultarlo o reembolsarlo, usá el cliente del access_token (`connected.connect.orders.retrieve` o `connected.connect.orders.refund`): su `refund()` iría con la clave secreta y daría `AuthenticationError` con `code === "ACCESS_TOKEN_INVALID"`. Al acreditarse, el usuario de prueba recibe lo cobrado menos `fee` y tu saldo de prueba, `fee`.
- **Todavía no está disponible en el sandbox:** las transferencias (`transfers.*`), los payouts (`connect.payouts.*`) e Identidad (`identity.verifications.*`) responden `PermissionDeniedError` con `code === "SANDBOX_NOT_SUPPORTED"`, y Raya.js todavía no acepta la clave pública de prueba.
- **Para pasar a producción,** usá tu clave secreta real (`raya_sk_live_…`) y sacá `testHelpers` de tu código: con la clave real da `SANDBOX_ONLY`. Nada del sandbox pasa a tu cuenta real: configurá tu negocio, creá tu clave secreta y volvé a crear tus destinos de webhook y tus apps (en `RAYA_WEBHOOK_SECRET`, el secreto del destino de tu cuenta real). En tu cuenta real, cada pago tiene su CVU y su alias exclusivos, lo cobrado se suma a tu saldo cuando se liquida y un reembolso puede fallar si no te alcanza el saldo (`INSUFFICIENT_BALANCE`).

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

El `fetch` falso prueba tu código sin red; el flujo real (crear un pago, simular la transferencia y recibir el webhook, y en una app, autorizar y canjear el `code`) se prueba en un [sandbox](#sandbox), si tu cuenta lo tiene.

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

- **`appInfo`:** identifica tu plugin en el `User-Agent` (`rayacash-node/1.2.0 … mi-plugin/1.2.0`), que ves en [Developers › Logs](https://raya.cash/dashboard/developers/logs). En el estilo global: `setAppInfo("mi-plugin", { version: "1.2.0" })`.
- **Logging:** con `RAYA_LOG=info` (o `config.log = "info"`) ves en stderr cada request, su status, su `request_id` y los reintentos; con `debug`, también la query y la idempotency key. Nunca logueamos la clave ni los bodies.
- **Endpoints nuevos:** si la API suma un endpoint antes que el SDK, usá `client.rawRequest("get", "/v1/…", { params, body })`: tiene la misma autenticación, reintentos y errores. La query va en `params`, nunca en la ruta.
- **Estilo global:** `config.apiBase`, `config.timeout`, `config.maxNetworkRetries`, `config.fetch`, `config.log` y `setAppInfo()`.

## Seguridad

- **La clave secreta va solo en tu servidor**, leída de una variable de entorno. Nunca en el navegador, en una app mobile ni en el repositorio. Para cobrar desde el navegador está [Raya.js](https://raya.cash/raya-js), con la clave pública; para verificar identidades, Identity.js (`npm install rayacash-identity`), sin ninguna clave.
- El SDK rechaza la clave pública (`raya_pk_…`) sin mandar nada, nunca la muestra completa (`console.log(client)` y `JSON.stringify(client)` la enmascaran) y nunca sigue redirects.
- Si la clave se filtró, rotala en Developers › API Keys con vencimiento «Ahora»: la anterior deja de funcionar al instante.
- Las requests que hacés con la clave secreta quedan 30 días en [Developers › Logs](https://raya.cash/dashboard/developers/logs).
- El access_token de una cuenta conectada (`raya_at_live_…`) y el `client_secret` de tu app (`raya_cs_live_…`) son secretos como la clave: solo en tu servidor, el token junto al `user_id`. `console.log(token)` lo enmascara; `JSON.stringify(token)` lo da entero, para guardarlo. Las credenciales de prueba de un [sandbox](#sandbox) (`raya_sk_test_…`, `raya_at_test_…` y `raya_cs_test_…`) también son secretas, y `console.log` enmascara la clave y el access_token de prueba con su prefijo, como los reales.
- `person` y las imágenes de una verificación de Identidad son datos personales: no los escribas en logs (`console.log(verification)` los muestra) y guardá solo lo que necesitás. Los eventos nunca traen `person`.

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

Raya Cash S.A
