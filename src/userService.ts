import { pathId } from "./encoding.ts";
import type { RequestOptions } from "./requestOptions.ts";
import type { APIRequestor } from "./requestor.ts";
import type { User } from "./user.ts";

/** `client.users`: los datos de la cuenta conectada del access_token. */
export class UserService {
  readonly #requestor: APIRequestor;

  constructor(requestor: APIRequestor) {
    this.#requestor = requestor;
  }

  /**
   * La cuenta conectada (`GET /v1/users/:id`): nombre, documento, CUIL o CUIT, los datos de
   * identidad que verificó Raya y su negocio.
   *
   * Solo con el access_token de esa cuenta (`new RayaClient(accessToken)`): `userId` es el
   * `user_id` que vino con el token, o `"me"`. Cualquier otro id da `NotFoundError` con
   * `code === "USER_NOT_FOUND"`, también si la cuenta existe.
   */
  async retrieve(userId: string, options?: RequestOptions): Promise<User> {
    const path = `/v1/users/${pathId("userId", userId)}`;
    return (await this.#requestor.request("GET", path, {}, options, "user")) as User;
  }
}
