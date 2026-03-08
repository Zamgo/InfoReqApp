/**
 * IDS (Information Delivery Specification) import.
 * Parses IDS XML and maps to Project: objects by IFC entity, IFC + other classifications, properties grouped by Pset.
 */

import type { SchemaIndex } from "../schema/types";
import type {
  Project,
  ProjectObject,
  ClassificationSystemEntry,
  AttributeRequirement,
  PropertyRequirement,
  ClassificationRequirement,
  RelationRequirement,
  MaterialRequirement,
  ObjectRequirements,
  Phase,
} from "../project/types";
import { makeId } from "../utils/id";
import { ensureProjectPhases, getDefaultPhases } from "../project/phases";
import { getDisplayLabel, idsIfcVersionToSchemaVersion } from "../schema/ifcVersionConfig";
import { buildClassificationFromSchemaFiltered } from "../classification/ifcTree";
import { collectLeaves } from "../classification/parser";
import type { ClassificationData } from "../classification/types";

const IDS_NS = "http://standards.buildingsmart.org/IDS";
const XS_NS = "http://www.w3.org/2001/XMLSchema";

// --- Parsed IDS types (from XML) ---

export interface IdsValue {
  simpleValue?: string;
  /** xs:restriction – výčet hodnot (ENUM) */
  enumerations?: string[];
  /** xs:restriction – vzor (PATTERN) */
  pattern?: string;
  /** xs:minInclusive / xs:maxInclusive – pro RANGE */
  minInclusive?: string;
  maxInclusive?: string;
  minExclusive?: string;
  maxExclusive?: string;
  /** xs:length / xs:minLength / xs:maxLength – pro LENGTH */
  length?: number;
  minLength?: number;
  maxLength?: number;
}

export interface IdsEntity {
  name: string;
  predefinedType?: string;
}

export interface IdsClassification {
  system: string;
  value?: string;
  /** Plná restrikce z IDS (pro odvození constraint + value) */
  valueRestriction?: IdsValue;
  uri?: string;
  cardinality?: "required" | "prohibited" | "optional";
  instructions?: string;
}

export interface IdsProperty {
  propertySet: string;
  baseName: string;
  value?: string;
  /** Plná restrikce z IDS (pro odvození constraint + value) */
  valueRestriction?: IdsValue;
  dataType?: string;
  cardinality?: "required" | "prohibited" | "optional";
  uri?: string;
  instructions?: string;
}

export interface IdsAttribute {
  name: string;
  value?: string;
  /** Plná restrikce z IDS (pro odvození constraint + value) */
  valueRestriction?: IdsValue;
  cardinality?: "required" | "prohibited" | "optional";
  instructions?: string;
}

export interface IdsPartOf {
  entity: IdsEntity;
  relation?: string;
  cardinality?: "required" | "prohibited" | "optional";
  instructions?: string;
}

export interface IdsMaterial {
  value?: string;
  /** Plná restrikce z IDS (pro odvození constraint + value) */
  valueRestriction?: IdsValue;
  cardinality?: "required" | "prohibited" | "optional";
  uri?: string;
  instructions?: string;
}

export interface IdsApplicability {
  entity?: IdsEntity;
  partOf: IdsPartOf[];
  classification: IdsClassification[];
  attribute: IdsAttribute[];
  property: IdsProperty[];
  material: IdsMaterial[];
}

export interface IdsRequirements {
  entity: Array<IdsEntity & { instructions?: string }>;
  partOf: IdsPartOf[];
  classification: IdsClassification[];
  attribute: IdsAttribute[];
  property: IdsProperty[];
  material: IdsMaterial[];
}

export interface IdsSpecification {
  name: string;
  ifcVersion?: string;
  description?: string;
  identifier?: string;
  instructions?: string;
  applicability: IdsApplicability;
  requirements?: IdsRequirements;
}

export interface IdsInfo {
  title?: string;
  copyright?: string;
  version?: string;
  description?: string;
  author?: string;
  date?: string;
  purpose?: string;
  milestone?: string;
}

export interface IdsParsed {
  info: IdsInfo;
  specifications: IdsSpecification[];
}

// --- XML helpers ---

function getLocalName(el: Element): string {
  return el.localName ?? el.nodeName.replace(/^[^:]+:/, "");
}

