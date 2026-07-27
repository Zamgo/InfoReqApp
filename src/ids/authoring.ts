import type {
  AttributeRequirement,
  ClassificationRequirement,
  IdsAuthoringScope,
  IdsProjectEntityFacet,
  IdsProjectFacet,
  IdsProjectSpecification,
  IdsValueConstraint,
  MaterialRequirement,
  Project,
  PropertyRequirement,
  RelationRequirement,
} from "../project/types";
import type { RequirementItemGroup } from "../project/requirementFingerprint";
import {
  computeAttributeItemFingerprint,
  computeClassificationItemFingerprint,
  computeMaterialItemFingerprint,
  computePsetFingerprint,
  computeRelationItemFingerprint,
} from "../project/requirementFingerprint";
import { makeId } from "../utils/id";
import {
  getSpecificationEntityFacet,
  idsConstraintAlternatives,
  specificationReferencesEntity,
} from "./specifications";

export type IdsFacetSection = "applicability" | "requirements";
export type IdsReimportChoice = "keep-local" | "accept-import" | "duplicate-both";

export interface IdsValidationResult {
  errors: string[];
  warnings: string[];
}

export interface IdsReimportConflict {
  sourceKey: string;
  existingId: string;
  incomingId: string;
  name: string;
  localHash: string;
  incomingHash: string;
  lastAcceptedHash: string;
}

export interface IdsObjectSelection {
  entity: string;
  predefinedTypes: string[];
  objectCodes: string[];
}

const clone = <T,>(value: T): T =>
  typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;

const normalizeText = (value: string | undefined): string => (value ?? "").trim();

const stableValue = (value: IdsValueConstraint | undefined): unknown => {
  if (!value) return undefined;
  return {
    base: value.base,
    simpleValue: value.simpleValue,
    enumerations: value.enumerations ? [...value.enumerations] : undefined,
    pattern: value.pattern,
    minInclusive: value.minInclusive,
    maxInclusive: value.maxInclusive,
    minExclusive: value.minExclusive,
    maxExclusive: value.maxExclusive,
    length: value.length,
    minLength: value.minLength,
    maxLength: value.maxLength,
  };
};

const stableFacet = (facet: IdsProjectFacet): unknown => {
  const base = {
    kind: facet.kind,
    cardinality: facet.cardinality,
    instructions: facet.instructions,
    uri: facet.uri,
  };
  switch (facet.kind) {
    case "entity":
      return { ...base, name: stableValue(facet.name), predefinedType: stableValue(facet.predefinedType) };
    case "attribute":
      return { ...base, name: stableValue(facet.name), value: stableValue(facet.value) };
    case "classification":
      return { ...base, system: stableValue(facet.system), value: stableValue(facet.value) };
    case "property":
      return {
        ...base,
        propertySet: stableValue(facet.propertySet),
        baseName: stableValue(facet.baseName),
        value: stableValue(facet.value),
        dataType: facet.dataType,
      };
    case "material":
      return { ...base, value: stableValue(facet.value) };
    case "partOf":
      return {
        ...base,
        relation: facet.relation,
        entity: stableFacet(facet.entity),
      };
  }
};

const fnv1a = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

/** Hash pouze standardního IDS významu; interní scope, překlady a katalogové vazby ignoruje. */
export const hashIdsStandardSpecification = (
  specification: IdsProjectSpecification,
): string => fnv1a(JSON.stringify({
  name: specification.name,
  ifcVersion: specification.ifcVersion,
  identifier: specification.identifier,
  description: specification.description,
  instructions: specification.instructions,
  minOccurs: specification.minOccurs,
  maxOccurs: specification.maxOccurs,
  applicability: specification.applicability.map(stableFacet),
  requirements: specification.requirements.map(stableFacet),
}));

export const idsSourceKey = (
  specification: Pick<IdsProjectSpecification, "identifier" | "name">,
  index: number,
): string => specification.identifier?.trim() || `${index + 1}:${normalizeText(specification.name)}`;

export const effectiveIdsScope = (
  specification: Pick<IdsProjectSpecification, "authoring">,
  facet?: Pick<IdsProjectFacet, "authoring">,
): IdsAuthoringScope | undefined => facet?.authoring?.scope ?? specification.authoring?.scope;

