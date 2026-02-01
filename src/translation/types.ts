import type { TranslationMode } from "../project/types";

export type { TranslationMode };

export type TranslatableItemType = "entity" | "predefinedType" | "pset" | "qto" | "property";

export interface TranslationRequest {
  type: TranslatableItemType;
  officialName: string;
  context?: {
    entity?: string;
    psetName?: string;
  };
}

export interface TranslationResult {
  translated: string | null;
  source: "bsdd" | "auto" | null;
}

/** bSDD base URL pro IFC 4.3 */
export const BSDD_BASE = "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3";
export const BSDD_LANG = "cs-CZ";
