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
}

const flattenNodes = (nodes: ClassificationNode[]): FlatNode[] => {
  const result: FlatNode[] = [];
  const traverse = (node: ClassificationNode) => {
    result.push({
      code: node.code,
      description: node.description,
      level: node.level,
      ifcEntity: node.ifcEntity || "",
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

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.ifcEntity.toLowerCase().includes(q)
    );
  }, [rows, search]);

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
              Úprava klasifikace: {system.name}
            </h2>
            <p className="text-sm text-slate-500">
              {rows.length} položek
            </p>
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
                <th className="border border-slate-200 px-2 py-2 text-center text-xs font-semibold uppercase text-slate-600 w-28">
                  Akce
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => (
                <tr key={index} className="hover:bg-slate-50">
                  <td className="border border-slate-200 px-1 py-1">
                    <input
                      type="text"
                      value={row.code}
                      onChange={(e) => handleChange(index, "code", e.target.value)}
                      className="w-full rounded border-0 bg-transparent px-1 py-0.5 text-sm focus:bg-white focus:ring-1 focus:ring-indigo-500"
                      placeholder="Kód"
                    />
                  </td>
                  <td className="border border-slate-200 px-1 py-1">
                    <input
                      type="text"
                      value={row.description}
                      onChange={(e) => handleChange(index, "description", e.target.value)}
                      className="w-full rounded border-0 bg-transparent px-1 py-0.5 text-sm focus:bg-white focus:ring-1 focus:ring-indigo-500"
                      placeholder="Popis"
                    />
                  </td>
                  <td className="border border-slate-200 px-1 py-1 text-center">
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={row.level}
                      onChange={(e) => handleChange(index, "level", parseInt(e.target.value) || 1)}
                      className="w-16 rounded border-0 bg-transparent px-1 py-0.5 text-center text-sm focus:bg-white focus:ring-1 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="border border-slate-200 px-1 py-1">
                    <input
                      type="text"
                      value={row.ifcEntity}
                      onChange={(e) => handleChange(index, "ifcEntity", e.target.value)}
                      className="w-full rounded border-0 bg-transparent px-1 py-0.5 text-sm focus:bg-white focus:ring-1 focus:ring-indigo-500"
                      placeholder="např. IfcWall"
                    />
                  </td>
                  <td className="border border-slate-200 px-1 py-1 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        onClick={() => handleMoveUp(index)}
                        title="Posunout nahoru"
                        disabled={search.trim() !== ""}
                      >
                        ↑
                      </button>
                      <button
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
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
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="border border-slate-200 px-4 py-8 text-center text-slate-500">
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
