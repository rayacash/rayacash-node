import type { ConnectOrder } from "./connectOrder.ts";
import {
  type Amount,
  canonicalAmount,
  checkParams,
  isPlainObject,
  pathId,
  typeName,
} from "./encoding.ts";
import type { PostRequestOptions, RequestOptions } from "./requestOptions.ts";
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
 * `client.connect`: Raya Connect, para cobrar a nombre de las cuentas que conectaron tu app, con
 * tu comisión.
 */
export class ConnectService {
  /** `client.connect.orders.create/retrieve/refund`. */
  readonly orders: ConnectOrderService;

  constructor(requestor: APIRequestor) {
    this.orders = new ConnectOrderService(requestor);
  }
}