function getFirstElement(el: Element, localName: string, ns?: string): Element | null {
  const list = el.getElementsByTagNameNS(ns ?? IDS_NS, localName);
  return list.length > 0 ? list[0] : null;
}

function getElements(el: Element, localName: string, ns?: string): Element[] {
  const list = el.getElementsByTagNameNS(ns ?? IDS_NS, localName);
  return Array.from(list);
}

function getText(el: Element | null): string {
  if (!el) return "";
  const text = el.textContent?.trim() ?? "";
  return text;
}

/**
 * Parse ids:idsValue – simpleValue nebo xs:restriction (enumeration, pattern, min/max, length)
 */
function parseIdsValue(parent: Element): IdsValue {
  const simpleEl = getFirstElement(parent, "simpleValue");
  if (simpleEl) {
    return { simpleValue: getText(simpleEl) };
  }
  const restriction = parent.getElementsByTagNameNS(XS_NS, "restriction").item(0) as Element | null;
  if (!restriction) return {};

  const getAttr = (localName: string): string | undefined => {
    const el = restriction!.getElementsByTagNameNS(XS_NS, localName).item(0);
    if (!el) return undefined;
    const v = (el as Element).getAttribute("value") ?? getText(el as Element);
    return v?.trim() || undefined;
  };
  const getNum = (localName: string): number | undefined => {
    const s = getAttr(localName);
    if (s == null) return undefined;
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? undefined : n;
  };

  const enums = getElements(restriction, "enumeration", XS_NS);
  if (enums.length > 0) {
    return {
      enumerations: enums.map((e) => (e.getAttribute("value") ?? getText(e)).trim()).filter(Boolean),
    };
  }
  const patternVal = getAttr("pattern");
  if (patternVal) return { pattern: patternVal };

  const minInclusive = getAttr("minInclusive");
  const maxInclusive = getAttr("maxInclusive");
  const minExclusive = getAttr("minExclusive");
  const maxExclusive = getAttr("maxExclusive");
  if (minInclusive != null || maxInclusive != null || minExclusive != null || maxExclusive != null) {
    return {
      minInclusive: minInclusive ?? minExclusive,
      maxInclusive: maxInclusive ?? maxExclusive,
      minExclusive,
      maxExclusive,
    };
  }

  const length = getNum("length");
  const minLength = getNum("minLength");
  const maxLength = getNum("maxLength");
  if (length != null || minLength != null || maxLength != null) {
    return { length, minLength, maxLength };
  }

  return {};
}

function valueToString(v: IdsValue): string {
  if (v.simpleValue !== undefined && v.simpleValue !== "") return v.simpleValue;
  if (v.enumerations && v.enumerations.length > 0) return v.enumerations.join("|");
  if (v.pattern) return v.pattern;
  if (v.minInclusive != null || v.maxInclusive != null) {
    return [v.minInclusive ?? "", v.maxInclusive ?? ""].filter(Boolean).join("|");
  }
  if (v.minLength != null || v.maxLength != null) return [v.minLength ?? "", v.maxLength ?? ""].filter((x) => x !== "").join("|");
  if (v.length != null) return String(v.length);
  return "";
}

/** Z IdsValue odvodit typ omezení a hodnotu pro požadavky v aplikaci */
function idsValueToConstraint(v: IdsValue): {
  constraint: "FILLED" | "ENUM" | "PATTERN" | "RANGE" | "LENGTH";
  value?: string;
  allowedValues?: string[];
} {
  if (v.enumerations && v.enumerations.length > 0) {
    return { constraint: "ENUM", value: v.enumerations.join("|"), allowedValues: v.enumerations };
  }
  if (v.pattern) return { constraint: "PATTERN", value: v.pattern };
  if (v.minInclusive != null || v.maxInclusive != null || v.minExclusive != null || v.maxExclusive != null) {
    const minVal = v.minInclusive ?? v.minExclusive ?? "";
    const maxVal = v.maxInclusive ?? v.maxExclusive ?? "";
    const parts: string[] = [];
    if (minVal) parts.push(`min:${minVal}:${v.minExclusive != null ? "exclusive" : "inclusive"}`);
    if (maxVal) parts.push(`max:${maxVal}:${v.maxExclusive != null ? "exclusive" : "inclusive"}`);
    return { constraint: "RANGE", value: parts.join("|") };
  }
  if (v.length != null || v.minLength != null || v.maxLength != null) {
    let val: string;
    if (v.length != null) {
      val = String(v.length);
    } else if (v.minLength != null && v.maxLength == null) {
      val = `min:${v.minLength}`;
    } else if (v.maxLength != null && v.minLength == null) {
      val = `max:${v.maxLength}`;
    } else {
      val = [v.minLength, v.maxLength]
        .filter((x) => x != null)
        .map(String)
        .join("|");
    }
    return { constraint: "LENGTH", value: val };
  }
  return { constraint: "FILLED", value: v.simpleValue ?? undefined };
}

