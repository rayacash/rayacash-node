// Listas paginadas por cursor (`{ object: "list", data, has_more, next_cursor }`).

import { boundRequestor, construct, RayaObject, resolveRequestor } from "./rayaObject.ts";
import { registerObjectClass } from "./registry.ts";

interface RetrieveContext {
  path: string;
  query: Record<string, string>;
  options: Record<string, unknown>;
}

const CONTEXT = new WeakMap<ListObject<unknown>, RetrieveContext>();

/** Recuerda cómo se pidió la lista, para pedir las páginas siguientes con los mismos filtros. */
export function setRetrieveContext(
  page: ListObject<unknown>,
  path: string,
  query: Record<string, string>,
  options: Record<string, unknown>,
): void {
  CONTEXT.set(page, { path, query: { ...query }, options: { ...options } });
}

/**
 * Una página de resultados, del más nuevo al más viejo.
 *
 * `for (const item of page)` recorre `data` (solo esta página). Para recorrer todas, usá
 * `for await (const item of page.autoPagingIter())`: pide las páginas siguientes con los mismos
 * filtros y opciones.
 */
export class ListObject<T = unknown> extends RayaObject {
  static override readonly OBJECT_NAME = "list";

  declare object: "list";
  declare data: T[];
  declare has_more: boolean;
  declare next_cursor: string | null;

  [Symbol.iterator](): Iterator<T> {
    return this.#items()[Symbol.iterator]();
  }

  #items(): T[] {
    const data: unknown = this.data;
    return Array.isArray(data) ? (data as T[]) : [];
  }

  #nextQuery(): Record<string, string> | null {
    const cursor: unknown = this.next_cursor;
    if (!this.has_more || typeof cursor !== "string" || !cursor) return null;
    const context = CONTEXT.get(this);
    if (context === undefined) {
      throw new Error(
        "Esta lista no sabe cómo pedir la página siguiente (no vino de un método list): pedila " +
          "vos con { cursor: next_cursor }.",
      );
    }
    return { ...context.query, cursor };
  }

  #emptyPage(): ListObject<T> {
    const page = construct(
      ListObject,
      { object: "list", data: [], has_more: false, next_cursor: null },
      boundRequestor(this),
      null,
    ) as ListObject<T>;
    const context = CONTEXT.get(this);
    if (context !== undefined) CONTEXT.set(page, context);
    return page;
  }

  /** La página siguiente. Si no hay más, una lista vacía (sin hacer la request). */
  async nextPage(): Promise<ListObject<T>> {
    const query = this.#nextQuery();
    const context = CONTEXT.get(this);
    if (query === null || context === undefined) return this.#emptyPage();
    const page = await resolveRequestor(this).requestList(context.path, query, context.options);
    return page as ListObject<T>;
  }

  /** Todos los elementos, página por página: `for await (const item of page.autoPagingIter())`. */
  async *autoPagingIter(): AsyncGenerator<T, void, undefined> {
    let page: ListObject<T> = this;
    for (;;) {
      yield* page.#items();
      if (page.#nextQuery() === null) return;
      page = await page.nextPage();
    }
  }
}

registerObjectClass("list", ListObject);
