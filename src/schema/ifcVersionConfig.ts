/**
 * Konfigurace podporovaných IFC verzí a mapování na schema soubory a IDS ifcVersion.
 * Jediný zdroj pravdy pro: vnitřní verze → URL schema indexu, IDS atribut, zobrazovací label.
 */

/** Vnitřní identifikátor IFC verze (odpovídá Project.ifcSchemaVersion). */
export type IfcSchemaVersion = "IFC4" | "IFC4X3";

export const SUPPORTED_IFC_VERSIONS: IfcSchemaVersion[] = ["IFC4", "IFC4X3"];

/** Název souboru schema indexu v public/ifc/ (bez cesty). */
const SCHEMA_FILE: Record<IfcSchemaVersion, string> = {
  IFC4: "schema_index_ifc4.json",
  IFC4X3: "schema_index_ifc4x3.json",
};

/** Soubor se seznamem deprecated entit a predefined types (vygenerovaný skriptem build_deprecated_ifc). */
const DEPRECATED_IFC_FILE: Record<IfcSchemaVersion, string> = {
  IFC4: "deprecated_ifc4.json",
  IFC4X3: "deprecated_ifc4x3.json",
};

/** Hodnota ifcVersion v IDS XML (specification element). */
export type IdsIfcVersion = "IFC2X3" | "IFC4" | "IFC4X3_ADD2";

const IDS_IFC_VERSION: Record<IfcSchemaVersion, IdsIfcVersion> = {
  IFC4: "IFC4",
  IFC4X3: "IFC4X3_ADD2",
};

/** Zobrazovací label verze pro UI (oficiální názvy buildingSMART). */
const DISPLAY_LABEL: Record<IfcSchemaVersion, string> = {
  IFC4: "IFC 4 ADD2 TC1",
  IFC4X3: "IFC 4.3 ADD2 TC1",
};

/** Výchozí verze při vytvoření nového projektu. */
export const DEFAULT_IFC_SCHEMA_VERSION: IfcSchemaVersion = "IFC4X3";

/** Base URL dokumentace IFC (bez koncového lomítka). IFC4 má release ADD2_TC1 v cestě. */
const DOC_BASE_URL: Record<IfcSchemaVersion, string> = {
  IFC4: "https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1",
  IFC4X3: "https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3",
};

/** IFC4 používá HTML/link/ a lowercase názvy souborů; IFC4X3 používá HTML/lexical/. */
const DOC_HTML_PATH: Record<IfcSchemaVersion, string> = {
  IFC4: "HTML/link",
  IFC4X3: "HTML/lexical",
};

/** Base URL bSDD (identifier) pro překlady – verze slovníku ifc/4.3 vs ifc/4. */
const BSDD_BASE_URL: Record<IfcSchemaVersion, string> = {
  IFC4: "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4",
  IFC4X3: "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3",
};

/** Plná URL na IfcClassification v dokumentaci (různé cesty pro 4 vs 4.3). */
const CLASSIFICATION_DOC_URL: Record<IfcSchemaVersion, string> = {
  IFC4: "https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/link/ifcclassification.htm",
  IFC4X3: "https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcClassification.htm",
};

/**
 * Base URL dokumentace IFC schématu (pro odkaz v nastavení projektu).
 */
export function getIfcDocumentationBaseUrl(version: IfcSchemaVersion): string {
  return DOC_BASE_URL[version];
}

/** IFC4 dokumentace používá lowercase názvy souborů (ifcwall.htm); IFC4X3 ponechává PascalCase. */
function toDocFileName(version: IfcSchemaVersion, name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return version === "IFC4" ? trimmed.toLowerCase() : trimmed;
}

/**
 * URL na stránku entity/typu v dokumentaci (IFC4: HTML/link/, lowercase; IFC4X3: HTML/lexical/).
 */
export function getIfcLexicalDocUrl(version: IfcSchemaVersion, identifier: string): string | undefined {
  if (!identifier?.trim()) return undefined;
  const base = DOC_BASE_URL[version];
  const path = DOC_HTML_PATH[version];
  const file = toDocFileName(version, identifier) + ".htm";
  return `${base}/${path}/${file}`;
}

/**
 * URL na stránku vlastnosti v dokumentaci (HTML/property). IFC4 používá lowercase.
 */
export function getIfcPropertyDocUrl(version: IfcSchemaVersion, propertyName: string): string | undefined {
  if (!propertyName?.trim()) return undefined;
  const base = DOC_BASE_URL[version];
  const file = toDocFileName(version, propertyName) + ".htm";
  return `${base}/HTML/property/${file}`;
}

/**
 * URL na stránku Pset/Qto (IFC4: HTML/link/, lowercase; IFC4X3: HTML/lexical/).
 */
export function getIfcPsetDocUrl(version: IfcSchemaVersion, psetName: string): string | undefined {
  if (!psetName?.trim()) return undefined;
  const base = DOC_BASE_URL[version];
  const path = DOC_HTML_PATH[version];
  const file = toDocFileName(version, psetName) + ".htm";
  return `${base}/${path}/${file}`;
}

/**
 * URL na dokumentaci IfcClassification (různé domény pro 4 vs 4.3).
 */
export function getIfcClassificationDocUrl(version: IfcSchemaVersion): string {
  return CLASSIFICATION_DOC_URL[version];
}

/**
 * Base URL bSDD pro danou verzi (překlady, identifier).
 */
export function getBsddBaseUrl(version: IfcSchemaVersion): string {
  return BSDD_BASE_URL[version];
}

/**
 * URL k schema indexu pro danou verzi (pro fetch z public/ifc/).
 */
export function getSchemaIndexUrl(version: IfcSchemaVersion): string {
  const file = SCHEMA_FILE[version];
  return `/ifc/${file}`;
}

/**
 * URL k souboru deprecated entit/predefined types pro danou verzi (pro fetch z public/ifc/).
 * Soubor vygeneruje jednorázově: npm run build:deprecated resp. build:deprecated:4.
 */
export function getDeprecatedIfcUrl(version: IfcSchemaVersion): string {
  const file = DEPRECATED_IFC_FILE[version];
  return `/ifc/${file}`;
}

/**
 * Hodnota ifcVersion pro IDS export.
 */
export function getIdsIfcVersion(version: IfcSchemaVersion): IdsIfcVersion {
  return IDS_IFC_VERSION[version];
}

/**
 * Zobrazovací název verze pro UI.
 */
export function getDisplayLabel(version: IfcSchemaVersion): string {
  return DISPLAY_LABEL[version];
}

/**
 * Normalizuje hodnotu z projektu nebo storage na IfcSchemaVersion.
 * Přijímá i hodnoty z IDS (IFC4X3_ADD2), exportu a starých projektů.
 */
export function normalizeIfcSchemaVersion(
  value: string | undefined | null,
): IfcSchemaVersion {
  const v = (value ?? "").trim().toUpperCase();
  if (v === "IFC4") return "IFC4";
  if (v === "IFC4X3" || v === "IFC4X3_ADD2") return "IFC4X3";
  if (v === "IFC2X3") return "IFC4"; // IFC2X3 není podporováno v UI/schema, mapujeme na IFC4
  return DEFAULT_IFC_SCHEMA_VERSION;
}

/**
 * Mapuje hodnotu ifcVersion z IDS (specification element) na vnitřní IfcSchemaVersion.
 * Použití při importu IDS pro nastavení verze projektu.
 */
export function idsIfcVersionToSchemaVersion(idsVersion: string | undefined | null): IfcSchemaVersion {
  return normalizeIfcSchemaVersion(idsVersion);
}
