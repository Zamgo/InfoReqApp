import React, { createContext, useContext, useEffect, useState } from "react";
import type { SchemaIndex } from "./types";

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

const SCHEMA_URL = "/ifc/schema_index_ifc4x3.json";

export const SchemaProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [index, setIndex] = useState<SchemaIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch(SCHEMA_URL);
      if (!res.ok) {
        throw new Error(
          `Schema index not found. Run "npm run build:schema" to generate it.`,
        );
      }
      const data = (await res.json()) as SchemaIndex;
      setIndex(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schema index");
      setIndex(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <SchemaContext.Provider value={{ index, loading, error, reload: load }}>
      {children}
    </SchemaContext.Provider>
  );
};

export const useSchema = () => useContext(SchemaContext);
