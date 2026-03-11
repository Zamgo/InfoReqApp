/**
 * Registry filtrovatelných a řaditelných polí pro požadavky (skupiny požadavků).
 * Používá se pro validaci filtrů a pro UI výběr polí v pokročilém filtru.
 *
 * Kontext: Filtrujeme/seřazujeme „skupiny požadavků“ (RequirementItemGroup) v zobrazení
 * „Všechny požadavky“. Každá skupina má typ (kind), label, seznam objektů (objectCodes)
 * a reprezentativní položky (representativeItems) dle typu.
 */

import type { RequirementItemKind } from "./requirementFingerprint";

/** Stabilní identifikátory polí – používat v JSON filtru, ne názvy sloupců DB. */
export type FilterableFieldId =
  // První úroveň – typ požadavku (vždy dostupné)
  | "kind"
  // Skupinové / agregované
  | "label"
  | "objectCount"
  | "objectCode"
  // Vlastnosti (pset) – dostupné když kind === "pset"
  | "psetName"
  | "propertyName"
  | "propertyValue"
  | "propertyDataType"
  | "propertyOccurrence"
  | "propertySource"
  // Atributy – když kind === "attribute"
  | "attributeName"
  | "attributeValue"
  | "attributeDataType"
  | "attributeOccurrence"
  // Klasifikace – když kind === "classification"
  | "classificationSystem"
  | "classificationIdentification"
  | "classificationValue"
  | "classificationName"
  | "classificationOccurrence"
  // Materiál – když kind === "material"
  | "materialCategory"
  | "materialValue"
  | "materialOccurrence"
  // Součásti (relation) – když kind === "relation"
  | "relationType"
  | "relationEntityType"
  | "relationEntityPredefinedType"
  | "relationOccurrence";

/** Typ hodnoty pole (určuje povolené operátory). */
export type FieldValueType = "string" | "stringArray" | "number" | "enum";

/** Operátory podle typu pole. */
export type FilterOperator =
  | "EQ"
  | "NEQ"
  | "IN"
  | "NOT_IN"
  | "CONTAINS"
  | "STARTS_WITH"
  | "ENDS_WITH"
  | "GT"
  | "GTE"
  | "LT"
  | "LTE"
  | "BETWEEN";

export interface FilterableFieldDef {
  id: FilterableFieldId;
  /** Lidsky čitelný název (pro UI). */
  label: string;
  valueType: FieldValueType;
  /** Povolené operátory pro toto pole. */
  operators: FilterOperator[];
  /** Typ(y) požadavku, pro které je pole dostupné. Prázdné = všechna. */
  kinds: RequirementItemKind[] | "all";
  /** Předdefinované hodnoty pro enum (např. kind, occurrence). */
  enumValues?: string[];
}

/** Pole dostupná pro řazení (subset filtrovatelných + agregované). */
export type SortableFieldId =
  | "kind"
  | "label"
  | "objectCount"
  | "psetName"
  | "propertyName"
  | "attributeName"
  | "classificationSystem"
  | "classificationName"
  | "materialCategory"
  | "materialValue"
  | "relationType"
  | "relationEntityType";

export const REQUIREMENT_KINDS: RequirementItemKind[] = [
  "pset",
  "attribute",
  "classification",
  "material",
  "relation",
];

const KIND_LABELS: Record<RequirementItemKind, string> = {
  pset: "Vlastnosti",
  attribute: "Atributy",
  classification: "Klasifikace",
  material: "Materiál",
  relation: "Součásti",
};

const OCCURRENCE_VALUES = ["required", "prohibited", "optional"] as const;
const PROPERTY_SOURCE_VALUES = ["PSET", "QTO", "CUSTOM"] as const;

