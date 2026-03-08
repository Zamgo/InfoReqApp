# InfoReqApp – přehled architektury

## Účel aplikace

InfoReqApp slouží k tvorbě a správě **informačních požadavků** (BIM/IFC): klasifikační systémy, mapování na IFC entity a PredefinedType, požadavky na atributy, vlastnosti (Pset/Qto), vztahy, klasifikace a materiály. Výstupem jsou mj. **IDS** (Information Delivery Specification) a **Excel** šablony.

## Technický stack

- **React 18**, TypeScript, Vite 7
- **Tailwind CSS**, bez routingu (SPA s dialogy)
- **Persistence:** localStorage (projekt + UI preference), export/import JSON, IDS XML, Excel

## Hlavní moduly

| Modul | Složka / soubory | Odpovědnost |
|-------|-------------------|-------------|
| **Projekt a persistence** | `src/project/` (types, storage, phases, enumeration, authoring) | Typy Project, ProjectObject, požadavky; load/save/clear z localStorage; výchozí fáze a číselníky |
| **IFC schéma** | `src/schema/` (types, SchemaProvider, ifcVersionConfig) | Typy SchemaIndex, entity, Pset/Qto; načítání schema indexu podle verze (IFC4 / IFC4X3); konfigurace verzí a mapování na IDS |
| **Klasifikace** | `src/classification/` (types, parser, ifcTree, sampleXlsx) | Parsování TSV/XLSX, budování stromu z IFC schématu, mapování kódů na entity/predefinedType |
| **UI – hlavní** | `App.tsx`, `ObjectDetail.tsx`, `ClassificationPanel.tsx` | Stav aplikace, výběr objektu, strom klasifikace, karta objektu |
| **Import/Export** | `src/import/`, `src/export/` | IDS a Excel import/export; při exportu IDS se používá verze z projektu (ifcVersion) |
| **Překlady** | `src/translation/` | Režim překladů (OFF/AUTO/BSDD), zobrazení IFC názvů; CZ sloupce v požadavcích jsou v datech projektu |

## Zdrojové soubory IFC (build schema indexu)

- **Složka `IFC/`** v kořenu repozitáře:
  - **IFC_4_3_ADD2/** – IFC4x3: XSD, volitelně Pset_Qto_Def
  - **IFC_4_ADD2_TC1/** – IFC4: XSD, ZIP/psd (Pset XML), ZIP/qto (Qto XML)
  - **IFC_4x3.json** – bSDD-style Classes/Properties pro IFC4x3 (build 4x3 z něj čte)
- **Vzorové soubory** (klasifikace TSV, šablona Excel) – složka `Vzorové soubory/` v kořeni. Struktura repozitáře: [structure.md](structure.md)
- Build: `npm run build:schema` (4x3), `npm run build:schema:4` (IFC4), `npm run build:schema:all` (oba)
- Výstup: `public/ifc/schema_index_ifc4x3.json`, `public/ifc/schema_index_ifc4.json`

## Datové toky (stručně)

1. **Načtení:** localStorage → projekt; podle `project.ifcSchemaVersion` SchemaProvider načítá odpovídající schema (IFC4 nebo IFC4X3).
2. **Klasifikace a entita:** Strom klasifikace a výběr IFC entity/PredefinedType používají `useSchema()` (jeden index).
3. **IDS export:** `project.ifcSchemaVersion` → `getIdsIfcVersion()` → hodnota `ifcVersion` v XML.

Více o verzích a schématu: [schema-and-version.md](schema-and-version.md).
