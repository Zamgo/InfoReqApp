import type { ClassificationData, ClassificationNode, ClassificationSystem } from "../classification/types";

export type PredefinedMode = "NONE" | "ENUM" | "USERDEFINED";

export interface PredefinedTypeSelection {
  mode: PredefinedMode;
  value?: string;
}

export interface Phase {
  id: string;
  code: string;
  name: string;
  description?: string;
}

export interface RequirementBase {
  id: string;
  extensions: Record<string, unknown>;
  phases?: string[];
}

export interface AttributeRequirement extends RequirementBase {
  attribute: string;
  /** Překlad atributu do češtiny (Parametr_hodnoty_CZ) */
  attributeCz?: string;
  required: boolean;
  dataType?: string;
  occurrence?: "required" | "prohibited" | "optional";
  constraint: "FILLED" | "ENUM" | "PATTERN" | "RANGE" | "LENGTH";
  value?: string;
  /** Překlad hodnoty do češtiny (Požadované_hodnoty_CZ) – ne u číselníků */
  valueCz?: string;
  allowedValues?: string[];
  unit?: string;
  /** URI reference */
  uri?: string;
  /** Popis požadavku (před poznámkou) */
  popis?: string;
  note?: string;
  /** Příklady (za poznámkou) */
  priklady?: string;
  /** If true, this attribute is used in applicability section (not requirements) */
  isApplicability?: boolean;
}

export interface PropertyRequirement extends RequirementBase {
  source: "PSET" | "QTO" | "CUSTOM";
  psetName: string;
  /** Překlad skupiny do češtiny (Skupina_CZ) */
  psetNameCz?: string;
  propertyName: string;
  /** Překlad vlastnosti do češtiny (Parametr_hodnoty_CZ) */
  propertyNameCz?: string;
  dataType: string;
  required: boolean;
  occurrence?: "required" | "prohibited" | "optional";
  constraint?: "FILLED" | "ENUM" | "PATTERN" | "RANGE" | "LENGTH";
  value?: string;
  /** Překlad hodnoty do češtiny (Požadované_hodnoty_CZ) – ne u číselníků */
  valueCz?: string;
  /** Allowed values for ENUM constraint (e.g. from IDS restriction) */
  allowedValues?: string[];
  unit?: string;
  /** URI reference */
  uri?: string;
  /** Popis požadavku (před poznámkou) */
  popis?: string;
  note?: string;
  /** Příklady (za poznámkou) */
  priklady?: string;
  /** If true, this property is used in applicability section (not requirements) */
  isApplicability?: boolean;
}

export interface RelationRequirement extends RequirementBase {
  relationType:
    | "IFCRELAGGREGATES"
    | "IFCRELASSIGNSTOGROUP"
    | "IFCRELCONTAINEDINSPATIALSTRUCTURE"
    | "IFCRELNESTS"
    | "IFCRELVOIDSELEMENT"
    | "IFCRELFILLSELEMENT";
  /** Překlad entity součásti do češtiny (Parametr_hodnoty_CZ) */
  entityTypeCz?: string;
  /** Překlad typu vztahu do češtiny (Požadované_hodnoty_CZ) */
  relationTypeCz?: string;
  /** @deprecated Use entityType instead */
  targetType?: string;
  /** Occurrence of the relation requirement */
  occurrence?: "required" | "prohibited" | "optional";
  /** IFC entity type for the related element */
  entityType?: string;
  /** PredefinedType of the related entity */
  entityPredefinedType?: string;
  minCardinality?: number;
  maxCardinality?: number;
  /** URI reference */
  uri?: string;
  /** Popis požadavku (před poznámkou) */
  popis?: string;
  note?: string;
  /** Příklady (za poznámkou) */
  priklady?: string;
  /** If true, this relation (partOf) is used in applicability section (not requirements) */
  isApplicability?: boolean;
}

export interface ClassificationRequirement extends RequirementBase {
  classificationId: string;
  /** ID of the selected classification system entry */
  systemEntryId?: string;
  system: string;
  /** Překlad systému do češtiny (Parametr_hodnoty_CZ) */
  systemCz?: string;
  identification: string;
  /** Value - the classification value/code */
  value?: string;
  /** Překlad hodnoty do češtiny (Požadované_hodnoty_CZ) – ne u číselníků */
  valueCz?: string;
  name: string;
  /** URI reference for this classification item */
  uri?: string;
  description?: string;
  location?: string;
  sort?: string;
  readOnly?: boolean;
  code?: string;
  /** Poznámka k požadavku (za sloupcem Popis/description) */
  note?: string;
  /** Příklady (za poznámkou) */
  priklady?: string;
  /** Constraint type for classification value */
  constraint?: "FILLED" | "ENUM" | "PATTERN";
  /** Occurrence: required / prohibited / optional. Primární klasifikace je vždy required. */
  occurrence?: "required" | "prohibited" | "optional";
  /** If true, this classification is used in applicability section (not requirements) */
  isApplicability?: boolean;
}

