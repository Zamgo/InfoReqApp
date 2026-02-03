import React, { useState, useMemo } from "react";
import type { Project } from "../../project/types";
import { getExportStatistics, validateExportData } from "../../export/excel";

interface Props {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onExport: (selectedSheets: SheetSelection) => void;
}

export interface SheetSelection {
  zdroj: boolean;
  /** Exportovat třídění autorských nástrojů jako další sloupce za primární klasifikací a IFC */
  zdrojExportAutorskeNastroje?: boolean;
  ciselniky: boolean;
  faze: boolean;
  projekt: boolean;
  /** Každá klasifikace jako samostatný list (Kód, Popis, Úroveň) */
  klasifikaceListy: boolean;
  /** List PRVKY – primární klasifikace s IFC, mapovanými systémy a popisem objektů */
  mapovani: boolean;
}

interface SheetInfo {
  key: keyof SheetSelection;
  name: string;
  description: string;
  icon: React.ReactNode;
  countKey?: keyof ReturnType<typeof getExportStatistics>;
}

const SHEETS: SheetInfo[] = [
  {
    key: "projekt",
    name: "PROJEKT",
    description: "Metadata projektu (název, autor, verze IFC)",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    key: "faze",
    name: "FÁZE",
    description: "Projektové fáze – pro pochopení sloupců fáze v POŽADAVKY",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    countKey: "phases",
  },
  {
    key: "mapovani",
    name: "PRVKY",
    description: "Jeden list – primární klasifikace s IFC, mapovanými systémy a popisem objektů",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
    countKey: "mapovani",
  },
  {
    key: "zdroj",
    name: "POŽADAVKY",
    description: "Hlavní tabulka všech požadavků – zdroj pro kontingenční tabulku a import",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
    countKey: "zdroj",
  },
  {
    key: "ciselniky",
    name: "ČÍSELNÍKY",
    description: "Uživatelské číselníky (výčtové hodnoty) – pro pochopení sloupce Číselník v POŽADAVKY",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
    countKey: "codeLists",
  },
  {
    key: "klasifikaceListy",
    name: "KLASIFIKACE (LISTY)",
    description: "Každá klasifikace jako samostatný list – Kód, Popis, Úroveň",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
      </svg>
    ),
    countKey: "klasifikaceListy",
  },
];

export const ExcelExportDialog: React.FC<Props> = ({
  project,
  isOpen,
  onClose,
  onExport,
}) => {
  const [selection, setSelection] = useState<SheetSelection>({
    zdroj: true,
    zdrojExportAutorskeNastroje: false,
    ciselniky: true,
    faze: true,
    projekt: true,
    klasifikaceListy: true,
    mapovani: false,
  });
  const [validationWarning, setValidationWarning] = useState<string[] | null>(null);

  const stats = useMemo(() => getExportStatistics(project), [project]);

  const selectedCount = useMemo(() => {
    return Object.values(selection).filter(Boolean).length;
  }, [selection]);

  const toggleSheet = (key: keyof SheetSelection) => {
    setSelection((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAll = () => {
    setSelection({
      zdroj: true,
      zdrojExportAutorskeNastroje: selection.zdrojExportAutorskeNastroje ?? false,
      ciselniky: true,
      faze: true,
      projekt: true,
      klasifikaceListy: true,
      mapovani: true,
    });
  };

  const deselectAll = () => {
    setSelection({
      zdroj: false,
      zdrojExportAutorskeNastroje: false,
      ciselniky: false,
      faze: false,
      projekt: false,
      klasifikaceListy: false,
      mapovani: false,
    });
  };

  const handleExport = () => {
    if (selection.zdroj) {
      const { valid, issues } = validateExportData(project);
      if (!valid && issues.length > 0) {
        setValidationWarning(issues);
        return;
      }
    }
    setValidationWarning(null);
    onExport(selection);
  };

  const handleConfirmExportDespiteWarnings = () => {
    setValidationWarning(null);
    onExport(selection);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">Export do Excelu</h2>
          <p className="text-sm text-slate-500">
            Hlavní list POŽADAVKY slouží pro kontingenční tabulku a import. Doplňkové listy pomáhají pochopit data.
          </p>
        </div>

        {/* Selection controls */}
        <div className="flex-shrink-0 border-b border-slate-200 px-6 py-3 flex items-center justify-between bg-slate-50">
          <div className="text-sm text-slate-600">
            Vybráno: <span className="font-semibold text-indigo-600">{selectedCount}</span> z {SHEETS.length} listů
          </div>
          <div className="flex gap-2">
            <button
              className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
              onClick={selectAll}
            >
              Vybrat vše
            </button>
            <button
              className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
              onClick={deselectAll}
            >
              Zrušit vše
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="space-y-2">
            {SHEETS.map((sheet) => {
              const count = sheet.countKey ? stats[sheet.countKey] : null;
              const isSelected = selection[sheet.key];

              return (
                <div key={sheet.key}>
                  <label
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-indigo-50 border-indigo-200"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSheet(sheet.key)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className={`flex-shrink-0 ${isSelected ? "text-indigo-600" : "text-slate-400"}`}>
                      {sheet.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${isSelected ? "text-indigo-700" : "text-slate-700"}`}>
                          {sheet.name}
                        </span>
                        {count !== null && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            isSelected ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-500"
                          }`}>
                            {count} {count === 1 ? "záznam" : count >= 2 && count <= 4 ? "záznamy" : "záznamů"}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{sheet.description}</p>
                      {((sheet.key === "zdroj" || sheet.key === "mapovani") && isSelected) && (
                        <label
                          className="flex items-center gap-2 mt-2 cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selection.zdrojExportAutorskeNastroje ?? false}
                            onChange={() =>
                              setSelection((prev) => ({
                                ...prev,
                                zdrojExportAutorskeNastroje: !prev.zdrojExportAutorskeNastroje,
                              }))
                            }
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-xs text-slate-600">
                            Exportovat klasifikaci dle autorských nástrojů
                          </span>
                        </label>
                      )}
                    </div>
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button
            className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={onClose}
          >
            Zrušit
          </button>
          <button
            className="rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            onClick={handleExport}
            disabled={selectedCount === 0}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Exportovat Excel
          </button>
        </div>

        {/* Validační varování */}
        {validationWarning && validationWarning.length > 0 && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
            onClick={() => setValidationWarning(null)}
          >
            <div
              className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl border border-amber-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-shrink-0 border-b border-amber-200 bg-amber-50 px-6 py-4">
                <h3 className="text-lg font-semibold text-amber-800">Některá data nejsou vyplněna</h3>
                <p className="text-sm text-amber-700 mt-1">
                  Export by mohl obsahovat neúplné údaje. Doporučujeme nejdříve doplnit chybějící hodnoty.
                </p>
              </div>
              <div className="flex-1 overflow-auto px-6 py-4 max-h-64">
                <ul className="list-disc list-inside space-y-1 text-sm text-slate-700">
                  {validationWarning.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </div>
              <div className="flex-shrink-0 flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
                <button
                  className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => setValidationWarning(null)}
                >
                  Zrušit
                </button>
                <button
                  className="rounded bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500"
                  onClick={handleConfirmExportDespiteWarnings}
                >
                  Exportovat i tak
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
