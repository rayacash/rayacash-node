import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ConnectPayout,
  config,
  IdentityVerification,
  ListObject,
  type Transfer,
} from "../src/index.ts";
import { payoutPage, transferPage, verificationPage } from "./fixtures.ts";
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
