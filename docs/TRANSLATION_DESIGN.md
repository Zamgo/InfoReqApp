# Implementace překladů IFC názvů

## Stav

Implementováno (únor 2025).

## Cíl

Zobrazení překladů IFC entit, PredefinedType, Pset, Qto a vlastností pro uživatele, při zachování oficiálních IFC názvů ve všech datech (storage, export IDS, Excel).

## 1. Nastavení projektu

V `Project` přidat nové pole:

```typescript
export type TranslationMode = "OFF" | "AUTO" | "BSDD";

export interface Project {
  // ... stávající pole
  /** Režim překladů IFC názvů pro zobrazení uživateli */
  translationMode?: TranslationMode;  // default: "OFF"
  /** Jazyk překladů (např. cs-CZ, sk-SK) */
  translationLanguage?: string;       // default: "cs-CZ"
}
```

**Význam režimů:**
- **OFF** – Zobrazovat jen oficiální IFC názvy (aktuální chování)
- **AUTO** – Použít lokálně generované překlady (pravidla/heuristiky)
- **BSDD** – Použít překlady z buildingSMART Data Dictionary (bSDD) API

## 2. Architektura překladového systému

### 2.1 Jednotné rozhraní TranslationService

```
src/
  translation/
    types.ts           – TranslationMode, TranslationResult
    TranslationContext.tsx   – React context s režimem + jazykem projektu
    translators/
      AutoTranslator.ts     – heuristika / lokální slovník
      BsddTranslator.ts     – volání bSDD API
      TranslationService.ts – facade, volá správný translator podle režimu
```

### 2.2 Typy

```typescript
export type TranslatableItemType = "entity" | "predefinedType" | "pset" | "qto" | "property";

export interface TranslationRequest {
  type: TranslatableItemType;
  officialName: string;
  context?: {
    entity?: string;        // pro property: nadřazená entita
    psetName?: string;      // pro property: název Pset/Qto
  };
}

export interface TranslationResult {
  translated: string | null;  // null = nepřeloženo
  source: "bsdd" | "auto" | null;
}
```

### 2.3 Zobrazení v UI

- Oficiální název **vždy** viditelný (kvůli jednoznačnosti pro export a schéma).
- Překlad zobrazit jako **doplňkový text** pod oficiálním názvem, např.:

```
IfcWall
Stěna
```

nebo inline:

```
IfcWall (Stěna)
```

- V selectech/dropdown: `option` label = `{officialName}` nebo `{officialName} — {translation}` podle režimu.

## 3. Implementace jednotlivých režimů

### 3.1 Režim OFF

- Žádné volání translatorů.
- Zobrazovat jen `officialName`.

### 3.2 Režim AUTO (automaticky generovaný překlad)

**Strategie:**

1. **Lokální slovník** – JSON soubor `public/ifc/translations_cs.json` s mapováním:
   - entity: `IfcWall` → `Stěna`, `IfcDoor` → `Dveře`, …
   - predefinedType: `SOLIDWALL` → `Pevná stěna`, …
   - pset/qto: `Pset_WallCommon` → `Společné vlastnosti stěny`, …
   - property: `IsExternal` → `Je venkovní`, …

2. **Heuristika** – pokud položka chybí ve slovníku:
   - rozložit camelCase: `IsExternal` → „Is External“
   - odstranit prefix `Ifc`, `Pset_`, `Qto_`
   - volitelně: jednoduchá pravidla (např. `IsExternal` → `Je venkovní` podle vzoru `Is*` → `Je *`)

3. **Fallback** – pokud ani heuristika nedá smysluplný výsledek, vrátit `null` (zobrazit jen oficiální název).

**Slovník** lze generovat:
- ručně pro nejpoužívanější položky,
- exportem z bSDD (jednorázový build script),
- nebo kombinací obou.

### 3.3 Režim BSDD

