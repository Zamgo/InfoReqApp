/**
 * Aplikace stromu filtrů na seznam skupin požadavků (RequirementItemGroup).
 * Čistá funkce – žádné API, data jsou v paměti (localStorage projekt).
 */

import type {
  AttributeRequirement,
  ClassificationRequirement,
  MaterialRequirement,
  PropertyRequirement,
  RelationRequirement,
} from "./types";
import type { RequirementItemGroup } from "./requirementFingerprint";
import type { FilterableFieldId } from "./requestFilterFields";
import {
  type RequestFilter,
  type RequestSort,
  type RequestFilterCondition,
  type RequestFilterNode,
  isRequestFilterCondition,
  isRequestFilterGroup,
  isEmptyFilter,
  isFilterValid,
} from "./requestFilterModel";
import { getFilterableField, isOperatorAllowed } from "./requestFilterFields";

/** Vrátí hodnotu pole pro danou skupinu (pro použití v podmínce). */
function getFieldValue(group: RequirementItemGroup, fieldId: FilterableFieldId): string | number | string[] | undefined {
  switch (fieldId) {
    case "kind":
      return group.kind;
    case "label":
      return group.label;
    case "objectCount":
      return group.objectCodes.length;
    case "objectCode":
      return group.objectCodes;
    default:
      break;
  }

  const items = group.representativeItems;
  const first = Array.isArray(items) ? items[0] : undefined;

  if (group.kind === "pset") {
    const props = items as PropertyRequirement[];
    switch (fieldId) {
      case "psetName":
        return (props[0]?.psetName ?? "").trim();
      case "propertyName":
        return props.map((p) => (p.propertyName ?? "").trim()).join(" ");
      case "propertyValue":
        return props.map((p) => (p.value ?? "").trim()).join(" ");
      case "propertyDataType":
        return (props[0]?.dataType ?? "").trim();
      case "propertyOccurrence":
        return (props[0]?.occurrence ?? "").trim() || undefined;
      case "propertySource":
        return props[0]?.source ?? "";
      default:
        return undefined;
    }
  }

  if (group.kind === "attribute" && first) {
    const a = first as AttributeRequirement;
    switch (fieldId) {
      case "attributeName":
        return (a.attribute ?? "").trim();
      case "attributeValue":
        return (a.value ?? "").trim();
      case "attributeDataType":
        return (a.dataType ?? "").trim();
      case "attributeOccurrence":
        return (a.occurrence ?? "").trim() || undefined;
      default:
        return undefined;
    }
  }

  if (group.kind === "classification" && first) {
    const c = first as ClassificationRequirement;
    switch (fieldId) {
      case "classificationSystem":
        return (c.system ?? "").trim();
      case "classificationIdentification":
        return (c.identification ?? "").trim();
      case "classificationValue":
        return (c.value ?? "").trim();
      case "classificationName":
        return (c.name ?? "").trim();
      case "classificationOccurrence":
        return (c.occurrence ?? "").trim() || undefined;
      default:
        return undefined;
    }
  }

  if (group.kind === "material" && first) {
    const m = first as MaterialRequirement;
    switch (fieldId) {
      case "materialCategory":
        return (m.category ?? "").trim();
      case "materialValue":
        return (m.value ?? "").trim();
      case "materialOccurrence":
        return (m.occurrence ?? "").trim() || undefined;
      default:
        return undefined;
    }
  }

  if (group.kind === "relation" && first) {
    const r = first as RelationRequirement;
    switch (fieldId) {
      case "relationType":
        return (r.relationType ?? "").trim();
      case "relationEntityType":
        return (r.entityType ?? "").trim();
      case "relationEntityPredefinedType":
        return (r.entityPredefinedType ?? "").trim();
      case "relationOccurrence":
        return (r.occurrence ?? "").trim() || undefined;
      default:
        return undefined;
    }
  }

  return undefined;
}

function normalizeForCompare(
  v: string | number | string[] | number[] | undefined,
): string | number | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return v.length ? String(v[0]) : undefined;
  if (typeof v === "number") return v;
  return String(v).trim().toLowerCase();
}

function normalizeArrayForCompare(
  v: string | number | string[] | number[] | undefined,
): string[] {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  return [String(v).trim().toLowerCase()];
}

