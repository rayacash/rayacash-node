// Ningún test puede llamar a la API real: con una clave real, cada request mueve plata. Tampoco
// a un sandbox: los tests del SDK corren sin red, con MockAPI.
//
// Se precarga en cada proceso de test (node --import ./test/guard.ts). Reemplaza el fetch global
// por uno que falla y deja abrir sockets solo contra loopback: transport.test.ts usa el fetch real
// (`realFetch`) contra un servidor en 127.0.0.1.

import net from "node:net";

/** El fetch de Node, antes de reemplazarlo. */
export const realFetch: typeof fetch = globalThis.fetch;

globalThis.fetch = (async () => {
  throw new Error("Los tests del SDK nunca salen a la red: usá MockAPI.");
}) as typeof fetch;

const LOOPBACK = new Set([undefined, "localhost", "127.0.0.1", "::1"]);
const connect = net.Socket.prototype.connect;

function targetHost(args: unknown[]): unknown {
  // net llama a connect con sus argumentos ya normalizados ([options, cb]) o con los del usuario.
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (typeof first === "object" && first !== null) {
    const options = first as { host?: unknown; path?: unknown };
    return options.path !== undefined ? "localhost" : options.host;
  }
  return typeof first === "string" && Number.isNaN(Number(first)) ? "localhost" : args[1];
}

net.Socket.prototype.connect = function guardedConnect(this: net.Socket, ...args: unknown[]) {
  const host = targetHost(args);
  if (!LOOPBACK.has(host as string | undefined)) {
    throw new Error(`Los tests del SDK nunca salen a la red (intentó conectar a ${String(host)}).`);
  }
  return (connect as (...a: unknown[]) => net.Socket).apply(this, args);
} as typeof net.Socket.prototype.connect;
