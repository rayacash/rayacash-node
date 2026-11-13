import {
  type IdentityVerificationCreateParams,
  type IdentityVerificationListParams,
  IdentityVerificationService,
} from "./identityService.ts";
import type { IdentityVerificationFiles } from "./identityVerificationFiles.ts";
import type { ListObject } from "./listObject.ts";
import { RayaObject, resolveRequestor } from "./rayaObject.ts";
import { defaultRequestor, registerObjectClass } from "./registry.ts";
import type { PostRequestOptions, RequestOptions } from "./requestOptions.ts";

/** `document` (DNI, prueba de vida y registro) o `biometric` (prueba de vida contra una `document`). */
export type IdentityVerificationType = "document" | "biometric";
export type IdentityVerificationStatus =
  | "pending"
  | "in_progress"
  | "processing"
  | "verified"
  | "declined"
  | "expired"
  | "canceled";
/** El resultado de cada control de `checks`. */
export type IdentityVerificationCheckStatus =
  | "passed"
  | "failed"
  | "pending"
  | "unavailable"
  | "not_applicable";
/** Por qué se rechazó una verificación (`decline_reason.code`). */
export type IdentityVerificationDeclineCode =
  | "face_mismatch"
  | "registry_not_found"
  | "registry_data_mismatch"
  | "registry_unavailable"
  | "attempts_exhausted";

function verificationIdOf(verification: IdentityVerification): string {
  const id: unknown = verification.id;
  if (typeof id !== "string" || !id) {
    throw new RangeError("Esta IdentityVerification no tiene id: no se puede cancelar.");
  }
  return id;
}

/**
 * Una verificación de identidad (Identidad). `document` es la completa: DNI (frente y dorso),
 * prueba de vida y validación contra el Registro Nacional de las Personas (RENAPER). `biometric`
 * es una prueba de vida comparada con la de una `document` anterior de la misma persona.
 *
 * Dala por buena solo cuando `status` es `verified`. Es el mismo objeto que llega en los webhooks
 * `identity.verification.*`, ahí siempre con `person` en `null`.
 */
export class IdentityVerification extends RayaObject {
  static override readonly OBJECT_NAME = "identity.verification";
  static override readonly PLAIN_FIELDS: ReadonlySet<string> = new Set(["metadata"]);

  /** `idv_…` */
  declare id: string;
  declare object: "identity.verification";
  declare type: IdentityVerificationType;
  /**
   * `pending` (nadie empezó), `in_progress`, `processing` (terminó la captura), `verified`,
   * `declined`, `expired` o `canceled` (pueden sumarse valores).
   */
  declare status: IdentityVerificationStatus;
  /** La página donde la persona hace la verificación: compartila o abrila con Identity.js. */
  declare url: string;
  /** Tu identificador (por ejemplo, el id de tu cliente). */
  declare external_reference: string | null;
  /** Tus pares clave-valor (un objeto común). `{}` si no mandaste ninguno. */
  declare metadata: Record<string, string>;
  /** A dónde vuelve la persona desde la pantalla final. */
  declare return_url: string | null;
  /**
   * En una `biometric`, el `id` de una verificación `document` de tu cuenta ya `verified`, con
   * `checks.registry.face_match` en `hit`: contra esa se compara.
   */
  declare reference: string | null;
  /** Por qué se rechazó; `null` si no está `declined`. Decidí con `code`, no con `message`. */
  declare decline_reason: IdentityVerification.DeclineReason | null;
  declare checks: IdentityVerification.Checks;
  /**
   * Los datos de la persona: solo cuando está `verified`. En los eventos viene siempre en `null`:
   * pedila con `client.identity.verifications.retrieve(id)`. Son datos personales: no los
   * loguees.
   */
  declare person: IdentityVerification.Person | null;
  /**
   * Lo que se cobra por esta verificación, en pesos: queda fijo cuando pasa a `verified` (`null`
   * en cualquier otro estado). Las tarifas de tu cuenta están en Identidad › Tarifas.
   */
  declare amount: number | null;
  /** La moneda de `amount`: siempre `"ARS"`. */
  declare currency: "ARS";
  /** Fecha ISO 8601 en UTC, como `"2026-11-10T15:04:05Z"`. */
  declare created_at: string;
  /** Cuándo la persona tocó «Empezar» por primera vez. */
  declare started_at: string | null;
  /** Cuándo terminó la captura. */
  declare submitted_at: string | null;
  /** Cuándo llegó a un estado final. */
  declare completed_at: string | null;
  /** Hasta cuándo la persona puede completarla. */
  declare expires_at: string;

