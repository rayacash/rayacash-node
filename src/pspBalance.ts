import { PspBalanceService } from "./pspService.ts";
import { RayaObject } from "./rayaObject.ts";
import { defaultRequestor, registerObjectClass } from "./registry.ts";
import type { RequestOptions } from "./requestOptions.ts";

/**
 * Tu saldo y el de tus clientes de Raya PSP (`client.psp.balance.retrieve()`).
 *
 * La plata de tus clientes está en tu cuenta: `available` es tu saldo disponible y
 * `customers_balance`, la suma de los saldos de tus clientes. Para transferir en nombre de un
 * cliente tienen que alcanzar el tuyo y el suyo.
 */
export class PspBalance extends RayaObject {
  static override readonly OBJECT_NAME = "psp.balance";

  declare object: "psp.balance";
  /** Tu saldo disponible, en pesos: el mismo de `client.balance.retrieve()` (puede ser negativo). */
  declare available: number;
  /** La suma de los saldos de todos tus clientes, también los de los que tienen el CVU dado de baja. */
  declare customers_balance: number;
  /** Siempre `"ARS"`. */
  declare currency: "ARS";

  /** Estilo global: `PspBalance.retrieve()`. Ver `client.psp.balance.retrieve()`. */
  static async retrieve(options?: RequestOptions): Promise<PspBalance> {
    return new PspBalanceService(defaultRequestor()).retrieve(options);
  }
}

// "psp.balance", con el punto: el registro es por el valor entero de `object`.
registerObjectClass("psp.balance", PspBalance);
