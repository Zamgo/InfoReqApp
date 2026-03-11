import type { ProjectObject, RequirementBase, RequirementSectionKey } from "./types";

/**
 * Resolve effective use-case IDs for a requirement.
 * - excluded → []
 * - custom → requirement.useCaseIds ?? []
 * - inherit (or missing) → section default, or for properties: psetUseCaseDefaults[psetName] ?? sectionUseCaseDefaults.properties ?? []
 *
 * Empty effective list means "applies to all use-cases" (include in export when filtering by any use-case).
 */
export function getEffectiveUseCaseIds(
  requirement: RequirementBase,
  object: ProjectObject,
  section: RequirementSectionKey,
  psetName?: string
): string[] {
  const mode = requirement.useCaseMode ?? "inherit";

  if (mode === "excluded") {
    return [];
  }

  if (mode === "custom") {
    return requirement.useCaseIds ?? [];
  }

  // inherit
  if (section === "properties" && psetName != null && psetName !== "") {
    const psetDefaults = object.psetUseCaseDefaults?.[psetName];
    if (psetDefaults != null && psetDefaults.length >= 0) {
      return psetDefaults;
    }
  }

  const sectionDefaults = object.sectionUseCaseDefaults?.[section];
  if (sectionDefaults != null) {
    return sectionDefaults;
  }

  return [];
}

/**
 * Check if a requirement applies to a given use-case for export.
 * Caller must skip requirements with useCaseMode === 'excluded' before calling this.
 * When useCaseId is provided: include if effectiveUseCaseIds is empty (all) or contains useCaseId.
 * When useCaseId is not provided: include all (no use-case filter).
 */
export function requirementAppliesToUseCase(
  effectiveUseCaseIds: string[],
  useCaseId: string | undefined
): boolean {
  if (useCaseId == null || useCaseId === "") {
    return true;
  }
  if (effectiveUseCaseIds.length === 0) {
    return true; // empty = applies to all use-cases (inherit with no defaults)
  }
  return effectiveUseCaseIds.includes(useCaseId);
}
