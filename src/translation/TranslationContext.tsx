import React, { createContext, useContext, useMemo } from "react";
import type { TranslationMode } from "../project/types";
import type { Project } from "../project/types";

interface TranslationContextValue {
  translationMode: TranslationMode;
  /** Zobrazit políčka překladů CZ vedle hodnot v kartách požadavků */
  showCzTranslations: boolean;
  /** Zdroj pro automatický překlad prázdných políček CZ */
  czTranslationSource: TranslationMode;
}

const TranslationContext = createContext<TranslationContextValue>({
  translationMode: "OFF",
  showCzTranslations: false,
  czTranslationSource: "OFF",
});

export function TranslationProvider({
  children,
  project,
}: {
  children: React.ReactNode;
  project: Project | null;
}) {
  const value = useMemo(() => {
    const showCz = project?.showCzTranslations ?? false;
    const czSource = project?.czTranslationSource ?? "OFF";
    return {
      translationMode: showCz ? czSource : (project?.translationMode ?? "OFF"),
      showCzTranslations: showCz,
      czTranslationSource: czSource,
    };
  }, [project?.translationMode, project?.showCzTranslations, project?.czTranslationSource]);
  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
}

export const useTranslation = () => useContext(TranslationContext);
