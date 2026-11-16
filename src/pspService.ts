import {
  type Amount,
  canonicalAmount,
  checkParams,
  encodeQuery,
  isPlainObject,
  pathId,
  typeName,
  validateIdempotencyKey,
} from "./encoding.ts";
import type { ListObject } from "./listObject.ts";
import type { PspBalance } from "./pspBalance.ts";
import type { PspCustomer, PspCustomerStatus } from "./pspCustomer.ts";
import type { PspCustomerBalance } from "./pspCustomerBalance.ts";
import type { PspTransfer, PspTransferDirection, PspTransferStatus } from "./pspTransfer.ts";
import {
  type PostRequestOptions,
  type PspTransferCreateOptions,
  type RequestOptions,
  validateOptions,
} from "./requestOptions.ts";
import type { APIRequestor } from "./requestor.ts";

/**
 * `psp.customers.create` con Raya Identity: si tu cliente se verificó con Identidad, mandá solo
 * `identity_verification`. Su CUIL, su nombre y apellido, su sexo y su nacionalidad salen de la
 * verificación, y `person_type` es `"F"`: `tax_id`, `name`, `person_type` y las fotos no van (si
 * los mandás, la API responde `InvalidRequestError` con `code === "PARAMETER_INVALID"`).
 */
export interface PspCustomerCreateWithVerificationParams {
  /**
   * El `id` (`idv_…`) de una verificación `document` de tu cuenta en estado `verified`, que no
   * hayas usado para otro cliente. Alcanza con esto: tomamos de ahí su CUIL (`tax_id`), su nombre
   * y apellido como figuran en el Registro Nacional de las Personas (`name`), su sexo y su
   * nacionalidad.
   */
  identity_verification: string;
  /** No va: es el CUIL de la verificación. */
  tax_id?: null;
  /** No va: es el nombre y apellido de la verificación. */
  name?: null;
  /** No va: con `identity_verification` siempre es `"F"`. */
  person_type?: null;
  /** No va: con `identity_verification` no hacen falta fotos. */
  document_front_url?: null;
  /** No va: con `identity_verification` no hacen falta fotos. */
  document_back_url?: null;
  /** No va: con `identity_verification` no hacen falta fotos. */
  selfie_url?: null;
  /** Tu identificador del cliente (hasta 128 caracteres, en una línea). Nunca datos personales. */
  external_reference?: string | null;
  /** Hasta 20 pares clave-valor de texto. */
  metadata?: Record<string, string> | null;
}

/**
 * `psp.customers.create` de una persona humana sin Raya Identity (hiciste tu propio KYC o usaste
 * otro proveedor): sus datos y las fotos de su DNI y de una selfie. Leemos el DNI (también el
 * sexo, del frente), lo validamos contra el Registro Nacional de las Personas (RENAPER) y
 * comparamos la cara: vuelve `202` con `status: "verifying"`.
 */
export interface PspCustomerCreateWithPhotosParams {
  /** No va: sin una verificación de Identidad, mandás los datos y las fotos. */
  identity_verification?: null;
  /** Su CUIL: 11 dígitos, sin guiones, siempre como string. */
  tax_id: string;
  /**
   * Su nombre y apellido, en una línea: de 2 a 120 caracteres. Lo comparamos con el RENAPER (si no
   * coincide, el cliente queda `rejected` con `name_mismatch`).
   */
  name: string;
  /** `"F"`: persona humana. */
  person_type: "F";
  /**
   * La URL `https://` pública (hasta 2048 caracteres) de la foto del frente del DNI, un JPEG o PNG
   * de hasta 5 MB. Que venza pronto: la bajamos enseguida.
   */
  document_front_url: string;
  /** La URL `https://` de la foto del dorso del DNI. */
  document_back_url: string;
  /** La URL `https://` de una selfie de tu cliente, de frente y sin anteojos. */
  selfie_url: string;
  /** Tu identificador del cliente (hasta 128 caracteres, en una línea). Nunca datos personales. */
  external_reference?: string | null;
  /** Hasta 20 pares clave-valor de texto. */
  metadata?: Record<string, string> | null;
}