**bSDD API** ([ dokumentace](https://technical.buildingsmart.org/services/bsdd/using-the-bsdd-api/)):

- Base URL: `https://api.bsdd.buildingsmart.org`
- Dictionary: IFC 4.3 – `buildingsmart/ifc/4.3`
- Parametr jazyka: `languageCode=cs-CZ` (podle [bSDD dokumentace](https://technical.buildingsmart.org/services/bsdd/data-structure/))

**Endpointy:**

| Typ položky | Endpoint | Příklad |
|-------------|----------|---------|
| Entity (Class) | `api/Domain/v4/Classes/{namespaceUri}` nebo Search | `IfcWall` |
| Property (v rámci Class) | Class endpoint vrací Properties s překlady | |
| Pset / Qto | Jako Property sets v Class response | |

**Doporučení:** Pro IFC 4.3 použít `api/Domain/v4/Classes` s `namespaceUri` ve tvaru:
`https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/IfcWall`

Při volání přidat header nebo query parametr pro jazyk – viz Swagger: [buildingSMART Dictionaries API](https://app.swaggerhub.com/apis/buildingSMART/Dictionaries/v1).

**Caching:**

- Všechny bSDD odpovědi cacheovat v paměti (Map) + volitelně `localStorage` / IndexedDB pro persistenci mezi relacemi.
- Klíč cache: `{type}:{officialName}:{language}`.
- TTL: např. 24 hodin (bSDD se často nemění).

**Offline / chyby:**

- Při selhání bSDD API fallback na režim AUTO, pokud je k dispozici lokální slovník.
- Nebo zobrazit jen oficiální název.

## 4. Integrace do UI

### 4.1 Místa zobrazení IFC názvů

| Komponenta | Položky k překladu |
|------------|---------------------|
| `ObjectDetail` | `ifcEntity`, `predefinedType`, `psetName`, `propertyName` |
| `ClassificationPanel` | `ifcEntity` u uzlů |
| `ClassificationEditor` | `ifcEntity`, `predefinedType` |
| `IDSExportDialog` | náhled objektů – `ifcEntity` |
| `ObjectDetail` – property groups | názvy Pset/Qto, názvy vlastností |

### 4.2 Hook pro zobrazení

```typescript
// useTranslatedLabel.ts
function useTranslatedLabel(
  type: TranslatableItemType,
  officialName: string,
  context?: { entity?: string; psetName?: string }
): { displayLabel: string; translated: string | null } {
  const { translationMode, translationLanguage } = useTranslation();
  const [result, setResult] = useState<TranslationResult | null>(null);

  useEffect(() => {
    if (translationMode === "OFF" || !officialName) {
      setResult(null);
      return;
    }
    TranslationService.translate({ type, officialName, context }, translationLanguage)
      .then(setResult)
      .catch(() => setResult(null));
  }, [translationMode, translationLanguage, type, officialName, context]);

  const translated = result?.translated ?? null;
  const displayLabel = translated
    ? `${officialName} (${translated})`
    : officialName;

  return { displayLabel, translated };
}
```

### 4.3 Nastavení v projektu

V `ProjectDetailsDialog` (nebo samostatný „Nastavení zobrazení“) přidat:

- Radio/Select: **Režim překladů**: Žádné / Automatické / bSDD
- Select: **Jazyk**: čeština (cs-CZ), slovenština (sk-SK), …

## 5. Slovník pro režim AUTO

### 5.1 Struktura souboru

`public/ifc/translations_cs.json`:

```json
{
  "entities": {
    "IfcWall": "Stěna",
    "IfcDoor": "Dveře",
    "IfcWindow": "Okno",
    "IfcSlab": "Deska",
    "IfcColumn": "Sloup",
    "IfcBeam": "Trám"
  },
  "predefinedTypes": {
    "SOLIDWALL": "Pevná stěna",
    "PARTITIONING": "Příčka"
  },
  "psets": {
    "Pset_WallCommon": "Společné vlastnosti stěny",
    "Pset_DoorCommon": "Společné vlastnosti dveří"
  },
  "qtos": {
    "Qto_WallBaseQuantities": "Základní množství stěny"
  },
  "properties": {
    "IsExternal": "Je venkovní",
    "LoadBearing": "Nosnost",
    "FireRating": "Požární odolnost"
  }
}
```

### 5.2 Generování slovníku z bSDD (build script)

Skript `scripts/build_translations.ts`:

1. Stáhnout z bSDD API všechny třídy + property sady + vlastnosti pro jazyk `cs-CZ`.
2. Vygenerovat `translations_cs.json`.
3. Spouštět při buildu nebo ručně před releasem.

Tím získáte konzistentní základ pro režim AUTO i fallback pro BSDD.

## 6. Migrace a výchozí hodnoty

- Existující projekty: `translationMode: "OFF"`, `translationLanguage: "cs-CZ"`.
- Žádná změna dat v storage – jen nová volitelná pole.

## 7. Export (IDS, Excel)

- **Vždy** používat oficiální IFC názvy.
- Překlady slouží pouze pro zobrazení v aplikaci.

## 8. Doporučená implementační posloupnost

1. Přidat `translationMode` a `translationLanguage` do `Project` + UI pro nastavení.
2. Vytvořit `TranslationContext` a základní `TranslationService` s režimem OFF.
3. Implementovat `AutoTranslator` + základní slovník `translations_cs.json`.
4. Připojit `useTranslatedLabel` v klíčových UI komponentách.
5. Implementovat `BsddTranslator` s cache.
6. Volitelně: build script pro generování slovníku z bSDD.

## 9. Doplňující poznámky

### bSDD – dostupnost překladů

- bSDD podporuje více jazyků včetně češtiny ([identifier.buildingsmart.org](https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/IfcWall?languagecode=cs-CZ)).
- Konkrétní struktura odpovědi API závisí na verzi – doporučuje se ověřit na Swagger a případně v [bSDD fóru](https://forums.buildingsmart.org/t/proper-way-to-access-translations-of-ifc-entities/4092).

### CUSTOM vlastnosti

- U vlastností se zdrojem `CUSTOM` nelze použít bSDD ani schéma.
- Možnosti: jen AUTO (pokud má smysl heuristika) nebo zobrazit jen oficiální název.

### Výkon

- bSDD: batch requesty tam, kde API umožňuje (např. více tříd najednou).
- Auto: načíst slovník jednou při startu, pak jen lookup.
