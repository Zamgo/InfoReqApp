import type {
  Project,
  ProjectObject,
  AttributeRequirement,
  PropertyRequirement,
  ClassificationRequirement,
  ClassificationSystemEntry,
  MaterialRequirement,
  RelationRequirement,
  IdsMetadata,
  IdsSpecMetadata,
  IdsProjectFacet,
  IdsProjectSpecification,
  IdsValueConstraint,
} from "../project/types";
import { getIdsIfcVersion, normalizeIfcSchemaVersion } from "../schema/ifcVersionConfig";
import { getEffectiveUseCaseIds, requirementAppliesToUseCase } from "../project/useCaseResolve";
import { specificationReferencesEntity } from "../ids/specifications";

const IDS_NAMESPACE = "http://standards.buildingsmart.org/IDS";
const XS_NAMESPACE = "http://www.w3.org/2001/XMLSchema";
const XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";
const IDS_SCHEMA_LOCATION = "http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd";

type OccurrenceFilter = "all" | "required" | "prohibited" | "optional";

/**
 * Get metadata for a spec by phase+occurrence. Supports legacy single-object format.
 */
function getIdsSpecMetadataForPhaseOccurrence(
  obj: ProjectObject,
  phaseId: string,
  occurrence: OccurrenceFilter
): IdsSpecMetadata | undefined {
  const map = obj.idsSpecMetadata;
  if (!map || typeof map !== "object") return undefined;
  const keys = Object.keys(map);
  if (keys.length === 0) return undefined;
  const isLegacy = !keys.some((k) => k.includes("|"));
  if (isLegacy) return map as unknown as IdsSpecMetadata;
  const key = `${phaseId}|${occurrence}`;
  const direct = (map as Record<string, IdsSpecMetadata>)[key];
  if (direct) return direct;
  const fallbackOrder = [
    `${phaseId}|required`,
    `${phaseId}|all`,
    `${phaseId}|optional`,
    `${phaseId}|prohibited`,
    `all|required`,
    `all|all`,
    ...keys.filter((k) => k.startsWith(`${phaseId}|`)),
    ...keys.filter((k) => k.startsWith("all|")),
  ];
  for (const k of fallbackOrder) {
    const m = (map as Record<string, IdsSpecMetadata>)[k];
    if (m) return m;
  }
  return undefined;
}

interface IDSExportOptions {
  project: Project;
  phaseId: string;
  /** If provided, only export these object codes */
  objectCodes?: string[];
  /** Filter requirements by occurrence. Default "all" */
  occurrenceFilter?: OccurrenceFilter;
  /** If provided, only export requirements that apply to this use-case (purpose of use). Omit for all. */
  useCaseId?: string;
  /** Override metadata for the IDS file (ids:info). Falls back to project.idsMetadata */
  idsMetadata?: Partial<IdsMetadata>;
}

/**
 * Escape special XML characters
 */