export const idsScopeApplies = (
  scope: IdsAuthoringScope | undefined,
  phaseId?: string,
  useCaseId?: string,
): boolean => {
  if (!scope) return true;
  if (phaseId && scope.phaseIds?.length && !scope.phaseIds.includes(phaseId)) return false;
  if (useCaseId) {
    if (scope.useCaseMode === "excluded") return false;
    if (
      scope.useCaseMode === "custom" &&
      scope.useCaseIds?.length &&
      !scope.useCaseIds.includes(useCaseId)
    ) return false;
  }
  return true;
};

export const filterSpecificationForScope = (
  specification: IdsProjectSpecification,
  phaseId?: string,
  useCaseId?: string,
): IdsProjectSpecification | null => {
  if (!idsScopeApplies(specification.authoring?.scope, phaseId, useCaseId)) return null;
  const include = (facet: IdsProjectFacet) =>
    idsScopeApplies(effectiveIdsScope(specification, facet), phaseId, useCaseId);
  const scoped = {
    ...specification,
    applicability: specification.applicability.filter(include),
    requirements: specification.requirements.filter(include),
  };
  return getSpecificationEntityFacet(scoped) ? scoped : null;
};

const constraintHasValue = (value: IdsValueConstraint | undefined): boolean => {
  if (!value) return false;
  return value.simpleValue !== undefined ||
    Boolean(value.enumerations?.some((item) => item.trim())) ||
    value.pattern !== undefined ||
    value.minInclusive !== undefined ||
    value.minExclusive !== undefined ||
    value.maxInclusive !== undefined ||
    value.maxExclusive !== undefined ||
    value.length !== undefined ||
    value.minLength !== undefined ||
    value.maxLength !== undefined;
};

const validateConstraint = (
  value: IdsValueConstraint | undefined,
  label: string,
  required: boolean,
  errors: string[],
): void => {
  if (required && !constraintHasValue(value)) {
    errors.push(`${label}: chybí povinná hodnota.`);
    return;
  }
  if (!value) return;
  if (value.enumerations && value.enumerations.some((item) => !item.trim())) {
    errors.push(`${label}: výčet obsahuje prázdnou alternativu.`);
  }
  if (value.pattern !== undefined) {
    try {
      new RegExp(value.pattern);
    } catch {
      errors.push(`${label}: neplatný regulární výraz.`);
    }
  }
  const numeric = [
    ["minInclusive", value.minInclusive],
    ["minExclusive", value.minExclusive],
    ["maxInclusive", value.maxInclusive],
    ["maxExclusive", value.maxExclusive],
  ] as const;
  numeric.forEach(([key, raw]) => {
    if (raw !== undefined && (!raw.trim() || Number.isNaN(Number(raw)))) {
      errors.push(`${label}: ${key} musí být číslo.`);
    }
  });
  const minRaw = value.minInclusive ?? value.minExclusive;
  const maxRaw = value.maxInclusive ?? value.maxExclusive;
  if (minRaw !== undefined && maxRaw !== undefined && Number(minRaw) > Number(maxRaw)) {
    errors.push(`${label}: dolní mez je větší než horní mez.`);
  }
  if (value.length !== undefined && value.length < 0) errors.push(`${label}: délka nesmí být záporná.`);
  if (value.minLength !== undefined && value.minLength < 0) errors.push(`${label}: minLength nesmí být záporná.`);
  if (value.maxLength !== undefined && value.maxLength < 0) errors.push(`${label}: maxLength nesmí být záporná.`);
  if (
    value.minLength !== undefined &&
    value.maxLength !== undefined &&
    value.minLength > value.maxLength
  ) {
    errors.push(`${label}: minLength je větší než maxLength.`);
  }
};

const validateFacet = (
  facet: IdsProjectFacet,
  sectionLabel: string,
  index: number,
  project: Project,
  errors: string[],
): void => {
  const label = `${sectionLabel} ${index + 1} (${facet.kind})`;
  if (facet.kind === "entity") {
    validateConstraint(facet.name, `${label} / entita`, true, errors);
  } else if (facet.kind === "attribute") {
    validateConstraint(facet.name, `${label} / název atributu`, true, errors);
  } else if (facet.kind === "classification") {
    validateConstraint(facet.system, `${label} / systém`, true, errors);
    if (
      facet.systemEntryId &&
      !(project.classificationSystemEntries ?? []).some((entry) => entry.id === facet.systemEntryId)
    ) {
      errors.push(`${label}: klasifikační vazba odkazuje na neexistující katalog.`);
    }
  } else if (facet.kind === "property") {
    validateConstraint(facet.propertySet, `${label} / Pset`, true, errors);
    validateConstraint(facet.baseName, `${label} / vlastnost`, true, errors);
  } else if (facet.kind === "partOf") {
    validateConstraint(facet.entity.name, `${label} / související entita`, true, errors);
  }
  const value =
    facet.kind === "attribute" || facet.kind === "classification" ||
    facet.kind === "property" || facet.kind === "material"
      ? facet.value
      : undefined;
  validateConstraint(value, `${label} / hodnota`, false, errors);
};

