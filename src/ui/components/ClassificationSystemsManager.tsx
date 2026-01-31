import React, { useMemo, useState } from "react";
import type { ClassificationSystemEntry } from "../../project/types";
import type { ClassificationNode } from "../../classification/types";
import { collectLeaves } from "../../classification/parser";
// Vzorové soubory jsou v public/ – stahují se přímo (hlavičky dle vašich souborů)
const BASE = typeof import.meta !== "undefined" && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : "/";
const SAMPLE_CLASSIFICATION_URL = `${BASE}Vzorový_KS.xlsx`;
const SAMPLE_MAPPING_URL = `${BASE}Vzorový_KS_mapování.xlsx`;
import { makeId } from "../../utils/id";
import { ClassificationEditor } from "./ClassificationEditor";

/** Add empty mapped value for systemId to every node */
function addMappedValueToNodes(nodes: ClassificationNode[], systemId: string): ClassificationNode[] {
  return nodes.map((n) => ({
    ...n,
    mappedValues: { ...(n.mappedValues ?? {}), [systemId]: "" },
    children: addMappedValueToNodes(n.children, systemId),
  }));
}

const hasIfcOrMappedInNodes = (nodes: ClassificationNode[] | undefined): boolean => {
  if (!nodes?.length) return false;
  const check = (n: ClassificationNode): boolean => {
    if (n.ifcEntity || n.predefinedType) return true;
    if (n.mappedValues && Object.keys(n.mappedValues).length > 0) return true;
    return n.children.some(check);
  };
  return nodes.some(check);
};