const escapeXml = (str: string): string => {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

const generateCanonicalIdsValue = (
  value: IdsValueConstraint,
  indent: string,
): string => {
  if (value.simpleValue !== undefined) {
    return `${indent}<ids:simpleValue>${escapeXml(value.simpleValue)}</ids:simpleValue>`;
  }
  const restrictionFacets: string[] = [];
  value.enumerations?.forEach((item) => {
    restrictionFacets.push(`${indent}  <xs:enumeration value="${escapeXml(item)}"/>`);
  });
  if (value.pattern !== undefined) {
    restrictionFacets.push(`${indent}  <xs:pattern value="${escapeXml(value.pattern)}"/>`);
  }
  if (value.minInclusive !== undefined) {
    restrictionFacets.push(`${indent}  <xs:minInclusive value="${escapeXml(value.minInclusive)}"/>`);
  }
  if (value.maxInclusive !== undefined) {
    restrictionFacets.push(`${indent}  <xs:maxInclusive value="${escapeXml(value.maxInclusive)}"/>`);
  }
  if (value.minExclusive !== undefined) {
    restrictionFacets.push(`${indent}  <xs:minExclusive value="${escapeXml(value.minExclusive)}"/>`);
  }
  if (value.maxExclusive !== undefined) {
    restrictionFacets.push(`${indent}  <xs:maxExclusive value="${escapeXml(value.maxExclusive)}"/>`);
  }
  if (value.length !== undefined) {
    restrictionFacets.push(`${indent}  <xs:length value="${value.length}"/>`);
  }
  if (value.minLength !== undefined) {
    restrictionFacets.push(`${indent}  <xs:minLength value="${value.minLength}"/>`);
  }
  if (value.maxLength !== undefined) {
    restrictionFacets.push(`${indent}  <xs:maxLength value="${value.maxLength}"/>`);
  }
  if (!restrictionFacets.length) return "";
  const inferredBase = value.base ??
    (
      value.minInclusive !== undefined ||
      value.maxInclusive !== undefined ||
      value.minExclusive !== undefined ||
      value.maxExclusive !== undefined
        ? "xs:double"
        : "xs:string"
    );
  return `${indent}<xs:restriction base="${escapeXml(inferredBase)}">\n${restrictionFacets.join("\n")}\n${indent}</xs:restriction>`;
};

const generateCanonicalValueElement = (
  name: string,
  value: IdsValueConstraint | undefined,
  indent: string,
): string[] => {
  if (!value) return [];
  const content = generateCanonicalIdsValue(value, `${indent}  `);
  if (!content) return [];
  return [
    `${indent}<ids:${name}>`,
    content,
    `${indent}</ids:${name}>`,
  ];
};

const canonicalFacetAttributes = (
  facet: IdsProjectFacet,
  isApplicability: boolean,
): string => {
  const attributes: string[] = [];
  if (!isApplicability && facet.cardinality) {
    attributes.push(`cardinality="${facet.cardinality}"`);
  }
  if (facet.kind === "partOf" && facet.relation) {
    attributes.push(`relation="${escapeXml(facet.relation)}"`);
  }
  if (facet.uri) attributes.push(`uri="${escapeXml(facet.uri)}"`);
  if (facet.instructions) attributes.push(`instructions="${escapeXml(facet.instructions)}"`);
  return attributes.length ? ` ${attributes.join(" ")}` : "";
};

const generateCanonicalEntity = (
  facet: Extract<IdsProjectFacet, { kind: "entity" }>,
  indent: string,
  attributes = "",
): string => {
  const lines = [`${indent}<ids:entity${attributes}>`];
  lines.push(...generateCanonicalValueElement("name", facet.name, `${indent}  `));
  lines.push(...generateCanonicalValueElement("predefinedType", facet.predefinedType, `${indent}  `));
  lines.push(`${indent}</ids:entity>`);
  return lines.join("\n");
};

const generateCanonicalFacet = (
  facet: IdsProjectFacet,
  indent: string,
  isApplicability: boolean,
): string => {
  const attributes = canonicalFacetAttributes(facet, isApplicability);
  if (facet.kind === "entity") {
    return generateCanonicalEntity(facet, indent, attributes);
  }
  const lines = [`${indent}<ids:${facet.kind}${attributes}${facet.kind === "property" && facet.dataType ? ` dataType="${escapeXml(facet.dataType)}"` : ""}>`];
  if (facet.kind === "attribute") {
    lines.push(...generateCanonicalValueElement("name", facet.name, `${indent}  `));
    lines.push(...generateCanonicalValueElement("value", facet.value, `${indent}  `));
  } else if (facet.kind === "classification") {
    lines.push(...generateCanonicalValueElement("value", facet.value, `${indent}  `));
    lines.push(...generateCanonicalValueElement("system", facet.system, `${indent}  `));
  } else if (facet.kind === "property") {
    lines.push(...generateCanonicalValueElement("propertySet", facet.propertySet, `${indent}  `));
    lines.push(...generateCanonicalValueElement("baseName", facet.baseName, `${indent}  `));
    lines.push(...generateCanonicalValueElement("value", facet.value, `${indent}  `));
  } else if (facet.kind === "material") {
    lines.push(...generateCanonicalValueElement("value", facet.value, `${indent}  `));
  } else if (facet.kind === "partOf") {
    lines.push(generateCanonicalEntity(facet.entity, `${indent}  `));
  }
  lines.push(`${indent}</ids:${facet.kind}>`);
  return lines.join("\n");
};

const generateCanonicalSpecification = (
  specification: IdsProjectSpecification,
): string => {
  const attributes = [
    `name="${escapeXml(specification.name ?? "")}"`,
    specification.ifcVersion ? `ifcVersion="${escapeXml(specification.ifcVersion)}"` : "",
    specification.identifier ? `identifier="${escapeXml(specification.identifier)}"` : "",
    specification.description ? `description="${escapeXml(specification.description)}"` : "",
    specification.instructions ? `instructions="${escapeXml(specification.instructions)}"` : "",
  ].filter(Boolean).join(" ");
  const lines = [`    <ids:specification ${attributes}>`];
  lines.push(`      <ids:applicability minOccurs="${specification.minOccurs}" maxOccurs="${specification.maxOccurs}">`);
  specification.applicability.forEach((facet) => {
    lines.push(generateCanonicalFacet(facet, "        ", true));
  });
  lines.push(`      </ids:applicability>`);
  lines.push(`      <ids:requirements>`);
  specification.requirements.forEach((facet) => {
    lines.push(generateCanonicalFacet(facet, "        ", false));
  });
  lines.push(`      </ids:requirements>`);
  lines.push(`    </ids:specification>`);
  return lines.join("\n");
};

/**
 * Parse RANGE value format: "min:3:inclusive|max:150:inclusive" or "max:150:inclusive"
 */
const parseRangeValue = (
  value: string
): { min?: string; minExclusive?: boolean; max?: string; maxExclusive?: boolean } => {
  const out: { min?: string; minExclusive?: boolean; max?: string; maxExclusive?: boolean } = {};
  const parts = value.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.startsWith("min:")) {
      const rest = part.slice(4).trim();
      const [num, kind] = rest.split(":").map((s) => s.trim());
      if (num !== undefined && num !== "") {
        out.min = num;
        out.minExclusive = (kind ?? "inclusive").toLowerCase() === "exclusive";
      }
    } else if (part.startsWith("max:")) {
      const rest = part.slice(4).trim();
      const [num, kind] = rest.split(":").map((s) => s.trim());
      if (num !== undefined && num !== "") {
        out.max = num;
        out.maxExclusive = (kind ?? "inclusive").toLowerCase() === "exclusive";
      }
    }
  }
  return out;
};