function parseEntity(el: Element): IdsEntity {
  const nameEl = getFirstElement(el, "name");
  const nameVal = nameEl ? parseIdsValue(nameEl) : {};
  const ptEl = getFirstElement(el, "predefinedType");
  const ptVal = ptEl ? parseIdsValue(ptEl) : {};
  return {
    name: valueToString(nameVal).trim() || "",
    predefinedType: valueToString(ptVal).trim() || undefined,
  };
}

function parseClassification(el: Element): IdsClassification {
  const valueEl = getFirstElement(el, "value");
  const systemEl = getFirstElement(el, "system");
  const valueVal = valueEl ? parseIdsValue(valueEl) : {};
  const systemVal = systemEl ? parseIdsValue(systemEl) : {};
  const hasRestriction = !!(valueVal.enumerations?.length || valueVal.pattern || valueVal.minInclusive != null || valueVal.maxInclusive != null || valueVal.length != null || valueVal.minLength != null || valueVal.maxLength != null);
  return {
    value: valueToString(valueVal).trim() || undefined,
    valueRestriction: hasRestriction ? valueVal : undefined,
    system: valueToString(systemVal).trim() || "",
    uri: el.getAttribute("uri") ?? undefined,
    cardinality: (el.getAttribute("cardinality") as IdsClassification["cardinality"]) ?? undefined,
    instructions: el.getAttribute("instructions") ?? undefined,
  };
}

function parseProperty(el: Element): IdsProperty {
  const psetEl = getFirstElement(el, "propertySet");
  const baseEl = getFirstElement(el, "baseName");
  const valueEl = getFirstElement(el, "value");
  const psetVal = psetEl ? parseIdsValue(psetEl) : {};
  const baseVal = baseEl ? parseIdsValue(baseEl) : {};
  const valueVal = valueEl ? parseIdsValue(valueEl) : {};
  const hasRestriction = !!(valueVal.enumerations?.length || valueVal.pattern || valueVal.minInclusive != null || valueVal.maxInclusive != null || valueVal.length != null || valueVal.minLength != null || valueVal.maxLength != null);
  return {
    propertySet: valueToString(psetVal).trim() || "",
    baseName: valueToString(baseVal).trim() || "",
    value: valueToString(valueVal).trim() || undefined,
    valueRestriction: hasRestriction ? valueVal : undefined,
    dataType: el.getAttribute("dataType") ?? undefined,
    cardinality: (el.getAttribute("cardinality") as IdsProperty["cardinality"]) ?? undefined,
    uri: el.getAttribute("uri") ?? undefined,
    instructions: el.getAttribute("instructions") ?? undefined,
  };
}

function parseAttribute(el: Element): IdsAttribute {
  const nameEl = getFirstElement(el, "name");
  const valueEl = getFirstElement(el, "value");
  const nameVal = nameEl ? parseIdsValue(nameEl) : {};
  const valueVal = valueEl ? parseIdsValue(valueEl) : {};
  const hasRestriction = !!(valueVal.enumerations?.length || valueVal.pattern || valueVal.minInclusive != null || valueVal.maxInclusive != null || valueVal.length != null || valueVal.minLength != null || valueVal.maxLength != null);
  return {
    name: valueToString(nameVal).trim() || "",
    value: valueToString(valueVal).trim() || undefined,
    valueRestriction: hasRestriction ? valueVal : undefined,
    cardinality: (el.getAttribute("cardinality") as IdsAttribute["cardinality"]) ?? undefined,
    instructions: el.getAttribute("instructions") ?? undefined,
  };
}

