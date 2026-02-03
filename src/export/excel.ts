import ExcelJS from "exceljs";
import type {
  Project,
  Phase,
  CodeList,
  ClassificationSystemEntry,
  AttributeRequirement,
  PropertyRequirement,
  RelationRequirement,
  ClassificationRequirement,
  MaterialRequirement,
} from "../project/types";
import type { ClassificationNode } from "../classification/types";
import { ENUM_CODELIST_ID_KEY } from "../project/enumeration";
import { collectLeaves, getPathToNode, findNodeByCode } from "../classification/parser";

/**
 * Konvence pojmenování v exportu:
 * - Prefix "Třídění_" s velkým T, zbytek malé (třídění)
 * - Sloupce: Třídící_kód, Třídění_úroveň_1, Třídění_úroveň_2, Třídění_<systém>, Třídění_AN_<autorský nástroj>
 * - Názvy listů klasifikací: KLASIFIKACE_<název> (např. KLASIFIKACE_ASR, KLASIFIKACE_Kategorie RVT)
 */

/**
 * Style constants for Excel formatting
 */
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 11,
};

const HEADER_ALIGNMENT: Partial<ExcelJS.Alignment> = {
  vertical: "middle",
  horizontal: "center",
  wrapText: true,
};

const CELL_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE2E8F0" } },
  left: { style: "thin", color: { argb: "FFE2E8F0" } },
  bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
  right: { style: "thin", color: { argb: "FFE2E8F0" } },
};

/** Barvy pro sekce hlavičky Zdroj: Identifikační údaje, Další klasifikace, IFC entity, Požadavky */
const HEADER_FILL_IDENTIFIKACNI: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF16A34A" }, // Green-600 – Kód + hierarchie primární klasifikace
};
const HEADER_FILL_DALSI_KLASIFIKACE: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0D9488" }, // Teal-600 – další klasifikační systémy
};
const HEADER_FILL_AUTORSKE_NASTROJE: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF7C3AED" }, // Violet-600 – třídění autorských nástrojů
};
const HEADER_FILL_IFC: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF2563EB" }, // Blue-600
};
const HEADER_FILL_POZADAVKY: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEA580C" }, // Orange-600
};
const HEADER_FILL_PROJEKT: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFDC2626" }, // Red-600
};

/**
 * Apply section-colored header styling to Zdroj sheet row (1-based column indices)
 * @param row Header row
 * @param identifikacniColCount Kód + hierarchie primární klasifikace (zelená)
 * @param dalsiKlasifikaceColCount Další klasifikační systémy (tyrkysová)
 * @param autorskeNastrojeColCount Třídění autorských nástrojů (fialová)
 * @param ifcColCount IFC_entita, IFC_predefinedType (modrá)
 */
const styleZdrojHeaderRow = (
  row: ExcelJS.Row,
  identifikacniColCount: number,
  dalsiKlasifikaceColCount: number,
  autorskeNastrojeColCount: number,
  ifcColCount: number
) => {
  let colIndex = 1;
  row.eachCell((cell) => {
    cell.font = HEADER_FONT;
    cell.alignment = HEADER_ALIGNMENT;
    cell.border = CELL_BORDER;
    if (colIndex <= identifikacniColCount) {
      cell.fill = HEADER_FILL_IDENTIFIKACNI;
    } else if (colIndex <= identifikacniColCount + dalsiKlasifikaceColCount) {
      cell.fill = HEADER_FILL_DALSI_KLASIFIKACE;
    } else if (colIndex <= identifikacniColCount + dalsiKlasifikaceColCount + autorskeNastrojeColCount) {
      cell.fill = HEADER_FILL_AUTORSKE_NASTROJE;
    } else if (colIndex <= identifikacniColCount + dalsiKlasifikaceColCount + autorskeNastrojeColCount + ifcColCount) {
      cell.fill = HEADER_FILL_IFC;
    } else {
      cell.fill = HEADER_FILL_POZADAVKY;
    }
    colIndex++;
  });
  row.height = 28;
};

/**
 * Apply data cell styling
 */
const styleDataRow = (row: ExcelJS.Row, isAlternate: boolean = false) => {
  row.eachCell((cell) => {
    cell.border = CELL_BORDER;
    cell.alignment = { vertical: "top", wrapText: true };
    if (isAlternate) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF8FAFC" }, // Slate-50
      };
    }
  });
};

/**
 * Convert 1-based column index to Excel column letter (1=A, 27=AA, ...)
 */