/** Vyhodnotí jednu podmínku na jedné skupině. */
function evaluateCondition(group: RequirementItemGroup, cond: RequestFilterCondition): boolean {
  const def = getFilterableField(cond.field);
  if (!def || !isOperatorAllowed(cond.field, cond.operator)) return false;

  const raw = getFieldValue(group, cond.field);
  const value = normalizeForCompare(raw);
  const valueList = normalizeArrayForCompare(raw);

  const target = cond.value;
  const targetNorm =
    typeof target === "number"
      ? target
      : Array.isArray(target)
        ? target.map((t) => String(t).trim().toLowerCase())
        : String(target).trim().toLowerCase();
  const targetSingle = Array.isArray(targetNorm) ? targetNorm[0] : targetNorm;

  switch (cond.operator) {
    case "EQ":
      if (typeof value === "number" && typeof target === "number") return value === target;
      return value === targetSingle;
    case "NEQ":
      if (typeof value === "number" && typeof target === "number") return value !== target;
      return value !== targetSingle;
    case "IN":
      if (Array.isArray(target) && target.length === 0) return false;
      if (typeof value === "number") {
        const nums = Array.isArray(target) ? (target as number[]) : [target as number];
        return nums.includes(value);
      }
      if (valueList.length > 0) return valueList.some((v) => (targetNorm as string[]).includes(v));
      return value !== undefined && (targetNorm as string[]).includes(value as string);
    case "NOT_IN":
      if (Array.isArray(target) && target.length === 0) return true;
      if (typeof value === "number") {
        const nums = Array.isArray(target) ? (target as number[]) : [target as number];
        return !nums.includes(value);
      }
      return !valueList.some((v) => (targetNorm as string[]).includes(v));
    case "CONTAINS":
      if (value === undefined) return false;
      const searchStr = String(targetSingle ?? "").toLowerCase();
      if (valueList.length) return valueList.some((v) => v.includes(searchStr));
      return (value as string).includes(searchStr);
    case "STARTS_WITH":
      if (value === undefined) return false;
      const prefix = String(targetSingle ?? "").toLowerCase();
      if (valueList.length) return valueList.some((v) => v.startsWith(prefix));
      return (value as string).startsWith(prefix);
    case "ENDS_WITH":
      if (value === undefined) return false;
      const suffix = String(targetSingle ?? "").toLowerCase();
      if (valueList.length) return valueList.some((v) => v.endsWith(suffix));
      return (value as string).endsWith(suffix);
    case "GT":
      if (typeof value !== "number" || typeof target !== "number") return false;
      return value > target;
    case "GTE":
      if (typeof value !== "number" || typeof target !== "number") return false;
      return value >= target;
    case "LT":
      if (typeof value !== "number" || typeof target !== "number") return false;
      return value < target;
    case "LTE":
      if (typeof value !== "number" || typeof target !== "number") return false;
      return value <= target;
    case "BETWEEN":
      if (typeof value !== "number" || !Array.isArray(target) || target.length < 2) return false;
      const [from, to] = target as number[];
      return value >= from && value <= to;
    default:
      return false;
  }
}

function evaluateNode(group: RequirementItemGroup, node: RequestFilterNode): boolean {
  if (isRequestFilterCondition(node)) {
    return evaluateCondition(group, node);
  }
  if (isRequestFilterGroup(node)) {
    if (node.children.length === 0) return true;
    if (node.op === "AND") {
      return node.children.every((c) => evaluateNode(group, c));
    }
    return node.children.some((c) => evaluateNode(group, c));
  }
  return false;
}

/**
 * Filtruje skupiny požadavků podle stromu filtrů.
 * Pokud je filtr null nebo prázdný, vrací všechny skupiny.
 */
export function applyRequestFilter(
  groups: RequirementItemGroup[],
  filter: RequestFilter,
): RequirementItemGroup[] {
  const validation = isFilterValid(filter);
  if (!validation.valid) return groups;
  if (filter === null || isEmptyFilter(filter)) return groups;
  return groups.filter((g) => evaluateNode(g, filter));
}

export { isFilterValid };

import type { SortableFieldId } from "./requestFilterFields";

function getSortValue(group: RequirementItemGroup, fieldId: string): string | number {
  const v = getFieldValue(group, fieldId as FilterableFieldId);
  if (Array.isArray(v)) return v.length ? String(v[0]) : "";
  if (typeof v === "number") return v;
  return (v ?? "") as string;
}

/**
 * Seřadí skupiny podle konfigurace řazení.
 * Pole, která nejsou v SortableFieldId, se ignorují.
 */
export function applyRequestSort(
  groups: RequirementItemGroup[],
  sort: RequestSort,
): RequirementItemGroup[] {
  if (!sort || sort.length === 0) return [...groups];
  const sorted = [...groups];
  const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  sorted.sort((a, b) => {
    for (const item of sort) {
      const fieldId = item.field as SortableFieldId;
      const va = getSortValue(a, fieldId);
      const vb = getSortValue(b, fieldId);
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : collator.compare(String(va), String(vb));
      if (cmp !== 0) return item.direction === "DESC" ? -cmp : cmp;
    }
    return 0;
  });
  return sorted;
}
