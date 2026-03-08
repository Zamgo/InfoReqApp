import React, { useEffect, useState } from "react";
import { useTranslation } from "../../translation/TranslationContext";
import { translate } from "../../translation/TranslationService";
import { getBsddUrl } from "../../translation/getBsddUrl";
import type { TranslatableItemType } from "../../translation/types";

interface Props {
  type: TranslatableItemType;
  officialName: string;
  context?: { entity?: string; psetName?: string };
  /** Nepoužívat odkaz na bSDD (např. pro dropdown) */
  noLink?: boolean;
  /** Inline zobrazení místo bloku (např. v option) */
  inline?: boolean;
  /** Zobrazit jen překlad (oficiální název je jinde, např. v dropdownu) */
  translationOnly?: boolean;
}

/**
 * Zobrazí oficiální IFC název a pod ním kurzívou překlad.
 * Při režimu BSDD zobrazí odkaz na bSDD stránku; při CUSTOM jen překlad.
 */
export const TranslatedLabel: React.FC<Props> = ({
  type,
  officialName,
  context,
  noLink,
  inline,
  translationOnly = false,
}) => {
  const { translationMode, ifcSchemaVersion, project } = useTranslation();
  const [result, setResult] = useState<{ translated: string | null; source: "bsdd" | "auto" | "custom" | null }>({ translated: null, source: null });
  const [loading, setLoading] = useState(true);

  /** Když showCzTranslations je zapnuto: používáme editovatelná *_CZ políčka místo TranslatedLabel.
   *  Když je vypnuto: uživatel nechce žádné překlady. V obou případech TranslatedLabel nepřekládá. */
  const showTranslation = false;

  useEffect(() => {
    if (!showTranslation || !officialName) {
      setResult({ translated: null, source: null });
      setLoading(false);
      return;
    }
    setLoading(true);
    translate(translationMode, { type, officialName, context }, project)
      .then((r) => setResult({ translated: r.translated, source: r.source }))
      .catch(() => setResult({ translated: null, source: null }))
      .finally(() => setLoading(false));
  }, [translationMode, type, officialName, context?.entity, context?.psetName, showTranslation, project]);

  const { translated, source } = result;
  const bsddUrl = getBsddUrl(type, officialName, context, ifcSchemaVersion);
  /** Normalizace pro srovnání: camelCase→slova, podtržítka→mezery, lowercase. bSDD vrací anglické názvy jako fallback. */
  const normalizeForComparison = (s: string) => {
    const withSpaces = s
      .replace(/_/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .trim()
      .toLowerCase();
    return withSpaces.replace(/\s+/g, " ");
  };
  const isSameAsOfficial =
    translated != null && normalizeForComparison(translated) === normalizeForComparison(officialName);
  const isDerivedFromEntity =
    translated != null &&
    type === "entity" &&
    /^Ifc/.test(officialName) &&
    (() => {
      const withoutPrefix = officialName.replace(/^Ifc/i, "").trim();
      const camelToWords = withoutPrefix.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
      const derivedNorm = camelToWords.trim().toLowerCase().replace(/\s+/g, " ");
      const transNorm = translated.trim().toLowerCase().replace(/\s+/g, " ");
      return derivedNorm === transNorm;
    })();
  const notRealTranslation = isSameAsOfficial || isDerivedFromEntity;
  const hasCustomTranslation = source === "custom" && translated && !notRealTranslation;
  const hasBsddTranslation = source === "bsdd" && translated && !notRealTranslation;
  const noTranslationInBsdd = source === "bsdd" && (!translated || notRealTranslation);
  const showBsddLink = !noLink && bsddUrl && source !== "custom" && (hasBsddTranslation || noTranslationInBsdd);

  if (!officialName) return null;

  if (inline) {
    if (!showTranslation) return translationOnly ? null : <>{officialName}</>;
    if (loading) return translationOnly ? <span className="text-slate-400 italic">načítám…</span> : <>{officialName}</>;

    if (translationOnly) {
      const displayText = hasBsddTranslation || hasCustomTranslation ? translated : noTranslationInBsdd ? "Nepřeloženo v bSDD" : "";
      if (!displayText) return null;

      const content = <span className="italic text-slate-600">{displayText}</span>;
      if (showBsddLink) {
        return (
          <a
            href={bsddUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="italic text-red-600 hover:text-red-800 hover:underline"
            title="Otevřít v buildingSMART Data Dictionary"
          >
            {content}
          </a>
        );
      }
      return <>{content}</>;
    }
    const displayText = hasBsddTranslation || hasCustomTranslation ? translated : noTranslationInBsdd ? "Nepřeloženo v bSDD" : "";
    if (!displayText) return <>{officialName}</>;
    const content = (
      <>
        {officialName}
        <span className="ml-1 italic text-slate-500">— {displayText}</span>
      </>
    );
    if (showBsddLink) {
      return (
        <a href={bsddUrl} target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline">
          {content}
        </a>
      );
    }
    return <>{content}</>;
  }

  const blockDisplayText = hasBsddTranslation || hasCustomTranslation ? translated : noTranslationInBsdd ? "Nepřeloženo v bSDD" : null;
  const content = (
    <div className="flex flex-col">
      <span className="font-medium text-slate-800">{officialName}</span>
      {showTranslation && (loading ? (
        <span className="text-xs italic text-slate-400">načítám…</span>
      ) : blockDisplayText ? (
        <span className="text-sm italic text-slate-600">{blockDisplayText}</span>
      ) : null)}
    </div>
  );

  if (showBsddLink) {
    return (
      <a
        href={bsddUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-red-600 hover:text-red-800 hover:underline focus:outline-none focus:ring-1 focus:ring-red-500 rounded"
        title="Otevřít v buildingSMART Data Dictionary"
      >
        {content}
      </a>
    );
  }

  return content;
};
