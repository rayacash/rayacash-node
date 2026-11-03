# Changelog

Los cambios de cada versión de `rayacash` publicada en [npm](https://www.npmjs.com/package/rayacash). Sigue [semver](https://semver.org/lang/es/): los cambios incompatibles solo llegan en una versión mayor (`2.0.0`), y los anotamos acá.

## 1.0.3

Solo docs, sin cambios en el SDK: el README ya no nombra a otros SDKs y termina con el nombre de la empresa, Raya Cash S.A.

## 1.0.2

Arreglos, para que el SDK se comporte igual que los de Python y PHP. Dos pueden pedirte un ajuste: la ruta de `rawRequest` va sin query (que va en `params`), sin `\` y sin caracteres de control, y un `fetch` propio tiene que devolver una `Response` con `arrayBuffer()`.

- Un id `"."` o `".."` en `transfers.retrieve`, `payments.retrieve` o `payments.refund` falla con `RangeError` sin mandar nada. `fetch` resuelve esos segmentos de la URL: `payments.retrieve(".")` pedía `/v1/payments/` y `payments.refund("..")`, `POST /v1/refund`.
- `rawRequest` rechaza con `RangeError` una ruta con `?` o `#` («La ruta va sin query (usá params).»): pasá la query a `params`. Pegada a la ruta, la página siguiente de una lista le sumaba `?cursor=…` a su último valor.
- `rawRequest` también rechaza con `RangeError` una ruta con `\` o con caracteres de control, como Python y PHP: `fetch` convertía `\` en `/` y sacaba los saltos de línea y los tabs, así que la request iba a otra ruta sin avisar. Si es parte de un id, codificalo (`encodeURIComponent`).
- Los espacios de la ruta de `rawRequest` viajan como `%20` en cada request, como en Python: `fetch` sacaba los del final, así que la primera página de una lista y la siguiente iban a rutas distintas.
- Una `apiBase` con una query o un fragmento vacíos (`"https://x?"`, `"https://x#"`) ya no deja el `?` ni el `#` en la base: las requests van a `https://x/v1/…`, no a `https://x/?/v1/…` ni a `https://x/`.
- Los logs escapan los saltos de línea y los demás caracteres de control ASCII de cada valor, `DEL` incluido (`\n`, `\r`, `\t`, `\u001b`, `\u007f`…): un valor que llega de afuera, como un `cursor`, no puede partir una línea ni armar otra. Las líneas salen iguales que en Python y PHP, también el `delay` y el `elapsed` de un empate exacto: `0.625` va como `0.62s`, al par, y no como `0.63s`.
- El `INVALID_RESPONSE` de una lista que no es una lista («…no es una lista.») trae el `requestId`, los `headers` y el body (`httpBody`) de esa respuesta, como el resto de los errores de la API.
- Un `2xx` cuyo body no es UTF-8 válido es `APIError` con `code === "INVALID_RESPONSE"` y la respuesta, como en Python y PHP: antes se leía con `U+FFFD` en lugar de los bytes inválidos. Los bodies de los errores se siguen leyendo así, para no perder su `code`. Para eso el SDK lee el body con `arrayBuffer()`: si pasás tu propio `fetch`, tiene que devolver una `Response` que lo tenga, como la del `fetch` global.
- Un `2xx` con un JSON muy anidado (unos miles de niveles) es `APIError` con `code === "INVALID_RESPONSE"` y la respuesta, como en Python y PHP: armar el objeto llenaba la pila y salía un `RangeError` («Maximum call stack size exceeded») que no es un `RayaError`. En `constructEvent` da el mismo `RangeError` que un JSON inválido («El body del webhook no es un objeto JSON.»).
- `constructEvent` lee el body en UTF-8 estricto, como Python y PHP: un body firmado que no es UTF-8 válido da `RangeError` («El body del webhook no es un objeto JSON.»). Antes se leía con `U+FFFD` en lugar de los bytes inválidos.
- Un body de error que empieza con un BOM ya no se lee como JSON: lleva el código de respaldo (`INTERNAL_ERROR` en un `5xx`) y el BOM queda en `httpBody`, como en Python y PHP. Antes se perdía el BOM y quedaba el `code` del body.
- Los espacios que el SDK saca de los bordes (de los montos, `apiBase`, `Retry-After` y cada parte del header de los webhooks) y los que hacen que un valor cuente como vacío (la clave, los ids, el secreto, el header y el `name` de `appInfo`) son los de Python: también `U+001C` a `U+001F` y `U+0085`, y ya no `U+FEFF`. Por ejemplo, el id `"\x1c"` falla por vacío y el monto `"\ufeff5"` no es un número, como en Python y PHP.
- Un `Retry-After` con una fecha HTTP con una zona de 24 h o más (`+2400`) se ignora, como en Python y PHP.
- Un `Retry-After` con una fecha de un año menor que 100, aunque venga con cuatro cifras (`0030`), se lee como en Python y PHP: de 0 a 68 es 20xx y de 69 a 99, 19xx. Antes era 19xx siempre. Las fechas van solo en la forma de RFC 9110 (también sin el día de la semana, sin los segundos o sin zona), como en PHP: las de RFC 850 y asctime, o con zonas como `EST`, se ignoran (Python las lee).
- Docs:
  - La tabla de reintentos del README suma el `408`, que se reintenta como los `5xx`; la de errores, el `408` en `APIError`, `NOT_FOUND` en `NotFoundError` y los demás `4xx` en `InvalidRequestError`. Lo mismo los JSDoc de `APIError` y de `maxNetworkRetries`.
  - `Transfer.reference` también es `null` si la transferencia falló y en las transferencias entre cuentas de Raya.
  - El logging (`config.log` o `RAYA_LOG`) vale para todo el proceso, también para cada `RayaClient`.
  - `examples/enviar-transferencia.mjs` ya no dice que el monto viaja tal cual: viaja con el mismo valor que escribiste (`"25000.50"` sale como `25000.5`).

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
  - `503 API_UNAVAILABLE` y los demás `4xx` no se reintentan.
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
