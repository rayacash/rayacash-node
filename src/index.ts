// El SDK oficial de Node.js para la API de Raya Cash.
//
// Estilo cliente (el recomendado):
//
//   import { RayaClient } from "rayacash";
//
//   const client = new RayaClient(); // lee la clave secreta de RAYA_SECRET_KEY
//   const payment = await client.payments.create({ amount: 15000, description: "Pedido #1042" });
//
// Estilo global, con la configuración del módulo:
//
//   import { config, Payment } from "rayacash";
//
//   config.apiKey = process.env.RAYA_SECRET_KEY;
//   const payment = await Payment.create({ amount: 15000 });
//
// Raya Connect, apps y cuentas conectadas (cobrar a nombre de otra cuenta, con tu comisión):
//
//   const token = await client.oauth.token({ client_id, client_secret, code, redirect_uri });
//   const connected = new RayaClient(token.access_token);
//   const order = await connected.connect.orders.create({ items, fee: 500 });
//
// Identidad (verificar la identidad de tus clientes con su DNI y una prueba de vida):
//
//   const verification = await client.identity.verifications.create({ type: "document" });
//
// En un sandbox, con su clave secreta de prueba (raya_sk_test_…), simular la transferencia:
//
//   const paid = await client.testHelpers.payments.simulateTransfer(payment.id);
//
// Referencia de la API: https://raya.cash/api

export { Balance } from "./balance.ts";
export type { BalanceService } from "./balanceService.ts";
export type { RawRequestParams, RayaClientOptions } from "./client.ts";
export { RayaClient } from "./client.ts";
export type { GlobalConfig } from "./config.ts";
export { config, DEFAULT_API_BASE } from "./config.ts";
export type { ConnectOrderStatus } from "./connectOrder.ts";
export { ConnectOrder } from "./connectOrder.ts";
export type { ConnectPayoutStatus } from "./connectPayout.ts";
export { ConnectPayout } from "./connectPayout.ts";
export type {
  ConnectOrderBackUrlsParams,
  ConnectOrderCreateParams,
  ConnectOrderItemParams,
  ConnectOrderService,
  ConnectPayoutCreateParams,
  ConnectPayoutListParams,
  ConnectPayoutService,
  ConnectService,
} from "./connectService.ts";
// Los nombres de la 1.1.0, deprecados hasta la 2.0.0: ver deprecated.ts.
export type {
  CheckoutBackUrlsParams,
  CheckoutCreateParams,
  CheckoutItemParams,
  CheckoutOrdersService,
  CheckoutService,
  CheckoutStatus,
} from "./deprecated.ts";
export { Checkout } from "./deprecated.ts";
export type { Amount, DecimalLike } from "./encoding.ts";
export type { RayaErrorOptions } from "./errors.ts";
export {
  APIConnectionError,
  APIError,
  AuthenticationError,
  ConflictError,
  IdempotencyError,
  InvalidRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  RayaError,
  SignatureVerificationError,
  UnprocessableEntityError,
} from "./errors.ts";
export type { EventType } from "./event.ts";
export { Event } from "./event.ts";
export { setAppInfo } from "./global.ts";
export type {
  IdentityService,
  IdentityVerificationCreateParams,
  IdentityVerificationListParams,
  IdentityVerificationService,
} from "./identityService.ts";
export type {
  IdentityVerificationCheckStatus,
  IdentityVerificationDeclineCode,
  IdentityVerificationStatus,
  IdentityVerificationType,
} from "./identityVerification.ts";
export { IdentityVerification } from "./identityVerification.ts";
export { IdentityVerificationFiles } from "./identityVerificationFiles.ts";
export { ListObject } from "./listObject.ts";
export type { OAuthService, OAuthTokenOptions, OAuthTokenParams } from "./oauthService.ts";
export { OAuth, OAuthToken } from "./oauthToken.ts";
export type { PaymentStatus } from "./payment.ts";
export { Payment } from "./payment.ts";
export type { PaymentCreateParams, PaymentService } from "./paymentService.ts";
export { RayaObject } from "./rayaObject.ts";
export type {
  ConnectPayoutCreateOptions,
  PostRequestOptions,
  RequestOptions,
  TransferCreateOptions,
} from "./requestOptions.ts";
export type { Fetch } from "./requestor.ts";
export { RayaResponse } from "./response.ts";
// Solo como tipos, como los demás servicios: los exports de runtime no cambian.
export type {
  PaymentSimulateTransferParams,
  SandboxHelpersService,
  SandboxPaymentHelpersService,
} from "./sandboxHelpersService.ts";
export type { TransferDirection, TransferStatus } from "./transfer.ts";
export { Transfer } from "./transfer.ts";
export type {
  TransferCreateParams,
  TransferListParams,
  TransferService,
} from "./transferService.ts";
export type { UserIdentificationType, UserSex, UserType } from "./user.ts";
export { User } from "./user.ts";
export type { UserService } from "./userService.ts";
export type { AppInfo } from "./util.ts";
export { VERSION } from "./version.ts";
export type { Payload } from "./webhook.ts";
export { Webhook, WebhookSignature } from "./webhook.ts";
