import React, { useState } from "react";
import type { IdsReimportChoice, IdsReimportConflict } from "../../ids/authoring";

export const IdsReimportConflictDialog: React.FC<{
  conflicts: IdsReimportConflict[];
  onConfirm: (choices: Record<string, IdsReimportChoice>) => void;
  onCancel: () => void;
}> = ({ conflicts, onConfirm, onCancel }) => {
  const [choices, setChoices] = useState<Record<string, IdsReimportChoice>>(
    Object.fromEntries(conflicts.map((conflict) => [conflict.sourceKey, "keep-local"])),
  );
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Konflikty opakovaného importu IDS</h2>
          <p className="mt-1 text-sm text-slate-600">
            Tyto specifikace byly změněny lokálně i v novém souboru. Zvolte výsledek pro každou z nich.
          </p>
        </div>
        <div className="flex-1 space-y-3 overflow-auto p-5">
          {conflicts.map((conflict) => (
            <div key={conflict.sourceKey} className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <div className="font-semibold text-slate-900">{conflict.name}</div>
              <div className="mt-1 text-[10px] text-slate-500">
                Zdroj: {conflict.sourceKey} · lokální {conflict.localHash} · import {conflict.incomingHash}
              </div>
              <select
                className="mt-2 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                value={choices[conflict.sourceKey]}
                onChange={(event) => setChoices((current) => ({
                  ...current,
                  [conflict.sourceKey]: event.target.value as IdsReimportChoice,
                }))}
              >
                <option value="keep-local">Zachovat lokální verzi</option>
                <option value="accept-import">Přijmout import (interní scope a metadata zůstanou)</option>
                <option value="duplicate-both">Duplikovat obě verze</option>
              </select>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button type="button" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm" onClick={onCancel}>
            Zrušit import
          </button>
          <button type="button" className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white" onClick={() => onConfirm(choices)}>
            Dokončit reimport
          </button>
        </div>
      </div>
    </div>
  );
};

