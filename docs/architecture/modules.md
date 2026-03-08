# Hlavní moduly a závislosti

Tento dokument popisuje hlavní moduly aplikace, jejich odpovědnosti a **závislosti** – kdo co volá, kdo používá schema (useSchema / schemaIndex), kdo bere verzi z projektu (project / ifcSchemaVersion). Při změně odpovědností nebo hranic modulů tento soubor aktualizujte.

---

## Přehled modulů

| Modul | Složka / soubory | Odpovědnost |
|-------|------------------|-------------|
| Projekt a persistence | `src/project/` (types, storage, phases, enumeration, authoring) | Typy Project, ProjectObject, požadavky; load/save/clear z localStorage; výchozí fáze a číselníky; vytvoření prázdného projektu |
| IFC schéma | `src/schema/` (types, SchemaProvider, ifcVersionConfig) | Typy SchemaIndex, entity, Pset/Qto; načítání schema indexu podle verze; konfigurace verzí a URL dokumentace/bSDD |
| Klasifikace | `src/classification/` (types, parser, ifcTree, sampleXlsx, hierarchyView) | Parsování TSV/XLSX, budování stromu z SchemaIndex, mapování kódů na entity/predefinedType |
| UI – hlavní | App.tsx, ObjectDetail.tsx, ClassificationPanel.tsx | Stav aplikace, výběr objektu, strom klasifikace, karta objektu (požadavky, fáze, IDS metadata, export) |
| UI – dialogy | ProjectDetailsDialog, SettingsDialog, IDSExportDialog, ExcelExportDialog, IfcEntitySelectorDialog, MappingEditorDialog, ClassificationSystemsManager, ClassificationManager | Nastavení projektu (včetně IFC verze), export, výběr IFC entit, mapování |
| Import/Export | `src/import/` (ids, excel, codeLists), `src/export/` (ids, excel) | Parsování a mergování IDS/Excel do projektu; export IDS a Excel (verze z projektu) |
| Překlady | `src/translation/` (TranslationContext, TranslationService, translators, getBsddUrl) | Režim OFF/AUTO/BSDD, jazyk z projektu; zobrazení IFC názvů; CZ sloupce jsou v datech projektu |

---

## Závislosti: kdo co volá, kdo používá schema, kdo bere verzi

### useSchema() a schemaIndex

- **useSchema()** se volá **pouze v App.tsx** (ř. cca 72). App drží `schemaIndex` (a `schemaLoading`, `schemaError`) a předává ho dál jako prop.
- **Kdo dostává schemaIndex z App:**
  - **ClassificationPanel** – prop `schemaIndex`; předává ho do ClassificationSystemsManager, ClassificationEditor, IfcEntitySelectorDialog.
  - **ObjectDetail** – prop `schemaIndex`; používá pro entity/PredefinedType, odkazy na dokumentaci (spolu s ifcSchemaVersion).
  - **mergeIdsIntoProject** (import/ids.ts) – volaná z App při importu IDS; dostává `schemaIndex ?? null` jako třetí argument.

- **Komponenty, které schemaIndex používají (dostávají ho přímo nebo od rodiče):**
  - ClassificationPanel, ClassificationEditor, ClassificationSystemsManager, MappingEditorDialog, IfcEntitySelectorDialog – výběr entit a PredefinedType, validace kódů.
  - ObjectDetail – zobrazení entity, Pset, property; odkazy na dokumentaci; export IDS (logika exportu používá i project.ifcSchemaVersion).

### project a ifcSchemaVersion

