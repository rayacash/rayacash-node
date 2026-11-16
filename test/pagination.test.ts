import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ConnectPayout,
  config,
  IdentityVerification,
  ListObject,
  PspCustomer,
  PspTransfer,
  type Transfer,
} from "../src/index.ts";
import {
  PSP_CUSTOMER_ID,
  payoutPage,
  pspCustomerPage,
  pspTransferPage,
  transferPage,
  verificationPage,
} from "./fixtures.ts";
import { isolate, MockAPI, OTHER_KEY, rejection, TEST_KEY } from "./helpers.ts";

isolate();

function queueThreePages(api: MockAPI): void {
  api.add(200, transferPage(["t1", "t2"], "c1"));
  api.add(200, transferPage(["t3", "t4"], "c2"));
  api.add(200, transferPage(["t5"], null));
}

async function collect(iterable: AsyncIterable<Transfer>): Promise<string[]> {
  const ids: string[] = [];
  for await (const transfer of iterable) ids.push(transfer.id);
  return ids;
}

test("autoPagingIter recorre todas las páginas", async () => {
  const api = new MockAPI();
  queueThreePages(api);
  const page = await api
    .client()
    .transfers.list({ direction: "inbound", limit: 2 }, { apiKey: OTHER_KEY });
  assert.deepEqual(await collect(page.autoPagingIter()), ["t1", "t2", "t3", "t4", "t5"]);
  assert.equal(api.requests.length, 3); // al llegar al final no pide otra página
  assert.deepEqual(
    api.requests.map((request) => Object.fromEntries(request.url.searchParams)),
    [
      { direction: "inbound", limit: "2" },
      { direction: "inbound", limit: "2", cursor: "c1" },
      { direction: "inbound", limit: "2", cursor: "c2" },
    ],
  );
  // Las opciones de la primera request también viajan en las siguientes.
  assert.deepEqual(
    new Set(api.requests.map((request) => request.headers.get("authorization"))),
    new Set([`Bearer ${OTHER_KEY}`]),
  );
});

test("se puede cortar el recorrido a mitad de camino", async () => {
  const api = new MockAPI();
  queueThreePages(api);
  const page = await api.client().transfers.list();
  const ids: string[] = [];
  for await (const transfer of page.autoPagingIter()) {
    ids.push(transfer.id);
    if (ids.length === 3) break;
  }
  assert.deepEqual(ids, ["t1", "t2", "t3"]);
  assert.equal(api.requests.length, 2);
  assert.equal(api.pending, 1);
});

test("nextPage en la última página no hace ninguna request", async () => {
  const api = new MockAPI();
  api.add(200, transferPage(["t1"], null));
  const page = await api.client().transfers.list({ direction: "outbound" });
  const empty = await page.nextPage();
  assert.deepEqual([...empty], []);
  assert.equal(empty.has_more, false);
  assert.ok(empty instanceof ListObject);
  assert.deepEqual(await collect((await empty.nextPage()).autoPagingIter()), []);
  assert.equal(api.requests.length, 1);
});

test("has_more sin cursor corta", async () => {
  const api = new MockAPI();
  api.add(200, { object: "list", data: [], has_more: true, next_cursor: null });
  const page = await api.client().transfers.list();
  assert.deepEqual(await collect(page.autoPagingIter()), []);
  assert.equal(api.requests.length, 1);
});

test("una lista sin contexto no puede pedir más", async () => {
  const page = ListObject.constructFrom(transferPage(["t1"], "c1")) as ListObject<Transfer>;
  const error = await rejection(page.nextPage());
  assert.ok(error instanceof Error);
  assert.match(error.message, /cursor: next_cursor/);
  assert.deepEqual(
    [...page].map((transfer) => transfer.id),
    ["t1"],
  );
});

test("connect.payouts.list también pagina: la misma ruta y los mismos filtros", async () => {
  const api = new MockAPI();
  api.add(200, payoutPage(["p1", "p2"], "c1"));
  api.add(200, payoutPage(["p3"], null));
  const page = await api.client().connect.payouts.list({ status: "completed", limit: 2 });
  const ids: string[] = [];
  for await (const payout of page.autoPagingIter()) {
    assert.equal(payout.constructor, ConnectPayout);
    ids.push(payout.id);
  }
  assert.deepEqual(ids, ["p1", "p2", "p3"]);
  assert.equal(api.requests.length, 2);
  assert.deepEqual(
    api.requests.map((request) => request.url.pathname),
    ["/v1/connect/payouts", "/v1/connect/payouts"],
  );
  assert.deepEqual(
    api.requests.map((request) => Object.fromEntries(request.url.searchParams)),
    [
      { status: "completed", limit: "2" },
      { status: "completed", limit: "2", cursor: "c1" },
    ],
  );
});