function parsePartOf(el: Element): IdsPartOf {
  const entityEl = getFirstElement(el, "entity");
  return {
    entity: entityEl ? parseEntity(entityEl) : { name: "" },
    relation: el.getAttribute("relation") ?? undefined,
    cardinality: (el.getAttribute("cardinality") as IdsPartOf["cardinality"]) ?? undefined,
    instructions: el.getAttribute("instructions") ?? undefined,
  };
}

function parseMaterial(el: Element): IdsMaterial {
  const valueEl = getFirstElement(el, "value");
  const valueVal = valueEl ? parseIdsValue(valueEl) : {};
  const hasRestriction = !!(valueVal.enumerations?.length || valueVal.pattern || valueVal.minInclusive != null || valueVal.maxInclusive != null || valueVal.length != null || valueVal.minLength != null || valueVal.maxLength != null);
  return {
    value: valueToString(valueVal).trim() || undefined,
    valueRestriction: hasRestriction ? valueVal : undefined,
    cardinality: (el.getAttribute("cardinality") as IdsMaterial["cardinality"]) ?? undefined,
    uri: el.getAttribute("uri") ?? undefined,
    instructions: el.getAttribute("instructions") ?? undefined,
  };
}

function parseApplicability(el: Element): IdsApplicability {
  const entityEl = getFirstElement(el, "entity");
  return {
    entity: entityEl ? parseEntity(entityEl) : undefined,
    partOf: getElements(el, "partOf").map(parsePartOf),
    classification: getElements(el, "classification").map(parseClassification),
    attribute: getElements(el, "attribute").map(parseAttribute),
    property: getElements(el, "property").map(parseProperty),
    material: getElements(el, "material").map(parseMaterial),
  };
}

function parseRequirements(el: Element): IdsRequirements {
  return {
    entity: getElements(el, "entity").map((e) => ({ ...parseEntity(e), instructions: e.getAttribute("instructions") ?? undefined })),
    partOf: getElements(el, "partOf").map(parsePartOf),
    classification: getElements(el, "classification").map(parseClassification),
    attribute: getElements(el, "attribute").map(parseAttribute),
    property: getElements(el, "property").map(parseProperty),
    material: getElements(el, "material").map(parseMaterial),
  };
}

/**
 * Parse IDS XML string into typed structure.
 */
export function parseIdsXml(xmlString: string): IdsParsed {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");
  const root = doc.documentElement;
  if (getLocalName(root) !== "ids" && root.nodeName !== "ids") {
    const err = doc.querySelector("parsererror");
    throw new Error(err ? getText(err as Element) : "Neplatný IDS soubor: očekává se kořenový element ids");
  }

  const infoEl = getFirstElement(root, "info");
  const info: IdsInfo = {};
  if (infoEl) {
    const text = (tag: string) => getText(getFirstElement(infoEl, tag));
    info.title = text("title");
    info.copyright = text("copyright") || undefined;
    info.version = text("version") || undefined;
    info.description = text("description") || undefined;
    info.author = text("author") || undefined;
    info.date = text("date") || undefined;
    info.purpose = text("purpose") || undefined;
    info.milestone = text("milestone") || undefined;
  }

  const specsEl = getFirstElement(root, "specifications");
  const specifications: IdsSpecification[] = [];
  if (specsEl) {
    const specEls = getElements(specsEl, "specification");
    for (const se of specEls) {
      const appEl = getFirstElement(se, "applicability");
      const reqEl = getFirstElement(se, "requirements");
      specifications.push({
        name: se.getAttribute("name") ?? "",
        ifcVersion: se.getAttribute("ifcVersion") ?? undefined,
        description: se.getAttribute("description") ?? undefined,
        identifier: se.getAttribute("identifier") ?? undefined,
        instructions: se.getAttribute("instructions") ?? undefined,
        applicability: appEl ? parseApplicability(appEl) : {
          partOf: [], classification: [], attribute: [], property: [], material: [],
        },
        requirements: reqEl ? parseRequirements(reqEl) : undefined,
      });
    }
  }

  return { info, specifications };
}

// --- Map IDS to Project ---

function entityToCode(entity: IdsEntity): string {
  const name = (entity.name || "").trim();
  if (!name) return "";
  const normalized = name.toUpperCase().startsWith("IFC") ? name : `Ifc${name}`;
  const pt = (entity.predefinedType || "").trim();
  if (pt) return `${normalized}::${pt.toUpperCase()}`;
  return normalized;
}

