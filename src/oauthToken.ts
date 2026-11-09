import { OAuthService, type OAuthTokenOptions, type OAuthTokenParams } from "./oauthService.ts";
import { RayaObject } from "./rayaObject.ts";
import { defaultRequestor, registerObjectClass } from "./registry.ts";
import { INSPECT, maskKey } from "./util.ts";

/**
 * El access_token de una cuenta que conectó tu app, con su `user_id`.
 *
 * Guardá los dos juntos, el token cifrado: con `new RayaClient(token.access_token)` creás
 * checkouts a nombre de esa cuenta y leés sus datos (`client.users.retrieve(token.user_id)`). No
 * vence; deja de valer cuando la cuenta desconecta tu app o la vuelve a autorizar (ahí recibís
 * uno nuevo). Es la respuesta de `client.oauth.token()`.
 */
export class OAuthToken extends RayaObject {
  static override readonly OBJECT_NAME = "oauth_token";

  declare object: "oauth_token";
  /** `raya_at_live_…`: va en `Authorization: Bearer`, como una clave secreta. Es un secreto. */
  declare access_token: string;
  /** Siempre `"Bearer"`. */
  declare token_type: string;
  /** Los permisos que dio la cuenta, separados por espacio: `"checkout profile"`. */
  declare scope: string;
  /** El id de la cuenta conectada: el `:id` de `users.retrieve` y el `account` de sus checkouts. */
  declare user_id: string;
  /** Siempre `null`: el token no vence. */
  declare expires_in: null;
  /** Siempre `null`: no hay refresh. */
  declare refresh_token: null;
}

// console.log(token) muestra el access_token enmascarado: es un secreto, como la clave. JSON.stringify
// lo da entero, para guardarlo.
Object.defineProperty(OAuthToken.prototype, INSPECT, {
  value(
    this: OAuthToken,
    _depth: number,
    options: unknown,
    inspect?: (value: unknown, options: unknown) => string,
  ): string {
    const fields = this.toJSON();
    if (typeof fields.access_token === "string") {
      fields.access_token = maskKey(fields.access_token);
    }
    return `OAuthToken ${inspect ? inspect(fields, options) : JSON.stringify(fields)}`;
  },
});

/** Estilo global: `OAuth.token({ client_id, client_secret, code, redirect_uri })`. */
// biome-ignore lint/complexity/noStaticOnlyClass: el estilo global es OAuth.token(…), como Payment.create(…).
export class OAuth {
  /** Canjea el `code` por el access_token de la cuenta conectada. Ver `client.oauth.token()`. */
  static async token(params: OAuthTokenParams, options?: OAuthTokenOptions): Promise<OAuthToken> {
    return new OAuthService(defaultRequestor()).token(params, options);
  }
}

registerObjectClass("oauth_token", OAuthToken);
