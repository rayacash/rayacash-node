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
  type ConnectPayout,
  type ConnectPayoutCreateOptions,
  type ConnectPayoutCreateParams,
  type ConnectPayoutListParams,
  type ConnectPayoutService,
  type ConnectPayoutStatus,
  type ConnectService,
  config,
  type Event,
  type EventType,
  Balance as GlobalBalance,
  Checkout as GlobalCheckout,
  ConnectOrder as GlobalConnectOrder,
  ConnectPayout as GlobalConnectPayout,
  IdentityVerification as GlobalIdentityVerification,
  Invoice as GlobalInvoice,
  OAuth as GlobalOAuth,
  Payment as GlobalPayment,
  PspBalance as GlobalPspBalance,
  PspCustomer as GlobalPspCustomer,
  PspDocumentRequest as GlobalPspDocumentRequest,
  PspTransfer as GlobalPspTransfer,
  Transfer as GlobalTransfer,
  User as GlobalUser,
  type IdentityService,
  type IdentityVerification,
  type IdentityVerificationCheckStatus,
  type IdentityVerificationCreateParams,
  type IdentityVerificationDeclineCode,
  type IdentityVerificationFiles,
  type IdentityVerificationListParams,
  type IdentityVerificationService,
  type IdentityVerificationStatus,
  type IdentityVerificationType,
  type InvalidRequestError,
  type Invoice,
  type InvoiceConcept,
  type InvoiceCreateOptions,
  type InvoiceCreateParams,
  type InvoiceFailureCode,
  type InvoiceListParams,
  type InvoiceService,
  type InvoiceStatus,
  type InvoiceType,
  type ListObject,
  type OAuthToken,
  type OAuthTokenOptions,
  type Payment,
  type PaymentSimulateTransferParams,
  type PspBalance,
  type PspBalanceService,
  type PspCustomer,
  type PspCustomerBalance,
  type PspCustomerBlockedBy,
  type PspCustomerCreateCompanyParams,
  type PspCustomerCreateParams,
  type PspCustomerCreateWithPhotosParams,
  type PspCustomerCreateWithVerificationParams,
  type PspCustomerDeclineCode,
  type PspCustomerListParams,
  type PspCustomerPersonType,
  type PspCustomerService,
  type PspCustomerStatus,
  type PspCvuStatus,
  type PspDocumentRequest,
  type PspDocumentRequestStatus,
  type PspService,
  type PspTransfer,
  type PspTransferCreateOptions,
  type PspTransferCreateParams,
  type PspTransferDirection,
  type PspTransferListParams,
  type PspTransferService,
  type PspTransferStatus,
  type RayaClient,
  type RayaError,
  type RayaObject,
  type RayaResponse,
  type SandboxHelpersService,
  type SandboxPaymentHelpersService,
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

  // Los payouts de Raya Connect: salen de tu saldo, con tu clave secreta.
  check(client.connect.payouts).is<ConnectPayoutService>();
  const payoutParams: ConnectPayoutCreateParams = {
    amount: "60000.50",
    destination: "ana.ejemplo",
  };
  const payoutOptions: ConnectPayoutCreateOptions = { idempotencyKey: "k", timeout: 5_000 };
  const payout = await client.connect.payouts.create(payoutParams, payoutOptions);
  check(payout).is<ConnectPayout>();
  check(payout.object).is<"connect.payout">();
  check(payout.status).is<ConnectPayoutStatus>();
  check(payout.status).is<"pending" | "completed" | "failed" | "reversed">();
  check(payout.amount).is<number>();
  check(payout.processing_fee).is<number>();
  check(payout.net_amount).is<number>();
  check(payout.currency).is<string>();
  check(payout.origin).is<ConnectPayout.Origin>();
  check(payout.origin.account).is<string>();
  check(payout.origin.alias).is<string | null>();
  check(payout.origin.name).is<string>();
  check(payout.counterparty).is<ConnectPayout.Counterparty>();
  check(payout.counterparty.name).is<string | null>();
  check(payout.counterparty.tax_id).is<string | null>();
  check(payout.counterparty.account).is<string | null>();
  check(payout.counterparty.alias).is<string | null>();
  check(payout.reference).is<string | null>();
  check(payout.created_at).is<string>();
  check(await client.connect.payouts.retrieve("id")).is<ConnectPayout>();
  const payoutFilters: ConnectPayoutListParams = {
    status: "completed",
    created_gte: new Date(),
    created_lt: "2026-11-01T00:00:00-03:00",
    limit: 100,
    cursor: "c1",
  };
  const payouts = await client.connect.payouts.list(payoutFilters);
  check(payouts).is<ListObject<ConnectPayout>>();
  for (const item of payouts) check(item).is<ConnectPayout>();
  for await (const item of payouts.autoPagingIter()) check(item).is<ConnectPayout>();
  check(await payouts.nextPage()).is<ListObject<ConnectPayout>>();

  // Identidad: con tu clave secreta.
  check(client.identity).is<IdentityService>();
  check(client.identity.verifications).is<IdentityVerificationService>();
  const verificationParams: IdentityVerificationCreateParams = {
    type: "document",
    external_reference: "cliente-8812",
    metadata: { plan: "pro" },
    return_url: "https://tienda.example.com/cuenta",
    expires_in: 86400,
  };
  const verification = await client.identity.verifications.create(verificationParams, {
    idempotencyKey: "k",
    timeout: 5_000,
  });
  check(verification).is<IdentityVerification>();
  check(verification.lastResponse).is<RayaResponse | null>();
  check(verification.id).is<string>();
  check(verification.object).is<"identity.verification">();
  check(verification.type).is<IdentityVerificationType>();
  check(verification.type).is<"document" | "biometric">();
  check(verification.status).is<IdentityVerificationStatus>();
  check(verification.status).is<
    "pending" | "in_progress" | "processing" | "verified" | "declined" | "expired" | "canceled"
  >();
  check(verification.url).is<string>();
  check(verification.external_reference).is<string | null>();
  check(verification.metadata).is<Record<string, string>>();
  check(verification.return_url).is<string | null>();
  check(verification.reference).is<string | null>();
  check(verification.decline_reason).is<IdentityVerification.DeclineReason | null>();
  check(verification.decline_reason?.code).is<IdentityVerificationDeclineCode>();
  check(verification.decline_reason?.code).is<
    | "face_mismatch"
    | "registry_not_found"
    | "registry_data_mismatch"
    | "registry_unavailable"
    | "attempts_exhausted"
  >();
  check(verification.checks).is<IdentityVerification.Checks>();
  check(verification.checks.document).is<IdentityVerification.DocumentCheck>();
  check(verification.checks.liveness).is<IdentityVerification.LivenessCheck>();
  check(verification.checks.face_match).is<IdentityVerification.FaceMatchCheck>();
  check(verification.checks.registry).is<IdentityVerification.RegistryCheck>();
  check(verification.checks.registry.status).is<IdentityVerificationCheckStatus>();
  check(verification.checks.registry.status).is<
    "passed" | "failed" | "pending" | "unavailable" | "not_applicable"
  >();
  check(verification.checks.registry.data_match).is<boolean | null>();
  check(verification.checks.registry.face_match).is<"hit" | "accepted" | "failed" | null>();
  check(verification.checks.liveness.confidence).is<number | null>();
  check(verification.checks.face_match.similarity).is<number | null>();
  check(verification.person).is<IdentityVerification.Person | null>();
  check(verification.person?.address).is<IdentityVerification.Address>();
  check(verification.person?.document).is<IdentityVerification.IdentityDocument>();
  check(verification.person?.address.city).is<string | null>();
  check(verification.person?.cuil).is<string | null>();
  check(verification.amount).is<number | null>();
  check(verification.currency).is<"ARS">();
  check(verification.created_at).is<string>();
  check(verification.completed_at).is<string | null>();
  check(verification.expires_at).is<string>();
  check(await client.identity.verifications.retrieve("idv_x")).is<IdentityVerification>();
  check(
    await client.identity.verifications.create({ type: "biometric", reference: "idv_x" }),
  ).is<IdentityVerification>();
  const verificationFilters: IdentityVerificationListParams = {
    status: "verified",
    type: "document",
    external_reference: "cliente-8812",
    created_gte: new Date(),
    created_lt: "2026-11-11T00:00:00-03:00",
    limit: 100,
    cursor: "c1",
  };
  const verifications = await client.identity.verifications.list(verificationFilters);
  check(verifications).is<ListObject<IdentityVerification>>();
  check(verifications.data).is<IdentityVerification[]>();
  for (const item of verifications) check(item).is<IdentityVerification>();
  for await (const item of verifications.autoPagingIter()) check(item).is<IdentityVerification>();
  check(await verifications.nextPage()).is<ListObject<IdentityVerification>>();
  check(await client.identity.verifications.list()).is<ListObject<IdentityVerification>>();
  check(
    await client.identity.verifications.cancel("idv_x", { idempotencyKey: "c" }),
  ).is<IdentityVerification>();
  check(await verification.cancel()).is<IdentityVerification>();
  check(await verification.cancel({ idempotencyKey: "c" })).is<IdentityVerification>();
  const files = await client.identity.verifications.files("idv_x");
  check(files).is<IdentityVerificationFiles>();
  check(files.object).is<"identity.verification_files">();
  check(files.front).is<IdentityVerificationFiles.File | null>();
  check(files.back).is<IdentityVerificationFiles.File | null>();
  check(files.selfie).is<IdentityVerificationFiles.File | null>();
  check(files.selfie?.url).is<string>();
  check(files.selfie?.expires_at).is<string>();

  // Raya PSP: con tu clave secreta.
  check(client.psp).is<PspService>();
  check(client.psp.customers).is<PspCustomerService>();
  check(client.psp.transfers).is<PspTransferService>();
  check(client.psp.balance).is<PspBalanceService>();
  // Tres formas: con Raya Identity (solo identity_verification), una persona humana con las fotos
  // o una persona jurídica. Lo que no va en una forma es `?: null`.
  check<PspCustomerCreateParams>().is<
    | PspCustomerCreateWithVerificationParams
    | PspCustomerCreateWithPhotosParams
    | PspCustomerCreateCompanyParams
  >();
  check<PspCustomerCreateWithVerificationParams["identity_verification"]>().is<string>();
  check<PspCustomerCreateWithVerificationParams["tax_id"]>().is<null | undefined>();
  check<PspCustomerCreateWithVerificationParams["name"]>().is<null | undefined>();
  check<PspCustomerCreateWithVerificationParams["person_type"]>().is<null | undefined>();
  check<PspCustomerCreateWithVerificationParams["document_front_url"]>().is<null | undefined>();
  check<PspCustomerCreateWithVerificationParams["selfie_url"]>().is<null | undefined>();
  check<PspCustomerCreateWithVerificationParams["external_reference"]>().is<
    string | null | undefined
  >();
  check<PspCustomerCreateWithPhotosParams["identity_verification"]>().is<null | undefined>();
  check<PspCustomerCreateWithPhotosParams["tax_id"]>().is<string>();
  check<PspCustomerCreateWithPhotosParams["name"]>().is<string>();
  check<PspCustomerCreateWithPhotosParams["person_type"]>().is<"F">();
  check<PspCustomerCreateWithPhotosParams["document_front_url"]>().is<string>();
  check<PspCustomerCreateWithPhotosParams["document_back_url"]>().is<string>();
  check<PspCustomerCreateWithPhotosParams["selfie_url"]>().is<string>();
  check<PspCustomerCreateCompanyParams["identity_verification"]>().is<null | undefined>();
  check<PspCustomerCreateCompanyParams["person_type"]>().is<"J">();
  check<PspCustomerCreateCompanyParams["document_back_url"]>().is<null | undefined>();
  check<PspCustomerCreateCompanyParams["metadata"]>().is<
    Record<string, string> | null | undefined
  >();
  const customerParams: PspCustomerCreateParams = {
    identity_verification: "idv_x",
    external_reference: "cliente-8812",
    metadata: { plan: "pro" },
  };
  const customer = await client.psp.customers.create(customerParams, { idempotencyKey: "k" });
  check(
    await client.psp.customers.create({ identity_verification: verification.id }),
  ).is<PspCustomer>();
  check(customer).is<PspCustomer>();
  check(customer.lastResponse).is<RayaResponse | null>();
  check(customer.id).is<string>();
  check(customer.object).is<"psp.customer">();
  check(customer.status).is<PspCustomerStatus>();
  check(customer.status).is<
    "verifying" | "pending" | "active" | "blocked" | "closed" | "failed" | "rejected"
  >();
  check(customer.person_type).is<PspCustomerPersonType>();
  check(customer.person_type).is<"F" | "J">();
  check(customer.tax_id).is<string>();
  check(customer.name).is<string>();
  check(customer.balance).is<number>();
  check(customer.currency).is<"ARS">();
  check(customer.cvu).is<PspCustomer.Cvu | null>();
  check(customer.cvu?.account).is<string>();
  check(customer.cvu?.alias).is<string | null>();
  check(customer.cvu?.status).is<PspCvuStatus>();
  check<PspCvuStatus>().is<"active" | "closing" | "closed">();
  check(customer.blocked_by).is<PspCustomerBlockedBy | null>();
  check<PspCustomerBlockedBy>().is<"account" | "raya">();
  check(customer.identity_verification).is<string | null>();
  check(customer.decline_reason).is<PspCustomer.DeclineReason | null>();
  check(customer.decline_reason?.code).is<PspCustomerDeclineCode>();
  // Los 13 códigos de pspexternal/serializers.py (sin gender_mismatch: el sexo sale del DNI).
  check<PspCustomerDeclineCode>().is<
    | "image_unavailable"
    | "image_invalid"
    | "document_unreadable"
    | "document_sides_mismatch"
    | "document_mismatch"
    | "identity_not_verified"
    | "name_mismatch"
    | "selfie_invalid"
    | "face_mismatch"
    | "verification_unavailable"
    | "not_approved"
    | "bank_rejected"
    | "psp_disabled"
  >();
  check(customer.external_reference).is<string | null>();
  check(customer.metadata).is<Record<string, string>>();
  check(customer.created_at).is<string>();
  check(
    await client.psp.customers.create({
      tax_id: "27123456781",
      name: "María Laura Ejemplo",
      person_type: "F",
      document_front_url: "https://archivos.example.com/frente.jpg",
      document_back_url: "https://archivos.example.com/dorso.jpg",
      selfie_url: "https://archivos.example.com/selfie.jpg",
      external_reference: "cliente-8812",
    }),
  ).is<PspCustomer>();
  check(
    await client.psp.customers.create({
      tax_id: "30712345672",
      name: "Distribuidora Ejemplo S. A.",
      person_type: "J",
      identity_verification: null,
      selfie_url: undefined,
    }),
  ).is<PspCustomer>();
  check(await client.psp.customers.retrieve("pspc_x")).is<PspCustomer>();
  const customerFilters: PspCustomerListParams = {
    status: "blocked",
    external_reference: "cliente-8812",
    created_gte: new Date(),
    created_lt: "2026-11-01T00:00:00-03:00",
    limit: 100,
    cursor: "c1",
  };
  const customers = await client.psp.customers.list(customerFilters);
  check(customers).is<ListObject<PspCustomer>>();
  for (const item of customers) check(item).is<PspCustomer>();
  for await (const item of customers.autoPagingIter()) check(item).is<PspCustomer>();
  check(await customers.nextPage()).is<ListObject<PspCustomer>>();
  check(await client.psp.customers.list()).is<ListObject<PspCustomer>>();
  const customerBalance = await client.psp.customers.retrieveBalance("pspc_x");
  check(customerBalance).is<PspCustomerBalance>();
  check(customerBalance.object).is<"psp.customer_balance">();
  check(customerBalance.customer).is<string>();
  check(customerBalance.available).is<number>();
  check(customerBalance.transferable).is<number>();
  check(await client.psp.customers.block("pspc_x")).is<PspCustomer>();
  check(await client.psp.customers.unblock("pspc_x", { idempotencyKey: "u" })).is<PspCustomer>();
  check(await client.psp.customers.close("pspc_x")).is<PspCustomer>();
  check(await client.psp.customers.recreate("pspc_x")).is<PspCustomer>();
  check(await customer.block()).is<PspCustomer>();
  check(await customer.unblock({ idempotencyKey: "u" })).is<PspCustomer>();
  check(await customer.close()).is<PspCustomer>();
  check(await customer.recreate()).is<PspCustomer>();
  const pspTransferParams: PspTransferCreateParams = {
    customer: customer.id,
    amount: "18350.50",
    destination: "proveedor.ejemplo",
  };
  const pspTransferOptions: PspTransferCreateOptions = { idempotencyKey: "k", timeout: 5_000 };
  const pspTransfer = await client.psp.transfers.create(pspTransferParams, pspTransferOptions);
  check(pspTransfer).is<PspTransfer>();
  check(pspTransfer.object).is<"psp.transfer">();
  check(pspTransfer.customer).is<string>();
  check(pspTransfer.direction).is<PspTransferDirection>();
  check(pspTransfer.direction).is<"inbound" | "outbound">();
  check(pspTransfer.status).is<PspTransferStatus>();
  check(pspTransfer.status).is<"pending" | "completed" | "failed" | "reversed">();
  check(pspTransfer.amount).is<number>();
  check(pspTransfer.fee).is<number>();
  check(pspTransfer.net_amount).is<number>();
  check(pspTransfer.currency).is<"ARS">();
  check(pspTransfer.account).is<string>();
  check(pspTransfer.counterparty).is<PspTransfer.Counterparty>();
  check(pspTransfer.counterparty.tax_id).is<string | null>();
  check(pspTransfer.description).is<string | null>();
  check(pspTransfer.reference).is<string | null>();
  check(await client.psp.transfers.retrieve("pspt_x")).is<PspTransfer>();
  const pspTransferFilters: PspTransferListParams = {
    customer: "pspc_x",
    direction: "inbound",
    status: "completed",
    created_gte: new Date(),
    created_lt: "2026-11-01T00:00:00-03:00",
    limit: 100,
    cursor: "c1",
  };
  const pspTransfers = await client.psp.transfers.list(pspTransferFilters);
  check(pspTransfers).is<ListObject<PspTransfer>>();
  for await (const item of pspTransfers.autoPagingIter()) check(item).is<PspTransfer>();
  const pspBalance = await client.psp.balance.retrieve({ timeout: 5_000 });
  check(pspBalance).is<PspBalance>();
  check(pspBalance.object).is<"psp.balance">();
  check(pspBalance.available).is<number>();
  check(pspBalance.customers_balance).is<number>();
  check<PspDocumentRequest["status"]>().is<PspDocumentRequestStatus>();
  check<PspDocumentRequestStatus>().is<"open" | "submitted" | "closed">();
  check<PspDocumentRequest["submitted_at"]>().is<string | null>();

  // Facturador: con tu clave secreta, solo en tu cuenta real.
  check(client.invoices).is<InvoiceService>();
  check<InvoiceCreateParams["dni"]>().is<string>();
  check<InvoiceCreateParams["metadata"]>().is<Record<string, string> | null | undefined>();
  check<InvoiceCreateOptions["idempotencyKey"]>().is<string>();
  const invoiceParams: InvoiceCreateParams = {
    dni: "12345678",
    amount: "15000.50",
    metadata: { pedido_id: "1042" },
  };
  const invoiceOptions: InvoiceCreateOptions = { idempotencyKey: "k", timeout: 5_000 };
  const invoice = await client.invoices.create(invoiceParams, invoiceOptions);
  check(invoice).is<Invoice>();
  check(invoice.lastResponse).is<RayaResponse | null>();
  check(invoice.id).is<string>();
  check(invoice.object).is<"invoice">();
  check(invoice.type).is<InvoiceType>();
  check<InvoiceType>().is<"B" | "C">();
  check(invoice.status).is<InvoiceStatus>();
  check<InvoiceStatus>().is<"pending" | "issued" | "rejected" | "failed">();
  check(invoice.amount).is<number>();
  check(invoice.net_amount).is<number>();
  check(invoice.vat_amount).is<number | null>();
  check(invoice.currency).is<"ARS">();
  check(invoice.dni).is<string>();
  check(invoice.point_of_sale).is<number>();
  check(invoice.number).is<number | null>();
  check(invoice.concept).is<InvoiceConcept>();
  check<InvoiceConcept>().is<"products" | "services" | "products_and_services">();
  check(invoice.cae).is<string | null>();
  check(invoice.cae_expires_on).is<string | null>();
  check(invoice.issued_on).is<string | null>();
  check(invoice.failure_reason).is<Invoice.FailureReason | null>();
  check(invoice.failure_reason?.code).is<InvoiceFailureCode>();
  check(invoice.failure_reason?.message).is<string>();
  check<InvoiceFailureCode>().is<
    | "arca_rejected"
    | "facturador_not_ready"
    | "not_issued"
    | "numbering_conflict"
    | "account_unavailable"
  >();
  check(invoice.arca_messages).is<Invoice.ArcaMessage[]>();
  check<Invoice.ArcaMessage["type"]>().is<"error" | "observation">();
  check<Invoice.ArcaMessage["code"]>().is<number>();
  check<Invoice.ArcaMessage["message"]>().is<string>();
  check(invoice.metadata).is<Record<string, string>>();
  check(invoice.issued_at).is<string | null>();
  check(invoice.created_at).is<string>();
  check(
    await client.invoices.create({ dni: "12345678", amount: 15000 }, { idempotencyKey: "k" }),
  ).is<Invoice>();
  check(
    await client.invoices.create(
      { dni: "12345678", amount: 15000n, metadata: null },
      { idempotencyKey: "k", maxNetworkRetries: 0 },
    ),
  ).is<Invoice>();
  check(await client.invoices.retrieve("inv_x")).is<Invoice>();
  check(await client.invoices.retrieve("inv_x", { timeout: 5_000 })).is<Invoice>();
  const invoiceFilters: InvoiceListParams = {
    status: "issued",
    created_gte: new Date(),
    created_lt: "2026-12-01T00:00:00-03:00",
    limit: 100,
    cursor: "c1",
  };
  const invoices = await client.invoices.list(invoiceFilters);
  check(invoices).is<ListObject<Invoice>>();
  for (const item of invoices) check(item).is<Invoice>();
  for await (const item of invoices.autoPagingIter()) check(item).is<Invoice>();
  check(await invoices.nextPage()).is<ListObject<Invoice>>();
  check(await client.invoices.list()).is<ListObject<Invoice>>();

  // Sandbox: con la clave secreta de prueba.
  check(client.testHelpers).is<SandboxHelpersService>();
  check(client.testHelpers.payments).is<SandboxPaymentHelpersService>();
  const simulated = await client.testHelpers.payments.simulateTransfer("id");
  check(simulated).is<Payment | ConnectOrder>();
  check(simulated.status).is<"pending" | "succeeded" | "failed" | "expired" | "refunded">();
  check(simulated.failure_code).is<"amount_mismatch" | null>();
  if (simulated instanceof GlobalConnectOrder) check(simulated).is<ConnectOrder>();
  const simulateParams: PaymentSimulateTransferParams = { amount: "1500.50" };
  check(
    await client.testHelpers.payments.simulateTransfer("id", simulateParams, { timeout: 5_000 }),
  ).is<Payment | ConnectOrder>();
  check(await client.testHelpers.payments.simulateTransfer("id", null)).is<
    Payment | ConnectOrder
  >();
  check(await client.testHelpers.payments.simulateTransfer("id", { amount: null })).is<
    Payment | ConnectOrder
  >();

  const event = client.constructEvent(Buffer.from("{}"), "t=1,v1=x", "whsec_x");
  check(event).is<Event>();
  // Puede faltar: un evento emitido antes de que la API lo sumara, si se reenvía.
  check<typeof event.livemode>().is<boolean | undefined>();
  check<Event["livemode"]>().is<boolean | undefined>();
  check(event.data.object).is<
    | Transfer
    | Payment
    | ConnectOrder
    | IdentityVerification
    | Invoice
    | PspCustomer
    | PspTransfer
    | PspDocumentRequest
    | RayaObject
  >();
  check<Extract<EventType, `identity.${string}`>>().is<
    | "identity.verification.verified"
    | "identity.verification.declined"
    | "identity.verification.expired"
    | "identity.verification.canceled"
  >();
  check<Extract<EventType, `psp.${string}`>>().is<
    | "psp.customer.activated"
    | "psp.customer.updated"
    | "psp.customer.failed"
    | "psp.customer.rejected"
    | "psp.customer.blocked"
    | "psp.customer.unblocked"
    | "psp.customer.closed"
    | "psp.transfer.received"
    | "psp.transfer.sent"
    | "psp.transfer.failed"
    | "psp.document_request.created"
    | "psp.document_request.closed"
  >();
  check<Extract<EventType, `invoice.${string}`>>().is<
    "invoice.issued" | "invoice.rejected" | "invoice.failed"
  >();
  const object = event.data.object;
  if (object instanceof GlobalIdentityVerification) check(object).is<IdentityVerification>();
  if (object instanceof GlobalInvoice) check(object).is<Invoice>();
  if (object instanceof GlobalPspCustomer) check(object).is<PspCustomer>();
  if (object instanceof GlobalPspTransfer) check(object).is<PspTransfer>();
  if (object instanceof GlobalPspDocumentRequest) check(object).is<PspDocumentRequest>();

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
  // @ts-expect-error: la idempotencyKey es obligatoria en connect.payouts.create.
  await client.connect.payouts.create({ amount: 1, destination: "x" });
  // @ts-expect-error: va en las opciones, no en los parámetros.
  await client.connect.payouts.create({ amount: 1, destination: "x", idempotencyKey: "k" }, key);
  await client.connect.payouts.create(
    // @ts-expect-error: el body es amount y destination, nada más.
    { amount: 1, destination: "x", external_reference: "l" },
    key,
  );
  // @ts-expect-error: destination es un string, para que un CBU no pierda los ceros de adelante.
  await client.connect.payouts.create({ amount: 1, destination: 123 }, key);
  // @ts-expect-error: los payouts no tienen direction.
  await client.connect.payouts.list({ direction: "outbound" });
  // @ts-expect-error: los GET no llevan idempotencyKey.
  await client.connect.payouts.retrieve("id", { idempotencyKey: "k" });
  // @ts-expect-error: los GET no llevan idempotencyKey.
  await client.identity.verifications.retrieve("idv_x", { idempotencyKey: "k" });
  // @ts-expect-error: los GET no llevan idempotencyKey.
  await client.identity.verifications.files("idv_x", { idempotencyKey: "k" });
  // @ts-expect-error: type es obligatorio.
  await client.identity.verifications.create({});
  // @ts-expect-error: selfie no es un tipo de verificación.
  await client.identity.verifications.create({ type: "selfie" });
  // @ts-expect-error: va en las opciones, no en los parámetros.
  await client.identity.verifications.create({ type: "document", idempotencyKey: "k" });
  // @ts-expect-error: metadata es de string a string.
  await client.identity.verifications.create({ type: "document", metadata: { plan: 1 } });
  // @ts-expect-error: open no es un estado de la lista pública.
  await client.identity.verifications.list({ status: "open" });
  // @ts-expect-error: limit es un número.
  await client.identity.verifications.list({ limit: "10" });
  // @ts-expect-error: las verificaciones no tienen direction.
  await client.identity.verifications.list({ direction: "inbound" });
  // @ts-expect-error: el helper del sandbox no lleva Idempotency-Key.
  await client.testHelpers.payments.simulateTransfer("id", {}, { idempotencyKey: "k" });
  // @ts-expect-error: el único parámetro es amount.
  await client.testHelpers.payments.simulateTransfer("id", { status: "succeeded" });
  // @ts-expect-error: amount no acepta booleans.
  await client.testHelpers.payments.simulateTransfer("id", { amount: true });
  // @ts-expect-error: el id es un string.
  await client.testHelpers.payments.simulateTransfer(1234);
  // Las tres formas válidas: cada error de abajo parte de una y rompe solo lo que dice.
  const withVerification = { identity_verification: "idv_x" } as const;
  const withPhotos = {
    tax_id: "27123456781",
    name: "María Laura Ejemplo",
    person_type: "F",
    document_front_url: "https://archivos.example.com/frente.jpg",
    document_back_url: "https://archivos.example.com/dorso.jpg",
    selfie_url: "https://archivos.example.com/selfie.jpg",
  } as const;
  const company = {
    tax_id: "30712345672",
    name: "Distribuidora Ejemplo S. A.",
    person_type: "J",
  } as const;
  check(await client.psp.customers.create(withVerification)).is<PspCustomer>();
  check(await client.psp.customers.create(withPhotos)).is<PspCustomer>();
  check(await client.psp.customers.create(company)).is<PspCustomer>();
  // @ts-expect-error: sin identity_verification, tax_id, name y person_type son obligatorios.
  await client.psp.customers.create({});
  // @ts-expect-error: con identity_verification no va tax_id: es el CUIL de la verificación.
  await client.psp.customers.create({ ...withVerification, tax_id: "27123456781" });
  // @ts-expect-error: ni name: es el nombre y apellido de la verificación.
  await client.psp.customers.create({ ...withVerification, name: "María Laura Ejemplo" });
  // @ts-expect-error: ni person_type: con identity_verification siempre es F.
  await client.psp.customers.create({ ...withVerification, person_type: "F" });
  // @ts-expect-error: ni las fotos.
  await client.psp.customers.create({ ...withVerification, selfie_url: withPhotos.selfie_url });
  // @ts-expect-error: identity_verification es el id (un string), no la verificación entera.
  await client.psp.customers.create({ identity_verification: verification });
  // @ts-expect-error: una persona humana sin identity_verification necesita las tres fotos.
  await client.psp.customers.create({ ...company, person_type: "F" });
  // @ts-expect-error: falta la foto del dorso del DNI.
  await client.psp.customers.create({ ...withPhotos, document_back_url: undefined });
  // @ts-expect-error: las fotos no van junto con identity_verification.
  await client.psp.customers.create({ ...withPhotos, identity_verification: "idv_x" });
  // @ts-expect-error: una persona jurídica no lleva fotos.
  await client.psp.customers.create({ ...company, document_front_url: withPhotos.selfie_url });
  // @ts-expect-error: ni identity_verification.
  await client.psp.customers.create({ ...company, identity_verification: "idv_x" });
  // @ts-expect-error: person_type es F o J.
  await client.psp.customers.create({ ...withPhotos, person_type: "X" });
  // @ts-expect-error: tax_id es un string.
  await client.psp.customers.create({ ...company, tax_id: 30712345672 });
  // @ts-expect-error: sin gender: el sexo lo leemos del frente del DNI.
  await client.psp.customers.create({ ...withPhotos, gender: "F" });
  // @ts-expect-error: sin términos: la API no tiene terms_accepted_at.
  await client.psp.customers.create({ ...withVerification, terms_accepted_at: "2026-10-24" });
  // @ts-expect-error: va en las opciones, no en los parámetros.
  await client.psp.customers.create({ ...withVerification, idempotencyKey: "k" });
  // @ts-expect-error: metadata es de string a string.
  await client.psp.customers.create({ ...withVerification, metadata: { plan: 1 } });
  // @ts-expect-error: open no es un estado de un cliente.
  await client.psp.customers.list({ status: "open" });
  // @ts-expect-error: sin filtro por tax_id (sería un dato personal en la URL).
  await client.psp.customers.list({ tax_id: "27123456781" });
  // @ts-expect-error: los GET no llevan idempotencyKey.
  await client.psp.customers.retrieve("pspc_x", { idempotencyKey: "k" });
  // @ts-expect-error: los GET no llevan idempotencyKey.
  await client.psp.customers.retrieveBalance("pspc_x", { idempotencyKey: "k" });
  // @ts-expect-error: las acciones van sin body: solo el id y las opciones.
  await client.psp.customers.block("pspc_x", { reason: "x" });
  const pspTransferBody = { customer: "pspc_x", amount: 1, destination: "x" };
  // @ts-expect-error: la idempotencyKey es obligatoria en psp.transfers.create.
  await client.psp.transfers.create(pspTransferBody);
  // @ts-expect-error: la idempotencyKey es obligatoria en psp.transfers.create.
  await client.psp.transfers.create(pspTransferBody, { timeout: 5_000 });
  // @ts-expect-error: customer es obligatorio.
  await client.psp.transfers.create({ amount: 1, destination: "x" }, key);
  // @ts-expect-error: destination es un string, para que un CBU no pierda los ceros de adelante.
  await client.psp.transfers.create({ customer: "pspc_x", amount: 1, destination: 123 }, key);
  // @ts-expect-error: amount no acepta booleans.
  await client.psp.transfers.create({ customer: "pspc_x", amount: true, destination: "x" }, key);
  // @ts-expect-error: la lista de transferencias no filtra por external_reference.
  await client.psp.transfers.list({ external_reference: "cliente-8812" });
  // @ts-expect-error: los GET no llevan idempotencyKey.
  await client.psp.balance.retrieve({ idempotencyKey: "k" });
  const invoiceBody = { dni: "12345678", amount: 15000 };
  check(await client.invoices.create(invoiceBody, key)).is<Invoice>();
  // @ts-expect-error: la idempotencyKey es obligatoria en invoices.create.
  await client.invoices.create(invoiceBody);
  // @ts-expect-error: la idempotencyKey es obligatoria en invoices.create.
  await client.invoices.create(invoiceBody, { timeout: 5_000 });
  // @ts-expect-error: dni es un string ("12345678"), no un número.
  await client.invoices.create({ dni: 12345678, amount: 15000 }, key);
  // @ts-expect-error: dni es obligatorio.
  await client.invoices.create({ amount: 15000 }, key);
  // @ts-expect-error: amount es obligatorio.
  await client.invoices.create({ dni: "12345678" }, key);
  // @ts-expect-error: amount no acepta booleans.
  await client.invoices.create({ dni: "12345678", amount: true }, key);
  // @ts-expect-error: el punto de venta sale de tu Facturador.
  await client.invoices.create({ ...invoiceBody, point_of_sale: 5 }, key);
  // @ts-expect-error: el tipo (B o C) sale de tu condición frente al IVA.
  await client.invoices.create({ ...invoiceBody, type: "B" }, key);
  // @ts-expect-error: va en las opciones, no en los parámetros.
  await client.invoices.create({ ...invoiceBody, idempotencyKey: "k" }, key);
  // @ts-expect-error: metadata es de string a string.
  await client.invoices.create({ ...invoiceBody, metadata: { pedido_id: 1042 } }, key);
  // @ts-expect-error: open no es un estado de una factura.
  await client.invoices.list({ status: "open" });
  // @ts-expect-error: sin filtro por DNI (sería un dato personal en la URL).
  await client.invoices.list({ dni: "12345678" });
  // @ts-expect-error: los GET no llevan idempotencyKey.
  await client.invoices.retrieve("inv_x", { idempotencyKey: "k" });
  // @ts-expect-error: los GET no llevan idempotencyKey.
  await client.invoices.list({}, { idempotencyKey: "k" });
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
  check(await GlobalPayment.simulateTransfer("id")).is<Payment | ConnectOrder>();
  check(await GlobalPayment.simulateTransfer("id", { amount: 1000 })).is<Payment | ConnectOrder>();
  // @ts-expect-error: tampoco en el estilo global: el helper no lleva Idempotency-Key.
  await GlobalPayment.simulateTransfer("id", null, { idempotencyKey: "k" });

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

  const payout = await GlobalConnectPayout.create(
    { amount: 60000, destination: "ana.ejemplo" },
    { idempotencyKey: "k" },
  );
  check(payout).is<ConnectPayout>();
  check(await GlobalConnectPayout.retrieve("id")).is<ConnectPayout>();
  check(await GlobalConnectPayout.list({ status: "failed" })).is<ListObject<ConnectPayout>>();
  check(GlobalConnectPayout.constructFrom({ object: "connect.payout" })).is<ConnectPayout>();
  // @ts-expect-error: tampoco en el estilo global: la idempotencyKey es obligatoria.
  await GlobalConnectPayout.create({ amount: 1, destination: "x" });

  const verification = await GlobalIdentityVerification.create({ type: "document" });
  check(verification).is<IdentityVerification>();
  check(
    await GlobalIdentityVerification.create({ type: "document" }, { idempotencyKey: "k" }),
  ).is<IdentityVerification>();
  check(await GlobalIdentityVerification.retrieve("idv_x")).is<IdentityVerification>();
  check(await GlobalIdentityVerification.list()).is<ListObject<IdentityVerification>>();
  check(await GlobalIdentityVerification.list({ status: "declined" })).is<
    ListObject<IdentityVerification>
  >();
  check(await GlobalIdentityVerification.cancel("idv_x")).is<IdentityVerification>();
  check(await GlobalIdentityVerification.files("idv_x")).is<IdentityVerificationFiles>();
  check(await verification.cancel()).is<IdentityVerification>();
  check(
    GlobalIdentityVerification.constructFrom({ object: "identity.verification" }),
  ).is<IdentityVerification>();
  // @ts-expect-error: tampoco en el estilo global: los GET no llevan idempotencyKey.
  await GlobalIdentityVerification.retrieve("idv_x", { idempotencyKey: "k" });

  const customer = await GlobalPspCustomer.create(
    { tax_id: "30712345672", name: "Distribuidora Ejemplo S. A.", person_type: "J" },
    { idempotencyKey: "k" },
  );
  check(customer).is<PspCustomer>();
  check(
    await GlobalPspCustomer.create({ identity_verification: verification.id }),
  ).is<PspCustomer>();
  // @ts-expect-error: tampoco en el estilo global: con identity_verification no va tax_id.
  await GlobalPspCustomer.create({ identity_verification: "idv_x", tax_id: "27123456781" });
  check(await GlobalPspCustomer.retrieve("pspc_x")).is<PspCustomer>();
  check(await GlobalPspCustomer.list({ status: "active" })).is<ListObject<PspCustomer>>();
  check(await GlobalPspCustomer.retrieveBalance("pspc_x")).is<PspCustomerBalance>();
  check(await GlobalPspCustomer.block("pspc_x")).is<PspCustomer>();
  check(await GlobalPspCustomer.unblock("pspc_x")).is<PspCustomer>();
  check(await GlobalPspCustomer.close("pspc_x", { idempotencyKey: "c" })).is<PspCustomer>();
  check(await GlobalPspCustomer.recreate("pspc_x")).is<PspCustomer>();
  check(await customer.close()).is<PspCustomer>();
  check(GlobalPspCustomer.constructFrom({ object: "psp.customer" })).is<PspCustomer>();
  check(
    await GlobalPspTransfer.create(
      { customer: "pspc_x", amount: 18350.5, destination: "proveedor.ejemplo" },
      { idempotencyKey: "k" },
    ),
  ).is<PspTransfer>();
  check(await GlobalPspTransfer.retrieve("pspt_x")).is<PspTransfer>();
  check(await GlobalPspTransfer.list({ customer: "pspc_x" })).is<ListObject<PspTransfer>>();
  check(await GlobalPspBalance.retrieve()).is<PspBalance>();
  // @ts-expect-error: tampoco en el estilo global: la idempotencyKey es obligatoria.
  await GlobalPspTransfer.create({ customer: "pspc_x", amount: 1, destination: "x" });
  // @ts-expect-error: tampoco en el estilo global: los GET no llevan idempotencyKey.
  await GlobalPspBalance.retrieve({ idempotencyKey: "k" });

  const invoice = await GlobalInvoice.create(
    { dni: "12345678", amount: 15000, metadata: { pedido_id: "1042" } },
    { idempotencyKey: "k" },
  );
  check(invoice).is<Invoice>();
  check(await GlobalInvoice.retrieve("inv_x")).is<Invoice>();
  check(await GlobalInvoice.list({ status: "failed" })).is<ListObject<Invoice>>();
  check(await GlobalInvoice.list()).is<ListObject<Invoice>>();
  check(GlobalInvoice.constructFrom({ object: "invoice" })).is<Invoice>();
  // @ts-expect-error: tampoco en el estilo global: la idempotencyKey es obligatoria.
  await GlobalInvoice.create({ dni: "12345678", amount: 15000 });
  // @ts-expect-error: tampoco en el estilo global: los GET no llevan idempotencyKey.
  await GlobalInvoice.retrieve("inv_x", { idempotencyKey: "k" });
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
