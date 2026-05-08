import React, { useMemo, useState, useCallback } from "react";
import type { Project } from "../../project/types";
import type { ClassificationNode } from "../../classification/types";
import { groupRequirementsByItem, type RequirementItemGroup, type RequirementItemKind } from "../../project/requirementFingerprint";
import { filterTree } from "../../classification/parser";
import { applyRequestFilter, applyRequestSort } from "../../project/requestFilterEngine";
import type { RequestFilter } from "../../project/requestFilterModel";
import type { RequestSort } from "../../project/requestFilterModel";
import { RequestFilterBar } from "./RequestFilterBar";
import {
  type HierarchyViewMode,
  getHierarchyViewOptions,
  getHierarchyNodesForView,
} from "../../classification/hierarchyView";

export const REQUIREMENT_EDITOR_SLOT_ID = "requirement-editor-portal-slot";

interface Props {
  project: Project;
  selectedFingerprint?: string;
  onSelectGroup: (fingerprint: string | undefined, kind: RequirementItemKind | undefined) => void;
  onAssignGroupToObjects?: (
    kind: RequirementItemKind,
    fingerprint: string,
    objectCodes: string[],
    representativeItems: RequirementItemGroup["representativeItems"],
  ) => void;
  onMoveGroupToKind?: (
    sourceKind: RequirementItemKind,
    fingerprint: string,
    targetKind: RequirementItemKind,
    representativeItems: RequirementItemGroup["representativeItems"],
  ) => void;
  children?: React.ReactNode;
}

const KIND_LABELS: Record<RequirementItemKind, string> = {
  pset: "Vlastnosti",
  attribute: "Atribut",
  classification: "Klasifikace",
  material: "Materiál",
  relation: "Součásti",
};

const KIND_COLORS: Record<RequirementItemKind, string> = {
  pset: "bg-blue-100 text-blue-700",
  attribute: "bg-amber-100 text-amber-700",
  classification: "bg-emerald-100 text-emerald-700",
  material: "bg-purple-100 text-purple-700",
  relation: "bg-rose-100 text-rose-700",
};

const boundObjectsText = (codes: string[], maxCodes = 5): string => {
  if (codes.length === 0) return "—";
  if (codes.length <= maxCodes) return codes.map((c) => c.replace(/::/g, ".")).join(", ");
  return codes.slice(0, maxCodes).map((c) => c.replace(/::/g, ".")).join(", ") + ` a další ${codes.length - maxCodes} objektů`;
};

/** Výchozí řazení: počet objektů sestupně, pak název. */
const DEFAULT_SORT: RequestSort = [
  { field: "objectCount", direction: "DESC" },
  { field: "label", direction: "ASC" },
];