/**
 * `psp.customers.create` de una persona jurídica: su CUIT y su razón social, sin fotos. Los
 * validamos contra el Registro Nacional de Sociedades y vuelve `202` con `status: "verifying"`
 * mientras la revisamos.
 */
export interface PspCustomerCreateCompanyParams {
  /** No va: una persona jurídica no se verifica con Identidad. */
  identity_verification?: null;
  /** Su CUIT: 11 dígitos, sin guiones, siempre como string. */
  tax_id: string;
  /**
   * Su razón social, en una línea: de 2 a 120 caracteres. Tiene que coincidir con la del Registro
   * Nacional de Sociedades (si no, `UnprocessableEntityError` con
   * `code === "CUSTOMER_DATA_MISMATCH"` y `error.data.field` en `name`).
   */
  name: string;
  /** `"J"`: persona jurídica. */
  person_type: "J";
  /** No va: una persona jurídica no lleva fotos. */
  document_front_url?: null;
  /** No va: una persona jurídica no lleva fotos. */
  document_back_url?: null;
  /** No va: una persona jurídica no lleva fotos. */
  selfie_url?: null;
  /** Tu identificador del cliente (hasta 128 caracteres, en una línea). Nunca datos personales. */
  external_reference?: string | null;
  /** Hasta 20 pares clave-valor de texto. */
  metadata?: Record<string, string> | null;
}

/**
 * Los parámetros de `psp.customers.create`, en una de tres formas: con Raya Identity (solo
 * `identity_verification`), una persona humana con las fotos (`tax_id`, `name`,
 * `person_type: "F"`, `document_front_url`, `document_back_url` y `selfie_url`) o una persona
 * jurídica (`tax_id`, `name` y `person_type: "J"`). Las tres aceptan `external_reference` y
 * `metadata`.
 */
export type PspCustomerCreateParams =
  | PspCustomerCreateWithVerificationParams
  | PspCustomerCreateWithPhotosParams
  | PspCustomerCreateCompanyParams;

export interface PspCustomerListParams {
  /**
   * `verifying`, `pending`, `active`, `blocked`, `closed`, `failed` o `rejected` (`active` no
   * incluye a los bloqueados).
   */
  status?: PspCustomerStatus | null;
  /** Coincidencia exacta. */
  external_reference?: string | null;
  /** Desde este momento (incluido): un `Date` o un string ISO 8601 con zona. */
  created_gte?: string | Date | null;
  /**
   * Hasta este momento (excluido). Con `created_gte` arma un rango semiabierto: los días o meses
   * seguidos no se pisan.
   */
  created_lt?: string | Date | null;
  /** De 1 a 100 por página (por defecto, 20). */
  limit?: number | null;
  /** El `next_cursor` de la página anterior. */
  cursor?: string | null;
}

export interface PspTransferCreateParams {
  /** El `id` del cliente (`pspc_…`) en cuyo nombre transferís. */
  customer: string;
  /**
   * Pesos, hasta 2 decimales: `18350.5`, `"18350.50"` o un `Decimal`. Sale del saldo del cliente y
   * del tuyo.
   */
  amount: Amount;
  /** CBU o CVU (22 dígitos) o alias (6 a 20 caracteres), siempre como string. */
  destination: string;
}

export interface PspTransferListParams {
  /** Solo las de este cliente (`pspc_…`). Uno que no es tuyo da una lista vacía. */
  customer?: string | null;
  /** `inbound` (las que recibieron tus clientes) u `outbound` (las que enviaste en su nombre). */
  direction?: PspTransferDirection | null;
  /** `pending`, `completed`, `failed` o `reversed`. */
  status?: PspTransferStatus | null;
  /** Desde este momento (incluido): un `Date` o un string ISO 8601 con zona. */
  created_gte?: string | Date | null;
  /**
   * Hasta este momento (excluido). Con `created_gte` arma un rango semiabierto: los días o meses
   * seguidos no se pisan.
   */
  created_lt?: string | Date | null;
  /** De 1 a 100 por página (por defecto, 20). */
  limit?: number | null;
  /** El `next_cursor` de la página anterior. */
  cursor?: string | null;
}

