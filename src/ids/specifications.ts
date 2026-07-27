import type {
  IdsProjectEntityFacet,
  IdsProjectFacet,
  IdsProjectSpecification,
  IdsValueConstraint,
  Project,
} from "../project/types";

export function idsConstraintAlternatives(value: IdsValueConstraint | undefined): string[] {
  if (!value) return [];
  if (value.enumerations?.length) {
    return value.enumerations.map((item) => item.trim()).filter(Boolean);
  }
  if (value.simpleValue?.trim()) return [value.simpleValue.trim()];
  return [];
}

export function formatIdsConstraint(
  value: IdsValueConstraint | undefined,
  emptyLabel = "bez omezení",
): string {
  if (!value) return emptyLabel;
  if (value.enumerations?.length) return value.enumerations.join(" OR ");
  if (value.simpleValue !== undefined) return value.simpleValue || emptyLabel;
  if (value.pattern !== undefined) return `vzor ${value.pattern}`;
  const range: string[] = [];
  if (value.minInclusive !== undefined) range.push(`≥ ${value.minInclusive}`);
  if (value.minExclusive !== undefined) range.push(`> ${value.minExclusive}`);
  if (value.maxInclusive !== undefined) range.push(`≤ ${value.maxInclusive}`);
  if (value.maxExclusive !== undefined) range.push(`< ${value.maxExclusive}`);
  if (range.length) return range.join(" AND ");
  if (value.length !== undefined) return `délka = ${value.length}`;
  const lengths: string[] = [];
  if (value.minLength !== undefined) lengths.push(`délka ≥ ${value.minLength}`);
  if (value.maxLength !== undefined) lengths.push(`délka ≤ ${value.maxLength}`);
  return lengths.length ? lengths.join(" AND ") : emptyLabel;
}

function normalizeIfcEntity(value: string): string {
  return value.trim().replace(/^Ifc/i, "").toUpperCase();
}

function constraintMatches(
  value: IdsValueConstraint | undefined,
  candidate: string,
  normalize: (input: string) => string = (input) => input.trim().toUpperCase(),
): boolean {
  if (!value) return true;
  const alternatives = idsConstraintAlternatives(value);
  if (alternatives.length) {
    const normalizedCandidate = normalize(candidate);
    return alternatives.some((alternative) => normalize(alternative) === normalizedCandidate);
  }
  if (value.pattern !== undefined) {
    try {
      return new RegExp(value.pattern).test(candidate);
    } catch {
      return false;
    }
  }
  return true;
}

export function getSpecificationEntityFacet(
  specification: IdsProjectSpecification,
): IdsProjectEntityFacet | undefined {
  return specification.applicability.find(
    (facet): facet is IdsProjectEntityFacet => facet.kind === "entity",
  );
}

/**
 * Entity-only projection of IDS applicability.
 * Other applicability facets are deliberately not evaluated here because this is a navigator,
 * not a model compliance result.
 */
export function specificationReferencesEntity(
  specification: IdsProjectSpecification,
  ifcEntity: string,
  predefinedType?: string,
): boolean {
  const entity = getSpecificationEntityFacet(specification);
  if (!entity || !constraintMatches(entity.name, ifcEntity, normalizeIfcEntity)) return false;
  if (!predefinedType) return true;
  return constraintMatches(entity.predefinedType, predefinedType);
}

export function getSpecificationsForEntity(
  project: Pick<Project, "idsSpecifications"> | null | undefined,
  ifcEntity: string,
  predefinedType?: string,
): IdsProjectSpecification[] {
  if (!ifcEntity) return [];
  return (project?.idsSpecifications ?? []).filter((specification) =>
    specificationReferencesEntity(specification, ifcEntity, predefinedType),
  );
}

/** Index pro levý strom a další odvozené pohledy. Patterny se vyhodnocují až dotazem. */
export function buildIdsEntitySpecificationIndex(
  specifications: IdsProjectSpecification[],
): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const specification of specifications) {
    const entity = getSpecificationEntityFacet(specification);
    for (const name of idsConstraintAlternatives(entity?.name)) {
      const key = normalizeIfcEntity(name);
      const ids = index.get(key) ?? [];
      if (!ids.includes(specification.id)) ids.push(specification.id);
      index.set(key, ids);
    }
  }
  return index;
}

export function getFacetSearchText(facet: IdsProjectFacet): string {
  switch (facet.kind) {
    case "entity":
      return `${formatIdsConstraint(facet.name)} ${formatIdsConstraint(facet.predefinedType, "")}`;
    case "attribute":
      return `${formatIdsConstraint(facet.name)} ${formatIdsConstraint(facet.value, "")}`;
    case "classification":
      return `${formatIdsConstraint(facet.system)} ${formatIdsConstraint(facet.value, "")}`;
    case "property":
      return `${formatIdsConstraint(facet.propertySet)} ${formatIdsConstraint(facet.baseName)} ${formatIdsConstraint(facet.value, "")}`;
    case "material":
      return formatIdsConstraint(facet.value);
    case "partOf":
      return `${facet.relation ?? ""} ${formatIdsConstraint(facet.entity.name)} ${formatIdsConstraint(facet.entity.predefinedType, "")}`;
  }
}
