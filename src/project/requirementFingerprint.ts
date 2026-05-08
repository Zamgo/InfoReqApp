import type {
  AttributeRequirement,
  ClassificationRequirement,
  MaterialRequirement,
  ObjectRequirements,
  Project,
  ProjectObject,
  PropertyRequirement,
  RelationRequirement,
} from "./types";

const FINGERPRINT_VERSION = "v1";

type NormalizedAttribute = Pick<
  AttributeRequirement,
  "attribute" | "constraint" | "value" | "allowedValues" | "occurrence" | "dataType" | "unit"
> & {
  enumCodeListId?: string;
};

type NormalizedProperty = Pick<
  PropertyRequirement,
  "source" | "psetName" | "propertyName" | "dataType" | "constraint" | "value" | "allowedValues" | "occurrence"
> & {
  enumCodeListId?: string;
};

type NormalizedClassification = Pick<
  ClassificationRequirement,
  "classificationId" | "systemEntryId" | "system" | "identification" | "value" | "constraint" | "occurrence"
>;

type NormalizedMaterial = Pick<
  MaterialRequirement,
  "categoryMode" | "category" | "constraint" | "value" | "occurrence"
> & {
  enumCodeListId?: string;
};

type NormalizedRelation = Pick<
  RelationRequirement,
  "relationType" | "entityType" | "entityPredefinedType" | "occurrence" | "minCardinality" | "maxCardinality"
>;

interface NormalizedRequirements {
  attributes: NormalizedAttribute[];
  properties: NormalizedProperty[];
  relations: NormalizedRelation[];
  classifications: NormalizedClassification[];
  materials: NormalizedMaterial[];
}

const ENUM_CODELIST_ID_KEY = "enumCodeListId";

const normalizeString = (value: string | undefined | null): string => (value ?? "").trim();

const normalizeStringArray = (values: string[] | undefined | null): string[] => {
  if (!values || values.length === 0) return [];
  return [...values].map((v) => v.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
};

const extractEnumCodeListId = (extensions: Record<string, unknown> | undefined): string | undefined => {
  if (!extensions) return undefined;
  const raw = extensions[ENUM_CODELIST_ID_KEY];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
};

const normalizeAttribute = (attr: AttributeRequirement): NormalizedAttribute => {
  return {
    attribute: normalizeString(attr.attribute),
    constraint: attr.constraint,
    value: normalizeString(attr.value),
    allowedValues: normalizeStringArray(attr.allowedValues),
    occurrence: attr.occurrence,
    dataType: normalizeString(attr.dataType),
    unit: normalizeString(attr.unit),
    enumCodeListId: extractEnumCodeListId(attr.extensions),
  };
};

const normalizeProperty = (prop: PropertyRequirement): NormalizedProperty => {
  return {
    source: prop.source,
    psetName: normalizeString(prop.psetName),
    propertyName: normalizeString(prop.propertyName),
    dataType: normalizeString(prop.dataType),
    constraint: prop.constraint,
    value: normalizeString(prop.value),
    allowedValues: normalizeStringArray(prop.allowedValues),
    occurrence: prop.occurrence,
    enumCodeListId: extractEnumCodeListId(prop.extensions),
  };
};

const normalizeClassification = (cls: ClassificationRequirement): NormalizedClassification => {
  return {
    classificationId: normalizeString(cls.classificationId),
    systemEntryId: cls.systemEntryId ? normalizeString(cls.systemEntryId) : undefined,
    system: normalizeString(cls.system),
    identification: normalizeString(cls.identification),
    value: normalizeString(cls.value),
    constraint: cls.constraint,
    occurrence: cls.occurrence,
  };
};

const normalizeMaterial = (mat: MaterialRequirement): NormalizedMaterial => {
  return {
    categoryMode: mat.categoryMode,
    category: normalizeString(mat.category),
    constraint: mat.constraint,
    value: normalizeString(mat.value),
    occurrence: mat.occurrence,
    enumCodeListId: extractEnumCodeListId(mat.extensions),
  };
};

const normalizeRelation = (rel: RelationRequirement): NormalizedRelation => {
  return {
    relationType: rel.relationType,
    entityType: normalizeString(rel.entityType),
    entityPredefinedType: normalizeString(rel.entityPredefinedType),
    occurrence: rel.occurrence,
    minCardinality: rel.minCardinality,
    maxCardinality: rel.maxCardinality,
  };
};

const normalizeRequirements = (requirements: ObjectRequirements): NormalizedRequirements => {
  // Primárne klasifikácie sú readOnly/isApplicability a viazané na code/description objektu.
  // Aby každý objekt nemal unikátny fingerprint len kvôli primárnej klasifikácii,
  // vynecháme tie klasifikácie, ktoré sú readOnly alebo isApplicability.
  const filteredClassifications = requirements.classifications.filter(
    (c) => !c.readOnly && !c.isApplicability,
  );

  const attributes = requirements.attributes.map(normalizeAttribute).sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
  const properties = requirements.properties.map(normalizeProperty).sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
  const relations = requirements.relations.map(normalizeRelation).sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
  const classifications = filteredClassifications.map(normalizeClassification).sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
  const materials = requirements.materials.map(normalizeMaterial).sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );

  return {
    attributes,
    properties,
    relations,
    classifications,
    materials,
  };
};

