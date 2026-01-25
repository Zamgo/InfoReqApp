import React, { useState, useMemo } from "react";
import type { Project } from "../../project/types";
import { getExportStatistics } from "../../export/excel";

interface Props {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onExport: (selectedSheets: SheetSelection) => void;
}

export interface SheetSelection {
  projekt: boolean;
  faze: boolean;
  ciselniky: boolean;
  klasifikacniSystemy: boolean;
  klasifikaceHierarchie: boolean;
  objekty: boolean;
  atributy: boolean;
  vlastnosti: boolean;
  relace: boolean;
  klasifikacePozadavky: boolean;
  materialy: boolean;
}

interface SheetInfo {
  key: keyof SheetSelection;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: "metadata" | "klasifikace" | "objekty" | "pozadavky";
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
    category: "metadata",
  },
  {
    key: "faze",
    name: "FÁZE",
    description: "Projektové fáze (DPZ, DPS, DPSP...)",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    category: "metadata",
    countKey: "phases",
  },
  {
    key: "ciselniky",
    name: "ČÍSELNÍKY",
    description: "Uživatelské číselníky (výčtové hodnoty)",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
    category: "metadata",
    countKey: "codeLists",
  },
  {
    key: "klasifikacniSystemy",
    name: "KLASIFIKAČNÍ_SYSTÉMY",
    description: "Registrované klasifikační systémy",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    category: "klasifikace",
    countKey: "classificationSystems",
  },
  {
    key: "klasifikaceHierarchie",
    name: "KLASIFIKACE_HIERARCHIE",
    description: "Stromová struktura klasifikací (zploštělá)",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
      </svg>
    ),
    category: "klasifikace",
  },
  {
    key: "objekty",
    name: "OBJEKTY",
    description: "Všechny objekty s IFC entitami",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    category: "objekty",
    countKey: "objects",
  },
  {
    key: "atributy",
    name: "ATRIBUTY",
    description: "Požadavky na IFC atributy",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
      </svg>
    ),
    category: "pozadavky",
    countKey: "attributes",
  },
  {
    key: "vlastnosti",
    name: "VLASTNOSTI",
    description: "Požadavky na PSET/QTO vlastnosti",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    category: "pozadavky",
    countKey: "properties",
  },
  {
    key: "relace",
    name: "RELACE",
    description: "Požadavky na IFC relace",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
    category: "pozadavky",
    countKey: "relations",
  },
  {
    key: "klasifikacePozadavky",
    name: "KLASIFIKACE_POŽADAVKY",
    description: "Požadavky na klasifikace objektů",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    ),
    category: "pozadavky",
    countKey: "classifications",
  },
  {
    key: "materialy",
    name: "MATERIÁLY",
    description: "Požadavky na materiály",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
    category: "pozadavky",
    countKey: "materials",
  },
];

const CATEGORY_LABELS: Record<SheetInfo["category"], string> = {
  metadata: "Metadata projektu",
  klasifikace: "Klasifikace",
  objekty: "Objekty",
  pozadavky: "Požadavky",
};

const CATEGORY_ORDER: SheetInfo["category"][] = ["metadata", "klasifikace", "objekty", "pozadavky"];

export const ExcelExportDialog: React.FC<Props> = ({
  project,
  isOpen,
  onClose,
  onExport,
}) => {
  const [selection, setSelection] = useState<SheetSelection>({
    projekt: true,
    faze: true,
    ciselniky: true,
    klasifikacniSystemy: true,
    klasifikaceHierarchie: true,
    objekty: true,
    atributy: true,
    vlastnosti: true,
    relace: true,
    klasifikacePozadavky: true,
    materialy: true,
  });

  const stats = useMemo(() => getExportStatistics(project), [project]);

  const selectedCount = useMemo(() => {
    return Object.values(selection).filter(Boolean).length;
  }, [selection]);

  const toggleSheet = (key: keyof SheetSelection) => {
    setSelection((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAll = () => {
    setSelection({
      projekt: true,
      faze: true,
      ciselniky: true,
      klasifikacniSystemy: true,
      klasifikaceHierarchie: true,
      objekty: true,
      atributy: true,
      vlastnosti: true,
      relace: true,
      klasifikacePozadavky: true,
      materialy: true,
    });
  };

  const deselectAll = () => {
    setSelection({
      projekt: false,
      faze: false,
      ciselniky: false,
      klasifikacniSystemy: false,
      klasifikaceHierarchie: false,
      objekty: false,
      atributy: false,
      vlastnosti: false,
      relace: false,
      klasifikacePozadavky: false,
      materialy: false,
    });
  };

  const selectCategory = (category: SheetInfo["category"]) => {
    const categorySheets = SHEETS.filter((s) => s.category === category);
    const allSelected = categorySheets.every((s) => selection[s.key]);
    
    setSelection((prev) => {
      const next = { ...prev };
      categorySheets.forEach((s) => {
        next[s.key] = !allSelected;
      });
      return next;
    });
  };

  const handleExport = () => {
    onExport(selection);
  };

  // Group sheets by category
  const groupedSheets = useMemo(() => {
    const groups: Record<SheetInfo["category"], SheetInfo[]> = {
      metadata: [],
      klasifikace: [],
      objekty: [],
      pozadavky: [],
    };
    SHEETS.forEach((sheet) => {
      groups[sheet.category].push(sheet);
    });
    return groups;
  }, []);

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
            Vyberte, které listy chcete zahrnout do exportu
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
          <div className="space-y-6">
            {CATEGORY_ORDER.map((category) => {
              const sheets = groupedSheets[category];
              const allSelected = sheets.every((s) => selection[s.key]);
              const someSelected = sheets.some((s) => selection[s.key]);

              return (
                <div key={category}>
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      className="flex items-center gap-2 group"
                      onClick={() => selectCategory(category)}
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center ${
                          allSelected
                            ? "bg-indigo-600 border-indigo-600"
                            : someSelected
                            ? "bg-indigo-100 border-indigo-400"
                            : "border-slate-300 group-hover:border-slate-400"
                        }`}
                      >
                        {allSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {someSelected && !allSelected && (
                          <div className="w-2 h-2 bg-indigo-500 rounded-sm" />
                        )}
                      </div>
                      <span className="text-sm font-semibold text-slate-700 group-hover:text-indigo-600">
                        {CATEGORY_LABELS[category]}
                      </span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-2 ml-6">
                    {sheets.map((sheet) => {
                      const count = sheet.countKey ? stats[sheet.countKey] : null;
                      const isSelected = selection[sheet.key];

                      return (
                        <label
                          key={sheet.key}
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
                          </div>
                        </label>
                      );
                    })}
                  </div>
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
      </div>
    </div>
  );
};