const getColumnLetter = (col: number): string => {
  let letter = "";
  let c = col;
  while (c > 0) {
    const mod = (c - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    c = Math.floor((c - 1) / 26);
  }
  return letter;
};

/**
 * Set column widths and freeze header row
 */
const finalizeSheet = (sheet: ExcelJS.Worksheet, widths: number[]) => {
  widths.forEach((width, index) => {
    const col = sheet.getColumn(index + 1);
    col.width = width;
  });
  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];
};

/**
 * Create Sheet 1: PROJEKT (metadata)
 * Bez ID a časů: Název, Autor, Popis, IFC_specifikace, IFC_dokumentace, Model_View_Definition_MVD. Červená hlavička.
 */
const createProjectSheet = (workbook: ExcelJS.Workbook, project: Project) => {
  const sheet = workbook.addWorksheet("PROJEKT");

  const headers = [
    "Název",
    "Autor",
    "Popis",
    "IFC_specifikace",
    "IFC_dokumentace",
    "Model_View_Definition_MVD",
  ];
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL_PROJEKT;
    cell.font = HEADER_FONT;
    cell.alignment = HEADER_ALIGNMENT;
    cell.border = CELL_BORDER;
  });
  headerRow.height = 28;

  const ifcSchema = project.ifcSchemaVersionDisplay || project.ifcSchemaVersion || "";
  const dataRow = sheet.addRow([
    project.name,
    project.author || "",
    project.description || "",
    ifcSchema,
    project.ifcDocumentationUrl || "https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/",
    project.modelDefinitionViewMvd || "Reference View",
  ]);
  styleDataRow(dataRow);

  finalizeSheet(sheet, [30, 20, 40, 25, 50, 25]);
};

/**
 * Create Sheet 2: FÁZE (Phases)
 * Bez ID, hlavičky v češtině, oranžová barva.
 */
const createPhasesSheet = (workbook: ExcelJS.Workbook, phases: Phase[]) => {
  const sheet = workbook.addWorksheet("FÁZE");

  const headers = ["Kód", "Název", "Popis"];
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL_POZADAVKY;
    cell.font = HEADER_FONT;
    cell.alignment = HEADER_ALIGNMENT;
    cell.border = CELL_BORDER;
  });
  headerRow.height = 28;

  phases.forEach((phase, index) => {
    const row = sheet.addRow([
      phase.code,
      phase.name,
      phase.description || "",
    ]);
    styleDataRow(row, index % 2 === 1);
  });

  finalizeSheet(sheet, [10, 30, 50]);
};

/**
 * Create Sheet 3: ČÍSELNÍKY (Code Lists)
 * Bez sloupce id, hlavičky v češtině, oranžová barva jako v požadavcích.
 */
const createCodeListsSheet = (workbook: ExcelJS.Workbook, codeLists: CodeList[]) => {
  const sheet = workbook.addWorksheet("ČÍSELNÍKY");

  const headers = ["Název", "Hodnoty", "Poznámka"];
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL_POZADAVKY;
    cell.font = HEADER_FONT;
    cell.alignment = HEADER_ALIGNMENT;
    cell.border = CELL_BORDER;
  });
  headerRow.height = 28;

  codeLists.forEach((codeList, index) => {
    const row = sheet.addRow([
      codeList.name,
      (codeList.values || []).join(";"),
      codeList.note || "",
    ]);
    styleDataRow(row, index % 2 === 1);
  });

  finalizeSheet(sheet, [25, 60, 40]);
};

/**
 * Flatten classification tree to simple rows (Kód, Popis, Úroveň)
 */
const flattenToCodePopisUroven = (nodes: ClassificationNode[]): Array<{ code: string; description: string; level: number }> => {
  const rows: Array<{ code: string; description: string; level: number }> = [];
  nodes.forEach((node) => {
    rows.push({
      code: node.code || "",
      description: node.description || "",
      level: node.level,
    });
    if (node.children && node.children.length > 0) {
      rows.push(...flattenToCodePopisUroven(node.children));
    }
  });
  return rows;
};

