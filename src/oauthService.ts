import { checkParams, typeName } from "./encoding.ts";
import type { OAuthToken } from "./oauthToken.ts";
import { type PostRequestOptions, validateOptions } from "./requestOptions.ts";
import type { APIRequestor } from "./requestor.ts";

/** Lo que llegó a tu `redirect_uri` más las credenciales de tu app. */
export interface OAuthTokenParams {
  /** El número de tu aplicación (16 dígitos), de Developers › Apps. Siempre como string. */
  client_id: string;
  /**
   * El `client_secret` de tu aplicación (`raya_cs_live_…`; en una app de un sandbox, su
   * `raya_cs_test_…`). Solo en tu servidor.
   */
  client_secret: string;
  /** El `code` que recibiste en tu `redirect_uri`: dura 10 minutos y se canjea una sola vez. */
  code: string;
  /** La misma `redirect_uri` del link de autorización, idéntica. */
  redirect_uri: string;
}

/**
 * Las opciones de `oauth.token`: `timeout` y `maxNetworkRetries`. Sin `apiKey`, porque no lleva
 * Authorization, y sin `idempotencyKey`, porque no lleva Idempotency-Key (el code se canjea una
 * sola vez y el servidor no la usa ahí).
 */
export type OAuthTokenOptions = Omit<PostRequestOptions, "apiKey" | "idempotencyKey">;

/** El único `grant_type` que existe: el SDK lo pone solo. */
export const GRANT_TYPE_AUTHORIZATION_CODE = "authorization_code";

const TOKEN_PARAMS = ["client_id", "client_secret", "code", "redirect_uri"] as const;

function tokenBody(params: unknown): Record<string, unknown> {
  const values = checkParams("oauth.token", params, TOKEN_PARAMS);
  for (const name of TOKEN_PARAMS) {
    const value = values[name];
    if (typeof value !== "string") {
      const hint =
        name === "client_id" ? " (el número de la aplicación va entre comillas, como string)" : "";
      throw new TypeError(
        `${name} tiene que ser un string, no ${typeName(value)}${hint}: ` +
          "oauth.token({ client_id, client_secret, code, redirect_uri }).",
      );
    }
  }
  return {
    client_id: values.client_id,
    client_secret: values.client_secret,
    grant_type: GRANT_TYPE_AUTHORIZATION_CODE,
    code: values.code,
    redirect_uri: values.redirect_uri,
  };
}

// Las opciones que oauth.token no acepta: no lleva Authorization ni Idempotency-Key.
function checkOptions(options: unknown): void {
  const opts = validateOptions(options);
  if ("apiKey" in opts) {
    throw new RangeError(
      "oauth.token no acepta apiKey en las opciones: no lleva Authorization, la app se identifica " +
        "con client_id y client_secret.",
    );
  }
  if ("idempotencyKey" in opts) {
    throw new RangeError(
      "oauth.token no acepta idempotencyKey en las opciones: no lleva Idempotency-Key, el code se " +
        "canjea una sola vez.",
    );
  }
}

/** `client.oauth`: canjear el `code` de una cuenta que conectó tu app por su access_token. */
export class OAuthService {
  readonly #requestor: APIRequestor;

  constructor(requestor: APIRequestor) {
    this.#requestor = requestor;
  }

  /**
   * Canjea el `code` que llegó a tu `redirect_uri` por el access_token de la cuenta que conectó
   * tu app (`POST /v1/oauth/token`). El SDK pone `grant_type` solo.
   *
   * No lleva Authorization: la app se identifica con `client_id` y `client_secret`, así que anda
   * con un cliente sin clave (`new RayaClient()` sin `RAYA_SECRET_KEY`) y las opciones no aceptan
   * `apiKey`. Tampoco lleva Idempotency-Key (ni acepta `idempotencyKey`): el code dura 10 minutos y
   * se canjea una sola vez, así que `OAUTH_GRANT_INVALID` quiere decir que ya se usó, venció o la
   * `redirect_uri` no coincide, y hay que pedirle a la cuenta que vuelva a autorizar. Guardá
   * `access_token` y `user_id` juntos: el token no vence (`expires_in` y `refresh_token` vienen en
   * `null`) y deja de valer si la cuenta desconecta tu app o la vuelve a autorizar.
   */
  async token(params: OAuthTokenParams, options?: OAuthTokenOptions): Promise<OAuthToken> {
    const body = tokenBody(params);
    checkOptions(options);
    return (await this.#requestor.request(
      "POST",
      "/v1/oauth/token",
      { body, auth: false },
      options,
      "oauth_token",
    )) as OAuthToken;
  }
}
