import React, { useMemo, useState } from "react";
import type { ClassificationSystemEntry } from "../../project/types";
import type { ClassificationNode } from "../../classification/types";
import type { SchemaIndex } from "../../schema/types";
import { flattenNodesToRows, updateLeafMappedValue } from "../../classification/parser";

interface Props {
  primarySystem: ClassificationSystemEntry;
  allSystems: ClassificationSystemEntry[];
  onUpdateNodes: (nodes: ClassificationNode[]) => void;
  onClose: () => void;
  onAddMappedSystem: (systemId: string) => void;
  availableToAdd: ClassificationSystemEntry[];
  /** Při IFC primárním: otevře dialog výběru IFC objektů do hierarchie */
  onOpenIfcSelector?: () => void;
  /** IFC schéma – pro dropdowny entity/predefined type u namapovaného IFC */
  schemaIndex?: SchemaIndex | null;
}

const getPredefinedTypeOptions = (schema: SchemaIndex, entityName: string): string[] => {
  const types = schema.entities[entityName]?.predefinedTypeValues ?? [];
  if (types.length === 0) return [];
  return ["NOTDEFINED", ...types];
};

export const MappingEditorDialog: React.FC<Props> = ({
  primarySystem,
  allSystems,
  onUpdateNodes,
  onClose,
  onAddMappedSystem,
  availableToAdd,
  onOpenIfcSelector,
  schemaIndex,
}) => {
  const [addSystemId, setAddSystemId] = useState<string>("");
  const [search, setSearch] = useState("");

  const rows = useMemo(
    () => flattenNodesToRows(primarySystem.nodes ?? []),
    [primarySystem.nodes],
  );
  const mappedSystemIds = primarySystem.mappedSystemIds ?? [];
  const isIfcPrimary = primarySystem.isIfcSystem === true;

  const mappedEntries = useMemo(
    () => mappedSystemIds.map((id) => allSystems.find((s) => s.id === id)).filter(Boolean) as ClassificationSystemEntry[],
    [mappedSystemIds, allSystems],
  );

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(
      (n) =>
        n.code.toLowerCase().includes(q) ||
        (n.description ?? "").toLowerCase().includes(q) ||
        (n.ifcEntity ?? "").toLowerCase().includes(q) ||
        (n.predefinedType ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const levelCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    rows.forEach((r) => {
      counts[r.level] = (counts[r.level] ?? 0) + 1;
    });
    return counts;
  }, [rows]);

  const schemaEntityNames = useMemo(
    () => (schemaIndex ? Object.keys(schemaIndex.entities).sort() : []),
    [schemaIndex],
  );

  const handleCellChange = (code: string, systemId: string, value: string) => {
    const nodes = primarySystem.nodes ?? [];
    const next = updateLeafMappedValue(nodes, code, systemId, value);
    onUpdateNodes(next);
  };

  const handleAdd = () => {
    if (addSystemId) {
      onAddMappedSystem(addSystemId);
      setAddSystemId("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl">
        {/* Header – stejný styl jako Úprava klasifikačního systému */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Upravit mapování</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Primární systém: <span className="font-medium text-slate-700">{primarySystem.name}</span>
              {isIfcPrimary ? " (třídění dle IFC)" : " (klasifikační systém)"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
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
            type="button"
            className="text-slate-400 hover:text-slate-600"
            onClick={onClose}
            title="Zavřít"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Toolbar – Hledat + (při IFC) Výběr do hierarchie + Připojit systém */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2">
          <input
            type="text"
            placeholder="Hledat..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          {isIfcPrimary && onOpenIfcSelector && (
            <button
              type="button"
              className="rounded border border-indigo-300 bg-indigo-50 px-3 py-1 text-sm text-indigo-700 hover:bg-indigo-100"
              onClick={onOpenIfcSelector}
              title="Vybrat IFC entity a PredefinedType do hierarchie projektu"
            >
              Výběr objektů do hierarchie (IFC)
            </button>
          )}
          <span className="text-sm text-slate-500">Připojit systém:</span>
          <select
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            value={addSystemId}
            onChange={(e) => setAddSystemId(e.target.value)}
            disabled={availableToAdd.length === 0}
          >
            <option value="">— Vyberte —</option>
            {availableToAdd.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            onClick={handleAdd}
            disabled={!addSystemId}
          >
            Připojit
          </button>
          {availableToAdd.length === 0 && mappedSystemIds.length > 0 && (
            <span className="text-xs text-slate-500">Všechny systémy už jsou připojené.</span>
          )}
        </div>

        {/* Tabulka – primární systém vlevo (Kód, Popis, Úroveň s odsazením) + namapované systémy vpravo */}
        <div className="flex-1 overflow-auto p-4">
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="border-b border-slate-300">
                <th
                  colSpan={3}
                  className={`border border-slate-200 px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide ${isIfcPrimary ? "bg-indigo-100 text-indigo-800" : "bg-slate-200/80 text-slate-700"}`}
                >
                  {isIfcPrimary ? "Třídění dle IFC (primární)" : "Klasifikační systém (primární)"}
                </th>
                {mappedEntries.length > 0 && (
                  <th
                    colSpan={mappedEntries.reduce((s, e) => s + (e.isIfcSystem ? 2 : 1), 0)}
                    className="border border-slate-200 bg-indigo-100 px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-indigo-800"
                  >
                    Namapované systémy
                  </th>
                )}
              </tr>
              <tr>
                {isIfcPrimary ? (
                  <>
                    <th className="w-20 border border-slate-200 px-2 py-2 text-center text-xs font-semibold uppercase text-slate-600">
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
                    <th className="w-20 border border-slate-200 px-2 py-2 text-center text-xs font-semibold uppercase text-slate-600">
                      Úroveň
                    </th>
                  </>
                )}
                {mappedEntries.flatMap((entry) =>
                  entry.isIfcSystem
                    ? [
                        <th
                          key={`${entry.id}-entity`}
                          className="border border-slate-200 bg-indigo-50/50 px-2 py-2 text-left text-xs font-semibold uppercase text-indigo-700"
                        >
                          {entry.name} – IFC Entita
                        </th>,
                        <th
                          key={`${entry.id}-type`}
                          className="border border-slate-200 bg-indigo-50/50 px-2 py-2 text-left text-xs font-semibold uppercase text-indigo-700"
                        >
                          {entry.name} – IFC PredefinedType
                        </th>,
                      ]
                    : [
                        <th
                          key={entry.id}
                          className="border border-slate-200 bg-indigo-50/50 px-2 py-2 text-left text-xs font-semibold uppercase text-indigo-700"
                        >
                          {entry.name}
                        </th>,
                      ]
                )}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((node) => {
                const indent = (node.level - 1) * 16;
                const levelBg =
                  node.level === 1 ? "bg-slate-100/50" : node.level === 2 ? "bg-slate-50/50" : "";
                return (
                  <tr key={node.code} className={`hover:bg-indigo-50/30 ${levelBg}`}>
                    {isIfcPrimary ? (
                      <>
                        <td className="border border-slate-200 px-1 py-1 text-center">
                          <span className="text-sm font-medium text-slate-600">{node.level}</span>
                        </td>
                        <td className="border border-slate-200 px-1 py-1">
                          <div className="flex items-center" style={{ paddingLeft: indent }}>
                            {node.level > 1 && (
                              <span className="mr-1 select-none text-slate-300">└</span>
                            )}
                            <span className="rounded bg-transparent px-1 py-0.5 text-sm font-medium text-slate-800">
                              {node.ifcEntity ?? node.code}
                            </span>
                          </div>
                        </td>
                        <td className="border border-slate-200 px-1 py-1">
                          <span className="text-sm text-slate-700">
                            {node.level === 1 ? "—" : (node.predefinedType ?? "NOTDEFINED")}
                          </span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="border border-slate-200 px-1 py-1">
                          <div className="flex items-center" style={{ paddingLeft: indent }}>
                            {node.level > 1 && (
                              <span className="mr-1 select-none text-slate-300">└</span>
                            )}
                            <span className="rounded bg-transparent px-1 py-0.5 text-sm font-medium text-slate-800">
                              {node.code}
                            </span>
                          </div>
                        </td>
                        <td className="border border-slate-200 px-1 py-1">
                          <div style={{ paddingLeft: indent }} className="text-sm text-slate-600">
                            {node.description ?? "—"}
                          </div>
                        </td>
                        <td className="border border-slate-200 px-1 py-1 text-center">
                          <span className="text-sm font-medium text-slate-600">{node.level}</span>
                        </td>
                      </>
                    )}
                    {mappedEntries.flatMap((entry) => {
                      const value = node.mappedValues?.[entry.id] ?? "";
                      if (entry.isIfcSystem && schemaIndex) {
                        const [entityPart, typePart] = value.includes("::") ? value.split("::") : [value, ""];
                        const typeDisplay = typePart?.trim() || "NOTDEFINED";
                        const ptOptions = entityPart ? getPredefinedTypeOptions(schemaIndex, entityPart) : [];
                        const effectiveType = ptOptions.includes(typeDisplay) ? typeDisplay : (ptOptions[0] ?? "NOTDEFINED");
                        return [
                          <td key={`${entry.id}-entity`} className="border border-slate-200 px-1 py-1">
                            <select
                              className="w-full min-w-[120px] rounded border border-slate-300 px-1 py-0.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                              value={entityPart || ""}
                              onChange={(e) => {
                                const newEntity = e.target.value;
                                const opts = getPredefinedTypeOptions(schemaIndex, newEntity);
                                const newValue = newEntity ? (opts.length ? `${newEntity}::NOTDEFINED` : newEntity) : "";
                                handleCellChange(node.code, entry.id, newValue);
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
                                handleCellChange(node.code, entry.id, newValue);
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
                        const [, typePart] = value.includes("::") ? value.split("::") : [value, ""];
                        return [
                          <td key={`${entry.id}-entity`} className="border border-slate-200 px-1 py-1">
                            <input
                              type="text"
                              className="w-full min-w-[100px] rounded border border-slate-300 px-1 py-0.5 text-sm focus:ring-1 focus:ring-indigo-500"
                              value={value}
                              onChange={(e) => handleCellChange(node.code, entry.id, e.target.value)}
                              placeholder="např. IfcWall::SOLIDWALL"
                            />
                          </td>,
                          <td key={`${entry.id}-type`} className="border border-slate-200 px-1 py-1">
                            <span className="text-sm text-slate-700">{typePart?.trim() || "NOTDEFINED"}</span>
                          </td>,
                        ];
                      }
                      return (
                        <td key={entry.id} className="border border-slate-200 px-1 py-1">
                          <input
                            type="text"
                            className="w-full min-w-[100px] rounded border-0 bg-transparent px-1 py-0.5 text-sm focus:bg-white focus:ring-1 focus:ring-indigo-500"
                            value={value}
                            onChange={(e) => handleCellChange(node.code, entry.id, e.target.value)}
                            placeholder="—"
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={3 + mappedEntries.reduce((s, e) => s + (e.isIfcSystem ? 2 : 1), 0)}
                    className="border border-slate-200 px-4 py-8 text-center text-slate-500"
                  >
                    {search.trim() ? "Žádné výsledky" : "Primární systém nemá žádné položky."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-shrink-0 justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            className="rounded border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-50"
            onClick={onClose}
          >
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
};
