/** Oddělovač více hodnot autorských nástrojů v mappedValues (např. více kategorií RVT) */
export const AUTHORING_VALUES_DELIMITER = "|";

export const parseAuthoringValues = (val: string | undefined): string[] =>
  (val ?? "")
    .split(AUTHORING_VALUES_DELIMITER)
    .map((s) => s.trim())
    .filter(Boolean);

export const joinAuthoringValues = (vals: string[]): string =>
  vals.filter((c) => c?.trim()).join(AUTHORING_VALUES_DELIMITER);
