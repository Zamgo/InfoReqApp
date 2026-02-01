import type { TranslationMode } from "../project/types";
import type { TranslationRequest, TranslationResult } from "./types";
import { translateAuto } from "./translators/AutoTranslator";
import { translateBsdd } from "./translators/BsddTranslator";

export async function translate(
  mode: TranslationMode | undefined,
  req: TranslationRequest
): Promise<TranslationResult> {
  if (!mode || mode === "OFF") return { translated: null, source: null };
  if (mode === "AUTO") return translateAuto(req.type, req.officialName, req.context);
  if (mode === "BSDD") {
    const r = await translateBsdd(req.type, req.officialName, req.context);
    return r;
  }
  return { translated: null, source: null };
}
