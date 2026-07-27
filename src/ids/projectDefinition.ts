import type {
  AttributeRequirement,
  ClassificationRequirement,
  IdsAuthoringMetadata,
  IdsFacetCardinality,
  IdsProjectFacet,
  IdsProjectSpecification,
  IdsSpecMetadata,
  IdsValueConstraint,
  MaterialRequirement,
  Project,
  ProjectObject,
  PropertyRequirement,
  RelationRequirement,
  RequirementBase,
  RequirementSectionKey,
} from "../project/types";
import { getEffectiveUseCaseIds, requirementAppliesToUseCase } from "../project/useCaseResolve";
import { getIdsIfcVersion, normalizeIfcSchemaVersion } from "../schema/ifcVersionConfig";

export type ProjectDefinitionOccurrence = "all" | "required" | "prohibited" | "optional";

export interface ProjectDefinitionProjectionOptions {
  phaseId?: string;
  useCaseId?: string;
  occurrence?: ProjectDefinitionOccurrence;
}

type NativeRequirement =
  | AttributeRequirement
  | PropertyRequirement
  | ClassificationRequirement
  | MaterialRequirement
  | RelationRequirement;

function cardinalityOf(requirement: NativeRequirement): IdsFacetCardinality {
  return requirement.occurrence ?? "required";
}

function scopeMetadata(requirement: RequirementBase): IdsAuthoringMetadata {
  return {
    scope: {
      phaseIds: requirement.phases ? [...requirement.phases] : undefined,
      useCaseMode: requirement.useCaseMode,
      useCaseIds: requirement.useCaseIds ? [...requirement.useCaseIds] : undefined,
    },
  };
}

function valueConstraint(
  constraint: string | undefined,
  value: string | undefined,
  allowedValues?: string[],
): IdsValueConstraint | undefined {
  if (constraint === "ENUM") {
    const enumerations = allowedValues?.length
      ? allowedValues
      : (value ?? "").split("|").map((item) => item.trim()).filter(Boolean);
    return enumerations.length ? { enumerations } : undefined;
  }
  if (constraint === "PATTERN") {
    return value !== undefined && value !== "" ? { pattern: value } : undefined;
  }
  if (constraint === "RANGE") {
    const result: IdsValueConstraint = {};
    (value ?? "").split("|").forEach((part) => {
      const [edge, raw, inclusive] = part.split(":");
      if (!raw) return;
      if (edge === "min") {
        if (inclusive === "exclusive") result.minExclusive = raw;
        else result.minInclusive = raw;
      } else if (edge === "max") {
        if (inclusive === "exclusive") result.maxExclusive = raw;
        else result.maxInclusive = raw;
      }
    });
    return Object.keys(result).length ? result : undefined;
  }
  if (constraint === "LENGTH") {
    const result: IdsValueConstraint = {};
    (value ?? "").split("|").forEach((part) => {
      const [key, raw] = part.split(":");
      const numeric = Number(raw);
      if (!Number.isFinite(numeric)) return;
      if (key === "length") result.length = numeric;
      if (key === "minLength") result.minLength = numeric;
      if (key === "maxLength") result.maxLength = numeric;
    });
    return Object.keys(result).length ? result : undefined;
  }
  return value !== undefined && value !== "" ? { simpleValue: value } : undefined;
}

function metadataForRequirement(requirement: NativeRequirement): IdsAuthoringMetadata {
  return {
    ...scopeMetadata(requirement),
    description:
      "popis" in requirement
        ? requirement.popis
        : "description" in requirement
          ? requirement.description
          : undefined,
    note: requirement.note,
    examples: requirement.priklady,
    unit: "unit" in requirement ? requirement.unit : undefined,
  };
}

