import React, { useMemo, useState } from "react";
import type { ClassificationSystemEntry } from "../../project/types";
import type {
  IdsCatalogResolution,
  IdsClassificationImportAnalysis,
  IdsClassificationSystemUsage,
} from "../../import/ids";

interface Props {
  fileName: string;
  analysis: IdsClassificationImportAnalysis;
  catalogs: ClassificationSystemEntry[];
  onConfirm: (resolutions: IdsCatalogResolution[]) => void;
  onCancel: () => void;
}

const isSelectableCatalog = (entry: ClassificationSystemEntry): boolean => {
  const kind = entry.systemKind ?? (entry.isIfcSystem ? "ifc" : "classification");
  return kind === "classification" && !entry.isIfcSystem && !entry.isAuxiliaryAspectSystem;
};

const statusLabel = (usage: IdsClassificationSystemUsage): string => {
  if (usage.status === "exact") return "Jednoznačně nalezen / propojen";
  if (usage.status === "probable") return "Pravděpodobná shoda podle názvu";
  return "Katalog nedostupný";
};

const statusClass = (usage: IdsClassificationSystemUsage): string => {
  if (usage.status === "exact") return "border-green-200 bg-green-50 text-green-800";
  if (usage.status === "probable") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-300 bg-slate-100 text-slate-700";
};

export const IdsImportDialog: React.FC<Props> = ({
  fileName,
  analysis,
  catalogs,
  onConfirm,
  onCancel,
}) => {
  const availableCatalogs = useMemo(
    () => catalogs.filter(isSelectableCatalog).sort((a, b) => a.name.localeCompare(b.name)),
    [catalogs],
  );
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      analysis.systems.map((usage) => [
        usage.key,
        usage.status === "exact" && usage.matchedEntryId
          ? `catalog:${usage.matchedEntryId}`
          : usage.status === "unavailable"
            ? "auxiliary"
            : "",
      ]),
    ),
  );

  const unresolved = analysis.systems.filter((usage) => !choices[usage.key]);
  const confirm = () => {
    if (unresolved.length > 0) return;
    const resolutions: IdsCatalogResolution[] = analysis.systems.map((usage) => {
      const choice = choices[usage.key];
      if (choice?.startsWith("catalog:")) {
        return {
          usageKey: usage.key,
          mode: "catalog",
          catalogEntryId: choice.slice("catalog:".length),
        };
      }
      return { usageKey: usage.key, mode: "auxiliary" };
    });
    onConfirm(resolutions);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Kontrola klasifikací před importem IDS</h2>
          <p className="mt-1 text-sm text-slate-600">
            Soubor <strong>{fileName}</strong> obsahuje {analysis.specificationCount} specifikací a{" "}
            {analysis.entityAlternativeCount} IFC alternativ.
          </p>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          <div className="mb-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            Klasifikační facety uvedené v jedné applicability zůstanou ve stejné AND skupině.
            Regexová pravidla se zachovají doslovně; bez katalogu se nebudou rozbalovat do smyšlených tříd.
          </div>

          {analysis.systems.length === 0 ? (
            <div className="rounded border border-slate-200 p-4 text-sm text-slate-600">
              IDS neobsahuje klasifikační facety. Import může pokračovat bez propojení katalogů.
            </div>
          ) : (
            <div className="space-y-3">
              {analysis.systems.map((usage) => {
                const matched = availableCatalogs.find((entry) => entry.id === usage.matchedEntryId);
                return (
                  <div key={usage.key} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-slate-900">{usage.name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {usage.facetCount} facetů · {usage.rules.length} zachovaných pravidel
                          {usage.uris.length > 0 ? ` · URI: ${usage.uris.join(", ")}` : " · bez URI"}
                        </div>
                      </div>
                      <span className={`rounded border px-2 py-1 text-xs font-medium ${statusClass(usage)}`}>
                        {statusLabel(usage)}
                      </span>
                    </div>

                    <div className="mt-2 rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                      Pravidla: {usage.rules.slice(0, 5).join(", ")}
                      {usage.rules.length > 5 ? ` … (+${usage.rules.length - 5})` : ""}
                    </div>

                    {usage.status === "exact" ? (
                      <div className="mt-2 text-sm text-green-800">
                        Propojeno s katalogem <strong>{matched?.name ?? usage.matchedEntryId}</strong>
                        {usage.matchReason === "uri" ? " podle URI." : " podle explicitního interního mapování."}
                      </div>
                    ) : (
                      <div className="mt-3">
                        {usage.status === "probable" && (
                          <p className="mb-2 text-xs text-amber-800">
                            Samotný název není jistý identifikátor. Potvrďte navržený katalog, vyberte jiný,
                            nebo použijte pomocnou strukturu.
                          </p>
                        )}
                        {usage.status === "unavailable" && (
                          <p className="mb-2 text-xs text-slate-600">
                            Pomocná struktura zachová aspekt a pravidla, ale konkrétní třídy, názvy a vztahy
                            rodič–potomek budou dostupné až po připojení skutečného katalogu.
                          </p>
                        )}
                        <select
                          value={choices[usage.key] ?? ""}
                          onChange={(event) =>
                            setChoices((current) => ({ ...current, [usage.key]: event.target.value }))
                          }
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                        >
                          {usage.status === "probable" && <option value="">Vyžaduje potvrzení…</option>}
                          <option value="auxiliary">Pokračovat s pomocnou strukturou aspektů</option>
                          {availableCatalogs.map((catalog) => (
                            <option key={catalog.id} value={`catalog:${catalog.id}`}>
                              Propojit s katalogem: {catalog.name}
                              {catalog.id === usage.matchedEntryId ? " (shoda názvu)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <span className="text-xs text-slate-600">
            {unresolved.length > 0
              ? `Je nutné potvrdit ${unresolved.length} pravděpodobných shod.`
              : "Volby jsou připravené k importu."}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              Zrušit import
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={unresolved.length > 0}
              className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Dokončit import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
