import type { ConnectOrder } from "./connectOrder.ts";
import type { ConnectPayout, ConnectPayoutStatus } from "./connectPayout.ts";
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
import {
  type ConnectPayoutCreateOptions,
  type PostRequestOptions,
  type RequestOptions,
  validateOptions,
} from "./requestOptions.ts";
import type { APIRequestor } from "./requestor.ts";

/** Un ítem de lo que se cobra. */
export interface ConnectOrderItemParams {
  /** Qué es (hasta 255 caracteres, en una línea). Se muestra en la página de pago. */
  title: string;
  /** Cuántos: un entero de 1 a 999. */
  quantity: number;
  /** El precio unitario en pesos, hasta 2 decimales: `45000`, `"45000.50"` o un `Decimal`. */
  unit_price: Amount;
}

/** A dónde vuelve quien paga desde `checkout_url`. */
export interface ConnectOrderBackUrlsParams {
  /** Después de pagar. */
  success?: string | null;
  /** Si el pago falla o vence. */
  failure?: string | null;
}

export interface ConnectOrderCreateParams {
  /**
   * De 1 a 20 ítems. El total (la suma de `quantity` × `unit_price`, hasta 99999999.99) es lo que
   * tiene que transferir quien paga.
   */
  items: ConnectOrderItemParams[];
  /**
   * Tu comisión en pesos, menor que el total: un monto, no un porcentaje. La retenemos del pago y
   * la liquidamos a tu cuenta. Por defecto, 0.
   */
  fee?: Amount | null;
  /**
   * Texto para identificar el cobro (hasta 255 caracteres); lo ve la cuenta conectada en su pago.
   * Si no lo mandás, queda el `title` del ítem (con varios, «<title> y N más»).
   */
  description?: string | null;
  /** Tu identificador, como el número de pedido. */
  external_reference?: string | null;
  /** Hasta 20 pares clave-valor de texto. */
  metadata?: Record<string, string> | null;
  /** `success` y `failure`: a dónde vuelve quien paga desde `checkout_url`. */
  back_urls?: ConnectOrderBackUrlsParams | null;
  /** `"approved"`: al acreditarse, mandamos solos a quien paga a `back_urls.success`. */
  auto_return?: "approved" | null;
  /**
   * El destino de Developers › Webhooks de tu cuenta para los `connect.order.*` de este pago: su
   * id (`we_…`) o su URL exacta. Sin él, van a los destinos suscriptos a `connect.order.*`.
   */
  notification_url?: string | null;
  /**
   * Cuántos segundos se puede pagar, de 300 (5 minutos) a 864000 (10 días). Por defecto, el
   * plazo del comercio conectado (24 horas salvo que lo haya cambiado). Cada pago `pending`
   * ocupa un CVU del comercio: no lo alargues más de lo necesario.
   */
  expires_in?: number | null;
}

export interface ConnectPayoutCreateParams {
  /**
   * Lo que sale de tu saldo, en pesos, hasta 2 decimales: `60000`, `"60000.50"` o un `Decimal`. La
   * comisión se descuenta de acá.
   */
  amount: Amount;
  /**
   * A dónde enviarlo: un CBU o CVU (22 dígitos) o un alias (6 a 20 caracteres), siempre como
   * string. El titular lo buscamos nosotros y te lo devolvemos en `counterparty`.
   */
  destination: string;
}

