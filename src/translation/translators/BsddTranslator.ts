/**
 * Překlad z buildingSMART Data Dictionary (bSDD) pomocí oficiálního REST API.
 * @see https://app.swaggerhub.com/apis/buildingSMART/Dictionaries/v1
 * @see https://technical.buildingsmart.org/services/bsdd/using-the-bsdd-api/
 */
import { BSDD_BASE, BSDD_LANG } from "../types";
import type { TranslatableItemType, TranslationResult } from "../types";

const CACHE = new Map<string, TranslationResult>();
const PENDING = new Map<string, Promise<TranslationResult>>();

const API_BASE = "https://api.bsdd.buildingsmart.org";
const USER_AGENT = "InfoReqApp/1.0";

function cacheKey(type: TranslatableItemType, name: string, psetName?: string, entity?: string): string {
  if (type === "property" && psetName) return `${type}:${psetName}:${name}`;
  if (type === "predefinedType" && entity) return `${type}:${entity}:${name}`;
  return `${type}:${name}`;
}

/** Vrátí plnou URI položky pro bSDD API */
function getClassUri(type: TranslatableItemType, officialName: string): string | null {
  const enc = encodeURIComponent(officialName.trim());
  switch (type) {
    case "entity":
      return `${BSDD_BASE}/class/${enc}`;
    case "pset":
      return `${BSDD_BASE}/propertyset/${enc}`;
    case "qto":
      return `${BSDD_BASE}/quantityset/${enc}`;
    case "property":
    case "predefinedType":
      return null;
    default:
      return null;
  }
}

interface ClassPropertyItem {
  propertyCode?: string;
  name?: string;
}

/** GET /api/Class/v1 - vrací ClassContract.v1 s polem 'name' (přeložený název) */
async function fetchClass(uri: string): Promise<TranslationResult> {
  try {
    const url = `${API_BASE}/api/Class/v1?Uri=${encodeURIComponent(uri)}&languageCode=${BSDD_LANG}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });
    if (!res.ok) return { translated: null, source: "bsdd" };
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.toLowerCase().includes("application/json")) {
      return { translated: null, source: "bsdd" };
    }
    const data = (await res.json()) as { name?: string };
    const name = typeof data?.name === "string" && data.name.trim() ? data.name.trim() : null;
    return { translated: name, source: "bsdd" };
  } catch {
    return { translated: null, source: "bsdd" };
  }
}

/** GET /api/Class/v1 s IncludeClassProperties - pro překlad vlastností v Pset/Qto */
async function fetchPropertyFromPsetOrQto(
  psetOrQtoUri: string,
  propertyName: string
): Promise<TranslationResult> {
  try {
    const url = `${API_BASE}/api/Class/v1?Uri=${encodeURIComponent(psetOrQtoUri)}&IncludeClassProperties=true&languageCode=${BSDD_LANG}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });
    if (!res.ok) return { translated: null, source: "bsdd" };
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.toLowerCase().includes("application/json")) {
      return { translated: null, source: "bsdd" };
    }
    const data = (await res.json()) as { classProperties?: ClassPropertyItem[] };
    const props = data?.classProperties;
    if (!Array.isArray(props)) return { translated: null, source: "bsdd" };
    const norm = propertyName.trim();
    const found = props.find(
      (p) =>
        (p.propertyCode?.trim() ?? "") === norm ||
        (p.name?.trim() ?? "").toLowerCase() === norm.toLowerCase()
    );
    const translated = found?.name?.trim() ?? null;
    return { translated, source: "bsdd" };
  } catch {
    return { translated: null, source: "bsdd" };
  }
}

/** GET /api/Property/v5 - pro vlastnosti (Property má vlastní endpoint) */
async function fetchProperty(uri: string): Promise<TranslationResult> {
  try {
    const url = `${API_BASE}/api/Property/v5?uri=${encodeURIComponent(uri)}&languageCode=${BSDD_LANG}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });
    if (!res.ok) return { translated: null, source: "bsdd" };
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.toLowerCase().includes("application/json")) {
      return { translated: null, source: "bsdd" };
    }
    const data = (await res.json()) as { name?: string };
    const name = typeof data?.name === "string" && data.name.trim() ? data.name.trim() : null;
    return { translated: name, source: "bsdd" };
  } catch {
    return { translated: null, source: "bsdd" };
  }
}

/** URI vlastnosti v IFC – fallback při chybějícím psetName */
function getPropertyUri(propertyName: string): string | null {
  if (!propertyName?.trim()) return null;
  const enc = encodeURIComponent(propertyName.trim());
  return `${BSDD_BASE}/prop/${enc}`;
}

/** URI predefined type – entity + predefinedType bez oddělovače (např. IfcSlabAPPROACH_SLAB) */
function getPredefinedTypeUri(entity: string, predefinedType: string): string | null {
  if (!entity?.trim() || !predefinedType?.trim()) return null;
  const combined = `${entity.trim()}${predefinedType.trim()}`;
  return `${BSDD_BASE}/class/${encodeURIComponent(combined)}`;
}

/** URI Pset nebo Qto podle názvu */
function getPsetOrQtoUri(psetName: string): string | null {
  if (!psetName?.trim()) return null;
  const enc = encodeURIComponent(psetName.trim());
  if (psetName.startsWith("Qto_")) {
    return `${BSDD_BASE}/quantityset/${enc}`;
  }
  return `${BSDD_BASE}/propertyset/${enc}`;
}

export async function translateBsdd(
  type: TranslatableItemType,
  officialName: string,
  context?: { entity?: string; psetName?: string }
): Promise<TranslationResult> {
  if (!officialName?.trim()) return { translated: null, source: null };

  const psetName = context?.psetName;
  const entity = context?.entity;
  const key = cacheKey(type, officialName, psetName, entity);
  const cached = CACHE.get(key);
  if (cached !== undefined) return cached;

  let prom: Promise<TranslationResult>;

  switch (type) {
    case "entity":
    case "pset":
    case "qto": {
      const uri = getClassUri(type, officialName);
      if (!uri) {
        prom = Promise.resolve({ translated: null, source: null });
      } else {
        prom = fetchClass(uri);
      }
      break;
    }
    case "property": {
      // Preferovat přímý Property API – vrací správný překlad (např. NetVolume → Čistý objem).
      // Kontext Pset/Qto může v bSDD vracet chybná data u některých sad.
      const propUri = getPropertyUri(officialName);
      if (propUri) {
        prom = fetchProperty(propUri).then((r) => {
          if (r.translated) return r;
          // Fallback na Pset/Qto kontext, pokud přímý překlad není k dispozici
          if (psetName) {
            const psetUri = getPsetOrQtoUri(psetName);
            if (psetUri) return fetchPropertyFromPsetOrQto(psetUri, officialName);
          }
          return r;
        });
      } else if (psetName) {
        const psetUri = getPsetOrQtoUri(psetName);
        prom = psetUri ? fetchPropertyFromPsetOrQto(psetUri, officialName) : Promise.resolve({ translated: null, source: "bsdd" as const });
      } else {
        prom = Promise.resolve({ translated: null, source: null });
      }
      break;
    }
    case "predefinedType": {
      const uri = entity ? getPredefinedTypeUri(entity, officialName) : null;
      if (uri) {
        prom = fetchClass(uri);
      } else {
        prom = Promise.resolve({ translated: null, source: null });
      }
      break;
    }
    default:
      prom = Promise.resolve({ translated: null, source: null });
  }

  prom = prom.then((r) => {
    CACHE.set(key, r);
    PENDING.delete(key);
    return r;
  });
  PENDING.set(key, prom);
  return prom;
}