const simpleHash = (input: string): string => {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const chr = input.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  // Convert to unsigned and hex
  return (hash >>> 0).toString(16);
};

export const computeRequirementsFingerprint = (requirements: ObjectRequirements): string => {
  const normalized = normalizeRequirements(requirements);
  const payload = JSON.stringify(normalized);
  const hash = simpleHash(payload);
  return `${FINGERPRINT_VERSION}:${hash}`;
};

export interface RequirementGroupSummary {
  fingerprint: string;
  objectCodes: string[];
  representative: ProjectObject;
}

export const groupObjectsByRequirements = (project: Project): RequirementGroupSummary[] => {
  const map = new Map<string, { representative: ProjectObject; codes: string[] }>();

  for (const [code, obj] of Object.entries(project.objects)) {
    const fp = computeRequirementsFingerprint(obj.requirements);
    const existing = map.get(fp);
    if (existing) {
      existing.codes.push(code);
    } else {
      map.set(fp, { representative: obj, codes: [code] });
    }
  }

  return Array.from(map.entries())
    .map(([fingerprint, { representative, codes }]) => ({
      fingerprint,
      representative,
      objectCodes: codes.sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => b.objectCodes.length - a.objectCodes.length);
};

// ---------------------------------------------------------------------------
// Per-item requirement grouping
// ---------------------------------------------------------------------------

export type RequirementItemKind = "pset" | "attribute" | "classification" | "material" | "relation";

export interface RequirementItemGroup {
  kind: RequirementItemKind;
  fingerprint: string;
  label: string;
  objectCodes: string[];
  representativeItems:
    | PropertyRequirement[]
    | [AttributeRequirement]
    | [ClassificationRequirement]
    | [MaterialRequirement]
    | [RelationRequirement];
}

export const computePsetFingerprint = (psetName: string, properties: PropertyRequirement[]): string => {
  const normalized = properties
    .map(normalizeProperty)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const payload = JSON.stringify({ psetName: normalizeString(psetName), properties: normalized });
  return `pset:${simpleHash(payload)}`;
};

export const computeAttributeItemFingerprint = (attr: AttributeRequirement): string => {
  const payload = JSON.stringify(normalizeAttribute(attr));
  return `attr:${simpleHash(payload)}`;
};

export const computeClassificationItemFingerprint = (cls: ClassificationRequirement): string => {
  const payload = JSON.stringify(normalizeClassification(cls));
  return `cls:${simpleHash(payload)}`;
};

export const computeMaterialItemFingerprint = (mat: MaterialRequirement): string => {
  const payload = JSON.stringify(normalizeMaterial(mat));
  return `mat:${simpleHash(payload)}`;
};

export const computeRelationItemFingerprint = (rel: RelationRequirement): string => {
  const payload = JSON.stringify(normalizeRelation(rel));
  return `rel:${simpleHash(payload)}`;
};

const buildPsetLabel = (psetName: string, count: number): string => {
  const name = psetName || "(bez názvu)";
  return `${name} (${count} vl.)`;
};

export const groupRequirementsByItem = (project: Project): RequirementItemGroup[] => {
  const map = new Map<string, { kind: RequirementItemKind; label: string; codes: Set<string>; representative: RequirementItemGroup["representativeItems"] }>();

  for (const [code, obj] of Object.entries(project.objects)) {
    const reqs = obj.requirements;

    // Properties grouped by psetName
    const psetMap = new Map<string, PropertyRequirement[]>();
    for (const prop of reqs.properties) {
      const key = (prop.psetName ?? "").trim();
      const arr = psetMap.get(key);
      if (arr) arr.push(prop);
      else psetMap.set(key, [prop]);
    }
    for (const [psetName, props] of psetMap) {
      const fp = computePsetFingerprint(psetName, props);
      const existing = map.get(fp);
      if (existing) {
        existing.codes.add(code);
      } else {
        map.set(fp, {
          kind: "pset",
          label: buildPsetLabel(psetName, props.length),
          codes: new Set([code]),
          representative: props,
        });
      }
    }

    // Attributes – each one individually
    for (const attr of reqs.attributes) {
      if (attr.isApplicability) continue;
      const fp = computeAttributeItemFingerprint(attr);
      const existing = map.get(fp);
      if (existing) {
        existing.codes.add(code);
      } else {
        map.set(fp, {
          kind: "attribute",
          label: attr.attribute || "(bez názvu)",
          codes: new Set([code]),
          representative: [attr],
        });
      }
    }

    // Classifications – each one individually (skip readOnly / applicability)
    for (const cls of reqs.classifications) {
      if (cls.readOnly || cls.isApplicability) continue;
      const fp = computeClassificationItemFingerprint(cls);
      const existing = map.get(fp);
      if (existing) {
        existing.codes.add(code);
      } else {
        map.set(fp, {
          kind: "classification",
          label: cls.system || cls.name || "(bez názvu)",
          codes: new Set([code]),
          representative: [cls],
        });
      }
    }

    // Materials – each one individually
    for (const mat of reqs.materials) {
      if (mat.isApplicability) continue;
      const fp = computeMaterialItemFingerprint(mat);
      const existing = map.get(fp);
      if (existing) {
        existing.codes.add(code);
      } else {
        map.set(fp, {
          kind: "material",
          label: mat.category || mat.value || "(bez názvu)",
          codes: new Set([code]),
          representative: [mat],
        });
      }
    }

    // Relations – each one individually
    for (const rel of reqs.relations) {
      if (rel.isApplicability) continue;
      const fp = computeRelationItemFingerprint(rel);
      const existing = map.get(fp);
      if (existing) {
        existing.codes.add(code);
      } else {
        map.set(fp, {
          kind: "relation",
          label: `${rel.relationType || ""} ${rel.entityType || ""}`.trim() || "(bez názvu)",
          codes: new Set([code]),
          representative: [rel],
        });
      }
    }
  }

  return Array.from(map.entries())
    .map(([fingerprint, { kind, label, codes, representative }]) => ({
      kind,
      fingerprint,
      label,
      objectCodes: Array.from(codes).sort((a, b) => a.localeCompare(b)),
      representativeItems: representative,
    }))
    .sort((a, b) => b.objectCodes.length - a.objectCodes.length || a.label.localeCompare(b.label));
};

