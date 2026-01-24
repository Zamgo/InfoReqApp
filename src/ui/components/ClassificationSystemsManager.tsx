import React, { useMemo, useState } from "react";
import type { ClassificationSystemEntry } from "../../project/types";
import { makeId } from "../../utils/id";

interface Props {
  systems: ClassificationSystemEntry[];
  usage?: Record<
    string,
    Array<{
      objectCode: string;
      objectDescription?: string;
    }>
  >;
  onAdd: (entry: ClassificationSystemEntry) => void;
  onUpdate: (id: string, updates: Partial<ClassificationSystemEntry>) => void;
  onDelete: (id: string) => void;
}

export const ClassificationSystemsManager: React.FC<Props> = ({
  systems,
  usage,
  onAdd,
  onUpdate,
  onDelete,
}) => {
  const [name, setName] = useState("");
  const [uri, setUri] = useState("");
  const [description, setDescription] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const sorted = useMemo(
    () => [...systems].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [systems],
  );

  const handleAdd = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onAdd({
      id: makeId(),
      name: trimmedName,
      uri: uri.trim() || undefined,
      description: description.trim() || undefined,
    });
    setName("");
    setUri("");
    setDescription("");
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <div className="text-sm font-semibold text-slate-800">Klasifikační systémy</div>
        <div className="text-xs text-slate-500">
          Správa předvolených klasifikačních systémů pro použití v požadavcích na klasifikaci.
        </div>
      </div>

      <div className="rounded border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 text-xs font-semibold uppercase text-slate-500">
          Nový klasifikační systém
        </div>
        <div className="grid grid-cols-1 gap-2">
          <input
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="Název (např. CCI-CZ, Uniclass 2015)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="URI (volitelné, např. https://example.com/classification)"
            value={uri}
            onChange={(e) => setUri(e.target.value)}
          />
          <textarea
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="Popis (volitelné)"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div>
            <button
              className="rounded bg-indigo-600 px-3 py-1 text-sm font-semibold text-white hover:bg-indigo-500"
              onClick={handleAdd}
              disabled={!name.trim()}
            >
              Přidat klasifikační systém
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Název</th>
              <th className="px-3 py-2">URI</th>
              <th className="px-3 py-2 text-right">Akce</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((sys) => {
              const isExpanded = expanded.has(sys.id);
              const sysUsage = usage?.[sys.id] ?? [];
              return (
                <React.Fragment key={sys.id}>
                  <tr className="border-t border-slate-200">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          className="text-slate-500 hover:text-slate-800"
                          onClick={() => toggleExpanded(sys.id)}
                          title={isExpanded ? "Skrýt" : "Zobrazit"}
                        >
                          {isExpanded ? "▼" : "▶"}
                        </button>
                        <input
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                          value={sys.name}
                          onChange={(e) => onUpdate(sys.id, { name: e.target.value })}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                        value={sys.uri ?? ""}
                        onChange={(e) => onUpdate(sys.id, { uri: e.target.value || undefined })}
                        placeholder="—"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      <button
                        className="rounded border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50"
                        onClick={() => onDelete(sys.id)}
                      >
                        Smazat
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-t border-slate-200 bg-slate-50/40">
                      <td className="px-3 py-2" colSpan={3}>
                        <div className="grid grid-cols-1 gap-2">
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
                          <div className="rounded border border-slate-200 bg-white p-2">
                            <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">
                              Použití v projektu
                            </div>
                            {sysUsage.length === 0 ? (
                              <div className="text-xs text-slate-500">
                                Klasifikační systém není nikde přiřazen.
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {sysUsage.slice(0, 30).map((u, idx) => (
                                  <span
                                    key={`${u.objectCode}:${idx}`}
                                    className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700"
                                    title={u.objectDescription ?? u.objectCode}
                                  >
                                    {u.objectCode}
                                  </span>
                                ))}
                                {sysUsage.length > 30 && (
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                                    +{sysUsage.length - 30} dalších
                                  </span>
                                )}
                              </div>
                            )}
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
                  Zatím nemáte žádné klasifikační systémy.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
