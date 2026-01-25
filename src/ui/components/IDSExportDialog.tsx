import React, { useEffect, useMemo, useState } from "react";
import type { Project, Phase, ProjectObject, PropertyRequirement, AttributeRequirement, ClassificationRequirement, MaterialRequirement } from "../../project/types";
import type { ClassificationNode } from "../../classification/types";
import { generateIDS, exportIDSFile, exportIDSZip, getObjectsWithRequirementsForPhase } from "../../export/ids";

interface Props {
  project: Project;
  classification: { nodes: ClassificationNode[] } | null;
  isOpen: boolean;
  onClose: () => void;
}

type ExportMode = "by-phase" | "by-objects";
type OccurrenceFilter = "all" | "required" | "prohibited" | "optional";
type ViewMode = "human" | "ids";

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
 * Get occurrence label in Czech
 */
const getOccurrenceLabel = (occurrence?: "required" | "prohibited" | "optional"): string => {
  switch (occurrence) {
    case "prohibited":
      return "Zakázané";
    case "optional":
      return "Možné";
    default:
      return "Požadované";
  }
};

/**
 * Get occurrence badge color
 */
const getOccurrenceBadgeClass = (occurrence?: "required" | "prohibited" | "optional"): string => {
  switch (occurrence) {
    case "prohibited":
      return "bg-red-100 text-red-700";
    case "optional":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-green-100 text-green-700";
  }
};

/**
 * Format property requirement for human readable view
 */
const formatPropertyHuman = (prop: PropertyRequirement): string => {
  let text = `${prop.psetName}.${prop.propertyName}`;
  if (prop.dataType) {
    text += ` (${prop.dataType})`;
  }
  if (prop.value) {
    text += ` = "${prop.value}"`;
  }
  return text;
};

/**
 * Format property requirement for IDS schema view
 */
const formatPropertyIDS = (prop: PropertyRequirement): string => {
  const parts: string[] = [];
  parts.push(`<ids:property cardinality="${prop.occurrence || "required"}"${prop.dataType ? ` dataType="${prop.dataType.toUpperCase()}"` : ""}>`);
  parts.push(`  <ids:propertySet><ids:simpleValue>${prop.psetName}</ids:simpleValue></ids:propertySet>`);
  parts.push(`  <ids:baseName><ids:simpleValue>${prop.propertyName}</ids:simpleValue></ids:baseName>`);
  if (prop.value) {
    parts.push(`  <ids:value><ids:simpleValue>${prop.value}</ids:simpleValue></ids:value>`);
  }
  parts.push(`</ids:property>`);
  return parts.join("\n");
};

/**
 * Format attribute requirement for human readable view
 */
const formatAttributeHuman = (attr: AttributeRequirement): string => {
  let text = attr.attribute;
  if (attr.value) {
    text += ` = "${attr.value}"`;
  }
  return text;
};

/**
 * Format attribute requirement for IDS schema view
 */
const formatAttributeIDS = (attr: AttributeRequirement): string => {
  const parts: string[] = [];
  parts.push(`<ids:attribute cardinality="${attr.occurrence || "required"}">`);
  parts.push(`  <ids:name><ids:simpleValue>${attr.attribute}</ids:simpleValue></ids:name>`);
  if (attr.value) {
    parts.push(`  <ids:value><ids:simpleValue>${attr.value}</ids:simpleValue></ids:value>`);
  }
  parts.push(`</ids:attribute>`);
  return parts.join("\n");
};

/**
 * Format classification requirement for human readable view
 */
const formatClassificationHuman = (cls: ClassificationRequirement): string => {
  let text = `${cls.system}: ${cls.value || cls.identification || cls.name}`;
  return text;
};

/**
 * Format classification requirement for IDS schema view
 */
const formatClassificationIDS = (cls: ClassificationRequirement): string => {
  const parts: string[] = [];
  parts.push(`<ids:classification cardinality="required">`);
  if (cls.value || cls.identification) {
    parts.push(`  <ids:value><ids:simpleValue>${cls.value || cls.identification}</ids:simpleValue></ids:value>`);
  }
  parts.push(`  <ids:system><ids:simpleValue>${cls.system}</ids:simpleValue></ids:system>`);
  parts.push(`</ids:classification>`);
  return parts.join("\n");
};

/**
 * Format material requirement for human readable view
 */
const formatMaterialHuman = (mat: MaterialRequirement): string => {
  let text = "Materiál";
  if (mat.category) {
    text += ` (${mat.category})`;
  }
  if (mat.value) {
    text += ` = "${mat.value}"`;
  }
  return text;
};

