import { BSDD_BASE, BSDD_LANG } from "./types";
import type { TranslatableItemType } from "./types";

/**
 * Vrátí odkaz na stránku bSDD pro danou položku IFC.
 * @see https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/IfcWall?languagecode=cs-CZ
 */
export function getBsddUrl(
  type: TranslatableItemType,
  officialName: string,
  context?: { entity?: string; psetName?: string }
): string | null {
  if (!officialName?.trim()) return null;
  const enc = encodeURIComponent(officialName.trim());
  switch (type) {
    case "entity":
      return `${BSDD_BASE}/class/${enc}?languagecode=${BSDD_LANG}`;
    case "pset":
    case "qto":
      return `${BSDD_BASE}/class/${enc}?languagecode=${BSDD_LANG}`;
    case "property":
      return `${BSDD_BASE}/prop/${enc}?languagecode=${BSDD_LANG}`;
    case "predefinedType":
      if (context?.entity) {
        const combined = `${context.entity.trim()}${officialName.trim()}`;
        const enc = encodeURIComponent(combined);
        return `${BSDD_BASE}/class/${enc}?languagecode=${BSDD_LANG}`;
      }
      return null;
    default:
      return null;
  }
}
