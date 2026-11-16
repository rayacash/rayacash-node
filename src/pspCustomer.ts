import type { ListObject } from "./listObject.ts";
import type { PspCustomerBalance } from "./pspCustomerBalance.ts";
import {
  type PspCustomerCreateParams,
  type PspCustomerListParams,
  PspCustomerService,
} from "./pspService.ts";
import { RayaObject, resolveRequestor } from "./rayaObject.ts";
import { defaultRequestor, registerObjectClass } from "./registry.ts";
import type { PostRequestOptions, RequestOptions } from "./requestOptions.ts";

/**
 * `verifying` (validamos la identidad o lo estamos revisando), `pending` (creamos el CVU o le
 * asignamos el alias), `active`, `blocked` (sigue recibiendo, no envía), `closed` (CVU dado de
 * baja), `failed` (no pudimos crear el CVU) o `rejected` (no pudimos validarlo o aprobarlo).
 */
export type PspCustomerStatus =
  | "verifying"
  | "pending"
  | "active"
  | "blocked"
  | "closed"
  | "failed"
  | "rejected";
/** `F`: persona humana. `J`: persona jurídica. */
export type PspCustomerPersonType = "F" | "J";
/** Quién bloqueó al cliente: vos (`account`) o Raya (`raya`, que gana si bloquearon los dos). */
export type PspCustomerBlockedBy = "account" | "raya";
/** `active`, `closing` (la baja en el banco sigue en curso) o `closed`. */
export type PspCvuStatus = "active" | "closing" | "closed";
/** Por qué no pudimos crear o validar a un cliente (`decline_reason.code`). */
export type PspCustomerDeclineCode =
  | "image_unavailable"
  | "image_invalid"
  | "document_unreadable"
  | "document_sides_mismatch"
  | "document_mismatch"
  | "identity_not_verified"
  | "name_mismatch"
  | "selfie_invalid"
  | "face_mismatch"
  | "verification_unavailable"
  | "not_approved"
  | "bank_rejected"
  | "psp_disabled";

function customerIdOf(customer: PspCustomer, action: string): string {
  const id: unknown = customer.id;
  if (typeof id !== "string" || !id) {
    throw new RangeError(`Este PspCustomer no tiene id: no se puede ${action}.`);
  }
  return id;
}

/**
 * Un cliente de Raya PSP: una persona humana o jurídica con un CVU (y un alias) a su nombre, que
 * recibe transferencias de cualquier banco o billetera y en cuyo nombre transferís.
 *
 * Su saldo (`balance`) es parte del tuyo: sube con lo que recibe y baja con lo que transferís en su
 * nombre. Es el mismo objeto que llega en los webhooks `psp.customer.*`.
 */
export class PspCustomer extends RayaObject {
  static override readonly OBJECT_NAME = "psp.customer";
  static override readonly PLAIN_FIELDS: ReadonlySet<string> = new Set(["metadata"]);

  /** `pspc_…` */
  declare id: string;
  declare object: "psp.customer";
  /**
   * `verifying`, `pending`, `active`, `blocked`, `closed`, `failed` o `rejected` (pueden sumarse
   * valores). Un cliente `blocked` sigue recibiendo transferencias, pero no podés transferir en su
   * nombre.
   */
  declare status: PspCustomerStatus;
  /**
   * `F` (persona humana) o `J` (persona jurídica). Si lo creaste con `identity_verification`,
   * siempre `F`.
   */
  declare person_type: PspCustomerPersonType;
  /**
   * Su CUIL o CUIT: 11 dígitos, sin guiones. Si lo creaste con `identity_verification`, el CUIL
   * de la verificación.
   */
  declare tax_id: string;
  /**
   * Su nombre y apellido o su razón social: el `name` que mandaste o, si lo creaste con
   * `identity_verification`, su nombre y apellido como figuran en la verificación (los del
   * Registro Nacional de las Personas).
   */
  declare name: string;
  /** Su saldo, en pesos: lo que recibió menos lo que transferiste en su nombre. */
  declare balance: number;
  /** Siempre `"ARS"`. */
  declare currency: "ARS";
  /**
   * Su CVU: el activo o, si no tiene, el último que tuvo (`closing` o `closed`); `null` si nunca
   * tuvo uno.
   */
  declare cvu: PspCustomer.Cvu | null;
  /** Quién lo bloqueó: `account` (vos) o `raya`. `null` salvo con `status: "blocked"`. */
  declare blocked_by: PspCustomerBlockedBy | null;
  /** El `id` (`idv_…`) de la verificación de Identidad con la que lo creaste, o `null`. */
  declare identity_verification: string | null;
  /**
   * Por qué no pudimos crearlo o validarlo; solo con `status` en `rejected` o `failed`. Decidí con
   * `code`, no con `message`.
   */
  declare decline_reason: PspCustomer.DeclineReason | null;
  /** Tu identificador del cliente. */
  declare external_reference: string | null;
  /** Tus pares clave-valor (un objeto común). `{}` si no mandaste ninguno. */
  declare metadata: Record<string, string>;
  /** Fecha ISO 8601 en UTC, como `"2026-10-24T13:05:09Z"`. */
  declare created_at: string;