export interface ConnectPayoutListParams {
  /** `pending`, `completed`, `failed` o `reversed`. */
  status?: ConnectPayoutStatus | null;
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

const CREATE_PARAMS = [
  "items",
  "fee",
  "description",
  "external_reference",
  "metadata",
  "back_urls",
  "auto_return",
  "notification_url",
  "expires_in",
] as const;
const ITEM_PARAMS = ["title", "quantity", "unit_price"] as const;
const BACK_URL_PARAMS = ["success", "failure"] as const;

function itemsBody(items: unknown): Record<string, unknown>[] {
  if (!Array.isArray(items)) {
    throw new TypeError(
      "items tiene que ser una lista de ítems, como " +
        `[{ title: "Pedido 1042", quantity: 1, unit_price: 45000 }], no ${typeName(items)}.`,
    );
  }
  return items.map((item: unknown, index) => {
    const name = `items[${index}]`;
    if (!isPlainObject(item)) {
      throw new TypeError(
        `${name} tiene que ser un objeto { title, quantity, unit_price }, no ${typeName(item)}.`,
      );
    }
    const values = checkParams(name, item, ITEM_PARAMS);
    return {
      title: values.title,
      quantity: values.quantity,
      unit_price: canonicalAmount(values.unit_price, `${name}.unit_price`),
    };
  });
}

/** Solo las URLs que vinieron; sin ninguna, no va `back_urls`. */
function backUrlsBody(backUrls: unknown): Record<string, unknown> | undefined {
  if (backUrls === undefined || backUrls === null) return undefined;
  if (!isPlainObject(backUrls)) {
    throw new TypeError(
      `back_urls tiene que ser un objeto { success, failure }, no ${typeName(backUrls)}.`,
    );
  }
  const values = checkParams("back_urls", backUrls, BACK_URL_PARAMS);
  const result: Record<string, unknown> = {};
  for (const name of BACK_URL_PARAMS) {
    const value = values[name];
    if (value !== undefined && value !== null) result[name] = value;
  }
  return Object.keys(result).length ? result : undefined;
}

function createBody(params: unknown): Record<string, unknown> {
  const values = checkParams("connect.orders.create", params, CREATE_PARAMS);
  const metadata = values.metadata;
  if (metadata !== undefined && metadata !== null && !isPlainObject(metadata)) {
    throw new TypeError(
      'metadata tiene que ser un objeto de string a string, como { pedido_id: "1042" }.',
    );
  }
  const fee = values.fee;
  return {
    items: itemsBody(values.items),
    fee: fee === undefined || fee === null ? undefined : canonicalAmount(fee, "fee"),
    description: values.description,
    external_reference: values.external_reference,
    metadata,
    back_urls: backUrlsBody(values.back_urls),
    auto_return: values.auto_return,
    notification_url: values.notification_url,
    expires_in: values.expires_in,
  };
}

function orderPath(orderId: string): string {
  return `/v1/connect/orders/${pathId("orderId", orderId)}`;
}

const PAYOUT_CREATE_PARAMS = ["amount", "destination"] as const;
const PAYOUT_LIST_PARAMS = ["status", "created_gte", "created_lt", "limit", "cursor"] as const;

function payoutBody(params: unknown): Record<string, unknown> {
  const values = checkParams("connect.payouts.create", params, PAYOUT_CREATE_PARAMS);
  const destination = values.destination;
  if (typeof destination !== "string") {
    throw new TypeError(
      "destination tiene que ser un string (CBU, CVU o alias): un CBU como número pierde los " +
        "ceros de adelante.",
    );
  }
  return { amount: canonicalAmount(values.amount), destination };
}

function requirePayoutIdempotencyKey(options: unknown): void {
  const key = validateOptions(options).idempotencyKey;
  if (key === undefined) {
    throw new TypeError(
      "connect.payouts.create necesita idempotencyKey: generá un UUID v4 con " +
        "crypto.randomUUID(), guardalo con el payout antes de llamar y reusalo en cada " +
        "reintento: connect.payouts.create({ amount, destination }, { idempotencyKey }).",
    );
  }
  validateIdempotencyKey(key);
}

/** `client.connect.orders`: los pagos a nombre de una cuenta conectada. */
export class ConnectOrderService {
  readonly #requestor: APIRequestor;

  constructor(requestor: APIRequestor) {
    this.#requestor = requestor;
  }

  /**
   * Crea un pago `pending` a nombre de la cuenta conectada del access_token, con un CVU y un
   * alias exclusivos (`POST /v1/connect/orders`).
   *
   * Mandá a quien paga a `checkout_url` (nuestra página, con el nombre y la imagen del comercio
   * conectado), o mostrale `bank_transfer.cvu` y `bank_transfer.alias`. Te avisamos con
   * `connect.order.succeeded` cuando llega la transferencia: lo recibido menos `fee` se liquida al
   * comercio conectado y `fee`, a tu cuenta. Puede tardar hasta 40 s si damos de alta un CVU nuevo
   * (el timeout por defecto es de 65 s).
   *
   * La `idempotencyKey` es opcional pero recomendada: guardala con el pedido y reusala si
   * reintentás. Si no la pasás, generamos una que protege los reintentos de esta llamada.
   */
  async create(
    params: ConnectOrderCreateParams,
    options?: PostRequestOptions,
  ): Promise<ConnectOrder> {
    const body = createBody(params);
    return (await this.#requestor.request(
      "POST",
      "/v1/connect/orders",
      { body },
      options,
      "connect.order",
    )) as ConnectOrder;
  }

