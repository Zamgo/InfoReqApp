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
          <p className="text-sm text-slate-500">Políčka překladů CZ a jejich automatické vyplňování</p>
        </div>

        <div className="px-6 py-4">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Zobrazit políčka překladů CZ
            </label>
            <p className="mb-3 text-xs text-slate-500">
              Zobrazit sloupec/políčko pro hodnotu v češtině vedle každé inkriminované hodnoty (entita, predefinedType, atributy, vlastnosti, součásti, materiál, klasifikace). Hodnoty lze upravovat ručně nebo nechat přeložit.
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={project?.showCzTranslations ?? false}
                onChange={(e) => onSave({ showCzTranslations: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-slate-700">Zobrazit políčka překladů CZ</span>
            </label>
            {(project?.showCzTranslations ?? false) && (
              <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
                <label className="block text-sm font-medium text-slate-700">Režim překladů</label>
                <p className="mb-2 text-xs text-slate-500">Zdroj pro automatické vyplnění prázdných políček CZ:</p>
                <div className="space-y-1">
                  {TRANSLATION_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="czTranslationSource"
                        value={opt.value}
                        checked={(project?.czTranslationSource ?? "OFF") === opt.value}
                        onChange={() => onSave({ czTranslationSource: opt.value })}
                        className="h-4 w-4 text-indigo-600"
                      />
                      <span className="text-sm text-slate-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
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
