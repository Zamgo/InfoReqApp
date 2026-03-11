/**
 * Rychlé filtry a pokročilý tvořič filtrů pro skupiny požadavků.
 * První úroveň = typ požadavku (kind), pak fulltext přes label, pak volitelné další podmínky.
 */

import React, { useCallback, useMemo, useState } from "react";
import type { RequirementItemKind } from "../../project/requirementFingerprint";
import type { RequestFilter, RequestFilterCondition } from "../../project/requestFilterModel";
import type { FilterableFieldId, FilterOperator } from "../../project/requestFilterFields";
import {
  getFilterableFieldsForKind,
  getFilterableField,
  getKindLabel,
  type FilterableFieldDef,
} from "../../project/requestFilterFields";
import { REQUIREMENT_KINDS } from "../../project/requestFilterFields";

const KIND_LABELS: Record<RequirementItemKind, string> = {
  pset: "Vlastnosti",
  attribute: "Atributy",
  classification: "Klasifikace",
  material: "Materiál",
  relation: "Součásti",
};

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  EQ: "je",
  NEQ: "není",
  IN: "je jedno z",
  NOT_IN: "není žádné z",
  CONTAINS: "obsahuje",
  STARTS_WITH: "začíná na",
  ENDS_WITH: "končí na",
  GT: ">",
  GTE: "≥",
  LT: "<",
  LTE: "≤",
  BETWEEN: "mezi",
};

export interface RequestFilterBarProps {
  /** Aktuální filtr (řízený zvenčí nebo vnitřní stav). */
  filter: RequestFilter;
  onFilterChange: (filter: RequestFilter) => void;
  /** Rychlý filtr typu – "all" nebo jeden konkrétní kind. */
  kindFilter: RequirementItemKind | "all";
  onKindFilterChange: (kind: RequirementItemKind | "all") => void;
  /** Rychlý fulltext přes label. */
  searchText: string;
  onSearchTextChange: (text: string) => void;
  /** Počet skupin po filtrování (pro zobrazení). */
  filteredCount?: number;
  totalCount?: number;
}

function buildFilterFromQuick(
  kindFilter: RequirementItemKind | "all",
  searchText: string,
  advancedConditions: RequestFilterCondition[],
): RequestFilter {
  const children: RequestFilterCondition[] = [];
  if (kindFilter !== "all") {
    children.push({ field: "kind", operator: "EQ", value: kindFilter });
  }
  if (searchText.trim()) {
    children.push({ field: "label", operator: "CONTAINS", value: searchText.trim() });
  }
  children.push(...advancedConditions);
  if (children.length === 0) return null;
  return { op: "AND", children };
}

/** Vrátí lidsky čitelný popis jedné podmínky. */
function conditionSummary(cond: RequestFilterCondition): string {
  const def = getFilterableField(cond.field);
  const fieldLabel = def?.label ?? cond.field;
  const opLabel = OPERATOR_LABELS[cond.operator] ?? cond.operator;
  const val =
    Array.isArray(cond.value) ? (cond.value as string[]).join(", ") : String(cond.value ?? "");
  if (cond.field === "kind" && typeof cond.value === "string") {
    return `${fieldLabel}: ${getKindLabel(cond.value as RequirementItemKind)}`;
  }
  return `${fieldLabel} ${opLabel} ${val}`;
}

