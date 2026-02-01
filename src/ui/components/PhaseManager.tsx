import React, { useMemo, useState } from "react";
import type { Phase } from "../../project/types";

interface Props {
  phases: Phase[];
  onAddPhase: (phase: Phase) => void;
  onUpdatePhase: (phase: Phase) => void;
  onDeletePhase: (id: string) => void;
}

interface EditingPhase {
  id: string;
  code: string;
  name: string;
  description: string;
}

export const PhaseManager: React.FC<Props> = ({
  phases,
  onAddPhase,
  onUpdatePhase,
  onDeletePhase,
}) => {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingPhase, setEditingPhase] = useState<EditingPhase | null>(null);

  const sortedPhases = useMemo(() => [...phases].sort((a, b) => a.code.localeCompare(b.code)), [phases]);

  const handleAdd = () => {
    if (!code.trim() || !name.trim()) return;
    onAddPhase({ id: code.trim(), code: code.trim(), name: name.trim(), description: description.trim() || undefined });
    setCode("");
    setName("");
    setDescription("");
  };

  const handleStartEdit = (phase: Phase) => {
    setEditingPhase({
      id: phase.id,
      code: phase.code,
      name: phase.name,
      description: phase.description || "",
    });
  };

  const handleCancelEdit = () => {
    setEditingPhase(null);
  };

  const handleSaveEdit = () => {
    if (!editingPhase || !editingPhase.code.trim() || !editingPhase.name.trim()) return;
    onUpdatePhase({
      id: editingPhase.id,
      code: editingPhase.code.trim(),
      name: editingPhase.name.trim(),
      description: editingPhase.description.trim() || undefined,
    });
    setEditingPhase(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex-shrink-0">
        <div className="text-sm font-semibold text-slate-800">Správa fází</div>
        <div className="text-xs text-slate-500">Přidejte nebo upravte fáze projektu</div>
      </div>
      <div className="flex-shrink-0 grid grid-cols-1 gap-2 md:grid-cols-3">
        <input
          className="rounded border border-slate-300 px-2 py-1 text-sm"
          placeholder="Kód (např. DPZ)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <input
          className="rounded border border-slate-300 px-2 py-1 text-sm"
          placeholder="Název"
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
          className="rounded bg-indigo-600 px-3 py-1 text-sm font-semibold text-white hover:bg-indigo-500"
          onClick={handleAdd}
        >
          Přidat fázi
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Kód</th>
              <th className="px-3 py-2">Název</th>
              <th className="px-3 py-2">Popis</th>
              <th className="px-3 py-2 text-right">Akce</th>
            </tr>
          </thead>
          <tbody>
            {sortedPhases.map((phase) => (
              <tr key={phase.id} className="border-t border-slate-200">
                {editingPhase?.id === phase.id ? (
                  <>
                    <td className="px-3 py-2">
                      <input
                        className="w-full rounded border border-indigo-300 px-2 py-1 text-sm font-semibold"
                        value={editingPhase.code}
                        onChange={(e) => setEditingPhase({ ...editingPhase, code: e.target.value })}
                        placeholder="Kód"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-full rounded border border-indigo-300 px-2 py-1 text-sm"
                        value={editingPhase.name}
                        onChange={(e) => setEditingPhase({ ...editingPhase, name: e.target.value })}
                        placeholder="Název"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-full rounded border border-indigo-300 px-2 py-1 text-sm"
                        value={editingPhase.description}
                        onChange={(e) => setEditingPhase({ ...editingPhase, description: e.target.value })}
                        placeholder="Popis"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                      <button
                        className="mr-2 rounded bg-indigo-600 px-2 py-1 text-white hover:bg-indigo-500"
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
                    <td className="px-3 py-2 font-semibold text-slate-800">{phase.code}</td>
                    <td className="px-3 py-2 text-slate-800">{phase.name}</td>
                    <td className="px-3 py-2 text-slate-600">{phase.description}</td>
                    <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                      <button
                        className="mr-2 rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
                        onClick={() => handleStartEdit(phase)}
                        disabled={editingPhase !== null}
                        title="Upravit fázi"
                      >
                        Upravit
                      </button>
                      <button
                        className="rounded border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => onDeletePhase(phase.id)}
                        disabled={editingPhase !== null || phases.length <= 1}
                        title={phases.length <= 1 ? "Musí zůstat alespoň jedna fáze" : "Smazat fázi"}
                      >
                        Smazat
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {!sortedPhases.length && (
              <tr>
                <td className="px-3 py-3 text-sm text-slate-500" colSpan={4}>
                  Žádné fáze nejsou definovány.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
