# Changelog

Los cambios de cada versión de `rayacash` publicada en [npm](https://www.npmjs.com/package/rayacash). Sigue [semver](https://semver.org/lang/es/): los cambios incompatibles solo llegan en una versión mayor (`2.0.0`), y los anotamos acá.

## 1.0.1

Sin cambios en el SDK: el código es el de la 1.0.0.

- README: la sección «Desarrollo» ya no enlaza a una guía que no viene en el paquete y explica cómo publicar una versión.
- Es la primera versión publicada desde GitHub Actions con Trusted Publishing, así que trae la provenance de npm.

## 1.0.0

Primera versión, con el contrato y el comportamiento de `rayacash` 1.0.0 para Python.

- `new RayaClient(apiKey, { apiBase, timeout, maxNetworkRetries, fetch, appInfo })` o `new RayaClient({ apiKey, … })`. Sin `apiKey`, lee `RAYA_SECRET_KEY`. Rechaza sin hacer ninguna request la clave pública (`raya_pk_…`), una clave vacía o con espacios, y una `apiBase` que no sea `https://` (salvo `http://localhost`). `console.log(client)` y `JSON.stringify(client)` enmascaran la clave.
- Los 7 endpoints. Los parámetros van con los nombres de la API, y las opciones de la llamada, en el último argumento:
  - `client.balance.retrieve()`.
  - `client.transfers.create({ amount, destination }, { idempotencyKey })`, con la `idempotencyKey` obligatoria.
  - `client.transfers.retrieve(transferId)`.
  - `client.transfers.list({ direction, status, created_gte, created_lt, limit, cursor })`. Acepta `Date` o strings ISO 8601.
  - `client.payments.create({ amount, description, external_reference, return_url, metadata }, { idempotencyKey })`.
  - `client.payments.retrieve(paymentId)`.
  - `client.payments.refund(paymentId, { idempotencyKey })`.
- Opciones por llamada: `{ apiKey, timeout, maxNetworkRetries }`, más la `idempotencyKey` en los POST. Un parámetro o una opción desconocida falla sin mandar nada.
- Estilo global, como stripe-python:
  - `config.apiKey` (o `RAYA_SECRET_KEY`), `apiBase`, `timeout`, `maxNetworkRetries`, `fetch`, `appInfo` y `log`, y `setAppInfo()`. `config` se lee en cada request y está sellado.
  - `Balance.retrieve()`, `Transfer.create/retrieve/list()` y `Payment.create/retrieve()`.
  - `Payment.refund(paymentId)` y `payment.refund()`. La instancia usa el cliente del que vino el pago.
- Objetos (`Balance`, `Transfer`, `Payment`, `Event`, `ListObject`, `RayaObject`):
  - Sus campos son exactamente el JSON de la API (montos `number`, fechas en string ISO): `JSON.stringify(obj)` y `{ ...obj }` dan ese JSON.
  - Conservan los campos que el SDK todavía no conoce.
  - `metadata` queda como objeto común.
  - Cada uno trae `lastResponse`, con `requestId`, `httpStatus`, `headers` e `idempotencyKey`.
  - `constructFrom()` los arma sin hacer requests, para tus tests.
- Montos: `amount` acepta `number`, `string` decimal, `bigint` o un decimal exacto (decimal.js, `Prisma.Decimal`, big.js, bignumber.js) y viaja como número JSON canónico (`"1500.50"` → `1500.5`). Nunca se redondea: lo que tiene más de 2 decimales lo rechaza la API.
- Idempotencia:
  - En `payments.create` y `refund`, sin clave propia se genera un UUID v4 por llamada.
  - Cada reintento usa la misma clave, que queda en `lastResponse.idempotencyKey` y en `error.idempotencyKey`.
  - Se valida que la clave tenga de 1 a 255 caracteres ASCII visibles.
- Reintentos:
  - Se reintentan los cortes de conexión, los timeouts, `409 IDEMPOTENCY_KEY_IN_USE`, `429`, `408` y los `5xx`, con espera exponencial con jitter (0,5 s a 8 s) y respetando `Retry-After`. Por defecto son 2.
  - `503 API_UNAVAILABLE` y los `4xx` no se reintentan.
  - Si `Retry-After` pasa de 60 s, el error sale enseguida con `retryAfter`.
- Timeout de 65 000 ms por intento (10 s para conectar): el servidor corta a los 60 s y crear un pago puede tardar ~40 s. Nunca se siguen redirects.
- Paginación: `for await (const item of page.autoPagingIter())` pide cada página siguiente con `cursor` y los mismos filtros y opciones. También `nextPage()` y `for…of` sobre una página.
- Errores:
  - Jerarquía con base en `RayaError` (que extiende `Error`): `InvalidRequestError` (con `param`), `NotFoundError`, `AuthenticationError`, `PermissionDeniedError`, `ConflictError`, `IdempotencyError`, `UnprocessableEntityError`, `RateLimitError`, `APIError`, `APIConnectionError` y `SignatureVerificationError`.
  - La clase sale del código HTTP y `code` es el del contrato.
  - Las respuestas sin el objeto `error` (HTML del edge) traen `RATE_LIMITED`, `INTERNAL_ERROR` o `INVALID_RESPONSE`, y los cortes, `NETWORK_ERROR` o `TIMEOUT`.
  - Los errores de programación son `TypeError` o `RangeError`.
- Webhooks:
  - `Webhook.constructEvent(payload, header, secret, tolerance = 300)` y `client.constructEvent(…)`, que liga el evento al cliente.
  - `WebhookSignature.verifyHeader`, `computeSignature` y `generateHeader`, para tus tests.
  - La firma se verifica sobre el body crudo (`string`, `Buffer`, `Uint8Array` o `ArrayBuffer`) y acepta varias `v1` (rotación del secreto). La tolerancia es simétrica y vale `null` para desactivarla.
  - Probado con los vectores del contrato.
- `client.rawRequest()` para endpoints que el SDK todavía no tiene.
- `User-Agent: rayacash-node/1.0.0 Node/… undici/…`, más el `appInfo` de tu plugin. Se ve en Developers › Logs.
- Logging: `RAYA_LOG=info|debug` o `config.log` lo muestran en stderr. Nunca se loguean la clave ni los bodies.
- Sin dependencias. ESM y CommonJS, con tipos de TypeScript. Node.js 22 o más nuevo.
