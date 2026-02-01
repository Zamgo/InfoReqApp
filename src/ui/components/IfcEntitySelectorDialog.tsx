import React, { useCallback, useMemo, useState } from "react";
import type { ClassificationNode } from "../../classification/types";
import type { SchemaIndex } from "../../schema/types";
import { collectLeaves } from "../../classification/parser";
import { buildClassificationFromSchemaFiltered } from "../../classification/ifcTree";

interface Props {
  schemaIndex: SchemaIndex;
  currentNodes: ClassificationNode[];
  onSave: (nodes: ClassificationNode[]) => void;
  onClose: () => void;
}

export const IfcEntitySelectorDialog: React.FC<Props> = ({
  schemaIndex,
  currentNodes,
  onSave,
  onClose,
}) => {
  const entityNames = useMemo(
    () => Object.keys(schemaIndex.entities).sort(),
    [schemaIndex],
  );

  const initialSelected = useMemo(() => {
    const leaves = collectLeaves(currentNodes);
    return new Set(leaves.map((n) => n.code));
  }, [currentNodes]);

  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(initialSelected);
  const [search, setSearch] = useState("");
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set(entityNames.slice(0, 20)));

  const toggleCode = useCallback((code: string, checked: boolean) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (checked) next.add(code);
      else next.delete(code);
      return next;
    });
  }, []);

  const getEntityCodes = useCallback(
    (entityName: string): string[] => {
      const entity = schemaIndex.entities[entityName];
      if (!entity) return [];
      const types = entity.predefinedTypeValues ?? [];
      if (types.length === 0) return [entityName];
      return [`${entityName}::NOTDEFINED`, ...types.map((pt) => `${entityName}::${pt}`)];
    },
    [schemaIndex],
  );

  const isEntityFullySelected = useCallback(
    (entityName: string): boolean => {
      const codes = getEntityCodes(entityName);
      return codes.length > 0 && codes.every((c) => selectedCodes.has(c));
    },
    [getEntityCodes, selectedCodes],
  );

  const isEntityPartiallySelected = useCallback(
    (entityName: string): boolean => {
      const codes = getEntityCodes(entityName);
      return codes.some((c) => selectedCodes.has(c));
    },
    [getEntityCodes, selectedCodes],
  );

  const toggleEntity = useCallback(
    (entityName: string, checked: boolean) => {
      const codes = getEntityCodes(entityName);
      setSelectedCodes((prev) => {
        const next = new Set(prev);
        codes.forEach((c) => (checked ? next.add(c) : next.delete(c)));
        return next;
      });
    },
    [getEntityCodes],
  );

  const selectAll = useCallback(() => {
    const next = new Set<string>();
    entityNames.forEach((entityName) => {
      getEntityCodes(entityName).forEach((c) => next.add(c));
    });
    setSelectedCodes(next);
  }, [entityNames, getEntityCodes]);

  const selectNone = useCallback(() => {
    setSelectedCodes(new Set());
  }, []);

  const filteredEntityNames = useMemo(() => {
    if (!search.trim()) return entityNames;
    const q = search.trim().toLowerCase();
    return entityNames.filter((name) => name.toLowerCase().includes(q));
  }, [entityNames, search]);

  const toggleExpanded = useCallback((entityName: string) => {
    setExpandedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(entityName)) next.delete(entityName);
      else next.add(entityName);
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    const data = buildClassificationFromSchemaFiltered(schemaIndex, selectedCodes);
    onSave(data.nodes);
    onClose();
  }, [schemaIndex, selectedCodes, onSave, onClose]);

  const selectedCount = selectedCodes.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="flex-shrink-0 border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-800">
            Výběr IFC tříd a PredefinedType pro projekt
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Zaškrtněte entity a typy, které chcete zahrnout do hierarchie. V projektu pak půjde u objektů vybírat jen tyto.
          </p>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2">
          <input
            type="text"
            placeholder="Filtrovat entity..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[160px] rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
            onClick={selectAll}
          >
            Vybrat vše
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
            onClick={selectNone}
          >
            Zrušit vše
          </button>
          <span className="text-xs text-slate-500">
            Vybráno: {selectedCount} položek
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-2">
          <ul className="space-y-0.5 text-sm">
            {filteredEntityNames.map((entityName) => {
              const entity = schemaIndex.entities[entityName];
              if (!entity) return null;
              const types = entity.predefinedTypeValues ?? [];
              const hasTypes = types.length > 0;
              const expanded = expandedEntities.has(entityName);
              const full = isEntityFullySelected(entityName);
              const partial = isEntityPartiallySelected(entityName);

              return (
                <li key={entityName} className="rounded border border-slate-100 bg-slate-50/50">
                  <div className="flex items-center gap-2 py-1 pr-2">
                    {hasTypes && (
                      <button
                        type="button"
                        className="flex h-6 w-6 flex-shrink-0 items-center justify-center text-slate-500 hover:text-slate-700"
                        onClick={() => toggleExpanded(entityName)}
                        aria-label={expanded ? "Sbalit" : "Rozbalit"}
                      >
                        {expanded ? "−" : "+"}
                      </button>
                    )}
                    {!hasTypes && <span className="w-6 flex-shrink-0" />}
                    <label className="flex flex-1 cursor-pointer items-center gap-2 py-1">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        checked={hasTypes ? full : selectedCodes.has(entityName)}
                        onChange={(e) => toggleEntity(entityName, e.target.checked)}
                      />
                      <span className="font-medium text-slate-800">{entityName}</span>
                      {hasTypes && (
                        <span className="text-xs text-slate-500">
                          ({types.length} typů)
                        </span>
                      )}
                    </label>
                  </div>
                  {hasTypes && expanded && (
                    <ul className="ml-8 mb-2 mt-0.5 space-y-0.5 border-l border-slate-200 pl-3">
                      <li key={`${entityName}::NOTDEFINED`}>
                        <label className="flex cursor-pointer items-center gap-2 py-0.5">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={selectedCodes.has(`${entityName}::NOTDEFINED`)}
                            onChange={(e) => toggleCode(`${entityName}::NOTDEFINED`, e.target.checked)}
                          />
                          <span className="text-slate-700">Není definováno</span>
                        </label>
                      </li>
                      {types.map((pt) => {
                        const code = `${entityName}::${pt}`;
                        const checked = selectedCodes.has(code);
                        return (
                          <li key={code}>
                            <label className="flex cursor-pointer items-center gap-2 py-0.5">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                checked={checked}
                                onChange={(e) => toggleCode(code, e.target.checked)}
                              />
                              <span className="text-slate-700">{pt}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-shrink-0 justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            onClick={onClose}
          >
            Zrušit
          </button>
          <button
            type="button"
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
            onClick={handleSave}
          >
            Uložit hierarchii
          </button>
        </div>
      </div>
    </div>
  );
};
