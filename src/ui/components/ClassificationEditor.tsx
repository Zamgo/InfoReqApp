import React, { useState, useMemo } from "react";
import type { ClassificationNode } from "../../classification/types";
import type { ClassificationSystemEntry } from "../../project/types";
import type { SchemaIndex } from "../../schema/types";
import { collectLeaves } from "../../classification/parser";
import { EMPTY_PLACEHOLDER } from "../../classification/sampleXlsx";

interface Props {
  system: ClassificationSystemEntry;
  allSystems?: ClassificationSystemEntry[];
  onSave: (system: ClassificationSystemEntry) => void;
  onClose: () => void;
  /** Skrýt tlačítko Mapovat – mapování probíhá jen v záložce Klasifikační systémy a mapování */
  hideMapButton?: boolean;
  /** IFC schéma – pro dropdowny entity/predefined type u namapovaného IFC a při přidání řádku v IFC systému */
  schemaIndex?: SchemaIndex | null;
}

interface FlatNode {
  code: string;
  description: string;
  level: number;
  ifcEntity: string;
  predefinedType: string;
  mappedValues?: Record<string, string>;
}

const flattenNodes = (nodes: ClassificationNode[]): FlatNode[] => {
  const result: FlatNode[] = [];
  const traverse = (node: ClassificationNode) => {
    const clean = (v: string | undefined) => (v === EMPTY_PLACEHOLDER ? "" : (v ?? ""));
    result.push({
      code: node.code,
      description: node.description,
      level: node.level,
      ifcEntity: clean(node.ifcEntity),
      predefinedType: clean(node.predefinedType),
      mappedValues: node.mappedValues ? Object.fromEntries(Object.entries(node.mappedValues).map(([k, v]) => [k, clean(v)])) : undefined,
    });
    node.children.forEach(traverse);
  };
  nodes.forEach(traverse);
  return result;
};

