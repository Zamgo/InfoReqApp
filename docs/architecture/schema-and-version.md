# IFC verze a načítání schématu

## Zdroj dat pro schema index – pouze buildingSMART (XSD + XML)

Schema index se **vždy** sestavuje **jen z oficiálních zdrojů buildingSMART** v repozitáři. **Nepoužíváme bSDD JSON** (IFC4 v bSDD není; pro jednotnost a dohledatelnost bereme obě verze stejně z XSD a XML).

### Zdrojové soubory (vše v složce `IFC/`)

| Verze | XSD schéma | Pset/Qto XML (zdroj) |
|-------|------------|----------------------|
| **IFC 4.3** | `IFC_4_3_ADD2/XSD/IFC4X3_ADD2.xsd` | **`IFC_4_3_ADD2/pSet_XSD/`** – jeden adresář s Pset_ i Qto_ XML (buildingSMART IFC 4.3 ADD2). Fallback: `IFC_4x3_Pset_Qto_Def` |
| **IFC4** | `IFC_4_ADD2_TC1/XSD/IFC4.xsd` | **`IFC_4_ADD2_TC1/ZIP/psd/`** (Pset), **`IFC_4_ADD2_TC1/ZIP/qto/`** (Qto) – z oficiálního ZIP release buildingSMART IFC4 ADD2 TC1 |

