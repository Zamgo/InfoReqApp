export const ENUM_CODELIST_ID_KEY = "enumCodeListId";

export const parseEnumValues = (raw: string): string[] => {
  const parts = (raw ?? "")
    .split(/[\n,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
};

export const formatEnumValues = (values: string[]): string => (values ?? []).join("\n");

export const normalizeEnumText = (raw: string): string => formatEnumValues(parseEnumValues(raw));