function requirementToFacet(
  requirement: NativeRequirement,
  kind: RequirementSectionKey,
): IdsProjectFacet {
  const common = {
    id: `project:${requirement.id}`,
    cardinality: cardinalityOf(requirement),
    instructions: requirement.note,
    uri: requirement.uri,
    authoring: metadataForRequirement(requirement),
  };
  if (kind === "attributes") {
    const attribute = requirement as AttributeRequirement;
    return {
      ...common,
      kind: "attribute",
      name: { simpleValue: attribute.attribute },
      value: valueConstraint(attribute.constraint, attribute.value, attribute.allowedValues),
    };
  }
  if (kind === "properties") {
    const property = requirement as PropertyRequirement;
    return {
      ...common,
      kind: "property",
      propertySet: { simpleValue: property.psetName },
      baseName: { simpleValue: property.propertyName },
      value: valueConstraint(property.constraint, property.value, property.allowedValues),
      dataType: property.dataType,
    };
  }
  if (kind === "classifications") {
    const classification = requirement as ClassificationRequirement;
    return {
      ...common,
      kind: "classification",
      system: { simpleValue: classification.system },
      value: valueConstraint(
        classification.constraint,
        classification.value ?? classification.identification,
      ),
      systemEntryId: classification.systemEntryId,
      unresolved: !classification.systemEntryId,
    };
  }
  if (kind === "materials") {
    const material = requirement as MaterialRequirement;
    return {
      ...common,
      kind: "material",
      value: valueConstraint(material.constraint, material.value ?? material.category),
    };
  }
  const relation = requirement as RelationRequirement;
  return {
    ...common,
    kind: "partOf",
    relation: relation.relationType,
    entity: {
      id: `project:${relation.id}:entity`,
      kind: "entity",
      name: { simpleValue: relation.entityType || relation.targetType || "" },
      predefinedType: relation.entityPredefinedType
        ? { simpleValue: relation.entityPredefinedType }
        : undefined,
    },
  };
}

function requirementAppliesToProjection(
  requirement: NativeRequirement,
  object: ProjectObject,
  section: RequirementSectionKey,
  phaseId: string | undefined,
  useCaseId: string | undefined,
  psetName?: string,
): boolean {
  if (phaseId && requirement.phases?.length && !requirement.phases.includes(phaseId)) {
    return false;
  }
  if (!useCaseId) return true;
  if (requirement.useCaseMode === "excluded") return false;
  return requirementAppliesToUseCase(
    getEffectiveUseCaseIds(requirement, object, section, psetName),
    useCaseId,
  );
}

function metadataForSelection(
  object: ProjectObject,
  phaseId: string | undefined,
  occurrence: ProjectDefinitionOccurrence,
): IdsSpecMetadata | undefined {
  const map = object.idsSpecMetadata;
  if (!map || typeof map !== "object") return undefined;
  const keys = Object.keys(map);
  if (!keys.length) return undefined;
  if (!keys.some((key) => key.includes("|"))) {
    return map as unknown as IdsSpecMetadata;
  }
  const phaseKey = phaseId ?? "all";
  const candidates = [
    `${phaseKey}|${occurrence}`,
    `${phaseKey}|required`,
    `${phaseKey}|all`,
    `all|${occurrence}`,
    "all|required",
    "all|all",
  ];
  for (const key of candidates) {
    const metadata = map[key];
    if (metadata) return metadata;
  }
  return undefined;
}

function occurrenceMatches(
  requirement: NativeRequirement,
  occurrence: ProjectDefinitionOccurrence,
): boolean {
  return occurrence === "all" || cardinalityOf(requirement) === occurrence;
}

function isIfcClassification(
  project: Project,
  requirement: ClassificationRequirement,
): boolean {
  if (!requirement.systemEntryId) return false;
  return project.classificationSystemEntries?.some(
    (entry) => entry.id === requirement.systemEntryId && entry.isIfcSystem,
  ) ?? false;
}

/**
 * Read-only IDS projection of the original object-centric authoring model.
 * Nothing is persisted in project.idsSpecifications; the selected phase/use-case is evaluated
 * in the same way as the legacy IDS preview and export.
 */
