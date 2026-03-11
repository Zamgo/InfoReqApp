/**
 * Návrh entity a API pro ukládání a načítání uložených filtrů (budoucí implementace).
 * Filtr a řazení jsou serializovatelné (RequestFilter, RequestSort) a lze je ukládat pod názvem.
 */

import type { RequestFilter, RequestSort } from "./requestFilterModel";

/** Rozsah viditelnosti uloženého filtru. */
export type SavedFilterScope = "private" | "team" | "global";

/**
 * Uložený filtr – entita pro persistenci (např. v DB nebo v projektu).
 * Používá stabilní identifikátory polí (FilterableFieldId), ne názvy sloupců DB.
 */
export interface SavedFilter {
  /** Unikátní id (UUID nebo lokální id v rámci projektu). */
  id: string;
  /** Název zobrazený v UI (např. "Otevřené vlastnosti projektu X"). */
  name: string;
  /** Volitelný popis. */
  description?: string;
  /** Strom podmínek filtru – null = zobrazit vše. */
  filterJson: RequestFilter;
  /** Výchozí řazení při aplikaci tohoto pohledu. */
  sortConfig: RequestSort;
  /** Kdo filtr vytvořil (userId nebo teamId pro scope). */
  ownerId: string;
  /** Rozsah: privátní / týmový / globální. */
  scope: SavedFilterScope;
  /** Datum vytvoření (ISO string). */
  createdAt: string;
  /** Datum poslední úpravy (ISO string). */
  updatedAt: string;
  /** Volitelně: datum posledního použití pro řazení v seznamu. */
  lastUsedAt?: string;
}

/**
 * API kontrakt pro budoucí implementaci (CRUD uložených filtrů).
 * V aktuální verzi bez backendu lze ukládat do projektu (project.savedFilters) nebo localStorage.
 */
export interface SavedFilterApi {
  list(scope?: SavedFilterScope): Promise<SavedFilter[]>;
  get(id: string): Promise<SavedFilter | null>;
  create(draft: Omit<SavedFilter, "id" | "createdAt" | "updatedAt">): Promise<SavedFilter>;
  update(
    id: string,
    patch: Partial<
      Pick<SavedFilter, "name" | "description" | "filterJson" | "sortConfig" | "updatedAt">
    >,
  ): Promise<SavedFilter>;
  remove(id: string): Promise<void>;
  /** Označit filtr jako právě použitý (např. lastUsedAt). */
  markUsed(id: string): Promise<void>;
}

/**
 * Rozšíření projektu o uložené filtry (volitelné, pro budoucí verzi).
 * Pokud se použije localStorage, klíč např. "infoReqApp_savedFilters".
 */
export interface ProjectWithSavedFilters {
  savedFilters?: SavedFilter[];
}
