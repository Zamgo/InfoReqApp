import React, { useMemo, useState } from "react";
import type { CodeList } from "../../project/types";
import { makeId } from "../../utils/id";
import { formatEnumValues, parseEnumValues } from "../../project/enumeration";
import { createSampleCodeListsXlsx, parseCodeListsFromFile } from "../../import/codeLists";

interface Props {
  codeLists: CodeList[];
  usage?: Record<
    string,
    Array<{
      objectCode: string;
      objectDescription?: string;
      propertyLabel?: string;
    }>
  >;
  onAdd: (list: CodeList) => void;
  onImport?: (lists: CodeList[]) => void;
  onUpdate: (id: string, updates: Partial<CodeList>) => void;
  onDelete: (id: string) => void;
}

export const CodeListManager: React.FC<Props> = ({ codeLists, usage, onAdd, onImport, onUpdate, onDelete }) => {
  const [name, setName] = useState("");
  const [valuesText, setValuesText] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [usageExpanded, setUsageExpanded] = useState<Set<string>>(new Set());
  const [importError, setImportError] = useState<string | null>(null);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setImportError(null);
    if (!file) return;
    try {
      const lists = await parseCodeListsFromFile(file);
      if (lists.length === 0) {
        setImportError("Soubor neobsahuje žádné číselníky.");
        return;
      }
      if (onImport) {
        onImport(lists);
      } else {
        for (const list of lists) {
          onAdd(list);
        }
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Chyba při importu.");
    }
  };

  const handleDownloadSample = async () => {
    const blob = await createSampleCodeListsXlsx();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Vzor_číselníky.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const sorted = useMemo(
    () => [...codeLists].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [codeLists],
  );

  const handleAdd = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const values = parseEnumValues(valuesText);
    onAdd({ id: makeId(), name: trimmedName, values });
    setName("");
    setValuesText("");
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleUsageExpanded = (id: string) => {
    setUsageExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex-shrink-0">
        <div className="text-sm font-semibold text-slate-800">Číselníky</div>
        <div className="text-xs text-slate-500">
          Správa předvolených výčtů (IDS: Enumeration). Změny se promítnou do vlastností navázaných na číselník.
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-sm hover:bg-slate-50">
            <input
              type="file"
              accept=".txt,.tsv,.csv,.xlsx"
              onChange={handleImportFile}
              className="hidden"
            />
            Importovat TXT / XLSX
          </label>
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-2.5 py-1 text-sm hover:bg-slate-50"
            onClick={handleDownloadSample}
            title="Stáhne vzorový XLSX – každý sloupec = číselník, první řádek = názvy, ostatní = hodnoty"
          >
            Stáhnout vzorový soubor
          </button>
          {importError && (
            <span className="text-sm text-red-600">{importError}</span>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 rounded border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Nový číselník</div>
        <div className="grid grid-cols-1 gap-2">
          <input
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="Název (např. Typ povrchu)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder={"Hodnoty (oddělte čárkou, středníkem nebo novým řádkem)\nnapř.\nA\nB\nC"}
            rows={3}
            value={valuesText}
            onChange={(e) => setValuesText(e.target.value)}
          />
          <div>
            <button
              className="rounded bg-indigo-600 px-3 py-1 text-sm font-semibold text-white hover:bg-indigo-500"
              onClick={handleAdd}
              disabled={!name.trim()}
            >
              Přidat číselník
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Název</th>
              <th className="px-3 py-2">Počet hodnot</th>
              <th className="px-3 py-2 text-right">Akce</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((cl) => {
              const isExpanded = expanded.has(cl.id);
              const clUsage = usage?.[cl.id] ?? [];
              return (
                <React.Fragment key={cl.id}>
                  <tr className="border-t border-slate-200">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          className="text-slate-500 hover:text-slate-800"
                          onClick={() => toggleExpanded(cl.id)}
                          title={isExpanded ? "Skrýt" : "Zobrazit"}
                        >
                          {isExpanded ? "▼" : "▶"}
                        </button>
                        <input
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                          value={cl.name}
                          onChange={(e) => onUpdate(cl.id, { name: e.target.value })}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{cl.values?.length ?? 0}</td>
                    <td className="px-3 py-2 text-right text-xs">
                      <button
                        className="rounded border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50"
                        onClick={() => onDelete(cl.id)}
                      >
                        Smazat
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-t border-slate-200 bg-slate-50/40">
                      <td className="px-3 py-2" colSpan={3}>
                        <div className="grid grid-cols-1 gap-2">
                          <textarea
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            rows={4}
                            value={formatEnumValues(cl.values ?? [])}
                            onChange={(e) => onUpdate(cl.id, { values: parseEnumValues(e.target.value) })}
                          />
                          <div className="rounded border border-slate-200 bg-white">
                            <button
                              className="flex w-full items-center justify-between px-2 py-1.5 text-left hover:bg-slate-50"
                              onClick={() => toggleUsageExpanded(cl.id)}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-slate-500">
                                  {usageExpanded.has(cl.id) ? "▼" : "▶"}
                                </span>
                                <span className="text-[11px] font-semibold uppercase text-slate-500">
                                  Použití v projektu
                                </span>
                              </div>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                                {clUsage.length} {clUsage.length === 1 ? "vlastnost" : clUsage.length >= 2 && clUsage.length <= 4 ? "vlastnosti" : "vlastností"}
                              </span>
                            </button>
                            {usageExpanded.has(cl.id) && (
                              <div className="border-t border-slate-200 px-2 py-2">
                                {clUsage.length === 0 ? (
                                  <div className="text-xs text-slate-500">Číselník není nikde přiřazen.</div>
                                ) : (
                                  <div className="max-h-48 overflow-auto">
                                    <div className="flex flex-wrap gap-1">
                                      {clUsage.map((u, idx) => (
                                        <span
                                          key={`${u.objectCode}:${u.propertyLabel ?? ""}:${idx}`}
                                          className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700"
                                          title={`${u.objectDescription ?? u.objectCode}${u.propertyLabel ? ` • ${u.propertyLabel}` : ""}`}
                                        >
                                          {u.objectCode}{u.propertyLabel ? ` • ${u.propertyLabel}` : ""}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Tip: hodnoty se normalizují (trim, prázdné se zahodí, duplicity se odstraní).
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
                  Zatím nemáte žádné číselníky.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

