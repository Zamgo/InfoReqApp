import ExcelJS from "exceljs";
import type { ClassificationData, ClassificationNode } from "./types";

const HEADER_KOD = "Kód";
const HEADER_POPIS = "Popis";
const HEADER_UROVEN = "Úroveň";
const HEADER_IFC_ENTITA = "IFC Entita";
const HEADER_IFC_PREDEFINED = "IFC PredefinedType";

/** Hodnota pro prázdné/nevyplněné buňky v importu */
export const EMPTY_PLACEHOLDER = "nevyplněno";

/** Povinné sloupce (musí být v prvním řádku): Kód, Popis, Úroveň */
export const REQUIRED_HEADERS = [HEADER_KOD, HEADER_POPIS, HEADER_UROVEN] as const;

/** Volitelné sloupce (mohou chybět): IFC Entita, IFC PredefinedType; další sloupce = namapované systémy */
export const OPTIONAL_HEADERS = [HEADER_IFC_ENTITA, HEADER_IFC_PREDEFINED] as const;

/** Očekávané záhlaví pro vzor – klasifikační systém (pouze povinné) */
export const EXPECTED_HEADERS_SIMPLE = REQUIRED_HEADERS;

/** Očekávané záhlaví pro vzor – mapování (povinné + volitelné IFC + libovolné další) */
export const EXPECTED_HEADERS_MAPPING = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS] as const;

/**
 * Vytvoří vzorový XLSX pro klasifikační systém (Kód, Popis, Úroveň).
 */
export async function createSampleClassificationXlsx(): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Klasifikace", { views: [{ state: "frozen", ySplit: 1 }] });

  ws.columns = [
    { width: 20, key: "code" },
    { width: 40, key: "description" },
    { width: 10, key: "level" },
  ];

  ws.addRow([HEADER_KOD, HEADER_POPIS, HEADER_UROVEN]);
  ws.getRow(1).font = { bold: true };
  ws.addRow(["ASR", "Architektonicko stavební řešení", 1]);
  ws.addRow(["ASR.KAN", "Domovní kanalizace (KAN)", 2]);
  ws.addRow(["ASR.KAN.01", "Odpadní potrubí", 3]);

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * Vytvoří vzorový XLSX pro namapovaný klasifikační systém (Kód, Popis, Úroveň, IFC Entita, IFC PredefinedType, volitelné další sloupce).
 */
export async function createSampleMappingXlsx(): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Mapování", { views: [{ state: "frozen", ySplit: 1 }] });

  ws.columns = [
    { width: 20, key: "code" },
    { width: 35, key: "description" },
    { width: 10, key: "level" },
    { width: 22, key: "ifcEntity" },
    { width: 22, key: "predefinedType" },
    { width: 25, key: "mapped1" },
  ];

  ws.addRow([
    HEADER_KOD,
    HEADER_POPIS,
    HEADER_UROVEN,
    HEADER_IFC_ENTITA,
    HEADER_IFC_PREDEFINED,
    "Kategorie RVT",
  ]);
  ws.getRow(1).font = { bold: true };
  // Povinné: Kód, Popis, Úroveň. Volitelné: IFC Entita, IFC PredefinedType, další sloupce – prázdné buňky = v aplikaci „nevyplněno“
  ws.addRow(["ASR", "Architektonicko stavební řešení", 1, "", "", ""]);
  ws.addRow(["ASR.KAN", "Domovní kanalizace (KAN)", 2, "", "", ""]);
  ws.addRow(["ASR.KAN.01", "Odpadní potrubí", 3, "IfcPipeSegment", "CULVERT", "Potrubí"]);
  ws.addRow(["ASR.KAN.02", "Domovní přípojka", 3, "IfcPipeSegment", "GUTTER", "Potrubí"]);
  ws.addRow(["ASR.KAN.03", "Příklad nevyplněno", 3, "", "", ""]);

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `h${Math.abs(hash)}`;
}

const MAX_HEADER_COLS = 50;

/**
 * Najde index sloupce podle záhlaví (case-insensitive, trim).
 */
function findColumnIndex(row: ExcelJS.Row, header: string): number {
  const count = row.cellCount ?? MAX_HEADER_COLS;
  for (let i = 0; i < Math.min(count, MAX_HEADER_COLS); i++) {
    const cell = row.getCell(i + 1);
    const val = (cell.value?.toString() ?? "").trim();
    if (val.toLowerCase() === header.toLowerCase()) return i;
  }
  return -1;
}

/**
 * Načte první list z XLSX a vrátí ClassificationData.
 * Povinné sloupce: Kód, Popis, Úroveň (musí být v záhlaví).
 * Volitelné: IFC Entita, IFC PredefinedType (mohou chybět). Další sloupce se ignorují.
 * Prázdné buňky u volitelných sloupců se ukládají jako „nevyplněno“.
 */
export async function parseClassificationXlsx(
  file: File,
  sourceName?: string
): Promise<ClassificationData> {
  const arrayBuffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) {
    throw new Error("Soubor neobsahuje žádný list.");
  }

  const firstRow = ws.getRow(1);
  const idxCode = findColumnIndex(firstRow, HEADER_KOD);
  const idxPopis = findColumnIndex(firstRow, HEADER_POPIS);
  const idxUroven = findColumnIndex(firstRow, HEADER_UROVEN);
  const idxIfcEntity = findColumnIndex(firstRow, HEADER_IFC_ENTITA);
  const idxPredefined = findColumnIndex(firstRow, HEADER_IFC_PREDEFINED);

  if (idxCode < 0 || idxPopis < 0 || idxUroven < 0) {
    throw new Error(
      `Povinné sloupce (musí být v prvním řádku): "${HEADER_KOD}", "${HEADER_POPIS}", "${HEADER_UROVEN}". Volitelné: "${HEADER_IFC_ENTITA}", "${HEADER_IFC_PREDEFINED}".`
    );
  }

  const rows: Array<{ code: string; description: string; level: number; ifcEntity?: string; predefinedType?: string }> = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const codeRaw = (row.getCell(idxCode + 1).value?.toString() ?? "").trim();
    const descriptionRaw = (row.getCell(idxPopis + 1).value?.toString() ?? "").trim();
    const levelRaw = row.getCell(idxUroven + 1).value;
    let level = typeof levelRaw === "number" ? levelRaw : Number(levelRaw);
    if (!Number.isFinite(level)) level = rows.length + 1;

    if (!codeRaw && !descriptionRaw) continue;

    const code = codeRaw;
    const description = descriptionRaw;

    const ifcEntityRaw = idxIfcEntity >= 0 ? (row.getCell(idxIfcEntity + 1).value?.toString() ?? "").trim() : "";
    const predefinedRaw = idxPredefined >= 0 ? (row.getCell(idxPredefined + 1).value?.toString() ?? "").trim() : "";

    rows.push({
      code,
      description,
      level,
      ifcEntity: ifcEntityRaw || undefined,
      predefinedType: predefinedRaw || undefined,
    });
  }

  const roots: ClassificationNode[] = [];
  const stack: ClassificationNode[] = [];

  rows.forEach((row) => {
    const node: ClassificationNode = {
      code: row.code,
      description: row.description,
      level: row.level,
      ifcEntity: row.ifcEntity,
      predefinedType: row.predefinedType,
      children: [],
    };

    while (stack.length && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    stack.push(node);
  });

  const hash = hashString(rows.map((r) => `${r.code}\t${r.description}\t${r.level}`).join("\n"));
  return {
    nodes: roots,
    sourceName: sourceName ?? file.name.replace(/\.xlsx$/i, ""),
    hash,
  };
}
