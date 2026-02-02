/**
 * Volání externí překladové služby MyMemory API pro IFC termíny.
 * Používá se v režimu AUTO pro položky chybějící v lokálním slovníku.
 * Cache v paměti + localStorage (30 dní) pro persistenci mezi relacemi.
 * Limity MyMemory: ~5000 znaků/den anonymně, ~50000 znaků/den s parametrem de=email.
 * Do budoucna: možnost vlastního slovníku pro přepsání MT výsledků.
 */
const MYMEMORY_BASE = "https://api.mymemory.translated.net/get";
const CACHE_KEY = "InfoReqApp_mt_translations";
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dní

interface CacheEntry {
  translated: string;
  ts: number;
}

const memoryCache = new Map<string, CacheEntry>();

function loadPersistedCache(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, { translated: string; ts: number }>;
    const cutoff = Date.now() - CACHE_MAX_AGE_MS;
    for (const [k, v] of Object.entries(parsed)) {
      if (v.ts > cutoff) memoryCache.set(k, v);
    }
  } catch {
    // ignore
  }
}

function saveToPersistedCache(): void {
  try {
    const obj: Record<string, CacheEntry> = {};
    const cutoff = Date.now() - CACHE_MAX_AGE_MS;
    for (const [k, v] of memoryCache.entries()) {
      if (v.ts > cutoff) obj[k] = v;
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

let persistedLoaded = false;

/**
 * Převede IFC název na čitelný anglický text pro předání do MT API.
 * Např: IsExternal → "Is External", Pset_WallCommon → "Wall Common", SOLIDWALL → "Solid Wall"
 */
export function preprocessForMt(text: string, type: "entity" | "predefinedType" | "pset" | "qto" | "property"): string {
  let s = text.trim();
  if (!s) return "";

  // Odstranit prefixy
  s = s.replace(/^Ifc/, "").replace(/^Pset_/, "").replace(/^Qto_/, "");

  // U predefinedType: SOLID_WALL → "Solid Wall", SOLIDWALL → "Solid Wall" (rozdělit podtržítky, title-case)
  if (type === "predefinedType" && /^[A-Z_]+$/.test(s)) {
    return s
      .split(/[_]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(" ");
  }

  // camelCase → "Camel Case"
  const withSpaces = s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return withSpaces.replace(/_/g, " ").trim();
}

/**
 * Zavolá MyMemory API pro překlad textu z angličtiny do cílového jazyka.
 */
export async function translateViaApi(
  textToTranslate: string,
  targetLang: string = "cs"
): Promise<string | null> {
  if (!textToTranslate?.trim()) return null;

  const normalizedTarget = targetLang.split("-")[0].toLowerCase();
  const cacheKey = `en|${normalizedTarget}|${textToTranslate}`;

  if (!persistedLoaded) {
    loadPersistedCache();
    persistedLoaded = true;
  }

  const cached = memoryCache.get(cacheKey);
  if (cached) return cached.translated;

  const params = new URLSearchParams({
    q: textToTranslate,
    langpair: `en|${normalizedTarget}`,
  });
  const apiUrl = `${MYMEMORY_BASE}?${params.toString()}`;

  const tryFetch = async (url: string): Promise<string | null> => {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as { responseData?: { translatedText?: string }; responseStatus?: number };
    return json?.responseData?.translatedText?.trim() ?? null;
  };

  try {
    let translated = await tryFetch(apiUrl);
    if (!translated) {
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`;
      translated = await tryFetch(proxyUrl);
    }
    if (translated) {
      memoryCache.set(cacheKey, { translated, ts: Date.now() });
      saveToPersistedCache();
      return translated;
    }
  } catch {
    // síťová chyba nebo CORS – zkusit CORS proxy
    try {
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`;
      const translated = await tryFetch(proxyUrl);
      if (translated) {
        memoryCache.set(cacheKey, { translated, ts: Date.now() });
        saveToPersistedCache();
        return translated;
      }
    } catch {
      // ignore
    }
  }
  return null;
}
