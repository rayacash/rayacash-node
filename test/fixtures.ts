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

// Raya Connect (api.md › Connect y Usuarios): la app Tienda Ejemplo cobra a nombre
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
  scope: "orders profile",
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

export const ORDER_ID = "e7b3a9c2-4d1f-4a8e-b6c0-5f2d9e8a7b61";
export const NOTIFICATION_URL = "we_3fN8kQ2vX7mB1pR5tZ9cW4yD";
export const ORDER_ITEMS = [{ title: "Pedido 1042", quantity: 1, unit_price: 45000 }];
export const ORDER_BACK_URLS = {
  success: "https://tienda.example.com/pedidos/1042",
  failure: "https://tienda.example.com/pedidos/1042/error",
};

export const ORDER_PENDING = {
  id: ORDER_ID,
  object: "connect.order",
  status: "pending",
  amount: 45000,
  fee: 500,
  net_amount: 44500,
  amount_received: null,
  currency: "ARS",
  items: ORDER_ITEMS,
  description: "Pedido 1042",
  external_reference: "pedido-1042",
  account: USER_ID,
  bank_transfer: { cvu: "0000123390456538582824", alias: "raya.cash.ejemplo" },
  checkout_url: `https://raya.cash/checkout/${ORDER_ID}`,
  back_urls: ORDER_BACK_URLS,
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

export const ORDER_SUCCEEDED = {
  ...ORDER_PENDING,
  status: "succeeded",
  amount_received: 45000,
  payer: {
    name: "María Ejemplo",
    tax_id: "27123456781",
    account: "0000123300602983525937",
  },
  paid_at: "2026-10-24T16:07:41Z",
};

export const ORDER_REFUNDED = {
  ...ORDER_SUCCEEDED,
  status: "refunded",
  refunded_at: "2026-10-24T17:20:00Z",
};

export const EVENT_ORDER_SUCCEEDED = {
  id: "evt_7kP2mW9xB4nT1rV6yZ3cQ8jH",
  object: "event",
  type: "connect.order.succeeded",
  api_version: "2026-10-23",
  created_at: "2026-10-24T16:07:41Z",
  data: { object: ORDER_SUCCEEDED },
};

// Los payouts de Raya Connect (api.md › Connect): Tienda Ejemplo le envía a una vendedora desde su
// saldo. La comisión no da un porcentaje redondo a propósito: no es un valor fijo del contrato.
export const PAYOUT_ID = "4f6a1d8b-2e37-4c95-8a10-7b3e9d2c5f14";
export const PAYOUT_DESTINATION = "0000123305838495183140";

export const PAYOUT_PENDING = {
  id: PAYOUT_ID,
  object: "connect.payout",
  status: "pending",
  amount: 60000,
  processing_fee: 870.25,
  net_amount: 59129.75,
  currency: "ARS",
  origin: {
    account: "0000123368198805021689",
    alias: "raya.cash.ejemplo",
    name: "Tienda Ejemplo",
  },
  counterparty: {
    name: "Ana Ejemplo",
    tax_id: "20345678902",
    account: PAYOUT_DESTINATION,
    alias: "ana.ejemplo",
  },
  reference: null,
  created_at: "2026-10-24T17:40:06Z",
};

export const PAYOUT_COMPLETED = {
  ...PAYOUT_PENDING,
  status: "completed",
  reference: "M7Q2X9T4K1V6N3B8R5W0ZD",
};

export const PAYOUT_LIST = {
  object: "list",
  data: [PAYOUT_COMPLETED],
  has_more: false,
  next_cursor: null,
};

export function payoutPage(ids: string[], nextCursor: string | null): Record<string, unknown> {
  return {
    object: "list",
    data: ids.map((id) => ({ ...PAYOUT_COMPLETED, id })),
    has_more: nextCursor !== null,
    next_cursor: nextCursor,
  };
}

// Identidad (api.md › Identidad, los mismos que la referencia raya.cash/api/identity), con datos
// sintéticos. Los montos son ilustrativos: nunca una tarifa real.
export const VERIFICATION_ID = "idv_3kT9vQ2mXw7Lp0aBcD4eF6gH";
export const BIOMETRIC_VERIFICATION_ID = "idv_8Zr2Nf6Kq1Yc5Wd9Ht3Jm7Pa";

export const VERIFICATION_PENDING = {
  id: VERIFICATION_ID,
  object: "identity.verification",
  type: "document",
  status: "pending",
  url: `https://raya.cash/identity/${VERIFICATION_ID}`,
  external_reference: "cliente-8812",
  metadata: { plan: "pro" },
  return_url: "https://tienda.example.com/cuenta",
  reference: null,
  decline_reason: null,
  checks: {
    document: { status: "pending" },
    liveness: { status: "pending", confidence: null },
    face_match: { status: "pending", similarity: null },
    registry: { status: "pending", data_match: null, face_match: null },
  },
  person: null,
  amount: null,
  currency: "ARS",
  created_at: "2026-10-24T18:00:00Z",
  started_at: null,
  submitted_at: null,
  completed_at: null,
  expires_at: "2026-10-25T18:00:00Z",
};

export const VERIFICATION_PERSON = {
  first_name: "María Laura",
  last_name: "Ejemplo",
  document_type: "DNI",
  document_number: "12345678",
  sex: "F",
  birth_date: "1990-01-31",
  nationality: "Argentina",
  cuil: "27123456781",
  address: {
    street: "Calle Ejemplo",
    number: "1234",
    floor: null,
    apartment: null,
    city: "Rosario",
    municipality: "Rosario",
    province: "Santa Fe",
    postal_code: "2000",
    country: "Argentina",
  },
  document: { copy: "A", issue_date: "2020-01-31", expiry_date: "2035-01-31" },
};

const VERIFICATION_STAMPS = {
  started_at: "2026-10-24T18:07:12Z",
  submitted_at: "2026-10-24T18:09:40Z",
  completed_at: "2026-10-24T18:09:58Z",
};

export const VERIFICATION_VERIFIED = {
  ...VERIFICATION_PENDING,
  status: "verified",
  checks: {
    document: { status: "passed" },
    liveness: { status: "passed", confidence: 99.1 },
    face_match: { status: "passed", similarity: 97.4 },
    registry: { status: "passed", data_match: true, face_match: "hit" },
  },
  person: VERIFICATION_PERSON,
  amount: 1000,
  ...VERIFICATION_STAMPS,
};

export const VERIFICATION_DECLINED = {
  ...VERIFICATION_PENDING,
  status: "declined",
  decline_reason: {
    code: "registry_data_mismatch",
    message:
      "Los datos del documento no coinciden con los del Registro Nacional de las Personas (RENAPER).",
  },
  checks: {
    document: { status: "passed" },
    liveness: { status: "passed", confidence: 99.1 },
    face_match: { status: "passed", similarity: 97.4 },
    registry: { status: "failed", data_match: false, face_match: null },
  },
  ...VERIFICATION_STAMPS,
};

export const VERIFICATION_CANCELED = {
  ...VERIFICATION_PENDING,
  status: "canceled",
  completed_at: "2026-10-24T18:30:00Z",
};

export const VERIFICATION_BIOMETRIC_VERIFIED = {
  ...VERIFICATION_VERIFIED,
  id: BIOMETRIC_VERIFICATION_ID,
  type: "biometric",
  url: `https://raya.cash/identity/${BIOMETRIC_VERIFICATION_ID}`,
  return_url: null,
  reference: VERIFICATION_ID,
  checks: {
    document: { status: "not_applicable" },
    liveness: { status: "passed", confidence: 99.1 },
    face_match: { status: "passed", similarity: 98.2 },
    registry: { status: "not_applicable", data_match: null, face_match: null },
  },
  amount: 400,
  created_at: "2026-10-24T20:00:00Z",
  started_at: "2026-10-24T20:02:10Z",
  submitted_at: "2026-10-24T20:03:05Z",
  completed_at: "2026-10-24T20:03:05Z",
  expires_at: "2026-10-25T20:00:00Z",
};

export const VERIFICATION_NEXT_CURSOR =
  "MjAyNi0xMC0yNFQxODowMDowMFp8aWR2XzNrVDl2UTJtWHc3THAwYUJjRDRlRjZnSA";

export const VERIFICATION_LIST = {
  object: "list",
  data: [VERIFICATION_BIOMETRIC_VERIFIED, VERIFICATION_VERIFIED],
  has_more: true,
  next_cursor: VERIFICATION_NEXT_CURSOR,
};

export function verificationPage(
  ids: string[],
  nextCursor: string | null,
): Record<string, unknown> {
  return {
    object: "list",
    data: ids.map((id) => ({ ...VERIFICATION_VERIFIED, id })),
    has_more: nextCursor !== null,
    next_cursor: nextCursor,
  };
}

function verificationFile(name: string): { url: string; expires_at: string } {
  return {
    url: `https://files.example.com/${VERIFICATION_ID}/${name}.jpg?signature=ejemplo`,
    expires_at: "2026-10-24T18:25:00Z",
  };
}

export const VERIFICATION_FILES = {
  object: "identity.verification_files",
  front: verificationFile("front"),
  back: verificationFile("back"),
  selfie: verificationFile("selfie"),
};

// Los eventos traen la verificación siempre con person en null, y livemode en true, como todo evento
// de una cuenta real.
export const EVENT_VERIFICATION_VERIFIED = {
  id: "evt_7cW2pL9xT4bN6kR1mZ8vH3jQ",
  object: "event",
  type: "identity.verification.verified",
  api_version: "2026-10-23",
  created_at: "2026-10-24T18:09:58Z",
  livemode: true,
  data: { object: { ...VERIFICATION_VERIFIED, person: null } },
};

export const EVENT_VERIFICATION_CANCELED = {
  id: "evt_2nK8fR5yW3cV7qL1pX9dG4sM",
  object: "event",
  type: "identity.verification.canceled",
  api_version: "2026-10-23",
  created_at: "2026-10-24T18:30:00Z",
  livemode: true,
  data: { object: VERIFICATION_CANCELED },
};

// Un sandbox (api.md › Sandbox): sus credenciales de prueba, un pago de prueba (el CVU de prueba,
// que empieza con 00000002 y no existe, el alias sandbox.no.transferir y la página /sandbox/pay),
// el pagador fijo que deja la transferencia simulada y una orden de Raya Connect de un usuario de
// prueba. Sintéticos, como los demás.
export const SANDBOX_SECRET_KEY = "raya_sk_test_0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL";
// El access_token de un usuario de prueba: oauth.token con el client_secret de prueba de la app.
export const SANDBOX_ACCESS_TOKEN = "raya_at_test_ZYXWVUTSRQPONMLKJIHGFEDCBAzyxwvutsrqponmlkjihgfe";
export const SANDBOX_PAYMENT_ID = "3bcae2bd-d5ae-4a6d-bb21-aef5e2693d16";
export const SANDBOX_ORDER_ID = "9118c0e4-a481-46ea-a241-3751453bd96a";
export const SANDBOX_TEST_USER_ID = "f5fef29c-d807-4f8d-8b74-8922f88efd9a";
export const SANDBOX_PAYER = {
  name: "Pagador de prueba",
  tax_id: "20000000001",
  account: "0000000200000000000001",
};

export const SANDBOX_PAYMENT_PENDING = {
  id: SANDBOX_PAYMENT_ID,
  object: "payment",
  status: "pending",
  amount: 15000,
  amount_received: null,
  currency: "ARS",
  description: "Pedido #1042",
  external_reference: "pedido-1042",
  bank_transfer: { cvu: "0000000271946305829174", alias: "sandbox.no.transferir" },
  checkout_url: `https://raya.cash/sandbox/pay/${SANDBOX_PAYMENT_ID}`,
  return_url: null,
  payer: null,
  failure_code: null,
  metadata: {},
  expires_at: "2026-11-12T14:00:00Z",
  paid_at: null,
  refunded_at: null,
  created_at: "2026-11-11T14:00:00Z",
};

export const SANDBOX_PAYMENT_SUCCEEDED = {
  ...SANDBOX_PAYMENT_PENDING,
  status: "succeeded",
  amount_received: 15000,
  payer: SANDBOX_PAYER,
  paid_at: "2026-11-11T14:05:12Z",
};

// Simulado con un amount menor: failed, sin el reembolso automático de una cuenta real.
export const SANDBOX_PAYMENT_FAILED = {
  ...SANDBOX_PAYMENT_PENDING,
  status: "failed",
  amount_received: 1000,
  payer: SANDBOX_PAYER,
  failure_code: "amount_mismatch",
};

export const SANDBOX_ORDER_SUCCEEDED = {
  id: SANDBOX_ORDER_ID,
  object: "connect.order",
  status: "succeeded",
  amount: 1500,
  fee: 10,
  net_amount: 1490,
  amount_received: 1500,
  currency: "ARS",
  items: [{ title: "Pedido 7", quantity: 1, unit_price: 1500 }],
  description: "Pedido 7",
  external_reference: null,
  account: SANDBOX_TEST_USER_ID,
  bank_transfer: { cvu: "0000000250812748792077", alias: "sandbox.no.transferir" },
  checkout_url: `https://raya.cash/checkout/${SANDBOX_ORDER_ID}`,
  back_urls: { success: null, failure: null },
  auto_return: null,
  notification_url: null,
  payer: SANDBOX_PAYER,
  failure_code: null,
  metadata: {},
  expires_at: "2026-11-12T14:10:00Z",
  paid_at: "2026-11-11T14:12:40Z",
  refunded_at: null,
  created_at: "2026-11-11T14:10:00Z",
};

// Un evento de un sandbox: livemode en false, entre created_at y data, como lo arma la API.
export const EVENT_SANDBOX_PAYMENT_SUCCEEDED = {
  id: "evt_9tR3kW7nB2xL5qV8mZ1cH6jP",
  object: "event",
  type: "payment.succeeded",
  api_version: "2026-10-23",
  created_at: "2026-11-11T14:05:12Z",
  livemode: false,
  data: { object: SANDBOX_PAYMENT_SUCCEEDED },
};