export function projectObjectToIdsSpecificationPreview(
  project: Project,
  object: ProjectObject,
  options: ProjectDefinitionProjectionOptions = {},
): IdsProjectSpecification | null {
  if (!object.ifcEntity.trim()) return null;
  const { phaseId, useCaseId, occurrence = "all" } = options;
  const entityPhases = object.ifcEntityPhases ?? object.entityPhases;
  if (phaseId && entityPhases?.length && !entityPhases.includes(phaseId)) return null;

  const includePredefinedType =
    object.predefinedType.mode === "ENUM" &&
    Boolean(object.predefinedType.value?.trim()) &&
    object.predefinedType.value?.trim().toUpperCase() !== "NOTDEFINED" &&
    (
      !phaseId ||
      !(object.predefinedTypePhases ?? object.entityPhases)?.length ||
      (object.predefinedTypePhases ?? object.entityPhases)?.includes(phaseId)
    );

  const applicability: IdsProjectFacet[] = [{
    id: `project:${object.code}:entity`,
    kind: "entity",
    name: { simpleValue: object.ifcEntity },
    predefinedType: includePredefinedType
      ? { simpleValue: object.predefinedType.value }
      : undefined,
    authoring: {
      scope: {
        phaseIds: entityPhases ? [...entityPhases] : undefined,
      },
    },
  }];
  const requirements: IdsProjectFacet[] = [];

  const add = <T extends NativeRequirement>(
    items: T[],
    section: RequirementSectionKey,
    isApplicability: (item: T) => boolean,
    psetName?: (item: T) => string | undefined,
  ) => {
    items.forEach((item) => {
      if (
        !requirementAppliesToProjection(
          item,
          object,
          section,
          phaseId,
          useCaseId,
          psetName?.(item),
        )
      ) return;
      const facet = requirementToFacet(item, section);
      if (isApplicability(item)) {
        applicability.push(facet);
      } else if (occurrenceMatches(item, occurrence)) {
        requirements.push(facet);
      }
    });
  };

  add(object.requirements.attributes, "attributes", (item) => Boolean(item.isApplicability));
  add(
    object.requirements.properties,
    "properties",
    (item) => Boolean(item.isApplicability),
    (item) => item.psetName,
  );
  add(object.requirements.relations, "relations", (item) => Boolean(item.isApplicability));
  add(
    object.requirements.classifications.filter((item) => !isIfcClassification(project, item)),
    "classifications",
    (item) => Boolean(item.isApplicability || item.readOnly),
  );
  add(object.requirements.materials, "materials", (item) => Boolean(item.isApplicability));

  const metadata = metadataForSelection(object, phaseId, occurrence);
  const minOccurs = occurrence === "required" ? 1 : 0;
  const maxOccurs = occurrence === "prohibited" ? 0 : "unbounded";
  return {
    id: `project:${object.code}`,
    identifier: metadata?.identifier ?? `project-${object.code}`,
    name: metadata?.name ?? object.description ?? object.code,
    description: metadata?.description ?? object.popis,
    instructions: metadata?.instructions,
    ifcVersion: getIdsIfcVersion(normalizeIfcSchemaVersion(project.ifcSchemaVersion)),
    minOccurs,
    maxOccurs,
    applicability,
    requirements,
    source: "authored",
    authoring: {
      scope: {
        phaseIds: phaseId ? [phaseId] : entityPhases ? [...entityPhases] : undefined,
        useCaseMode: useCaseId ? "custom" : "inherit",
        useCaseIds: useCaseId ? [useCaseId] : undefined,
      },
      description: "Odvozeno z projektového objektu; není uloženo jako zdrojová IDS specifikace.",
    },
  };
}

export function hasProjectObjectIdsDefinition(
  project: Pick<Project, "idsSpecifications"> | null | undefined,
  object: ProjectObject,
): boolean {
  if (!object.ifcEntity.trim()) return false;
  if (!(project?.idsSpecifications?.length)) return true;
  return Boolean(
    object.idsSpecMetadata ||
    object.requirements.attributes.length ||
    object.requirements.properties.length ||
    object.requirements.relations.length ||
    object.requirements.classifications.some((item) => !item.readOnly) ||
    object.requirements.materials.length
  );
}