// --- Identidad --------------------------------------------------------------------------------

function queueThreeVerificationPages(api: MockAPI): void {
  api.add(200, verificationPage(["v1", "v2"], "c1"));
  api.add(200, verificationPage(["v3", "v4"], "c2"));
  api.add(200, verificationPage(["v5"], null));
}

test("identity.verifications.list pagina con los mismos filtros y las mismas opciones", async () => {
  const api = new MockAPI();
  queueThreeVerificationPages(api);
  const page = await api
    .client()
    .identity.verifications.list(
      { status: "verified", type: "document", limit: 2 },
      { apiKey: OTHER_KEY },
    );
  const ids: string[] = [];
  for await (const verification of page.autoPagingIter()) {
    assert.equal(verification.constructor, IdentityVerification);
    ids.push(verification.id);
  }
  assert.deepEqual(ids, ["v1", "v2", "v3", "v4", "v5"]);
  assert.equal(api.requests.length, 3); // al llegar al final no pide otra página
  assert.deepEqual(
    api.requests.map((request) => request.url.pathname),
    Array(3).fill("/v1/identity/verifications"),
  );
  assert.deepEqual(
    api.requests.map((request) => Object.fromEntries(request.url.searchParams)),
    [
      { status: "verified", type: "document", limit: "2" },
      { status: "verified", type: "document", limit: "2", cursor: "c1" },
      { status: "verified", type: "document", limit: "2", cursor: "c2" },
    ],
  );
  // Las opciones de la primera request también viajan en las siguientes.
  assert.deepEqual(
    new Set(api.requests.map((request) => request.headers.get("authorization"))),
    new Set([`Bearer ${OTHER_KEY}`]),
  );
});

test("identity.verifications.list: se puede cortar el recorrido a mitad de camino", async () => {
  const api = new MockAPI();
  queueThreeVerificationPages(api);
  const page = await api.client().identity.verifications.list();
  const ids: string[] = [];
  for await (const verification of page.autoPagingIter()) {
    ids.push(verification.id);
    if (ids.length === 3) break;
  }
  assert.deepEqual(ids, ["v1", "v2", "v3"]);
  assert.equal(api.requests.length, 2);
  assert.equal(api.pending, 1);
});

test("identity.verifications.list: nextPage en la última página no hace ninguna request", async () => {
  const api = new MockAPI();
  api.add(200, verificationPage(["v1"], null));
  const page = await api.client().identity.verifications.list({ status: "verified" });
  const empty = await page.nextPage();
  assert.ok(empty instanceof ListObject);
  assert.deepEqual([...empty], []);
  assert.equal(empty.has_more, false);
  assert.equal(api.requests.length, 1);
});

test("IdentityVerification.list (estilo global) también pagina", async () => {
  const api = new MockAPI();
  config.apiKey = TEST_KEY;
  config.fetch = api.fetch;
  api.add(200, verificationPage(["v1"], "c1"));
  api.add(200, verificationPage(["v2"], null));
  const page = await IdentityVerification.list({ external_reference: "cliente-8812" });
  const ids: string[] = [];
  for await (const verification of page.autoPagingIter()) ids.push(verification.id);
  assert.deepEqual(ids, ["v1", "v2"]);
  assert.deepEqual(
    api.requests.map((request) => Object.fromEntries(request.url.searchParams)),
    [{ external_reference: "cliente-8812" }, { external_reference: "cliente-8812", cursor: "c1" }],
  );
});

// --- Raya PSP ---------------------------------------------------------------------------------