const CUSTOMERS_PATH = "/v1/psp/customers";
const TRANSFERS_PATH = "/v1/psp/transfers";
const CUSTOMER = "psp.customer";
const TRANSFER = "psp.transfer";
// El espejo de pspexternal/api_params.py de la API (CREATE_FIELDS, LIST_CUSTOMER_FIELDS,
// TRANSFER_FIELDS y LIST_TRANSFER_FIELDS): en ese orden viajan el body y la query.
const CREATE_PARAMS = [
  "identity_verification",
  "tax_id",
  "name",
  "person_type",
  "document_front_url",
  "document_back_url",
  "selfie_url",
  "external_reference",
  "metadata",
] as const;
const LIST_PARAMS = [
  "status",
  "external_reference",
  "created_gte",
  "created_lt",
  "limit",
  "cursor",
] as const;
const TRANSFER_CREATE_PARAMS = ["customer", "amount", "destination"] as const;
const TRANSFER_LIST_PARAMS = [
  "customer",
  "direction",
  "status",
  "created_gte",
  "created_lt",
  "limit",
  "cursor",
] as const;

/**
 * Un string, o un `TypeError` que dice qué va (el formato lo valida la API). `hint` se suma al
 * final del mensaje.
 */
function requireString(name: string, value: unknown, what: string, hint = ""): string {
  if (typeof value !== "string") {
    throw new TypeError(
      `${name} tiene que ser un string con ${what}, no ${typeName(value)}.${hint}`,
    );
  }
  return value;
}

/** La pista de los `TypeError` de `tax_id` y `name`, que se chequean sin identity_verification. */
const IDENTITY_HINT =
  " Si tu cliente se verificó con Raya Identity, mandá solo identity_verification.";

/**
 * El body en el orden de `CREATE_FIELDS`. Acá, solo lo que nunca puede andar: un
 * `identity_verification` que no es un string y, sin ella, un `tax_id` o un `name` que no lo son.
 * La forma (un dato o una foto de más junto a `identity_verification`, una persona humana sin las
 * fotos, una jurídica con fotos) la responde la API, con el campo en `data.field`.
 */
function customerBody(params: unknown): Record<string, unknown> {
  const values = checkParams("psp.customers.create", params, CREATE_PARAMS);
  const verification = values.identity_verification;
  if (verification !== undefined && verification !== null) {
    requireString(
      "identity_verification",
      verification,
      "el id de una verificación de Identidad (idv_…)",
    );
  } else {
    requireString(
      "tax_id",
      values.tax_id,
      'el CUIL o CUIT de tu cliente, 11 dígitos sin guiones (como "27123456781")',
      IDENTITY_HINT,
    );
    requireString(
      "name",
      values.name,
      "el nombre y apellido o la razón social de tu cliente",
      IDENTITY_HINT,
    );
  }
  const metadata = values.metadata;
  if (metadata !== undefined && metadata !== null && !isPlainObject(metadata)) {
    throw new TypeError(
      'metadata tiene que ser un objeto de string a string, como { plan: "pro" }.',
    );
  }
  return Object.fromEntries(CREATE_PARAMS.map((name) => [name, values[name]]));
}

function transferBody(params: unknown): Record<string, unknown> {
  const values = checkParams("psp.transfers.create", params, TRANSFER_CREATE_PARAMS);
  const customer = requireString("customer", values.customer, "el id del cliente (pspc_…)");
  const amount = canonicalAmount(values.amount);
  const destination = values.destination;
  if (typeof destination !== "string") {
    throw new TypeError(
      "destination tiene que ser un string (CBU, CVU o alias): un CBU como número pierde los " +
        "ceros de adelante.",
    );
  }
  return { customer, amount, destination };
}

function requirePspTransferIdempotencyKey(options: unknown): void {
  const key = validateOptions(options).idempotencyKey;
  if (key === undefined) {
    throw new TypeError(
      "psp.transfers.create necesita idempotencyKey: generá un UUID v4 con crypto.randomUUID(), " +
        "guardalo con la transferencia antes de llamar y reusalo en cada reintento: " +
        "psp.transfers.create({ customer, amount, destination }, { idempotencyKey }).",
    );
  }
  validateIdempotencyKey(key);
}