/**
 * Format material requirement for IDS schema view
 */
const formatMaterialIDS = (mat: MaterialRequirement): string => {
  const parts: string[] = [];
  parts.push(`<ids:material cardinality="${mat.occurrence || "required"}">`);
  if (mat.value) {
    parts.push(`  <ids:value><ids:simpleValue>${mat.value}</ids:simpleValue></ids:value>`);
  }
  parts.push(`</ids:material>`);
  return parts.join("\n");
};

/**
 * Check if requirement applies to phase
 */
const requirementAppliesToPhase = (req: { phases?: string[] }, phaseId: string): boolean => {
  // If no phases specified, requirement does NOT apply to any specific phase
  if (!req.phases || req.phases.length === 0) return false;
  return req.phases.includes(phaseId);
};

/**
 * Check if property is valid (has proper pset name and property name, not temporary)
 */
const isValidProperty = (prop: PropertyRequirement): boolean => {
  // Filter out properties with temporary pset names or empty names
  if (!prop.psetName || prop.psetName.startsWith("_NEW_")) return false;
  if (!prop.propertyName || prop.propertyName.trim() === "") return false;
  return true;
};

/**
 * Filter requirements by occurrence
 */
const filterByOccurrence = <T extends { occurrence?: "required" | "prohibited" | "optional" }>(
  items: T[],
  filter: OccurrenceFilter
): T[] => {
  if (filter === "all") return items;
  return items.filter((item) => {
    const occurrence = item.occurrence || "required";
    return occurrence === filter;
  });
};

/**
 * Preview component for requirements
 */
