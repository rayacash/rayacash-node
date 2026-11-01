// Los vínculos que se resuelven al llamar, nunca al cargar: qué clase le toca a cada valor de
// `object` y cuál es el requestor del estilo global. Así rayaObject.ts no importa los recursos ni
// global.ts, que lo importan a él.

import type { RayaObjectClass } from "./rayaObject.ts";
import type { APIRequestor } from "./requestor.ts";

const classes = new Map<string, RayaObjectClass>();
let defaultRequestorProvider: (() => APIRequestor) | null = null;

/** Cada recurso se registra al cargar (`objectClasses.ts` los carga a todos). */
export function registerObjectClass(objectName: string, cls: RayaObjectClass): void {
  classes.set(objectName, cls);
}

export function getObjectClass(objectName: string): RayaObjectClass | undefined {
  return classes.get(objectName);
}

export function setDefaultRequestorProvider(provider: () => APIRequestor): void {
  defaultRequestorProvider = provider;
}

/** El requestor del estilo global (lo registra global.ts). */
export function defaultRequestor(): APIRequestor {
  if (defaultRequestorProvider === null) {
    throw new Error('rayacash no terminó de cargar: importalo desde el paquete (from "rayacash").');
  }
  return defaultRequestorProvider();
}
