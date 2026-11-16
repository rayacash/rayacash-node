import { RayaObject } from "./rayaObject.ts";
import { registerObjectClass } from "./registry.ts";

/** `open` (falta la documentación), `submitted` (la mandaste) o `closed` (lo cerramos). */
export type PspDocumentRequestStatus = "open" | "submitted" | "closed";

/**
 * Un pedido de documentación sobre un cliente de Raya PSP: llega en los webhooks
 * `psp.document_request.created` y `psp.document_request.closed`.
 *
 * La documentación se sube desde Raya PSP, en el dashboard (el detalle del cliente): la API no
 * tiene un endpoint para esto.
 */
export class PspDocumentRequest extends RayaObject {
  static override readonly OBJECT_NAME = "psp.document_request";

  /** `pspd_…` */
  declare id: string;
  declare object: "psp.document_request";
  /** El `id` del cliente (`pspc_…`). */
  declare customer: string;
  /** `open`, `submitted` o `closed` (pueden sumarse valores). */
  declare status: PspDocumentRequestStatus;
  /** De qué se trata, en pocas palabras. */
  declare subject: string;
  /** Qué te pedimos, escrito para tu empresa. */
  declare message: string;
  /** Fecha ISO 8601 en UTC, como `"2026-10-24T18:40:00Z"`. */
  declare created_at: string;
  /** Cuándo mandaste la documentación. */
  declare submitted_at: string | null;
  /** Cuándo cerramos el pedido. */
  declare closed_at: string | null;
}

// "psp.document_request", con el punto: el registro es por el valor entero de `object`.
registerObjectClass("psp.document_request", PspDocumentRequest);