  /**
   * Bloquea a este cliente, con el cliente del SDK del que vino (o con la configuración global, si
   * lo armaste a mano). Devuelve el cliente actualizado: este objeto no cambia.
   */
  async block(options?: PostRequestOptions): Promise<PspCustomer> {
    const id = customerIdOf(this, "bloquear");
    return new PspCustomerService(resolveRequestor(this)).block(id, options);
  }

  /** Levanta tu bloqueo de este cliente. Devuelve el cliente actualizado: este objeto no cambia. */
  async unblock(options?: PostRequestOptions): Promise<PspCustomer> {
    const id = customerIdOf(this, "desbloquear");
    return new PspCustomerService(resolveRequestor(this)).unblock(id, options);
  }

  /** Da de baja el CVU de este cliente. Devuelve el cliente actualizado: este objeto no cambia. */
  async close(options?: PostRequestOptions): Promise<PspCustomer> {
    const id = customerIdOf(this, "dar de baja");
    return new PspCustomerService(resolveRequestor(this)).close(id, options);
  }

  /** Le da un CVU nuevo a este cliente. Devuelve el cliente actualizado: este objeto no cambia. */
  async recreate(options?: PostRequestOptions): Promise<PspCustomer> {
    const id = customerIdOf(this, "recrear");
    return new PspCustomerService(resolveRequestor(this)).recreate(id, options);
  }

  // --- Estilo global (PspCustomer.create/retrieve/list/…); ver PspCustomerService. ---

  /**
   * Crea un cliente con `config.apiKey` (tu clave secreta), de una de las tres formas de
   * `client.psp.customers.create`: solo `identity_verification`, una persona humana con las fotos
   * o una persona jurídica.
   */
  static async create(
    params: PspCustomerCreateParams,
    options?: PostRequestOptions,
  ): Promise<PspCustomer> {
    return new PspCustomerService(defaultRequestor()).create(params, options);
  }

  static async retrieve(customerId: string, options?: RequestOptions): Promise<PspCustomer> {
    return new PspCustomerService(defaultRequestor()).retrieve(customerId, options);
  }

  static async list(
    params?: PspCustomerListParams,
    options?: RequestOptions,
  ): Promise<ListObject<PspCustomer>> {
    return new PspCustomerService(defaultRequestor()).list(params, options);
  }

  /** El saldo de un cliente: `PspCustomer.retrieveBalance(customer.id)`. */
  static async retrieveBalance(
    customerId: string,
    options?: RequestOptions,
  ): Promise<PspCustomerBalance> {
    return new PspCustomerService(defaultRequestor()).retrieveBalance(customerId, options);
  }

  /** Bloquea a un cliente por id: `PspCustomer.block(customer.id)`. */
  static async block(customerId: string, options?: PostRequestOptions): Promise<PspCustomer> {
    return new PspCustomerService(defaultRequestor()).block(customerId, options);
  }

  static async unblock(customerId: string, options?: PostRequestOptions): Promise<PspCustomer> {
    return new PspCustomerService(defaultRequestor()).unblock(customerId, options);
  }

  static async close(customerId: string, options?: PostRequestOptions): Promise<PspCustomer> {
    return new PspCustomerService(defaultRequestor()).close(customerId, options);
  }

  static async recreate(customerId: string, options?: PostRequestOptions): Promise<PspCustomer> {
    return new PspCustomerService(defaultRequestor()).recreate(customerId, options);
  }
}

export declare namespace PspCustomer {
  /** El CVU del cliente. */
  interface Cvu {
    /** El CVU: 22 dígitos. */
    account: string;
    /** Su alias. Puede ser `null` mientras se lo asignamos. */
    alias: string | null;
    /** El titular registrado (hasta 40 caracteres, en mayúsculas y sin acentos). */
    holder_name: string;
    /** `active`, `closing` (la baja en el banco sigue en curso) o `closed`. */
    status: PspCvuStatus;
    /** Cuándo quedó activo (ISO 8601 en UTC). */
    created_at: string;
    /** Cuándo lo dimos de baja; `null` si sigue activo. */
    closed_at: string | null;
  }

  interface DeclineReason {
    /**
     * Con `rejected`: `image_unavailable`, `image_invalid`, `document_unreadable`,
     * `document_sides_mismatch`, `document_mismatch`, `identity_not_verified`, `name_mismatch`,
     * `selfie_invalid`, `face_mismatch`, `verification_unavailable` o `not_approved`. Con
     * `failed`: `bank_rejected` o `psp_disabled` (pueden sumarse).
     */
    code: PspCustomerDeclineCode;
    /** Texto para personas, en castellano: puede cambiar. */
    message: string;
  }
}

// "psp.customer", con el punto: el registro es por el valor entero de `object`.
registerObjectClass("psp.customer", PspCustomer);
