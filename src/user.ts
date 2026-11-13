import { RayaObject } from "./rayaObject.ts";
import { defaultRequestor, registerObjectClass } from "./registry.ts";
import type { RequestOptions } from "./requestOptions.ts";
import { UserService } from "./userService.ts";

export type UserType = "personal" | "business";
export type UserSex = "M" | "F" | "X";
export type UserIdentificationType = "DNI" | "CUIT";

/**
 * Una cuenta de Raya que conectó tu app: la persona (o la empresa) y su negocio.
 *
 * Solo la ves con su access_token (`client.users.retrieve(token.user_id)`). Trae los datos que
 * verificó Raya (documento, RENAPER), nunca la foto ni el número de trámite del documento. Lo que
 * no tenemos viene en `null`.
 */
export class User extends RayaObject {
  static override readonly OBJECT_NAME = "user";

  /** El `user_id` del access_token y el `account` de los pagos que creás a su nombre. */
  declare id: string;
  declare object: "user";
  /** `personal` (una persona) o `business` (una empresa, con `business`). */
  declare type: UserType;
  declare email: string;
  /**
   * De la persona titular; en una empresa, `first_name` y `full_name` traen la razón social y
   * `last_name` viene `null`. `null` donde no hay dato.
   */
  declare first_name: string | null;
  declare last_name: string | null;
  declare full_name: string | null;
  /** El documento: DNI en una cuenta personal, CUIT en una empresa. `null` si no lo tenemos. */
  declare identification: User.Identification | null;
  /** CUIL (persona) o CUIT (empresa): 11 dígitos, sin guiones. */
  declare tax_id: string | null;
  /** Con el código de país. */
  declare phone: string | null;
  /** `YYYY-MM-DD`. */
  declare date_of_birth: string | null;
  /** `M`, `F` o `X`, como figura en el documento. */
  declare sex: UserSex | null;
  declare nationality: string | null;
  /** El domicilio del documento, según RENAPER. */
  declare address: User.Address | null;
  /** Si Raya verificó la identidad de la cuenta (documento y prueba de vida). */
  declare identity_verified: boolean;
  declare verified_at: string | null;
  /** Los datos de la sociedad; solo en cuentas `business`. */
  declare business: User.Business | null;
  /**
   * El comercio de la cuenta (lo que ve quien paga); `null` hasta que configure su negocio o le crees
   * el primer pago (ahí se lo creamos con sus datos legales): no hace falta para cobrarle.
   */
  declare merchant: User.Merchant | null;
  /** Cuándo se creó la cuenta en Raya (ISO 8601 en UTC). */
  declare created_at: string;

  /** Estilo global: `User.retrieve(userId)`. Ver `client.users.retrieve()`. */
  static async retrieve(userId: string, options?: RequestOptions): Promise<User> {
    return new UserService(defaultRequestor()).retrieve(userId, options);
  }
}

export declare namespace User {
  /** El documento de la cuenta. */
  interface Identification {
    /** `DNI` (cuenta personal) o `CUIT` (empresa); pueden sumarse valores. El CUIL de una persona va en `tax_id`. */
    type: UserIdentificationType;
    /** El número, sin puntos ni guiones. */
    number: string;
  }

  /** El domicilio que figura en el documento. Cada campo puede ser `null`. */
  interface Address {
    street: string | null;
    number: string | null;
    floor: string | null;
    apartment: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
    country: string | null;
  }

  /** Quien dio de alta la empresa en Raya. `null` donde no hay dato. */
  interface Representative {
    first_name: string | null;
    last_name: string | null;
    /** Su CUIL o CUIT, sin guiones. */
    tax_id: string | null;
  }

  /** Los datos de la sociedad de una cuenta `business`. `null` donde no hay dato. */
  interface Business {
    /** Razón social. */
    legal_name: string | null;
    /** CUIT de la sociedad: 11 dígitos, sin guiones. */
    tax_id: string | null;
    /** Tipo societario, como `SRL` o `SA`. */
    company_type: string | null;
    representative: Representative | null;
  }

  /** El negocio de la cuenta, como lo ve quien paga en la página de pago. */
  interface Merchant {
    /** El nombre visible del comercio. */
    name: string;
    /** URL de la imagen del comercio, o `null`. */
    image: string | null;
  }
}

registerObjectClass("user", User);
