import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClassificationPanel } from "./ui/components/ClassificationPanel";
import { ObjectDetail } from "./ui/components/ObjectDetail";
import { parseClassificationTsv, collectLeaves, findNodeByCode } from "./classification/parser";
import type { ClassificationData, ClassificationNode } from "./classification/types";
import { SchemaProvider, useSchema } from "./schema/SchemaProvider";
import type { ClassificationSystemEntry, CodeList, Phase, Project, ProjectObject } from "./project/types";
import {
  createEmptyProject,
  ensureObject,
  exportProjectFile,
  importProjectFile,
  loadProjectFromStorage,
  saveProjectToStorage,
} from "./project/storage";
import { ensurePhaseList, ensureProjectPhases, removePhaseFromProject } from "./project/phases";
import { ENUM_CODELIST_ID_KEY, formatEnumValues } from "./project/enumeration";
import "./index.css";
import { makeId } from "./utils/id";

const DEFAULT_CLASSIFICATION_PATH = "/classification/Klasifikace_IfcEntity.txt";

const applyCodeListPropagation = (project: Project, list: CodeList): Project => {
  // Update all properties that are linked to this code list
  const nextObjects: Project["objects"] = { ...project.objects };
  let changed = false;

  Object.entries(nextObjects).forEach(([code, obj]) => {
    let objChanged = false;
    const nextReqs = { ...obj.requirements };
    const nextProps = obj.requirements.properties.map((p) => {
      const id = (p.extensions?.[ENUM_CODELIST_ID_KEY] as string | undefined) ?? undefined;
      if (p.constraint !== "ENUM" || !id || id !== list.id) return p;
        const nextValue = formatEnumValues(list.values ?? []);
      if ((p.value ?? "") === nextValue) return p;
      objChanged = true;
      return { ...p, value: nextValue };
    });
    if (objChanged) {
      changed = true;
      nextReqs.properties = nextProps;
      nextObjects[code] = { ...obj, requirements: nextReqs };
    }
  });

  return changed ? { ...project, objects: nextObjects } : project;
};