/**
 * Generate idsValue content (either simpleValue or restriction).
 * For ENUM: uses allowedValues (vyčet) when present, otherwise value split by "|".
 * Vlastnost/atribut může nabývat hodnotu jen z vyčtu – do IDS jde xs:restriction s xs:enumeration.
 * For RANGE: outputs xs:restriction base xs:double with minInclusive/maxInclusive (or exclusive).
 */
const generateIdsValueContent = (
  value: string,
  constraint?: string,
  indent = "",
  allowedValues?: string[],
  /** For RANGE: use "xs:integer" when true, else "xs:double" */
  useIntegerBase?: boolean
): string => {
  if (constraint === "ENUM") {
    const enumList = (allowedValues && allowedValues.length > 0)
      ? allowedValues.filter(Boolean)
      : (value || "").split("|").map((v) => v.trim()).filter(Boolean);
    if (enumList.length === 0) return "";
    if (enumList.length === 1) {
      return `${indent}<ids:simpleValue>${escapeXml(enumList[0])}</ids:simpleValue>`;
    }
    const enumerations = enumList.map((v) => `${indent}  <xs:enumeration value="${escapeXml(v)}"/>`).join("\n");
    return `${indent}<xs:restriction base="xs:string">\n${enumerations}\n${indent}</xs:restriction>`;
  }
  if (constraint === "PATTERN" && value) {
    return `${indent}<xs:restriction base="xs:string">\n${indent}  <xs:pattern value="${escapeXml(value)}"/>\n${indent}</xs:restriction>`;
  }
  if (constraint === "RANGE" && value) {
    const r = parseRangeValue(value);
    const base = useIntegerBase ? "xs:integer" : "xs:double";
    const facets: string[] = [];
    if (r.min != null) {
      facets.push(r.minExclusive
        ? `${indent}  <xs:minExclusive value="${escapeXml(r.min)}"/>`
        : `${indent}  <xs:minInclusive value="${escapeXml(r.min)}"/>`);
    }
    if (r.max != null) {
      facets.push(r.maxExclusive
        ? `${indent}  <xs:maxExclusive value="${escapeXml(r.max)}"/>`
        : `${indent}  <xs:maxInclusive value="${escapeXml(r.max)}"/>`);
    }
    if (facets.length === 0) return "";
    return `${indent}<xs:restriction base="${base}">\n${facets.join("\n")}\n${indent}</xs:restriction>`;
  }
  if (!value) return "";
  return `${indent}<ids:simpleValue>${escapeXml(value)}</ids:simpleValue>`;
};

/**
 * Convert occurrence to IDS cardinality
 */
const getCardinality = (occurrence?: "required" | "prohibited" | "optional"): string => {
  switch (occurrence) {
    case "prohibited":
      return "prohibited";
    case "optional":
      return "optional";
    default:
      return "required";
  }
};

/**
 * Valid IDS data types from DataTypes.md (IFC4X3)
 * Only these types are allowed in the dataType attribute
 */
const VALID_IDS_DATA_TYPES = new Set([
  // Common simple types
  "IFCBOOLEAN", "IFCLOGICAL", "IFCINTEGER", "IFCREAL", "IFCTEXT", "IFCLABEL", "IFCIDENTIFIER",
  // Measure types (most common)
  "IFCLENGTHMEASURE", "IFCAREAMEASURE", "IFCVOLUMEMEASURE", "IFCMASSMEASURE", "IFCTIMEMEASURE",
  "IFCCOUNTMEASURE", "IFCTHERMODYNAMICTEMPERATUREMEASURE", "IFCELECTRICCURRENTMEASURE",
  "IFCPLANEANGLEMEASURE", "IFCPRESSUREMEASURE", "IFCFORCEMEASURE", "IFCENERGYMEASURE",
  "IFCPOWERMEASURE", "IFCFREQUENCYMEASURE", "IFCELECTRICVOLTAGEMEASURE", "IFCMONETARYMEASURE",
  "IFCPOSITIVELENGTHMEASURE", "IFCNONNEGATIVELENGTHMEASURE", "IFCRATIOMEASURE",
  "IFCNORMALISEDRATIOMEASURE", "IFCPOSITIVERATIOMEASURE", "IFCNUMERICMEASURE",
  "IFCTHERMALCONDUCTIVITYMEASURE", "IFCTHERMALTRANSMITTANCEMEASURE", "IFCMASSDENSITYMEASURE",
  // Date/time types
  "IFCDATE", "IFCDATETIME", "IFCTIME", "IFCDURATION", "IFCTIMESTAMP",
  // Other types
  "IFCGLOBALLYUNIQUEID", "IFCURIREFERENCE",
]);

/**
 * Map IFC data types to valid IDS data types
 * Returns undefined if dataType should be omitted from IDS output
 */
