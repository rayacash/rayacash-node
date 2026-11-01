import {
  type Amount,
  canonicalAmount,
  checkParams,
  encodeQuery,
  pathId,
  validateIdempotencyKey,
} from "./encoding.ts";
import type { ListObject } from "./listObject.ts";
import {
  type RequestOptions,
  type TransferCreateOptions,
  validateOptions,
} from "./requestOptions.ts";
import type { APIRequestor } from "./requestor.ts";
import type { Transfer, TransferDirection, TransferStatus } from "./transfer.ts";

export interface TransferCreateParams {
  /** Pesos, hasta 2 decimales: `25000`, `"25000.50"` o un `Decimal`. */
  amount: Amount;
  /** CBU o CVU (22 dígitos) o alias (6 a 20 caracteres), siempre como string. */
  destination: string;
}

export interface TransferListParams {
  /** `inbound` (recibidas) u `outbound` (enviadas). */
  direction?: TransferDirection | null;
  /** `pending`, `completed`, `failed` o `reversed`. */
  status?: TransferStatus | null;
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

const CREATE_PARAMS = ["amount", "destination"] as const;
const LIST_PARAMS = [
  "direction",
  "status",
  "created_gte",
  "created_lt",
  "limit",
  "cursor",
] as const;

function createBody(params: unknown): Record<string, unknown> {
  const values = checkParams("transfers.create", params, CREATE_PARAMS);
  const destination = values.destination;
  if (typeof destination !== "string") {
    throw new TypeError(
      "destination tiene que ser un string (CBU, CVU o alias): un CBU como número pierde los " +
        "ceros de adelante.",
    );
  }
  return { amount: canonicalAmount(values.amount), destination };
}

function requireIdempotencyKey(options: unknown): void {
  const key = validateOptions(options).idempotencyKey;
  if (key === undefined) {
    throw new TypeError(
      "transfers.create necesita idempotencyKey: generá un UUID v4 con crypto.randomUUID(), " +
        "guardalo con la operación antes de llamar y reusalo en cada reintento: " +
        "transfers.create({ amount, destination }, { idempotencyKey }).",
    );
  }
  validateIdempotencyKey(key);
}

/** `client.transfers`: enviar pesos y consultar las transferencias enviadas y recibidas. */
export class TransferService {
  readonly #requestor: APIRequestor;

  constructor(requestor: APIRequestor) {
    this.#requestor = requestor;
  }

  /**
   * Envía pesos desde tu saldo a un CBU, CVU o alias (`POST /v1/transfers`).
   *
   * Buscamos al titular del destino y te lo devolvemos en `counterparty`. Si el destino es una
   * cuenta de Raya, vuelve `completed`; si no, `pending` hasta que te avisamos con `transfer.sent`
   * o `transfer.failed`.
   *
   * La `idempotencyKey` es obligatoria: un UUID v4 que guardás con la operación **antes** de
   * llamar y reusás en cada reintento. Así nunca se transfiere dos veces. Para volver a intentar
   * una transferencia que terminó `failed`, usá una clave nueva.
   */
  async create(params: TransferCreateParams, options: TransferCreateOptions): Promise<Transfer> {
    const body = createBody(params);
    requireIdempotencyKey(options);
    return (await this.#requestor.request(
      "POST",
      "/v1/transfers",
      { body },
      options,
      "transfer",
    )) as Transfer;
  }

  /** Una transferencia, enviada o recibida (`GET /v1/transfers/:id`). */
  async retrieve(transferId: string, options?: RequestOptions): Promise<Transfer> {
    const path = `/v1/transfers/${pathId("transferId", transferId)}`;
    return (await this.#requestor.request("GET", path, {}, options, "transfer")) as Transfer;
  }

  /**
   * Tus transferencias, de la más nueva a la más vieja (`GET /v1/transfers`).
   *
   * Devuelve una página. Para recorrer todas: `for await (const t of page.autoPagingIter())`.
   */
  async list(params?: TransferListParams, options?: RequestOptions): Promise<ListObject<Transfer>> {
    const values = checkParams("transfers.list", params, LIST_PARAMS);
    const query = encodeQuery(Object.fromEntries(LIST_PARAMS.map((name) => [name, values[name]])));
    const page = await this.#requestor.requestList("/v1/transfers", query, options);
    return page as ListObject<Transfer>;
  }
}