- **Stav projektu (project)** je v **App.tsx** (useState). App předává `project` a `setProject` do AppInner a do komponent, které potřebují číst nebo měnit projekt.
- **Kde se bere ifcSchemaVersion / project:**
  - **SchemaProvider** – prop `version={normalizeIfcSchemaVersion(project?.ifcSchemaVersion)}` z App; podle verze načítá příslušný schema index.
  - **TranslationContext** – z projektu čte `project?.ifcSchemaVersion`, `project?.translationMode`, `project?.showCzTranslations`, `project?.czTranslationSource`; poskytuje `ifcSchemaVersion` do useTranslation() (používá TranslatedLabel, popř. jiné komponenty).
  - **ProjectDetailsDialog** – čte a zapisuje `project.ifcSchemaVersion`, `project.ifcSchemaVersionDisplay`, `project.ifcDocumentationUrl`; při uložení projektu mění verzi a tím i načtené schema.
  - **ObjectDetail** – používá `normalizeIfcSchemaVersion(project?.ifcSchemaVersion)` pro odkazy (getIfcLexicalDocUrl, getIfcPsetDocUrl, getIfcPropertyDocUrl) a pro `getIdsIfcVersion(...)` (IDS export).
  - **ClassificationManager** – volitelný prop `ifcSchemaVersion`; používá `getIfcClassificationDocUrl(ifcSchemaVersion)`.
  - **export/ids.ts** – při sestavování IDS XML bere `getIdsIfcVersion(normalizeIfcSchemaVersion(project.ifcSchemaVersion))`.
  - **export/excel.ts** – používá `project.ifcSchemaVersionDisplay`, `project.ifcSchemaVersion`, `project.ifcDocumentationUrl`; fallback URL z `getIfcDocumentationBaseUrl(normalizeIfcSchemaVersion(project.ifcSchemaVersion))`.
  - **TranslatedLabel** – přes `useTranslation().ifcSchemaVersion` volá getBsddUrl(..., ifcSchemaVersion).

### Persistence a migrace

- **project/storage.ts:** `loadProjectFromStorage()` načte z localStorage a vrátí projekt (uvnitř volá `ensureProjectPhases(parsed)`). **Nemigruje** – migrace není ve storage.
- **App.tsx:** Při načtení (useEffect) volá `loadProjectFromStorage()`, pak **migrateProject(stored)** a řadu `propagate*` funkcí; výsledek uloží do stavu a případně zpět do storage. Při importu JSON/IDS/Excel také volá `migrateProject(imported)` před mergem nebo nastavením projektu.
- **migrateProject** je definována **v App.tsx** (ř. cca 114); zajišťuje fáze, classification system entries, odstranění .txt z názvů, propojení objektů s primary system entry.

### Import a export

- **Import IDS:** App parsuje soubor (import/ids), pak volá `mergeIdsIntoProject(parsed, project, schemaIndex ?? null)`; merge vyžaduje schemaIndex pro normalizaci kódů a pro buildClassificationFromSchemaFiltered.
- **Import Excel:** import/excel.ts vrací projekt (nebo sloučí do existujícího); při vytváření nového projektu z Excelu může nastavit ifcSchemaVersion/Display (např. na IFC4X3).
- **Export IDS:** export/ids.ts bere celý projekt; ifcVersion v XML z `getIdsIfcVersion(normalizeIfcSchemaVersion(project.ifcSchemaVersion))`.
- **Export Excel:** export/excel.ts bere projekt; metadatový list obsahuje verzi a dokumentační URL z projektu (s fallbackem z ifcVersionConfig).

---

## Klíčové exporty a vstupní body

- **project/types.ts** – Project, ProjectObject, typy požadavků, ClassificationSystem, ClassificationSystemEntry, fáze, číselníky.
- **project/storage.ts** – loadProjectFromStorage, saveProjectToStorage, createEmptyProject, ensureObject, clearProjectFromStorage, clearAllAppDataOnReset, exportProjectFile, importProjectFile.
- **schema/ifcVersionConfig.ts** – SUPPORTED_IFC_VERSIONS, getSchemaIndexUrl, getIdsIfcVersion, getDisplayLabel, getIfcDocumentationBaseUrl, getIfcLexicalDocUrl, getIfcPsetDocUrl, getIfcPropertyDocUrl, getIfcClassificationDocUrl, getBsddBaseUrl, normalizeIfcSchemaVersion.
- **schema/SchemaProvider.tsx** – Provider bere prop `version`; context poskytuje useSchema() → { index, loading, error, reload }.
- **classification/ifcTree.ts** – buildClassificationFromSchema, buildClassificationFromSchemaFiltered; používají SchemaIndex.
- **import/ids.ts** – parseIdsFile, mergeIdsIntoProject(parsed, project, schemaIndex).
- **export/ids.ts** – exportní funkce berou project; ifcVersion z projektu přes ifcVersionConfig.

Při změně hranic modulů (např. přesun migrace do project vrstvy) aktualizujte tento dokument – zejména sekce „Persistence a migrace“ a odkazy na App.tsx.