const mapDataTypeToIds = (dataType?: string): string | undefined => {
  if (!dataType) return undefined;
  
  const dt = dataType.trim();
  const dtLower = dt.toLowerCase();
  const dtUpper = dt.toUpperCase();
  
  // OMIT dataType for IFC Quantity types (IfcQuantityWeight, etc.)
  // These are NOT valid IDS dataTypes - the validator will infer from Qto_ definition
  if (dtLower.startsWith("ifcquantity")) {
    return undefined;
  }
  
  // OMIT dataType for IFC Property container types
  if (dtLower.startsWith("ifcproperty")) {
    return undefined;
  }
  
  // Handle PEnum_ types - use IFCLABEL
  if (dtLower.startsWith("penum")) {
    return "IFCLABEL";
  }
  
  // Check if it's a valid IDS type directly
  if (VALID_IDS_DATA_TYPES.has(dtUpper)) {
    return dtUpper;
  }
  
  // Common mappings
  const mappings: Record<string, string> = {
    "string": "IFCLABEL",
    "text": "IFCTEXT",
    "number": "IFCREAL",
    "integer": "IFCINTEGER",
    "real": "IFCREAL",
    "double": "IFCREAL",
    "float": "IFCREAL",
    "boolean": "IFCBOOLEAN",
    "bool": "IFCBOOLEAN",
  };
  
  if (mappings[dtLower]) {
    return mappings[dtLower];
  }
  
  // For unknown types that look like IFC types but aren't in valid set, omit
  if (dtLower.startsWith("ifc") && !VALID_IDS_DATA_TYPES.has(dtUpper)) {
    return undefined; // Omit unknown IFC types
  }
  
  // Default fallback for strings
  return "IFCLABEL";
};

/**
 * Generate attribute element for requirements or applicability (no cardinality in applicability)
 */
const generateAttribute = (attr: AttributeRequirement, indent: string, isApplicability = false): string => {
  const cardinality = isApplicability ? "" : ` cardinality="${getCardinality(attr.occurrence)}"`;
  const instructions = attr.note ? ` instructions="${escapeXml(attr.note)}"` : "";
  
  const lines: string[] = [];
  lines.push(`${indent}<ids:attribute${cardinality}${instructions}>`);
  lines.push(`${indent}  <ids:name>`);
  lines.push(`${indent}    <ids:simpleValue>${escapeXml(attr.attribute)}</ids:simpleValue>`);
  lines.push(`${indent}  </ids:name>`);
  
  const hasValue = attr.value || (attr.constraint === "ENUM" && attr.allowedValues && attr.allowedValues.length > 0);
  if (hasValue) {
    const attrDataType = mapDataTypeToIds(attr.dataType);
    const useIntegerBase = attr.constraint === "RANGE" && attrDataType === "IFCINTEGER";
    lines.push(`${indent}  <ids:value>`);
    lines.push(generateIdsValueContent(attr.value ?? "", attr.constraint, `${indent}    `, attr.allowedValues, useIntegerBase));
    lines.push(`${indent}  </ids:value>`);
  }
  
  lines.push(`${indent}</ids:attribute>`);
  return lines.join("\n");
};

/**
 * Generate property element for requirements or applicability (no cardinality in applicability)
 */
const generateProperty = (prop: PropertyRequirement, indent: string, isApplicability = false): string => {
  const cardinality = isApplicability ? "" : ` cardinality="${getCardinality(prop.occurrence)}"`;
  const instructions = prop.note ? ` instructions="${escapeXml(prop.note)}"` : "";
  const mappedDataType = mapDataTypeToIds(prop.dataType);
  // When constraint is ENUM we output string enumerations (xs:restriction base="xs:string").
  // Using IFCREAL/IFCINTEGER would make validators expect numeric enumeration values → use IFCLABEL.
  const effectiveDataType = prop.constraint === "ENUM" ? "IFCLABEL" : mappedDataType;
  const dataType = effectiveDataType ? ` dataType="${escapeXml(effectiveDataType)}"` : "";
  
  const lines: string[] = [];
  lines.push(`${indent}<ids:property${cardinality}${dataType}${instructions}>`);
  lines.push(`${indent}  <ids:propertySet>`);
  lines.push(`${indent}    <ids:simpleValue>${escapeXml(prop.psetName)}</ids:simpleValue>`);
  lines.push(`${indent}  </ids:propertySet>`);
  lines.push(`${indent}  <ids:baseName>`);
  lines.push(`${indent}    <ids:simpleValue>${escapeXml(prop.propertyName)}</ids:simpleValue>`);
  lines.push(`${indent}  </ids:baseName>`);
  
  const hasValue = prop.value || (prop.constraint === "ENUM" && prop.allowedValues && prop.allowedValues.length > 0);
  if (hasValue) {
    const useIntegerBase = prop.constraint === "RANGE" && mappedDataType === "IFCINTEGER";
    lines.push(`${indent}  <ids:value>`);
    lines.push(generateIdsValueContent(prop.value ?? "", prop.constraint, `${indent}    `, prop.allowedValues, useIntegerBase));
    lines.push(`${indent}  </ids:value>`);
  }
  
  lines.push(`${indent}</ids:property>`);
  return lines.join("\n");
};

/**
 * Generate classification element
 */