export const validateIdsSpecification = (
  project: Project,
  specification: IdsProjectSpecification,
): IdsValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!getSpecificationEntityFacet(specification)) {
    errors.push("Použitelnost musí obsahovat alespoň jeden entity facet.");
  }
  if (!normalizeText(specification.name)) errors.push("Specifikace musí mít název.");
  if (specification.minOccurs < 0) errors.push("minOccurs nesmí být záporné.");
  if (
    specification.maxOccurs !== "unbounded" &&
    (specification.maxOccurs < 0 || specification.maxOccurs < specification.minOccurs)
  ) {
    errors.push("maxOccurs musí být nezáporné a nesmí být menší než minOccurs.");
  }
  const duplicateIdCount = (project.idsSpecifications ?? []).filter(
    (item) => item.id === specification.id,
  ).length;
  if (duplicateIdCount > 1) errors.push(`Duplicitní interní ID specifikace: ${specification.id}.`);
  if (
    specification.identifier &&
    (project.idsSpecifications ?? []).some(
      (item) =>
        item.id !== specification.id &&
        item.identifier?.trim() === specification.identifier?.trim(),
    )
  ) {
    errors.push(`Duplicitní IDS identifier: ${specification.identifier}.`);
  }
  const facetIds = [...specification.applicability, ...specification.requirements].map((facet) => facet.id);
  if (new Set(facetIds).size !== facetIds.length) errors.push("Specifikace obsahuje duplicitní ID facetů.");
  specification.applicability.forEach((facet, index) =>
    validateFacet(facet, "Použitelnost", index, project, errors));
  specification.requirements.forEach((facet, index) =>
    validateFacet(facet, "Požadavek", index, project, errors));

  const entity = getSpecificationEntityFacet(specification);
  if (entity?.name.pattern) {
    warnings.push("Entity pattern může překrývat další specifikace; jde o potenciální, ne definitivní konflikt.");
  }
  for (const other of project.idsSpecifications ?? []) {
    if (other.id === specification.id) continue;
    const alternatives = idsConstraintAlternatives(entity?.name);
    if (
      alternatives.some((name) =>
        specificationReferencesEntity(other, name, idsConstraintAlternatives(entity?.predefinedType)[0]))
    ) {
      warnings.push(`Možný překryv s „${other.name || other.identifier || other.id}“. Požadavky obou specifikací budou platit současně (AND).`);
      break;
    }
  }
  return { errors, warnings };
};

export const createEmptyIdsFacet = (
  kind: IdsProjectFacet["kind"],
): IdsProjectFacet => {
  const id = makeId();
  if (kind === "entity") return { id, kind, name: { simpleValue: "IFCWALL" } };
  if (kind === "attribute") return { id, kind, name: { simpleValue: "" }, cardinality: "required" };
  if (kind === "classification") {
    return { id, kind, system: { simpleValue: "" }, cardinality: "required", unresolved: true };
  }
  if (kind === "property") {
    return {
      id,
      kind,
      propertySet: { simpleValue: "" },
      baseName: { simpleValue: "" },
      cardinality: "required",
    };
  }
  if (kind === "material") return { id, kind, cardinality: "required" };
  return {
    id,
    kind,
    relation: "IFCRELAGGREGATES",
    entity: { id: `${id}:entity`, kind: "entity", name: { simpleValue: "" } },
    cardinality: "required",
  };
};

export const saveIdsSpecification = (
  project: Project,
  specification: IdsProjectSpecification,
): Project => {
  const current = project.idsSpecifications ?? [];
  const index = current.findIndex((item) => item.id === specification.id);
  const next = clone(specification);
  const idsSpecifications = index >= 0
    ? current.map((item, itemIndex) => itemIndex === index ? next : item)
    : [...current, next];
  return { ...project, idsSpecifications, updatedAt: new Date().toISOString() };
};