  /**
   * Cancela esta verificación (solo `pending` o `in_progress`), con el cliente del que vino (o con
   * la configuración global, si la armaste a mano). Devuelve la verificación actualizada: este
   * objeto no cambia.
   */
  async cancel(options?: PostRequestOptions): Promise<IdentityVerification> {
    const id = verificationIdOf(this);
    return new IdentityVerificationService(resolveRequestor(this)).cancel(id, options);
  }

  // --- Estilo global (IdentityVerification.create/retrieve/list/cancel/files). ---

  /** Crea una verificación con `config.apiKey` (tu clave secreta). */
  static async create(
    params: IdentityVerificationCreateParams,
    options?: PostRequestOptions,
  ): Promise<IdentityVerification> {
    return new IdentityVerificationService(defaultRequestor()).create(params, options);
  }

  static async retrieve(
    verificationId: string,
    options?: RequestOptions,
  ): Promise<IdentityVerification> {
    return new IdentityVerificationService(defaultRequestor()).retrieve(verificationId, options);
  }

  static async list(
    params?: IdentityVerificationListParams,
    options?: RequestOptions,
  ): Promise<ListObject<IdentityVerification>> {
    return new IdentityVerificationService(defaultRequestor()).list(params, options);
  }

  /** Cancela una verificación por id: `IdentityVerification.cancel(verification.id)`. */
  static async cancel(
    verificationId: string,
    options?: PostRequestOptions,
  ): Promise<IdentityVerification> {
    return new IdentityVerificationService(defaultRequestor()).cancel(verificationId, options);
  }

  /** Las imágenes de una verificación, con URLs que vencen a los 5 minutos. */
  static async files(
    verificationId: string,
    options?: RequestOptions,
  ): Promise<IdentityVerificationFiles> {
    return new IdentityVerificationService(defaultRequestor()).files(verificationId, options);
  }
}

export declare namespace IdentityVerification {
  interface DeclineReason {
    /**
     * `face_mismatch`, `registry_not_found`, `registry_data_mismatch`, `registry_unavailable` o
     * `attempts_exhausted` (pueden sumarse).
     */
    code: IdentityVerificationDeclineCode;
    /** Texto para personas, en castellano: puede cambiar. */
    message: string;
  }

  /** Cada control con su resultado. En una `biometric`, `document` y `registry` son `not_applicable`. */
  interface Checks {
    document: DocumentCheck;
    liveness: LivenessCheck;
    face_match: FaceMatchCheck;
    registry: RegistryCheck;
  }

  /** La lectura del DNI: frente y dorso. */
  interface DocumentCheck {
    status: IdentityVerificationCheckStatus;
  }

  /** `confidence`: de 0 a 100; `null` hasta que el control termina. */
  interface LivenessCheck {
    status: IdentityVerificationCheckStatus;
    confidence: number | null;
  }

  /**
   * La selfie contra la foto del DNI (`document`) o contra la verificación de `reference`
   * (`biometric`). `similarity`: de 0 a 100.
   */
  interface FaceMatchCheck {
    status: IdentityVerificationCheckStatus;
    similarity: number | null;
  }

  interface RegistryCheck {
    /**
     * `unavailable`: el registro no respondió en 24 horas; la verificación queda `declined` con
     * `registry_unavailable` y no se cobra.
     */
    status: IdentityVerificationCheckStatus;
    /** Si los datos del documento coinciden con los del registro. */
    data_match: boolean | null;
    /** La cara contra el registro: `hit`, `accepted` o `failed` (pueden sumarse valores). */
    face_match: "hit" | "accepted" | "failed" | null;
  }

  /** Los datos de la persona según el registro. Cualquier campo puede venir en `null`. */
  interface Person {
    first_name: string | null;
    last_name: string | null;
    /** Hoy, siempre `"DNI"`. */
    document_type: string | null;
    document_number: string | null;
    /** `F`, `M` o `X`. */
    sex: string | null;
    /** `YYYY-MM-DD`. */
    birth_date: string | null;
    nationality: string | null;
    /** 11 dígitos, sin guiones. */
    cuil: string | null;
    address: Address;
    document: IdentityDocument;
  }

  /** El domicilio que figura en el registro. */
  interface Address {
    street: string | null;
    number: string | null;
    floor: string | null;
    apartment: string | null;
    city: string | null;
    municipality: string | null;
    province: string | null;
    postal_code: string | null;
    country: string | null;
  }

  /** El ejemplar del DNI. Fechas `YYYY-MM-DD`. */
  interface IdentityDocument {
    copy: string | null;
    issue_date: string | null;
    expiry_date: string | null;
  }
}

// "identity.verification", con el punto: el registro es por el valor entero de `object`.
registerObjectClass("identity.verification", IdentityVerification);