const RequirementsPreview: React.FC<{
  object: ProjectObject;
  phaseId: string;
  occurrenceFilter: OccurrenceFilter;
  viewMode: ViewMode;
}> = ({ object, phaseId, occurrenceFilter, viewMode }) => {
  // Filter requirements by phase and occurrence, and filter out invalid/incomplete requirements
  const attributes = filterByOccurrence(
    object.requirements.attributes.filter((r) => requirementAppliesToPhase(r, phaseId) && r.attribute),
    occurrenceFilter
  );
  const properties = filterByOccurrence(
    object.requirements.properties.filter((r) => requirementAppliesToPhase(r, phaseId) && isValidProperty(r)),
    occurrenceFilter
  );
  const classifications = object.requirements.classifications.filter(
    (r) => requirementAppliesToPhase(r, phaseId) && !r.isApplicability && !r.readOnly
  );
  const materials = filterByOccurrence(
    object.requirements.materials.filter((r) => requirementAppliesToPhase(r, phaseId)),
    occurrenceFilter
  );

  const hasAny = attributes.length > 0 || properties.length > 0 || classifications.length > 0 || materials.length > 0;

  if (!hasAny) {
    return (
      <div className="text-xs text-slate-400 italic">
        Žádné požadavky pro tento filtr
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {attributes.length > 0 && (
        <div>
          <div className="text-xs font-medium text-slate-600 mb-1">Atributy ({attributes.length})</div>
          {attributes.map((attr) => (
            <div key={attr.id} className="flex items-start gap-2 mb-1">
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${getOccurrenceBadgeClass(attr.occurrence)}`}>
                {getOccurrenceLabel(attr.occurrence)}
              </span>
              {viewMode === "human" ? (
                <span className="text-xs text-slate-700">{formatAttributeHuman(attr)}</span>
              ) : (
                <pre className="text-[10px] text-slate-600 bg-slate-100 rounded px-2 py-1 overflow-x-auto">
                  {formatAttributeIDS(attr)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {properties.length > 0 && (
        <div>
          <div className="text-xs font-medium text-slate-600 mb-1">Vlastnosti ({properties.length})</div>
          {properties.map((prop) => (
            <div key={prop.id} className="flex items-start gap-2 mb-1">
              <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${getOccurrenceBadgeClass(prop.occurrence)}`}>
                {getOccurrenceLabel(prop.occurrence)}
              </span>
              {viewMode === "human" ? (
                <span className="text-xs text-slate-700">{formatPropertyHuman(prop)}</span>
              ) : (
                <pre className="text-[10px] text-slate-600 bg-slate-100 rounded px-2 py-1 overflow-x-auto flex-1">
                  {formatPropertyIDS(prop)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {classifications.length > 0 && (
        <div>
          <div className="text-xs font-medium text-slate-600 mb-1">Klasifikace ({classifications.length})</div>
          {classifications.map((cls) => (
            <div key={cls.id} className="flex items-start gap-2 mb-1">
              <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 bg-blue-100 text-blue-700`}>
                Klasifikace
              </span>
              {viewMode === "human" ? (
                <span className="text-xs text-slate-700">{formatClassificationHuman(cls)}</span>
              ) : (
                <pre className="text-[10px] text-slate-600 bg-slate-100 rounded px-2 py-1 overflow-x-auto flex-1">
                  {formatClassificationIDS(cls)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {materials.length > 0 && (
        <div>
          <div className="text-xs font-medium text-slate-600 mb-1">Materiály ({materials.length})</div>
          {materials.map((mat) => (
            <div key={mat.id} className="flex items-start gap-2 mb-1">
              <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${getOccurrenceBadgeClass(mat.occurrence)}`}>
                {getOccurrenceLabel(mat.occurrence)}
              </span>
              {viewMode === "human" ? (
                <span className="text-xs text-slate-700">{formatMaterialHuman(mat)}</span>
              ) : (
                <pre className="text-[10px] text-slate-600 bg-slate-100 rounded px-2 py-1 overflow-x-auto flex-1">
                  {formatMaterialIDS(mat)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
  const [occurrenceFilter, setOccurrenceFilter] = useState<OccurrenceFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("human");
  const [selectedObjects, setSelectedObjects] = useState<Set<string>>(new Set());
  const [objectPhases, setObjectPhases] = useState<Map<string, Set<string>>>(new Map());
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string>("");
  const [search, setSearch] = useState("");
  const [expandedObjects, setExpandedObjects] = useState<Set<string>>(new Set());

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

  const toggleObjectExpand = (code: string) => {
    setExpandedObjects((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
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
        className="flex h-[85vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl"
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
              {/* Phase selector and filters row */}
              <div className="flex items-end gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Fáze
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

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Výskyt
                  </label>
                  <select
                    value={occurrenceFilter}
                    onChange={(e) => setOccurrenceFilter(e.target.value as OccurrenceFilter)}
                    className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="all">Vše</option>
                    <option value="required">Požadované</option>
                    <option value="prohibited">Zakázané</option>
                    <option value="optional">Možné</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Zobrazení
                  </label>
                  <div className="flex rounded border border-slate-300 overflow-hidden">
                    <button
                      className={`px-3 py-2 text-sm ${
                        viewMode === "human"
                          ? "bg-indigo-600 text-white"
                          : "bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                      onClick={() => setViewMode("human")}
                    >
                      Lidská řeč
                    </button>
                    <button
                      className={`px-3 py-2 text-sm border-l border-slate-300 ${
                        viewMode === "ids"
                          ? "bg-indigo-600 text-white"
                          : "bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                      onClick={() => setViewMode("ids")}
                    >
                      IDS schéma
                    </button>
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-500 bg-slate-100 rounded px-3 py-2">
                Filtry jsou pouze pro náhled. Export vždy obsahuje všechny požadavky ve formátu IDS schéma.
              </div>

              {/* Objects preview with requirements */}
              {selectedPhaseId && (
                <div className="flex-1 overflow-hidden">
                  <div className="mb-2 text-sm font-medium text-slate-700">
                    Objekty s požadavky ({objectsForPhase.length})
                  </div>
                  <div className="h-full overflow-auto rounded border border-slate-200 bg-slate-50">
                    {objectsForPhase.length === 0 ? (
                      <div className="p-3 text-sm text-slate-500">
                        Žádné objekty nemají požadavky pro tuto fázi
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200">
                        {objectsForPhase.map((obj) => (
                          <div key={obj.code} className="bg-white">
                            <button
                              className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-50 text-left"
                              onClick={() => toggleObjectExpand(obj.code)}
                            >
                              <div>
                                <span className="font-medium text-sm text-slate-800">{obj.code}</span>
                                <span className="text-sm text-slate-500 ml-2">{obj.description}</span>
                                {obj.ifcEntity && (
                                  <span className="ml-2 text-[10px] uppercase bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                                    {obj.ifcEntity}
                                  </span>
                                )}
                              </div>
                              <span className="text-slate-400 text-xs">
                                {expandedObjects.has(obj.code) ? "▼" : "▶"}
                              </span>
                            </button>
                            {expandedObjects.has(obj.code) && (
                              <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
                                <RequirementsPreview
                                  object={obj}
                                  phaseId={selectedPhaseId}
                                  occurrenceFilter={occurrenceFilter}
                                  viewMode={viewMode}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
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
