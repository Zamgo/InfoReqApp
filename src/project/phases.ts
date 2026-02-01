import type { Phase, Project, RequirementBase } from "./types";

/** Jedna výchozí fáze při prázdném projektu – uživatel ji může přejmenovat a přidat další v levém panelu Fáze. */
export const DEFAULT_SINGLE_PHASE: Phase = {
  id: "phase-1",
  code: "Fáze1",
  name: "Fáze1",
};

/** Vrátí výchozí seznam fází (jedna fáze „Fáze1“) pro nový nebo vyčištěný projekt. */
export const getDefaultPhases = (): Phase[] => [DEFAULT_SINGLE_PHASE];

export const ensurePhaseList = (phases?: Phase[]): Phase[] => {
  if (!phases || phases.length === 0) return getDefaultPhases();
  const seen = new Set<string>();
  const result: Phase[] = [];
  phases.forEach((p) => {
    if (!p.id) return;
    if (seen.has(p.id)) return;
    seen.add(p.id);
    result.push({
      id: p.id,
      code: p.code || p.id,
      name: p.name || p.code || p.id,
      description: p.description,
    });
  });
  return result;
};

export const normalizeRequirement = <T extends RequirementBase>(req: T, allPhaseIds: string[]): T => {
  if (!req.phases || req.phases.length === 0) return req;
  const allowed = new Set(allPhaseIds);
  const filtered = req.phases.filter((id) => allowed.has(id));
  return filtered.length === req.phases.length ? req : { ...req, phases: filtered };
};

export const ensureProjectPhases = (project: Project): Project => {
  const phases = ensurePhaseList(project.phases);
  const allIds = phases.map((p) => p.id);
  const nextObjects = { ...project.objects };
  Object.values(nextObjects).forEach((obj) => {
    const { requirements } = obj;
    requirements.attributes = requirements.attributes.map((r) => normalizeRequirement(r, allIds));
    requirements.properties = requirements.properties.map((r) => normalizeRequirement(r, allIds));
    requirements.relations = requirements.relations.map((r) => normalizeRequirement(r, allIds));
    requirements.classifications = requirements.classifications.map((r) => normalizeRequirement(r, allIds));
    requirements.materials = requirements.materials.map((r) => normalizeRequirement(r, allIds));
  });
  return { ...project, phases, objects: nextObjects };
};

export const removePhaseFromProject = (project: Project, phaseId: string): Project => {
  const phases = project.phases.filter((p) => p.id !== phaseId);
  const allowed = new Set(phases.map((p) => p.id));
  const nextObjects = { ...project.objects };
  Object.values(nextObjects).forEach((obj) => {
    const { requirements } = obj;
    requirements.attributes = requirements.attributes.map((r) =>
      r.phases ? { ...r, phases: r.phases.filter((id) => allowed.has(id)) } : r,
    );
    requirements.properties = requirements.properties.map((r) =>
      r.phases ? { ...r, phases: r.phases.filter((id) => allowed.has(id)) } : r,
    );
    requirements.relations = requirements.relations.map((r) =>
      r.phases ? { ...r, phases: r.phases.filter((id) => allowed.has(id)) } : r,
    );
    requirements.classifications = requirements.classifications.map((r) =>
      r.phases ? { ...r, phases: r.phases.filter((id) => allowed.has(id)) } : r,
    );
    requirements.materials = requirements.materials.map((r) =>
      r.phases ? { ...r, phases: r.phases.filter((id) => allowed.has(id)) } : r,
    );
  });
  return { ...project, phases, objects: nextObjects };
};
