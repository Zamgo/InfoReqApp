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
  /** Projekt (pro CUSTOM překlady z customTranslations) */
  project: Project | null;
}

const TranslationContext = createContext<TranslationContextValue>({
  translationMode: "OFF",
  showCzTranslations: false,
  czTranslationSource: "OFF",
  ifcSchemaVersion: "IFC4X3",
  project: null,
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
    const raw = (project?.czTranslationSource ?? "OFF") as string;
    const czSource = (raw === "AUTO" ? "OFF" : raw) as TranslationMode;
    return {
      translationMode: showCz ? czSource : (project?.translationMode ?? "OFF"),
      showCzTranslations: showCz,
      czTranslationSource: czSource,
      ifcSchemaVersion: normalizeIfcSchemaVersion(project?.ifcSchemaVersion),
      project: project ?? null,
    };
  }, [project]);
  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
}

export const useTranslation = () => useContext(TranslationContext);
