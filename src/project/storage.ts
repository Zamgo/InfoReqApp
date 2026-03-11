import type { ClassificationData, ClassificationSystem } from "../classification/types";
import { makeId } from "../utils/id";
import type { Project, ProjectObject } from "./types";
import { ensureProjectPhases, getDefaultPhases } from "./phases";
import {
  DEFAULT_IFC_SCHEMA_VERSION,
  getDisplayLabel,
  getIfcDocumentationBaseUrl,
  normalizeIfcSchemaVersion,
} from "../schema/ifcVersionConfig";

const STORAGE_KEY = "inforeqapp:project";

export const createClassificationSystem = (
  classification: ClassificationData,
  isPrimary = true,
): ClassificationSystem => ({
  id: makeId(),
  ifcClassification: {
    Name: (classification.sourceName || "Klasifikace").replace(/\.txt$/i, ""),
  },
  nodes: classification.nodes,
  sourceName: classification.sourceName,
  hash: classification.hash,
  isPrimary,
  createdAt: new Date().toISOString(),
});

export const createEmptyProject = (classification: ClassificationData): Project => {
  const now = new Date().toISOString();
  const primary = createClassificationSystem(classification, true);
  return {
    projectId: makeId(),
    name: "Nový projekt",
    author: "",
    description: "",
    createdAt: now,
    updatedAt: now,
    ifcSchemaVersion: DEFAULT_IFC_SCHEMA_VERSION,
    ifcSchemaVersionDisplay: getDisplayLabel(DEFAULT_IFC_SCHEMA_VERSION),
    ifcDocumentationUrl: getIfcDocumentationBaseUrl(DEFAULT_IFC_SCHEMA_VERSION),
    modelDefinitionViewMvd: "Reference View",
    classification,
    classifications: [primary],
    primaryClassificationId: primary.id,
    phases: getDefaultPhases(),
    objects: {},
    codeLists: [],
    classificationSystemEntries: [],
  };
};

export const ensureObject = (
  project: Project,
  code: string,
  description: string,
  defaultIfcEntity?: string,
): ProjectObject => {
  if (!project.objects[code]) {
    // Find the primary classification system entry to link to
    const primaryEntry = (project.classificationSystemEntries ?? []).find((e) => e.isPrimary);
    const systemName = primaryEntry?.name ?? 
      project.classifications.find((c) => c.id === project.primaryClassificationId)?.ifcClassification.Name?.replace(/\.txt$/i, "") ?? 
      "Klasifikace";
    
    project.objects[code] = {
      code,
      description,
      ifcEntity: defaultIfcEntity ?? "",
      predefinedType: { mode: "NONE" },
      ifcEntityPhases: project.phases.map((p) => p.id),
      predefinedTypePhases: project.phases.map((p) => p.id),
      requirements: {
        attributes: [],
        properties: [],
        relations: [],
        classifications: [
          {
            id: makeId(),
            classificationId: project.primaryClassificationId,
            systemEntryId: primaryEntry?.id, // Link to classification system entry
            system: systemName,
            identification: code,
            value: code, // Primary classification value should be the code
            name: description,
            readOnly: true,
            occurrence: "required", // Primární klasifikace je vždy požadované
            isApplicability: true, // Primary classification is always in applicability
            extensions: {},
            phases: project.phases.map((p) => p.id), // All phases by default
            useCaseMode: "inherit",
          },
        ],
        materials: [],
      },
    };
  }
  return project.objects[code];
};

export const loadProjectFromStorage = (): Project | null => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Project;
    const version = normalizeIfcSchemaVersion(parsed.ifcSchemaVersion);
    const normalized: Project = {
      ...ensureProjectPhases(parsed),
      ifcSchemaVersion: version,
      ifcSchemaVersionDisplay: getDisplayLabel(version),
      ifcDocumentationUrl: getIfcDocumentationBaseUrl(version),
    };
    return normalized;
  } catch {
    return null;
  }
};

export const clearProjectFromStorage = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

/** Při plném resetu projektu smaže projekt i všechna UI data z localStorage (číselníky, šířky sloupců, sekce atd.). */
export const clearAllAppDataOnReset = (): void => {
  localStorage.removeItem(STORAGE_KEY);
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("infoReqApp_")) keysToRemove.push(key);
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
}

export const saveProjectToStorage = (project: Project) => {
  project.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
};

export const exportProjectFile = (project: Project, filename?: string) => {
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  // Use project name for filename, sanitize it for filesystem
  const safeName = (filename || project.name || "project")
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_");
  link.download = `${safeName}.json`;
  link.click();
  URL.revokeObjectURL(url);
};

export const importProjectFile = async (file: File): Promise<Project> => {
  const text = await file.text();
  const parsed = JSON.parse(text) as Project;
  const version = normalizeIfcSchemaVersion(parsed.ifcSchemaVersion);
  const normalized: Project = {
    ...ensureProjectPhases(parsed),
    ifcSchemaVersion: version,
    ifcSchemaVersionDisplay: getDisplayLabel(version),
    ifcDocumentationUrl: getIfcDocumentationBaseUrl(version),
  };
  return normalized;
};