function customerPath(customerId: string, action = ""): string {
  return `${CUSTOMERS_PATH}/${pathId("customerId", customerId)}${action}`;
}

/**
 * `client.psp.customers`: tus clientes de Raya PSP, cada uno con un CVU a su nombre. Va con tu
 * clave secreta.
 */
export class PspCustomerService {
  readonly #requestor: APIRequestor;

  constructor(requestor: APIRequestor) {
    this.#requestor = requestor;
  }

  /**
   * Crea un cliente con un CVU a su nombre (`POST /v1/psp/customers`), de una de tres formas:
   *
   * - **Con Raya Identity:** si tu cliente se verificó con Identidad, mandá solo
   *   `identity_verification`. Su CUIL, su nombre y apellido, su sexo y su nacionalidad salen de
   *   la verificación: `tax_id`, `name`, `person_type` y las fotos no van.
   * - **Una persona humana con las fotos** (hiciste tu propio KYC o usaste otro proveedor):
   *   `tax_id`, `name`, `person_type: "F"` y las URLs del frente y del dorso del DNI y de una
   *   selfie (`document_front_url`, `document_back_url` y `selfie_url`), que validamos contra el
   *   Registro Nacional de las Personas (RENAPER).
   * - **Una persona jurídica:** `tax_id`, `name` (su razón social) y `person_type: "J"`, sin
   *   fotos: la validamos contra el Registro Nacional de Sociedades y la revisamos.
   *
   * Vuelve `201` con `status` en `active` (ya tiene CVU y alias) o `failed`, o `202` con
   * `verifying` o `pending` si seguimos en segundo plano: te avisamos con `psp.customer.activated`,
   * `psp.customer.failed` o `psp.customer.rejected`. El status HTTP está en
   * `customer.lastResponse.httpStatus`.
   *
   * Antes de mandar solo chequeamos que `identity_verification` sea un string si viene y, sin
   * ella, que `tax_id` y `name` lo sean (`TypeError`). Lo demás lo responde la API con
   * `InvalidRequestError` y el campo en `error.param`: un dato o una foto de más junto a
   * `identity_verification`, una foto que falta o un formato inválido.
   *
   * La `idempotencyKey` es opcional pero recomendada: guardala con tu cliente y reusala si
   * reintentás. Si no la pasás, generamos una que protege los reintentos de esta llamada. Si ya
   * tenés un cliente con ese CUIL o CUIT, o ya usaste esa verificación para otro, da
   * `ConflictError` con `code === "CUSTOMER_ALREADY_EXISTS"` y su id en `error.data.customer`.
   */
  async create(
    params: PspCustomerCreateParams,
    options?: PostRequestOptions,
  ): Promise<PspCustomer> {
    const body = customerBody(params);
    return (await this.#requestor.request(
      "POST",
      CUSTOMERS_PATH,
      { body },
      options,
      CUSTOMER,
    )) as PspCustomer;
  }

  /**
   * Un cliente de tu cuenta (`GET /v1/psp/customers/:id`). Si no existe o no es tuyo, da
   * `NotFoundError` con `code === "CUSTOMER_NOT_FOUND"`.
   */
  async retrieve(customerId: string, options?: RequestOptions): Promise<PspCustomer> {
    const path = customerPath(customerId);
    return (await this.#requestor.request("GET", path, {}, options, CUSTOMER)) as PspCustomer;
  }

  /**
   * Tus clientes, del más nuevo al más viejo (`GET /v1/psp/customers`).
   *
   * Devuelve una página. Para recorrer todas: `for await (const c of page.autoPagingIter())`.
   */
  async list(
    params?: PspCustomerListParams,
    options?: RequestOptions,
  ): Promise<ListObject<PspCustomer>> {
    const values = checkParams("psp.customers.list", params, LIST_PARAMS);
    const query = encodeQuery(Object.fromEntries(LIST_PARAMS.map((name) => [name, values[name]])));
    const page = await this.#requestor.requestList(CUSTOMERS_PATH, query, options);
    return page as ListObject<PspCustomer>;
  }

  /**
   * El saldo de un cliente (`GET /v1/psp/customers/:id/balance`): `available` es su saldo y
   * `transferable`, lo que podés transferir ahora en su nombre (el menor entre su saldo y el tuyo,
   * y `0` si no está `active`).
   */
  async retrieveBalance(customerId: string, options?: RequestOptions): Promise<PspCustomerBalance> {
    const path = customerPath(customerId, "/balance");
    return (await this.#requestor.request(
      "GET",
      path,
      {},
      options,
      "psp.customer_balance",
    )) as PspCustomerBalance;
  }

  /**
   * Bloquea a un cliente (`POST /v1/psp/customers/:id/block`, sin body): sigue recibiendo
   * transferencias, pero no podés transferir en su nombre ni recrear su CVU. Bloquear uno que ya
   * bloqueaste lo devuelve igual, y funciona aunque tu cuenta todavía no tenga Raya PSP aprobado.
   * Un cliente `verifying` o `rejected` da `ConflictError` con
   * `code === "CUSTOMER_STATUS_CONFLICT"`.
   */
  async block(customerId: string, options?: PostRequestOptions): Promise<PspCustomer> {
    return this.#action(customerId, "/block", options);
  }

  /**
   * Levanta tu bloqueo (`POST /v1/psp/customers/:id/unblock`, sin body). Si no lo habías
   * bloqueado, lo devuelve igual. Un bloqueo de Raya solo lo levantamos nosotros: da
   * `ConflictError` con `code === "CUSTOMER_STATUS_CONFLICT"` y `error.data.blocked_by` en `raya`.
   */
  async unblock(customerId: string, options?: PostRequestOptions): Promise<PspCustomer> {
    return this.#action(customerId, "/unblock", options);
  }

  /**
   * Da de baja el CVU de un cliente (`POST /v1/psp/customers/:id/close`, sin body): queda
   * `closed`, con su saldo y su historial, y se puede recrear. Solo `active` o bloqueado por vos
   * (tu bloqueo se levanta); con saldo también se puede, y el saldo sigue en tu cuenta. Dar de baja
   * uno `closed` lo devuelve igual. En cualquier otro estado, o con un bloqueo de Raya, da
   * `ConflictError` con `code === "CUSTOMER_STATUS_CONFLICT"`.
   */
  async close(customerId: string, options?: PostRequestOptions): Promise<PspCustomer> {
    return this.#action(customerId, "/close", options);
  }

  /**
   * Le da un CVU nuevo a un cliente `closed` o `failed`, sin bloqueos
   * (`POST /v1/psp/customers/:id/recreate`, sin body). Conserva su `id`, su saldo y su historial.
   * Vuelve `200` con `status` en `active` o `failed`, o `202` con `pending` mientras lo creamos (y
   * te avisamos con `psp.customer.activated` o `psp.customer.failed`). En cualquier otro estado da
   * `ConflictError` con `code === "CUSTOMER_STATUS_CONFLICT"`.
   */
  async recreate(customerId: string, options?: PostRequestOptions): Promise<PspCustomer> {
    return this.#action(customerId, "/recreate", options);
  }

  async #action(
    customerId: string,
    action: string,
    options: PostRequestOptions | undefined,
  ): Promise<PspCustomer> {
    const path = customerPath(customerId, action);
    return (await this.#requestor.request("POST", path, {}, options, CUSTOMER)) as PspCustomer;
  }
}

