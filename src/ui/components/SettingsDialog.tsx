import React from "react";
import type { Project, TranslationMode } from "../../project/types";

interface Props {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Project>) => void;
}

const TRANSLATION_OPTIONS: Array<{ value: TranslationMode; label: string }> = [
  { value: "OFF", label: "Vypnuto" },
  { value: "BSDD", label: "bSDD – překlad z buildingSMART Data Dictionary" },
  { value: "AUTO", label: "Automatické – generativní překlad v aplikaci" },
];

export const SettingsDialog: React.FC<Props> = ({
  project,
  isOpen,
  onClose,
  onSave,
}) => {
  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  const mode = project?.translationMode ?? "OFF";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">Nastavení</h2>
          <p className="text-sm text-slate-500">Překlady IFC názvů pro zobrazení v aplikaci</p>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Režim překladů
            </label>
            <p className="mb-2 text-xs text-slate-500">
              Oficiální IFC názvy jsou vždy uloženy v datech. Překlad slouží jen pro zobrazení uživateli – pod oficiálním názvem kurzívou.
            </p>
            <div className="space-y-2">
              {TRANSLATION_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-start gap-2 cursor-pointer rounded border border-slate-200 p-3 hover:bg-slate-50 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50/50"
                >
                  <input
                    type="radio"
                    name="translationMode"
                    value={opt.value}
                    checked={mode === opt.value}
                    onChange={() => onSave({ translationMode: opt.value })}
                    className="mt-0.5 h-4 w-4 text-indigo-600"
                  />
                  <span className="text-sm text-slate-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button
            className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={onClose}
          >
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
};
