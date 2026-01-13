import React, { useEffect, useMemo, useState } from "react";
import { ClassificationPanel } from "./ui/components/ClassificationPanel";
import { ObjectDetail } from "./ui/components/ObjectDetail";
import { parseClassificationTsv, collectLeaves, findNodeByCode } from "./classification/parser";
import type { ClassificationData, ClassificationNode } from "./classification/types";
import { SchemaProvider, useSchema } from "./schema/SchemaProvider";
import type { Phase, Project, ProjectObject } from "./project/types";
import {
  createEmptyProject,
  ensureObject,
  exportProjectFile,
  importProjectFile,
  loadProjectFromStorage,
  saveProjectToStorage,
} from "./project/storage";
import { ensurePhaseList, ensureProjectPhases, removePhaseFromProject } from "./project/phases";
import "./index.css";

const DEFAULT_CLASSIFICATION_PATH = "/classification/Klasifikace_IfcEntity.txt";

const AppInner: React.FC = () => {
  const { index: schemaIndex, loading: schemaLoading, error: schemaError } = useSchema();
  const [classification, setClassification] = useState<ClassificationData | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [selectedCode, setSelectedCode] = useState<string>();
  const [selectedObject, setSelectedObject] = useState<ProjectObject | null>(null);
  const [status, setStatus] = useState<string>("");

  const migrateProject = (input: Project): Project => {
    // ensure phases and structure
    return ensureProjectPhases({
      ...input,
      phases: ensurePhaseList(input.phases),
      classifications: input.classifications ?? [
        {
          id: input.primaryClassificationId ?? input.classification?.hash ?? "primary",
          ifcClassification: { Name: input.classification?.sourceName ?? "Klasifikace" },
          nodes: input.classification?.nodes ?? [],
          sourceName: input.classification?.sourceName ?? "",
          hash: input.classification?.hash,
          isPrimary: true,
          createdAt: input.createdAt ?? new Date().toISOString(),
        },
      ],
      primaryClassificationId:
        input.primaryClassificationId ??
        (input.classifications && input.classifications[0]?.id) ??
        "primary",
    });
  };

  const loadDefaultClassification = async () => {
    try {
      setStatus("Načítám výchozí klasifikaci...");
      const res = await fetch(DEFAULT_CLASSIFICATION_PATH);
      if (!res.ok) throw new Error("Nelze načíst výchozí TXT");
      const text = await res.text();
      const parsed = parseClassificationTsv(text, "Klasifikace_IfcEntity.txt");
      setClassification(parsed);
      const newProject = createEmptyProject(parsed);
      setProject(newProject);
      const leaves = collectLeaves(parsed.nodes);
      setSelectedCode(leaves[0]?.code);
      saveProjectToStorage(newProject);
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Chyba při načítání TXT");
    }
  };

  useEffect(() => {
    const stored = loadProjectFromStorage();
    if (stored) {
      const migrated = migrateProject(stored);
      setProject(migrated);
      setClassification(migrated.classification);
      const leaves = collectLeaves(migrated.classification.nodes);
      setSelectedCode(migrated.objects[leaves[0]?.code]?.code ?? leaves[0]?.code);
    } else {
      void loadDefaultClassification();
    }
  }, []);

  const selectedNode = useMemo<ClassificationNode | undefined>(() => {
    if (!classification || !selectedCode) return undefined;
    return findNodeByCode(classification.nodes, selectedCode);
  }, [classification, selectedCode]);

  useEffect(() => {
    if (!project || !selectedCode || !classification) {
      setSelectedObject(null);
      return;
    }
    const node = findNodeByCode(classification.nodes, selectedCode);
    if (!node) {
      setSelectedObject(null);
      return;
    }
    if (!project.objects[node.code]) {
      const nextProject = { ...project, objects: { ...project.objects } };
      const ensured = ensureObject(nextProject, node.code, node.description, node.ifcEntity);
      setProject(nextProject);
      saveProjectToStorage(nextProject);
      setSelectedObject(ensured);
    } else {
      setSelectedObject(project.objects[node.code]);
    }
  }, [project, selectedCode, classification]);

  const onSelectLeaf = (node: ClassificationNode) => {
    setSelectedCode(node.code);
  };

  const onUploadClassification = async (file: File) => {
    const text = await file.text();
    const parsed = parseClassificationTsv(text, file.name);
    setClassification(parsed);
    const newProject = createEmptyProject(parsed);
    setProject(newProject);
    const leaves = collectLeaves(parsed.nodes);
    setSelectedCode(leaves[0]?.code);
    saveProjectToStorage(newProject);
  };

  const onUpdateObject = (obj: ProjectObject) => {
    if (!project) return;
    const next: Project = {
      ...project,
      objects: { ...project.objects, [obj.code]: obj },
      updatedAt: new Date().toISOString(),
    };
    setProject(next);
    saveProjectToStorage(next);
  };

  const onImportProject = async (file: File) => {
    try {
      const imported = await importProjectFile(file);
      const migrated = migrateProject(imported);
      setProject(migrated);
      setClassification(migrated.classification);
      const leaves = collectLeaves(migrated.classification.nodes);
      setSelectedCode(leaves[0]?.code);
      saveProjectToStorage(migrated);
      setStatus("Projekt importován");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Import se nezdařil");
    }
  };

  const onExportProject = () => {
    if (project) {
      exportProjectFile(project);
    }
  };

  const onAddPhase = (phase: Phase) => {
    if (!project) return;
    const next = {
      ...project,
      phases: ensurePhaseList([...project.phases, phase]),
      updatedAt: new Date().toISOString(),
    };
    setProject(next);
    saveProjectToStorage(next);
  };

  const onUpdatePhase = (phase: Phase) => {
    if (!project) return;
    const nextPhases = project.phases.map((p) => (p.id === phase.id ? phase : p));
    const next = ensureProjectPhases({ ...project, phases: nextPhases });
    setProject(next);
    saveProjectToStorage(next);
  };

  const onDeletePhase = (phaseId: string) => {
    if (!project) return;
    const next = removePhaseFromProject(project, phaseId);
    setProject(next);
    saveProjectToStorage(next);
  };

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <div className="text-xs uppercase text-slate-500">InfoReqApp</div>
          <div className="text-lg font-semibold">
            Požadavky na IFC 4x3 {project ? `• ${project.name}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
            onClick={() => void loadDefaultClassification()}
          >
            Reset
          </button>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50">
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onImportProject(file);
              }}
            />
            Import project.json
          </label>
          <button
            className="rounded bg-indigo-600 px-3 py-1 text-sm font-semibold text-white hover:bg-indigo-500"
            onClick={onExportProject}
            disabled={!project}
          >
            Export project.json
          </button>
        </div>
      </header>

      {status && (
        <div className="bg-amber-50 px-4 py-2 text-sm text-amber-700">{status}</div>
      )}

      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[360px_1fr]">
        <ClassificationPanel
          classification={classification}
          selectedCode={selectedCode}
          onSelectLeaf={onSelectLeaf}
          onUploadFile={onUploadClassification}
          onResetDefault={() => void loadDefaultClassification()}
          phases={project?.phases ?? []}
          onAddPhase={onAddPhase}
          onUpdatePhase={onUpdatePhase}
          onDeletePhase={onDeletePhase}
        />

        <div className="flex-1 overflow-hidden">
          {schemaLoading && (
            <div className="p-4 text-sm text-slate-600">Načítám schema index...</div>
          )}
          {schemaError && (
            <div className="p-4 text-sm text-red-600">
              {schemaError} (spusťte npm run build:schema)
            </div>
          )}
          {!selectedNode && (
            <div className="p-4 text-sm text-slate-600">Vyberte objekt ve stromu.</div>
          )}
          {selectedNode && selectedObject && (
            <ObjectDetail
              node={selectedNode}
              object={selectedObject}
              schema={schemaIndex}
              onChange={onUpdateObject}
              phases={project?.phases ?? []}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => (
  <SchemaProvider>
    <AppInner />
  </SchemaProvider>
);

export default App;