const uniqueIdentifier = (project: Project, base: string): string => {
  const used = new Set((project.idsSpecifications ?? []).map((item) => item.identifier).filter(Boolean));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
};

export const duplicateIdsSpecification = (
  project: Project,
  specificationId: string,
): { project: Project; specificationId: string } => {
  const source = (project.idsSpecifications ?? []).find((item) => item.id === specificationId);
  if (!source) return { project, specificationId };
  const id = makeId();
  const duplicated = clone(source);
  duplicated.id = id;
  duplicated.name = `${source.name || "IDS specifikace"} – kopie`;
  duplicated.identifier = uniqueIdentifier(project, `${source.identifier || "authored"}-copy`);
  duplicated.source = "authored";
  duplicated.importTracking = undefined;
  const rekey = (facet: IdsProjectFacet): IdsProjectFacet => {
    const next = clone(facet);
    next.id = makeId();
    if (next.kind === "partOf") next.entity.id = `${next.id}:entity`;
    return next;
  };
  duplicated.applicability = duplicated.applicability.map(rekey);
  duplicated.requirements = duplicated.requirements.map(rekey);
  return {
    project: {
      ...project,
      idsSpecifications: [...(project.idsSpecifications ?? []), duplicated],
      updatedAt: new Date().toISOString(),
    },
    specificationId: id,
  };
};

export const deleteIdsSpecification = (
  project: Project,
  specificationId: string,
): Project => ({
  ...project,
  idsSpecifications: (project.idsSpecifications ?? []).filter((item) => item.id !== specificationId),
  updatedAt: new Date().toISOString(),
});

