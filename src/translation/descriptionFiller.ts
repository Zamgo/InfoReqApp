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
export async function getObjectDescriptionAndTranslations(
  object: ProjectObject,
  options: FetchDescriptionOptions
): Promise<{ popis: string | null; ifcEntityCz?: string; predefinedTypeCz?: string }> {
  let { source, fillCz, fillEn, project } = options;
  if (!object.ifcEntity) return { popis: null };

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

  const ptMode = object.predefinedType.mode;
  const isPt = (ptMode === "ENUM" || ptMode === "USERDEFINED") && !!object.predefinedType.value;
  const entityName = object.ifcEntity;
  const ptValue = isPt ? object.predefinedType.value! : null;

  let entityCz: string | null = null;
  let entityEn: string | null = null;
  let ptCz: string | null = null;
  let ptEn: string | null = null;
  
  let entityTranslationCz: string | null = null;
  let ptTranslationCz: string | null = null;

  if (source === "CUSTOM") {
    const ct = project.customTranslations;
    if (ct) {
      entityTranslationCz = ct.entities?.[entityName] || null;
      if (fillCz) {
        entityCz = ct.entityDescriptionsCz?.[entityName] || null;
      }
      if (fillEn) entityEn = ct.entityDescriptionsEn?.[entityName] || null;

      if (ptValue) {
        const key = `${entityName}::${ptValue}`;
        ptTranslationCz = ct.predefinedTypes?.[key] || null;
        if (fillCz) {
          ptCz = ct.predefinedTypeDescriptionsCz?.[key] || null;
        }
        if (fillEn) ptEn = ct.predefinedTypeDescriptionsEn?.[key] || null;
      }
    }
  } else if (source === "BSDD") {
    const { translateBsdd } = await import("./translators/BsddTranslator");
    const { normalizeIfcSchemaVersion } = await import("../schema/ifcVersionConfig");
    const v = project.ifcSchemaVersion ? normalizeIfcSchemaVersion(project.ifcSchemaVersion) : "IFC4X3";
    
    const tEnt = await translateBsdd({ type: "entity", officialName: entityName }, v);
    if (tEnt.translated) entityTranslationCz = tEnt.translated;

    if (fillCz) {
      entityCz = await fetchBsddDescription("entity", entityName, "cs-CZ");
    }
    if (fillEn) entityEn = await fetchBsddDescription("entity", entityName, "en-US");

    if (ptValue) {
      const tPt = await translateBsdd({ type: "predefinedType", officialName: ptValue, context: { entity: entityName } }, v);
      if (tPt.translated) ptTranslationCz = tPt.translated;

      if (fillCz) {
        ptCz = await fetchBsddDescription("predefinedType", ptValue, "cs-CZ", { entity: entityName });
      }
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

  const popis = parts.length === 0 ? null : parts.join("\n\n---\n\n");
  
  return { 
    popis, 
    ifcEntityCz: entityTranslationCz || undefined, 
    predefinedTypeCz: ptTranslationCz || undefined 
  };
}

export async function getObjectDescription(
  object: ProjectObject,
  options: FetchDescriptionOptions
): Promise<string | null> {
  const { popis } = await getObjectDescriptionAndTranslations(object, options);
  return popis;
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
  const showCzTranslations = !!project.showCzTranslations;

  if (!source || source === "OFF") return;
  if (!fillCz && !fillEn && !showCzTranslations) return;

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
        const needsPopis = !obj.popis?.trim();
        const needsEntityCz = !obj.ifcEntityCz?.trim();
        const ptMode = obj.predefinedType.mode;
        const isPt = (ptMode === "ENUM" || ptMode === "USERDEFINED") && !!obj.predefinedType.value;
        const needsPtCz = isPt && !obj.predefinedTypeCz?.trim();
        
        if (needsPopis || (showCzTranslations && (needsEntityCz || needsPtCz))) {
          const res = await getObjectDescriptionAndTranslations(obj, options);
          const update: Partial<ProjectObject> = {};
          if (needsPopis && res.popis) update.popis = res.popis;
          if (showCzTranslations && needsEntityCz && res.ifcEntityCz) update.ifcEntityCz = res.ifcEntityCz;
          if (showCzTranslations && needsPtCz && res.predefinedTypeCz) update.predefinedTypeCz = res.predefinedTypeCz;
          
          if (Object.keys(update).length > 0) {
            updates[obj.code] = update;
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
