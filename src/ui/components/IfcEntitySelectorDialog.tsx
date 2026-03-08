import React, { useCallback, useMemo, useRef, useState } from "react";
import ExcelJS from "exceljs";
import type { ClassificationNode } from "../../classification/types";
import type { SchemaIndex } from "../../schema/types";
import { collectLeaves } from "../../classification/parser";
import { buildClassificationFromSchemaFiltered } from "../../classification/ifcTree";

interface Props {
  schemaIndex: SchemaIndex;
  currentNodes: ClassificationNode[];
  onSave: (nodes: ClassificationNode[]) => void;
  onClose: () => void;
}

/** Parsed položka z vloženého textu nebo souboru */
interface ParsedIfcItem {
  raw: string;
  entity: string;
  predefinedType?: string;
  code: string;
  valid: boolean;
  error?: string;
}

/** Parsuje řádek textu na entity + predefinedType. Formáty: "IfcWall", "IfcWall::SOLIDWALL", "IfcWall\tSOLIDWALL" */
function parseLine(line: string): { entity: string; predefinedType?: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.includes("::")) {
    const [entity, pt] = trimmed.split("::").map((s) => s.trim());
    if (entity) return { entity, predefinedType: pt || undefined };
  }
  if (trimmed.includes("\t")) {
    const [entity, pt] = trimmed.split("\t").map((s) => s.trim());
    if (entity) return { entity, predefinedType: pt || undefined };
  }
  return { entity: trimmed, predefinedType: undefined };
}

/** Validuje položku proti IFC schématu a vrátí kód pro výběr */
function validateAndGetCode(
  schemaIndex: SchemaIndex,
  entity: string,
  predefinedType?: string,
): { code: string; valid: boolean; error?: string } {
  const ent = schemaIndex.entities[entity];
  if (!ent) {
    return { code: "", valid: false, error: `Entita "${entity}" není v IFC schématu` };
  }
  const types = ent.predefinedTypeValues ?? [];
  if (types.length === 0) {
    if (predefinedType) {
      return { code: "", valid: false, error: `"${entity}" nemá PredefinedType` };
    }
    return { code: entity, valid: true };
  }
  if (!predefinedType) {
    return { code: `${entity}::NOTDEFINED`, valid: true };
  }
  if (predefinedType === "NOTDEFINED" || predefinedType.toUpperCase() === "NOTDEFINED") {
    return { code: `${entity}::NOTDEFINED`, valid: true };
  }
  if (types.includes(predefinedType)) {
    return { code: `${entity}::${predefinedType}`, valid: true };
  }
  return {
    code: "",
    valid: false,
    error: `PredefinedType "${predefinedType}" není platný pro "${entity}" (platné: ${types.slice(0, 5).join(", ")}${types.length > 5 ? ", ..." : ""})`,
  };
}

/** Parsuje text na seznam položek s validací */
function parseAndValidate(schemaIndex: SchemaIndex, text: string): ParsedIfcItem[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const result: ParsedIfcItem[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const { code, valid, error } = validateAndGetCode(
      schemaIndex,
      parsed.entity,
      parsed.predefinedType,
    );
    if (code && seen.has(code)) continue;
    if (code) seen.add(code);
    result.push({
      raw: line.trim(),
      entity: parsed.entity,
      predefinedType: parsed.predefinedType,
      code: code || `${parsed.entity}${parsed.predefinedType ? `::${parsed.predefinedType}` : ""}`,
      valid,
      error,
    });
  }
  return result;
}

/** Načte XLSX nebo TXT soubor – 1. sloupec IFC Entita, 2. sloupec IFC PredefinedType */
async function parseIfcFile(file: File): Promise<string> {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".xlsx")) {
    const buf = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("Soubor neobsahuje žádný list.");
    const lines: string[] = [];
    let startRow = 1;
    const firstRow = ws.getRow(1);
    const c1 = (firstRow.getCell(1).value?.toString() ?? "").trim().toLowerCase();
    if (c1 === "ifc entita" || c1 === "ifcentita" || c1 === "entity") startRow = 2;
    for (let r = startRow; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const entity = (row.getCell(1).value?.toString() ?? "").trim();
      const predefined = (row.getCell(2).value?.toString() ?? "").trim();
      if (!entity) continue;
      if (predefined) {
        lines.push(`${entity}\t${predefined}`);
      } else {
        lines.push(entity);
      }
    }
    return lines.join("\n");
  }
  const text = await file.text();
  return text;
}

