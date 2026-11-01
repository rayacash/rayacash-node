import { BalanceService } from "./balanceService.ts";
import { RayaObject } from "./rayaObject.ts";
import { defaultRequestor, registerObjectClass } from "./registry.ts";
import type { RequestOptions } from "./requestOptions.ts";

/**
 * Tu saldo disponible, en pesos.
 *
 * Ya tiene descontadas las transferencias que enviaste, aunque sigan `pending`.
 */
export class Balance extends RayaObject {
  static override readonly OBJECT_NAME = "balance";

  declare object: "balance";
  /** Saldo disponible en pesos (puede ser negativo). */
  declare available: number;
  /** Siempre `"ARS"`. */
  declare currency: string;

  /** Estilo global: `Balance.retrieve()`. Ver `client.balance.retrieve()`. */
  static async retrieve(options?: RequestOptions): Promise<Balance> {
    return new BalanceService(defaultRequestor()).retrieve(options);
  }
}

registerObjectClass("balance", Balance);
