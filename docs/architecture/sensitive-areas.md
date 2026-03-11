# Citlivá místa

Místa citlivá na změnu: kde upravovat kód při změně chování, přidání nové IFC verze nebo úpravě persistence. Při změně těchto míst tento soubor doplňte nebo upravte.

---

## 1. SchemaProvider a URL schema indexu

- **Soubor:** [src/schema/SchemaProvider.tsx](src/schema/SchemaProvider.tsx)
- **Co je citlivé:** Načítání schema indexu přes `fetch(getSchemaIndexUrl(version))`. Prop `version` přichází z App (`normalizeIfcSchemaVersion(project?.ifcSchemaVersion)`). Při změně názvů souborů nebo cesty (public/ifc/) je třeba změnit **ifcVersionConfig.ts** (SCHEMA_FILE, getSchemaIndexUrl), ne přímo SchemaProvider – Provider jen volá getSchemaIndexUrl(version).
- **Při změně:** Pokud změníte způsob předávání verze (např. z globálního nastavení místo projektu), upravte App a SchemaProvider; dokumentaci v [schema-and-version.md](schema-and-version.md) a v [data-flows.md](data-flows.md).

---

## 2. ifcVersionConfig.ts

- **Soubor:** [src/schema/ifcVersionConfig.ts](src/schema/ifcVersionConfig.ts)
- **Co je citlivé:** Jediný zdroj pravdy pro:
  - vnitřní verze (IfcSchemaVersion) a názvy souborů schema indexu (SCHEMA_FILE),
  - IDS ifcVersion (IDS_IFC_VERSION),
  - zobrazovací labely (DISPLAY_LABEL),
  - base URL dokumentace (DOC_BASE_URL), cesta HTML (DOC_HTML_PATH), lowercase vs PascalCase pro IFC4 (toDocFileName),
  - bSDD base URL (BSDD_BASE_URL),
  - URL na IfcClassification (CLASSIFICATION_DOC_URL).
- **Při změně:** Změna podporovaných verzí, přidání nové IFC verze, změna URL struktury buildingSMART – upravit příslušné konstanty a funkce zde. Pak zkontrolovat **scripts/build_schema_index.ts** (BUILD_CONFIG a cesty ke zdrojům) a případně **export/ids.ts** (validní IdsIfcVersion).

---

## 3. Build schema indexu (skript a cesty)

- **Soubor:** [scripts/build_schema_index.ts](scripts/build_schema_index.ts)
- **Co je citlivé:** Parametr verze (4x3 / 4), cesty ke zdrojům (IFC_4_3_ADD2, IFC_4_ADD2_TC1, XSD, Pset/Qto ZIP/Def), výstupní cesta a název souboru (public/ifc/schema_index_*.json). BUILD_CONFIG (nebo ekvivalent) mapuje verzi na vstupní složky a soubory.
- **Při změně:** Přidání nové IFC verze – přidat záznam do BUILD_CONFIG, zajistit zdrojové soubory v repozitáři (složka IFC/), spustit build a ověřit výstup. Názvy výstupních souborů musí odpovídat SCHEMA_FILE v ifcVersionConfig.ts.

---

## 4. Export IDS a ifcVersion

- **Soubor:** [src/export/ids.ts](src/export/ids.ts)
- **Co je citlivé:** Hodnota `ifcVersion` v IDS XML se bere z projektu: `getIdsIfcVersion(normalizeIfcSchemaVersion(project.ifcSchemaVersion))`. Žádná hardcoded verze – závisí na ifcVersionConfig.
- **Při změně:** Změna mapování vnitřní verze → IDS řetězec se dělá v ifcVersionConfig (IDS_IFC_VERSION, getIdsIfcVersion). Pokud by IDS spec vyžadoval novou hodnotu atributu, přidat ji do typu IdsIfcVersion a do mapování v ifcVersionConfig.

---

## 5. ObjectDetail a předávání schema / verze

- **Soubor:** [src/ui/components/ObjectDetail.tsx](src/ui/components/ObjectDetail.tsx)
- **Co je citlivé:** Komponenta dostává `schemaIndex` a `project` (z App). Používá schema pro entity, Pset, property a pro logiku související s výběrem; používá `project.ifcSchemaVersion` pro odkazy na dokumentaci (getIfcLexicalDocUrl, getIfcPsetDocUrl, getIfcPropertyDocUrl) a pro IDS náhled (getIdsIfcVersion). ObjectDetail je velmi velký – změny v jedné sekci mohou ovlivnit jiné; při refaktoru je třeba dávat pozor na předávání schemaIndex a verze do podkomponent.
- **Při změně:** Při rozdělování ObjectDetail zachovat jediný zdroj schemaIndex a ifcSchemaVersion (props z App) a předávat je tam, kde jsou potřeba. Aktualizovat [modules.md](modules.md) s novými závislostmi.

---

## 6. Migrace projektu (migrateProject)

- **Soubory:** [src/project/migration.ts](src/project/migration.ts), [src/project/storage.ts](src/project/storage.ts), [src/App.tsx](src/App.tsx)
- **Co je citlivé:**
  - `migrateProject` v `src/project/migration.ts` provádí doménovou migraci starších projektů (fáze, classification systems, odstranění `.txt` z názvů, napojení primárních klasifikací na `classificationSystemEntries`). Běží nad již načteným a základně normalizovaným `Project`.
  - `loadProjectFromStorage` v `project/storage.ts` řeší pouze načtení a **normalizaci IFC verze** (`normalizeIfcSchemaVersion`, `getDisplayLabel`, `getIfcDocumentationBaseUrl`) a `ensureProjectPhases`; samotnou migraci nespouští.
  - `App.tsx` při načítání a importech vždy volá `migrateProject(...)` z project vrstvy před spuštěním `propagate*` funkcí a uložením projektu.
- **Při změně:** Při rozšíření migrace (nová pole v Projectu, změny struktury klasifikací) vždy upravit `migrateProject` v project vrstvě, ne v App. Poté zkontrolovat, že všechna místa, která načítají nebo importují projekt (load from storage, import JSON/IDS/Excel), volají migraci konzistentně; aktualizovat také [modules.md](modules.md) (sekce Persistence a migrace) a [data-flows.md](data-flows.md) (sekce 1 a 4).

---

## 7. Přidání nové IFC verze

Při přidání další verze (např. IFC2X3) je třeba změnit:

1. **ifcVersionConfig.ts:** Rozšířit typ `IfcSchemaVersion` a `IdsIfcVersion`; přidat záznamy do SUPPORTED_IFC_VERSIONS, SCHEMA_FILE, IDS_IFC_VERSION, DISPLAY_LABEL, DOC_BASE_URL, DOC_HTML_PATH, BSDD_BASE_URL, CLASSIFICATION_DOC_URL; případně toDocFileName (lowercase/PascalCase). Přidat výchozí do DEFAULT_IFC_SCHEMA_VERSION jen pokud má být výchozí.
2. **project/types.ts:** Rozšířit `Project.ifcSchemaVersion` o nový literál.
3. **scripts/build_schema_index.ts:** Přidat konfiguraci pro novou verzi (cesty ke zdrojům, výstupní soubor). Zajistit zdroje v složce IFC/.
4. **UI:** ProjectDetailsDialog – přidat možnost výběru nové verze v selectu (výchozí hodnoty z ifcVersionConfig).
5. **Ověření:** Odkazy na dokumentaci, bSDD, export IDS/Excel, načtení schema po přepnutí verze.

Po provedení změn aktualizovat [schema-and-version.md](schema-and-version.md) a tento soubor (odstavec o přidání nové verze).
