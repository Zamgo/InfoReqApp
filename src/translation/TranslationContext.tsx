import React, { createContext, useContext, useMemo } from "react";
import type { TranslationMode } from "../project/types";
import type { Project } from "../project/types";

interface TranslationContextValue {
  translationMode: TranslationMode;
}

const TranslationContext = createContext<TranslationContextValue>({
  translationMode: "OFF",
});

export function TranslationProvider({
  children,
  project,
}: {
  children: React.ReactNode;
  project: Project | null;
}) {
  const value = useMemo(
    () => ({
      translationMode: project?.translationMode ?? "OFF",
    }),
    [project?.translationMode]
  );
  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
}

export const useTranslation = () => useContext(TranslationContext);
