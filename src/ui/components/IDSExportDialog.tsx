import React, { useEffect, useMemo, useState } from "react";
import type { Project, Phase, ProjectObject } from "../../project/types";
import type { ClassificationNode } from "../../classification/types";
import { generateIDS, exportIDSFile, exportIDSZip, getObjectsWithRequirementsForPhase } from "../../export/ids";

interface Props {
  project: Project;
  classification: { nodes: ClassificationNode[] } | null;
  isOpen: boolean;
  onClose: () => void;
}

type ExportMode = "by-phase" | "by-objects";

interface ObjectPhaseSelection {
  objectCode: string;
  phases: string[];
}

/**
 * Collect leaf nodes (objects) from classification tree
 */
const collectLeaves = (nodes: ClassificationNode[]): ClassificationNode[] => {
  const result: ClassificationNode[] = [];
  const traverse = (node: ClassificationNode) => {
    if (node.children.length === 0) {
      result.push(node);
    } else {
      node.children.forEach(traverse);
    }
  };
  nodes.forEach(traverse);
  return result;
};

/**
 * Tree item component for object selection
 */
const ObjectTreeItem: React.FC<{
  node: ClassificationNode;
  project: Project;
  selectedObjects: Set<string>;
  objectPhases: Map<string, Set<string>>;
  onToggleObject: (code: string) => void;
  onTogglePhase: (objectCode: string, phaseId: string) => void;
  phases: Phase[];
}> = ({ node, project, selectedObjects, objectPhases, onToggleObject, onTogglePhase, phases }) => {
  const [expanded, setExpanded] = useState(node.level <= 2);
  const isLeaf = node.children.length === 0;
  const hasObject = isLeaf && project.objects[node.code];
  const isSelected = selectedObjects.has(node.code);
  const selectedPhases = objectPhases.get(node.code) || new Set<string>();

  // Check if this branch has any selected items
  const hasSomeSelected = useMemo(() => {
    if (isLeaf) return isSelected;
    const checkChildren = (n: ClassificationNode): boolean => {
      if (n.children.length === 0) return selectedObjects.has(n.code);
      return n.children.some(checkChildren);
    };
    return node.children.some(checkChildren);
  }, [isLeaf, isSelected, node.children, selectedObjects]);

  return (
    <div className="border-l border-slate-200 pl-3">
      <div className="flex items-start gap-2 py-1">
        {!isLeaf && (
          <button
            className="flex h-5 w-5 items-center justify-center rounded text-xs text-slate-500 hover:bg-slate-200 hover:text-slate-800 flex-shrink-0 mt-0.5"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "−" : "+"}
          </button>
        )}
        {isLeaf && <span className="w-5 flex-shrink-0" />}
        
        <div className="flex-1 min-w-0">
          <div className={`flex items-center gap-2 ${hasSomeSelected ? "text-indigo-700" : "text-slate-800"}`}>
            {isLeaf && hasObject && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleObject(node.code)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
            )}
            <div className="flex flex-col min-w-0">
              <span className={`text-sm truncate ${isLeaf ? "font-semibold" : "font-medium"}`}>
                {node.description || node.code}
              </span>
              <span className="text-[11px] text-slate-500">{node.code}</span>
            </div>
          </div>
          
          {/* Phase selection for selected objects */}
          {isLeaf && isSelected && (
            <div className="mt-2 ml-6 flex flex-wrap gap-2">
              {phases.map((phase) => (
                <label
                  key={phase.id}
                  className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs cursor-pointer ${
                    selectedPhases.has(phase.id)
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedPhases.has(phase.id)}
                    onChange={() => onTogglePhase(node.code, phase.id)}
                    className="h-3 w-3 rounded border-slate-300 text-indigo-600"
                  />
                  {phase.code}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {expanded && node.children.map((child) => (
        <ObjectTreeItem
          key={child.code}
          node={child}
          project={project}
          selectedObjects={selectedObjects}
          objectPhases={objectPhases}
          onToggleObject={onToggleObject}
          onTogglePhase={onTogglePhase}
          phases={phases}
        />
      ))}
    </div>
  );
};

export const IDSExportDialog: React.FC<Props> = ({
  project,
  classification,
  isOpen,
  onClose,
}) => {
  const [mode, setMode] = useState<ExportMode>("by-phase");
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>("");
  const [selectedObjects, setSelectedObjects] = useState<Set<string>>(new Set());
  const [objectPhases, setObjectPhases] = useState<Map<string, Set<string>>>(new Map());
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string>("");
  const [search, setSearch] = useState("");

  // Initialize with first phase
  useEffect(() => {
    if (isOpen && project.phases.length > 0 && !selectedPhaseId) {
      setSelectedPhaseId(project.phases[0].id);
    }
  }, [isOpen, project.phases, selectedPhaseId]);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setError("");
      setIsExporting(false);
    }
  }, [isOpen]);

  // Get objects with requirements for selected phase (for preview)
  const objectsForPhase = useMemo(() => {
    if (!selectedPhaseId) return [];
    return getObjectsWithRequirementsForPhase(project, selectedPhaseId);
  }, [project, selectedPhaseId]);

  // Filter classification nodes by search
  const filteredNodes = useMemo(() => {
    if (!classification) return [];
    if (!search.trim()) return classification.nodes;
    
    const filterNode = (node: ClassificationNode): ClassificationNode | null => {
      const matchesSearch = 
        node.code.toLowerCase().includes(search.toLowerCase()) ||
        node.description.toLowerCase().includes(search.toLowerCase());
      
      const filteredChildren = node.children
        .map(filterNode)
        .filter((n): n is ClassificationNode => n !== null);
      
      if (matchesSearch || filteredChildren.length > 0) {
        return { ...node, children: filteredChildren };
      }
      return null;
    };
    
    return classification.nodes
      .map(filterNode)
      .filter((n): n is ClassificationNode => n !== null);
  }, [classification, search]);

  const handleToggleObject = (code: string) => {
    setSelectedObjects((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
        // Also remove phase selection
        setObjectPhases((prevPhases) => {
          const nextPhases = new Map(prevPhases);
          nextPhases.delete(code);
          return nextPhases;
        });
      } else {
        next.add(code);
        // Initialize with all phases selected
        setObjectPhases((prevPhases) => {
          const nextPhases = new Map(prevPhases);
          nextPhases.set(code, new Set(project.phases.map((p) => p.id)));
          return nextPhases;
        });
      }
      return next;
    });
  };

  const handleTogglePhase = (objectCode: string, phaseId: string) => {
    setObjectPhases((prev) => {
      const next = new Map(prev);
      const phases = new Set(next.get(objectCode) || []);
      if (phases.has(phaseId)) {
        phases.delete(phaseId);
      } else {
        phases.add(phaseId);
      }
      next.set(objectCode, phases);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!classification) return;
    const leaves = collectLeaves(classification.nodes);
    const objectCodes = leaves
      .filter((leaf) => project.objects[leaf.code])
      .map((leaf) => leaf.code);
    
    setSelectedObjects(new Set(objectCodes));
    const newPhases = new Map<string, Set<string>>();
    objectCodes.forEach((code) => {
      newPhases.set(code, new Set(project.phases.map((p) => p.id)));
    });
    setObjectPhases(newPhases);
  };

  const handleDeselectAll = () => {
    setSelectedObjects(new Set());
    setObjectPhases(new Map());
  };

  const handleExportByPhase = async () => {
    if (!selectedPhaseId) return;
    setIsExporting(true);
    setError("");

    try {
      const ids = generateIDS({
        project,
        phaseId: selectedPhaseId,
      });
      
      const phase = project.phases.find((p) => p.id === selectedPhaseId);
      const safeName = (project.name || "project")
        .replace(/[<>:"/\\|?*]/g, "_")
        .replace(/\s+/g, "_");
      const filename = `${safeName}_${phase?.code || selectedPhaseId}.ids`;
      
      exportIDSFile(ids, filename);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export se nezdařil");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportByObjects = async () => {
    if (selectedObjects.size === 0) {
      setError("Vyberte alespoň jeden objekt");
      return;
    }

    setIsExporting(true);
    setError("");

    try {
      // Group by phase - create one IDS file per phase
      const phaseFiles: Array<{ phaseId: string; objectCodes: string[] }> = [];
      const phaseObjectMap = new Map<string, string[]>();

      selectedObjects.forEach((objectCode) => {
        const phases = objectPhases.get(objectCode) || new Set<string>();
        phases.forEach((phaseId) => {
          const objects = phaseObjectMap.get(phaseId) || [];
          objects.push(objectCode);
          phaseObjectMap.set(phaseId, objects);
        });
      });

      phaseObjectMap.forEach((objectCodes, phaseId) => {
        phaseFiles.push({ phaseId, objectCodes });
      });

      if (phaseFiles.length === 0) {
        setError("Vyberte alespoň jednu fázi pro export");
        return;
      }

      const files: Array<{ filename: string; content: string }> = [];
      
      for (const { phaseId, objectCodes } of phaseFiles) {
        try {
          const ids = generateIDS({
            project,
            phaseId,
            objectCodes,
          });
          
          const phase = project.phases.find((p) => p.id === phaseId);
          const safeName = (project.name || "project")
            .replace(/[<>:"/\\|?*]/g, "_")
            .replace(/\s+/g, "_");
          const filename = `${safeName}_${phase?.code || phaseId}.ids`;
          
          files.push({ filename, content: ids });
        } catch (err) {
          // Skip phases with no requirements
          console.warn(`Skipping phase ${phaseId}:`, err);
        }
      }

      if (files.length === 0) {
        setError("Žádné požadavky k exportu pro vybrané kombinace");
        return;
      }

      if (files.length === 1) {
        // Single file - export directly
        exportIDSFile(files[0].content, files[0].filename);
      } else {
        // Multiple files - export as ZIP
        const safeName = (project.name || "project")
          .replace(/[<>:"/\\|?*]/g, "_")
          .replace(/\s+/g, "_");
        await exportIDSZip(files, `${safeName}_IDS.zip`);
      }
      
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export se nezdařil");
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">Export IDS</h2>
          <p className="text-sm text-slate-500">
            Vyberte způsob exportu informačních požadavků do formátu IDS
          </p>
        </div>

        {/* Mode tabs */}
        <div className="flex-shrink-0 border-b border-slate-200 px-6">
          <div className="flex gap-4">
            <button
              className={`border-b-2 px-1 py-3 text-sm font-medium ${
                mode === "by-phase"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
              onClick={() => setMode("by-phase")}
            >
              Export dle fáze
            </button>
            <button
              className={`border-b-2 px-1 py-3 text-sm font-medium ${
                mode === "by-objects"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
              onClick={() => setMode("by-objects")}
            >
              Export dle objektů
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden px-6 py-4">
          {mode === "by-phase" && (
            <div className="flex h-full flex-col gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Vyberte fázi
                </label>
                <select
                  value={selectedPhaseId}
                  onChange={(e) => setSelectedPhaseId(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {project.phases.map((phase) => (
                    <option key={phase.id} value={phase.id}>
                      {phase.code} - {phase.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedPhaseId && (
                <div className="flex-1 overflow-hidden">
                  <div className="mb-2 text-sm font-medium text-slate-700">
                    Objekty s požadavky pro tuto fázi ({objectsForPhase.length})
                  </div>
                  <div className="h-full overflow-auto rounded border border-slate-200 bg-slate-50 p-3">
                    {objectsForPhase.length === 0 ? (
                      <div className="text-sm text-slate-500">
                        Žádné objekty nemají požadavky pro tuto fázi
                      </div>
                    ) : (
                      <ul className="space-y-1">
                        {objectsForPhase.map((obj) => (
                          <li key={obj.code} className="text-sm text-slate-700">
                            <span className="font-medium">{obj.code}</span>
                            <span className="text-slate-500"> - {obj.description}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === "by-objects" && (
            <div className="flex h-full flex-col gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Hledat objekt..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  onClick={handleSelectAll}
                >
                  Vybrat vše
                </button>
                <button
                  className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  onClick={handleDeselectAll}
                >
                  Zrušit výběr
                </button>
              </div>

              <div className="text-xs text-slate-500">
                Vyberte objekty a pro každý zvolte fáze k exportu. Soubory budou seskupeny dle fází.
              </div>

              <div className="flex-1 overflow-auto rounded border border-slate-200 bg-slate-50 p-2">
                {!classification ? (
                  <div className="text-sm text-slate-500">Není načtena klasifikace</div>
                ) : filteredNodes.length === 0 ? (
                  <div className="text-sm text-slate-500">Žádné výsledky</div>
                ) : (
                  filteredNodes.map((node) => (
                    <ObjectTreeItem
                      key={node.code}
                      node={node}
                      project={project}
                      selectedObjects={selectedObjects}
                      objectPhases={objectPhases}
                      onToggleObject={handleToggleObject}
                      onTogglePhase={handleTogglePhase}
                      phases={project.phases}
                    />
                  ))
                )}
              </div>

              <div className="text-sm text-slate-600">
                Vybráno: {selectedObjects.size} objektů
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex-shrink-0 bg-red-50 px-6 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex flex-shrink-0 justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button
            className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={onClose}
            disabled={isExporting}
          >
            Zrušit
          </button>
          <button
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            onClick={mode === "by-phase" ? handleExportByPhase : handleExportByObjects}
            disabled={
              isExporting ||
              (mode === "by-phase" && !selectedPhaseId) ||
              (mode === "by-objects" && selectedObjects.size === 0)
            }
          >
            {isExporting ? "Exportuji..." : "Exportovat IDS"}
          </button>
        </div>
      </div>
    </div>
  );
};
