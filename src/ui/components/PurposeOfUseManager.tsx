import React, { useMemo, useState } from "react";
import type { PurposeOfUseEntry } from "../../project/types";
import { makeId } from "../../utils/id";

interface Props {
  entries: PurposeOfUseEntry[];
  onAdd: (entry: PurposeOfUseEntry) => void;
  onUpdate: (entry: PurposeOfUseEntry) => void;
  onDelete: (id: string) => void;
}

interface EditingEntry {
  id: string;
  name: string;
  description: string;
}

export const PurposeOfUseManager: React.FC<Props> = ({
  entries,
  onAdd,
  onUpdate,
  onDelete,
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<EditingEntry | null>(null);

  const sorted = useMemo(
    () => [...entries].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [entries]
  );

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd({
      id: makeId(),
      name: name.trim(),
      description: description.trim() || undefined,
    });
    setName("");
    setDescription("");
  };

  const handleStartEdit = (entry: PurposeOfUseEntry) => {
    setEditing({
      id: entry.id,
      name: entry.name,
      description: entry.description || "",
    });
  };

  const handleCancelEdit = () => {
    setEditing(null);
  };

  const handleSaveEdit = () => {
    if (!editing || !editing.name.trim()) return;
    onUpdate({
      id: editing.id,
      name: editing.name.trim(),
      description: editing.description.trim() || undefined,
    });
    setEditing(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex-shrink-0">
        <div className="text-sm font-semibold text-slate-800">Účely užití</div>
        <div className="text-xs text-slate-500">
          Číselník účelů užití pro přiřazení k požadavkům a filtrování exportu IDS
        </div>
      </div>
      <div className="flex-shrink-0 grid grid-cols-1 gap-2 md:grid-cols-2">
        <input
          className="rounded border border-slate-300 px-2 py-1 text-sm"
          placeholder="Název (např. Quantity take-off)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="rounded border border-slate-300 px-2 py-1 text-sm"
          placeholder="Popis (volitelně)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex-shrink-0">
        <button
          className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-500"
          onClick={handleAdd}
        >
          Přidat účel užití
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Název</th>
              <th className="px-3 py-2">Popis</th>
              <th className="px-3 py-2 text-right">Akce</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry) => (
              <tr key={entry.id} className="border-t border-slate-200">
                {editing?.id === entry.id ? (
                  <>
                    <td className="px-3 py-2">
                      <input
                        className="w-full rounded border border-red-300 px-2 py-1 text-sm font-semibold"
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        placeholder="Název"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-full rounded border border-red-300 px-2 py-1 text-sm"
                        value={editing.description}
                        onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                        placeholder="Popis"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                      <button
                        className="mr-2 rounded bg-red-600 px-2 py-1 text-white hover:bg-red-500"
                        onClick={handleSaveEdit}
                        title="Uložit změny"
                      >
                        Uložit
                      </button>
                      <button
                        className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
                        onClick={handleCancelEdit}
                        title="Zrušit úpravy"
                      >
                        Zrušit
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 font-semibold text-slate-800">{entry.name}</td>
                    <td className="px-3 py-2 text-slate-600">{entry.description}</td>
                    <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                      <button
                        className="mr-2 rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
                        onClick={() => handleStartEdit(entry)}
                        disabled={editing !== null}
                        title="Upravit"
                      >
                        Upravit
                      </button>
                      <button
                        className="rounded border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => onDelete(entry.id)}
                        disabled={editing !== null}
                        title="Smazat"
                      >
                        Smazat
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {!sorted.length && (
              <tr>
                <td className="px-3 py-3 text-sm text-slate-500" colSpan={3}>
                  Žádné účely užití nejsou definovány. Přidejte je a přiřaďte požadavkům.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
