/**
 * Datový model filtrů pro požadavky: strom AND/OR s atomickými podmínkami.
 * Určeno pro serializaci do JSON a budoucí ukládání uložených filtrů.
 */

import type { FilterableFieldId, FilterOperator } from "./requestFilterFields";

/** Jedna atomická podmínka (pole + operátor + hodnota). */
export interface RequestFilterCondition {
  field: FilterableFieldId;
  operator: FilterOperator;
  /** Pro IN/NOT_IN může být pole hodnot; pro BETWEEN [from, to]; jinak jedna hodnota. */
  value: string | number | string[] | number[];
}

/** Logický uzel: AND nebo OR skupina. */
export interface RequestFilterGroup {
  op: "AND" | "OR";
  children: RequestFilterNode[];
}

export type RequestFilterNode = RequestFilterCondition | RequestFilterGroup;

/** Kořen stromu filtru. Prázdný filtr = zobrazit vše. */
export type RequestFilter = RequestFilterGroup | null;

/** Konfigurace řazení: seznam polí a směrů. */
export interface RequestSortItem {
  field: string;
  direction: "ASC" | "DESC";
}

export type RequestSort = RequestSortItem[];

/** Validace: podmínka má správný tvar. */
export function isRequestFilterCondition(node: RequestFilterNode): node is RequestFilterCondition {
  return "field" in node && "operator" in node && "value" in node && !("op" in node);
}

export function isRequestFilterGroup(node: RequestFilterNode): node is RequestFilterGroup {
  return "op" in node && Array.isArray((node as RequestFilterGroup).children);
}

/** Prázdný uzel (skupina bez dětí) lze považovat za „žádný filtr“. */
export function isEmptyFilter(filter: RequestFilter): boolean {
  if (filter === null) return true;
  if (!isRequestFilterGroup(filter)) return false;
  if (filter.children.length === 0) return true;
  return filter.children.every((c) => isRequestFilterGroup(c) && isEmptyFilter(c));
}

/** Rekurzivní limit hloubky a počtu podmínek (bezpečnost). */
const MAX_DEPTH = 10;
const MAX_CONDITIONS = 50;

function countConditions(node: RequestFilterNode): number {
  if (isRequestFilterCondition(node)) return 1;
  return (node as RequestFilterGroup).children.reduce((sum, c) => sum + countConditions(c), 0);
}

function maxDepth(node: RequestFilterNode, current = 0): number {
  if (current > MAX_DEPTH) return current;
  if (isRequestFilterCondition(node)) return current;
  const children = (node as RequestFilterGroup).children;
  if (children.length === 0) return current;
  return Math.max(current, ...children.map((c) => maxDepth(c, current + 1)));
}

export function isFilterValid(filter: RequestFilter): { valid: boolean; error?: string } {
  if (filter === null || isEmptyFilter(filter)) return { valid: true };
  const conditions = countConditions(filter);
  if (conditions > MAX_CONDITIONS) {
    return { valid: false, error: `Příliš mnoho podmínek (max ${MAX_CONDITIONS})` };
  }
  if (maxDepth(filter) > MAX_DEPTH) {
    return { valid: false, error: `Příliš hluboká vnořenost (max ${MAX_DEPTH})` };
  }
  return { valid: true };
}