const generateClassification = (cls: ClassificationRequirement, isApplicability: boolean, indent: string): string => {
  const cardinality = isApplicability ? "" : ` cardinality="${getCardinality(cls.occurrence ?? "required")}"`;
  const uri = cls.uri ? ` uri="${escapeXml(cls.uri)}"` : "";
  const instructions = cls.note ? ` instructions="${escapeXml(cls.note)}"` : "";
  
  const lines: string[] = [];
  lines.push(`${indent}<ids:classification${cardinality}${uri}${instructions}>`);
  
  // Value comes before system according to IDS schema
  if (cls.value || cls.identification) {
    const value = cls.value || cls.identification;
    lines.push(`${indent}  <ids:value>`);
    lines.push(generateIdsValueContent(value, cls.constraint, `${indent}    `));
    lines.push(`${indent}  </ids:value>`);
  }
  
  lines.push(`${indent}  <ids:system>`);
  lines.push(`${indent}    <ids:simpleValue>${escapeXml(cls.system)}</ids:simpleValue>`);
  lines.push(`${indent}  </ids:system>`);
  lines.push(`${indent}</ids:classification>`);
  
  return lines.join("\n");
};

/**
 * Generate material element for requirements or applicability (no cardinality in applicability)
 */
const generateMaterial = (mat: MaterialRequirement, indent: string, isApplicability = false): string => {
  const cardinality = isApplicability ? "" : ` cardinality="${getCardinality(mat.occurrence)}"`;
  const uri = mat.uri ? ` uri="${escapeXml(mat.uri)}"` : "";
  const instructions = mat.note ? ` instructions="${escapeXml(mat.note)}"` : "";
  
  const lines: string[] = [];
  lines.push(`${indent}<ids:material${cardinality}${uri}${instructions}>`);
  
  const val = mat.value || (mat.category && mat.categoryMode !== "NONE" ? mat.category : "");
  if (val) {
    lines.push(`${indent}  <ids:value>`);
    lines.push(generateIdsValueContent(val, mat.constraint, `${indent}    `));
    lines.push(`${indent}  </ids:value>`);
  }
  
  lines.push(`${indent}</ids:material>`);
  return lines.join("\n");
};

/**
 * Generate partOf (relation) element for requirements or applicability
 */
const generatePartOf = (rel: RelationRequirement, indent: string, isApplicability = false): string => {
  const cardinality = isApplicability ? "" : ` cardinality="${rel.occurrence === "prohibited" ? "prohibited" : "required"}"`;
  const relationAttr = rel.relationType ? ` relation="${escapeXml(rel.relationType)}"` : "";
  const entityName = (rel.entityType || "IFCBUILDINGELEMENT").toUpperCase();
  
  const lines: string[] = [];
  lines.push(`${indent}<ids:partOf${relationAttr}${cardinality}>`);
  lines.push(`${indent}  <ids:entity>`);
  lines.push(`${indent}    <ids:name>`);
  lines.push(`${indent}      <ids:simpleValue>${escapeXml(entityName)}</ids:simpleValue>`);
  lines.push(`${indent}    </ids:name>`);
  const pt = (rel.entityPredefinedType ?? "").trim().toUpperCase();
  if (pt && pt !== "NOTDEFINED") {
    lines.push(`${indent}    <ids:predefinedType>`);
    lines.push(`${indent}      <ids:simpleValue>${escapeXml(pt)}</ids:simpleValue>`);
    lines.push(`${indent}    </ids:predefinedType>`);
  }
  lines.push(`${indent}  </ids:entity>`);
  lines.push(`${indent}</ids:partOf>`);
  return lines.join("\n");
};

/**
 * Check if a requirement applies to a given phase
 */
const requirementAppliesToPhase = (req: { phases?: string[] }, phaseId: string): boolean => {
  // If no phases specified, requirement does NOT apply to any specific phase
  if (!req.phases || req.phases.length === 0) return false;
  return req.phases.includes(phaseId);
};

/**
 * Check if property is valid (has proper pset name and property name, not temporary)
 */
const isValidProperty = (prop: PropertyRequirement): boolean => {
  // Filter out properties with temporary pset names or empty names
  if (!prop.psetName || prop.psetName.startsWith("_NEW_")) return false;
  if (!prop.propertyName || prop.propertyName.trim() === "") return false;
  return true;
};

/**
 * Filter requirements by occurrence
 */
const filterByOccurrence = <T extends { occurrence?: "required" | "prohibited" | "optional" }>(
  items: T[],
  filter: OccurrenceFilter
): T[] => {
  if (filter === "all") return items;
  return items.filter((item) => (item.occurrence || "required") === filter);
};

/**
 * Exclude IFC classification system – IFC třídění je už v entitě a predefined type, neexportovat jako klasifikaci
 */
const excludeIfcClassifications = (
  items: ClassificationRequirement[],
  classificationSystemEntries: ClassificationSystemEntry[]
): ClassificationRequirement[] => {
  return items.filter((cls) => {
    if (!cls.systemEntryId) return true; // Bez systemEntryId ponechat (legacy)
    const entry = classificationSystemEntries.find((e) => e.id === cls.systemEntryId);
    return !entry?.isIfcSystem;
  });
};

/**
 * Generate a specification element for a single object
 */
