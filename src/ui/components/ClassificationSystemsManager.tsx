import React, { useMemo, useState } from "react";
import type { ClassificationSystemEntry } from "../../project/types";
import { collectLeaves } from "../../classification/parser";
import { makeId } from "../../utils/id";
import { ClassificationEditor } from "./ClassificationEditor";

interface Props {
  systems: ClassificationSystemEntry[];
  onAdd: (entry: ClassificationSystemEntry) => void;
  onUpdate: (id: string, updates: Partial<ClassificationSystemEntry>) => void;
  onDelete: (id: string) => void;
  onUploadFile: (file: File) => Promise<void>;
  onResetDefault: () => void;
}

export const ClassificationSystemsManager: React.FC<Props> = ({
  systems,
  onAdd,
  onUpdate,
  onDelete,
  onUploadFile,
  onResetDefault,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingSystem, setEditingSystem] = useState<ClassificationSystemEntry | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  const sorted = useMemo(
    () => [...systems].sort((a, b) => {
      // Primary first, then alphabetically
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return (a.name || "").localeCompare(b.name || "");
    }),
    [systems],
  );

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (file) {
      await onUploadFile(file);
    }
    // Reset input value so the same file can be selected again
    e.target.value = "";
  };

  const handleSetPrimary = (id: string) => {
    const targetSystem = systems.find((s) => s.id === id);
    const currentPrimary = systems.find((s) => s.isPrimary);
    
    const message = currentPrimary
      ? `Opravdu chcete nastavit "${targetSystem?.name || "tento systém"}" jako primární klasifikační systém?\n\nAktuálně primární systém "${currentPrimary.name}" bude nahrazen a hierarchie objektů bude založena na novém systému.`
      : `Opravdu chcete nastavit "${targetSystem?.name || "tento systém"}" jako primární klasifikační systém?\n\nHierarchie objektů bude založena na tomto systému.`;
    
    if (!window.confirm(message)) {
      return;
    }
    
    // Set the clicked one as primary, unset others
    systems.forEach((sys) => {
      if (sys.id === id && !sys.isPrimary) {
        onUpdate(sys.id, { isPrimary: true });
      } else if (sys.id !== id && sys.isPrimary) {
        onUpdate(sys.id, { isPrimary: false });
      }
    });
  };

  const handleSaveEdit = (updatedSystem: ClassificationSystemEntry) => {
    if (isCreatingNew) {
      // Creating a new system
      onAdd(updatedSystem);
      setIsCreatingNew(false);
    } else {
      // Updating existing system
      onUpdate(updatedSystem.id, {
        nodes: updatedSystem.nodes,
        name: updatedSystem.name,
      });
    }
    setEditingSystem(null);
  };

  const handleCreateNewWithEditor = () => {
    const newSystem: ClassificationSystemEntry = {
      id: makeId(),
      name: "Nový klasifikační systém",
      nodes: [],
    };
    setEditingSystem(newSystem);
    setIsCreatingNew(true);
  };

  const handleCloseEditor = () => {
    setEditingSystem(null);
    setIsCreatingNew(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex-shrink-0">
        <div className="text-sm font-semibold text-slate-800">Klasifikační systémy</div>
        <div className="text-xs text-slate-500">
          Správa klasifikačních systémů a jejich mapování na IFC entity.
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
          <input
            type="file"
            accept=".txt"
            onChange={handleFileChange}
            className="hidden"
          />
          <span>Import TXT</span>
        </label>
        <button
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          onClick={onResetDefault}
        >
          Načíst výchozí
        </button>
        <button
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500"
          onClick={handleCreateNewWithEditor}
        >
          + Nový systém
        </button>
      </div>

      {/* Systems list */}
      <div className="min-h-0 flex-1 overflow-auto rounded border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Název</th>
              <th className="px-3 py-2">Položky</th>
              <th className="px-3 py-2 text-right">Akce</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((sys) => {
              const isExpanded = expanded.has(sys.id);
              const leafCount = sys.nodes ? collectLeaves(sys.nodes).length : 0;
              return (
                <React.Fragment key={sys.id}>
                  <tr className={`border-t border-slate-200 ${sys.isPrimary ? "bg-indigo-50/50" : ""}`}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          className="text-slate-500 hover:text-slate-800"
                          onClick={() => toggleExpanded(sys.id)}
                          title={isExpanded ? "Skrýt" : "Zobrazit"}
                        >
                          {isExpanded ? "▼" : "▶"}
                        </button>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{sys.name}</span>
                            {sys.isPrimary && (
                              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-700">
                                Primární
                              </span>
                            )}
                          </div>
                          {sys.sourceName && (
                            <span className="text-[11px] text-slate-500">
                              Zdroj: {sys.sourceName}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {leafCount > 0 ? `${leafCount} položek` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                          onClick={() => setEditingSystem({ ...sys, nodes: sys.nodes ?? [] })}
                          title="Upravit klasifikaci"
                        >
                          Upravit
                        </button>
                        {sys.isPrimary ? (
                          <span className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                            ✓ Nastaveno jako primární
                          </span>
                        ) : (
                          <>
                            <button
                              className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50"
                              onClick={() => handleSetPrimary(sys.id)}
                              title="Nastavit jako primární"
                            >
                              Nastavit primární
                            </button>
                            <button
                              className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                              onClick={() => onDelete(sys.id)}
                              title="Smazat"
                            >
                              Smazat
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-t border-slate-200 bg-slate-50/40">
                      <td className="px-3 py-2" colSpan={3}>
                        <div className="grid grid-cols-1 gap-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-slate-600">
                                Název
                              </label>
                              <input
                                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                value={sys.name}
                                onChange={(e) => onUpdate(sys.id, { name: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-slate-600">
                                URI
                              </label>
                              <input
                                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                value={sys.uri ?? ""}
                                onChange={(e) => onUpdate(sys.id, { uri: e.target.value || undefined })}
                                placeholder="—"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">
                              Popis
                            </label>
                            <textarea
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                              rows={2}
                              value={sys.description ?? ""}
                              onChange={(e) =>
                                onUpdate(sys.id, { description: e.target.value || undefined })
                              }
                              placeholder="Volitelný popis klasifikačního systému"
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-sm text-slate-500" colSpan={3}>
                  Zatím nemáte žádné klasifikační systémy. Importujte TXT soubor nebo načtěte výchozí klasifikaci.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Classification Editor Modal */}
      {editingSystem && (
        <ClassificationEditor
          system={editingSystem}
          onSave={handleSaveEdit}
          onClose={handleCloseEditor}
        />
      )}
    </div>
  );
};
