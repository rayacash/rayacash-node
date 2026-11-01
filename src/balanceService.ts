import type { Balance } from "./balance.ts";
import type { RequestOptions } from "./requestOptions.ts";
import type { APIRequestor } from "./requestor.ts";

/** `client.balance`: tu saldo disponible. */
export class BalanceService {
  readonly #requestor: APIRequestor;

  constructor(requestor: APIRequestor) {
    this.#requestor = requestor;
  }

  /** Tu saldo disponible en pesos (`GET /v1/balance`). */
  async retrieve(options?: RequestOptions): Promise<Balance> {
    return (await this.#requestor.request("GET", "/v1/balance", {}, options, "balance")) as Balance;
  }
}