/**
 * Normalize IDS entity code to schema case so it matches schema keys (e.g. IFCWALL -> IfcWall).
 * Otherwise buildClassificationFromSchemaFiltered won't find the entity and the tree stays empty.
 */
function normalizeCodeToSchema(schema: SchemaIndex, code: string): string {
  const [entityPart, ptPart] = code.includes("::") ? code.split("::") : [code, undefined];
  const entityUpper = (entityPart ?? "").toUpperCase();
  const schemaEntityName = Object.keys(schema.entities).find((e) => e.toUpperCase() === entityUpper);
  if (!schemaEntityName) return code; // keep original if not in schema
  const entity = schema.entities[schemaEntityName];
  if (!ptPart) return schemaEntityName;
  const ptUpper = ptPart.toUpperCase();
  const schemaPt = entity?.predefinedTypeValues?.find((p) => p.toUpperCase() === ptUpper);
  if (schemaPt) return `${schemaEntityName}::${schemaPt}`;
  return `${schemaEntityName}::${ptPart}`;
}

function occurrenceFromCardinality(c?: string): "required" | "prohibited" | "optional" {
  if (c === "prohibited") return "prohibited";
  if (c === "optional") return "optional";
  return "required";
}

/**
 * Determine property source from propertySet name: Pset_ → PSET, Qto_ → QTO, else CUSTOM.
 */
function propertySource(psetName: string, schema: SchemaIndex | null): PropertyRequirement["source"] {
  const p = (psetName || "").trim();
  if (!p) return "CUSTOM";
  const lower = p.toLowerCase();
  if (lower.startsWith("pset_")) return "PSET";
  if (lower.startsWith("qto_")) return "QTO";
  if (schema) {
    if (schema.psets[p]) return "PSET";
    if (schema.qtos[p]) return "QTO";
  }
  return "CUSTOM";
}

function mapIdsPropertyToRequirement(
  p: IdsProperty,
  phaseIds: string[],
  schema: SchemaIndex | null,
): PropertyRequirement {
  const source = propertySource(p.propertySet, schema);
  const fromRestriction = p.valueRestriction
    ? idsValueToConstraint(p.valueRestriction)
    : null;
  const value = fromRestriction?.value ?? (p.value ?? "").trim();
  const constraint = fromRestriction?.constraint ?? (value.includes("|") ? "ENUM" : "FILLED");
  return {
    id: makeId(),
    extensions: {},
    phases: phaseIds,
    source,
    psetName: p.propertySet || (source === "CUSTOM" ? "Vlastní" : ""),
    propertyName: p.baseName || "",
    dataType: (p.dataType && p.dataType.trim()) ? p.dataType : "IfcLabel",
    required: p.cardinality === "required",
    occurrence: occurrenceFromCardinality(p.cardinality),
    constraint: constraint as PropertyRequirement["constraint"],
    value: value || undefined,
    allowedValues: fromRestriction?.allowedValues,
    note: p.instructions ?? undefined,
    isApplicability: false,
  };
}

function mapIdsAttributeToRequirement(a: IdsAttribute, phaseIds: string[]): AttributeRequirement {
  const fromRestriction = a.valueRestriction ? idsValueToConstraint(a.valueRestriction) : null;
  const value = fromRestriction?.value ?? a.value ?? undefined;
  const constraint = fromRestriction?.constraint ?? (a.value && a.value.includes("|") ? "ENUM" : "FILLED");
  return {
    id: makeId(),
    extensions: {},
    phases: phaseIds,
    attribute: a.name || "",
    required: a.cardinality === "required",
    occurrence: occurrenceFromCardinality(a.cardinality),
    constraint,
    value,
    allowedValues: fromRestriction?.allowedValues,
    note: a.instructions ?? undefined,
    isApplicability: false,
  };
}

