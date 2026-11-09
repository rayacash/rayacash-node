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

// Apps y cuentas conectadas (api.md › Checkout y Usuarios): la app Tienda Ejemplo cobra a nombre
// del comercio conectado Almacén Ejemplo, con una comisión de 500 sobre un ítem de 45000.
export const CLIENT_ID = "7650337728110670";
export const CLIENT_SECRET = "raya_cs_live_Qx9Km2Pr4Tv6Wy8Za1Bc3De5Fg7Hj0KnLm2Np4Qr6St8Uv0W";
export const OAUTH_CODE = "c0d3ejemploQx9Km2Pr4Tv6Wy8Za1Bc3De5Fg7Hj0Kn";
export const REDIRECT_URI = "https://tienda.example.com/raya/callback";
export const USER_ID = "9d4f2b7e-3c61-4e0a-9b8f-2a5c7d1e6f40";
export const ACCESS_TOKEN = "raya_at_live_4mQ8sT2vX7bN1kR5wZ9cH3jLpD6fG0aEyU8iO2pA5sD7fG9h";

export const OAUTH_TOKEN = {
  object: "oauth_token",
  access_token: ACCESS_TOKEN,
  token_type: "Bearer",
  scope: "checkout profile",
  user_id: USER_ID,
  expires_in: null,
  refresh_token: null,
};

export const USER = {
  id: USER_ID,
  object: "user",
  type: "personal",
  email: "lucia@almacen.example.com",
  first_name: "Lucía",
  last_name: "Ejemplo",
  full_name: "Lucía Ejemplo",
  identification: { type: "DNI", number: "34567890" },
  tax_id: "27345678901",
  phone: "+5493415550123",
  date_of_birth: "1990-05-17",
  sex: "F",
  nationality: "Argentina",
  address: {
    street: "Calle Ejemplo",
    number: "1234",
    floor: "2",
    apartment: "B",
    city: "Rosario",
    province: "Santa Fe",
    postal_code: "2000",
    country: "Argentina",
  },
  identity_verified: true,
  verified_at: "2026-10-24T15:35:08Z",
  business: null,
  merchant: { name: "Almacén Ejemplo", image: null },
  created_at: "2026-10-24T15:30:12Z",
};

export const CHECKOUT_ID = "e7b3a9c2-4d1f-4a8e-b6c0-5f2d9e8a7b61";
export const NOTIFICATION_URL = "we_3fN8kQ2vX7mB1pR5tZ9cW4yD";
export const CHECKOUT_ITEMS = [{ title: "Pedido 1042", quantity: 1, unit_price: 45000 }];
export const CHECKOUT_BACK_URLS = {
  success: "https://tienda.example.com/pedidos/1042",
  failure: "https://tienda.example.com/pedidos/1042/error",
};

export const CHECKOUT_PENDING = {
  id: CHECKOUT_ID,
  object: "checkout",
  status: "pending",
  amount: 45000,
  fee: 500,
  net_amount: 44500,
  amount_received: null,
  currency: "ARS",
  items: CHECKOUT_ITEMS,
  description: "Pedido 1042",
  external_reference: "pedido-1042",
  account: USER_ID,
  bank_transfer: { cvu: "0000123390456538582824", alias: "raya.cash.ejemplo" },
  checkout_url: `https://raya.cash/checkout/${CHECKOUT_ID}`,
  back_urls: CHECKOUT_BACK_URLS,
  auto_return: "approved",
  notification_url: NOTIFICATION_URL,
  payer: null,
  failure_code: null,
  metadata: { pedido_id: "1042" },
  expires_at: "2026-10-25T16:00:00Z",
  paid_at: null,
  refunded_at: null,
  created_at: "2026-10-24T16:00:00Z",
};

export const CHECKOUT_SUCCEEDED = {
  ...CHECKOUT_PENDING,
  status: "succeeded",
  amount_received: 45000,
  payer: {
    name: "María Ejemplo",
    tax_id: "27123456781",
    account: "0000123300602983525937",
  },
  paid_at: "2026-10-24T16:07:41Z",
};

export const CHECKOUT_REFUNDED = {
  ...CHECKOUT_SUCCEEDED,
  status: "refunded",
  refunded_at: "2026-10-24T17:20:00Z",
};

export const EVENT_CHECKOUT_SUCCEEDED = {
  id: "evt_7kP2mW9xB4nT1rV6yZ3cQ8jH",
  object: "event",
  type: "checkout.succeeded",
  api_version: "2026-10-23",
  created_at: "2026-10-24T16:07:41Z",
  data: { object: CHECKOUT_SUCCEEDED },
};
