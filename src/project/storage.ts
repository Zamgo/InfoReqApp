import type { ClassificationData, ClassificationSystem } from "../classification/types";
import { makeId } from "../utils/id";
import type { Project, ProjectObject } from "./types";
import { DEFAULT_PHASES, ensureProjectPhases } from "./phases";

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
    createdAt: now,
    updatedAt: now,
    ifcSchemaVersion: "IFC4X3",
    classification,
    classifications: [primary],
    primaryClassificationId: primary.id,
    phases: DEFAULT_PHASES,
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
            isApplicability: true, // Primary classification is always in applicability
            extensions: {},
            phases: [],
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
    return ensureProjectPhases(parsed);
  } catch {
    return null;
  }
};

export const saveProjectToStorage = (project: Project) => {
  project.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
};

export const exportProjectFile = (project: Project) => {
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "project.json";
  link.click();
  URL.revokeObjectURL(url);
};

export const importProjectFile = async (file: File): Promise<Project> => {
  const text = await file.text();
  const parsed = JSON.parse(text) as Project;
  return ensureProjectPhases(parsed);
};
