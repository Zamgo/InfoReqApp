import React, { useEffect, useMemo, useState } from "react";
import type { Project, ProjectObject, PropertyRequirement, AttributeRequirement, ClassificationRequirement, MaterialRequirement, IdsMetadata } from "../../project/types";
import { generateHumanReadable } from "../../utils/humanReadableIds";
import type { ClassificationNode } from "../../classification/types";
import { generateIDS, exportIDSFile, getObjectsWithRequirementsForPhase } from "../../export/ids";

interface Props {
  project: Project;
  classification: { nodes: ClassificationNode[] } | null;
  isOpen: boolean;
  onClose: () => void;
  /** Callback to save metadata to project (persists idsMetadata) */
  onUpdateProject?: (updates: Partial<Project>) => void;
}

type OccurrenceFilter = "all" | "required" | "prohibited" | "optional";
type ViewMode = "human" | "ids";

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
 * Map data type to valid IDS dataType (for preview)
 * Returns undefined if dataType should be omitted
 */
const mapDataTypeForPreview = (dataType?: string): string | undefined => {
  if (!dataType) return undefined;
  const dtLower = dataType.toLowerCase();
  // Omit IFC Quantity types - not valid IDS dataTypes
  if (dtLower.startsWith("ifcquantity") || dtLower.startsWith("ifcproperty")) {
    return undefined;
  }
  // Handle PEnum
  if (dtLower.startsWith("penum")) {
    return "IFCLABEL";
  }
  return dataType.toUpperCase();
};

/**
 * Format property requirement for IDS schema view
 */