test("psp.customers.list pagina con los mismos filtros y las mismas opciones", async () => {
  const api = new MockAPI();
  api.add(200, pspCustomerPage(["c1", "c2"], "k1"));
  api.add(200, pspCustomerPage(["c3", "c4"], "k2"));
  api.add(200, pspCustomerPage(["c5"], null));
  const page = await api
    .client()
    .psp.customers.list({ status: "active", limit: 2 }, { apiKey: OTHER_KEY });
  const ids: string[] = [];
  for await (const customer of page.autoPagingIter()) {
    assert.equal(customer.constructor, PspCustomer);
    ids.push(customer.id);
  }
  assert.deepEqual(ids, ["c1", "c2", "c3", "c4", "c5"]);
  assert.equal(api.requests.length, 3); // al llegar al final no pide otra página
  assert.deepEqual(
    api.requests.map((request) => request.url.pathname),
    Array(3).fill("/v1/psp/customers"),
  );
  assert.deepEqual(
    api.requests.map((request) => Object.fromEntries(request.url.searchParams)),
    [
      { status: "active", limit: "2" },
      { status: "active", limit: "2", cursor: "k1" },
      { status: "active", limit: "2", cursor: "k2" },
    ],
  );
  // Las opciones de la primera request también viajan en las siguientes.
  assert.deepEqual(
    new Set(api.requests.map((request) => request.headers.get("authorization"))),
    new Set([`Bearer ${OTHER_KEY}`]),
  );
});

test("psp.transfers.list pagina las de un cliente: la misma ruta y los mismos filtros", async () => {
  const api = new MockAPI();
  api.add(200, pspTransferPage(["t1", "t2"], "k1"));
  api.add(200, pspTransferPage(["t3"], null));
  const page = await api
    .client()
    .psp.transfers.list({ customer: PSP_CUSTOMER_ID, direction: "inbound", limit: 2 });
  const ids: string[] = [];
  for await (const transfer of page.autoPagingIter()) {
    assert.equal(transfer.constructor, PspTransfer);
    ids.push(transfer.id);
  }
  assert.deepEqual(ids, ["t1", "t2", "t3"]);
  assert.deepEqual(
    api.requests.map((request) => request.url.pathname),
    ["/v1/psp/transfers", "/v1/psp/transfers"],
  );
  assert.deepEqual(
    api.requests.map((request) => Object.fromEntries(request.url.searchParams)),
    [
      { customer: PSP_CUSTOMER_ID, direction: "inbound", limit: "2" },
      { customer: PSP_CUSTOMER_ID, direction: "inbound", limit: "2", cursor: "k1" },
    ],
  );
});

test("psp.customers.list: se puede cortar el recorrido y nextPage en la última no pide nada", async () => {
  const api = new MockAPI();
  api.add(200, pspCustomerPage(["c1", "c2"], "k1"));
  api.add(200, pspCustomerPage(["c3"], null));
  const page = await api.client().psp.customers.list();
  const ids: string[] = [];
  for await (const customer of page.autoPagingIter()) {
    ids.push(customer.id);
    if (ids.length === 1) break;
  }
  assert.deepEqual(ids, ["c1"]);
  assert.equal(api.requests.length, 1);
  const last = await page.nextPage();
  assert.deepEqual(
    [...last].map((customer) => customer.id),
    ["c3"],
  );
  const empty = await last.nextPage();
  assert.ok(empty instanceof ListObject);
  assert.deepEqual([...empty], []);
  assert.equal(api.requests.length, 2);
});

test("PspCustomer.list y PspTransfer.list (estilo global) también paginan", async () => {
  const api = new MockAPI();
  config.apiKey = TEST_KEY;
  config.fetch = api.fetch;
  api.add(200, pspCustomerPage(["c1"], "k1"));
  api.add(200, pspCustomerPage(["c2"], null));
  api.add(200, pspTransferPage(["t1"], "k2"));
  api.add(200, pspTransferPage(["t2"], null));
  const customers: string[] = [];
  const page = await PspCustomer.list({ external_reference: "cliente-8812" });
  for await (const customer of page.autoPagingIter()) customers.push(customer.id);
  const transfers: string[] = [];
  const transferList = await PspTransfer.list({ status: "completed" });
  for await (const transfer of transferList.autoPagingIter()) transfers.push(transfer.id);
  assert.deepEqual(
    [customers, transfers],
    [
      ["c1", "c2"],
      ["t1", "t2"],
    ],
  );
  assert.deepEqual(
    api.requests.map((request) => Object.fromEntries(request.url.searchParams)),
    [
      { external_reference: "cliente-8812" },
      { external_reference: "cliente-8812", cursor: "k1" },
      { status: "completed" },
      { status: "completed", cursor: "k2" },
    ],
  );
});