export const IfcEntitySelectorDialog: React.FC<Props> = ({
  schemaIndex,
  currentNodes,
  onSave,
  onClose,
}) => {
  const entityNames = useMemo(
    () => schemaIndex.entityListOrder ?? Object.keys(schemaIndex.entities).sort(),
    [schemaIndex],
  );

  const getEntityDepth = useCallback((name: string): number => {
    const entities = schemaIndex.entities;
    let depth = 0;
    let current: string | undefined = name;
    while (current) {
      const parent: string | undefined = entities[current]?.parent;
      if (!parent) break;
      depth += 1;
      current = parent;
    }
    return depth;
  }, [schemaIndex.entities]);

  const initialSelected = useMemo(() => {
    const leaves = collectLeaves(currentNodes);
    return new Set(leaves.map((n) => n.code));
  }, [currentNodes]);

  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(initialSelected);
  const [search, setSearch] = useState("");
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set(entityNames.slice(0, 20)));
  const [pasteText, setPasteText] = useState("");
  const [parsedItems, setParsedItems] = useState<ParsedIfcItem[] | null>(null);
  const [showPasteSection, setShowPasteSection] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleCode = useCallback((code: string, checked: boolean) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (checked) next.add(code);
      else next.delete(code);
      return next;
    });
  }, []);

  const getEntityCodes = useCallback(
    (entityName: string): string[] => {
      const entity = schemaIndex.entities[entityName];
      if (!entity || entity.abstract) return [];
      const types = entity.predefinedTypeValues ?? [];
      if (types.length === 0) return [entityName];
      return [`${entityName}::NOTDEFINED`, ...types.map((pt) => `${entityName}::${pt}`)];
    },
    [schemaIndex],
  );

  const isEntityFullySelected = useCallback(
    (entityName: string): boolean => {
      const codes = getEntityCodes(entityName);
      return codes.length > 0 && codes.every((c) => selectedCodes.has(c));
    },
    [getEntityCodes, selectedCodes],
  );

  const isEntityPartiallySelected = useCallback(
    (entityName: string): boolean => {
      const codes = getEntityCodes(entityName);
      return codes.some((c) => selectedCodes.has(c));
    },
    [getEntityCodes, selectedCodes],
  );

  const toggleEntity = useCallback(
    (entityName: string, checked: boolean) => {
      const codes = getEntityCodes(entityName);
      setSelectedCodes((prev) => {
        const next = new Set(prev);
        codes.forEach((c) => (checked ? next.add(c) : next.delete(c)));
        return next;
      });
    },
    [getEntityCodes],
  );

  const selectAll = useCallback(() => {
    const next = new Set<string>();
    entityNames.forEach((entityName) => {
      getEntityCodes(entityName).forEach((c) => next.add(c));
    });
    setSelectedCodes(next);
  }, [entityNames, getEntityCodes]);

  const selectNone = useCallback(() => {
    setSelectedCodes(new Set());
  }, []);

  const filteredEntityNames = useMemo(() => {
    if (!search.trim()) return entityNames;
    const q = search.trim().toLowerCase();
    return entityNames.filter((name) => name.toLowerCase().includes(q));
  }, [entityNames, search]);

  const toggleExpanded = useCallback((entityName: string) => {
    setExpandedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(entityName)) next.delete(entityName);
      else next.add(entityName);
      return next;
    });
  }, []);

  const handlePasteOrImport = useCallback(() => {
    setParseError(null);
    const items = parseAndValidate(schemaIndex, pasteText);
    setParsedItems(items);
  }, [schemaIndex, pasteText]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setParseError(null);
      try {
        const text = await parseIfcFile(file);
        setPasteText(text);
        const items = parseAndValidate(schemaIndex, text);
        setParsedItems(items);
        setShowPasteSection(true);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : "Chyba při načítání souboru");
      }
    },
    [schemaIndex],
  );

  const applyParsedSelection = useCallback(() => {
    if (!parsedItems) return;
    const validCodes = parsedItems.filter((p) => p.valid).map((p) => p.code);
    if (validCodes.length === 0) return;
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      validCodes.forEach((c) => next.add(c));
      return next;
    });
    setParsedItems(null);
    setPasteText("");
  }, [parsedItems]);

  const clearPasteSection = useCallback(() => {
    setPasteText("");
    setParsedItems(null);
    setParseError(null);
  }, []);

  const hasInvalidParsed = parsedItems != null && parsedItems.some((p) => !p.valid);
  const canApplyParsed = parsedItems != null && parsedItems.some((p) => p.valid) && !hasInvalidParsed;

  const handleSave = useCallback(() => {
    const data = buildClassificationFromSchemaFiltered(schemaIndex, selectedCodes);
    onSave(data.nodes);
    onClose();
  }, [schemaIndex, selectedCodes, onSave, onClose]);

  const selectedCount = selectedCodes.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="flex-shrink-0 border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-800">
            Výběr IFC tříd a PredefinedType pro projekt
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Zaškrtněte entity a typy, které chcete zahrnout do hierarchie. V projektu pak půjde u objektů vybírat jen tyto.
          </p>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2">
          <input
            type="text"
            placeholder="Filtrovat entity..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[160px] rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
            onClick={selectAll}
          >
            Vybrat vše
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
            onClick={selectNone}
          >
            Zrušit vše
          </button>
          <span className="text-xs text-slate-500">
            Vybráno: {selectedCount} položek
          </span>
        </div>

        <div className="flex-shrink-0 border-b border-slate-200 px-4 py-2">
          <button
            type="button"
            className="text-sm font-medium text-slate-700 hover:text-slate-900"
            onClick={() => setShowPasteSection((v) => !v)}
          >
            {showPasteSection ? "▼" : "▶"} Vložit ze schránky (Ctrl+V) nebo souboru
          </button>
          {showPasteSection && (
            <div className="mt-2 space-y-2">
              <div className="flex gap-2">
                <textarea
                  placeholder="Vložte seznam IFC entit (Ctrl+V, jeden na řádek):&#10;IfcWall&#10;IfcWall::SOLIDWALL&#10;nebo: IfcEntity[TAB]PredefinedType"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData?.getData("text") ?? "";
                    if (pasted) {
                      e.preventDefault();
                      const newText = pasteText + (pasteText && !pasteText.endsWith("\n") ? "\n" : "") + pasted;
                      setPasteText(newText);
                      setParsedItems(parseAndValidate(schemaIndex, newText));
                      setShowPasteSection(true);
                    }
                  }}
                  className="min-h-[80px] flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm font-mono"
                  rows={3}
                />
                <div className="flex flex-col gap-1">
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.xlsx"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <span>XLSX / TXT</span>
                  </label>
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
                    onClick={handlePasteOrImport}
                  >
                    Parsovat
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                1. sloupec: IFC Entita, 2. sloupec: IFC PredefinedType. Formáty: řádek „IfcWall“, „IfcWall::SOLIDWALL“ nebo tabulátor „IfcWall\tSOLIDWALL“.
              </p>
              {parseError && (
                <p className="text-sm text-red-600">{parseError}</p>
              )}
              {parsedItems != null && parsedItems.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">
                      Parsováno: {parsedItems.filter((p) => p.valid).length} platných
                      {hasInvalidParsed && (
                        <span className="ml-1 text-red-600">
                          , {parsedItems.filter((p) => !p.valid).length} neplatných (nesedí s IFC schématem)
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={applyParsedSelection}
                      disabled={!canApplyParsed}
                      title={hasInvalidParsed ? "Nejdříve opravte nebo odstraňte neplatné položky" : undefined}
                    >
                      Aplikovat výběr
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                      onClick={clearPasteSection}
                    >
                      Zrušit
                    </button>
                  </div>
                  <div className="max-h-32 overflow-auto rounded border border-slate-200 bg-slate-50/50 p-1.5">
                    {parsedItems.map((item, i) => (
                      <div
                        key={i}
                        className={`rounded px-2 py-0.5 text-xs font-mono ${
                          item.valid ? "text-slate-700" : "bg-red-200/80 text-red-900"
                        }`}
                        title={item.error}
                      >
                        {item.raw}
                        {item.error && (
                          <span className="ml-1 text-red-600">— {item.error}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-2">
          <ul className="space-y-0.5 text-sm">
            {filteredEntityNames.map((entityName) => {
              const entity = schemaIndex.entities[entityName];
              if (!entity) return null;
              const isAbstract = entity.abstract === true;
              const types = entity.predefinedTypeValues ?? [];
              const hasTypes = types.length > 0;
              const expanded = expandedEntities.has(entityName);
              const full = isEntityFullySelected(entityName);
              const partial = isEntityPartiallySelected(entityName);
              const depth = getEntityDepth(entityName);
              const indentPx = depth * 12;

              return (
                <li key={entityName} className="rounded border border-slate-100 bg-slate-50/50">
                  <div className="flex items-center gap-2 py-1 pr-2" style={{ paddingLeft: indentPx }}>
                    {hasTypes && !isAbstract && (
                      <button
                        type="button"
                        className="flex h-6 w-6 flex-shrink-0 items-center justify-center text-slate-500 hover:text-slate-700"
                        onClick={() => toggleExpanded(entityName)}
                        aria-label={expanded ? "Sbalit" : "Rozbalit"}
                      >
                        {expanded ? "−" : "+"}
                      </button>
                    )}
                    {(!hasTypes || isAbstract) && <span className="w-6 flex-shrink-0" />}
                    <label
                      className={`flex flex-1 items-center gap-2 py-1 ${isAbstract ? "cursor-not-allowed text-slate-400" : "cursor-pointer"}`}
                      title={isAbstract ? "Abstraktní entita – nelze vybrat" : undefined}
                    >
                      <input
                        type="checkbox"
                        ref={(el) => {
                          if (el && !isAbstract) el.indeterminate = hasTypes && partial && !full;
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500 disabled:cursor-not-allowed"
                        checked={hasTypes ? full : selectedCodes.has(entityName)}
                        onChange={(e) => !isAbstract && toggleEntity(entityName, e.target.checked)}
                        disabled={isAbstract}
                      />
                      <span className={isAbstract ? "font-medium text-slate-400" : "font-medium text-slate-800"}>{entityName}</span>
                      {isAbstract && (
                        <span className="text-xs text-slate-400">(abstraktní)</span>
                      )}
                      {hasTypes && !isAbstract && (
                        <span className="text-xs text-slate-500">
                          ({types.length} typů)
                        </span>
                      )}
                    </label>
                  </div>
                  {hasTypes && expanded && (
                    <ul className="ml-8 mb-2 mt-0.5 space-y-0.5 border-l border-slate-200 pl-3">
                      <li key={`${entityName}::NOTDEFINED`}>
                        <label className="flex cursor-pointer items-center gap-2 py-0.5">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-slate-300 text-red-600 focus:ring-red-500"
                            checked={selectedCodes.has(`${entityName}::NOTDEFINED`)}
                            onChange={(e) => toggleCode(`${entityName}::NOTDEFINED`, e.target.checked)}
                          />
                          <span className="text-slate-700">NOTDEFINED</span>
                        </label>
                      </li>
                      {types.map((pt) => {
                        const code = `${entityName}::${pt}`;
                        const checked = selectedCodes.has(code);
                        return (
                          <li key={code}>
                            <label className="flex cursor-pointer items-center gap-2 py-0.5">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5 rounded border-slate-300 text-red-600 focus:ring-red-500"
                                checked={checked}
                                onChange={(e) => toggleCode(code, e.target.checked)}
                              />
                              <span className="text-slate-700">{pt}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-shrink-0 justify-end gap-2 border-t border-slate-200 px-4 py-3">
          {hasInvalidParsed && (
            <span className="mr-auto self-center text-xs text-red-600">
              Opravte nebo odstraňte neplatné položky ve vloženém seznamu
            </span>
          )}
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            onClick={onClose}
          >
            Zrušit
          </button>
          <button
            type="button"
            className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSave}
            disabled={hasInvalidParsed}
            title={hasInvalidParsed ? "Nejdříve opravte nebo zrušte neplatné položky ve vloženém seznamu" : undefined}
          >
            Uložit hierarchii
          </button>
        </div>
      </div>
    </div>
  );
};
