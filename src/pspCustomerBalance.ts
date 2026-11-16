import { RayaObject } from "./rayaObject.ts";
import { registerObjectClass } from "./registry.ts";

/**
 * El saldo de un cliente de Raya PSP (`client.psp.customers.retrieveBalance(id)`).
 *
 * Su saldo es parte del tuyo, y tu saldo es el que manda: `transferable` es lo que podés transferir
 * ahora en su nombre. No tiene en cuenta el límite mensual del cliente: una transferencia a una cuenta
 * fuera de Raya que lo supera responde `422` `LIMIT_EXCEEDED`.
 */
export class PspCustomerBalance extends RayaObject {
  static override readonly OBJECT_NAME = "psp.customer_balance";

  declare object: "psp.customer_balance";
  /** El `id` del cliente (`pspc_…`). */
  declare customer: string;
  /** Su saldo, en pesos: el mismo `balance` del `PspCustomer`. */
  declare available: number;
  /**
   * Lo que podés transferir ahora en su nombre: el menor entre su saldo y el tuyo (nunca menos de
   * `0`), y `0` si el cliente no está `active`.
   */
  declare transferable: number;
  /** Siempre `"ARS"`. */
  declare currency: "ARS";
}

// "psp.customer_balance", con el punto: el registro es por el valor entero de `object`.
registerObjectClass("psp.customer_balance", PspCustomerBalance);
