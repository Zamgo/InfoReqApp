import type { Project } from "../project/types";
import type { TranslationMode } from "../project/types";
import type { TranslationRequest, TranslationResult } from "./types";
import { translateBsdd } from "./translators/BsddTranslator";

/** Vrátí překlad z project.customTranslations (entity a predefinedType). Pro pset/qto/property zatím null. */
export function translateFromProject(
  project: Project | null | undefined,
  req: TranslationRequest
): TranslationResult {
  const ct = project?.customTranslations;
  if (!ct || !req.officialName?.trim()) return { translated: null, source: null };

  if (req.type === "entity") {
    const t = ct.entities[req.officialName.trim()];
    return t != null && t !== "" ? { translated: t, source: "custom" } : { translated: null, source: null };
  }

  if (req.type === "predefinedType" && req.context?.entity) {
    const key = `${req.context.entity}::${req.officialName.trim()}`;
    const t = ct.predefinedTypes[key];
    return t != null && t !== "" ? { translated: t, source: "custom" } : { translated: null, source: null };
  }

  return { translated: null, source: null };
}

export async function translate(
  mode: TranslationMode | undefined,
  req: TranslationRequest,
  project?: Project | null
): Promise<TranslationResult> {
  if (!mode || mode === "OFF") return { translated: null, source: null };
  if (mode === "CUSTOM") return Promise.resolve(translateFromProject(project, req));
  if (mode === "BSDD") {
    const r = await translateBsdd(req.type, req.officialName, req.context);
    return r;
  }
  return { translated: null, source: null };
}