const generateSpecification = (
  obj: ProjectObject,
  phaseId: string,
  phaseName: string,
  phaseCode: string,
  occurrenceFilter: OccurrenceFilter,
  classificationSystemEntries: ClassificationSystemEntry[],
  ifcVersion: string,
  useCaseId?: string
): string | null => {
  // Filter requirements for this phase
  let attributes = obj.requirements.attributes.filter((r) => requirementAppliesToPhase(r, phaseId) && r.attribute && r.attribute !== "PredefinedType");
  let properties = obj.requirements.properties.filter((r) => requirementAppliesToPhase(r, phaseId) && isValidProperty(r));
  let classificationsRaw = obj.requirements.classifications.filter((r) => requirementAppliesToPhase(r, phaseId));
  let relations = obj.requirements.relations.filter((r) => requirementAppliesToPhase(r, phaseId));
  let materials = obj.requirements.materials.filter((r) => requirementAppliesToPhase(r, phaseId));

  // Filter by use-case when useCaseId is provided (excluded = skip; then effective IDs must contain useCaseId or be empty)
  if (useCaseId != null && useCaseId !== "") {
    const appliesUseCase = (r: { useCaseMode?: string }, effective: string[]) =>
      r.useCaseMode !== "excluded" && requirementAppliesToUseCase(effective, useCaseId);
    attributes = attributes.filter((r) => appliesUseCase(r, getEffectiveUseCaseIds(r, obj, "attributes")));
    properties = properties.filter((r) => appliesUseCase(r, getEffectiveUseCaseIds(r, obj, "properties", r.psetName)));
    classificationsRaw = classificationsRaw.filter((r) => appliesUseCase(r, getEffectiveUseCaseIds(r, obj, "classifications")));
    relations = relations.filter((r) => appliesUseCase(r, getEffectiveUseCaseIds(r, obj, "relations")));
    materials = materials.filter((r) => appliesUseCase(r, getEffectiveUseCaseIds(r, obj, "materials")));
  }

  const classifications = excludeIfcClassifications(classificationsRaw, classificationSystemEntries);

  // Split by applicability first (applicability items are never filtered by occurrence)
  const applicabilityClassifications = classifications.filter((c) => c.isApplicability || c.readOnly);
  const applicabilityAttributes = attributes.filter((a) => a.isApplicability);
  const applicabilityProperties = properties.filter((p) => p.isApplicability);
  const applicabilityRelations = relations.filter((r) => r.isApplicability);
  const applicabilityMaterials = materials.filter((m) => m.isApplicability);

  // Filter REQUIREMENT items by occurrence (applicability stays as-is)
  const requirementClassifications = filterByOccurrence(classifications.filter((c) => !c.isApplicability && !c.readOnly), occurrenceFilter);
  const requirementAttributes = filterByOccurrence(attributes.filter((a) => !a.isApplicability), occurrenceFilter);
  const requirementProperties = filterByOccurrence(properties.filter((p) => !p.isApplicability), occurrenceFilter);
  const requirementRelations = filterByOccurrence(relations.filter((r) => !r.isApplicability), occurrenceFilter);
  const requirementMaterials = filterByOccurrence(materials.filter((m) => !m.isApplicability), occurrenceFilter);
  
  // If no entity, skip this specification (entity is required for applicability)
  if (!obj.ifcEntity) {
    return null;
  }
  
  // If IfcEntity phases are set and this phase is not included, skip this specification for this phase
  const ifcEntityPhases = obj.ifcEntityPhases ?? obj.entityPhases;
  if (ifcEntityPhases && ifcEntityPhases.length > 0 && !ifcEntityPhases.includes(phaseId)) {
    return null;
  }
  
  // Allow export even with empty requirements – IDS může mít pouze identifikační údaje (applicability) a prázdné požadavky
  const meta = getIdsSpecMetadataForPhaseOccurrence(obj, phaseId, occurrenceFilter);
  const sanitizeForSpec = (s: string) => (s || "").replace(/[^\p{L}\p{N}_\-]/gu, "_").replace(/_+/g, "_") || "export";
  const occurrenceLabel = occurrenceFilter === "all" ? "Vše" : occurrenceFilter === "required" ? "Požadované" : occurrenceFilter === "prohibited" ? "Zakázané" : "Možné";
  const derivedSpecName = [
    sanitizeForSpec((obj.code || obj.description || "").replace(/::/g, ".")),
    sanitizeForSpec(phaseCode),
    occurrenceLabel,
  ].filter(Boolean).join("_");
  const specName = meta?.name ?? derivedSpecName;
  const specDescription = meta?.description ?? `Požadavky pro fázi ${phaseName}`;
  const specAttrs = [
    `name="${escapeXml(specName)}"`,
    `ifcVersion="${ifcVersion}"`,
    `description="${escapeXml(specDescription)}"`,
    meta?.identifier ? `identifier="${escapeXml(meta.identifier)}"` : "",
    meta?.instructions ? `instructions="${escapeXml(meta.instructions)}"` : "",
  ].filter(Boolean).join(" ");
  
  const lines: string[] = [];
  lines.push(`    <ids:specification ${specAttrs}>`);
  
  // Applicability section
  lines.push(`      <ids:applicability minOccurs="1" maxOccurs="unbounded">`);
  
  // Entity (required); PredefinedType only when set and phase is in predefinedTypePhases.
  // Do not export NOTDEFINED – invalid predefinedType in Ifc4x3 context (Error 103).
  const predefinedTypePhases = obj.predefinedTypePhases ?? obj.entityPhases;
  const predefinedVal = (obj.predefinedType.value ?? "").trim().toUpperCase();
  const includePredefinedType =
    obj.predefinedType.mode === "ENUM" &&
    predefinedVal &&
    predefinedVal !== "NOTDEFINED" &&
    (!predefinedTypePhases || predefinedTypePhases.length === 0 || predefinedTypePhases.includes(phaseId));
  lines.push(`        <ids:entity>`);
  lines.push(`          <ids:name>`);
  lines.push(`            <ids:simpleValue>${escapeXml(obj.ifcEntity.toUpperCase())}</ids:simpleValue>`);
  lines.push(`          </ids:name>`);
  if (includePredefinedType) {
    lines.push(`          <ids:predefinedType>`);
    lines.push(`            <ids:simpleValue>${escapeXml(predefinedVal)}</ids:simpleValue>`);
    lines.push(`          </ids:predefinedType>`);
  }
  lines.push(`        </ids:entity>`);
  
  applicabilityClassifications.forEach((cls) => {
    lines.push(generateClassification(cls, true, "        "));
  });
  applicabilityAttributes.forEach((attr) => {
    lines.push(generateAttribute(attr, "        ", true));
  });
  applicabilityProperties.forEach((prop) => {
    lines.push(generateProperty(prop, "        ", true));
  });
  applicabilityRelations.forEach((rel) => {
    lines.push(generatePartOf(rel, "        ", true));
  });
  applicabilityMaterials.forEach((mat) => {
    lines.push(generateMaterial(mat, "        ", true));
  });
  
  lines.push(`      </ids:applicability>`);
  
  // Requirements section
  lines.push(`      <ids:requirements>`);
  
  requirementAttributes.forEach((attr) => {
    lines.push(generateAttribute(attr, "        "));
  });
  requirementProperties.forEach((prop) => {
    lines.push(generateProperty(prop, "        "));
  });
  requirementRelations.forEach((rel) => {
    lines.push(generatePartOf(rel, "        "));
  });
  requirementClassifications.forEach((cls) => {
    lines.push(generateClassification(cls, false, "        "));
  });
  requirementMaterials.forEach((mat) => {
    lines.push(generateMaterial(mat, "        "));
  });
  
  lines.push(`      </ids:requirements>`);
  lines.push(`    </ids:specification>`);
  
  return lines.join("\n");
};

