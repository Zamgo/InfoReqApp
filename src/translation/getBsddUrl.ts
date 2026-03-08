import { BSDD_LANG } from "./types";
import type { TranslatableItemType } from "./types";
import { getBsddBaseUrl, normalizeIfcSchemaVersion } from "../schema/ifcVersionConfig";

/**
 * Vrátí odkaz na stránku bSDD pro danou položku IFC.
 * @param version IFC verze projektu – určuje bSDD slovník (ifc/4.3 vs ifc/4). Není-li předána, použije se IFC4X3.
 */
export function getBsddUrl(
  type: TranslatableItemType,
  officialName: string,
  context?: { entity?: string; psetName?: string },
  version?: string | null
): string | null {
  if (!officialName?.trim()) return null;
  const base = getBsddBaseUrl(normalizeIfcSchemaVersion(version ?? undefined));
  const enc = encodeURIComponent(officialName.trim());
  switch (type) {
    case "entity":
      return `${base}/class/${enc}?languagecode=${BSDD_LANG}`;
    case "pset":
    case "qto":
      return `${base}/class/${enc}?languagecode=${BSDD_LANG}`;
    case "property":
      return `${base}/prop/${enc}?languagecode=${BSDD_LANG}`;
    case "predefinedType":
      if (context?.entity) {
        const combined = `${context.entity.trim()}${officialName.trim()}`;
        const encCombined = encodeURIComponent(combined);
        return `${base}/class/${encCombined}?languagecode=${BSDD_LANG}`;
      }
      return null;
    default:
      return null;
  }
}