/** Hierarchie s checkboxy – řízená výběrem (selectedCodes + onAssign). Pro použití v dialogu. */
const GroupObjectsHierarchy: React.FC<{
  project: Project;
  selectedCodes: string[];
  onAssign: (objectCodes: string[]) => void;
}> = ({ project, selectedCodes, onAssign }) => {
  const [viewMode, setViewMode] = useState<HierarchyViewMode>("classification");
  const [hierarchySearch, setHierarchySearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const classification = project.classification ?? null;
  const classificationSystemEntries = project.classificationSystemEntries ?? [];
  const objects = project.objects;
  const primarySystem = useMemo(
    () => classificationSystemEntries.find((s) => s.isPrimary),
    [classificationSystemEntries],
  );

  const hierarchyViewOptions = useMemo(
    () => getHierarchyViewOptions(classification, primarySystem, classificationSystemEntries, objects),
    [classification, primarySystem, classificationSystemEntries, objects],
  );

  const nodes = useMemo(
    () =>
      getHierarchyNodesForView(viewMode, classification, primarySystem, classificationSystemEntries, objects),
    [viewMode, classification, primarySystem, classificationSystemEntries, objects],
  );

  const filteredNodes = useMemo(
    () => (hierarchySearch.trim() ? filterTree(nodes, hierarchySearch.trim()) : nodes),
    [nodes, hierarchySearch],
  );

  const selectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes]);

  const toggleCode = useCallback(
    (code: string) => {
      const next = new Set(selectedCodes);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      onAssign(Array.from(next).sort((a, b) => a.localeCompare(b)));
    },
    [selectedCodes, onAssign],
  );

  const selectAll = useCallback(() => {
    onAssign(Object.keys(objects).sort((a, b) => a.localeCompare(b)));
  }, [objects, onAssign]);

  const deselectAll = useCallback(() => {
    onAssign([]);
  }, [onAssign]);

  const toggleExpanded = (key: string) => {
    setExpanded((e) => ({ ...e, [key]: !e[key] }));
  };

  const renderNode = (node: ClassificationNode, depth: number, pathKey: string): React.ReactNode => {
    const isLeaf = node.children.length === 0;
    const canSelect = isLeaf && !!objects[node.code];
    const nodeId = `obj-${pathKey}`;
    const isExp = expanded[nodeId] ?? true;

    return (
      <div key={pathKey} className="border-l border-slate-200 pl-2" style={{ marginLeft: depth * 8 }}>
        <div className="flex items-center gap-2 py-0.5">
          {!isLeaf ? (
            <button
              type="button"
              className="h-5 w-5 shrink-0 rounded text-xs text-slate-500 hover:bg-slate-200"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleExpanded(nodeId);
              }}
              aria-label={isExp ? "Sbalit" : "Rozbalit"}
            >
              {isExp ? "−" : "+"}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          {canSelect ? (
            <label
              htmlFor={`cb-${pathKey}`}
              className="flex flex-1 cursor-pointer items-center gap-2 rounded px-2 py-0.5 hover:bg-slate-50 text-xs"
            >
              <input
                id={`cb-${pathKey}`}
                type="checkbox"
                className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-red-600 focus:ring-red-500"
                checked={selectedSet.has(node.code)}
                onChange={(e) => {
                  e.stopPropagation();
                  toggleCode(node.code);
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-slate-800 truncate">
                {objects[node.code]?.description ?? node.description ?? node.code}
              </span>
              <span className="text-[10px] text-slate-400 truncate max-w-[8rem]">{node.code}</span>
            </label>
          ) : (
            <div
              role="button"
              tabIndex={0}
              className="flex flex-1 cursor-pointer items-center rounded px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 truncate"
              onClick={(e) => {
                e.preventDefault();
                if (!isLeaf) toggleExpanded(nodeId);
              }}
              onKeyDown={(e) => {
                if (!isLeaf && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  toggleExpanded(nodeId);
                }
              }}
            >
              {(node.description || node.code).replace(/::/g, ".")}
            </div>
          )}
        </div>
        {!isLeaf && isExp && node.children.map((child, idx) => renderNode(child, depth + 1, `${pathKey}-${idx}-${child.code}`))}
      </div>
    );
  };

  const allObjectCodes = Object.keys(objects);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {hierarchyViewOptions.length > 1 && (
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-slate-600">Pohled:</label>
            <select
              className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-800"
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as HierarchyViewMode)}
            >
              {hierarchyViewOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <input
          type="text"
          className="flex-1 min-w-[100px] rounded border border-slate-300 px-2 py-1 text-[11px] placeholder:text-slate-400"
          placeholder="Filtrovat (kód, popis)..."
          value={hierarchySearch}
          onChange={(e) => setHierarchySearch(e.target.value)}
        />
        <button
          type="button"
          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
          onClick={selectAll}
        >
          Označit vše
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
          onClick={deselectAll}
        >
          Zrušit výběr
        </button>
      </div>
      <div className="max-h-[320px] overflow-y-auto rounded border border-slate-200 bg-slate-50/50 p-3">
        {filteredNodes.length === 0 ? (
          allObjectCodes.length === 0 ? (
            <div className="text-xs text-slate-500">V projektu nejsou žádné objekty.</div>
          ) : (
            <div className="space-y-1">
              <p className="mb-1.5 text-[11px] font-medium text-slate-500">Vyberte objekty (zaškrtnutím):</p>
              {allObjectCodes
                .filter(
                  (code) =>
                    !hierarchySearch.trim() ||
                    (objects[code]?.description ?? code).toLowerCase().includes(hierarchySearch.trim().toLowerCase()) ||
                    code.toLowerCase().includes(hierarchySearch.trim().toLowerCase()),
                )
                .map((code) => (
                  <label
                    key={code}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-white text-xs"
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-slate-300 text-red-600 focus:ring-red-500"
                      checked={selectedSet.has(code)}
                      onChange={() => toggleCode(code)}
                    />
                    <span className="text-slate-800">{objects[code]?.description ?? code}</span>
                    <span className="text-[10px] text-slate-400">{code}</span>
                  </label>
                ))}
            </div>
          )
        ) : (
          <div className="space-y-0.5">
            <p className="mb-1.5 text-[11px] font-medium text-slate-500">Hierarchie projektu — zaškrtněte objekty:</p>
            {filteredNodes.map((n, idx) => renderNode(n, 0, `r-${idx}-${n.code}`))}
          </div>
        )}
      </div>
    </div>
  );
};

/** Dialog pro přiřazení skupiny požadavků k objektům — potvrzení nebo zrušení */
const AssignGroupToObjectsDialog: React.FC<{
  group: RequirementItemGroup;
  project: Project;
  onConfirm: (objectCodes: string[]) => void;
  onClose: () => void;
}> = ({ group, project, onConfirm, onClose }) => {
  const [draftCodes, setDraftCodes] = useState<string[]>(() => [...group.objectCodes].sort((a, b) => a.localeCompare(b)));

  const handleConfirm = () => {
    onConfirm(draftCodes);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 p-4">
          <h3 className="text-lg font-semibold text-slate-800">Přiřadit skupinu k objektům</h3>
          <p className="mt-1 text-sm text-slate-600 truncate" title={group.label}>
            {group.label}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Zaškrtněte objekty, ke kterým má tato skupina požadavků patřit. Změnu potvrďte nebo zrušte.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <GroupObjectsHierarchy
            project={project}
            selectedCodes={draftCodes}
            onAssign={setDraftCodes}
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onClose}
          >
            Zrušit
          </button>
          <button
            type="button"
            className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500"
            onClick={handleConfirm}
          >
            Potvrdit ({draftCodes.length} objektů)
          </button>
        </div>
      </div>
    </div>
  );
};