/**
 * Check whether a generated specification XML has an empty requirements block
 * (contains only whitespace between <ids:requirements> and </ids:requirements>).
 */
const hasEmptyRequirements = (specXml: string): boolean => {
  const match = specXml.match(/<ids:requirements>([\s\S]*?)<\/ids:requirements>/);
  return match != null && match[1].trim() === "";
};

const canonicalMatchesOccurrence = (
  specification: IdsProjectSpecification,
  occurrence: OccurrenceFilter,
): boolean => {
  if (occurrence === "all") return true;
  if (occurrence === "prohibited") return specification.maxOccurs === 0;
  if (occurrence === "required") return specification.minOccurs > 0;
  return specification.minOccurs === 0 && specification.maxOccurs !== 0;
};

const canonicalMatchesObjectSelection = (
  specification: IdsProjectSpecification,
  project: Project,
  objectCodes: string[] | undefined,
): boolean => {
  if (!objectCodes?.length) return true;
  return objectCodes.some((code) => {
    const object = project.objects[code];
    if (object?.ifcEntity) {
      const predefinedType = object.predefinedType.mode === "ENUM"
        ? object.predefinedType.value
        : undefined;
      return specificationReferencesEntity(specification, object.ifcEntity, predefinedType);
    }
    const [entity, predefinedType] = code.split("::");
    return specificationReferencesEntity(specification, entity ?? code, predefinedType);
  });
};

const hasAuthoredObjectContent = (
  object: ProjectObject,
  classificationSystemEntries: ClassificationSystemEntry[],
): boolean => {
  const classifications = excludeIfcClassifications(
    object.requirements.classifications.filter((item) => !item.readOnly),
    classificationSystemEntries,
  );
  return !!object.idsSpecMetadata ||
    object.requirements.attributes.length > 0 ||
    object.requirements.properties.length > 0 ||
    object.requirements.relations.length > 0 ||
    object.requirements.materials.length > 0 ||
    classifications.length > 0;
};

/**
 * Generate complete IDS XML document
 */