/** Registry všech filtrovatelných polí s metadaty. */
export const FILTERABLE_FIELDS: FilterableFieldDef[] = [
  {
    id: "kind",
    label: "Typ požadavku",
    valueType: "enum",
    operators: ["EQ", "IN", "NOT_IN"],
    kinds: "all",
    enumValues: REQUIREMENT_KINDS.map((k) => k),
  },
  {
    id: "label",
    label: "Název / popis skupiny",
    valueType: "string",
    operators: ["CONTAINS", "EQ", "STARTS_WITH", "ENDS_WITH"],
    kinds: "all",
  },
  {
    id: "objectCount",
    label: "Počet objektů",
    valueType: "number",
    operators: ["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "BETWEEN"],
    kinds: "all",
  },
  {
    id: "objectCode",
    label: "Kód objektu",
    valueType: "string",
    operators: ["CONTAINS", "EQ", "IN"],
    kinds: "all",
  },
  // Vlastnosti
  {
    id: "psetName",
    label: "Skupina (Pset/Qto)",
    valueType: "string",
    operators: ["EQ", "CONTAINS", "IN"],
    kinds: ["pset"],
  },
  {
    id: "propertyName",
    label: "Vlastnost",
    valueType: "string",
    operators: ["EQ", "CONTAINS", "STARTS_WITH"],
    kinds: ["pset"],
  },
  {
    id: "propertyValue",
    label: "Hodnota vlastnosti",
    valueType: "string",
    operators: ["EQ", "CONTAINS"],
    kinds: ["pset"],
  },
  {
    id: "propertyDataType",
    label: "Datový typ vlastnosti",
    valueType: "string",
    operators: ["EQ", "IN"],
    kinds: ["pset"],
  },
  {
    id: "propertyOccurrence",
    label: "Výskyt vlastnosti",
    valueType: "enum",
    operators: ["EQ", "IN"],
    kinds: ["pset"],
    enumValues: [...OCCURRENCE_VALUES],
  },
  {
    id: "propertySource",
    label: "Zdroj vlastnosti",
    valueType: "enum",
    operators: ["EQ", "IN"],
    kinds: ["pset"],
    enumValues: [...PROPERTY_SOURCE_VALUES],
  },
  // Atributy
  {
    id: "attributeName",
    label: "Atribut",
    valueType: "string",
    operators: ["EQ", "CONTAINS", "STARTS_WITH"],
    kinds: ["attribute"],
  },
  {
    id: "attributeValue",
    label: "Hodnota atributu",
    valueType: "string",
    operators: ["EQ", "CONTAINS"],
    kinds: ["attribute"],
  },
  {
    id: "attributeDataType",
    label: "Datový typ atributu",
    valueType: "string",
    operators: ["EQ", "IN"],
    kinds: ["attribute"],
  },
  {
    id: "attributeOccurrence",
    label: "Výskyt atributu",
    valueType: "enum",
    operators: ["EQ", "IN"],
    kinds: ["attribute"],
    enumValues: [...OCCURRENCE_VALUES],
  },
  // Klasifikace
  {
    id: "classificationSystem",
    label: "Klasifikační systém",
    valueType: "string",
    operators: ["EQ", "CONTAINS", "IN"],
    kinds: ["classification"],
  },
  {
    id: "classificationIdentification",
    label: "Identifikace",
    valueType: "string",
    operators: ["EQ", "CONTAINS"],
    kinds: ["classification"],
  },
  {
    id: "classificationValue",
    label: "Hodnota klasifikace",
    valueType: "string",
    operators: ["EQ", "CONTAINS"],
    kinds: ["classification"],
  },
  {
    id: "classificationName",
    label: "Název klasifikace",
    valueType: "string",
    operators: ["EQ", "CONTAINS"],
    kinds: ["classification"],
  },
  {
    id: "classificationOccurrence",
    label: "Výskyt klasifikace",
    valueType: "enum",
    operators: ["EQ", "IN"],
    kinds: ["classification"],
    enumValues: [...OCCURRENCE_VALUES],
  },
  // Materiál
  {
    id: "materialCategory",
    label: "Kategorie materiálu",
    valueType: "string",
    operators: ["EQ", "CONTAINS"],
    kinds: ["material"],
  },
  {
    id: "materialValue",
    label: "Hodnota materiálu",
    valueType: "string",
    operators: ["EQ", "CONTAINS"],
    kinds: ["material"],
  },
  {
    id: "materialOccurrence",
    label: "Výskyt materiálu",
    valueType: "enum",
    operators: ["EQ", "IN"],
    kinds: ["material"],
    enumValues: [...OCCURRENCE_VALUES],
  },
  // Součásti (relation)
  {
    id: "relationType",
    label: "Typ vztahu",
    valueType: "string",
    operators: ["EQ", "IN"],
    kinds: ["relation"],
  },
  {
    id: "relationEntityType",
    label: "Typ entity",
    valueType: "string",
    operators: ["EQ", "CONTAINS", "IN"],
    kinds: ["relation"],
  },
  {
    id: "relationEntityPredefinedType",
    label: "PredefinedType entity",
    valueType: "string",
    operators: ["EQ", "CONTAINS", "IN"],
    kinds: ["relation"],
  },
  {
    id: "relationOccurrence",
    label: "Výskyt vztahu",
    valueType: "enum",
    operators: ["EQ", "IN"],
    kinds: ["relation"],
    enumValues: [...OCCURRENCE_VALUES],
  },
];

/** Pole dostupná pro daný typ požadavku (kind). */
export function getFilterableFieldsForKind(kind: RequirementItemKind | "all"): FilterableFieldDef[] {
  if (kind === "all") {
    return FILTERABLE_FIELDS.filter((f) => f.kinds === "all" || f.id === "kind");
  }
  return FILTERABLE_FIELDS.filter(
    (f) => f.kinds === "all" || (Array.isArray(f.kinds) && f.kinds.includes(kind)),
  );
}

/** Lidsky čitelný název typu požadavku. */
export function getKindLabel(k: RequirementItemKind): string {
  return KIND_LABELS[k];
}

/** Definice pole podle id. */
export function getFilterableField(id: FilterableFieldId): FilterableFieldDef | undefined {
  return FILTERABLE_FIELDS.find((f) => f.id === id);
}

/** Ověření, zda je operátor povolen pro dané pole. */
export function isOperatorAllowed(fieldId: FilterableFieldId, operator: FilterOperator): boolean {
  const def = getFilterableField(fieldId);
  return def?.operators.includes(operator) ?? false;
}
