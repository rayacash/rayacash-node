// Chequeo estático de la superficie pública: lo corre tsc (npm run typecheck), nunca node:test.
//
// Si un tipo de retorno cambia sin querer, `is<…>()` deja de compilar.

import {
  type APIError,
  type Balance,
  type Checkout,
  type CheckoutBackUrlsParams,
  type CheckoutCreateParams,
  type CheckoutItemParams,
  type CheckoutOrdersService,
  type CheckoutService,
  type CheckoutStatus,
  type ConnectOrder,
  type ConnectOrderBackUrlsParams,
  type ConnectOrderCreateParams,
  type ConnectOrderItemParams,
  type ConnectOrderService,
  type ConnectOrderStatus,
  type ConnectService,
  config,
  type Event,
  type EventType,
  Balance as GlobalBalance,
  Checkout as GlobalCheckout,
  ConnectOrder as GlobalConnectOrder,
  OAuth as GlobalOAuth,
  Payment as GlobalPayment,
  Transfer as GlobalTransfer,
  User as GlobalUser,
  type InvalidRequestError,
  type ListObject,
  type OAuthToken,
  type OAuthTokenOptions,
  type Payment,
  type RayaClient,
  type RayaError,
  type RayaObject,
  type RayaResponse,
  type Transfer,
  type User,
} from "rayacash";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

function check<Actual>(_value?: Actual) {
  return {
    is<Expected>(..._proof: Equal<Actual, Expected> extends true ? [] : [never]): void {},
  };
}

export async function clientStyle(client: RayaClient): Promise<void> {
  const balance = await client.balance.retrieve();
  check(balance).is<Balance>();
  check(balance.available).is<number>();
  check(balance.lastResponse).is<RayaResponse | null>();

  const transfer = await client.transfers.create(
    { amount: "25000.50", destination: "0000123380736153041182" },
    { idempotencyKey: "k" },
  );
  check(transfer).is<Transfer>();
  check(transfer.counterparty).is<Transfer.Counterparty>();
  check(transfer.counterparty.tax_id).is<string | null>();
  check(transfer.status).is<"pending" | "completed" | "failed" | "reversed">();
  check(await client.transfers.retrieve("id")).is<Transfer>();

  const page = await client.transfers.list({
    direction: "inbound",
    limit: 100,
    created_gte: new Date(),
  });
  check(page).is<ListObject<Transfer>>();
  check(page.data).is<Transfer[]>();
  check(page.next_cursor).is<string | null>();
  for (const item of page) check(item).is<Transfer>();
  for await (const item of page.autoPagingIter()) check(item).is<Transfer>();
  check(await page.nextPage()).is<ListObject<Transfer>>();

  const payment = await client.payments.create({ amount: 15000, metadata: { cliente_id: "8812" } });
  check(payment).is<Payment>();
  check(payment.bank_transfer.alias).is<string | null>();
  check(payment.payer).is<Payment.Payer | null>();
  check(payment.metadata).is<Record<string, string>>();
  check(await client.payments.retrieve("id")).is<Payment>();
  check(await client.payments.refund("id", { idempotencyKey: "r" })).is<Payment>();
  check(await payment.refund()).is<Payment>();
  check(await client.rawRequest("get", "/v1/balance")).is<RayaObject>();

  // Raya Connect.
  const token = await client.oauth.token({
    client_id: "7650337728110670",
    client_secret: "raya_cs_live_x",
    code: "c0d3",
    redirect_uri: "https://tienda.example.com/raya/callback",
  });
  check(token).is<OAuthToken>();
  check(token.access_token).is<string>();
  check(token.user_id).is<string>();
  check(token.expires_in).is<null>();

  const user = await client.users.retrieve(token.user_id);
  check(user).is<User>();
  check(user.type).is<"personal" | "business">();
  check(user.identification).is<User.Identification | null>();
  check(user.address).is<User.Address | null>();
  check(user.business).is<User.Business | null>();
  check(user.merchant).is<User.Merchant | null>();
  // Sin dato viene null (en una empresa, last_name siempre): el tipo tiene que decirlo.
  check(user.first_name).is<string | null>();
  check(user.last_name).is<string | null>();
  check(user.full_name).is<string | null>();
  if (user.identification) check(user.identification.type).is<"DNI" | "CUIT">();
  if (user.business) {
    check(user.business.legal_name).is<string | null>();
    check(user.business.tax_id).is<string | null>();
    check(user.business.company_type).is<string | null>();
    if (user.business.representative) {
      check(user.business.representative.first_name).is<string | null>();
      check(user.business.representative.last_name).is<string | null>();
      check(user.business.representative.tax_id).is<string | null>();
    }
  }

  const order = await client.connect.orders.create({
    items: [{ title: "Pedido 1042", quantity: 1, unit_price: "45000.00" }],
    fee: 500,
    back_urls: { success: "https://tienda.example.com/pedidos/1042" },
    auto_return: "approved",
    expires_in: 3600,
  });
  check(order).is<ConnectOrder>();
  check(order.status).is<"pending" | "succeeded" | "failed" | "expired" | "refunded">();
  check(order.items).is<ConnectOrder.Item[]>();
  check(order.bank_transfer).is<ConnectOrder.BankTransfer>();
  check(order.back_urls).is<ConnectOrder.BackUrls>();
  check(order.payer).is<ConnectOrder.Payer | null>();
  check(order.metadata).is<Record<string, string>>();
  check(await client.connect.orders.retrieve("id")).is<ConnectOrder>();
  check(await client.connect.orders.refund("id", { idempotencyKey: "r" })).is<ConnectOrder>();
  check(await order.refund()).is<ConnectOrder>();

  const event = client.constructEvent(Buffer.from("{}"), "t=1,v1=x", "whsec_x");
  check(event).is<Event>();
  check(event.data.object).is<Transfer | Payment | ConnectOrder | RayaObject>();

  // @ts-expect-error: la idempotencyKey es obligatoria en transfers.create.
  await client.transfers.create({ amount: 1, destination: "x" });
  const key = { idempotencyKey: "k" };
  // @ts-expect-error: va en las opciones, no en los parámetros.
  await client.transfers.create({ amount: 1, destination: "x", idempotencyKey: "k" }, key);
  // @ts-expect-error: los GET no llevan idempotencyKey.
  await client.balance.retrieve({ idempotencyKey: "k" });
  // @ts-expect-error: amount no acepta booleans.
  await client.payments.create({ amount: true });
  const grant = { client_id: "1", client_secret: "s", code: "c", redirect_uri: "u" };
  // @ts-expect-error: oauth.token no lleva Authorization: no acepta apiKey.
  await client.oauth.token(grant, { apiKey: "x" });
  // @ts-expect-error: oauth.token no lleva Idempotency-Key: no acepta idempotencyKey.
  await client.oauth.token(grant, { idempotencyKey: "k" });
  const tokenOptions: OAuthTokenOptions = { timeout: 5_000, maxNetworkRetries: 0 };
  check(await client.oauth.token(grant, tokenOptions)).is<OAuthToken>();
  // @ts-expect-error: auto_return solo acepta "approved".
  await client.connect.orders.create({ items: [], auto_return: "all" });
  // @ts-expect-error: unit_price no acepta booleans.
  await client.connect.orders.create({ items: [{ title: "x", quantity: 1, unit_price: true }] });
}