export const generateIDS = (options: IDSExportOptions): string => {
  const { project, phaseId, objectCodes } = options;
  
  const phase = project.phases.find((p) => p.id === phaseId);
  if (!phase) {
    throw new Error(`Phase ${phaseId} not found`);
  }
  
  // Get objects to export
  let objectsToExport = Object.values(project.objects);
  if (objectCodes && objectCodes.length > 0) {
    objectsToExport = objectsToExport.filter((obj) => objectCodes.includes(obj.code));
  }
  
  const occurrenceFilter = options.occurrenceFilter ?? "all";
  const phaseCode = phase.code ?? phaseId;

  // Při exportu "Vše" vytváříme oddělenou specifikaci pro každý typ výskytu (požadované, zakázané, možné)
  const isSplitByOccurrence = occurrenceFilter === "all";
  const occurrenceTypes: OccurrenceFilter[] =
    isSplitByOccurrence
      ? (["required", "prohibited", "optional"] as const)
      : [occurrenceFilter];

  const classificationSystemEntries = project.classificationSystemEntries ?? [];
  const ifcVersion = getIdsIfcVersion(normalizeIfcSchemaVersion(project.ifcSchemaVersion));
  const canonicalSpecifications = (project.idsSpecifications ?? [])
    .filter((specification) => canonicalMatchesOccurrence(specification, occurrenceFilter))
    .filter((specification) =>
      canonicalMatchesObjectSelection(specification, project, objectCodes)
    );
  const specifications: string[] = canonicalSpecifications.map(generateCanonicalSpecification);
  const legacyObjectsToExport = (project.idsSpecifications?.length ?? 0) > 0
    ? objectsToExport.filter((object) =>
        hasAuthoredObjectContent(object, classificationSystemEntries)
      )
    : objectsToExport;
  for (const obj of legacyObjectsToExport) {
    for (const occ of occurrenceTypes) {
      const spec = generateSpecification(obj, phaseId, phase.name, phaseCode, occ, classificationSystemEntries, ifcVersion, options.useCaseId);
      if (spec) {
        // When splitting "all" into per-occurrence specs, skip those with empty requirements
        // (empty <ids:requirements> only makes sense when user explicitly chose that occurrence type)
        if (isSplitByOccurrence && hasEmptyRequirements(spec)) continue;
        specifications.push(spec);
      }
    }
  }
  
  if (specifications.length === 0) {
    throw new Error(`Žádné požadavky pro fázi "${phase.name}"`);
  }
  
  // Format date
  const today = new Date().toISOString().split("T")[0];
  
  // Merge metadata: options override > project.idsMetadata. Bez samovolného doplňování.
  const fileMeta = options.idsMetadata ?? project.idsMetadata ?? {};
  const title = fileMeta.title ?? "";
  const description = fileMeta.description;
  const author = fileMeta.author ?? project.author;
  const date = fileMeta.date ?? today;
  const copyrightVal = fileMeta.copyright;
  const version = fileMeta.version;
  const purpose = fileMeta.purpose;
  const milestone = fileMeta.milestone ?? "";
  
  // Build IDS document with proper namespace declarations
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<ids:ids xmlns:ids="${IDS_NAMESPACE}" xmlns:xs="${XS_NAMESPACE}" xmlns:xsi="${XSI_NAMESPACE}" xsi:schemaLocation="${IDS_SCHEMA_LOCATION}">`);
  lines.push(`  <ids:info>`);
  lines.push(`    <ids:title>${escapeXml(title)}</ids:title>`);
  if (copyrightVal) lines.push(`    <ids:copyright>${escapeXml(copyrightVal)}</ids:copyright>`);
  if (version) lines.push(`    <ids:version>${escapeXml(version)}</ids:version>`);
  if (description) lines.push(`    <ids:description>${escapeXml(description)}</ids:description>`);
  if (author) lines.push(`    <ids:author>${escapeXml(author)}</ids:author>`);
  lines.push(`    <ids:date>${escapeXml(date)}</ids:date>`);
  if (purpose) lines.push(`    <ids:purpose>${escapeXml(purpose)}</ids:purpose>`);
  lines.push(`    <ids:milestone>${escapeXml(milestone)}</ids:milestone>`);
  lines.push(`  </ids:info>`);
  lines.push(`  <ids:specifications>`);
  
  specifications.forEach((spec) => {
    lines.push(spec);
  });
  
  lines.push(`  </ids:specifications>`);
  lines.push(`</ids:ids>`);
  
  return lines.join("\n");
};

/**
 * Export IDS to file
 */
export const exportIDSFile = (ids: string, filename: string): void => {
  const blob = new Blob([ids], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".ids") ? filename : `${filename}.ids`;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * Export multiple IDS files as ZIP
 */
export const exportIDSZip = async (
  files: Array<{ filename: string; content: string }>,
  zipFilename: string
): Promise<void> => {
  // Dynamic import of JSZip
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  
  files.forEach(({ filename, content }) => {
    zip.file(filename, content);
  });
  
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = zipFilename.endsWith(".zip") ? zipFilename : `${zipFilename}.zip`;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * Get objects that have requirements or applicability for a given phase.
 * Zahrnuje i objekty s pouze identifikačními údaji (applicability) a prázdnými požadavky.
 */
export const getObjectsWithRequirementsForPhase = (
  project: Project,
  phaseId: string
): ProjectObject[] => {
  return Object.values(project.objects).filter((obj) => {
    if (!obj.ifcEntity) return false; // Skip objects without IFC entity
    const ifcEntityPhases = obj.ifcEntityPhases ?? obj.entityPhases;
    if (ifcEntityPhases && ifcEntityPhases.length > 0 && !ifcEntityPhases.includes(phaseId)) {
      return false; // Entity neplatí pro tuto fázi
    }
    return true; // Entity + phase match – lze exportovat včetně applicability-only s prázdnými požadavky
  });
};
