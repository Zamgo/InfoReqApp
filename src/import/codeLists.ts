import ExcelJS from "exceljs";
import type { CodeList } from "../project/types";
import { makeId } from "../utils/id";

/**
 * Formát importu: každý sloupec = jeden číselník.
 * První řádek = názvy číselníků.
 * Ostatní řádky = hodnoty.
 */

function normalizeValues(values: string[]): string[] {
  const trimmed = values.map((v) => v.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of trimmed) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * Parsuje TXT soubor (TSV – tabulátory nebo středníky).
 * První řádek = názvy sloupců (číselníků), ostatní řádky = hodnoty.
 */
export async function parseCodeListsFromTxt(file: File): Promise<CodeList[]> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) {
    throw new Error("Soubor je prázdný.");
  }

  const firstLine = lines[0];
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : ",";
  const headers = firstLine.split(delimiter).map((h) => h.trim()).filter(Boolean);
  if (headers.length === 0) {
    throw new Error("První řádek musí obsahovat názvy číselníků oddělené tabulátorem nebo středníkem.");
  }

  const columns: string[][] = headers.map(() => []);
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(delimiter);
    for (let c = 0; c < headers.length; c++) {
      const val = (parts[c] ?? "").trim();
      if (val) columns[c].push(val);
    }
  }

  const result: CodeList[] = [];
  for (let c = 0; c < headers.length; c++) {
    const name = headers[c] || `Číselník ${c + 1}`;
    const values = normalizeValues(columns[c]);
    result.push({ id: makeId(), name, values });
  }
  return result;
}

/**
 * Vrátí hodnotu z buňky jako string.
 */
function cellToString(val: ExcelJS.CellValue | null | undefined): string {
  if (val == null) return "";
  if (typeof val === "object" && "result" in val && typeof (val as { result?: unknown }).result !== "undefined") {
    return String((val as { result: unknown }).result);
  }
  return String(val);
}

/**
 * Parsuje XLSX soubor.
 * První řádek = názvy sloupců (číselníků), ostatní řádky = hodnoty.
 * Používá row.values – spolehlivé pro soubory s různým počtem sloupců v řádcích.
 */
export async function parseCodeListsFromXlsx(file: File): Promise<CodeList[]> {
  const arrayBuffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) {
    throw new Error("Soubor neobsahuje žádný list.");
  }

  const firstRow = ws.getRow(1);
  const firstValues = firstRow.values as (ExcelJS.CellValue | undefined)[] | undefined;
  if (!firstValues || !Array.isArray(firstValues)) {
    throw new Error("První řádek musí obsahovat názvy číselníků.");
  }

  // Z hlavičkového řádku: index 0 je null, indexy 1+ jsou názvy sloupců
  const headers: string[] = [];
  let colCount = 0;
  for (let i = 1; i < firstValues.length; i++) {
    const val = cellToString(firstValues[i]);
    const name = val.trim() || `Číselník ${i}`;
    headers.push(name);
    colCount = i;
  }
  if (headers.length === 0) {
    throw new Error("První řádek musí obsahovat názvy číselníků.");
  }

  const columns: string[][] = headers.map(() => []);
  const rowCount = ws.rowCount ?? 0;
  for (let r = 2; r <= rowCount; r++) {
    const row = ws.getRow(r);
    const rowValues = row.values as (ExcelJS.CellValue | undefined)[] | undefined;
    if (!rowValues || !Array.isArray(rowValues)) continue;
    for (let c = 1; c <= colCount; c++) {
      const val = cellToString(rowValues[c]).trim();
      if (val) columns[c - 1].push(val);
    }
  }

  const result: CodeList[] = [];
  for (let c = 0; c < headers.length; c++) {
    const name = headers[c] || `Číselník ${c + 1}`;
    const values = normalizeValues(columns[c]);
    result.push({ id: makeId(), name, values });
  }
  return result;
}

/**
 * Podle přípony souboru volí TXT nebo XLSX parser.
 */
export async function parseCodeListsFromFile(file: File): Promise<CodeList[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    return parseCodeListsFromXlsx(file);
  }
  if (name.endsWith(".txt") || name.endsWith(".tsv") || name.endsWith(".csv")) {
    return parseCodeListsFromTxt(file);
  }
  throw new Error("Podporované formáty: .txt, .tsv, .csv, .xlsx");
}

/**
 * Vytvoří vzorový XLSX pro import číselníků.
 * Každý sloupec = jeden číselník, první řádek = názvy, ostatní řádky = hodnoty.
 */
export async function createSampleCodeListsXlsx(): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Číselníky", { views: [{ state: "frozen", ySplit: 1 }] });

  ws.columns = [
    { width: 20, key: "c1" },
    { width: 25, key: "c2" },
    { width: 22, key: "c3" },
  ];

  ws.addRow(["Typ povrchu", "Materiál", "Barva"]);
  ws.getRow(1).font = { bold: true };
  ws.addRow(["Dřevo", "Betón", "Bílá"]);
  ws.addRow(["Keramika", "Ocel", "Šedá"]);
  ws.addRow(["PVC", "Sklo", "Černá"]);
  ws.addRow(["Kámen", "Hliník", "Zelená"]);

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