const SORT_OPTIONS: { value: string; label: string; sort: RequestSort }[] = [
  { value: "objectCount-desc", label: "Počet objektů (sestupně)", sort: [{ field: "objectCount", direction: "DESC" }] },
  { value: "objectCount-asc", label: "Počet objektů (vzestupně)", sort: [{ field: "objectCount", direction: "ASC" }] },
  { value: "label-asc", label: "Název (A–Z)", sort: [{ field: "label", direction: "ASC" }] },
  { value: "label-desc", label: "Název (Z–A)", sort: [{ field: "label", direction: "DESC" }] },
  { value: "kind-asc", label: "Typ (A–Z)", sort: [{ field: "kind", direction: "ASC" }] },
];

export const RequirementGroupsPanel: React.FC<Props> = ({
  project,
  selectedFingerprint,
  onSelectGroup,
  onAssignGroupToObjects,
  onMoveGroupToKind,
  children,
}) => {
  const [filter, setFilter] = useState<RequestFilter>(null);
  const [kindFilter, setKindFilter] = useState<RequirementItemKind | "all">("all");
  const [searchText, setSearchText] = useState("");
  const [sort, setSort] = useState<RequestSort>(DEFAULT_SORT);
  const [sortOptionKey, setSortOptionKey] = useState("objectCount-desc");
  const [assignDialogGroup, setAssignDialogGroup] = useState<RequirementItemGroup | null>(null);
  const [moveMenuFingerprint, setMoveMenuFingerprint] = useState<string | null>(null);

  const groups = useMemo(() => groupRequirementsByItem(project), [project]);

  const filteredGroups = useMemo(
    () => applyRequestFilter(groups, filter),
    [groups, filter],
  );

  const sortedGroups = useMemo(
    () => applyRequestSort(filteredGroups, sort),
    [filteredGroups, sort],
  );

  const totalObjects = Object.keys(project.objects).length;

  const handleFilterChange = useCallback((newFilter: RequestFilter) => {
    setFilter(newFilter);
  }, []);

  const handleAssignGroupToObjects = useCallback(
    (group: RequirementItemGroup, objectCodes: string[]) => {
      onAssignGroupToObjects?.(group.kind, group.fingerprint, objectCodes, group.representativeItems);
    },
    [onAssignGroupToObjects],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 w-full overflow-hidden">
      {/* Header: title + filter bar + sort */}
      <div className="flex flex-col flex-shrink-0 min-w-0 px-4 py-2 bg-slate-50 border-b border-slate-200 gap-2">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="text-xs font-semibold text-slate-700 truncate">Skupiny požadavků</span>
          <span className="text-[11px] text-slate-400 truncate hidden sm:inline">
            {totalObjects} objektů
          </span>
        </div>
        <RequestFilterBar
          filter={filter}
          onFilterChange={handleFilterChange}
          kindFilter={kindFilter}
          onKindFilterChange={setKindFilter}
          searchText={searchText}
          onSearchTextChange={setSearchText}
          filteredCount={filteredGroups.length}
          totalCount={groups.length}
        />
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-slate-600">Řazení:</label>
          <select
            className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-800"
            value={sortOptionKey}
            onChange={(e) => {
              const opt = SORT_OPTIONS.find((o) => o.value === e.target.value);
              if (opt) {
                setSortOptionKey(opt.value);
                setSort(opt.sort);
              }
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 min-h-0 overflow-auto flex flex-col bg-white">
        {sortedGroups.length === 0 ? (
          <div className="px-3 py-2 text-xs text-slate-500">
            Žádná skupina neodpovídá aktuálnímu filtru. Změňte nebo zrušte filtry v panelu výše.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 text-xs">
            {sortedGroups.map((group) => {
              const isSelected = group.fingerprint === selectedFingerprint;
              const bound = boundObjectsText(group.objectCodes);
              const count = group.objectCodes.length;

              return (
                <li key={group.fingerprint} className={isSelected ? "bg-red-50/50" : ""}>
                  <div className={`flex w-full items-center gap-1 px-3 py-2 text-left hover:bg-slate-50 ${isSelected ? "bg-red-50" : ""}`}>
                    <button
                      type="button"
                      className="flex flex-1 min-w-0 items-center gap-2"
                      onClick={() => onSelectGroup(isSelected ? undefined : group.fingerprint, isSelected ? undefined : group.kind)}
                      title={`${group.label} / Přiřazeno k: ${bound}`}
                    >
                      <span className="flex-shrink-0 text-slate-400" aria-hidden>
                        <svg className={`w-4 h-4 transition-transform ${isSelected ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </span>
                      <div className="relative">
                        <button
                          type="button"
                          className={`inline-flex flex-shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${KIND_COLORS[group.kind]} ${onMoveGroupToKind ? "cursor-pointer hover:brightness-95" : "cursor-default"}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!onMoveGroupToKind) return;
                            setMoveMenuFingerprint((prev) => (prev === group.fingerprint ? null : group.fingerprint));
                          }}
                          title={onMoveGroupToKind ? "Přesunout skupinu do jiné facety" : undefined}
                        >
                          {KIND_LABELS[group.kind]}
                        </button>
                        {onMoveGroupToKind && moveMenuFingerprint === group.fingerprint && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setMoveMenuFingerprint(null);
                              }}
                              aria-hidden
                            />
                            <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded border border-slate-200 bg-white p-1 shadow-lg">
                              <div className="px-2 py-1 text-[10px] font-semibold uppercase text-slate-500">Přesunout do</div>
                              {(Object.keys(KIND_LABELS) as RequirementItemKind[])
                                .filter((targetKind) => targetKind !== group.kind)
                                .map((targetKind) => (
                                  <button
                                    key={targetKind}
                                    type="button"
                                    className="block w-full rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-100"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      onMoveGroupToKind(group.kind, group.fingerprint, targetKind, group.representativeItems);
                                      setMoveMenuFingerprint(null);
                                    }}
                                  >
                                    {KIND_LABELS[targetKind]}
                                  </button>
                                ))}
                            </div>
                          </>
                        )}
                      </div>
                      <span className="inline-flex flex-shrink-0 items-center justify-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                        {count}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-left font-medium text-slate-800">
                        {group.label}
                      </span>
                      <span className="flex-shrink-0 max-w-[30%] truncate text-left text-[10px] text-slate-400">
                        {bound}
                      </span>
                    </button>
                    {onAssignGroupToObjects && (
                      <button
                        type="button"
                        className="flex-shrink-0 rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAssignDialogGroup(group);
                        }}
                        title="Přiřadit skupinu k objektům"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {isSelected && children && (
                    <div className="border-t border-slate-200 bg-white">
                      {children}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {assignDialogGroup && onAssignGroupToObjects && (
        <AssignGroupToObjectsDialog
          group={assignDialogGroup}
          project={project}
          onConfirm={(objectCodes) => handleAssignGroupToObjects(assignDialogGroup, objectCodes)}
          onClose={() => setAssignDialogGroup(null)}
        />
      )}
    </div>
  );
};