function mapIdsClassificationToRequirement(
  c: IdsClassification,
  systemEntryId: string | undefined,
  phaseIds: string[],
): ClassificationRequirement {
  const fromRestriction = c.valueRestriction ? idsValueToConstraint(c.valueRestriction) : null;
  // ClassificationRequirement only supports FILLED | ENUM | PATTERN; RANGE/LENGTH stored as FILLED with value
  const constraintRaw = fromRestriction?.constraint ?? "FILLED";
  const constraint: ClassificationRequirement["constraint"] =
    constraintRaw === "RANGE" || constraintRaw === "LENGTH" ? "FILLED" : constraintRaw;
  const value = fromRestriction?.value ?? c.value ?? undefined;
  return {
    id: makeId(),
    extensions: {},
    phases: phaseIds,
    classificationId: systemEntryId ?? makeId(),
    systemEntryId,
    system: c.system || "",
    identification: c.value ?? value ?? "",
    value,
    name: c.value ?? value ?? c.system ?? "",
    occurrence: occurrenceFromCardinality(c.cardinality),
    constraint,
    readOnly: false,
    isApplicability: false,
  };
}

function mapIdsPartOfToRequirement(r: IdsPartOf, phaseIds: string[]): RelationRequirement {
  const relationType = (r.relation?.replace(/\s+/g, " ") as RelationRequirement["relationType"]) ?? "IFCRELCONTAINEDINSPATIALSTRUCTURE";
  return {
    id: makeId(),
    extensions: {},
    phases: phaseIds,
    relationType,
    occurrence: occurrenceFromCardinality(r.cardinality),
    entityType: r.entity?.name || undefined,
    entityPredefinedType: r.entity?.predefinedType ?? undefined,
    note: r.instructions ?? undefined,
    isApplicability: false,
  };
}

function mapIdsMaterialToRequirement(m: IdsMaterial, phaseIds: string[]): MaterialRequirement {
  const fromRestriction = m.valueRestriction ? idsValueToConstraint(m.valueRestriction) : null;
  const value = fromRestriction?.value ?? m.value ?? undefined;
  const constraint = fromRestriction?.constraint;
  return {
    id: makeId(),
    extensions: {},
    phases: phaseIds,
    required: m.cardinality === "required",
    occurrence: occurrenceFromCardinality(m.cardinality),
    constraint,
    value,
    note: m.instructions ?? undefined,
    isApplicability: false,
  };
}

/**
 * Merge IDS into project: add new objects (by IFC entity), IFC classification, other classifications, properties.
 * Existing objects are never overwritten; only new codes are added.
 */