export interface MaterialRequirement extends RequirementBase {
  /** Occurrence of the material requirement */
  occurrence?: "required" | "prohibited" | "optional";
  /** Category mode - how the category value is defined */
  categoryMode?: "NONE" | "SIMPLE" | "ENUM";
  /** Category - can be custom value or selected from codelist */
  category?: string;
  /** Překlad kategorie do češtiny (Parametr_hodnoty_CZ) */
  categoryCz?: string;
  /** URI reference for the material */
  uri?: string;
  /** Constraint type for material value */
  constraint?: "FILLED" | "ENUM" | "PATTERN" | "RANGE" | "LENGTH";
  /** Value based on constraint type */
  value?: string;
  /** Překlad hodnoty do češtiny (Požadované_hodnoty_CZ) – ne u číselníků */
  valueCz?: string;
  /** @deprecated Use occurrence instead */
  required: boolean;
  /** @deprecated Use category instead */
  materialType?: "SINGLE" | "LAYER" | "PROFILE" | "CONSTITUENT";
  /** Popis požadavku (před poznámkou) */
  popis?: string;
  note?: string;
  /** Příklady (za poznámkou) */
  priklady?: string;
  /** If true, this material is used in applicability section (not requirements) */
  isApplicability?: boolean;
}

export interface ObjectRequirements {
  attributes: AttributeRequirement[];
  properties: PropertyRequirement[];
  relations: RelationRequirement[];
  classifications: ClassificationRequirement[];
  materials: MaterialRequirement[];
}

/** Authoring tool classification (e.g. Revit category) – not required for IFC/IDS */
export interface AuthoringClassification {
  systemEntryId: string;
  code: string;
}

/** IDS metadata pro celý soubor (ids:info) – dle buildingSMART ids-metadata.md */
export interface IdsMetadata {
  /** Název dokumentu IDS */
  title?: string;
  /** Vlastník autorských práv */
  copyright?: string;
  /** Verze IDS (doporučeno sémantické verzování X.Y) */
  version?: string;
  /** Popis účelu, pro koho je IDS určen, na jaké projekty se vztahuje */
  description?: string;
  /** Autor IDS (e-mailová adresa) */
  author?: string;
  /** Datum publikace (YYYY-MM-DD) */
  date?: string;
  /** Proč jsou informace potřeba (např. quantity take off, clash detection, coordination) */
  purpose?: string;
  /** Milník dodání, kdy jsou informace potřeba (např. Schematic Design, Construction, RIBA Stage 3) */
  milestone?: string;
}

/** IDS metadata pro jednotlivou specifikaci – dle buildingSMART ids-metadata.md */
export interface IdsSpecMetadata {
  /** Krátký název specifikované informace */
  name?: string;
  /** Očekávaná verze IFC: IFC2X3, IFC4, IFC4X3_ADD2 */
  ifcVersion?: "IFC2X3" | "IFC4" | "IFC4X3_ADD2";
  /** Jednoznačný identifikátor pro sledování a referencování (unikátní v rámci IDS) */
  identifier?: string;
  /** Proč je požadavek důležitý pro projekt, jaké workflow podporuje */
  description?: string;
  /** Instrukce: kdo je odpovědný, jak dosáhnout požadavku, edge-cases */
  instructions?: string;
}

