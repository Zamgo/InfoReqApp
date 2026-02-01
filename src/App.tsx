import React, { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ClassificationPanel } from "./ui/components/ClassificationPanel";
import { ObjectDetail } from "./ui/components/ObjectDetail";
import { ProjectDetailsDialog } from "./ui/components/ProjectDetailsDialog";
import { IDSExportDialog } from "./ui/components/IDSExportDialog";
import { ExcelExportDialog, type SheetSelection } from "./ui/components/ExcelExportDialog";
import { parseClassificationTsv, parseClassificationSimpleList, detectClassificationFormat, collectLeaves, findNodeByCode } from "./classification/parser";
import { parseClassificationXlsx } from "./classification/sampleXlsx";
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
import { exportExcelFile } from "./export/excel";
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
  const [isProjectDetailsOpen, setIsProjectDetailsOpen] = useState<boolean>(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState<boolean>(false);
  const [isIDSExportOpen, setIsIDSExportOpen] = useState<boolean>(false);
  const [isExcelExportOpen, setIsExcelExportOpen] = useState<boolean>(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  
  // Resizable panel state
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    const stored = localStorage.getItem("infoReqApp_panelWidth");
    return stored ? parseInt(stored, 10) : 360;
  });
  const isResizingRef = useRef<boolean>(false);
  const resizeContainerRef = useRef<HTMLDivElement>(null);
  
  // Undo/Redo history
  const historyRef = useRef<Project[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const isUndoRedoRef = useRef<boolean>(false);

  const migrateProject = (input: Project): Project => {
    // ensure phases and structure
    const migrated = ensureProjectPhases({
      ...input,
      codeLists: input.codeLists ?? [],
      phases: ensurePhaseList(input.phases),
      classifications: (input.classifications ?? [
        {
          id: input.primaryClassificationId ?? input.classification?.hash ?? "primary",
          ifcClassification: { Name: input.classification?.sourceName ?? "Klasifikace" },
          nodes: input.classification?.nodes ?? [],
          sourceName: input.classification?.sourceName ?? "",
          hash: input.classification?.hash,
          isPrimary: true,
          createdAt: input.createdAt ?? new Date().toISOString(),
        },
      ]).map((c) => ({
        ...c,
        ifcClassification: { ...c.ifcClassification, Name: (c.ifcClassification.Name || "").replace(/\.txt$/i, "") },
      })),
      primaryClassificationId:
        input.primaryClassificationId ??
        (input.classifications && input.classifications[0]?.id) ??
        "primary",
    });
    
    // Migrate classification system entries - remove .txt from names
    if (migrated.classificationSystemEntries) {
      migrated.classificationSystemEntries = migrated.classificationSystemEntries.map((e) => ({
        ...e,
        name: (e.name || "").replace(/\.txt$/i, ""),
      }));
    }
    
    // Find primary classification system entry for linking
    const primaryEntry = (migrated.classificationSystemEntries ?? []).find((e) => e.isPrimary);
    
    // Migrate objects - fix classification system names and link to entries
    if (migrated.objects) {
      Object.values(migrated.objects).forEach((obj) => {
        obj.requirements.classifications = obj.requirements.classifications.map((cls) => {
          // Remove .txt from system name
          const cleanSystem = (cls.system || "").replace(/\.txt$/i, "");
          
          // If this is a primary/readOnly classification without systemEntryId, link it
          if ((cls.readOnly || cls.isApplicability) && !cls.systemEntryId && primaryEntry) {
            return { ...cls, system: cleanSystem || primaryEntry.name, systemEntryId: primaryEntry.id };
          }
          
          return { ...cls, system: cleanSystem };
        });
      });
    }
    
    return migrated;
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
    if (!project) return;

    const isXlsx = /\.xlsx$/i.test(file.name);
    let parsed: import("./classification/types").ClassificationData;
    let isPure: boolean;
    let displayName: string;

    if (isXlsx) {
      try {
        parsed = await parseClassificationXlsx(file, file.name.replace(/\.xlsx$/i, ""));
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Import XLSX se nezdařil");
        setTimeout(() => setStatus(""), 5000);
        return;
      }
      const hasIfcInTree = (nodes: typeof parsed.nodes): boolean =>
        nodes.some((n) => !!n.ifcEntity || !!n.predefinedType || (n.children?.length ? hasIfcInTree(n.children) : false));
      isPure = !hasIfcInTree(parsed.nodes);
      displayName = parsed.sourceName || file.name.replace(/\.xlsx$/i, "");
    } else {
      const text = await file.text();
      const format = detectClassificationFormat(text);
      parsed = format === "simple"
        ? parseClassificationSimpleList(text, file.name)
        : parseClassificationTsv(text, file.name);
      isPure = format === "simple";
      displayName = isPure && parsed.sourceName ? parsed.sourceName : file.name.replace(/\.txt$/i, "");
    }

    const uploadedEntry: ClassificationSystemEntry = {
      id: makeId(),
      name: displayName,
      sourceName: file.name,
      nodes: parsed.nodes,
      hash: parsed.hash ?? undefined,
      isPrimary: false,
      isPure: isPure,
    };

    const next: Project = {
      ...project,
      classificationSystemEntries: [...(project.classificationSystemEntries ?? []), uploadedEntry],
      updatedAt: new Date().toISOString(),
    };

    updateProjectWithHistory(next);
    setStatus(`Klasifikace "${uploadedEntry.name}" byla importována`);
    setTimeout(() => setStatus(""), 3000);
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
      setIsExportMenuOpen(false);
    }
  };

  const onExportIDS = () => {
    setIsExportMenuOpen(false);
    setIsIDSExportOpen(true);
  };

  const onExportExcel = () => {
    setIsExportMenuOpen(false);
    setIsExcelExportOpen(true);
  };

  const handleExcelExport = async (selection: SheetSelection) => {
    if (!project) return;
    setIsExcelExportOpen(false);
    setStatus("Generuji Excel soubor...");
    try {
      await exportExcelFile(project, selection);
      setStatus("Excel soubor byl úspěšně exportován");
      setTimeout(() => setStatus(""), 3000);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Export do Excel se nezdařil");
      setTimeout(() => setStatus(""), 5000);
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

  const onImportCodeLists = (lists: CodeList[]) => {
    if (!project || lists.length === 0) return;
    const next: Project = {
      ...project,
      codeLists: [...(project.codeLists ?? []), ...lists],
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

  const onUpdateProjectDetails = (updates: Partial<Project>) => {
    if (!project) return;
    const next: Project = {
      ...project,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    updateProjectWithHistory(next);
  };

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

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Panel resize handlers
  const handleResizeStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!isResizingRef.current || !resizeContainerRef.current) return;
      
      const containerRect = resizeContainerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      
      // Limit width between 250px and 800px
      const clampedWidth = Math.max(250, Math.min(800, newWidth));
      setPanelWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        // Save width to localStorage
        localStorage.setItem("infoReqApp_panelWidth", panelWidth.toString());
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [panelWidth]);

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <div className="text-xs uppercase text-slate-500">InfoReqApp</div>
          <button
            className="text-lg font-semibold text-slate-800 hover:text-indigo-600 flex items-center gap-2 group"
            onClick={() => setIsProjectDetailsOpen(true)}
            disabled={!project}
            title="Klikněte pro úpravu údajů projektu"
          >
            {project?.name || "Načítám..."}
            <svg 
              className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
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
            Import JSON
          </label>
          
          {/* Export dropdown */}
          <div className="relative" ref={exportMenuRef}>
            <button
              className="rounded bg-indigo-600 px-3 py-1 text-sm font-semibold text-white hover:bg-indigo-500 flex items-center gap-1"
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              disabled={!project}
            >
              Export
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {isExportMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 rounded-md border border-slate-200 bg-white shadow-lg z-50">
                <div className="py-1">
                  <button
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                    onClick={onExportProject}
                  >
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    JSON
                  </button>
                  <button
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                    onClick={onExportIDS}
                  >
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    IDS
                  </button>
                  <button
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                    onClick={onExportExcel}
                  >
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Excel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {status && (
        <div className="bg-amber-50 px-4 py-2 text-sm text-amber-700">{status}</div>
      )}

      <div ref={resizeContainerRef} className="flex flex-1 overflow-hidden">
        <div 
          className="flex-shrink-0 overflow-hidden"
          style={{ width: panelWidth }}
        >
          <ClassificationPanel
            classification={classification}
            objects={project?.objects}
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
            onImportCodeLists={onImportCodeLists}
            onUpdateCodeList={onUpdateCodeList}
            onDeleteCodeList={onDeleteCodeList}
            codeListUsage={codeListUsage}
            classificationSystemEntries={project?.classificationSystemEntries ?? []}
            onAddClassificationSystemEntry={onAddClassificationSystemEntry}
            onUpdateClassificationSystemEntry={onUpdateClassificationSystemEntry}
            onDeleteClassificationSystemEntry={onDeleteClassificationSystemEntry}
          />
        </div>
        
        {/* Resize handle */}
        <div
          className="w-1 cursor-col-resize bg-slate-200 hover:bg-indigo-400 active:bg-indigo-500 transition-colors flex-shrink-0"
          onMouseDown={handleResizeStart}
          title="Táhněte pro změnu šířky panelu"
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

      {/* Project Details Dialog */}
      {project && (
        <ProjectDetailsDialog
          project={project}
          isOpen={isProjectDetailsOpen}
          onClose={() => setIsProjectDetailsOpen(false)}
          onSave={onUpdateProjectDetails}
        />
      )}

      {/* IDS Export Dialog */}
      {project && (
        <IDSExportDialog
          project={project}
          classification={classification}
          isOpen={isIDSExportOpen}
          onClose={() => setIsIDSExportOpen(false)}
        />
      )}

      {/* Excel Export Dialog */}
      {project && (
        <ExcelExportDialog
          project={project}
          isOpen={isExcelExportOpen}
          onClose={() => setIsExcelExportOpen(false)}
          onExport={(selection) => void handleExcelExport(selection)}
        />
      )}
    </div>
  );
};

const App: React.FC = () => (
  <SchemaProvider>
    <AppInner />
  </SchemaProvider>
);

export default App;