export async function globalStyle(): Promise<void> {
  config.apiKey = process.env.RAYA_SECRET_KEY;
  config.maxNetworkRetries = 4;
  check(await GlobalBalance.retrieve()).is<Balance>();
  check(
    await GlobalTransfer.create(
      { amount: 1, destination: "alias.prueba" },
      { idempotencyKey: "k" },
    ),
  ).is<Transfer>();
  check(await GlobalTransfer.list()).is<ListObject<Transfer>>();
  const payment = await GlobalPayment.retrieve("id");
  check(await payment.refund()).is<Payment>();
  check(await GlobalPayment.refund("id")).is<Payment>();
  check(GlobalPayment.constructFrom({ object: "payment" })).is<Payment>();

  const token = await GlobalOAuth.token({
    client_id: "7650337728110670",
    client_secret: "raya_cs_live_x",
    code: "c0d3",
    redirect_uri: "https://tienda.example.com/raya/callback",
  });
  check(token).is<OAuthToken>();
  // @ts-expect-error: tampoco en el estilo global: oauth.token no lleva Idempotency-Key.
  await GlobalOAuth.token(token, { idempotencyKey: "k" });
  check(await GlobalUser.retrieve(token.user_id)).is<User>();
  const order = await GlobalConnectOrder.create({
    items: [{ title: "Pedido 1042", quantity: 1, unit_price: 45000 }],
  });
  check(order).is<ConnectOrder>();
  check(await GlobalConnectOrder.retrieve("id")).is<ConnectOrder>();
  check(await GlobalConnectOrder.refund("id")).is<ConnectOrder>();
  check(await order.refund()).is<ConnectOrder>();
  check(GlobalConnectOrder.constructFrom({ object: "connect.order" })).is<ConnectOrder>();
}

