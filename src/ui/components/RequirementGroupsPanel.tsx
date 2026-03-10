import React, { useMemo, useState } from "react";
import type { Project } from "../../project/types";
import { groupRequirementsByItem, type RequirementItemGroup, type RequirementItemKind } from "../../project/requirementFingerprint";

export const REQUIREMENT_EDITOR_SLOT_ID = "requirement-editor-portal-slot";

interface Props {
  project: Project;
  selectedFingerprint?: string;
  onSelectGroup: (fingerprint: string | undefined, kind: RequirementItemKind | undefined) => void;
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

const matchesSearch = (group: RequirementItemGroup, query: string): boolean => {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();

  const fields: string[] = [group.label, ...group.objectCodes];

  const items = group.representativeItems;
  if (group.kind === "pset") {
    for (const p of items as import("../../project/types").PropertyRequirement[]) {
      fields.push(p.psetName ?? "", p.propertyName ?? "", p.value ?? "", p.unit ?? "", p.popis ?? "", p.note ?? "");
    }
  } else if (group.kind === "attribute") {
    const a = (items as [import("../../project/types").AttributeRequirement])[0];
    fields.push(a.attribute ?? "", a.value ?? "", a.popis ?? "", a.note ?? "");
  } else if (group.kind === "classification") {
    const c = (items as [import("../../project/types").ClassificationRequirement])[0];
    fields.push(c.system ?? "", c.name ?? "", c.identification ?? "", c.value ?? "");
  } else if (group.kind === "material") {
    const m = (items as [import("../../project/types").MaterialRequirement])[0];
    fields.push(m.value ?? "", m.category ?? "", m.note ?? "");
  } else if (group.kind === "relation") {
    const r = (items as [import("../../project/types").RelationRequirement])[0];
    fields.push(r.relationType ?? "", r.entityType ?? "", r.entityPredefinedType ?? "", r.note ?? "");
  }

  return fields.some((f) => f && f.toLowerCase().includes(q));
};

export const RequirementGroupsPanel: React.FC<Props> = ({ project, selectedFingerprint, onSelectGroup, children }) => {
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<RequirementItemKind | "all">("all");

  const groups = useMemo(() => groupRequirementsByItem(project), [project]);

  const filteredGroups = useMemo(
    () =>
      groups
        .filter((g) => kindFilter === "all" || g.kind === kindFilter)
        .filter((g) => matchesSearch(g, search)),
    [groups, kindFilter, search],
  );

  const totalObjects = Object.keys(project.objects).length;

  const kindCounts = useMemo(() => {
    const counts: Record<string, number> = { all: groups.length };
    for (const g of groups) {
      counts[g.kind] = (counts[g.kind] ?? 0) + 1;
    }
    return counts;
  }, [groups]);

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 w-full overflow-hidden">
      {/* Header: title + search + filter tabs */}
      <div className="flex items-center gap-3 flex-shrink-0 min-w-0 px-4 py-2 bg-slate-50 border-b border-slate-200">
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-slate-700 truncate">Skupiny požadavků</span>
            <span className="text-[11px] text-slate-400 truncate hidden sm:inline">
              {filteredGroups.length} skupin · {totalObjects} objektů
            </span>
          </div>
          <div className="flex items-center gap-1 flex-wrap mt-1">
            <button
              type="button"
              className={`rounded px-2 py-0.5 text-[11px] font-medium ${kindFilter === "all" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              onClick={() => setKindFilter("all")}
            >
              Vše ({kindCounts.all ?? 0})
            </button>
            {(Object.keys(KIND_LABELS) as RequirementItemKind[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`rounded px-2 py-0.5 text-[11px] font-medium ${kindFilter === k ? "bg-slate-700 text-white" : `${KIND_COLORS[k]} hover:opacity-80`}`}
                onClick={() => setKindFilter(k)}
              >
                {KIND_LABELS[k]} ({kindCounts[k] ?? 0})
              </button>
            ))}
          </div>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrovat…"
          className="flex-shrink-0 w-36 sm:w-48 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 placeholder:text-slate-400"
        />
      </div>

      {/* Scrollable list */}
      <div className="flex-1 min-h-0 overflow-auto flex flex-col bg-white">
        {filteredGroups.length === 0 ? (
          <div className="px-3 py-2 text-xs text-slate-500">
            Žádná skupina neodpovídá aktuálnímu filtru
            {search && (
              <button onClick={() => setSearch("")} className="ml-2 text-[11px] font-medium text-red-600 hover:underline">
                Zrušit filtr
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 text-xs">
            {filteredGroups.map((group) => {
              const isSelected = group.fingerprint === selectedFingerprint;
              const bound = boundObjectsText(group.objectCodes);
              const count = group.objectCodes.length;

              return (
                <li key={group.fingerprint} className={isSelected ? "bg-red-50/50" : ""}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 ${isSelected ? "bg-red-50" : ""}`}
                    onClick={() => onSelectGroup(isSelected ? undefined : group.fingerprint, isSelected ? undefined : group.kind)}
                    title={`${group.label} / Přiřazeno k: ${bound}`}
                  >
                    <span className="flex-shrink-0 text-slate-400" aria-hidden>
                      <svg className={`w-4 h-4 transition-transform ${isSelected ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                    <span className={`inline-flex flex-shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${KIND_COLORS[group.kind]}`}>
                      {KIND_LABELS[group.kind]}
                    </span>
                    <span className="inline-flex flex-shrink-0 items-center justify-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                      {count}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                      {group.label}
                    </span>
                    <span className="flex-shrink-0 text-[10px] text-slate-400 max-w-[30%] truncate">
                      {bound}
                    </span>
                  </button>
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
    </div>
  );
};