export const getObjectSelections = (
  project: Project,
  objectCodes: readonly string[],
): IdsObjectSelection[] => {
  const groups = new Map<string, IdsObjectSelection>();
  objectCodes.forEach((code) => {
    const object = project.objects[code];
    const parts = code.split("::");
    const entity = normalizeText(object?.ifcEntity || parts[0]).toUpperCase();
    if (!entity) return;
    const predefined = object?.predefinedType.mode === "ENUM"
      ? normalizeText(object.predefinedType.value).toUpperCase()
      : normalizeText(parts[1]).toUpperCase();
    const item = groups.get(entity) ?? { entity, predefinedTypes: [], objectCodes: [] };
    item.objectCodes.push(code);
    if (predefined && !item.predefinedTypes.includes(predefined)) item.predefinedTypes.push(predefined);
    groups.set(entity, item);
  });
  return [...groups.values()]
    .map((item) => ({
      ...item,
      objectCodes: item.objectCodes.sort((a, b) => a.localeCompare(b)),
      predefinedTypes: item.predefinedTypes.sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.entity.localeCompare(b.entity));
};

const entityFacetForSelection = (
  source: IdsProjectEntityFacet | undefined,
  selection: IdsObjectSelection,
): IdsProjectEntityFacet => ({
  ...(source ? clone(source) : { id: makeId(), kind: "entity" as const }),
  id: source?.id ?? makeId(),
  name: { simpleValue: selection.entity },
  predefinedType: selection.predefinedTypes.length === 0
    ? undefined
    : selection.predefinedTypes.length === 1
      ? { simpleValue: selection.predefinedTypes[0] }
      : { enumerations: [...selection.predefinedTypes] },
});

const replaceEntityFacet = (
  specification: IdsProjectSpecification,
  selection: IdsObjectSelection,
): IdsProjectSpecification => {
  const sourceEntity = getSpecificationEntityFacet(specification);
  const nextEntity = entityFacetForSelection(sourceEntity, selection);
  const applicability = specification.applicability.filter((facet) => facet.kind !== "entity");
  return { ...clone(specification), applicability: [nextEntity, ...applicability] };
};

const suffixName = (name: string | undefined, entity: string): string =>
  `${name || "IDS specifikace"} – ${entity}`;

export const reassignIdsSpecification = (
  project: Project,
  specificationId: string,
  objectCodes: readonly string[],
): { project: Project; createdIds: string[]; error?: string } => {
  if (objectCodes.length === 0) {
    return { project, createdIds: [], error: "Specifikaci nelze přiřadit prázdnému výběru. Pro odstranění použijte Smazat." };
  }
  const specifications = project.idsSpecifications ?? [];
  const sourceIndex = specifications.findIndex((item) => item.id === specificationId);
  if (sourceIndex < 0) return { project, createdIds: [], error: "Zdrojová IDS specifikace nebyla nalezena." };
  const source = specifications[sourceIndex];
  const sourceEntity = getSpecificationEntityFacet(source);
  const selections = getObjectSelections(project, objectCodes);
  if (!selections.length) return { project, createdIds: [], error: "Výběr neobsahuje platnou IFC entitu." };

  if (sourceEntity?.name.pattern) {
    const currentCodes = Object.keys(project.objects).filter((code) => {
      const object = project.objects[code];
      return specificationReferencesEntity(
        source,
        object.ifcEntity,
        object.predefinedType.mode === "ENUM" ? object.predefinedType.value : undefined,
      );
    });
    const selected = new Set(objectCodes);
    if (currentCodes.some((code) => !selected.has(code))) {
      return {
        project,
        createdIds: [],
        error: "Entity pattern nelze bezpečně zmenšit. Nejprve jej výslovně převeďte na konečný seznam entit.",
      };
    }
    const additions = selections.filter((selection) =>
      !specificationReferencesEntity(source, selection.entity, selection.predefinedTypes[0]));
    if (!additions.length) return { project, createdIds: [source.id] };
    const clones = additions.map((selection) => {
      const next = replaceEntityFacet(source, selection);
      next.id = makeId();
      next.identifier = uniqueIdentifier(project, `${source.identifier || "authored"}-${selection.entity}`);
      next.name = suffixName(source.name, selection.entity);
      next.source = "authored";
      next.importTracking = undefined;
      next.applicability = next.applicability.map((facet) => ({ ...facet, id: makeId() }));
      next.requirements = next.requirements.map((facet) => ({ ...facet, id: makeId() }));
      return next;
    });
    return {
      project: {
        ...project,
        idsSpecifications: [...specifications, ...clones],
        updatedAt: new Date().toISOString(),
      },
      createdIds: [source.id, ...clones.map((item) => item.id)],
    };
  }

  const existingEntityAlternatives = new Set(
    idsConstraintAlternatives(sourceEntity?.name).map((item) => item.trim().toUpperCase()),
  );
  const keeperIndex = Math.max(
    0,
    selections.findIndex((selection) => existingEntityAlternatives.has(selection.entity)),
  );
  const split = selections.map((selection, index) => {
    const next = replaceEntityFacet(source, selection);
    if (index === keeperIndex) {
      next.id = source.id;
      next.identifier = source.identifier;
    } else {
      next.id = makeId();
      next.identifier = uniqueIdentifier(project, `${source.identifier || "authored"}-${selection.entity}`);
      next.source = "authored";
      next.importTracking = undefined;
      next.name = suffixName(source.name, selection.entity);
      next.applicability = next.applicability.map((facet) => ({ ...facet, id: makeId() }));
      next.requirements = next.requirements.map((facet) => ({ ...facet, id: makeId() }));
    }
    return next;
  });
  const nextSpecifications = [...specifications];
  nextSpecifications.splice(sourceIndex, 1, ...split);
  return {
    project: {
      ...project,
      idsSpecifications: nextSpecifications,
      updatedAt: new Date().toISOString(),
    },
    createdIds: split.map((item) => item.id),
  };
};

const nativeConstraint = (
  constraint: string | undefined,
  value: string | undefined,
  allowedValues?: string[],
): IdsValueConstraint | undefined => {
  if (constraint === "ENUM") {
    const enumerations = allowedValues?.length
      ? allowedValues
      : (value ?? "").split("|").map((item) => item.trim()).filter(Boolean);
    return enumerations.length ? { enumerations } : undefined;
  }
  if (constraint === "PATTERN") return value !== undefined ? { pattern: value } : undefined;
  if (constraint === "RANGE") {
    const result: IdsValueConstraint = {};
    (value ?? "").split("|").forEach((part) => {
      const [edge, raw, inclusive] = part.split(":");
      if (edge === "min") {
        if (inclusive === "exclusive") result.minExclusive = raw;
        else result.minInclusive = raw;
      } else if (edge === "max") {
        if (inclusive === "exclusive") result.maxExclusive = raw;
        else result.maxInclusive = raw;
      }
    });
    return result;
  }
  if (constraint === "LENGTH") {
    const result: IdsValueConstraint = {};
    (value ?? "").split("|").forEach((part) => {
      const [key, raw] = part.split(":");
      const number = Number(raw);
      if (key === "length") result.length = number;
      if (key === "minLength") result.minLength = number;
      if (key === "maxLength") result.maxLength = number;
    });
    return result;
  }
  return value !== undefined && value !== "" ? { simpleValue: value } : undefined;
};

const nativeItemToFacet = (
  kind: RequirementItemGroup["kind"],
  item: PropertyRequirement | AttributeRequirement | ClassificationRequirement | MaterialRequirement | RelationRequirement,
): IdsProjectFacet => {
  const cardinality = "occurrence" in item ? item.occurrence : undefined;
  const authoring = {
    scope: {
      phaseIds: item.phases ? [...item.phases] : undefined,
      useCaseMode: item.useCaseMode,
      useCaseIds: item.useCaseIds ? [...item.useCaseIds] : undefined,
    },
    description: "popis" in item ? item.popis : "description" in item ? item.description : undefined,
    note: item.note,
    examples: item.priklady,
    unit: "unit" in item ? item.unit : undefined,
  };
  if (kind === "pset") {
    const property = item as PropertyRequirement;
    return {
      id: makeId(),
      kind: "property",
      propertySet: { simpleValue: property.psetName },
      baseName: { simpleValue: property.propertyName },
      value: nativeConstraint(property.constraint, property.value, property.allowedValues),
      dataType: property.dataType,
      cardinality,
      instructions: property.note,
      uri: property.uri,
      authoring,
    };
  }
  if (kind === "attribute") {
    const attribute = item as AttributeRequirement;
    return {
      id: makeId(),
      kind: "attribute",
      name: { simpleValue: attribute.attribute },
      value: nativeConstraint(attribute.constraint, attribute.value, attribute.allowedValues),
      cardinality,
      instructions: attribute.note,
      uri: attribute.uri,
      authoring,
    };
  }
  if (kind === "classification") {
    const classification = item as ClassificationRequirement;
    return {
      id: makeId(),
      kind: "classification",
      system: { simpleValue: classification.system },
      value: nativeConstraint(classification.constraint, classification.value),
      systemEntryId: classification.systemEntryId,
      unresolved: !classification.systemEntryId,
      cardinality,
      instructions: classification.note,
      uri: classification.uri,
      authoring,
    };
  }
  if (kind === "material") {
    const material = item as MaterialRequirement;
    return {
      id: makeId(),
      kind: "material",
      value: nativeConstraint(material.constraint, material.value ?? material.category),
      cardinality,
      instructions: material.note,
      uri: material.uri,
      authoring,
    };
  }
  const relation = item as RelationRequirement;
  return {
    id: makeId(),
    kind: "partOf",
    relation: relation.relationType,
    entity: {
      id: makeId(),
      kind: "entity",
      name: { simpleValue: relation.entityType || relation.targetType || "" },
      predefinedType: relation.entityPredefinedType
        ? { simpleValue: relation.entityPredefinedType }
        : undefined,
    },
    cardinality,
    instructions: relation.note,
    uri: relation.uri,
    authoring,
  };
};

const buildAuthoredSpecifications = (
  project: Project,
  name: string,
  facets: IdsProjectFacet[],
  section: IdsFacetSection,
  objectCodes: readonly string[],
): IdsProjectSpecification[] => {
  const selections = getObjectSelections(project, objectCodes);
  return selections.map((selection) => {
    const id = makeId();
    const entity = entityFacetForSelection(undefined, selection);
    const copiedFacets = facets
      .filter((facet) => facet.kind !== "entity")
      .map((facet) => ({ ...clone(facet), id: makeId() }));
    return {
      id,
      name: suffixName(name, selection.entity),
      identifier: uniqueIdentifier(project, `authored-${id}`),
      ifcVersion: project.ifcSchemaVersion === "IFC4X3" ? "IFC4X3_ADD2" : "IFC4",
      minOccurs: 0,
      maxOccurs: "unbounded",
      applicability: section === "applicability" ? [entity, ...copiedFacets] : [entity],
      requirements: section === "requirements" ? copiedFacets : [],
      source: "authored",
    };
  });
};

export const createSpecificationFromIdsGroup = (
  project: Project,
  group: RequirementItemGroup,
  objectCodes: readonly string[],
): { project: Project; createdIds: string[]; error?: string } => {
  if (group.origin !== "ids" || !group.idsReference) {
    return { project, createdIds: [], error: "Vybraná skupina není kanonická IDS skupina." };
  }
  if (!objectCodes.length) return { project, createdIds: [], error: "Vyberte alespoň jeden objekt." };
  const source = (project.idsSpecifications ?? []).find(
    (item) => item.id === group.idsReference?.specificationId,
  );
  if (!source) return { project, createdIds: [], error: "Zdrojová IDS specifikace nebyla nalezena." };
  const sourceFacets = group.idsReference.section === "applicability"
    ? source.applicability
    : source.requirements;
  const facetIds = new Set(group.idsReference.facetIds);
  const facets = sourceFacets.filter((facet) => facetIds.has(facet.id));
  const created = buildAuthoredSpecifications(
    project,
    `${source.name || "IDS"} – ${group.label}`,
    facets,
    group.idsReference.section,
    objectCodes,
  );
  if (!created.length) return { project, createdIds: [], error: "Výběr neobsahuje platnou IFC entitu." };
  return {
    project: {
      ...project,
      idsSpecifications: [...(project.idsSpecifications ?? []), ...created],
      updatedAt: new Date().toISOString(),
    },
    createdIds: created.map((item) => item.id),
  };
};

const removeProjectGroup = (project: Project, group: RequirementItemGroup): Project["objects"] => {
  const nextObjects = { ...project.objects };
  Object.entries(project.objects).forEach(([code, object]) => {
    if (!group.objectCodes.includes(code)) return;
    const requirements = object.requirements;
    if (group.kind === "pset") {
      const psetGroups = new Map<string, PropertyRequirement[]>();
      requirements.properties.forEach((item) => {
        const key = item.psetName.trim();
        psetGroups.set(key, [...(psetGroups.get(key) ?? []), item]);
      });
      const sourceName = [...psetGroups.entries()].find(
        ([name, items]) => computePsetFingerprint(name, items) === group.fingerprint,
      )?.[0];
      if (sourceName === undefined) return;
      nextObjects[code] = {
        ...object,
        requirements: {
          ...requirements,
          properties: requirements.properties.filter((item) => item.psetName.trim() !== sourceName),
        },
      };
      return;
    }
    if (group.kind === "attribute") {
      nextObjects[code] = {
        ...object,
        requirements: {
          ...requirements,
          attributes: requirements.attributes.filter(
            (item) => computeAttributeItemFingerprint(item) !== group.fingerprint,
          ),
        },
      };
    } else if (group.kind === "classification") {
      nextObjects[code] = {
        ...object,
        requirements: {
          ...requirements,
          classifications: requirements.classifications.filter(
            (item) => computeClassificationItemFingerprint(item) !== group.fingerprint,
          ),
        },
      };
    } else if (group.kind === "material") {
      nextObjects[code] = {
        ...object,
        requirements: {
          ...requirements,
          materials: requirements.materials.filter(
            (item) => computeMaterialItemFingerprint(item) !== group.fingerprint,
          ),
        },
      };
    } else {
      nextObjects[code] = {
        ...object,
        requirements: {
          ...requirements,
          relations: requirements.relations.filter(
            (item) => computeRelationItemFingerprint(item) !== group.fingerprint,
          ),
        },
      };
    }
  });
  return nextObjects;
};

export const convertProjectGroupToIds = (
  project: Project,
  group: RequirementItemGroup,
): { project: Project; createdIds: string[]; error?: string } => {
  if (group.origin !== "project") {
    return { project, createdIds: [], error: "Převést lze pouze projektovou skupinu." };
  }
  const facets = group.representativeItems.map((item) =>
    nativeItemToFacet(
      group.kind,
      item as PropertyRequirement | AttributeRequirement | ClassificationRequirement | MaterialRequirement | RelationRequirement,
    ),
  );
  const created = buildAuthoredSpecifications(
    project,
    group.label,
    facets,
    "requirements",
    group.objectCodes,
  );
  if (!created.length) return { project, createdIds: [], error: "Skupina není přiřazena žádné platné IFC entitě." };
  const draftProject: Project = {
    ...project,
    idsSpecifications: [...(project.idsSpecifications ?? []), ...created],
  };
  const validationErrors = created.flatMap((item) => validateIdsSpecification(draftProject, item).errors);
  if (validationErrors.length) {
    return { project, createdIds: [], error: validationErrors.join("\n") };
  }
  return {
    project: {
      ...draftProject,
      objects: removeProjectGroup(project, group),
      updatedAt: new Date().toISOString(),
    },
    createdIds: created.map((item) => item.id),
  };
};
