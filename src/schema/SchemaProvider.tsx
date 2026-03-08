import React, { createContext, useContext, useEffect, useState } from "react";
import type { SchemaIndex } from "./types";
import { getSchemaIndexUrl, normalizeIfcSchemaVersion, type IfcSchemaVersion } from "./ifcVersionConfig";

interface SchemaContextValue {
  index: SchemaIndex | null;
  loading: boolean;
  error?: string;
  reload: () => void;
}

const SchemaContext = createContext<SchemaContextValue>({
  index: null,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const schemaVersion = normalizeIfcSchemaVersion(version ?? undefined);
  const schemaUrl = getSchemaIndexUrl(schemaVersion);

  const load = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch(schemaUrl);
      if (!res.ok) {
        throw new Error(
          `Schema index not found. Run "npm run build:schema" to generate it.`,
        );
      }
      const text = await res.text();
      // Parsování velkého JSON odložíme do dalšího ticku, aby neblokovalo hlavní vlákno.
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
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [schemaUrl]);

  return (
    <SchemaContext.Provider value={{ index, loading, error, reload: load }}>
      {children}
    </SchemaContext.Provider>
  );
};

export const useSchema = () => useContext(SchemaContext);
