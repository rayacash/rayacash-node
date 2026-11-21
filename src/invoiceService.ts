import {
  type Amount,
  canonicalAmount,
  checkParams,
  encodeQuery,
  isPlainObject,
  pathId,
  validateIdempotencyKey,
} from "./encoding.ts";
import type { Invoice, InvoiceStatus } from "./invoice.ts";
import type { ListObject } from "./listObject.ts";
import {
  type InvoiceCreateOptions,
  type RequestOptions,
  validateOptions,
} from "./requestOptions.ts";
import type { APIRequestor } from "./requestor.ts";

export interface InvoiceCreateParams {
  /**
   * El DNI de tu cliente, siempre como string: de 6 a 8 dígitos, como `"12345678"`. La factura sale
   * a nombre de un consumidor final con ese DNI.
   */
  dni: string;
  /**
   * El total en pesos, con hasta 2 decimales: `15000`, `"15000.50"` o un `Decimal`. En una
   * Factura B incluye el IVA, que desglosamos en `net_amount` y `vat_amount`, y es de al menos
   * `0.03` (con menos, el IVA da cero: `PARAMETER_INVALID`).
   */
  amount: Amount;
  /** Hasta 20 pares clave-valor de texto, como tu número de pedido. Nunca datos personales. */
  metadata?: Record<string, string> | null;
}

export interface InvoiceListParams {
  /** `pending`, `issued`, `rejected` o `failed`. */
  status?: InvoiceStatus | null;
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

const PATH = "/v1/invoices";
const OBJECT = "invoice";
// Las dos listas son el espejo de la API (facturador/api_params.py): en ese orden viajan el body y
// la query. La lista no filtra por DNI: sería un dato personal en la URL.
const CREATE_PARAMS = ["dni", "amount", "metadata"] as const;
const LIST_PARAMS = ["status", "created_gte", "created_lt", "limit", "cursor"] as const;

/** El texto de la API para un `dni` inválido: el mismo, si no es un string. */
const DNI_MESSAGE =
  'dni tiene que ser un DNI de 6 a 8 dígitos, como texto (por ejemplo, "12345678").';

/**
 * El body en el orden de la API. Acá, solo lo que nunca puede andar: un `dni` que no es un string,
 * un monto que no es un número y una `metadata` que no es un objeto. El formato del DNI (que la API
 * limpia de puntos, espacios, guiones y ceros de adelante) y el rango del monto los valida la API.
 */
function createBody(params: unknown): Record<string, unknown> {
  const values = checkParams("invoices.create", params, CREATE_PARAMS);
  const dni = values.dni;
  if (typeof dni !== "string") throw new TypeError(DNI_MESSAGE);
  const amount = canonicalAmount(values.amount);
  const metadata = values.metadata;
  if (metadata !== undefined && metadata !== null && !isPlainObject(metadata)) {
    throw new TypeError(
      'metadata tiene que ser un objeto de string a string, como { pedido_id: "1042" }.',
    );
  }
  return { dni, amount, metadata };
}

function requireInvoiceIdempotencyKey(options: unknown): void {
  const key = validateOptions(options).idempotencyKey;
  if (key === undefined) {
    throw new TypeError(
      "invoices.create necesita idempotencyKey: generá un UUID v4 con crypto.randomUUID(), " +
        "guardalo con la factura antes de llamar y reusalo en cada reintento: " +
        "invoices.create({ dni, amount }, { idempotencyKey }).",
    );
  }
  validateIdempotencyKey(key);
}

/**
 * `client.invoices`: el Facturador, para emitir facturas electrónicas de ARCA con tu punto de venta
 * y tu certificado. Va con tu clave secreta y solo en tu cuenta real: no está en el sandbox.
 */
export class InvoiceService {
  readonly #requestor: APIRequestor;

  constructor(requestor: APIRequestor) {
    this.#requestor = requestor;
  }

  /**
   * Crea una factura electrónica de ARCA a un consumidor final, con su DNI y el total
   * (`POST /v1/invoices`). El punto de venta, el tipo (B o C, según tu condición frente al IVA) y
   * el concepto salen de tu Facturador. Vuelve `202` con `status: "pending"` y la emitimos en
   * segundo plano: te avisamos con `invoice.issued`, `invoice.rejected` o `invoice.failed`, o
   * consultala con `retrieve`.
   *
   * La `idempotencyKey` es obligatoria: un UUID v4 que guardás con la factura **antes** de llamar y
   * reusás en cada reintento. Así nunca se factura dos veces. Para volver a intentar una que terminó
   * `rejected` o `failed`, usá una clave nueva.
   *
   * Si tu Facturador todavía no está listo para emitir, da `PermissionDeniedError` con
   * `code === "FACTURADOR_NOT_READY"` y el motivo en `error.data.reason` (`not_configured`,
   * `checking`, `action_required`, `certificate_expired` o `disabled`).
   */
  async create(params: InvoiceCreateParams, options: InvoiceCreateOptions): Promise<Invoice> {
    const body = createBody(params);
    requireInvoiceIdempotencyKey(options);
    return (await this.#requestor.request("POST", PATH, { body }, options, OBJECT)) as Invoice;
  }

  /**
   * Una factura de tu cuenta (`GET /v1/invoices/:id`). Si no existe o no es tuya, da
   * `NotFoundError` con `code === "INVOICE_NOT_FOUND"`.
   */
  async retrieve(invoiceId: string, options?: RequestOptions): Promise<Invoice> {
    const path = `${PATH}/${pathId("invoiceId", invoiceId)}`;
    return (await this.#requestor.request("GET", path, {}, options, OBJECT)) as Invoice;
  }

  /**
   * Tus facturas, de la más nueva a la más vieja (`GET /v1/invoices`). No filtra por DNI: sería un
   * dato personal en la URL.
   *
   * Devuelve una página. Para recorrer todas: `for await (const i of page.autoPagingIter())`.
   */
  async list(params?: InvoiceListParams, options?: RequestOptions): Promise<ListObject<Invoice>> {
    const values = checkParams("invoices.list", params, LIST_PARAMS);
    const query = encodeQuery(Object.fromEntries(LIST_PARAMS.map((name) => [name, values[name]])));
    const page = await this.#requestor.requestList(PATH, query, options);
    return page as ListObject<Invoice>;
  }
}