export function mergeIdsIntoProject(
  parsed: IdsParsed,
  existingProject: Project | null,
  schemaIndex: SchemaIndex | null,
): Project {
  const phases: Phase[] = existingProject?.phases?.length
    ? existingProject.phases
    : getDefaultPhases();
  const phaseIds = phases.map((p) => p.id);

  // Collect all (entity, predefinedType) from IDS specifications; normalize to schema case so tree matches
  const entityCodes = new Set<string>();
  const specByCode = new Map<string, IdsSpecification>();
  for (const spec of parsed.specifications) {
    const app = spec.applicability;
    const entity = app?.entity;
    if (!entity?.name) continue;
    let code = entityToCode(entity);
    if (!code) continue;
    if (schemaIndex) code = normalizeCodeToSchema(schemaIndex, code);
    entityCodes.add(code);
    if (!specByCode.has(code)) {
      specByCode.set(code, spec);
    } else {
      // Merge requirements from multiple specs with same applicability into first
      const first = specByCode.get(code)!;
      const req = spec.requirements;
      if (req) {
        if (!first.requirements) first.requirements = {
          entity: [], partOf: [], classification: [], attribute: [], property: [], material: [],
        };
        first.requirements!.attribute.push(...req.attribute);
        first.requirements!.property.push(...req.property);
        first.requirements!.classification.push(...req.classification);
        first.requirements!.partOf.push(...req.partOf);
        first.requirements!.material.push(...req.material);
      }
    }
  }

  // IFC classification: strom NEOBSAHUJE nové entity z IDS – ty zůstanou v „Entity mimo hierarchii“ (žluté)
  // až do potvrzení „Přidat do hierarchie“; teprve pak se přidají do stromu
  let ifcEntry: ClassificationSystemEntry | null = existingProject?.classificationSystemEntries?.find((e) => e.isIfcSystem) ?? null;
  if (schemaIndex) {
    const existingCodes = ifcEntry ? new Set(collectLeaves(ifcEntry.nodes ?? []).map((n) => n.code)) : new Set<string>();
    const ifcData = buildClassificationFromSchemaFiltered(schemaIndex, existingCodes);
    if (ifcEntry) {
      ifcEntry = { ...ifcEntry, nodes: ifcData.nodes, hash: ifcData.hash };
    } else {
      ifcEntry = {
        id: makeId(),
        name: "Třídění dle IFC entit",
        sourceName: "Třídění dle IFC entit",
        nodes: ifcData.nodes,
        hash: ifcData.hash,
        isPrimary: !existingProject,
        isIfcSystem: true,
        systemKind: "ifc",
      };
    }
  } else {
    if (!ifcEntry) {
      ifcEntry = {
        id: makeId(),
        name: "Třídění dle IFC entit",
        sourceName: "Třídění dle IFC entit",
        nodes: [],
        hash: "ids-empty",
        isPrimary: !existingProject,
        isIfcSystem: true,
        systemKind: "ifc",
      };
    }
  }

  // Other classifications from IDS (system names)
  const classificationSystems = new Map<string, IdsClassification[]>();
  for (const spec of parsed.specifications) {
    const app = spec.applicability;
    const req = spec.requirements;
    for (const c of [...(app?.classification ?? []), ...(req?.classification ?? [])]) {
      if (!c.system) continue;
      if (!classificationSystems.has(c.system)) {
        classificationSystems.set(c.system, []);
      }
      classificationSystems.get(c.system)!.push(c);
    }
  }

  const entries: ClassificationSystemEntry[] = existingProject?.classificationSystemEntries ?? [];
  const updatedEntries = entries.map((e) => (e.id === ifcEntry?.id ? ifcEntry : { ...e, isPrimary: false }));
  if (ifcEntry && !updatedEntries.some((e) => e.id === ifcEntry!.id)) {
    updatedEntries.push(ifcEntry);
  }
  // Při importu IDS je primární vždy IFC, aby se v hierarchii zobrazily importované entity
  const primaryId = ifcEntry?.id ?? existingProject?.primaryClassificationId ?? makeId();
  const primaryEntry: ClassificationSystemEntry =
    updatedEntries.find((e) => e.id === primaryId) ??
    ifcEntry ??
    {
      id: primaryId,
      name: "Klasifikace",
      sourceName: "Klasifikace",
      nodes: [],
      hash: "",
      isPrimary: true,
      systemKind: "classification",
    };
  const primaryName = primaryEntry.name;
  const updatedEntriesWithPrimary = updatedEntries.map((e) => ({
    ...e,
    isPrimary: e.id === primaryEntry.id,
  }));

  const classificationData: ClassificationData = {
    nodes: primaryEntry.nodes ?? [],
    sourceName: primaryEntry.sourceName ?? primaryEntry.name,
    hash: primaryEntry.hash,
  };

  const objects: Record<string, ProjectObject> = { ...(existingProject?.objects ?? {}) };

  for (const code of entityCodes) {
    if (objects[code]) continue; // never overwrite existing
    const spec = specByCode.get(code);
    const app = spec?.applicability;
    const [entityName, predefinedType] = code.includes("::") ? code.split("::") : [code, undefined];

    const requirements: ObjectRequirements = {
      attributes: [],
      properties: [],
      relations: [],
      classifications: [],
      materials: [],
    };

    // Primary classification (IFC) - link to primary/system
    requirements.classifications.push({
      id: makeId(),
      classificationId: primaryId,
      systemEntryId: ifcEntry?.id,
      system: primaryName,
      identification: code,
      value: code,
      name: code,
      readOnly: true,
      occurrence: "required",
      isApplicability: true,
      extensions: {},
      phases: phaseIds,
    });

    // Applicability classifications (other systems)
    for (const c of app?.classification ?? []) {
      requirements.classifications.push({
        ...mapIdsClassificationToRequirement(c, undefined, phaseIds),
        isApplicability: true,
      });
    }
    // Requirements classifications
    for (const c of spec?.requirements?.classification ?? []) {
      requirements.classifications.push(mapIdsClassificationToRequirement(c, undefined, phaseIds));
    }

    // Attributes (applicability + requirements)
    for (const a of app?.attribute ?? []) {
      requirements.attributes.push({ ...mapIdsAttributeToRequirement(a, phaseIds), isApplicability: true });
    }
    for (const a of spec?.requirements?.attribute ?? []) {
      requirements.attributes.push(mapIdsAttributeToRequirement(a, phaseIds));
    }

    // Properties: group by propertySet; source PSET/QTO/CUSTOM
    for (const p of app?.property ?? []) {
      const req = mapIdsPropertyToRequirement(p, phaseIds, schemaIndex);
      req.isApplicability = true;
      requirements.properties.push(req);
    }
    for (const p of spec?.requirements?.property ?? []) {
      requirements.properties.push(mapIdsPropertyToRequirement(p, phaseIds, schemaIndex));
    }

    // PartOf (relations)
    for (const r of app?.partOf ?? []) {
      requirements.relations.push({ ...mapIdsPartOfToRequirement(r, phaseIds), isApplicability: true });
    }
    for (const r of spec?.requirements?.partOf ?? []) {
      requirements.relations.push(mapIdsPartOfToRequirement(r, phaseIds));
    }

    // Materials
    for (const m of app?.material ?? []) {
      requirements.materials.push({ ...mapIdsMaterialToRequirement(m, phaseIds), isApplicability: true });
    }
    for (const m of spec?.requirements?.material ?? []) {
      requirements.materials.push(mapIdsMaterialToRequirement(m, phaseIds));
    }

    // Název objektu z applicability: IFC entita + typ (predefined type) – zobrazí se v hierarchii
    const fromApplicability = entityName
      ? (predefinedType ? `${entityName} – ${predefinedType}` : entityName).trim()
      : "";
    const description = fromApplicability || spec?.name || code;
    const specMeta = (spec?.name || spec?.identifier || spec?.description || spec?.instructions)
      ? {
          name: spec?.name,
          ifcVersion: (spec?.ifcVersion as "IFC2X3" | "IFC4" | "IFC4X3_ADD2") ?? undefined,
          identifier: spec?.identifier,
          description: spec?.description,
          instructions: spec?.instructions,
        }
      : undefined;
    const idsSpecMetadata = specMeta
      ? { [`all|all`]: specMeta }
      : undefined;
    objects[code] = {
      code,
      description,
      ifcEntity: entityName ?? code,
      predefinedType: predefinedType
        ? { mode: "ENUM", value: predefinedType }
        : { mode: "NONE" },
      ifcEntityPhases: phaseIds,
      predefinedTypePhases: phaseIds,
      idsSpecMetadata,
      requirements,
    };
  }

  const now = new Date().toISOString();
  const info = parsed.info;
  const importedIdsMetadata = (info.title || info.copyright || info.version || info.description || info.author || info.date || info.purpose || info.milestone)
    ? {
        title: info.title,
        copyright: info.copyright,
        version: info.version,
        description: info.description,
        author: info.author,
        date: info.date,
        purpose: info.purpose,
        milestone: info.milestone,
      }
    : undefined;
  // Verze IFC z první specification v IDS (ifcVersion), aby projekt odpovídal importovanému souboru
  const idsVersion = parsed.specifications.find((s) => s.ifcVersion)?.ifcVersion;
  const ifcSchemaVersion = idsIfcVersionToSchemaVersion(idsVersion);
  const ifcSchemaVersionDisplay = getDisplayLabel(ifcSchemaVersion);
  let project: Project;
  if (existingProject) {
    project = ensureProjectPhases({
      ...existingProject,
      idsMetadata: importedIdsMetadata ?? existingProject.idsMetadata,
      classification: classificationData,
      classificationSystemEntries: updatedEntriesWithPrimary,
      primaryClassificationId: primaryId,
      objects,
      ifcSchemaVersion,
      ifcSchemaVersionDisplay,
      updatedAt: now,
    });
  } else {
    project = ensureProjectPhases({
      projectId: makeId(),
      name: parsed.info.title || "Projekt z IDS",
      author: parsed.info.author ?? "",
      description: parsed.info.description ?? undefined,
      idsMetadata: importedIdsMetadata,
      createdAt: now,
      updatedAt: now,
      ifcSchemaVersion,
      ifcSchemaVersionDisplay,
      classification: classificationData,
      classifications: [],
      primaryClassificationId: primaryId,
      phases,
      objects,
      codeLists: [],
      classificationSystemEntries: updatedEntriesWithPrimary,
    });
  }

  return project;
}
