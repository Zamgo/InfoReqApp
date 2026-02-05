import React, { lazy, startTransition, Suspense, useMemo, useState } from "react";
import type { ClassificationSystemEntry } from "../../project/types";
import type { ClassificationNode } from "../../classification/types";
import type { SchemaIndex } from "../../schema/types";
import { collectLeaves } from "../../classification/parser";
// Vzorové soubory jsou v public/ – stahují se přímo (hlavičky dle vašich souborů)
const BASE = typeof import.meta !== "undefined" && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : "/";
const SAMPLE_CLASSIFICATION_URL = `${BASE}Vzorový_KS.xlsx`;
const SAMPLE_MAPPING_URL = `${BASE}Vzorový_KS_mapování.xlsx`;
import { makeId } from "../../utils/id";
import { IfcEntitySelectorDialog } from "./IfcEntitySelectorDialog";
import { MappingEditorDialog } from "./MappingEditorDialog";

const ClassificationEditor = lazy(() => import("./ClassificationEditor").then((m) => ({ default: m.ClassificationEditor })));

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
  schemaIndex?: SchemaIndex | null;
  /** Volitelně callback (entry) => void – po přidání IFC systému se zavolá s novým záznamem (např. pro otevření editoru). */
  onAddIfcClassificationSystem?: (onAdded?: (entry: ClassificationSystemEntry) => void) => void;
}

