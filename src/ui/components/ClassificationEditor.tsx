import React, { useState, useMemo } from "react";
import type { ClassificationNode } from "../../classification/types";
import type { ClassificationSystemEntry } from "../../project/types";

interface Props {
  system: ClassificationSystemEntry;
  onSave: (system: ClassificationSystemEntry) => void;
  onClose: () => void;
}

interface FlatNode {
  code: string;
  description: string;
  level: number;
  ifcEntity: string;
  predefinedType: string;
}

const flattenNodes = (nodes: ClassificationNode[]): FlatNode[] => {
  const result: FlatNode[] = [];
  const traverse = (node: ClassificationNode) => {
    result.push({
      code: node.code,
      description: node.description,
      level: node.level,
      ifcEntity: node.ifcEntity || "",
      predefinedType: node.predefinedType || "",
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

export const ClassificationEditor: React.FC<Props> = ({ system, onSave, onClose }) => {
  const initialFlat = useMemo(() => flattenNodes(system.nodes || []), [system.nodes]);
  const [rows, setRows] = useState<FlatNode[]>(initialFlat);
  const [search, setSearch] = useState("");
  
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

  const handleAddRow = () => {
    const newLevel = rows.length > 0 ? rows[rows.length - 1].level : 1;
    setRows((prev) => [
      ...prev,
      {
        code: "",
        description: "",
        level: newLevel,
        ifcEntity: "",
        predefinedType: "",
      },
    ]);
  };

  const handleDeleteRow = (index: number) => {
    const actualIndex = search.trim()
      ? rows.findIndex((r) => r.code === filteredRows[index].code)
      : index;
    
    setRows((prev) => prev.filter((_, i) => i !== actualIndex));
  };

  const handleSave = () => {
    const nodes = buildTreeFromFlat(rows);
    onSave({
      ...system,
      name: systemName.trim() || "Bez názvu",
      uri: systemUri.trim() || undefined,
      description: systemDescription.trim() || undefined,
      nodes,
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
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
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
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-4">
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className="border border-slate-200 px-2 py-2 text-left text-xs font-semibold uppercase text-slate-600">
                  Kód
                </th>
                <th className="border border-slate-200 px-2 py-2 text-left text-xs font-semibold uppercase text-slate-600">
                  Popis
                </th>
                <th className="border border-slate-200 px-2 py-2 text-center text-xs font-semibold uppercase text-slate-600 w-20">
                  Úroveň
                </th>
                <th className="border border-slate-200 px-2 py-2 text-left text-xs font-semibold uppercase text-slate-600">
                  IFC Entita
                </th>
                <th className="border border-slate-200 px-2 py-2 text-left text-xs font-semibold uppercase text-slate-600">
                  IFC PredefinedType
                </th>
                <th className="border border-slate-200 px-2 py-2 text-center text-xs font-semibold uppercase text-slate-600 w-28">
                  Akce
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => {
                // Calculate indentation based on level (level 1 = 0px, level 2 = 16px, etc.)
                const indent = (row.level - 1) * 16;
                // Determine row background based on level for visual hierarchy
                const levelBg = row.level === 1 
                  ? "bg-slate-100/50" 
                  : row.level === 2 
                    ? "bg-slate-50/50" 
                    : "";
                
                return (
                  <tr key={index} className={`hover:bg-indigo-50/30 ${levelBg}`}>
                    <td className="border border-slate-200 px-1 py-1">
                      <div className="flex items-center" style={{ paddingLeft: indent }}>
                        {/* Tree indicator */}
                        {row.level > 1 && (
                          <span className="mr-1 text-slate-300 select-none">
                            {"└".padStart(1, " ")}
                          </span>
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
                  <td colSpan={6} className="border border-slate-200 px-4 py-8 text-center text-slate-500">
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
      </div>
    </div>
  );
};
