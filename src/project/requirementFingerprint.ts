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
import {
  getIdsProjectedFacetId,
  getIdsProjectedFacetSection,
  getIdsProjectedSpecificationId,
  projectIdsRequirementsForEntity,
} from "../ids/requirementProjection";
import { idsConstraintAlternatives, specificationReferencesEntity } from "../ids/specifications";

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
  origin: "project" | "ids";
  fingerprint: string;
  label: string;
  objectCodes: string[];
  idsReference?: {
    specificationId: string;
    section: "applicability" | "requirements";
    facetIds: string[];
  };
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
  const map = new Map<string, {
    kind: RequirementItemKind;
    origin: "project" | "ids";
    label: string;
    codes: Set<string>;
    representative: RequirementItemGroup["representativeItems"];
    idsReference?: RequirementItemGroup["idsReference"];
  }>();

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
          origin: "project",
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
          origin: "project",
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
          origin: "project",
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
          origin: "project",
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
          origin: "project",
          label: `${rel.relationType || ""} ${rel.entityType || ""}`.trim() || "(bez názvu)",
          codes: new Set([code]),
          representative: [rel],
        });
      }
    }
  }

  // Kanonické IDS skupiny jsou odvozený index. Namespace obsahuje specifikaci
  // a sekci, takže stejnojmenné Psety z různých specifikací se nikdy neslijí.
  for (const specification of project.idsSpecifications ?? []) {
    const objectCodes = Object.entries(project.objects)
      .filter(([, object]) => specificationReferencesEntity(
        specification,
        object.ifcEntity,
        object.predefinedType.mode === "ENUM" ? object.predefinedType.value : undefined,
      ))
      .map(([code]) => code)
      .sort((a, b) => a.localeCompare(b));
    const firstObject = objectCodes.length ? project.objects[objectCodes[0]] : undefined;
    const entityFacet = specification.applicability.find((facet) => facet.kind === "entity");
    const fallbackEntity = entityFacet?.kind === "entity"
      ? idsConstraintAlternatives(entityFacet.name)[0]
      : undefined;
    const entity = firstObject?.ifcEntity || fallbackEntity;
    if (!entity) continue;
    const predefined = firstObject?.predefinedType.mode === "ENUM"
      ? firstObject.predefinedType.value
      : entityFacet?.kind === "entity"
        ? idsConstraintAlternatives(entityFacet.predefinedType)[0]
        : undefined;
    const projection = projectIdsRequirementsForEntity(
      { idsSpecifications: [specification], phases: project.phases },
      entity,
      predefined,
    );
    const addIdsGroup = (
      kind: RequirementItemKind,
      section: "applicability" | "requirements",
      facetIds: string[],
      label: string,
      representative: RequirementItemGroup["representativeItems"],
    ) => {
      if (!facetIds.length) return;
      const fp = `ids:${specification.id}:${section}:${kind}:${facetIds.join(",")}`;
      map.set(fp, {
        kind,
        origin: "ids",
        label: `${specification.name || specification.identifier || "IDS"} · ${label}`,
        codes: new Set(objectCodes),
        representative,
        idsReference: { specificationId: specification.id, section, facetIds },
      });
    };

    const projectedProperties = projection.properties.filter(
      (item) => getIdsProjectedSpecificationId(item) === specification.id,
    );
    const psetBuckets = new Map<string, PropertyRequirement[]>();
    projectedProperties.forEach((item) => {
      const section = getIdsProjectedFacetSection(item) ?? "requirements";
      const key = `${section}\u0000${item.psetName}`;
      psetBuckets.set(key, [...(psetBuckets.get(key) ?? []), item]);
    });
    psetBuckets.forEach((items, key) => {
      const [section, psetName] = key.split("\u0000") as ["applicability" | "requirements", string];
      addIdsGroup(
        "pset",
        section,
        items.map(getIdsProjectedFacetId).filter((id): id is string => Boolean(id)),
        buildPsetLabel(psetName, items.length),
        items,
      );
    });

    const addSingles = <T extends AttributeRequirement | ClassificationRequirement | MaterialRequirement | RelationRequirement>(
      kind: Exclude<RequirementItemKind, "pset">,
      items: T[],
      label: (item: T) => string,
    ) => {
      items.forEach((item) => {
        const section = getIdsProjectedFacetSection(item) ?? "requirements";
        const facetId = getIdsProjectedFacetId(item);
        if (!facetId) return;
        addIdsGroup(kind, section, [facetId], label(item), [item] as RequirementItemGroup["representativeItems"]);
      });
    };
    addSingles("attribute", projection.attributes, (item) => item.attribute || "(bez názvu)");
    addSingles("classification", projection.classifications, (item) => item.system || item.name || "(bez názvu)");
    addSingles("material", projection.materials, (item) => item.category || item.value || "(bez názvu)");
    addSingles("relation", projection.relations, (item) =>
      `${item.relationType || ""} ${item.entityType || ""}`.trim() || "(bez názvu)");
  }

  return Array.from(map.entries())
    .map(([fingerprint, { kind, origin, label, codes, representative, idsReference }]) => ({
      kind,
      origin,
      fingerprint,
      label,
      objectCodes: Array.from(codes).sort((a, b) => a.localeCompare(b)),
      representativeItems: representative,
      idsReference,
    }))
    .sort((a, b) => b.objectCodes.length - a.objectCodes.length || a.label.localeCompare(b.label));
};

/** Zda se skupina týká právě zvolené entity. U IDS rozhoduje zdrojová
 * specification applicability, u projektových skupin jejich skutečná přiřazení. */
export const requirementGroupMatchesEntity = (
  group: RequirementItemGroup,
  project: Project,
  ifcEntity: string,
  predefinedType?: string,
): boolean => {
  if (!ifcEntity) return true;
  if (group.origin === "ids" && group.idsReference) {
    const specification = (project.idsSpecifications ?? []).find(
      (item) => item.id === group.idsReference?.specificationId,
    );
    return specification
      ? specificationReferencesEntity(specification, ifcEntity, predefinedType)
      : false;
  }
  const normalizedEntity = ifcEntity.trim().toUpperCase();
  const normalizedPredefined = predefinedType?.trim().toUpperCase();
  return group.objectCodes.some((code) => {
    const object = project.objects[code];
    if (!object || object.ifcEntity.trim().toUpperCase() !== normalizedEntity) return false;
    if (!normalizedPredefined) return true;
    const objectPredefined =
      object.predefinedType.mode === "ENUM" || object.predefinedType.mode === "USERDEFINED"
        ? object.predefinedType.value?.trim().toUpperCase()
        : "NOTDEFINED";
    return (objectPredefined || "NOTDEFINED") === normalizedPredefined;
  });
};
