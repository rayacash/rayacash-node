// Los objetos de ejemplo de la referencia de la API (raya.cash/llm/api.md), iguales a los de
// rayacash-python/tests/fixtures.py.

export const BALANCE = { object: "balance", available: 152340.5, currency: "ARS" };

export const TRANSFER_OUTBOUND_PENDING = {
  id: "8f4d2c1e-6b7a-4e39-9c05-2a1b3d4e5f60",
  object: "transfer",
  direction: "outbound",
  status: "pending",
  amount: 25000,
  fee: 0,
  net_amount: 25000,
  currency: "ARS",
  counterparty: {
    name: "Proveedora Ejemplo S. A.",
    tax_id: "30123456782",
    account: "0000123380736153041182",
    alias: "proveedor.ejemplo",
  },
  description: "Transferencia",
  reference: null,
  created_at: "2026-10-24T13:58:12Z",
};

export const TRANSFER_INBOUND = {
  id: "3b9e7a14-2c5d-4f86-a1b0-9d8c7e6f5a43",
  object: "transfer",
  direction: "inbound",
  status: "completed",
  amount: 48300,
  fee: 130.41,
  net_amount: 48169.59,
  currency: "ARS",
  counterparty: {
    name: "Juan Ejemplo",
    tax_id: "20123456785",
    account: "0000123319112992888845",
    alias: null,
  },
  description: "Alquiler octubre",
  reference: "K4P9W2X7M1Q8V3B6N5D0RT",
  created_at: "2026-10-24T14:05:41Z",
};

export const TRANSFER_OUTBOUND_COMPLETED = {
  ...TRANSFER_OUTBOUND_PENDING,
  status: "completed",
  reference: "R8T2N6V1X9K4M7Q3B5W0PZ",
};

export const NEXT_CURSOR =
  "MjAyNi0xMC0yNFQxMzo1ODoxMlp8OGY0ZDJjMWUtNmI3YS00ZTM5LTljMDUtMmExYjNkNGU1ZjYw";

export const TRANSFER_LIST = {
  object: "list",
  data: [TRANSFER_INBOUND, TRANSFER_OUTBOUND_COMPLETED],
  has_more: true,
  next_cursor: NEXT_CURSOR,
};

export function transferPage(ids: string[], nextCursor: string | null): Record<string, unknown> {
  return {
    object: "list",
    data: ids.map((id) => ({ ...TRANSFER_INBOUND, id })),
    has_more: nextCursor !== null,
    next_cursor: nextCursor,
  };
}

export const PAYMENT_ID = "c2a7e5d1-9b34-4f0a-8e62-71d5b3c9a0f8";

export const PAYMENT_PENDING = {
  id: PAYMENT_ID,
  object: "payment",
  status: "pending",
  amount: 15000,
  amount_received: null,
  currency: "ARS",
  description: "Pedido #1042",
  external_reference: "pedido-1042",
  bank_transfer: { cvu: "0000123322813466534007", alias: "raya.cash.ejemplo" },
  checkout_url: `https://raya.cash/payments/${PAYMENT_ID}`,
  return_url: "https://tienda.example.com/pedidos/1042",
  payer: null,
  failure_code: null,
  metadata: { cliente_id: "8812" },
  expires_at: "2026-10-25T14:00:00Z",
  paid_at: null,
  refunded_at: null,
  created_at: "2026-10-24T14:00:00Z",
};

export const PAYMENT_SUCCEEDED = {
  ...PAYMENT_PENDING,
  status: "succeeded",
  amount_received: 15000,
  payer: {
    name: "María Ejemplo",
    tax_id: "27123456781",
    account: "0000123300602983525937",
  },
  paid_at: "2026-10-24T14:12:09Z",
};

export const PAYMENT_REFUNDED = {
  ...PAYMENT_SUCCEEDED,
  status: "refunded",
  refunded_at: "2026-10-24T15:30:00Z",
};

export const EVENT_PAYMENT_SUCCEEDED = {
  id: "evt_4mQ8sT2vX7bN1kR5wZ9cH3jL",
  object: "event",
  type: "payment.succeeded",
  api_version: "2026-10-23",
  created_at: "2026-10-24T14:12:09Z",
  data: { object: PAYMENT_SUCCEEDED },
};

// Vectores fijos de la firma (raya-api webhooks/tests_crypto.py y api.md).
export const WEBHOOK_TEST_BODY = Buffer.from(
  '{"id":"evt_test","object":"event","type":"webhook.test"}',
);
export const WEBHOOK_TEST_TIMESTAMP = 1700000000;
export const WEBHOOK_SECRET = "whsec_test_5f2b8c1e";
export const WEBHOOK_SIGNATURE = "2d8099cd1fe615acd8a181903c2478d2526fc47c784558a9c4e512619c4e60d8";
export const WEBHOOK_OLD_SECRET = "whsec_old_0a9d";
export const WEBHOOK_OLD_SIGNATURE =
  "8e449e40286c1e331a636dd9e38ab4a548c3c9a09733fa05205d7a10623ecc45";