const AppInner: React.FC = () => {
  const { index: schemaIndex, loading: schemaLoading, error: schemaError } = useSchema();
  const [classification, setClassification] = useState<ClassificationData | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [selectedCode, setSelectedCode] = useState<string>();
  const [selectedObject, setSelectedObject] = useState<ProjectObject | null>(null);
  const [status, setStatus] = useState<string>("");
  
  // Undo/Redo history
  const historyRef = useRef<Project[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const isUndoRedoRef = useRef<boolean>(false);

  const migrateProject = (input: Project): Project => {
    // ensure phases and structure
    return ensureProjectPhases({
      ...input,
      codeLists: input.codeLists ?? [],
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
      
      // Create a ClassificationSystemEntry for the default classification
      const defaultEntry: ClassificationSystemEntry = {
        id: makeId(),
        name: "Klasifikace_IfcEntity",
        sourceName: "Klasifikace_IfcEntity.txt",
        nodes: parsed.nodes,
        hash: parsed.hash,
        isPrimary: true,
      };
      newProject.classificationSystemEntries = [defaultEntry];
      
      // Reset history for new project
      historyRef.current = [JSON.parse(JSON.stringify(newProject))];
      historyIndexRef.current = 0;
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
      // Don't add to history when auto-creating object on selection
      isUndoRedoRef.current = true;
      setProject(nextProject);
      saveProjectToStorage(nextProject);
      isUndoRedoRef.current = false;
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
    
    // Create a ClassificationSystemEntry for the uploaded classification
    const uploadedEntry: ClassificationSystemEntry = {
      id: makeId(),
      name: file.name.replace(/\.txt$/i, ""),
      sourceName: file.name,
      nodes: parsed.nodes,
      hash: parsed.hash,
      isPrimary: true,
    };
    newProject.classificationSystemEntries = [uploadedEntry];
    
    // Reset history for new project
    historyRef.current = [JSON.parse(JSON.stringify(newProject))];
    historyIndexRef.current = 0;
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
    updateProjectWithHistory(next);
    // Aktualizovat selectedObject, pokud je to aktuálně vybraný objekt
    if (selectedObject && selectedObject.code === obj.code) {
      setSelectedObject(obj);
    }
  };

  const onImportProject = async (file: File) => {
    try {
      const imported = await importProjectFile(file);
      const migrated = migrateProject(imported);
      // Reset history for imported project
      historyRef.current = [JSON.parse(JSON.stringify(migrated))];
      historyIndexRef.current = 0;
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
    updateProjectWithHistory(next);
  };

  const onUpdatePhase = (phase: Phase) => {
    if (!project) return;
    const nextPhases = project.phases.map((p) => (p.id === phase.id ? phase : p));
    const next = ensureProjectPhases({ ...project, phases: nextPhases });
    updateProjectWithHistory(next);
  };

  const onDeletePhase = (phaseId: string) => {
    if (!project) return;
    const next = removePhaseFromProject(project, phaseId);
    updateProjectWithHistory(next);
  };

  const onAddCodeList = (list: CodeList) => {
    if (!project) return;
    const next: Project = {
      ...project,
      codeLists: [...(project.codeLists ?? []), list],
      updatedAt: new Date().toISOString(),
    };
    updateProjectWithHistory(next);
  };

  const onUpdateCodeList = (id: string, updates: Partial<CodeList>) => {
    if (!project) return;
    const existing = (project.codeLists ?? []).find((c) => c.id === id);
    const nextLists = (project.codeLists ?? []).map((c) => (c.id === id ? { ...c, ...updates } : c));
    let next: Project = ensureProjectPhases({ ...project, codeLists: nextLists });
    const updated = existing ? nextLists.find((c) => c.id === id) : undefined;
    if (updated) next = applyCodeListPropagation(next, updated);
    updateProjectWithHistory(next);
  };

  const onDeleteCodeList = (id: string) => {
    if (!project) return;
    const nextLists = (project.codeLists ?? []).filter((c) => c.id !== id);
    const next: Project = ensureProjectPhases({ ...project, codeLists: nextLists });
    updateProjectWithHistory(next);
  };

  const onSaveEnumAsCodeList = (opts: {
    objectCode: string;
    propertyId: string;
    name: string;
    values: string[];
    link: boolean;
  }) => {
    if (!project) return;
    const list: CodeList = {
      id: makeId(),
      name: (opts.name || "").trim() || "Číselník",
      values: opts.values ?? [],
    };

    let next: Project = {
      ...project,
      codeLists: [...(project.codeLists ?? []), list],
      updatedAt: new Date().toISOString(),
    };

    if (opts.link) {
      const obj = next.objects[opts.objectCode];
      if (obj) {
        const nextReqs = { ...obj.requirements };
        nextReqs.properties = obj.requirements.properties.map((p) => {
          if (p.id !== opts.propertyId) return p;
          const nextExtensions = { ...(p.extensions ?? {}) } as Record<string, unknown>;
          nextExtensions[ENUM_CODELIST_ID_KEY] = list.id;
          return {
            ...p,
            constraint: "ENUM",
            value: formatEnumValues(list.values),
            extensions: nextExtensions,
          };
        });
        next = {
          ...next,
          objects: {
            ...next.objects,
            [opts.objectCode]: { ...obj, requirements: nextReqs },
          },
        };
      }
    }

    updateProjectWithHistory(next);
  };

  const codeListUsage = useMemo(() => {
    const usage: Record<
      string,
      Array<{ objectCode: string; objectDescription?: string; propertyLabel?: string }>
    > = {};
    if (!project) return usage;
    Object.values(project.objects).forEach((obj) => {
      obj.requirements.properties.forEach((p) => {
        const id = (p.extensions?.[ENUM_CODELIST_ID_KEY] as string | undefined) ?? undefined;
        if (!id || p.constraint !== "ENUM") return;
        const label = `${p.psetName || ""}${p.propertyName ? `.${p.propertyName}` : ""}`.trim() || undefined;
        (usage[id] ??= []).push({
          objectCode: obj.code,
          objectDescription: obj.description,
          propertyLabel: label,
        });
      });
    });
    return usage;
  }, [project]);

  // Classification System Entries handlers
  const onAddClassificationSystemEntry = (entry: ClassificationSystemEntry) => {
    if (!project) return;
    const next: Project = {
      ...project,
      classificationSystemEntries: [...(project.classificationSystemEntries ?? []), entry],
      updatedAt: new Date().toISOString(),
    };
    updateProjectWithHistory(next);
  };

  const onUpdateClassificationSystemEntry = (id: string, updates: Partial<ClassificationSystemEntry>) => {
    if (!project) return;
    
    // If setting this entry as primary, unset all others
    let nextEntries = (project.classificationSystemEntries ?? []).map((e) =>
      e.id === id ? { ...e, ...updates } : e
    );
    
    if (updates.isPrimary === true) {
      nextEntries = nextEntries.map((e) =>
        e.id !== id ? { ...e, isPrimary: false } : e
      );
    }
    
    const updatedEntry = nextEntries.find((e) => e.id === id);
    
    // Update the main classification if the primary entry's nodes changed
    let nextClassification = project.classification;
    if (updatedEntry?.isPrimary && updatedEntry.nodes) {
      nextClassification = {
        nodes: updatedEntry.nodes,
        sourceName: updatedEntry.sourceName || updatedEntry.name,
        hash: updatedEntry.hash,
      };
      setClassification(nextClassification);
    }
    
    // If isPrimary was just set, also update the main classification
    if (updates.isPrimary === true && updatedEntry?.nodes) {
      nextClassification = {
        nodes: updatedEntry.nodes,
        sourceName: updatedEntry.sourceName || updatedEntry.name,
        hash: updatedEntry.hash,
      };
      setClassification(nextClassification);
    }
    
    const next: Project = {
      ...project,
      classification: nextClassification,
      classificationSystemEntries: nextEntries,
      updatedAt: new Date().toISOString(),
    };
    updateProjectWithHistory(next);
  };

  const onDeleteClassificationSystemEntry = (id: string) => {
    if (!project) return;
    const nextEntries = (project.classificationSystemEntries ?? []).filter((e) => e.id !== id);
    const next: Project = {
      ...project,
      classificationSystemEntries: nextEntries,
      updatedAt: new Date().toISOString(),
    };
    updateProjectWithHistory(next);
  };

  const classificationSystemUsage = useMemo(() => {
    const usage: Record<string, Array<{ objectCode: string; objectDescription?: string }>> = {};
    if (!project) return usage;
    Object.values(project.objects).forEach((obj) => {
      obj.requirements.classifications.forEach((c) => {
        const systemEntryId = c.systemEntryId;
        if (!systemEntryId) return;
        (usage[systemEntryId] ??= []).push({
          objectCode: obj.code,
          objectDescription: obj.description,
        });
      });
    });
    return usage;
  }, [project]);

  // Undo/Redo functions
  const updateProjectWithHistory = (newProject: Project) => {
    if (isUndoRedoRef.current) {
      setProject(newProject);
      saveProjectToStorage(newProject);
      return;
    }

    // Remove any history after current index (when doing new action after undo)
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    }

    // Add new state to history
    historyRef.current.push(JSON.parse(JSON.stringify(newProject))); // Deep clone
    historyIndexRef.current = historyRef.current.length - 1;

    // Limit history size to 50 states
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
      historyIndexRef.current--;
    }

    setProject(newProject);
    saveProjectToStorage(newProject);
  };

  const canUndo = () => {
    return historyIndexRef.current > 0;
  };

  const canRedo = () => {
    return historyIndexRef.current < historyRef.current.length - 1;
  };

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    isUndoRedoRef.current = true;
    historyIndexRef.current--;
    const previousProject = historyRef.current[historyIndexRef.current];
    setProject(previousProject);
    saveProjectToStorage(previousProject);
    isUndoRedoRef.current = false;
  }, []);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    isUndoRedoRef.current = true;
    historyIndexRef.current++;
    const nextProject = historyRef.current[historyIndexRef.current];
    setProject(nextProject);
    saveProjectToStorage(nextProject);
    isUndoRedoRef.current = false;
  }, []);

  // Initialize history when project is first loaded from storage
  useEffect(() => {
    if (project && !isUndoRedoRef.current) {
      // Only initialize if history is empty (first load)
      if (historyRef.current.length === 0) {
        historyRef.current = [JSON.parse(JSON.stringify(project))];
        historyIndexRef.current = 0;
      }
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo]);

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
            className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleUndo}
            disabled={!canUndo() || !project}
            title="Zpět (Ctrl+Z)"
          >
            ↶ Zpět
          </button>
          <button
            className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleRedo}
            disabled={!canRedo() || !project}
            title="Vpřed (Ctrl+Y)"
          >
            ↷ Vpřed
          </button>
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
          codeLists={project?.codeLists ?? []}
          onAddCodeList={onAddCodeList}
          onUpdateCodeList={onUpdateCodeList}
          onDeleteCodeList={onDeleteCodeList}
          codeListUsage={codeListUsage}
          classificationSystemEntries={project?.classificationSystemEntries ?? []}
          onAddClassificationSystemEntry={onAddClassificationSystemEntry}
          onUpdateClassificationSystemEntry={onUpdateClassificationSystemEntry}
          onDeleteClassificationSystemEntry={onDeleteClassificationSystemEntry}
          classificationSystemUsage={classificationSystemUsage}
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
              codeLists={project?.codeLists ?? []}
              classificationSystemEntries={project?.classificationSystemEntries ?? []}
              onSaveEnumAsCodeList={onSaveEnumAsCodeList}
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
