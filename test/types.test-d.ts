// Chequeo estático de la superficie pública: lo corre tsc (npm run typecheck), nunca node:test.
//
// Si un tipo de retorno cambia sin querer, `is<…>()` deja de compilar.

import {
  type APIError,
  type Balance,
  config,
  type Event,
  Balance as GlobalBalance,
  Payment as GlobalPayment,
  Transfer as GlobalTransfer,
  type InvalidRequestError,
  type ListObject,
  type Payment,
  type RayaClient,
  type RayaError,
  type RayaObject,
  type RayaResponse,
  type Transfer,
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

  const event = client.constructEvent(Buffer.from("{}"), "t=1,v1=x", "whsec_x");
  check(event).is<Event>();
  check(event.data.object).is<Transfer | Payment | RayaObject>();

  // @ts-expect-error: la idempotencyKey es obligatoria en transfers.create.
  await client.transfers.create({ amount: 1, destination: "x" });
  const key = { idempotencyKey: "k" };
  // @ts-expect-error: va en las opciones, no en los parámetros.
  await client.transfers.create({ amount: 1, destination: "x", idempotencyKey: "k" }, key);
  // @ts-expect-error: los GET no llevan idempotencyKey.
  await client.balance.retrieve({ idempotencyKey: "k" });
  // @ts-expect-error: amount no acepta booleans.
  await client.payments.create({ amount: true });
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
}

export function errors(error: RayaError, apiError: APIError, invalid: InvalidRequestError): void {
  check(error.code).is<string | null>();
  check(error.requestId).is<string | null>();
  check(error.retryAfter).is<number | null>();
  check(apiError.headers).is<Headers>();
  check(invalid.param).is<string | null>();
}