const isMappedEntry = (e: ClassificationSystemEntry): boolean =>
  (e.mappedSystemIds?.length ?? 0) > 0 || hasIfcOrMappedInNodes(e.nodes);

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
  const [showMapDialog, setShowMapDialog] = useState(false);
  const [mapTargetId, setMapTargetId] = useState<string>("");
  const [mapSourceId, setMapSourceId] = useState<string>("");
  const [showSampleDropdown, setShowSampleDropdown] = useState(false);

  const sortEntries = (list: ClassificationSystemEntry[]) =>
    [...list].sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });

  const pureSystems = useMemo(
    () => sortEntries(systems.filter((s) => !isMappedEntry(s))),
    [systems],
  );
  const mappedSystems = useMemo(
    () => sortEntries(systems.filter((s) => isMappedEntry(s))),
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
      onAdd(updatedSystem);
      setIsCreatingNew(false);
    } else {
      onUpdate(updatedSystem.id, {
        nodes: updatedSystem.nodes,
        name: updatedSystem.name,
        mappedSystemIds: updatedSystem.mappedSystemIds,
        authoringToolSystemIds: updatedSystem.authoringToolSystemIds,
        isPure: updatedSystem.isPure,
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

  const availableMapSources = useMemo(
    () => {
      if (!mapTargetId) return [];
      const target = systems.find((s) => s.id === mapTargetId);
      const existing = target?.mappedSystemIds ?? [];
      return systems.filter((s) => s.id !== mapTargetId && !existing.includes(s.id));
    },
    [systems, mapTargetId],
  );

  const handleConfirmMap = () => {
    if (!mapTargetId || !mapSourceId) return;
    const target = systems.find((s) => s.id === mapTargetId);
    if (!target?.nodes) return;
    const nextMappedIds = [...(target.mappedSystemIds ?? []), mapSourceId];
    const nextNodes = addMappedValueToNodes(target.nodes, mapSourceId);
    onUpdate(mapTargetId, { mappedSystemIds: nextMappedIds, nodes: nextNodes });
    setShowMapDialog(false);
    setMapTargetId("");
    setMapSourceId("");
  };

  const handleDownloadSample = (variant: "classification" | "mapping") => {
    const url = variant === "classification" ? SAMPLE_CLASSIFICATION_URL : SAMPLE_MAPPING_URL;
    const name = variant === "classification" ? "Vzorový_KS.xlsx" : "Vzorový_KS_mapování.xlsx";
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setShowSampleDropdown(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex-shrink-0">
        <div className="text-sm font-semibold text-slate-800">Klasifikační systémy a mapování</div>
        <div className="text-xs text-slate-500">
          Klasifikační systémy (kód, popis, úroveň) a namapované klasifikační systémy (např. IFC entita, Kategorie RVT). Hierarchie se zakládá na namapovaných.
        </div>
      </div>

      {/* Klasifikační systémy – samostatná karta */}
      <div className="flex-shrink-0 rounded-lg border-2 border-slate-200 bg-slate-50/50 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2">
          <span className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Klasifikační systémy
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-sm hover:bg-slate-50"
                onClick={() => setShowSampleDropdown((v) => !v)}
                title="Stáhne vzorový XLSX se strukturou, kterou aplikace očekává"
              >
                Stáhnout vzorový soubor
              </button>
              {showSampleDropdown && (
                <>
                  <div className="absolute left-0 top-full z-20 mt-1 min-w-[260px] rounded border border-slate-200 bg-white py-1 shadow-lg">
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
                      onClick={() => handleDownloadSample("classification")}
                    >
                      <span className="font-medium">Klasifikační systém</span>
                      <span className="block text-xs text-slate-500">Kód, Popis, Úroveň (Vzorový_KS.xlsx)</span>
                    </button>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
                      onClick={() => handleDownloadSample("mapping")}
                    >
                      <span className="font-medium">Mapování</span>
                      <span className="block text-xs text-slate-500">+ IFC Entita, IFC PredefinedType, další sloupce (Vzorový_KS_mapování.xlsx)</span>
                    </button>
                  </div>
                  <div
                    className="fixed inset-0 z-10"
                    aria-hidden
                    onClick={() => setShowSampleDropdown(false)}
                  />
                </>
              )}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-sm hover:bg-slate-50">
              <input type="file" accept=".txt,.xlsx" onChange={handleFileChange} className="hidden" />
              <span>Importovat TXT / XLSX</span>
            </label>
            <button
              className="rounded border border-slate-300 bg-white px-2.5 py-1 text-sm hover:bg-slate-50"
              onClick={onResetDefault}
            >
              Načíst výchozí
            </button>
            <button
              className="rounded bg-slate-600 px-2.5 py-1 text-sm font-semibold text-white hover:bg-slate-500"
              onClick={handleCreateNewWithEditor}
            >
              + Nový systém
            </button>
          </div>
        </div>
        <div className="max-h-48 overflow-auto">
          {pureSystems.length > 0 ? (
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Název</th>
                  <th className="px-3 py-2">Položky</th>
                  <th className="px-3 py-2 text-right">Akce</th>
                </tr>
              </thead>
              <tbody>
                {pureSystems.map((sys) => renderSystemRow(sys))}
              </tbody>
            </table>
          ) : (
            <div className="px-3 py-4 text-sm text-slate-500">
              Žádné klasifikační systémy. Stáhněte vzorový soubor, vyplňte data a importujte TXT nebo XLSX.
            </div>
          )}
        </div>
      </div>

      {/* Namapované klasifikační systémy – samostatná karta, mapování jen zde */}
      <div className="min-h-0 flex-1 rounded-lg border-2 border-indigo-200 bg-indigo-50/30 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-200 bg-indigo-100/80 px-3 py-2">
          <span className="text-sm font-semibold uppercase tracking-wide text-indigo-800">
            Namapované klasifikační systémy
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded border border-indigo-400 bg-indigo-600 px-2.5 py-1 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => {
                setMapTargetId(mappedSystems[0]?.id ?? "");
                setMapSourceId("");
                setShowMapDialog(true);
              }}
              disabled={mappedSystems.length === 0}
              title="Připojit další klasifikační systém k namapovanému systému"
            >
              Mapovat
            </button>
            <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-indigo-300 bg-white px-2.5 py-1 text-sm text-indigo-700 hover:bg-indigo-50">
              <input type="file" accept=".txt,.xlsx" onChange={handleFileChange} className="hidden" />
              <span>Importovat TXT / XLSX</span>
            </label>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {mappedSystems.length > 0 ? (
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-indigo-50 text-left text-xs uppercase text-indigo-700">
                <tr>
                  <th className="px-3 py-2">Název</th>
                  <th className="px-3 py-2">Položky</th>
                  <th className="px-3 py-2 text-right">Akce</th>
                </tr>
              </thead>
              <tbody>
                {mappedSystems.map((sys) => renderSystemRow(sys))}
              </tbody>
            </table>
          ) : (
            <div className="px-3 py-4 text-sm text-slate-500">
              Žádné namapované klasifikační systémy. Načtěte výchozí klasifikaci výše, pak zde tlačítkem „Mapovat“ připojte např. Kategorie RVT.
            </div>
          )}
        </div>
      </div>

      {/* Mapovat – dialog pro připojení systému k namapovanému */}
      {showMapDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <h3 className="mb-3 text-lg font-semibold text-slate-800">Mapovat</h3>
            <p className="mb-3 text-xs text-slate-500">
              Vyberte namapovaný systém, na který chcete připojit další klasifikační systém (sloupec).
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Systém, na který připojit mapování
                </label>
                <select
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={mapTargetId}
                  onChange={(e) => {
                    setMapTargetId(e.target.value);
                    setMapSourceId("");
                  }}
                >
                  <option value="">— Vyberte —</option>
                  {mappedSystems.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.isPrimary ? " (primární)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Systém k připojení
                </label>
                <select
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={mapSourceId}
                  onChange={(e) => setMapSourceId(e.target.value)}
                  disabled={!mapTargetId || availableMapSources.length === 0}
                >
                  <option value="">— Vyberte —</option>
                  {availableMapSources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {mapTargetId && availableMapSources.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    Žádný další systém k připojení (všechny už jsou namapované).
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                onClick={() => {
                  setShowMapDialog(false);
                  setMapTargetId("");
                  setMapSourceId("");
                }}
              >
                Zrušit
              </button>
              <button
                type="button"
                className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                onClick={handleConfirmMap}
                disabled={!mapTargetId || !mapSourceId}
              >
                Potvrdit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Classification Editor Modal */}
      {editingSystem && (
        <ClassificationEditor
          system={editingSystem}
          allSystems={systems}
          onSave={handleSaveEdit}
          onClose={handleCloseEditor}
          hideMapButton={!isMappedEntry(editingSystem)}
        />
      )}
    </div>
  );

  function renderSystemRow(sys: ClassificationSystemEntry) {
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
  }
};
