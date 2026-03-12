import React, { createContext, useContext, useEffect, useState } from "react";
import type { DeprecatedIfcData, SchemaIndex } from "./types";
import { getDeprecatedIfcUrl, getSchemaIndexUrl, normalizeIfcSchemaVersion, type IfcSchemaVersion } from "./ifcVersionConfig";

interface SchemaContextValue {
  index: SchemaIndex | null;
  /** Množina názvů deprecated entit (bez ohledu na verzi – dle aktuální verze projektu). */
  deprecatedEntities: Set<string>;
  /** Mapování enum typu PredefinedType -> množina deprecated hodnot (UPPERCASE). */
  deprecatedPredefinedByEnum: Record<string, Set<string>>;
  /** Poznámky z CSV (replacement_or_note) – enum -> hodnota (UPPERCASE) -> text. */
  deprecatedPredefinedNotesByEnum: Record<string, Record<string, string>>;
  loading: boolean;
  error?: string;
  reload: () => void;
}

const SchemaContext = createContext<SchemaContextValue>({
  index: null,
  deprecatedEntities: new Set(),
  deprecatedPredefinedByEnum: {},
  deprecatedPredefinedNotesByEnum: {},
  loading: true,
  reload: () => undefined,
});

export interface SchemaProviderProps {
  children: React.ReactNode;
  /** Aktuální IFC verze pro načtení schema (např. z projektu). Výchozí IFC4X3. */
  version?: IfcSchemaVersion | string | null;
}

export const SchemaProvider: React.FC<SchemaProviderProps> = ({
  children,
  version,
}) => {
  const [index, setIndex] = useState<SchemaIndex | null>(null);
  const [deprecatedEntities, setDeprecatedEntities] = useState<Set<string>>(new Set());
  const [deprecatedPredefinedByEnum, setDeprecatedPredefinedByEnum] = useState<Record<string, Set<string>>>({});
  const [deprecatedPredefinedNotesByEnum, setDeprecatedPredefinedNotesByEnum] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const schemaVersion = normalizeIfcSchemaVersion(version ?? undefined);
  const schemaUrl = getSchemaIndexUrl(schemaVersion);
  const deprecatedUrl = getDeprecatedIfcUrl(schemaVersion);

  const load = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [schemaRes, deprecatedRes] = await Promise.all([
        fetch(schemaUrl),
        fetch(deprecatedUrl),
      ]);
      if (!schemaRes.ok) {
        throw new Error(
          `Schema index not found. Run "npm run build:schema" to generate it.`,
        );
      }
      const text = await schemaRes.text();
      let deprecatedSet = new Set<string>();
      let deprecatedEnumMap: Record<string, Set<string>> = {};
      let deprecatedNotesMap: Record<string, Record<string, string>> = {};
      if (deprecatedRes.ok) {
        try {
          const deprecatedData = (await deprecatedRes.json()) as DeprecatedIfcData;
          deprecatedSet = new Set(deprecatedData.deprecatedEntities ?? []);
          const enums = deprecatedData.deprecatedPredefinedTypesByEnum ?? {};
          deprecatedEnumMap = Object.fromEntries(
            Object.entries(enums).map(([k, vals]) => [k, new Set(vals ?? [])]),
          );
          deprecatedNotesMap = deprecatedData.deprecatedPredefinedNotesByEnum ?? {};
        } catch {
          // deprecated soubor chybí nebo je neplatný – používáme prázdnou množinu
        }
      }
      setDeprecatedEntities(deprecatedSet);
      setDeprecatedPredefinedByEnum(deprecatedEnumMap);
      setDeprecatedPredefinedNotesByEnum(deprecatedNotesMap);
      setTimeout(() => {
        try {
          const data = JSON.parse(text) as SchemaIndex;
          setIndex(data);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to parse schema index");
          setIndex(null);
        } finally {
          setLoading(false);
        }
      }, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schema index");
      setIndex(null);
      setDeprecatedEntities(new Set());
      setDeprecatedPredefinedByEnum({});
      setDeprecatedPredefinedNotesByEnum({});
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [schemaUrl, deprecatedUrl]);

  return (
    <SchemaContext.Provider value={{ index, deprecatedEntities, deprecatedPredefinedByEnum, deprecatedPredefinedNotesByEnum, loading, error, reload: load }}>
      {children}
    </SchemaContext.Provider>
  );
};

export const useSchema = () => useContext(SchemaContext);
