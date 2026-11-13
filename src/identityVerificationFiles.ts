import { RayaObject } from "./rayaObject.ts";
import { registerObjectClass } from "./registry.ts";

/**
 * Las imágenes de una verificación (`client.identity.verifications.files(id)`): el frente y el
 * dorso del DNI y la selfie de la prueba de vida, cada una con una URL firmada que vence a los 5
 * minutos.
 *
 * Bajá cada imagen enseguida, con tu propio cliente HTTP, y no guardes las URLs. La que esa
 * verificación no tiene (`front` y `back` en una `biometric`, o todas si ya no las guardamos) viene
 * en `null`. Son datos personales: no las loguees.
 */
export class IdentityVerificationFiles extends RayaObject {
  static override readonly OBJECT_NAME = "identity.verification_files";

  declare object: "identity.verification_files";
  /** El frente del DNI. */
  declare front: IdentityVerificationFiles.File | null;
  /** El dorso del DNI. */
  declare back: IdentityVerificationFiles.File | null;
  /** La selfie de la prueba de vida. */
  declare selfie: IdentityVerificationFiles.File | null;
}

export declare namespace IdentityVerificationFiles {
  interface File {
    /** URL firmada de la imagen (JPEG). */
    url: string;
    /** Hasta cuándo sirve la URL (ISO 8601 en UTC). */
    expires_at: string;
  }
}

// "identity.verification_files", con el punto: el registro es por el valor entero de `object`.
registerObjectClass("identity.verification_files", IdentityVerificationFiles);
