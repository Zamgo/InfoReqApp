import type { Project } from "./types";
import { ensurePhaseList, ensureProjectPhases } from "./phases";

/**
 * Migruje projekt na aktuální strukturu doménového modelu.
 * Neprovádí žádné UI-specifické změny a nemění význam dat, pouze doplňuje
 * chybějící pole a čistí staré formáty (např. .txt v názvech klasifikací).
 */
export const migrateProject = (input: Project): Project => {
  // Základní migrace fází, seznamů a klasifikací
  const migrated = ensureProjectPhases({
    ...input,
    codeLists: input.codeLists ?? [],
    purposeOfUseEntries: input.purposeOfUseEntries ?? [],
    phases: ensurePhaseList(input.phases),
    classifications: (input.classifications ?? [
      {
        id: input.primaryClassificationId ?? input.classification?.hash ?? "primary",
        ifcClassification: { Name: input.classification?.sourceName ?? "Klasifikace" },
        nodes: input.classification?.nodes ?? [],
        sourceName: input.classification?.sourceName ?? "",
        hash: input.classification?.hash,
        isPrimary: true,
        createdAt: input.createdAt ?? new Date().toISOString(),
      },
    ]).map((c) => ({
      ...c,
      ifcClassification: {
        ...c.ifcClassification,
        Name: (c.ifcClassification.Name || "").replace(/\.txt$/i, ""),
      },
    })),
    primaryClassificationId:
      input.primaryClassificationId ??
      (input.classifications && input.classifications[0]?.id) ??
      "primary",
  });

  // Migrace classificationSystemEntries – odstranění .txt z názvů
  if (migrated.classificationSystemEntries) {
    migrated.classificationSystemEntries = migrated.classificationSystemEntries.map((e) => ({
      ...e,
      name: (e.name || "").replace(/\.txt$/i, ""),
    }));
  }

  // Najít primární classification system entry pro navázání objektů
  const primaryEntry = (migrated.classificationSystemEntries ?? []).find((e) => e.isPrimary);

  // Migrace objektů – čištění názvů systémů a doplnění systemEntryId u primární klasifikace
  if (migrated.objects) {
    Object.values(migrated.objects).forEach((obj) => {
      obj.requirements.classifications = obj.requirements.classifications.map((cls) => {
        // Odstranit .txt z názvu systému
        const cleanSystem = (cls.system || "").replace(/\.txt$/i, "");

        // Primární/readOnly klasifikace bez systemEntryId napojit na primární entry
        if ((cls.readOnly || cls.isApplicability) && !cls.systemEntryId && primaryEntry) {
          return {
            ...cls,
            system: cleanSystem || primaryEntry.name,
            systemEntryId: primaryEntry.id,
          };
        }

        return { ...cls, system: cleanSystem };
      });
    });
  }

  return migrated;
};