  /**
   * Un pago de tu app a nombre de esa cuenta (`GET /v1/connect/orders/:id`). Los de otras
   * cuentas conectadas dan `NotFoundError` con `code === "ORDER_NOT_FOUND"`.
   */
  async retrieve(orderId: string, options?: RequestOptions): Promise<ConnectOrder> {
    return (await this.#requestor.request(
      "GET",
      orderPath(orderId),
      {},
      options,
      "connect.order",
    )) as ConnectOrder;
  }

  /**
   * Devuelve todo lo recibido a la cuenta desde la que se pagó y revierte tu comisión
   * (`POST /v1/connect/orders/:id/refund`).
   *
   * Solo pagos `succeeded`, hasta 30 días después de `paid_at`. Es total: no hay reembolsos
   * parciales. Si la confirmación tarda, sale `APIError` con `code === "BANK_UNAVAILABLE"`:
   * reintentá más tarde con la misma `idempotencyKey` (nunca se manda dos veces) o esperá el
   * webhook `connect.order.refunded`.
   */
  async refund(orderId: string, options?: PostRequestOptions): Promise<ConnectOrder> {
    return (await this.#requestor.request(
      "POST",
      `${orderPath(orderId)}/refund`,
      {},
      options,
      "connect.order",
    )) as ConnectOrder;
  }
}

/**
 * `client.connect.payouts`: enviarles dinero a los vendedores de tu plataforma desde tu saldo. Va
 * con tu clave secreta, no con el access_token de una cuenta conectada: la plata es tuya.
 */
export class ConnectPayoutService {
  readonly #requestor: APIRequestor;

  constructor(requestor: APIRequestor) {
    this.#requestor = requestor;
  }

  /**
   * Envía pesos desde tu saldo a un CBU, CVU o alias (`POST /v1/connect/payouts`).
   *
   * Descontamos `amount` de tu saldo apenas lo creás y la cuenta de destino recibe `net_amount`,
   * que es `amount` menos `processing_fee`. Buscamos al titular y te lo devolvemos en
   * `counterparty`: no hay paso de confirmación, así que revisá el destino antes de llamar. Si el
   * destino es una cuenta de Raya, vuelve `completed`; si no, `pending` hasta que te avisamos con
   * `transfer.sent` o `transfer.failed`, con el mismo `id`. Si falla, te devolvemos `amount`
   * entero, incluida la comisión.
   *
   * Sale solo de tu saldo disponible: los cobros de tus pagos se suman cuando se liquidan. Si tu
   * negocio todavía no tiene una cuenta propia para enviar, da `PermissionDeniedError` con
   * `code === "PAYOUT_ORIGIN_UNAVAILABLE"`.
   *
   * La `idempotencyKey` es obligatoria: un UUID v4 que guardás con el payout **antes** de llamar y
   * reusás en cada reintento. Así nunca se envía dos veces. Para volver a intentar un payout que
   * terminó `failed`, usá una clave nueva.
   */
  async create(
    params: ConnectPayoutCreateParams,
    options: ConnectPayoutCreateOptions,
  ): Promise<ConnectPayout> {
    const body = payoutBody(params);
    requirePayoutIdempotencyKey(options);
    return (await this.#requestor.request(
      "POST",
      "/v1/connect/payouts",
      { body },
      options,
      "connect.payout",
    )) as ConnectPayout;
  }

  /**
   * Un payout de tu cuenta (`GET /v1/connect/payouts/:id`). Si no existe, no es tuyo o es el id de
   * una transferencia que no es un payout, da `NotFoundError` con
   * `code === "PAYOUT_NOT_FOUND"`.
   */
  async retrieve(payoutId: string, options?: RequestOptions): Promise<ConnectPayout> {
    return (await this.#requestor.request(
      "GET",
      `/v1/connect/payouts/${pathId("payoutId", payoutId)}`,
      {},
      options,
      "connect.payout",
    )) as ConnectPayout;
  }

  /**
   * Tus payouts, del más nuevo al más viejo (`GET /v1/connect/payouts`).
   *
   * Devuelve una página. Para recorrer todas: `for await (const p of page.autoPagingIter())`.
   */
  async list(
    params?: ConnectPayoutListParams,
    options?: RequestOptions,
  ): Promise<ListObject<ConnectPayout>> {
    const values = checkParams("connect.payouts.list", params, PAYOUT_LIST_PARAMS);
    const query = encodeQuery(
      Object.fromEntries(PAYOUT_LIST_PARAMS.map((name) => [name, values[name]])),
    );
    const page = await this.#requestor.requestList("/v1/connect/payouts", query, options);
    return page as ListObject<ConnectPayout>;
  }
}

/**
 * `client.connect`: Raya Connect. `orders` cobra a nombre de las cuentas que conectaron tu app,
 * con tu comisión, y va con el access_token de cada cuenta; `payouts` les envía dinero a tus
 * vendedores desde tu saldo, y va con tu clave secreta.
 */
export class ConnectService {
  /** `client.connect.orders.create/retrieve/refund`, con el access_token de la cuenta conectada. */
  readonly orders: ConnectOrderService;
  /** `client.connect.payouts.create/retrieve/list`, con tu clave secreta. */
  readonly payouts: ConnectPayoutService;

  constructor(requestor: APIRequestor) {
    this.orders = new ConnectOrderService(requestor);
    this.payouts = new ConnectPayoutService(requestor);
  }
}
