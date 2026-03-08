import React, { createContext, useContext, useMemo } from "react";
import type { TranslationMode } from "../project/types";
import type { Project } from "../project/types";
import { normalizeIfcSchemaVersion } from "../schema/ifcVersionConfig";
import type { IfcSchemaVersion } from "../schema/ifcVersionConfig";

interface TranslationContextValue {
  translationMode: TranslationMode;
  /** Zobrazit políčka překladů CZ vedle hodnot v kartách požadavků */
  showCzTranslations: boolean;
  /** Zdroj pro automatický překlad prázdných políček CZ */
  czTranslationSource: TranslationMode;
  /** IFC verze projektu – pro odkazy na bSDD a dokumentaci */
  ifcSchemaVersion: IfcSchemaVersion;
}

const TranslationContext = createContext<TranslationContextValue>({
  translationMode: "OFF",
  showCzTranslations: false,
  czTranslationSource: "OFF",
  ifcSchemaVersion: "IFC4X3",
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
      ifcSchemaVersion: normalizeIfcSchemaVersion(project?.ifcSchemaVersion),
    };
  }, [project?.translationMode, project?.showCzTranslations, project?.czTranslationSource, project?.ifcSchemaVersion]);
  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
}

export const useTranslation = () => useContext(TranslationContext);