/** Sanitize sheet name for Excel (max 31 chars, no \ / * ? : [ ]) */
const sanitizeSheetName = (name: string): string => {
  const sanitized = name.replace(/[\\/*?:\[\]]/g, "_").trim();
  return sanitized.slice(0, 31) || "Klasifikace";
};

/** Prefix pro názvy listů klasifikací. */
const KLASIFIKACE_LIST_PREFIX = "KLASIFIKACE_";

/**
 * Create one sheet per classification system: Kód, Popis, Úroveň.
 * IFC systém se neexportuje (mapování je v PRVKY).
 * Názvy listů: KLASIFIKACE_ + název klasifikace.
 */
const createClassificationSheets = (workbook: ExcelJS.Workbook, entries: ClassificationSystemEntry[]) => {
  const usedNames = new Set<string>();
  const entriesToExport = entries.filter((e) => !e.isIfcSystem && e.nodes && e.nodes.length > 0);

  entriesToExport.forEach((entry) => {
    const baseName = entry.name || entry.sourceName || entry.id;
    let sheetName = sanitizeSheetName(KLASIFIKACE_LIST_PREFIX + baseName);
    let suffix = 0;
    while (usedNames.has(sheetName)) {
      suffix++;
      const base = sheetName.slice(0, 28);
      sheetName = `${base}_${suffix}`.slice(0, 31);
    }
    usedNames.add(sheetName);

    const sheet = workbook.addWorksheet(sheetName);
    const headers = ["Třídící_kód", "Popis", "Úroveň"];
    const headerRow = sheet.addRow(headers);
    const headerFill =
      (entry.systemKind ?? "classification") === "authoring"
        ? HEADER_FILL_AUTORSKE_NASTROJE
        : HEADER_FILL_IDENTIFIKACNI;
    headerRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = HEADER_FONT;
      cell.alignment = HEADER_ALIGNMENT;
      cell.border = CELL_BORDER;
    });
    headerRow.height = 28;

    const rows = flattenToCodePopisUroven(entry.nodes ?? []);
    rows.forEach((r, index) => {
      const row = sheet.addRow([r.code, r.description, r.level]);
      styleDataRow(row, index % 2 === 1);
    });

    finalizeSheet(sheet, [20, 40, 10]);
  });
};

/**
 * Create PRVKY sheet: primární klasifikace s IFC_entita, IFC_predefinedType, mapovanými systémy a popisem objektu.
 * IFC data a metadata objektu (popis, poznámka, příklady) se berou z project.objects.
 */
const createMapovaniSheet = (
  workbook: ExcelJS.Workbook,
  project: Project,
  entries: ClassificationSystemEntry[],
  exportAutorskeNastroje: boolean = false
) => {
  const primaryEntry = entries.find((e) => e.isPrimary);
  if (!primaryEntry?.nodes?.length) return;
  const primaryNodes = primaryEntry.nodes;

  const sheet = workbook.addWorksheet("PRVKY");

  // Stejné filtrování a pořadí jako ve POŽADAVKY: další klasifikace (teal) vs autorské nástroje (violet)
  const additionalEntries = (primaryEntry.mappedSystemIds ?? [])
    .map((id) => entries.find((e) => e.id === id))
    .filter((e): e is ClassificationSystemEntry => {
      if (!e) return false;
      if (e.isIfcSystem) return false;
      const kind = e.systemKind ?? "classification";
      return kind === "classification";
    });
  const authoringEntries = exportAutorskeNastroje && (primaryEntry.authoringToolSystemIds ?? []).length
    ? (primaryEntry.authoringToolSystemIds ?? [])
        .map((id) => entries.find((e) => e.id === id))
        .filter((e): e is ClassificationSystemEntry => !!e)
    : [];

  const flattenWithMapping = (
    nodes: ClassificationNode[],
    parentPath: ClassificationNode[] = []
  ): Array<{ node: ClassificationNode; path: ClassificationNode[] }> => {
    const result: Array<{ node: ClassificationNode; path: ClassificationNode[] }> = [];
    nodes.forEach((node) => {
      const path = [...parentPath, node];
      result.push({ node, path });
      if (node.children?.length) {
        result.push(...flattenWithMapping(node.children, path));
      }
    });
    return result;
  };

  const flatAll = flattenWithMapping(primaryNodes);
  const flat = flatAll.filter(({ node }) => !node.children?.length);
  const maxDepth = Math.max(1, ...flat.map(({ path }) => path.length));
  const hierarchyPopisHeaders = Array.from(
    { length: Math.min(maxDepth, 5) },
    (_, i) => `Třídění_úroveň_${i + 1}`
  );

  const headers = [
    "Třídící_kód",
    ...hierarchyPopisHeaders,
    ...additionalEntries.map((e) => `Třídění_${e.name}`),
    ...authoringEntries.map((e) => `Třídění_AN_${e.name}`),
    "IFC_entita",
    "IFC_predefinedType",
    "Popis",
    "Poznámka",
    "Příklady",
  ];
  const headerRow = sheet.addRow(headers);
  const identifikacniColCount = 1 + hierarchyPopisHeaders.length;
  const dalsiKlasifikaceColCount = additionalEntries.length;
  const autorskeNastrojeColCount = authoringEntries.length;
  const ifcColCount = 2;
  styleZdrojHeaderRow(headerRow, identifikacniColCount, dalsiKlasifikaceColCount, autorskeNastrojeColCount, ifcColCount);

  flat.forEach(({ node, path }, index) => {
    const obj = project.objects[node.code ?? ""];
    const ifcEntity = obj?.ifcEntity ?? node.ifcEntity ?? "";
    const predefinedType =
      obj?.predefinedType?.mode === "ENUM"
        ? (obj.predefinedType.value || "NOTDEFINED")
        : (node.predefinedType || (node.code?.includes("::") ? "NOTDEFINED" : ""));
    const hierarchyValues = hierarchyPopisHeaders.map((_, i) =>
      normalizeNotDefined(path[i]?.description ?? "")
    );
    const additionalVals = additionalEntries.map((e) => node.mappedValues?.[e.id] ?? "");
    const authoringVals = authoringEntries.map((e) => node.mappedValues?.[e.id] ?? "");
    const tridiciKodPrvky = node.code?.includes("::") ? "" : (node.code ?? "");
    const row = sheet.addRow([
      tridiciKodPrvky,
      ...hierarchyValues,
      ...additionalVals,
      ...authoringVals,
      ifcEntity,
      predefinedType,
      obj?.popis ?? "",
      obj?.poznamka ?? "",
      obj?.priklady ?? "",
    ]);
    styleDataRow(row, index % 2 === 1);
  });

  const hierarchyWidths = hierarchyPopisHeaders.map(() => 30);
  const widths = [
    20,
    ...hierarchyWidths,
    ...additionalEntries.map(() => 22),
    ...authoringEntries.map(() => 22),
    22,
    22,
    30,
    30,
    30,
  ];
  finalizeSheet(sheet, widths);
};

/** Normalizace pro export: "Není definováno" → "NOTDEFINED" (jednotné označení) */
const normalizeNotDefined = (val: string): string => {
  const s = val?.trim() ?? "";
  return s.toLowerCase() === "není definováno" ? "NOTDEFINED" : s;
};

/**
 * Get codeListId from extensions
 */
const getCodeListId = (extensions?: Record<string, unknown>): string => {
  if (!extensions) return "";
  return (extensions[ENUM_CODELIST_ID_KEY] as string) || "";
};

/**
 * Exclude IFC classification – IFC třídění je už v entitě a predefined type, neexportovat
 */
const excludeIfcClassifications = (
  items: ClassificationRequirement[],
  classificationSystemEntries: ClassificationSystemEntry[]
): ClassificationRequirement[] => {
  return items.filter((cls) => {
    if (!cls.systemEntryId) return true;
    const entry = classificationSystemEntries.find((e) => e.id === cls.systemEntryId);
    return !entry?.isIfcSystem;
  });
};

/**
 * Check if requirement applies to given phase
 */
const hasPhase = (phases?: string[], phaseId?: string): string => {
  if (!phaseId || !phases || phases.length === 0) return "";
  return phases.includes(phaseId) ? "Ano" : "Ne";
};

/**
 * Get code list name by ID
 */
const getCodeListName = (codeListId: string, codeLists: CodeList[]): string => {
  const list = codeLists.find((c) => c.id === codeListId);
  return list?.name || codeListId || "";
};

/**
 * Create Sheet: POŽADAVKY (hlavní tabulka pro kontingenční tabulku a import)
 * Jeden řádek = jeden požadavek. Čitelné názvy sloupců.
 *
 * Skupina: pouze u typu Vlastnost (název Pset/Qto), v budoucnu i skupina materiálů.
 * Parametr_hodnoty: identifikátor, na který se vážou Požadované_hodnoty:
 *   - Atribut: název IFC atributu
 *   - Vlastnost: název vlastnosti
 *   - Součást: entita součásti (IfcWall.WALL)
 *   - Klasifikace: název klasifikačního systému
 *   - Materiál: kategorie materiálu
 * (Alternativní názvy sloupce: Specifikátor, Předmět_požadavku, Identifikátor)
 */
const createZdrojSheet = (
  workbook: ExcelJS.Workbook,
  project: Project,
  classificationSystemEntries: ClassificationSystemEntry[] = [],
  exportAutorskeNastroje: boolean = false
) => {
  const sheet = workbook.addWorksheet("POŽADAVKY");

  const phases = project.phases;
  const phaseHeaders = phases.map((p) => p.name || p.code || p.id);
  const phaseIds = phases.map((p) => p.id);
  const codeLists = project.codeLists || [];

  /** Najde cestu hierarchie pro kód v libovolném klasifikačním systému; fallback pro kódy s tečkou (ASR.KAN.01). */
  const getHierarchyPath = (objectCode: string): ClassificationNode[] | null => {
    const allSources: ClassificationNode[][] = [
      ...classificationSystemEntries.map((e) => e.nodes ?? []).filter((n) => n.length > 0),
      ...(project.classification?.nodes ? [project.classification.nodes] : []),
    ];
    for (const nodes of allSources) {
      const path = getPathToNode(nodes, objectCode);
      if (path && path.length > 0) return path;
    }
    if (objectCode.includes(".") && !objectCode.includes("::")) {
      const parts = objectCode.split(".");
      const path: ClassificationNode[] = [];
      for (let i = 1; i <= parts.length; i++) {
        const parentCode = parts.slice(0, i).join(".");
        let desc = "";
        for (const nodes of allSources) {
          const node = findNodeByCode(nodes, parentCode);
          if (node) {
            desc = node.description || "";
            break;
          }
        }
        path.push({ code: parentCode, description: desc, level: i, children: [] });
      }
      return path.length > 0 ? path : null;
    }
    return null;
  };

  // Jen sloupce popisů nadřazených úrovní (bez kódů – kód je jen Kód_objektu = nejnižší úroveň)
  // Přidáme pouze sloupce pro úrovně, které jsou v datech vyplněné (žádné prázdné sloupce)
  const MAX_HIERARCHY_LEVELS = 5;
  let maxDepthUsed = 0;
  for (const code of Object.keys(project.objects)) {
    const path = getHierarchyPath(code);
    if (path && path.length > 0) {
      maxDepthUsed = Math.max(maxDepthUsed, path.length);
    }
  }
  const hierarchyPopisHeaders = Array.from(
    { length: Math.min(maxDepthUsed, MAX_HIERARCHY_LEVELS) },
    (_, i) => `Třídění_úroveň_${i + 1}`
  );

  // Další klasifikační systémy (Klasifikační systém), ne Autorský nástroj ani IFC (IFC je už v sloupcích IFC_entita a IFC_predefinedType)
  const primaryEntry = classificationSystemEntries.find((e) => e.isPrimary);
  const additionalSystemEntries = (primaryEntry?.mappedSystemIds ?? [])
    .map((id) => classificationSystemEntries.find((e) => e.id === id))
    .filter((e): e is ClassificationSystemEntry => {
      if (!e) return false;
      if (e.isIfcSystem) return false; // IFC už v IFC_entita + IFC_predefinedType
      const kind = e.systemKind ?? "classification";
      return kind === "classification";
    });
  const additionalSystemHeaders = additionalSystemEntries.map((e) => `Třídění_${e.name}`);

  // Třídění autorských nástrojů (např. Kategorie RVT) – pouze když je zaškrtnuto v exportu
  const authoringSystemEntries = exportAutorskeNastroje && primaryEntry?.authoringToolSystemIds?.length
    ? (primaryEntry.authoringToolSystemIds ?? [])
        .map((id) => classificationSystemEntries.find((e) => e.id === id))
        .filter((e): e is ClassificationSystemEntry => !!e)
    : [];
  const authoringSystemHeaders = authoringSystemEntries.map((e) => `Třídění_AN_${e.name}`);

  const headers = [
    "Třídící_kód",
    ...hierarchyPopisHeaders,
    ...additionalSystemHeaders,
    ...authoringSystemHeaders,
    "IFC_entita",
    "IFC_predefinedType",
    "Typ_požadavku",
    "Skupina",
    "Parametr_hodnoty",
    "IFC_datový_typ",
    "Omezení",
    "Požadované_hodnoty",
    "Jednotka",
    "Číselník",
    "URI",
    "Popis",
    "Poznámka",
    "Příklady",
    "Výskyt",
    ...phaseHeaders,
  ];
  const headerRow = sheet.addRow(headers);
  const identifikacniColCount = 1 + hierarchyPopisHeaders.length; // Kód + hierarchie primární klasifikace
  const dalsiKlasifikaceColCount = additionalSystemHeaders.length; // Další klasifikační systémy
  const autorskeNastrojeColCount = authoringSystemHeaders.length; // Třídění autorských nástrojů
  const ifcColCount = 2; // IFC_entita, IFC_predefinedType
  styleZdrojHeaderRow(headerRow, identifikacniColCount, dalsiKlasifikaceColCount, autorskeNastrojeColCount, ifcColCount);

  const orderedCodes = primaryEntry?.nodes
    ? collectLeaves(primaryEntry.nodes).map((n) => n.code)
    : [];
  const objectCodes = [
    ...orderedCodes.filter((c) => project.objects[c]),
    ...Object.keys(project.objects).filter((c) => !orderedCodes.includes(c)),
  ];

  const occurrenceLabels: Record<string, string> = {
    required: "Povinný",
    optional: "Volitelný",
    prohibited: "Zakázaný",
  };

  const constraintLabels: Record<string, string> = {
    FILLED: "Jednoduchá hodnota",
    ENUM: "Výčet",
    PATTERN: "Vzor",
    RANGE: "Ohraničení",
    LENGTH: "Délka",
  };

  const ciselnikColIndex = headers.indexOf("Číselník") + 1;
  const pozadovaneHodnotyColIndex = headers.indexOf("Požadované_hodnoty") + 1;
  const maxCiselnikRow = 1 + codeLists.length;

  let rowIndex = 0;

  objectCodes.forEach((code) => {
    const obj = project.objects[code];
    if (!obj) return;

    const hierarchyPath = getHierarchyPath(code);
    const hierarchyValues = hierarchyPopisHeaders.map((_, i) =>
      normalizeNotDefined(hierarchyPath?.[i]?.description ?? "")
    );

    const leafNode = primaryEntry ? findNodeByCode(primaryEntry.nodes ?? [], code) : undefined;
    const additionalSystemValues = additionalSystemEntries.map(
      (e) => leafNode?.mappedValues?.[e.id]?.trim() ?? ""
    );
    const authoringSystemValues = authoringSystemEntries.map(
      (e) => leafNode?.mappedValues?.[e.id]?.trim() ?? ""
    );

    const tridiciKod = obj.code?.includes("::") ? "" : (obj.code ?? "");
    const baseCols = [
      tridiciKod,
      ...hierarchyValues,
      ...additionalSystemValues,
      ...authoringSystemValues,
      obj.ifcEntity,
      obj.predefinedType.mode === "ENUM"
        ? (obj.predefinedType.value || "NOTDEFINED")
        : (obj.code?.includes("::") ? "NOTDEFINED" : ""),
    ];

    const addRow = (
      typ: string,
      skupina: string,
      parametrHodnoty: string,
      dataType: string,
      unit: string,
      occurrence: string,
      constraint: string,
      povoleneHodnoty: string,
      ciselnikName: string,
      uri: string,
      popis: string,
      note: string,
      priklady: string,
      reqPhases?: string[]
    ) => {
      const occLabel = occurrenceLabels[occurrence] || occurrence;
      const constraintLabel = constraintLabels[(constraint ?? "FILLED").toUpperCase()] || constraint;
      const phaseVals = phaseIds.map((pid) => hasPhase(reqPhases, pid));
      const useCiselnikFormula =
        constraint === "ENUM" &&
        ciselnikName &&
        codeLists.length > 0;

      const row = sheet.addRow([
        ...baseCols,
        typ,
        skupina,
        parametrHodnoty,
        dataType,
        constraintLabel,
        useCiselnikFormula ? "" : povoleneHodnoty,
        unit,
        ciselnikName,
        uri,
        popis,
        note,
        priklady,
        occLabel,
        ...phaseVals,
      ]);

      if (useCiselnikFormula) {
        const ciselnikColLetter = getColumnLetter(ciselnikColIndex);
        const ciselnikCellRef = `${ciselnikColLetter}${row.number}`;
        const formula = `=IF(${ciselnikCellRef}="","",VLOOKUP(${ciselnikCellRef},ČÍSELNÍKY!$A$2:$B$${maxCiselnikRow},2,FALSE))`;
        row.getCell(pozadovaneHodnotyColIndex).value = { formula };
      }

      styleDataRow(row, rowIndex % 2 === 1);
      rowIndex++;
    };

    obj.requirements.attributes.forEach((attr: AttributeRequirement) => {
      const clId = getCodeListId(attr.extensions);
      addRow(
        "Atribut",
        "",
        attr.attribute || "",
        attr.dataType || "",
        attr.unit || "",
        attr.occurrence || "required",
        attr.constraint,
        (attr.allowedValues || []).join(";") || attr.value || "",
        getCodeListName(clId, codeLists),
        attr.uri || "",
        attr.popis || "",
        attr.note || "",
        attr.priklady || "",
        attr.phases
      );
    });

    obj.requirements.properties.forEach((prop: PropertyRequirement) => {
      const clId = getCodeListId(prop.extensions);
      addRow(
        "Vlastnost",
        prop.psetName,
        prop.propertyName || "",
        prop.dataType,
        prop.unit || "",
        prop.occurrence || "required",
        prop.constraint || "",
        (prop.allowedValues || []).join(";") || prop.value || "",
        getCodeListName(clId, codeLists),
        prop.uri || "",
        prop.popis || "",
        prop.note || "",
        prop.priklady || "",
        prop.phases
      );
    });

    obj.requirements.relations.forEach((rel: RelationRequirement) => {
      const soucastEntity = [rel.entityType, rel.entityPredefinedType].filter(Boolean).join(".");
      addRow(
        "Součást",
        "",
        soucastEntity,
        "",
        "",
        rel.occurrence || "required",
        "",
        rel.relationType || "",
        "",
        rel.uri || "",
        rel.popis || "",
        rel.note || "",
        rel.priklady || "",
        rel.phases
      );
    });

    excludeIfcClassifications(obj.requirements.classifications, classificationSystemEntries).forEach(
      (cls: ClassificationRequirement) => {
        const noteWithIdentification = cls.identification
          ? [cls.note, `[Identifikace: ${cls.identification}]`].filter(Boolean).join(" ")
          : (cls.note || "");
        addRow(
          "Klasifikace",
          "",
          cls.system,
          "",
          "",
          cls.occurrence || "required",
          cls.constraint || "",
          cls.value || "",
          "",
          cls.uri || "",
          cls.description || "",
          noteWithIdentification,
          cls.priklady || "",
          cls.phases
        );
      }
    );

    obj.requirements.materials.forEach((mat: MaterialRequirement) => {
      const clId = getCodeListId(mat.extensions);
      addRow(
        "Materiál",
        "",
        mat.category || "",
        "",
        "",
        mat.occurrence || "required",
        mat.constraint || "",
        mat.value || "",
        getCodeListName(clId, codeLists),
        mat.uri || "",
        mat.popis || "",
        mat.note || "",
        mat.priklady || "",
        mat.phases
      );
    });
  });

  const hierarchyWidths = hierarchyPopisHeaders.map(() => 30);
  const additionalWidths = additionalSystemHeaders.map(() => 22);
  const authoringWidths = authoringSystemHeaders.map(() => 22);
  const widths = [
    18,
    ...hierarchyWidths,
    ...additionalWidths,
    ...authoringWidths,
    18, 15, 12, 25, 25, 15, 25, 30, 12, 22, 25, 30, 30, 30, 10,
    ...phaseHeaders.map(() => 10),
  ];
  finalizeSheet(sheet, widths);
};

/**
 * Sheet selection options for selective export
 * zdroj = list POŽADAVKY (hlavní tabulka pro kontingenční tabulku a import)
 * klasifikaceListy = každá klasifikace jako samostatný list (Kód, Popis, Úroveň)
 * mapovani = list PRVKY (primární klasifikace + IFC + mapované systémy + popis objektů)
 */
export interface SheetSelection {
  zdroj: boolean;
  /** Exportovat třídění autorských nástrojů jako další sloupce za primární klasifikací a IFC */
  zdrojExportAutorskeNastroje?: boolean;
  ciselniky: boolean;
  faze: boolean;
  projekt: boolean;
  /** Každá klasifikace jako samostatný list (Kód, Popis, Úroveň) */
  klasifikaceListy: boolean;
  /** List PRVKY – primární klasifikace s IFC, mapovanými systémy a popisem objektů */
  mapovani: boolean;
}

/**
 * Default selection - hlavní list + doplňky pro pochopení
 */
export const DEFAULT_SHEET_SELECTION: SheetSelection = {
  zdroj: true,
  zdrojExportAutorskeNastroje: false,
  ciselniky: true,
  faze: true,
  projekt: true,
  klasifikaceListy: true,
  mapovani: false,
};

/**
 * Generate Excel workbook from project with optional sheet selection
 */
export const generateExcelWorkbook = async (
  project: Project,
  selection: SheetSelection = DEFAULT_SHEET_SELECTION
): Promise<ExcelJS.Workbook> => {
  const workbook = new ExcelJS.Workbook();

  // Set workbook properties
  workbook.creator = project.author || "InfoReqApp";
  workbook.lastModifiedBy = project.author || "InfoReqApp";
  workbook.created = new Date(project.createdAt);
  workbook.modified = new Date(project.updatedAt);
  workbook.title = project.name;
  workbook.subject = "BIM Information Requirements";

  // Pořadí listů: PROJEKT, FÁZE, PRVKY, POŽADAVKY, ČÍSELNÍKY, Klasifikace
  if (selection.projekt) {
    createProjectSheet(workbook, project);
  }
  if (selection.faze) {
    createPhasesSheet(workbook, project.phases);
  }
  if (selection.mapovani) {
    createMapovaniSheet(
      workbook,
      project,
      project.classificationSystemEntries || [],
      selection.zdrojExportAutorskeNastroje ?? false
    );
  }
  if (selection.zdroj) {
    createZdrojSheet(workbook, project, project.classificationSystemEntries ?? [], selection.zdrojExportAutorskeNastroje ?? false);
  }
  if (selection.ciselniky) {
    createCodeListsSheet(workbook, project.codeLists || []);
  }
  if (selection.klasifikaceListy) {
    createClassificationSheets(workbook, project.classificationSystemEntries || []);
  }

  return workbook;
};

/**
 * Export project to Excel file (.xlsx)
 */
export const exportExcelFile = async (
  project: Project,
  selection: SheetSelection = DEFAULT_SHEET_SELECTION
): Promise<void> => {
  const workbook = await generateExcelWorkbook(project, selection);

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();

  // Create blob and download
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;

  // Generate filename
  const sanitizedName = project.name.replace(/[^a-zA-Z0-9_\-ěščřžýáíéůúďťňĚŠČŘŽÝÁÍÉŮÚĎŤŇ ]/gi, "_");
  const timestamp = new Date().toISOString().slice(0, 10);
  link.download = `${sanitizedName}_${timestamp}.xlsx`;

  link.click();
  URL.revokeObjectURL(url);
};

/**
 * Validace dat před exportem – zjistí nevyplněné nebo placeholder hodnoty
 */
export const validateExportData = (project: Project): { valid: boolean; issues: string[] } => {
  const issues: string[] = [];

  for (const [objCode, obj] of Object.entries(project.objects)) {
    const objLabel = obj.description || objCode;

    for (const prop of obj.requirements.properties) {
      if (prop.psetName?.startsWith("_NEW_")) {
        issues.push(
          `Objekt „${objLabel}“: skupina vlastností není vyplněna (vlastnost „${prop.propertyName || "—"}“)`
        );
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
};

/**
 * Get statistics about export content
 */
export const getExportStatistics = (project: Project): {
  zdroj: number;
  phases: number;
  codeLists: number;
  klasifikaceListy: number;
  mapovani: number;
} => {
  const objects = Object.values(project.objects);
  const entries = project.classificationSystemEntries ?? [];
  const classificationsCount = objects.reduce((sum, obj) => {
    const filtered = excludeIfcClassifications(obj.requirements.classifications, entries);
    return sum + filtered.length;
  }, 0);

  const zdrojCount =
    objects.reduce((sum, obj) => sum + obj.requirements.attributes.length, 0) +
    objects.reduce((sum, obj) => sum + obj.requirements.properties.length, 0) +
    objects.reduce((sum, obj) => sum + obj.requirements.relations.length, 0) +
    classificationsCount +
    objects.reduce((sum, obj) => sum + obj.requirements.materials.length, 0);

  const klasifikaceCount = entries.filter((e) => !e.isIfcSystem && e.nodes?.length).length;
  const primaryEntry = entries.find((e) => e.isPrimary);
  const mapovaniCount = primaryEntry?.nodes ? flattenToCodePopisUroven(primaryEntry.nodes).length : 0;

  return {
    zdroj: zdrojCount,
    phases: project.phases.length,
    codeLists: (project.codeLists || []).length,
    klasifikaceListy: klasifikaceCount,
    mapovani: mapovaniCount,
  };
};