// Los nombres de la 1.1.0, deprecados hasta la 2.0.0: el código escrito para la 1.1.0 tiene que
// seguir compilando, con los mismos tipos que los nombres de Raya Connect.
export async function deprecatedAliases(client: RayaClient, event: Event): Promise<void> {
  check(client.checkout).is<ConnectService>();
  check(client.checkout).is<CheckoutService>();
  // De solo lectura, como en la 1.1.0: el setter (para el JavaScript que lo reasignaba) no está en
  // el tipo.
  // @ts-expect-error: checkout es de solo lectura.
  client.checkout = client.connect;
  check(client.checkout.orders).is<ConnectOrderService>();
  check(client.checkout.orders).is<CheckoutOrdersService>();
  check<typeof GlobalCheckout>().is<typeof GlobalConnectOrder>();
  check<Checkout>().is<ConnectOrder>();
  check<Checkout.Item>().is<ConnectOrder.Item>();
  check<Checkout.BankTransfer>().is<ConnectOrder.BankTransfer>();
  check<Checkout.BackUrls>().is<ConnectOrder.BackUrls>();
  check<Checkout.Payer>().is<ConnectOrder.Payer>();
  check<CheckoutStatus>().is<ConnectOrderStatus>();
  check<CheckoutCreateParams>().is<ConnectOrderCreateParams>();
  check<CheckoutItemParams>().is<ConnectOrderItemParams>();
  check<CheckoutBackUrlsParams>().is<ConnectOrderBackUrlsParams>();
  // Los servicios van solo como tipos, como en la 1.1.0, y `typeof` sigue andando.
  check<InstanceType<typeof CheckoutService>>().is<ConnectService>();
  check<InstanceType<typeof CheckoutOrdersService>>().is<ConnectOrderService>();

  // Como en el README de la 1.1.0.
  const item: CheckoutItemParams = { title: "Pedido 1042", quantity: 1, unit_price: 45000 };
  const backUrls: CheckoutBackUrlsParams = { success: "https://tienda.example.com/pedidos/1042" };
  const params: CheckoutCreateParams = { items: [item], fee: 500, back_urls: backUrls };
  const checkout = await client.checkout.orders.create(params, { idempotencyKey: "k" });
  check(checkout).is<Checkout>();
  check(checkout.status).is<CheckoutStatus>();
  check(checkout.items).is<Checkout.Item[]>();
  check(checkout.bank_transfer).is<Checkout.BankTransfer>();
  check(checkout.back_urls).is<Checkout.BackUrls>();
  check(checkout.payer).is<Checkout.Payer | null>();
  // "checkout" sigue siendo un `object` posible: el de un webhook de antes del cambio de nombre.
  check(checkout.object).is<"connect.order" | "checkout">();
  check(await client.checkout.orders.retrieve(checkout.id)).is<Checkout>();
  check(await client.checkout.orders.refund(checkout.id, { idempotencyKey: "r" })).is<Checkout>();
  check(await checkout.refund()).is<Checkout>();
  check(await GlobalCheckout.create(params)).is<Checkout>();
  check(await GlobalCheckout.retrieve("id")).is<Checkout>();
  check(await GlobalCheckout.refund("id")).is<Checkout>();
  check(GlobalCheckout.constructFrom({ object: "checkout" })).is<ConnectOrder>();

  // instanceof anda con los dos nombres.
  const object = event.data.object;
  if (object instanceof GlobalCheckout) check(object).is<ConnectOrder>();
  if (object instanceof GlobalConnectOrder) check(object).is<Checkout>();
  // Los checkout.* siguen en EventType para que esto compile, aunque la API ya no los emite.
  check<Extract<EventType, `checkout.${string}`>>().is<
    "checkout.created" | "checkout.succeeded" | "checkout.failed" | "checkout.refunded"
  >();
  if (event.type === "checkout.succeeded") check(event.type).is<"checkout.succeeded">();
}

export function errors(error: RayaError, apiError: APIError, invalid: InvalidRequestError): void {
  check(error.code).is<string | null>();
  check(error.requestId).is<string | null>();
  check(error.retryAfter).is<number | null>();
  check(apiError.headers).is<Headers>();
  check(invalid.param).is<string | null>();
}