Odkazy: [buildingSMART IFC 4.3](https://ifc43-docs.standards.buildingsmart.org/), [IFC4 ADD2 TC1](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/).

### Jak build funguje (opakovatelně, dohledatelně)

1. **Seznam entit:** Z XSD se načtou všechny třídy, u kterých platí **isDescendantOf(name, "IfcObjectDefinition", entityBases)**. Zdroj: `xs:complexType` s `xs:extension base` v XSD (parser `parse_ifc_xsd.ts`).
2. **U každé entity:** Atributy a enum **PredefinedType** z XSD; **parent** (přímý předek) a **abstract** (z `xs:element @abstract`) z XSD.
3. **Pset/Qto přiřazení:** Z XML souborů v uvedených adresářích – každý soubor má **ApplicableClasses**; build z nich přiřadí Pset/Qto entitám.
4. **Pořadí ve stromu:** **entityListOrder** = pre-order průchod stromem (kořen IfcObjectDefinition, pak děti podle XSD hierarchie).

Žádný bSDD export, žádný vlastní JSON slovník – vše je odvoditelné z XSD a XML v repozitáři.

### Výstup a použití v aplikaci

- **Výstup buildu:** `public/ifc/schema_index_ifc4x3.json`, `public/ifc/schema_index_ifc4.json` (entities, psets, qtos, dataTypes, entityListOrder).
- **Obsah entit:** Pouze větev **IfcObjectDefinition**; u každé entity `parent`, `abstract` a pořadí z XSD. Při přiřazování IFC entity se používá **EntitySelect** (dropdown s hierarchií, vyhledáváním, abstraktní entity nevybratelné).

## Konfigurace verzí

**Zdroj pravdy:** `src/schema/ifcVersionConfig.ts`

- **Podporované vnitřní verze:** `IFC4`, `IFC4X3` (odpovídají `Project.ifcSchemaVersion`).
- **Mapování:**
  - vnitřní verze → soubor schema indexu: `schema_index_ifc4.json`, `schema_index_ifc4x3.json` v `public/ifc/`
  - vnitřní verze → IDS `ifcVersion`: IFC4 → `IFC4`, IFC4X3 → `IFC4X3_ADD2`
  - vnitřní verze → zobrazovací label (např. „IFC 4.3 ADD2 TC1“)

Funkce: `getSchemaIndexUrl(version)`, `getIdsIfcVersion(version)`, `getDisplayLabel(version)`, `normalizeIfcSchemaVersion(value)`.

## Odkazy na dokumentaci a bSDD podle verze

Všechny odkazy na buildingSMART dokumentaci a bSDD vycházejí z `ifcVersionConfig.ts`, aby při přepnutí IFC verze v nastavení projektu automaticky mířily na správnou verzi:

- **Dokumentace IFC:** `getIfcDocumentationBaseUrl(version)` – base URL (např. pro nastavení projektu).
- **Lexical (entity, Pset/Qto):** `getIfcLexicalDocUrl(version, identifier)` – stránka entity nebo Pset v HTML/lexical.
- **Property:** `getIfcPropertyDocUrl(version, propertyName)` – stránka vlastnosti v HTML/property.
- **Pset (zkratka):** `getIfcPsetDocUrl(version, psetName)` – stejná struktura jako lexical.
- **IfcClassification:** `getIfcClassificationDocUrl(version)` – plná URL (IFC4 vs IFC4.3 mají jiné domény/cesty).
- **bSDD (identifier):** `getBsddBaseUrl(version)` – base pro odkazy na buildingSMART Data Dictionary (`ifc/4.3` vs `ifc/4`). Používá se v `getBsddUrl(..., version)` a v TranslationContext (`ifcSchemaVersion`).

Použití: ObjectDetail, ProjectDetailsDialog, ClassificationManager (prop `ifcSchemaVersion`), export Excel (fallback pro `ifcDocumentationUrl`), TranslatedLabel (přes `useTranslation().ifcSchemaVersion`).

## Načítání schématu v aplikaci

- **SchemaProvider** (`src/schema/SchemaProvider.tsx`) načítá schema index přes `fetch(getSchemaIndexUrl(version))`.
- Prop **`version`** se předává z App: stav projektu (`project`) je v App, takže `version={normalizeIfcSchemaVersion(project?.ifcSchemaVersion)}`. Při změně verze v ProjectDetailsDialog (Údaje projektu) se uloží `ifcSchemaVersion`, projekt se přenačte a SchemaProvider načte odpovídající schema (useEffect závisí na `schemaUrl`).
- API `useSchema()` vrací `{ index, loading, error, reload }` – jeden index pro aktuální verzi.

## Build schema indexu

- **Skript:** `scripts/build_schema_index.ts [4x3|4]`
- **Vstupy (pouze buildingSMART zdroje v repozitáři, žádný bSDD JSON):**
  - **4x3:** `IFC/IFC_4_3_ADD2/XSD/IFC4X3_ADD2.xsd`, **`IFC/IFC_4_3_ADD2/pSet_XSD/`** (Pset + Qto XML; fallback: `IFC_4x3_Pset_Qto_Def`)
  - **4:** `IFC/IFC_4_ADD2_TC1/XSD/IFC4.xsd`, **`IFC/IFC_4_ADD2_TC1/ZIP/psd/`**, **`IFC/IFC_4_ADD2_TC1/ZIP/qto/`**
- **Výstup:** `public/ifc/schema_index_ifc4x3.json`, resp. `schema_index_ifc4.json`

## IDS export

- Hodnota `ifcVersion` v IDS XML se bere z projektu: `getIdsIfcVersion(normalizeIfcSchemaVersion(project.ifcSchemaVersion))`.
- Implementace: `src/export/ids.ts` – při generování každé specifikace se předává tato hodnota.

## Výběr verze v UI

- **ProjectDetailsDialog:** Pole „Verze IFC schématu“ (select) – uživatel může zvolit IFC4 nebo IFC 4.3. Při uložení se nastaví `project.ifcSchemaVersion`, `project.ifcSchemaVersionDisplay` a výchozí `project.ifcDocumentationUrl` z konfigu. Při změně verze v selectu se předvyplní URL dokumentace.
- Po uložení projektu s novou verzí se SchemaProvider přenačte (změna `version` → nová `schemaUrl` → reload) a všechny odkazy v aplikaci (ObjectDetail, ClassificationManager, TranslatedLabel, export) používají novou verzi.

## Citlivá místa

- Změna podporovaných verzí nebo názvů souborů: upravit `ifcVersionConfig.ts` a `scripts/build_schema_index.ts` (BUILD_CONFIG).
- Změna URL struktury buildingSMART (lexical, property, klasifikace, bSDD): upravit konstanty a funkce v `ifcVersionConfig.ts` (DOC_BASE_URL, CLASSIFICATION_DOC_URL, BSDD_BASE_URL).
- Přidání nové IFC verze: přidat záznam do BUILD_CONFIG, do SUPPORTED_IFC_VERSIONS a všechna mapování v ifcVersionConfig (včetně DOC_BASE_URL, CLASSIFICATION_DOC_URL, BSDD_BASE_URL); doplnit zdroje do složky `IFC/`.
