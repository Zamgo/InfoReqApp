import React, { useRef, useState } from "react";
import type { Project, TranslationMode } from "../../project/types";
import { useSchema } from "../../schema/SchemaProvider";
import { normalizeIfcSchemaVersion } from "../../schema/ifcVersionConfig";
import {
  downloadDefaultTranslationsExcel,
  fetchAndParseDefaultTranslations,
  getDefaultTranslationsUrl,
  parseTranslationsExcel,
} from "../../translation/translationsExcel";
import { fillDescriptionsBatch } from "../../translation/descriptionFiller";

interface Props {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Project>) => void;
}

const TRANSLATION_OPTIONS: Array<{ value: TranslationMode; label: string }> = [
  { value: "OFF", label: "Vypnuto" },
  { value: "BSDD", label: "bSDD – překlad z buildingSMART Data Dictionary" },
  { value: "CUSTOM", label: "Excel (výchozí z IFC/TRANSLATION) – políčka se automaticky vyplní" },
];

export const SettingsDialog: React.FC<Props> = ({
  project,
  isOpen,
  onClose,
  onSave,
}) => {
  const { index: schemaIndex } = useSchema();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loadingDefault, setLoadingDefault] = useState(false);
  const [fillingDescriptions, setFillingDescriptions] = useState(false);
  const [fillProgress, setFillProgress] = useState(0);
  const [fillTotal, setFillTotal] = useState(0);

  if (!isOpen) return null;

  const ifcVersion = project?.ifcSchemaVersion
    ? normalizeIfcSchemaVersion(project.ifcSchemaVersion)
    : null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  /** Stáhne celý Excel s překlady pro aktuální IFC verzi (z public/ifc/translations/). */
  const handleDownloadDefaultExcel = () => {
    downloadDefaultTranslationsExcel(ifcVersion);
  };

  /** Při výběru „Vlastní (Excel)“ načte výchozí překlady z public (podle IFC verze) a sloučí do projektu. */
  const loadDefaultAndSaveCUSTOM = async () => {
    setLoadingDefault(true);
    try {
      const url = getDefaultTranslationsUrl(ifcVersion);
      const parsed = await fetchAndParseDefaultTranslations(
        url,
        schemaIndex ?? null,
        ifcVersion
      );
      const existing = project?.customTranslations;
      const merged = {
        entities: { ...existing?.entities, ...parsed.entities },
        predefinedTypes: { ...existing?.predefinedTypes, ...parsed.predefinedTypes },
        entityDescriptionsCz: { ...existing?.entityDescriptionsCz, ...parsed.entityDescriptionsCz },
        entityDescriptionsEn: { ...existing?.entityDescriptionsEn, ...parsed.entityDescriptionsEn },
        predefinedTypeDescriptionsCz: { ...existing?.predefinedTypeDescriptionsCz, ...parsed.predefinedTypeDescriptionsCz },
        predefinedTypeDescriptionsEn: { ...existing?.predefinedTypeDescriptionsEn, ...parsed.predefinedTypeDescriptionsEn },
        propertySetNames: { ...existing?.propertySetNames, ...parsed.propertySetNames },
        propertyNames: { ...existing?.propertyNames, ...parsed.propertyNames },
      };
      onSave({ czTranslationSource: "CUSTOM", customTranslations: merged });
    } catch (err) {
      console.error("Načtení výchozích překladů:", err);
      onSave({ czTranslationSource: "CUSTOM" });
    } finally {
      setLoadingDefault(false);
    }
  };

  const handleSourceChange = (value: TranslationMode) => {
    if (value === "CUSTOM") {
      void loadDefaultAndSaveCUSTOM();
    } else {
      onSave({ czTranslationSource: value });
    }
  };

  const handleUploadTranslations = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const parsed = await parseTranslationsExcel(
        file,
        schemaIndex ?? null,
        ifcVersion
      );
      const existing = project?.customTranslations;
      const merged = {
        entities: { ...existing?.entities, ...parsed.entities },
        predefinedTypes: { ...existing?.predefinedTypes, ...parsed.predefinedTypes },
        entityDescriptionsCz: { ...existing?.entityDescriptionsCz, ...parsed.entityDescriptionsCz },
        entityDescriptionsEn: { ...existing?.entityDescriptionsEn, ...parsed.entityDescriptionsEn },
        predefinedTypeDescriptionsCz: { ...existing?.predefinedTypeDescriptionsCz, ...parsed.predefinedTypeDescriptionsCz },
        predefinedTypeDescriptionsEn: { ...existing?.predefinedTypeDescriptionsEn, ...parsed.predefinedTypeDescriptionsEn },
        propertySetNames: { ...existing?.propertySetNames, ...parsed.propertySetNames },
        propertyNames: { ...existing?.propertyNames, ...parsed.propertyNames },
      };
      onSave({ customTranslations: merged });
    } catch (err) {
      console.error("Import překladů:", err);
    }
  };

  const handleFillDescriptions = async () => {
    if (!project) return;
    setFillingDescriptions(true);
    setFillProgress(0);
    try {
      // Pokud zdroj je CUSTOM a nemáme slovníky, zajistíme jejich načtení a uložení
      let currentProject = project;
      if (project.czTranslationSource === "CUSTOM" && (!project.customTranslations || !project.customTranslations.entityDescriptionsCz)) {
        const { fetchAndParseDefaultTranslations, getDefaultTranslationsUrl } = await import("../../translation/translationsExcel");
        const url = getDefaultTranslationsUrl(ifcVersion);
        const parsed = await fetchAndParseDefaultTranslations(url, null, ifcVersion);
        const existing = project.customTranslations || { entities: {}, predefinedTypes: {} };
        const mergedTranslations = {
          ...existing,
          entityDescriptionsCz: parsed.entityDescriptionsCz,
          entityDescriptionsEn: parsed.entityDescriptionsEn,
          predefinedTypeDescriptionsCz: parsed.predefinedTypeDescriptionsCz,
          predefinedTypeDescriptionsEn: parsed.predefinedTypeDescriptionsEn,
          propertySetNames: { ...existing.propertySetNames, ...parsed.propertySetNames },
          propertyNames: { ...existing.propertyNames, ...parsed.propertyNames },
        };
        currentProject = { ...project, customTranslations: mergedTranslations };
        onSave({ customTranslations: mergedTranslations });
      }

      await fillDescriptionsBatch(
        currentProject,
        (updates) => {
          const nextObjects = { ...currentProject.objects };
          for (const [code, up] of Object.entries(updates)) {
            nextObjects[code] = { ...nextObjects[code], ...up };
          }
          onSave({ objects: nextObjects });
        },
        (curr, tot) => {
          setFillProgress(curr);
          setFillTotal(tot);
        }
      );
    } catch (err) {
      console.error("Doplnění popisů:", err);
    } finally {
      setFillingDescriptions(false);
    }
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

        <div className="px-6 py-4 space-y-4">
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
              className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
            />
            <span className="text-sm text-slate-700">Zobrazit políčka překladů CZ</span>
          </label>

          {(project?.showCzTranslations ?? false) && (
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Režim překladů názvů</label>
                <p className="mb-2 text-xs text-slate-500">Zdroj pro automatické vyplnění prázdných políček CZ:</p>
                <div className="space-y-1">
                  {TRANSLATION_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="czTranslationSource"
                        value={opt.value}
                        checked={(project?.czTranslationSource ?? "OFF") === opt.value}
                        onChange={() => handleSourceChange(opt.value)}
                        disabled={opt.value === "CUSTOM" && loadingDefault}
                        className="h-4 w-4 text-red-600"
                      />
                      <span className="text-sm text-slate-700">
                        {opt.label}
                        {opt.value === "CUSTOM" && loadingDefault ? " (načítám…)" : ""}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t border-slate-200">
                <label className="block text-sm font-medium text-slate-700">Doplňování popisů z IFC/TRANSLATION</label>
                <p className="mb-2 text-xs text-slate-500">
                  Zdroj popisů bude stejný jako u překladů ({project?.czTranslationSource === "BSDD" ? "bSDD" : project?.czTranslationSource === "CUSTOM" ? "Excel" : "vypnuto"}). Doplňuje se automaticky do pole "popis" při změně entity u objektu.
                </p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={project?.fillDescriptionEn ?? false}
                      onChange={(e) => onSave({ fillDescriptionEn: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                    />
                    <span className="text-sm text-slate-700">Doplnit anglický popis (Description) dle IFC</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={project?.fillDescriptionCz ?? false}
                      onChange={(e) => onSave({ fillDescriptionCz: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                    />
                    <span className="text-sm text-slate-700">Doplnit český překlad popisu</span>
                  </label>
                </div>
                
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleFillDescriptions}
                    disabled={fillingDescriptions || (!project?.fillDescriptionCz && !project?.fillDescriptionEn) || (!project?.czTranslationSource || project?.czTranslationSource === "OFF")}
                    className="self-start rounded bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {fillingDescriptions ? "Doplňuji popisy..." : "Doplnit popisy na všechny objekty nyní"}
                  </button>
                  {fillingDescriptions && fillTotal > 0 && (
                    <div className="text-xs text-slate-500">
                      Zpracováno {fillProgress} z {fillTotal} objektů...
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-200 space-y-2">
            <label className="block text-sm font-medium text-slate-700">Excel (IFC/TRANSLATION)</label>
            <p className="mb-2 text-xs text-slate-500">
              Výchozí překlad je z Excelu v IFC/TRANSLATION (podle verze IFC). Políčka překladů se jím automaticky vyplní. Chcete-li jiný překlad, stáhněte si tento Excel, upravte a nahrajte.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDownloadDefaultExcel}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                title="Stáhnout výchozí Excel (pro úpravu a nahrání vlastního překladu)"
              >
                Stáhnout Excel
              </button>
              <button
                type="button"
                onClick={handleUploadTranslations}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                title="Nahrát vlastní překlad (po úpravě staženého Excelu)"
              >
                Nahrát vlastní překlad
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />
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