export interface ProjectObject {
  code: string;
  description: string;
  /** Zamčený objekt – nelze upravovat ani mazat */
  locked?: boolean;
  /** Kód zdrojového objektu, ze kterého byl tento zkopírován – pro zvýraznění neúplné kopie */
  copiedFrom?: string;
  /** Popis objektu – pouze pro Excel export, ne do IDS */
  popis?: string;
  /** Poznámka k objektu – pouze pro Excel export, ne do IDS */
  poznamka?: string;
  /** Příklady k objektu – pouze pro Excel export, ne do IDS */
  priklady?: string;
  ifcEntity: string;
  /** Překlad entity do češtiny (IFC_entita_CZ) */
  ifcEntityCz?: string;
  predefinedType: PredefinedTypeSelection;
  /** Překlad predefinedType do češtiny (IFC_predefinedType_CZ) */
  predefinedTypeCz?: string;
  /** Phases for which the IfcEntity requirement applies. At least one required. */
  ifcEntityPhases?: string[];
  /** Phases for which the PredefinedType requirement applies. At least one required when PredefinedType is set. */
  predefinedTypePhases?: string[];
  /** @deprecated Use ifcEntityPhases and predefinedTypePhases instead. */
  entityPhases?: string[];
  /** Třídění autorských nástrojů – klasifikace dle nástroje (např. Kategorie RVT), nevyžadované v IFC/IDS */
  authoringClassifications?: AuthoringClassification[];
  /** Metadata specifikace pro IDS export (dle buildingSMART ids-metadata.md). Klíč: `${phaseId}|${occurrence}` pro kombinaci fáze a výskytu. */
  idsSpecMetadata?: Record<string, IdsSpecMetadata>;
  requirements: ObjectRequirements;
}

export interface CodeList {
  /** Unique identifier */
  id: string;
  /** Human-readable name shown in UI */
  name: string;
  /** Allowed values (enumeration entries) */
  values: string[];
  /** Optional note/description */
  note?: string;
}

/** Entry in the classification systems list (for dropdown selection in classification requirements) */
export interface ClassificationSystemEntry {
  /** Unique identifier */
  id: string;
  /** Name of the classification system (e.g., "CCI-CZ", "Uniclass 2015") */
  name: string;
  /** Optional URI/link to the classification system specification */
  uri?: string;
  /** Optional description */
  description?: string;
  /** Hierarchical structure of classification items */
  nodes?: ClassificationNode[];
  /** Original source file name */
  sourceName?: string;
  /** Hash for change detection */
  hash?: string;
  /** Whether this is the primary classification for object structure */
  isPrimary?: boolean;
  /** IDs of classification systems mapped onto this one (extra columns: code from that system per row) */
  mappedSystemIds?: string[];
  /** IDs of mapped systems that are "třídění autorských nástrojů" (zobrazí se v kartě Identifikační údaje). Podmnožina mappedSystemIds. */
  authoringToolSystemIds?: string[];
  /** True if this is a "pure" list (only code, description, level) – e.g. imported from RVT TXT */
  isPure?: boolean;
  /** True if this is the IFC-based classification (entity + predefined type); nezobrazuje se v kartě klasifikace */
  isIfcSystem?: boolean;
  /** Typ třídění: IFC / Autorský nástroj / Klasifikační systém. Pouze „classification“ jde do požadavků na klasifikaci. */
  systemKind?: "ifc" | "authoring" | "classification";
}

/** Režim překladů IFC názvů: vypnuto, automatický, bSDD */
export type TranslationMode = "OFF" | "AUTO" | "BSDD";

export interface Project {
  projectId: string;
  name: string;
  /** Author of the project */
  author?: string;
  /** Režim překladů IFC názvů pro zobrazení uživateli */
  translationMode?: TranslationMode;
  /** Zobrazit políčka překladů CZ vedle hodnot v kartách požadavků */
  showCzTranslations?: boolean;
  /** Zdroj pro automatický překlad prázdných políček CZ: OFF / BSDD / AUTO */
  czTranslationSource?: TranslationMode;
  /** Project description */
  description?: string;
  createdAt: string;
  updatedAt: string;
  ifcSchemaVersion: "IFC4X3";
  /** Display version of IFC schema (e.g., "IFC 4.3 ADD2 TC1") */
  ifcSchemaVersionDisplay?: string;
  /** URL dokumentace IFC schématu (např. https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/) */
  ifcDocumentationUrl?: string;
  /** Model View Definition (MVD), např. Reference View */
  modelDefinitionViewMvd?: string;
  classification: ClassificationData;
  classifications: ClassificationSystem[];
  primaryClassificationId: string;
  phases: Phase[];
  objects: Record<string, ProjectObject>;
  /** User-managed code lists for ENUM (výčet) restrictions */
  codeLists?: CodeList[];
  /** User-managed list of classification systems for dropdown selection */
  classificationSystemEntries?: ClassificationSystemEntry[];
  /** Metadata celého IDS souboru (ids:info) – dle buildingSMART ids-metadata.md */
  idsMetadata?: IdsMetadata;
}
