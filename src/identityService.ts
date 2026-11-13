import { checkParams, encodeQuery, isPlainObject, pathId } from "./encoding.ts";
import type {
  IdentityVerification,
  IdentityVerificationStatus,
  IdentityVerificationType,
} from "./identityVerification.ts";
import type { IdentityVerificationFiles } from "./identityVerificationFiles.ts";
import type { ListObject } from "./listObject.ts";
import type { PostRequestOptions, RequestOptions } from "./requestOptions.ts";
import type { APIRequestor } from "./requestor.ts";

export interface IdentityVerificationCreateParams {
  /**
   * `document` (DNI + prueba de vida + registro) o `biometric` (prueba de vida contra una
   * `document` anterior).
   */
  type: IdentityVerificationType;
  /**
   * Tu identificador (por ejemplo, el id de tu cliente): hasta 128 caracteres, en una línea. No
   * pongas datos personales: va en la URL al filtrar la lista.
   */
  external_reference?: string | null;
  /** Hasta 20 pares clave-valor de texto. */
  metadata?: Record<string, string> | null;
  /**
   * URL `https://` a la que vuelve la persona desde la pantalla final. No pongas datos personales
   * en la URL.
   */
  return_url?: string | null;
  /** Segundos hasta que vence, entre 3600 (1 hora) y 2592000 (30 días). Por defecto, 7 días. */
  expires_in?: number | null;
  /**
   * Solo con `type: "biometric"` (obligatorio): el `id` de una verificación `document` de tu
   * cuenta ya `verified`, con `checks.registry.face_match` en `hit`.
   */
  reference?: string | null;
}

export interface IdentityVerificationListParams {
  /** `pending`, `in_progress`, `processing`, `verified`, `declined`, `expired` o `canceled`. */
  status?: IdentityVerificationStatus | null;
  /** `document` o `biometric`. */
  type?: IdentityVerificationType | null;
  /** Coincidencia exacta. */
  external_reference?: string | null;
  /** Desde este momento (incluido): un `Date` o un string ISO 8601 con zona. */
  created_gte?: string | Date | null;
  /**
   * Hasta este momento (excluido). Con `created_gte` arma un rango semiabierto: los días o meses
   * seguidos no se pisan.
   */
  created_lt?: string | Date | null;
  /** De 1 a 100 por página (por defecto, 20). */
  limit?: number | null;
  /** El `next_cursor` de la página anterior. */
  cursor?: string | null;
}

const PATH = "/v1/identity/verifications";
const OBJECT = "identity.verification";
// Las dos listas son el espejo de la API (identity/api_params.py): en ese orden viaja el body.
const CREATE_PARAMS = [
  "type",
  "external_reference",
  "metadata",
  "return_url",
  "expires_in",
  "reference",
] as const;
const LIST_PARAMS = [
  "status",
  "type",
  "external_reference",
  "created_gte",
  "created_lt",
  "limit",
  "cursor",
] as const;

function createBody(params: unknown): Record<string, unknown> {
  const values = checkParams("identity.verifications.create", params, CREATE_PARAMS);
  const metadata = values.metadata;
  if (metadata !== undefined && metadata !== null && !isPlainObject(metadata)) {
    throw new TypeError(
      'metadata tiene que ser un objeto de string a string, como { plan: "pro" }.',
    );
  }
  return Object.fromEntries(CREATE_PARAMS.map((name) => [name, values[name]]));
}

function verificationPath(verificationId: string, action = ""): string {
  return `${PATH}/${pathId("verificationId", verificationId)}${action}`;
}

/**
 * `client.identity.verifications`: verificar la identidad de una persona y leer el resultado. Va
 * con tu clave secreta.
 */
export class IdentityVerificationService {
  readonly #requestor: APIRequestor;

  constructor(requestor: APIRequestor) {
    this.#requestor = requestor;
  }

  /**
   * Crea una verificación `pending` (`POST /v1/identity/verifications`). Mandale `url` a la
   * persona o abrila adentro de tu web con Identity.js (`npm install rayacash-identity`); te
   * avisamos el resultado con los webhooks `identity.verification.*`. Se cobra solo si termina
   * `verified`.
   *
   * La `idempotencyKey` es opcional pero recomendada: guardala con tu registro y reusala si
   * reintentás. Si no la pasás, generamos una que protege los reintentos de esta llamada.
   */
  async create(
    params: IdentityVerificationCreateParams,
    options?: PostRequestOptions,
  ): Promise<IdentityVerification> {
    const body = createBody(params);
    return (await this.#requestor.request(
      "POST",
      PATH,
      { body },
      options,
      OBJECT,
    )) as IdentityVerification;
  }

  /**
   * Una verificación de tu cuenta, con `person` si está `verified`
   * (`GET /v1/identity/verifications/:id`). Si no existe o no es tuya, da `NotFoundError` con
   * `code === "VERIFICATION_NOT_FOUND"`.
   */
  async retrieve(verificationId: string, options?: RequestOptions): Promise<IdentityVerification> {
    const path = verificationPath(verificationId);
    return (await this.#requestor.request(
      "GET",
      path,
      {},
      options,
      OBJECT,
    )) as IdentityVerification;
  }

  /**
   * Tus verificaciones, de la más nueva a la más vieja (`GET /v1/identity/verifications`): las de
   * la API y las del dashboard.
   *
   * Devuelve una página. Para recorrer todas: `for await (const v of page.autoPagingIter())`.
   */
  async list(
    params?: IdentityVerificationListParams,
    options?: RequestOptions,
  ): Promise<ListObject<IdentityVerification>> {
    const values = checkParams("identity.verifications.list", params, LIST_PARAMS);
    const query = encodeQuery(Object.fromEntries(LIST_PARAMS.map((name) => [name, values[name]])));
    const page = await this.#requestor.requestList(PATH, query, options);
    return page as ListObject<IdentityVerification>;
  }

  /**
   * Cancela una verificación que la persona todavía no terminó
   * (`POST /v1/identity/verifications/:id/cancel`, sin body): su link deja de funcionar y no se
   * cobra. Solo `pending` o `in_progress`: si no, `ConflictError` con
   * `code === "VERIFICATION_NOT_CANCELABLE"` y el estado en `error.data.status`. Cancelar una que
   * ya está `canceled` la devuelve igual.
   */
  async cancel(
    verificationId: string,
    options?: PostRequestOptions,
  ): Promise<IdentityVerification> {
    const path = verificationPath(verificationId, "/cancel");
    return (await this.#requestor.request(
      "POST",
      path,
      {},
      options,
      OBJECT,
    )) as IdentityVerification;
  }

  /**
   * Las imágenes de una verificación, con URLs que vencen a los 5 minutos
   * (`GET /v1/identity/verifications/:id/files`). Bajalas enseguida y no guardes las URLs.
   */
  async files(
    verificationId: string,
    options?: RequestOptions,
  ): Promise<IdentityVerificationFiles> {
    const path = verificationPath(verificationId, "/files");
    return (await this.#requestor.request(
      "GET",
      path,
      {},
      options,
      "identity.verification_files",
    )) as IdentityVerificationFiles;
  }
}

/**
 * `client.identity`: Identidad, para verificar la identidad de tus clientes con su DNI, una prueba
 * de vida y el Registro Nacional de las Personas (RENAPER). Va con tu clave secreta.
 */
export class IdentityService {
  /** `client.identity.verifications.create/retrieve/list/cancel/files`, con tu clave secreta. */
  readonly verifications: IdentityVerificationService;

  constructor(requestor: APIRequestor) {
    this.verifications = new IdentityVerificationService(requestor);
  }
}
