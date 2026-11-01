// El fetch real de Node (undici) contra un servidor en 127.0.0.1: lo que un fetch falso no puede
// probar (Content-Length, redirects, cortes y timeouts de verdad). Nunca sale de loopback.

import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { APIConnectionError, APIError, Payment, RayaClient } from "../src/index.ts";
import { timing } from "../src/retry.ts";
import { BALANCE, PAYMENT_ID, PAYMENT_PENDING, PAYMENT_REFUNDED } from "./fixtures.ts";
import { realFetch } from "./guard.ts";
import { isolate, rejection, TEST_KEY } from "./helpers.ts";

const state = isolate();
const REAL_TIMEOUT_SIGNAL = timing.timeoutSignal;

interface Received {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

let server: http.Server;
let base = "";
let received: Received[] = [];
let respond: (request: http.IncomingMessage, response: http.ServerResponse) => void = () => {};

before(async () => {
  server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({
        method: request.method ?? "",
        url: request.url ?? "",
        headers: request.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      respond(request, response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

beforeEach(() => {
  received = [];
  timing.timeoutSignal = REAL_TIMEOUT_SIGNAL;
});

function json(status: number, body: unknown): typeof respond {
  return (_request, response) => {
    response.writeHead(status, {
      "Content-Type": "application/json",
      "Raya-Request-Id": "req_loopback",
    });
    response.end(JSON.stringify(body));
  };
}

function client(options: { maxNetworkRetries?: number; timeout?: number } = {}): RayaClient {
  return new RayaClient(TEST_KEY, {
    apiBase: base,
    fetch: realFetch,
    maxNetworkRetries: 0,
    ...options,
  });
}

test("un POST con body lleva Content-Type y Content-Length", async () => {
  respond = json(201, PAYMENT_PENDING);
  const payment = await client().payments.create(
    { amount: "15000.50", description: "ñandú" },
    { idempotencyKey: "k-1" },
  );
  assert.ok(payment instanceof Payment);
  assert.equal(payment.lastResponse?.requestId, "req_loopback");
  const [request] = received;
  assert.ok(request);
  assert.equal(request.method, "POST");
  assert.equal(request.url, "/v1/payments");
  assert.equal(request.body, '{"amount":15000.5,"description":"\\u00f1and\\u00fa"}');
  assert.equal(request.headers["content-type"], "application/json");
  assert.equal(request.headers["content-length"], String(Buffer.byteLength(request.body)));
  assert.equal(request.headers["transfer-encoding"], undefined);
  assert.equal(request.headers["idempotency-key"], "k-1");
  assert.equal(request.headers.authorization, `Bearer ${TEST_KEY}`);
  assert.equal(request.headers.accept, "application/json");
  assert.match(request.headers["user-agent"] ?? "", /^rayacash-node\/\d+\.\d+\.\d+ Node\//);
});

test("el reembolso va sin body: Content-Length 0 y sin Content-Type", async () => {
  respond = json(200, PAYMENT_REFUNDED);
  await client().payments.refund(PAYMENT_ID);
  const [request] = received;
  assert.ok(request);
  assert.equal(request.body, "");
  assert.equal(request.headers["content-length"], "0");
  assert.equal(request.headers["content-type"], undefined);
  assert.equal(request.headers["transfer-encoding"], undefined);
});

test("un GET va sin body ni Content-Type", async () => {
  respond = json(200, BALANCE);
  await client().balance.retrieve();
  const [request] = received;
  assert.ok(request);
  assert.equal(request.method, "GET");
  assert.equal(request.headers["content-type"], undefined);
  assert.equal(request.headers["idempotency-key"], undefined);
});

test("un 301 no se sigue", async () => {
  respond = (_request, response) => {
    response.writeHead(301, { Location: `${base}/v1/otra` });
    response.end();
  };
  const error = await rejection(client({ maxNetworkRetries: 2 }).balance.retrieve());
  assert.ok(error instanceof APIError);
  assert.equal(error.httpStatus, 301);
  assert.equal(received.length, 1);
});

test("un corte a mitad de la respuesta es NETWORK_ERROR y se reintenta", async () => {
  let calls = 0;
  respond = (request, response) => {
    calls += 1;
    if (calls === 1) {
      response.writeHead(200, { "Content-Type": "application/json", "Content-Length": "100" });
      response.write('{"object":"bal');
      setTimeout(() => request.socket.destroy(), 10);
      return;
    }
    json(200, BALANCE)(request, response);
  };
  const balance = await client({ maxNetworkRetries: 1 }).balance.retrieve();
  assert.equal(balance.available, 152340.5);
  assert.equal(received.length, 2);
  assert.deepEqual(state.sleeps, [0.5]);

  calls = 0;
  received = [];
  const error = await rejection(client().balance.retrieve());
  assert.ok(error instanceof APIConnectionError);
  assert.equal(error.code, "NETWORK_ERROR");
  assert.equal(error.shouldRetry, true);
});

test("un servidor que no responde es TIMEOUT", async () => {
  respond = () => {}; // nunca contesta
  const error = await rejection(client({ timeout: 200 }).balance.retrieve());
  assert.ok(error instanceof APIConnectionError);
  assert.equal(error.code, "TIMEOUT");
  assert.equal(error.shouldRetry, true);
});

test("un puerto cerrado es NETWORK_ERROR", async () => {
  const closed = http.createServer();
  await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
  const port = (closed.address() as AddressInfo).port;
  await new Promise<void>((resolve) => closed.close(() => resolve()));
  const unreachable = new RayaClient(TEST_KEY, {
    apiBase: `http://127.0.0.1:${port}`,
    fetch: realFetch,
    maxNetworkRetries: 0,
  });
  const error = await rejection(unreachable.balance.retrieve());
  assert.ok(error instanceof APIConnectionError);
  assert.equal(error.code, "NETWORK_ERROR");
  assert.equal(error.shouldRetry, true);
  assert.match(error.message, /ECONNREFUSED/);
});

test("la guardia no deja salir de loopback", async () => {
  const outside = new RayaClient(TEST_KEY, { fetch: realFetch, maxNetworkRetries: 0 });
  const error = await rejection(outside.balance.retrieve());
  assert.ok(error instanceof APIConnectionError);
  assert.match(String((error.cause as Error).cause), /nunca salen a la red/);
});