export const ClassificationSystemsManager: React.FC<Props> = ({
  systems,
  onAdd,
  onUpdate,
  onDelete,
  onUploadFile,
  schemaIndex,
  onAddIfcClassificationSystem,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingSystem, setEditingSystem] = useState<ClassificationSystemEntry | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [showMapDialog, setShowMapDialog] = useState(false);
  const [showSampleDropdown, setShowSampleDropdown] = useState(false);
  const [showIfcSelectorDialog, setShowIfcSelectorDialog] = useState(false);
  const [showNewSystemMenu, setShowNewSystemMenu] = useState(false);

  const sortEntries = (list: ClassificationSystemEntry[]) =>
    [...list].sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });

  const ifcSystem = useMemo(() => systems.find((s) => s.isIfcSystem), [systems]);
  const primarySystem = useMemo(() => systems.find((s) => s.isPrimary), [systems]);
  /** Jedna tabulka – všechny systémy (IFC + čisté + namapované), seřazené */
  const allSystemsSorted = useMemo(() => sortEntries(systems), [systems]);
  /** Efektivní typ třídění (pro stará data bez systemKind) */
  const effectiveSystemKind = (e: ClassificationSystemEntry): "ifc" | "authoring" | "classification" =>
    e.systemKind ?? (e.isIfcSystem ? "ifc" : "classification");

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

  const handleDeleteSystem = (sys: ClassificationSystemEntry) => {
    const name = sys.name || "tento klasifikační systém";
    if (systems.length === 1) {
      if (!window.confirm(`Odstraněním posledního klasifikačního systému (${name}) zrušíte projekt. Chcete pokračovat?`)) {
        return;
      }
    } else if (sys.isPrimary) {
      if (!window.confirm(`Odstranit primární systém „${name}"? Jako primární bude automaticky nastaven jiný dostupný systém.`)) {
        return;
      }
    } else {
      if (!window.confirm(`Opravdu chcete odstranit klasifikační systém „${name}"?`)) {
        return;
      }
    }
    onDelete(sys.id);
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
        ...(updatedSystem.systemKind != null ? { systemKind: updatedSystem.systemKind } : {}),
      });
    }
    setEditingSystem(null);
  };

  const handleCreateNewWithEditor = () => {
    const newSystem: ClassificationSystemEntry = {
      id: makeId(),
      name: "Nový klasifikační systém",
      nodes: [],
      systemKind: "classification",
    };
    setEditingSystem(newSystem);
    setIsCreatingNew(true);
  };

  const handleCloseEditor = () => {
    setEditingSystem(null);
    setIsCreatingNew(false);
  };

  /** Systémy, které lze připojit k primárnímu (mapování jen na primární) */
  const availableMapSourcesForPrimary = useMemo(
    () => {
      if (!primarySystem) return [];
      const existing = primarySystem.mappedSystemIds ?? [];
      return systems.filter((s) => s.id !== primarySystem.id && !existing.includes(s.id));
    },
    [systems, primarySystem],
  );

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
        <div className="text-sm font-semibold text-slate-800">Třídění a mapování prvků</div>
        <div className="text-xs text-slate-500">
          Třídící systémy (IFC, autorský nástroj, klasifikační systém). Pouze klasifikační systémy se zobrazují v požadavcích na klasifikaci.
        </div>
      </div>

      {/* Třídící systémy – jedna tabulka (IFC + čisté + namapované) */}
      <div className="flex-shrink-0 rounded-lg border-2 border-slate-200 bg-slate-50/50 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2">
          <span className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Třídící systémy
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
            <div className="relative">
              <button
                type="button"
                className="rounded bg-slate-600 px-2.5 py-1 text-sm font-semibold text-white hover:bg-slate-500"
                onClick={() => setShowNewSystemMenu((v) => !v)}
                title="Přidat nový třídící systém"
              >
                + Nový systém
              </button>
              {showNewSystemMenu && (
                <>
                  <div className="absolute right-0 top-full z-20 mt-1 min-w-[280px] rounded border border-slate-200 bg-white py-1 shadow-lg">
                    {schemaIndex != null && onAddIfcClassificationSystem && !ifcSystem && (
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
                        onClick={() => {
                          setShowNewSystemMenu(false);
                          onAddIfcClassificationSystem(() => {
                            setShowIfcSelectorDialog(true);
                          });
                        }}
                        title="Založit projekt na IFC entitách; otevře výběr IFC tříd a typů"
                      >
                        <span className="font-medium">Začít s tříděním dle IFC entit</span>
                        <span className="block text-xs text-slate-500">Výběr IFC tříd a PredefinedType</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
                      onClick={() => {
                        setShowNewSystemMenu(false);
                        handleCreateNewWithEditor();
                      }}
                      title="Prázdný klasifikační systém; otevře dialog úprav"
                    >
                      <span className="font-medium">Začít čistý klasifikační systém</span>
                      <span className="block text-xs text-slate-500">Prázdná hierarchie, vyplníte nebo importujete</span>
                    </button>
                  </div>
                  <div
                    className="fixed inset-0 z-10"
                    aria-hidden
                    onClick={() => setShowNewSystemMenu(false)}
                  />
                </>
              )}
            </div>
          </div>
        </div>
        <div className="max-h-64 overflow-auto">
          {allSystemsSorted.length > 0 ? (
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Třídění</th>
                  <th className="px-3 py-2">Název</th>
                  <th className="px-3 py-2">Položky</th>
                  <th className="px-3 py-2 text-right">Akce</th>
                </tr>
              </thead>
              <tbody>
                {allSystemsSorted.map((sys) => renderSystemRow(sys))}
              </tbody>
            </table>
          ) : (
            <div className="px-3 py-4 text-sm text-slate-500">
              Žádné třídící systémy. Stáhněte vzorový soubor, importujte TXT/XLSX nebo přidejte systém (IFC / čistý).
            </div>
          )}
        </div>
      </div>

      {/* Dialog úpravy mapování – tabulka namapovaných entit + možnost připojit další systém */}
      {showMapDialog && primarySystem && (
        <MappingEditorDialog
          primarySystem={primarySystem}
          allSystems={systems}
          onUpdateNodes={(nodes) => onUpdate(primarySystem.id, { nodes })}
          onClose={() => setShowMapDialog(false)}
          onAddMappedSystem={(systemId) => {
            if (!primarySystem.nodes) return;
            const nextMappedIds = [...(primarySystem.mappedSystemIds ?? []), systemId];
            const nextNodes = addMappedValueToNodes(primarySystem.nodes, systemId);
            onUpdate(primarySystem.id, { mappedSystemIds: nextMappedIds, nodes: nextNodes });
          }}
          availableToAdd={availableMapSourcesForPrimary}
          onOpenIfcSelector={primarySystem.isIfcSystem ? () => setShowIfcSelectorDialog(true) : undefined}
          schemaIndex={schemaIndex}
        />
      )}

      {/* Dialog výběru IFC tříd a typů – jen pro IFC systém (nový i dodatečné úpravy) */}
      {showIfcSelectorDialog && schemaIndex && ifcSystem && (
        <IfcEntitySelectorDialog
          schemaIndex={schemaIndex}
          currentNodes={ifcSystem.nodes ?? []}
          onSave={(nodes) => {
            onUpdate(ifcSystem.id, { nodes });
            setShowIfcSelectorDialog(false);
          }}
          onClose={() => setShowIfcSelectorDialog(false)}
        />
      )}

      {/* Classification Editor Modal – tabulka s úpravou systému, mapováním, přidáním řádků a úrovněmi (pro primární IFC i ne-IFC) */}
      {editingSystem && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="rounded-lg bg-white px-8 py-6 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                  <span className="text-sm text-slate-600">Načítání editoru…</span>
                </div>
              </div>
            </div>
          }
        >
          <ClassificationEditor
            system={editingSystem}
            allSystems={systems}
            onSave={handleSaveEdit}
            onClose={handleCloseEditor}
            hideMapButton={!isMappedEntry(editingSystem)}
            schemaIndex={schemaIndex}
            onUpdateOtherSystem={(id, updates) => onUpdate(id, updates)}
          />
        </Suspense>
      )}
    </div>
  );

  function renderSystemRow(sys: ClassificationSystemEntry) {
              const isExpanded = expanded.has(sys.id);
              const leafCount = sys.nodes ? collectLeaves(sys.nodes).length : 0;
              const kind = effectiveSystemKind(sys);
              const isIfc = sys.isIfcSystem === true;
              return (
                <React.Fragment key={sys.id}>
                  <tr className={`border-t border-slate-200 ${sys.isPrimary ? "bg-indigo-50/50" : ""}`}>
                    <td className="px-3 py-2 align-top">
                      {isIfc ? (
                        <span className="text-xs font-medium text-slate-700">IFC</span>
                      ) : (
                        <select
                          className="w-full min-w-[140px] rounded border border-slate-300 px-2 py-1 text-xs"
                          value={kind}
                          onChange={(e) => {
                            const v = e.target.value as "authoring" | "classification";
                            if (v === "authoring" || v === "classification") {
                              onUpdate(sys.id, { systemKind: v });
                              if (primarySystem && sys.id !== primarySystem.id) {
                                const isMapped = primarySystem.mappedSystemIds?.includes(sys.id);
                                if (isMapped) {
                                  const curr = primarySystem.authoringToolSystemIds ?? [];
                                  if (v === "authoring" && !curr.includes(sys.id)) {
                                    onUpdate(primarySystem.id, { authoringToolSystemIds: [...curr, sys.id] });
                                  } else if (v === "classification" && curr.includes(sys.id)) {
                                    onUpdate(primarySystem.id, { authoringToolSystemIds: curr.filter((id) => id !== sys.id) });
                                  }
                                }
                              }
                            }
                          }}
                          title={kind === "classification" ? "Zobrazí se v požadavcích na klasifikaci" : "Pouze pro třídění (autorský nástroj)"}
                        >
                          <option value="classification">Klasifikační systém</option>
                          <option value="authoring">Autorský nástroj</option>
                        </select>
                      )}
                    </td>
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
                          {sys.isPrimary && (sys.mappedSystemIds?.length ?? 0) > 0 && (
                            <span className="mt-0.5 text-[11px] text-indigo-600">
                              Mapování: {(sys.mappedSystemIds ?? []).map((id) => systems.find((s) => s.id === id)?.name ?? id).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {leafCount > 0 ? `${leafCount} položek` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        {sys.isPrimary ? (
                          <button
                            type="button"
                            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                            onClick={() => startTransition(() => setEditingSystem({ ...sys, nodes: sys.nodes ?? [] }))}
                            disabled={!sys.nodes || collectLeaves(sys.nodes).length === 0}
                            title="Upravit systém a mapování"
                          >
                            Upravit nebo mapovat
                          </button>
                        ) : (
                          <button
                            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                            onClick={() => startTransition(() => setEditingSystem({ ...sys, nodes: sys.nodes ?? [] }))}
                            title="Upravit klasifikaci"
                          >
                            Upravit
                          </button>
                        )}
                        {sys.isPrimary ? (
                          <span className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                            ✓ Primární
                          </span>
                        ) : (
                          <button
                            className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50"
                            onClick={() => handleSetPrimary(sys.id)}
                            title="Nastavit jako primární"
                          >
                            Nastavit primární
                          </button>
                        )}
                        <button
                          className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          onClick={() => handleDeleteSystem(sys)}
                          title="Odstranit systém"
                        >
                          Odstranit
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-t border-slate-200 bg-slate-50/40">
                      <td className="px-3 py-2" colSpan={4}>
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