const formatPropertyIDS = (prop: PropertyRequirement): string => {
  const parts: string[] = [];
  const mappedDataType = mapDataTypeForPreview(prop.dataType);
  parts.push(`<ids:property cardinality="${prop.occurrence || "required"}"${mappedDataType ? ` dataType="${mappedDataType}"` : ""}>`);
  parts.push(`  <ids:propertySet><ids:simpleValue>${prop.psetName}</ids:simpleValue></ids:propertySet>`);
  parts.push(`  <ids:baseName><ids:simpleValue>${prop.propertyName}</ids:simpleValue></ids:baseName>`);
  if (prop.value) {
    parts.push(`  <ids:value><ids:simpleValue>${prop.value}</ids:simpleValue></ids:value>`);
  }
  parts.push(`</ids:property>`);
  return parts.join("\n");
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
 * Preview component for requirements – lidská řeč = stejný formát jako IDS náhled
 */
const RequirementsPreview: React.FC<{
  object: ProjectObject;
  phaseId: string;
  occurrenceFilter: OccurrenceFilter;
  viewMode: ViewMode;
  classificationSystemEntries: import("../../project/types").ClassificationSystemEntry[];
  phases: import("../../project/types").Phase[];
}> = ({ object, phaseId, occurrenceFilter, viewMode, classificationSystemEntries, phases }) => {
  if (viewMode === "human") {
    const { applicability, requirements } = generateHumanReadable(object, phases, classificationSystemEntries, phaseId, occurrenceFilter);
    const hasContent = applicability.length > 0 || requirements.length > 0;
    if (!hasContent) {
      return (
        <div className="text-slate-500 italic text-sm">
          Žádné požadavky pro tento filtr
        </div>
      );
    }
    return (
      <div className="text-sm text-slate-700 space-y-4">
        {applicability.length > 0 && (
          <div>
            <div className="font-semibold text-slate-800 mb-2">
              Model <span className="text-indigo-600">MUSÍ</span> obsahovat entity, které mají:
            </div>
            <ul className="list-disc pl-5 space-y-1">
              {applicability.map((item, idx) => (
                <li key={idx} dangerouslySetInnerHTML={{ __html: item.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-slate-900">$1</strong>') }} />
              ))}
            </ul>
          </div>
        )}
        {requirements.length > 0 && (
          <div>
            <div className="font-semibold text-slate-800 mb-2">
              A splňovat následující požadavky:
            </div>
            <ul className="list-disc pl-5 space-y-1">
              {requirements.map((item, idx) => (
                <li
                  key={idx}
                  dangerouslySetInnerHTML={{
                    __html: item
                      .replace(/\*\*MUSÍ\*\*/g, '<strong class="text-indigo-600">MUSÍ</strong>')
                      .replace(/\*\*NESMÍ\*\*/g, '<strong class="text-red-600">NESMÍ</strong>')
                      .replace(/\*\*MŮŽE\*\*/g, '<strong class="text-amber-600">MŮŽE</strong>')
                      .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-slate-900">$1</strong>')
                      .replace(/\*([^*]+)\*/g, '<em class="text-slate-500">$1</em>'),
                  }}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

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
              <pre className="text-[10px] text-slate-600 bg-slate-100 rounded px-2 py-1 overflow-x-auto">
                {formatAttributeIDS(attr)}
              </pre>
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
              <pre className="text-[10px] text-slate-600 bg-slate-100 rounded px-2 py-1 overflow-x-auto flex-1">
                {formatPropertyIDS(prop)}
              </pre>
            </div>
          ))}
        </div>
      )}
      {classifications.length > 0 && (
        <div>
          <div className="text-xs font-medium text-slate-600 mb-1">Klasifikace ({classifications.length})</div>
          {classifications.map((cls) => (
            <div key={cls.id} className="flex items-start gap-2 mb-1">
              <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 bg-blue-100 text-blue-700">
                Klasifikace
              </span>
              <pre className="text-[10px] text-slate-600 bg-slate-100 rounded px-2 py-1 overflow-x-auto flex-1">
                {formatClassificationIDS(cls)}
              </pre>
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
              <pre className="text-[10px] text-slate-600 bg-slate-100 rounded px-2 py-1 overflow-x-auto flex-1">
                {formatMaterialIDS(mat)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const IDSExportDialog: React.FC<Props> = ({
  project,
  isOpen,
  onClose,
  onUpdateProject,
}) => {
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>("");
  const [occurrenceFilter, setOccurrenceFilter] = useState<OccurrenceFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("human");
  const [selectedObjects, setSelectedObjects] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string>("");
  const [search, setSearch] = useState("");
  const [expandedObjects, setExpandedObjects] = useState<Set<string>>(new Set());
  const [metadataExpanded, setMetadataExpanded] = useState(false);
  const [idsMetadata, setIdsMetadata] = useState<Partial<IdsMetadata>>({});

  const isAuthorValid = (v: string) => (v.trim().length > 0 && /@[^@]*\.[^@]+/.test(v.trim()));
  const effectiveAuthor = idsMetadata.author ?? project.author ?? "";

  // Initialize with first phase
  useEffect(() => {
    if (isOpen && project.phases.length > 0 && !selectedPhaseId) {
      setSelectedPhaseId(project.phases[0].id);
    }
  }, [isOpen, project.phases, selectedPhaseId]);

  // Reset state when dialog opens, sync metadata from project (auto-fill like single export)
  useEffect(() => {
    if (isOpen) {
      setError("");
      setIsExporting(false);
      const base = { ...project.idsMetadata };
      if (project.name && base.title === undefined) base.title = project.name;
      if (project.author && base.author === undefined) base.author = project.author;
      if (project.description && base.description === undefined) base.description = project.description;
      const phase = selectedPhaseId ? project.phases.find((p) => p.id === selectedPhaseId) : project.phases[0];
      if (phase?.code && base.milestone === undefined) base.milestone = phase.code;
      setIdsMetadata(base);
    }
  }, [isOpen, project.idsMetadata, project.name, project.author, project.description, project.phases, selectedPhaseId]);

  // Get objects with requirements for selected phase
  const objectsForPhase = useMemo(() => {
    if (!selectedPhaseId) return [];
    return getObjectsWithRequirementsForPhase(project, selectedPhaseId);
  }, [project, selectedPhaseId]);

  // Filter objects by search (code or description)
  const filteredObjects = useMemo(() => {
    if (!search.trim()) return objectsForPhase;
    const q = search.toLowerCase();
    return objectsForPhase.filter(
      (obj) =>
        obj.code.toLowerCase().includes(q) ||
        (obj.description || "").toLowerCase().includes(q)
    );
  }, [objectsForPhase, search]);

  // Auto-select all objects when phase changes
  useEffect(() => {
    if (isOpen && selectedPhaseId) {
      const objs = getObjectsWithRequirementsForPhase(project, selectedPhaseId);
      setSelectedObjects(new Set(objs.map((o) => o.code)));
    }
  }, [isOpen, selectedPhaseId, project]);

  const handleToggleObject = (code: string) => {
    setSelectedObjects((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedObjects(new Set(filteredObjects.map((o) => o.code)));
  };

  const handleDeselectAll = () => {
    setSelectedObjects(new Set());
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

  const sanitize = (s: string) => (s || "").replace(/[^\p{L}\p{N}_\-]/gu, "_").replace(/_+/g, "_") || "export";
  const occurrenceLabel = occurrenceFilter === "all" ? "Vše" : occurrenceFilter === "required" ? "Požadované" : occurrenceFilter === "prohibited" ? "Zakázané" : "Možné";

  const handleExport = async () => {
    if (!selectedPhaseId || selectedObjects.size === 0) {
      setError("Vyberte fázi a alespoň jeden objekt");
      return;
    }
    setIsExporting(true);
    setError("");

    try {
      const mergedMetadata: Partial<IdsMetadata> = {
        ...idsMetadata,
        milestone: idsMetadata.milestone ?? project.phases.find((p) => p.id === selectedPhaseId)?.code,
      };
      if (onUpdateProject) {
        onUpdateProject({ idsMetadata: mergedMetadata as IdsMetadata });
      }
      const ids = generateIDS({
        project,
        phaseId: selectedPhaseId,
        objectCodes: Array.from(selectedObjects),
        occurrenceFilter,
        idsMetadata: mergedMetadata,
      });

      const phase = project.phases.find((p) => p.id === selectedPhaseId);
      const filename = [
        sanitize(project.name || "Projekt"),
        sanitize(phase?.code ?? selectedPhaseId),
        occurrenceLabel,
      ].filter(Boolean).join("_") + ".ids";

      exportIDSFile(ids, filename);
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
            Vyberte fázi, výskyt a objekty. Metadata se doplní z údajů projektu.
          </p>
        </div>

        {/* Metadata souboru IDS – auto-filled from project */}
        <div className="flex-shrink-0 border-b border-slate-200 px-6 py-2">
          <button
            className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-indigo-600"
            onClick={() => setMetadataExpanded((v) => !v)}
          >
            <span className={metadataExpanded ? "rotate-90" : ""}>▶</span>
            Metadata souboru IDS
          </button>
          {metadataExpanded && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-0.5">Název (title)</label>
                <input
                  type="text"
                  value={idsMetadata.title ?? ""}
                  onChange={(e) => setIdsMetadata((m) => ({ ...m, title: e.target.value || undefined }))}
                  placeholder={project.name}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-0.5">Copyright</label>
                <input
                  type="text"
                  value={idsMetadata.copyright ?? ""}
                  onChange={(e) => setIdsMetadata((m) => ({ ...m, copyright: e.target.value || undefined }))}
                  placeholder="Vlastník autorských práv"
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-0.5">Verze (version)</label>
                <input
                  type="text"
                  value={idsMetadata.version ?? ""}
                  onChange={(e) => setIdsMetadata((m) => ({ ...m, version: e.target.value || undefined }))}
                  placeholder="1.0"
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-0.5">Autor (author, e-mail) <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  value={idsMetadata.author ?? project.author ?? ""}
                  onChange={(e) => setIdsMetadata((m) => ({ ...m, author: e.target.value || undefined }))}
                  placeholder="email@example.com"
                  className={`w-full rounded border px-2 py-1 text-sm ${effectiveAuthor && !isAuthorValid(effectiveAuthor) ? "border-red-400" : "border-slate-300"}`}
                />
                {effectiveAuthor && !isAuthorValid(effectiveAuthor) && (
                  <p className="text-[10px] text-red-600 mt-0.5">Autor musí být e-mail (např. jmeno@domena.cz)</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-0.5">Datum (date)</label>
                <input
                  type="date"
                  value={idsMetadata.date ?? new Date().toISOString().split("T")[0]}
                  onChange={(e) => setIdsMetadata((m) => ({ ...m, date: e.target.value || undefined }))}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-0.5">Účel (purpose)</label>
                <input
                  type="text"
                  value={idsMetadata.purpose ?? ""}
                  onChange={(e) => setIdsMetadata((m) => ({ ...m, purpose: e.target.value || undefined }))}
                  placeholder="quantity take off, clash detection, coordination..."
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-0.5">Popis (description)</label>
                <textarea
                  value={idsMetadata.description ?? project.description ?? ""}
                  onChange={(e) => setIdsMetadata((m) => ({ ...m, description: e.target.value || undefined }))}
                  placeholder="Pro koho je IDS určen, proč byl vytvořen, na jaké projekty se vztahuje"
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm min-h-[60px]"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-0.5">Milník (milestone)</label>
                <input
                  type="text"
                  value={idsMetadata.milestone ?? (project.phases.find((p) => p.id === selectedPhaseId) ?? project.phases[0])?.code ?? ""}
                  onChange={(e) => setIdsMetadata((m) => ({ ...m, milestone: e.target.value || undefined }))}
                  placeholder={(project.phases.find((p) => p.id === selectedPhaseId) ?? project.phases[0])?.code ?? "Schematic Design, Construction..."}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  title="Automaticky z vybrané fáze"
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Metadata jednotlivých specifikací (name, identifier, description, instructions) doplňte v kartě „IDS náhled“ → „Metadata specifikace“ u každého objektu.
              </p>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden px-6 py-4">
          <div className="flex h-full flex-col gap-4">
            {/* Phase, Occurrence, View mode */}
            <div className="flex items-end gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="mb-1 block text-sm font-medium text-slate-700">Fáze</label>
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
                <label className="mb-1 block text-sm font-medium text-slate-700">Výskyt</label>
                <div className="flex gap-2 flex-wrap">
                  {(["all", "required", "prohibited", "optional"] as const).map((occ) => (
                    <button
                      key={occ}
                      type="button"
                      className={`px-3 py-1.5 text-xs font-medium rounded ${
                        occurrenceFilter === occ
                          ? occ === "all"
                            ? "bg-slate-700 text-white"
                            : occ === "required"
                              ? "bg-green-600 text-white"
                              : occ === "prohibited"
                                ? "bg-red-600 text-white"
                                : "bg-amber-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                      onClick={() => setOccurrenceFilter(occ)}
                    >
                      {occ === "all" ? "Vše" : occ === "required" ? "Požadované" : occ === "prohibited" ? "Zakázané" : "Možné"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Zobrazení</label>
                <div className="flex rounded border border-slate-300 overflow-hidden">
                  <button
                    className={`px-3 py-2 text-sm ${viewMode === "human" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                    onClick={() => setViewMode("human")}
                  >
                    Lidská řeč
                  </button>
                  <button
                    className={`px-3 py-2 text-sm border-l border-slate-300 ${viewMode === "ids" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                    onClick={() => setViewMode("ids")}
                  >
                    IDS schéma
                  </button>
                </div>
              </div>
            </div>

            {/* Object selection with search */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Filtrovat dle názvu..."
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
              <div className="text-xs text-slate-500 mb-2">
                Vybráno: {selectedObjects.size} z {filteredObjects.length} objektů
              </div>
            </div>

            {/* Objects list with checkboxes and preview */}
            {selectedPhaseId && (
              <div className="flex-1 overflow-hidden">
                <div className="h-full overflow-auto rounded border border-slate-200 bg-slate-50">
                  {filteredObjects.length === 0 ? (
                    <div className="p-3 text-sm text-slate-500">
                      {objectsForPhase.length === 0
                        ? "Žádné objekty nemají požadavky pro tuto fázi"
                        : "Žádné výsledky pro zadaný filtr"}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {filteredObjects.map((obj) => (
                        <div key={obj.code} className="bg-white">
                          <div className="flex items-start gap-2 px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedObjects.has(obj.code)}
                              onChange={() => handleToggleObject(obj.code)}
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 mt-1"
                            />
                            <button
                              className="flex-1 flex items-center justify-between hover:bg-slate-50 text-left min-w-0"
                              onClick={() => toggleObjectExpand(obj.code)}
                            >
                              <div className="min-w-0">
                                <span className="font-medium text-sm text-slate-800">{(obj.code || "").replace(/::/g, ".")}</span>
                                {obj.description && (
                                  <span className="text-sm text-slate-500 ml-2 truncate">{obj.description}</span>
                                )}
                                {obj.ifcEntity && (
                                  <span className="ml-2 text-[10px] uppercase bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                                    {obj.ifcEntity}
                                  </span>
                                )}
                              </div>
                              <span className="text-slate-400 text-xs flex-shrink-0 ml-2">
                                {expandedObjects.has(obj.code) ? "▼" : "▶"}
                              </span>
                            </button>
                          </div>
                          {expandedObjects.has(obj.code) && (
                            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 pl-9">
                              <RequirementsPreview
                                object={obj}
                                phaseId={selectedPhaseId}
                                occurrenceFilter={occurrenceFilter}
                                viewMode={viewMode}
                                classificationSystemEntries={project.classificationSystemEntries ?? []}
                                phases={project.phases}
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
            onClick={handleExport}
            disabled={
              isExporting ||
              !isAuthorValid(effectiveAuthor) ||
              !selectedPhaseId ||
              selectedObjects.size === 0
            }
          >
            {isExporting ? "Exportuji..." : "Exportovat IDS"}
          </button>
        </div>
      </div>
    </div>
  );
};