/** `client.psp.transfers`: lo que reciben tus clientes y lo que transferís en su nombre. */
export class PspTransferService {
  readonly #requestor: APIRequestor;

  constructor(requestor: APIRequestor) {
    this.#requestor = requestor;
  }

  /**
   * Transfiere pesos en nombre de un cliente a un CBU, CVU o alias (`POST /v1/psp/transfers`).
   *
   * Tienen que alcanzar los dos saldos: primero el tuyo (si no, `UnprocessableEntityError` con
   * `code === "INSUFFICIENT_BALANCE"`) y después el del cliente
   * (`code === "CUSTOMER_INSUFFICIENT_BALANCE"`). El cliente tiene que estar `active`: si no, o si
   * está bloqueado, da `ConflictError` con `code === "CUSTOMER_STATUS_CONFLICT"`. Buscamos al
   * titular del destino y te lo devolvemos en `counterparty`. Si el destino es una cuenta de Raya,
   * vuelve `completed`; si no, `pending` hasta que te avisamos con `psp.transfer.sent` o
   * `psp.transfer.failed`.
   *
   * La `idempotencyKey` es obligatoria: un UUID v4 que guardás con la transferencia **antes** de
   * llamar y reusás en cada reintento. Así nunca se transfiere dos veces. Para volver a intentar
   * una transferencia que terminó `failed`, usá una clave nueva.
   */
  async create(
    params: PspTransferCreateParams,
    options: PspTransferCreateOptions,
  ): Promise<PspTransfer> {
    const body = transferBody(params);
    requirePspTransferIdempotencyKey(options);
    return (await this.#requestor.request(
      "POST",
      TRANSFERS_PATH,
      { body },
      options,
      TRANSFER,
    )) as PspTransfer;
  }

  /**
   * Una transferencia de un cliente, recibida o enviada (`GET /v1/psp/transfers/:id`). Si no
   * existe o no es de tu cuenta, da `NotFoundError` con `code === "TRANSFER_NOT_FOUND"`.
   */
  async retrieve(transferId: string, options?: RequestOptions): Promise<PspTransfer> {
    const path = `${TRANSFERS_PATH}/${pathId("transferId", transferId)}`;
    return (await this.#requestor.request("GET", path, {}, options, TRANSFER)) as PspTransfer;
  }

  /**
   * Las transferencias de tus clientes, de la más nueva a la más vieja (`GET /v1/psp/transfers`):
   * las que recibieron y las que enviaste en su nombre. No aparecen en `client.transfers.list()`.
   *
   * Devuelve una página. Para recorrer todas: `for await (const t of page.autoPagingIter())`.
   */
  async list(
    params?: PspTransferListParams,
    options?: RequestOptions,
  ): Promise<ListObject<PspTransfer>> {
    const values = checkParams("psp.transfers.list", params, TRANSFER_LIST_PARAMS);
    const query = encodeQuery(
      Object.fromEntries(TRANSFER_LIST_PARAMS.map((name) => [name, values[name]])),
    );
    const page = await this.#requestor.requestList(TRANSFERS_PATH, query, options);
    return page as ListObject<PspTransfer>;
  }
}