const buildTreeFromFlat = (flatNodes: FlatNode[]): ClassificationNode[] => {
  const roots: ClassificationNode[] = [];
  const stack: ClassificationNode[] = [];

  flatNodes.forEach((flat) => {
    const node: ClassificationNode = {
      code: flat.code,
      description: flat.description,
      level: flat.level,
      ifcEntity: flat.ifcEntity || undefined,
      predefinedType: flat.predefinedType || undefined,
      mappedValues: flat.mappedValues && Object.keys(flat.mappedValues).length > 0 ? { ...flat.mappedValues } : undefined,
      children: [],
    };

    while (stack.length && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    stack.push(node);
  });

  return roots;
};

const getLeafCodes = (entry: ClassificationSystemEntry): string[] => {
  const leaves = entry.nodes ? collectLeaves(entry.nodes) : [];
  return leaves.map((n) => n.code);
};

export const ClassificationEditor: React.FC<Props> = ({ system, allSystems = [], onSave, onClose, hideMapButton, schemaIndex }) => {
  const initialFlat = useMemo(() => flattenNodes(system.nodes || []), [system.nodes]);
  const [rows, setRows] = useState<FlatNode[]>(initialFlat);
  const [search, setSearch] = useState("");
  const [mappedSystemIds, setMappedSystemIds] = useState<string[]>(system.mappedSystemIds ?? []);
  const [authoringToolSystemIds, setAuthoringToolSystemIds] = useState<string[]>(system.authoringToolSystemIds ?? []);
  const [showMapDropdown, setShowMapDropdown] = useState(false);
  const [showAddIfcRowDialog, setShowAddIfcRowDialog] = useState(false);
  const [addIfcEntity, setAddIfcEntity] = useState("");
  const [addIfcPredefinedType, setAddIfcPredefinedType] = useState("NOTDEFINED");

  const isPure = system.isPure === true;
  const isIfcSystem = system.isIfcSystem === true;
  const availableToMap = useMemo(
    () => allSystems.filter((s) => s.id !== system.id && !mappedSystemIds.includes(s.id)),
    [allSystems, system.id, mappedSystemIds],
  );
  const mappedEntries = useMemo(
    () => mappedSystemIds.map((id) => allSystems.find((s) => s.id === id)).filter(Boolean) as ClassificationSystemEntry[],
    [mappedSystemIds, allSystems],
  );

  const effectiveSystemKind = (e: ClassificationSystemEntry): "ifc" | "authoring" | "classification" =>
    e.systemKind ?? (e.isIfcSystem ? "ifc" : "classification");

  /** Seznam IFC entit ze schématu (pro dropdowny při namapovaném IFC) */
  const schemaEntityNames = useMemo(
    () => (schemaIndex ? Object.keys(schemaIndex.entities).sort() : []),
    [schemaIndex],
  );

  /** Pro danou entitu vrátí možnosti PredefinedType (NOTDEFINED + hodnoty ze schématu) */
  const getPredefinedTypeOptions = (entityName: string): string[] => {
    if (!schemaIndex?.entities[entityName]) return [];
    const types = schemaIndex.entities[entityName].predefinedTypeValues ?? [];
    if (types.length === 0) return [];
    return ["NOTDEFINED", ...types];
  };

  // Metadata state
  const [systemName, setSystemName] = useState(system.name || "");
  const [systemUri, setSystemUri] = useState(system.uri || "");
  const [systemDescription, setSystemDescription] = useState(system.description || "");

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.ifcEntity.toLowerCase().includes(q) ||
        r.predefinedType.toLowerCase().includes(q)
    );
  }, [rows, search]);

  // Count items per level
  const levelCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    rows.forEach((r) => {
      counts[r.level] = (counts[r.level] || 0) + 1;
    });
    return counts;
  }, [rows]);

  const handleChange = (index: number, field: keyof FlatNode, value: string | number) => {
    const actualIndex = search.trim()
      ? rows.findIndex((r) => r.code === filteredRows[index].code)
      : index;

    setRows((prev) => {
      const next = [...prev];
      next[actualIndex] = { ...next[actualIndex], [field]: value };
      return next;
    });
  };

  /** Aktualizace více polí řádku najednou (pro IFC dropdowny). */
  const handleChangeRow = (index: number, updates: Partial<FlatNode>) => {
    const actualIndex = search.trim()
      ? rows.findIndex((r) => r.code === filteredRows[index].code)
      : index;

    setRows((prev) => {
      const next = [...prev];
      next[actualIndex] = { ...next[actualIndex], ...updates };
      return next;
    });
  };

  const handleMappedChange = (index: number, systemId: string, value: string) => {
    const actualIndex = search.trim()
      ? rows.findIndex((r) => r.code === filteredRows[index].code)
      : index;
    setRows((prev) => {
      const next = [...prev];
      const row = next[actualIndex];
      next[actualIndex] = {
        ...row,
        mappedValues: { ...(row.mappedValues ?? {}), [systemId]: value },
      };
      return next;
    });
  };

  const handleAddMappedSystem = (systemId: string) => {
    setMappedSystemIds((prev) => [...prev, systemId]);
    setRows((prev) => prev.map((r) => ({
      ...r,
      mappedValues: { ...(r.mappedValues ?? {}), [systemId]: "" },
    })));
    setShowMapDropdown(false);
  };

  const handleRemoveMappedSystem = (systemId: string) => {
    setMappedSystemIds((prev) => prev.filter((id) => id !== systemId));
    setAuthoringToolSystemIds((prev) => prev.filter((id) => id !== systemId));
    setRows((prev) => prev.map((r) => {
      const { [systemId]: _, ...rest } = r.mappedValues ?? {};
      return { ...r, mappedValues: Object.keys(rest).length ? rest : undefined };
    }));
  };

  const toggleAuthoringTool = (systemId: string) => {
    setAuthoringToolSystemIds((prev) =>
      prev.includes(systemId) ? prev.filter((id) => id !== systemId) : [...prev, systemId]
    );
  };

  const handleAddRow = () => {
    if (isIfcSystem && schemaIndex) {
      setAddIfcEntity("");
      setAddIfcPredefinedType("NOTDEFINED");
      setShowAddIfcRowDialog(true);
      return;
    }
    const newLevel = rows.length > 0 ? rows[rows.length - 1].level : 1;
    const base: FlatNode = {
      code: "",
      description: "",
      level: newLevel,
      ifcEntity: "",
      predefinedType: "",
    };
    if (mappedSystemIds.length > 0) {
      base.mappedValues = Object.fromEntries(mappedSystemIds.map((id) => [id, ""]));
    }
    setRows((prev) => [...prev, base]);
  };

  const handleConfirmAddIfcRow = () => {
    if (!addIfcEntity || !schemaIndex) return;
    const entityDef = schemaIndex.entities[addIfcEntity];
    const types = entityDef?.predefinedTypeValues ?? [];
    const hasTypes = types.length > 0;
    const typeValue = hasTypes && addIfcPredefinedType ? addIfcPredefinedType : undefined;
    const codeLeaf = hasTypes ? `${addIfcEntity}::${typeValue ?? "NOTDEFINED"}` : addIfcEntity;
    const descLeaf = typeValue ? typeValue : (hasTypes ? "Není definováno" : addIfcEntity);

    setRows((prev) => {
      const entityRowIndex = prev.findIndex((r) => r.level === 1 && r.ifcEntity === addIfcEntity);
      const newEntityRow: FlatNode = {
        code: addIfcEntity,
        description: addIfcEntity,
        level: 1,
        ifcEntity: addIfcEntity,
        predefinedType: "",
      };
      if (mappedSystemIds.length > 0) {
        newEntityRow.mappedValues = Object.fromEntries(mappedSystemIds.map((id) => [id, ""]));
      }

      if (!hasTypes) {
        if (entityRowIndex >= 0) return prev;
        return [...prev, newEntityRow];
      }

      const newLeafRow: FlatNode = {
        code: codeLeaf,
        description: descLeaf,
        level: 2,
        ifcEntity: addIfcEntity,
        predefinedType: typeValue ?? "",
      };
      if (mappedSystemIds.length > 0) {
        newLeafRow.mappedValues = Object.fromEntries(mappedSystemIds.map((id) => [id, `${addIfcEntity}::${typeValue ?? "NOTDEFINED"}`]));
      }

      if (entityRowIndex < 0) {
        return [...prev, newEntityRow, newLeafRow];
      }
      let insertIndex = entityRowIndex + 1;
      while (insertIndex < prev.length && prev[insertIndex].level === 2 && prev[insertIndex].ifcEntity === addIfcEntity) {
        insertIndex += 1;
      }
      const next = [...prev];
      next.splice(insertIndex, 0, newLeafRow);
      return next;
    });
    setShowAddIfcRowDialog(false);
  };

  const handleDeleteRow = (index: number) => {
    const actualIndex = search.trim()
      ? rows.findIndex((r) => r.code === filteredRows[index].code)
      : index;
    
    setRows((prev) => prev.filter((_, i) => i !== actualIndex));
  };

  const handleSave = () => {
    const nodes = buildTreeFromFlat(rows);
    const allowedAuthoringIds = authoringToolSystemIds.filter((id) => {
      const e = allSystems.find((s) => s.id === id);
      return e && effectiveSystemKind(e) === "authoring";
    });
    onSave({
      ...system,
      name: systemName.trim() || "Bez názvu",
      uri: systemUri.trim() || undefined,
      description: systemDescription.trim() || undefined,
      nodes,
      mappedSystemIds: mappedSystemIds.length > 0 ? mappedSystemIds : undefined,
      authoringToolSystemIds: allowedAuthoringIds.length > 0 ? allowedAuthoringIds : undefined,
      isPure: system.isPure,
    });
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const actualIndex = search.trim()
      ? rows.findIndex((r) => r.code === filteredRows[index].code)
      : index;
    if (actualIndex <= 0) return;
    
    setRows((prev) => {
      const next = [...prev];
      [next[actualIndex - 1], next[actualIndex]] = [next[actualIndex], next[actualIndex - 1]];
      return next;
    });
  };

  const handleMoveDown = (index: number) => {
    const actualIndex = search.trim()
      ? rows.findIndex((r) => r.code === filteredRows[index].code)
      : index;
    if (actualIndex >= rows.length - 1) return;
    
    setRows((prev) => {
      const next = [...prev];
      [next[actualIndex], next[actualIndex + 1]] = [next[actualIndex + 1], next[actualIndex]];
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Úprava klasifikačního systému
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>{rows.length} položek celkem:</span>
              {Object.entries(levelCounts)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([level, count]) => (
                  <span
                    key={level}
                    className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                  >
                    Úroveň {level}: {count}
                  </span>
                ))}
            </div>
          </div>
          <button
            className="text-slate-400 hover:text-slate-600"
            onClick={onClose}
            title="Zavřít"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Metadata section */}
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="mb-2 text-xs font-semibold uppercase text-slate-500">
            Metadata klasifikačního systému
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Název <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="např. CCI-CZ, Uniclass 2015"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                URI (volitelné)
              </label>
              <input
                type="text"
                value={systemUri}
                onChange={(e) => setSystemUri(e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="https://example.com/classification"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Popis (volitelné)
              </label>
              <input
                type="text"
                value={systemDescription}
                onChange={(e) => setSystemDescription(e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="Popis klasifikačního systému"
              />
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2">
          <input
            type="text"
            placeholder="Hledat..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            className="rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-500"
            onClick={handleAddRow}
          >
            + Přidat řádek
          </button>
          {isIfcSystem && !schemaIndex && (
            <span className="text-xs text-amber-600">Pro výběr z IFC schématu spusťte npm run build:schema.</span>
          )}
          {!hideMapButton && allSystems.length > 0 && (
            <div className="relative ml-2">
              <button
                type="button"
                className="rounded border border-indigo-300 bg-indigo-50 px-3 py-1 text-sm text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                onClick={() => setShowMapDropdown((v) => !v)}
                disabled={availableToMap.length === 0}
                title="Mapování probíhá v záložce Klasifikační systémy a mapování tlačítkem Mapovat"
              >
                Mapovat
              </button>
              {showMapDropdown && availableToMap.length > 0 && (
                <>
                  <div className="absolute left-0 top-full z-10 mt-1 min-w-[200px] rounded border border-slate-200 bg-white py-1 shadow-lg">
                    {availableToMap.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100"
                        onClick={() => handleAddMappedSystem(s.id)}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                  <div
                    className="fixed inset-0 z-0"
                    aria-hidden
                    onClick={() => setShowMapDropdown(false)}
                  />
                </>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-4">
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-slate-50">
              {/* Nultý řádek – oddělení hlavních sloupců a namapovaných systémů */}
              <tr className="border-b border-slate-300">
                <th
                  colSpan={3}
                  className="border border-slate-200 bg-slate-200/80 px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-slate-700"
                >
                  {isIfcSystem ? "Třídění dle IFC" : "Klasifikační systém"}
                </th>
                {!isIfcSystem && !isPure && (
                  <th
                    colSpan={2}
                    className="border border-slate-200 bg-indigo-100 px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-indigo-800"
                  >
                    IFC mapování
                  </th>
                )}
                {mappedEntries.length > 0 && (
                  <th
                    colSpan={mappedEntries.reduce((s, e) => s + (e.isIfcSystem ? 2 : 1), 0)}
                    className="border border-slate-200 bg-indigo-100 px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-indigo-800"
                  >
                    Namapované systémy
                  </th>
                )}
                <th className="w-28 border border-slate-200 bg-slate-200/80 px-2 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-slate-700">
                  Akce
                </th>
              </tr>
              {/* Řádek se názvy sloupců */}
              <tr>
                {isIfcSystem ? (
                  <>
                    <th className="border border-slate-200 px-2 py-2 text-center text-xs font-semibold uppercase text-slate-600 w-20">
                      Úroveň
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-left text-xs font-semibold uppercase text-slate-600">
                      IFC Entita
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-left text-xs font-semibold uppercase text-slate-600">
                      IFC PredefinedType
                    </th>
                  </>
                ) : (
                  <>
                    <th className="border border-slate-200 px-2 py-2 text-left text-xs font-semibold uppercase text-slate-600">
                      Kód
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-left text-xs font-semibold uppercase text-slate-600">
                      Popis
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-center text-xs font-semibold uppercase text-slate-600 w-20">
                      Úroveň
                    </th>
                    {!isPure && (
                      <>
                        <th className="border border-slate-200 px-2 py-2 text-left text-xs font-semibold uppercase text-slate-600">
                          IFC Entita
                        </th>
                        <th className="border border-slate-200 px-2 py-2 text-left text-xs font-semibold uppercase text-slate-600">
                          IFC PredefinedType
                        </th>
                      </>
                    )}
                  </>
                )}
                {mappedEntries.flatMap((entry) => {
                  const isAuthoringTool = authoringToolSystemIds.includes(entry.id);
                  const kind = effectiveSystemKind(entry);
                  const canBeAuthoringTool = kind === "authoring";
                  if (entry.isIfcSystem) {
                    return [
                      <th key={`${entry.id}-entity`} className="border border-slate-200 bg-indigo-50/50 px-2 py-2 text-left text-xs font-semibold uppercase text-slate-600">
                        <div className="flex items-center justify-between gap-1">
                          <span>{entry.name} – IFC Entita</span>
                          <button
                            type="button"
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                            onClick={() => handleRemoveMappedSystem(entry.id)}
                            title="Odebrat mapování"
                          >
                            ×
                          </button>
                        </div>
                      </th>,
                      <th key={`${entry.id}-type`} className="border border-slate-200 bg-indigo-50/50 px-2 py-2 text-left text-xs font-semibold uppercase text-slate-600">
                        {entry.name} – IFC PredefinedType
                      </th>,
                    ];
                  }
                  return (
                    <th key={entry.id} className="border border-slate-200 bg-indigo-50/50 px-2 py-2 text-left text-xs font-semibold uppercase text-slate-600">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-1">
                          <span>{entry.name}</span>
                          <button
                            type="button"
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                            onClick={() => handleRemoveMappedSystem(entry.id)}
                            title="Odebrat mapování"
                          >
                            ×
                          </button>
                        </div>
                        {canBeAuthoringTool ? (
                          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-normal normal-case text-slate-500">
                            <input
                              type="checkbox"
                              checked={isAuthoringTool}
                              onChange={() => toggleAuthoringTool(entry.id)}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>Třídění nástrojů</span>
                          </label>
                        ) : (
                          <span className="text-[11px] font-normal normal-case text-slate-400" title="Pro třídění nástrojů lze použít jen systémy typu Autorský nástroj">
                            Třídění nástrojů —
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
                <th className="border border-slate-200 px-2 py-2 text-center text-xs font-semibold uppercase text-slate-600 w-28">
                  Akce
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => {
                // Pro úroveň 2: entita = stejná jako předchozí řádek úrovně 1 (jen PredefinedType se vybírá)
                const parentEntity =
                  row.level === 2
                    ? (filteredRows
                        .slice(0, index)
                        .reverse()
                        .find((r) => r.level === 1) as FlatNode | undefined)?.ifcEntity ?? row.ifcEntity
                    : row.ifcEntity;
                const indent = (row.level - 1) * 16;
                const levelBg = row.level === 1 
                  ? "bg-slate-100/50" 
                  : row.level === 2 
                    ? "bg-slate-50/50" 
                    : "";
                
                return (
                  <tr key={index} className={`hover:bg-indigo-50/30 ${levelBg}`}>
                    {isIfcSystem ? (
                      <>
                        <td className="border border-slate-200 px-1 py-1 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-200 hover:text-slate-600 disabled:opacity-30"
                              onClick={() => handleChange(index, "level", Math.max(1, row.level - 1))}
                              disabled={row.level <= 1}
                              title="Snížit úroveň (posunout doleva)"
                            >
                              ←
                            </button>
                            <span className="w-6 text-center text-sm font-medium text-slate-600">
                              {row.level}
                            </span>
                            <button
                              className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-200 hover:text-slate-600 disabled:opacity-30"
                              onClick={() => handleChange(index, "level", Math.min(10, row.level + 1))}
                              disabled={row.level >= 10}
                              title="Zvýšit úroveň (posunout doprava)"
                            >
                              →
                            </button>
                          </div>
                        </td>
                        <td className="border border-slate-200 px-1 py-1">
                          <div className="flex items-center gap-1" style={{ paddingLeft: indent }}>
                            {row.level > 1 && (
                              <span className="mr-1 shrink-0 text-slate-300 select-none">└</span>
                            )}
                            {schemaIndex ? (
                              row.level === 1 ? (
                                <select
                                  className="min-w-[140px] rounded border border-slate-300 px-1 py-0.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                  value={row.ifcEntity || ""}
                                  onChange={(e) => {
                                    const newEntity = e.target.value;
                                    handleChangeRow(index, {
                                      ifcEntity: newEntity,
                                      code: newEntity,
                                      description: newEntity,
                                      predefinedType: "",
                                    });
                                    // Synchronizovat následující řádky úrovně 2 (až do další úrovně 1) na novou entitu
                                    const actualIndex = search.trim()
                                      ? rows.findIndex((r) => r.code === filteredRows[index].code)
                                      : index;
                                    setRows((prev) => {
                                      const next = [...prev];
                                      for (let i = actualIndex + 1; i < next.length && next[i].level === 2; i++) {
                                        const opts = getPredefinedTypeOptions(newEntity);
                                        next[i] = {
                                          ...next[i],
                                          ifcEntity: newEntity,
                                          predefinedType: opts.length ? "NOTDEFINED" : "",
                                          code: newEntity && opts.length ? `${newEntity}::NOTDEFINED` : newEntity,
                                          description: opts.length ? "Není definováno" : newEntity,
                                        };
                                      }
                                      return next;
                                    });
                                  }}
                                >
                                  <option value="">—</option>
                                  {schemaEntityNames.map((name) => (
                                    <option key={name} value={name}>
                                      {name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-sm font-medium text-slate-800" title="Entita je stejná jako na úrovni 1">
                                  {parentEntity || "—"}
                                </span>
                              )
                            ) : (
                              <span className="text-sm font-medium text-slate-800">{row.ifcEntity || "—"}</span>
                            )}
                          </div>
                        </td>
                        <td className="border border-slate-200 px-1 py-1">
                          {schemaIndex && row.level === 2 && (parentEntity || row.ifcEntity) ? (
                            (() => {
                              const entityForType = parentEntity || row.ifcEntity;
                              const ptOptions = getPredefinedTypeOptions(entityForType);
                              const currentType = row.predefinedType?.trim() || "NOTDEFINED";
                              const effectiveType = ptOptions.includes(currentType) ? currentType : (ptOptions[0] ?? "NOTDEFINED");
                              return (
                                <select
                                  className="min-w-[120px] rounded border border-slate-300 px-1 py-0.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                  value={effectiveType}
                                  disabled={ptOptions.length === 0}
                                  onChange={(e) => {
                                    const newType = e.target.value;
                                    const newCode = `${entityForType}::${newType}`;
                                    const newDesc = newType === "NOTDEFINED" ? "Není definováno" : newType;
                                    handleChangeRow(index, {
                                      ifcEntity: entityForType,
                                      predefinedType: newType,
                                      code: newCode,
                                      description: newDesc,
                                    });
                                  }}
                                >
                                  {ptOptions.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </select>
                              );
                            })()
                          ) : (
                            <span className="text-sm text-slate-700">
                              {row.level === 1 ? "—" : (row.predefinedType?.trim() || "NOTDEFINED")}
                            </span>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="border border-slate-200 px-1 py-1">
                          <div className="flex items-center" style={{ paddingLeft: indent }}>
                            {row.level > 1 && (
                              <span className="mr-1 text-slate-300 select-none">└</span>
                            )}
                            <input
                              type="text"
                              value={row.code}
                              onChange={(e) => handleChange(index, "code", e.target.value)}
                              className="w-full rounded border-0 bg-transparent px-1 py-0.5 text-sm font-medium focus:bg-white focus:ring-1 focus:ring-indigo-500"
                              placeholder="Kód"
                            />
                          </div>
                        </td>
                        <td className="border border-slate-200 px-1 py-1">
                          <div style={{ paddingLeft: indent }}>
                            <input
                              type="text"
                              value={row.description}
                              onChange={(e) => handleChange(index, "description", e.target.value)}
                              className="w-full rounded border-0 bg-transparent px-1 py-0.5 text-sm focus:bg-white focus:ring-1 focus:ring-indigo-500"
                              placeholder="Popis"
                            />
                          </div>
                        </td>
                        <td className="border border-slate-200 px-1 py-1 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-200 hover:text-slate-600 disabled:opacity-30"
                              onClick={() => handleChange(index, "level", Math.max(1, row.level - 1))}
                              disabled={row.level <= 1}
                              title="Snížit úroveň (posunout doleva)"
                            >
                              ←
                            </button>
                            <span className="w-6 text-center text-sm font-medium text-slate-600">
                              {row.level}
                            </span>
                            <button
                              className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-200 hover:text-slate-600 disabled:opacity-30"
                              onClick={() => handleChange(index, "level", Math.min(10, row.level + 1))}
                              disabled={row.level >= 10}
                              title="Zvýšit úroveň (posunout doprava)"
                            >
                              →
                            </button>
                          </div>
                        </td>
                        {!isPure && (
                          <>
                            <td className="border border-slate-200 px-1 py-1">
                              {row.level <= 2 ? (
                                <span className="block px-2 py-0.5 text-center text-slate-300">—</span>
                              ) : (
                                <input
                                  type="text"
                                  value={row.ifcEntity}
                                  onChange={(e) => handleChange(index, "ifcEntity", e.target.value)}
                                  className="w-full rounded border-0 bg-transparent px-1 py-0.5 text-sm focus:bg-white focus:ring-1 focus:ring-indigo-500"
                                  placeholder="např. IfcWall"
                                />
                              )}
                            </td>
                            <td className="border border-slate-200 px-1 py-1">
                              {row.level <= 2 ? (
                                <span className="block px-2 py-0.5 text-center text-slate-300">—</span>
                              ) : (
                                <input
                                  type="text"
                                  value={row.predefinedType}
                                  onChange={(e) => handleChange(index, "predefinedType", e.target.value)}
                                  className="w-full rounded border-0 bg-transparent px-1 py-0.5 text-sm focus:bg-white focus:ring-1 focus:ring-indigo-500"
                                  placeholder="např. SOLIDWALL"
                                />
                              )}
                            </td>
                          </>
                        )}
                      </>
                    )}
                    {mappedEntries.flatMap((entry) => {
                      const codes = getLeafCodes(entry);
                      const value = row.mappedValues?.[entry.id] ?? "";
                      if (entry.isIfcSystem && schemaIndex) {
                        const [entityPart, typePart] = value.includes("::") ? value.split("::") : [value, ""];
                        const typeDisplay = typePart?.trim() || "NOTDEFINED";
                        const ptOptions = entityPart ? getPredefinedTypeOptions(entityPart) : [];
                        const effectiveType = ptOptions.includes(typeDisplay) ? typeDisplay : (ptOptions[0] ?? "NOTDEFINED");
                        return [
                          <td key={`${entry.id}-entity`} className="border border-slate-200 px-1 py-1">
                            <select
                              className="w-full min-w-[120px] rounded border border-slate-300 px-1 py-0.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                              value={entityPart || ""}
                              onChange={(e) => {
                                const newEntity = e.target.value;
                                const opts = getPredefinedTypeOptions(newEntity);
                                const newValue = newEntity
                                  ? opts.length
                                    ? `${newEntity}::NOTDEFINED`
                                    : newEntity
                                  : "";
                                handleMappedChange(index, entry.id, newValue);
                              }}
                            >
                              <option value="">—</option>
                              {schemaEntityNames.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                          </td>,
                          <td key={`${entry.id}-type`} className="border border-slate-200 px-1 py-1">
                            <select
                              className="w-full min-w-[100px] rounded border border-slate-300 px-1 py-0.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                              value={effectiveType}
                              disabled={!entityPart || ptOptions.length === 0}
                              onChange={(e) => {
                                const newType = e.target.value;
                                const newValue = entityPart ? `${entityPart}::${newType}` : "";
                                handleMappedChange(index, entry.id, newValue);
                              }}
                            >
                              {ptOptions.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </td>,
                        ];
                      }
                      if (entry.isIfcSystem) {
                        const [entityPart, typePart] = value.includes("::") ? value.split("::") : [value, ""];
                        return [
                          <td key={`${entry.id}-entity`} className="border border-slate-200 px-1 py-1">
                            <select
                              className="w-full min-w-[120px] rounded border border-slate-300 px-1 py-0.5 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                              value={value}
                              onChange={(e) => handleMappedChange(index, entry.id, e.target.value)}
                            >
                              <option value="">—</option>
                              {codes.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </td>,
                          <td key={`${entry.id}-type`} className="border border-slate-200 px-1 py-1">
                            <span className="text-sm text-slate-700">{typePart?.trim() || "NOTDEFINED"}</span>
                          </td>,
                        ];
                      }
                      return (
                        <td key={entry.id} className="border border-slate-200 px-1 py-1">
                          <select
                            className="w-full min-w-[120px] rounded border border-slate-300 px-1 py-0.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            value={value}
                            onChange={(e) => handleMappedChange(index, entry.id, e.target.value)}
                          >
                            <option value="">—</option>
                            {codes.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                          onClick={() => handleMoveUp(index)}
                          title="Posunout nahoru"
                          disabled={search.trim() !== ""}
                        >
                          ↑
                        </button>
                        <button
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                          onClick={() => handleMoveDown(index)}
                          title="Posunout dolů"
                          disabled={search.trim() !== ""}
                        >
                          ↓
                        </button>
                        <button
                          className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                          onClick={() => handleDeleteRow(index)}
                          title="Smazat"
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={3 + (isIfcSystem ? 0 : (isPure ? 0 : 2)) + mappedEntries.reduce((s, e) => s + (e.isIfcSystem ? 2 : 1), 0) + 1}
                    className="border border-slate-200 px-4 py-8 text-center text-slate-500"
                  >
                    {search.trim() ? "Žádné výsledky" : "Klasifikace je prázdná. Přidejte první položku."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            onClick={onClose}
          >
            Zrušit
          </button>
          <button
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            onClick={handleSave}
          >
            Uložit změny
          </button>
        </div>

        {/* Dialog: Přidat řádek v IFC systému – výběr entity a PredefinedType ze schématu */}
        {showAddIfcRowDialog && schemaIndex && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-black/40">
            <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
              <h3 className="mb-3 text-base font-semibold text-slate-800">Přidat IFC entitu a typ</h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">IFC Entita</label>
                  <select
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    value={addIfcEntity}
                    onChange={(e) => {
                      setAddIfcEntity(e.target.value);
                      setAddIfcPredefinedType("NOTDEFINED");
                    }}
                  >
                    <option value="">— Vyberte entitu —</option>
                    {schemaEntityNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">IFC PredefinedType</label>
                  <select
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    value={addIfcPredefinedType}
                    onChange={(e) => setAddIfcPredefinedType(e.target.value)}
                    disabled={!addIfcEntity || getPredefinedTypeOptions(addIfcEntity).length === 0}
                  >
                    {addIfcEntity && getPredefinedTypeOptions(addIfcEntity).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                  onClick={() => setShowAddIfcRowDialog(false)}
                >
                  Zrušit
                </button>
                <button
                  type="button"
                  className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                  disabled={!addIfcEntity}
                  onClick={handleConfirmAddIfcRow}
                >
                  Přidat
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
