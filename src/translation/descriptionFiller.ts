import type { Project, ProjectObject, TranslationMode, CustomTranslations } from "../project/types";
import { fetchBsddDescription } from "./translators/BsddTranslator";

export interface FetchDescriptionOptions {
  source: TranslationMode;
  fillCz: boolean;
  fillEn: boolean;
  project: Project;
}

let defaultTranslationsPromise: Promise<CustomTranslations> | null = null;

/** 
 * Získá popis z nastaveného zdroje (CUSTOM/Excel nebo BSDD). 
 * Pokud je vyplněno CZ i EN, spojí je s novým řádkem.
 */
export async function getObjectDescription(
  object: ProjectObject,
  options: FetchDescriptionOptions
): Promise<string | null> {
  let { source, fillCz, fillEn, project } = options;
  if (!fillCz && !fillEn) return null;
  if (!object.ifcEntity) return null;

  // Fallback pro staré projekty, kde customTranslations ještě nemají načtené popisy
  if (source === "CUSTOM" && (!project.customTranslations || !project.customTranslations.entityDescriptionsCz)) {
    try {
      if (!defaultTranslationsPromise) {
        const fetchIt = async () => {
          const { fetchAndParseDefaultTranslations, getDefaultTranslationsUrl } = await import("./translationsExcel");
          const { normalizeIfcSchemaVersion } = await import("../schema/ifcVersionConfig");
          const ifcVersion = project.ifcSchemaVersion ? normalizeIfcSchemaVersion(project.ifcSchemaVersion) : null;
          const url = getDefaultTranslationsUrl(ifcVersion);
          return fetchAndParseDefaultTranslations(url, null, ifcVersion);
        };
        defaultTranslationsPromise = fetchIt();
      }
      const parsed = await defaultTranslationsPromise;
      const existing = project.customTranslations || { entities: {}, predefinedTypes: {} };
      project = {
        ...project,
        customTranslations: {
          ...existing,
          entityDescriptionsCz: parsed.entityDescriptionsCz,
          entityDescriptionsEn: parsed.entityDescriptionsEn,
          predefinedTypeDescriptionsCz: parsed.predefinedTypeDescriptionsCz,
          predefinedTypeDescriptionsEn: parsed.predefinedTypeDescriptionsEn,
        }
      };
    } catch (err) {
      console.error("Nepodařilo se stáhnout výchozí překlady pro popis:", err);
    }
  }

  const isPt = object.predefinedType.mode === "ENUM" && !!object.predefinedType.value && object.predefinedType.value !== "NOTDEFINED";
  const entityName = object.ifcEntity;
  const ptValue = isPt ? object.predefinedType.value! : null;

  let entityCz: string | null = null;
  let entityEn: string | null = null;
  let ptCz: string | null = null;
  let ptEn: string | null = null;

  if (source === "CUSTOM") {
    const ct = project.customTranslations;
    if (ct) {
      if (fillCz) entityCz = ct.entityDescriptionsCz?.[entityName] || null;
      if (fillEn) entityEn = ct.entityDescriptionsEn?.[entityName] || null;

      if (ptValue) {
        const key = `${entityName}::${ptValue}`;
        if (fillCz) ptCz = ct.predefinedTypeDescriptionsCz?.[key] || null;
        if (fillEn) ptEn = ct.predefinedTypeDescriptionsEn?.[key] || null;
      }
    }
  } else if (source === "BSDD") {
    if (fillCz) entityCz = await fetchBsddDescription("entity", entityName, "cs-CZ");
    if (fillEn) entityEn = await fetchBsddDescription("entity", entityName, "en-US");

    if (ptValue) {
      if (fillCz) ptCz = await fetchBsddDescription("predefinedType", ptValue, "cs-CZ", { entity: entityName });
      if (fillEn) ptEn = await fetchBsddDescription("predefinedType", ptValue, "en-US", { entity: entityName });
    }
  }

  const parts: string[] = [];

  const addPart = (ent: string | null, pt: string | null, lang: "CZ" | "EN") => {
    if (!ent && !pt) return;
    let text = "";
    if (ent && pt) {
      text = lang === "CZ" 
        ? `Entita podle IFC:\n${ent}\n\nPředdefinovaný typ podle IFC:\n${pt}` 
        : `Entity:\n${ent}\n\nPredefined Type:\n${pt}`;
    } else if (ent) {
      text = lang === "CZ" ? `Entita podle IFC:\n${ent}` : `Entity:\n${ent}`;
    } else if (pt) {
      text = lang === "CZ" ? `Předdefinovaný typ podle IFC:\n${pt}` : `Predefined Type:\n${pt}`;
    }
    parts.push(text);
  };

  addPart(entityEn, ptEn, "EN");

  // Nepřidávat CZ, pokud je identické s EN (např. bSDD vrátilo angličtinu pro češtinu)
  const isCzSameAsEn = entityCz === entityEn && ptCz === ptEn;
  if (!isCzSameAsEn) {
    addPart(entityCz, ptCz, "CZ");
  }

  if (parts.length === 0) return null;
  return parts.join("\n\n---\n\n");
}

/**
 * Zpracuje objekty po dávkách, aby se nezablokovalo UI (pro hromadné doplnění).
 */
export async function fillDescriptionsBatch(
  project: Project,
  updateObjects: (updates: Record<string, Partial<ProjectObject>>) => void,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const source = project.czTranslationSource;
  const fillCz = !!project.fillDescriptionCz;
  const fillEn = !!project.fillDescriptionEn;

  if (!source || source === "OFF") return;
  if (!fillCz && !fillEn) return;

  const objects = Object.values(project.objects);
  const total = objects.length;
  if (total === 0) return;

  const batchSize = 10;
  const updates: Record<string, Partial<ProjectObject>> = {};

  const options: FetchDescriptionOptions = {
    source: source as TranslationMode,
    fillCz,
    fillEn,
    project,
  };

  for (let i = 0; i < total; i += batchSize) {
    const batch = objects.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(async (obj) => {
        // Zkusit stáhnout jen pokud ještě nemá vyplněný popis
        if (!obj.popis?.trim()) {
          const desc = await getObjectDescription(obj, options);
          if (desc) {
            updates[obj.code] = { popis: desc };
          }
        }
      })
    );

    if (onProgress) {
      onProgress(Math.min(i + batchSize, total), total);
    }
    
    // Uvolnění vlákna
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  if (Object.keys(updates).length > 0) {
    updateObjects(updates);
  }
}