/** `client.psp.balance`: tu saldo y el de tus clientes. */
export class PspBalanceService {
  readonly #requestor: APIRequestor;

  constructor(requestor: APIRequestor) {
    this.#requestor = requestor;
  }

  /**
   * Tu saldo y el de tus clientes (`GET /v1/psp/balance`): `available` es tu saldo disponible (el
   * mismo de `client.balance.retrieve()`) y `customers_balance`, la suma de los saldos de tus
   * clientes.
   */
  async retrieve(options?: RequestOptions): Promise<PspBalance> {
    return (await this.#requestor.request(
      "GET",
      "/v1/psp/balance",
      {},
      options,
      "psp.balance",
    )) as PspBalance;
  }
}

/**
 * `client.psp`: Raya PSP, para darles a tus clientes un CVU a su nombre, leer su saldo y
 * transferir en su nombre. Solo para cuentas de empresa con Raya PSP activado. Va con tu clave
 * secreta.
 */
export class PspService {
  /**
   * `client.psp.customers.create/retrieve/list/retrieveBalance/block/unblock/close/recreate`.
   */
  readonly customers: PspCustomerService;
  /** `client.psp.transfers.create/retrieve/list`. */
  readonly transfers: PspTransferService;
  /** `client.psp.balance.retrieve`. */
  readonly balance: PspBalanceService;

  constructor(requestor: APIRequestor) {
    this.customers = new PspCustomerService(requestor);
    this.transfers = new PspTransferService(requestor);
    this.balance = new PspBalanceService(requestor);
  }
}