export const RequestFilterBar: React.FC<RequestFilterBarProps> = ({
  onFilterChange,
  kindFilter,
  onKindFilterChange,
  searchText,
  onSearchTextChange,
  filteredCount,
  totalCount,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedConditions, setAdvancedConditions] = useState<RequestFilterCondition[]>([]);

  const syncFilterToParent = useCallback(
    (kind: RequirementItemKind | "all", search: string, conditions: RequestFilterCondition[]) => {
      const next = buildFilterFromQuick(kind, search, conditions);
      onFilterChange(next);
    },
    [onFilterChange],
  );

  const handleKindChange = useCallback(
    (k: RequirementItemKind | "all") => {
      onKindFilterChange(k);
      syncFilterToParent(k, searchText, advancedConditions);
    },
    [onKindFilterChange, searchText, advancedConditions, syncFilterToParent],
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      onSearchTextChange(text);
      syncFilterToParent(kindFilter, text, advancedConditions);
    },
    [kindFilter, advancedConditions, onSearchTextChange, syncFilterToParent],
  );

  const addCondition = useCallback(() => {
    const fields = getFilterableFieldsForKind(kindFilter === "all" ? "all" : kindFilter);
    const first = fields[0];
    if (!first) return;
    const newCond: RequestFilterCondition = {
      field: first.id,
      operator: first.operators[0],
      value: first.enumValues?.[0] ?? "",
    };
    const next = [...advancedConditions, newCond];
    setAdvancedConditions(next);
    syncFilterToParent(kindFilter, searchText, next);
  }, [kindFilter, searchText, advancedConditions, syncFilterToParent]);

  const updateCondition = useCallback(
    (index: number, patch: Partial<RequestFilterCondition>) => {
      const next = advancedConditions.map((c, i) => (i === index ? { ...c, ...patch } : c));
      setAdvancedConditions(next);
      syncFilterToParent(kindFilter, searchText, next);
    },
    [kindFilter, searchText, advancedConditions, syncFilterToParent],
  );

  const removeCondition = useCallback(
    (index: number) => {
      const next = advancedConditions.filter((_, i) => i !== index);
      setAdvancedConditions(next);
      syncFilterToParent(kindFilter, searchText, next);
    },
    [kindFilter, searchText, advancedConditions, syncFilterToParent],
  );

  const clearAll = useCallback(() => {
    onKindFilterChange("all");
    onSearchTextChange("");
    setAdvancedConditions([]);
    onFilterChange(null);
  }, [onKindFilterChange, onSearchTextChange, onFilterChange]);

  const hasActiveFilter = kindFilter !== "all" || searchText.trim() !== "" || advancedConditions.length > 0;

  const availableFields = useMemo(
    () => getFilterableFieldsForKind(kindFilter === "all" ? "all" : kindFilter),
    [kindFilter],
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Rychlé filtry: typ + fulltext */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-slate-600">Typ:</span>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={`rounded px-2 py-0.5 text-[11px] font-medium ${kindFilter === "all" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            onClick={() => handleKindChange("all")}
          >
            Vše
          </button>
          {REQUIREMENT_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={`rounded px-2 py-0.5 text-[11px] font-medium ${kindFilter === k ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              onClick={() => handleKindChange(k)}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={searchText}
          onChange={handleSearchChange}
          placeholder="Filtrovat (název, kód objektu)…"
          className="flex-1 min-w-[120px] max-w-[220px] rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 placeholder:text-slate-400"
        />
        {filteredCount !== undefined && totalCount !== undefined && (
          <span className="text-[11px] text-slate-500">
            {filteredCount} / {totalCount} skupin
          </span>
        )}
        {hasActiveFilter && (
          <button
            type="button"
            className="rounded px-2 py-0.5 text-[11px] font-medium text-red-600 hover:bg-red-50"
            onClick={clearAll}
          >
            Zrušit filtry
          </button>
        )}
      </div>

      {/* Pokročilé podmínky */}
      <div className="border-t border-slate-100 pt-2">
        <button
          type="button"
          className="flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-800"
          onClick={() => setAdvancedOpen((o) => !o)}
        >
          {advancedOpen ? "−" : "+"} Pokročilé filtry
        </button>
        {advancedOpen && (
          <div className="mt-2 flex flex-col gap-2">
            {advancedConditions.map((cond, idx) => (
              <AdvancedConditionRow
                key={idx}
                condition={cond}
                availableFields={availableFields}
                onChange={(patch) => updateCondition(idx, patch)}
                onRemove={() => removeCondition(idx)}
              />
            ))}
            <button
              type="button"
              className="self-start rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              onClick={addCondition}
            >
              + Přidat podmínku
            </button>
            {advancedConditions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {advancedConditions.map((c, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700"
                  >
                    {conditionSummary(c)}
                    <button
                      type="button"
                      className="text-slate-500 hover:text-red-600"
                      onClick={() => removeCondition(i)}
                      aria-label="Odebrat"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const AdvancedConditionRow: React.FC<{
  condition: RequestFilterCondition;
  availableFields: FilterableFieldDef[];
  onChange: (patch: Partial<RequestFilterCondition>) => void;
  onRemove: () => void;
}> = ({ condition, availableFields, onChange, onRemove }) => {
  const fieldDef = useMemo(
    () => availableFields.find((f) => f.id === condition.field) ?? availableFields[0],
    [availableFields, condition.field],
  );
  const operators = fieldDef?.operators ?? [];
  const isMulti = condition.operator === "IN" || condition.operator === "NOT_IN";
  const valueDisplay = Array.isArray(condition.value) ? (condition.value as string[]).join(", ") : String(condition.value ?? "");

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-800"
        value={condition.field}
        onChange={(e) => {
          const def = getFilterableField(e.target.value as FilterableFieldId);
          onChange({
            field: e.target.value as FilterableFieldId,
            operator: def?.operators[0] ?? "EQ",
            value: def?.enumValues?.[0] ?? "",
          });
        }}
      >
        {availableFields.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
      <select
        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-800"
        value={condition.operator}
        onChange={(e) => onChange({ operator: e.target.value as FilterOperator })}
      >
        {operators.map((op) => (
          <option key={op} value={op}>
            {OPERATOR_LABELS[op]}
          </option>
        ))}
      </select>
      {fieldDef?.enumValues ? (
        <select
          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-800"
          value={Array.isArray(condition.value) ? (condition.value[0] ?? "") : String(condition.value ?? "")}
          onChange={(e) => onChange({ value: e.target.value })}
        >
          {fieldDef.enumValues.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          className="min-w-[100px] rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-800"
          value={valueDisplay}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ value: isMulti ? v.split(",").map((s) => s.trim()) : v });
          }}
          placeholder={isMulti ? "hodnota1, hodnota2" : "hodnota"}
        />
      )}
      <button
        type="button"
        className="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
        onClick={onRemove}
        aria-label="Odebrat podmínku"
      >
        ×
      </button>
    </div>
  );
};
