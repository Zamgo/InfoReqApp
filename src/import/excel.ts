/**
 * Import projektu z Excelu ve formátu Zdroj_příklad.xlsx (roundtrip s exportem).
 *
 * Očekávané listy:
 * - PROJEKT: Název, Autor, Popis, IFC_specifikace
 * - FÁZE: Kód, Název, Popis
 * - ČÍSELNÍKY: Název, Hodnoty (oddělené ;), Poznámka
 * - KLASIFIKACE_<název>: Třídící_kód (nebo Kód), Popis, Úroveň
 * - PRVKY: Třídící_kód, Třídění_úroveň_1..N, Třídění_<systém>, Třídění_AN_<autorský nástroj>, IFC_entita, IFC_predefinedType, Popis, Poznámka, Příklady
 * - POŽADAVKY: flattened požadavky (jeden řádek = jeden požadavek)
 */
import ExcelJS from "exceljs";
import type {
  Project,
  Phase,
  CodeList,
  ClassificationSystemEntry,
  ProjectObject,
  AttributeRequirement,
  PropertyRequirement,
  RelationRequirement,
  ClassificationRequirement,
  MaterialRequirement,
} from "../project/types";
import type { ClassificationNode } from "../classification/types";
import { makeId } from "../utils/id";
import { parseEnumValues } from "../project/enumeration";
import { ENUM_CODELIST_ID_KEY } from "../project/enumeration";
import { ensureProjectPhases } from "../project/phases";
import { findNodeByCode } from "../classification/parser";

const MAX_COLS = 80;

function cellToString(val: ExcelJS.CellValue | null | undefined): string {
  if (val == null) return "";
  if (typeof val === "object" && val !== null) {
    if ("result" in val && (val as { result?: unknown }).result !== undefined) {
      return String((val as { result: unknown }).result);
    }
    // Formule bez uloženého výsledku – import spoléhá na Číselník sloupec pro allowedValues
    if ("formula" in val) return "";
  }
  return String(val).trim();
}

function findCol(row: ExcelJS.Row, header: string): number {
  for (let i = 1; i <= MAX_COLS; i++) {
    const v = cellToString(row.getCell(i).value);
    if (v.toLowerCase() === header.toLowerCase()) return i;
  }
  return -1;
}

function getVal(row: ExcelJS.Row, col: number): string {
  if (col < 1) return "";
  return cellToString(row.getCell(col).value);
}

const OMEZENI_MAP: Record<string, string> = {
  "jednoduchá hodnota": "FILLED",
  "výčet": "ENUM",
  "vzor": "PATTERN",
  "ohraničení": "RANGE",
  "délka": "LENGTH",
};

const VYSKYT_MAP: Record<string, string> = {
  "povinný": "required",
  "volitelný": "optional",
  "zakázaný": "prohibited",
};

/** Normalizace PredefinedType při importu: "není definováno" → "NOTDEFINED" (jednotné označení) */
function normalizePredefinedType(val: string): string {
  const s = (val ?? "").trim();
  return s.toLowerCase() === "není definováno" ? "NOTDEFINED" : s;
}

/** Odvodit IFC entitu a predefinedType z kódu ve formátu IfcEntity::PredefinedType */
function parseIfcFromCode(code: string): { ifcEntity: string; predefinedType: string } | null {
  if (!code || !code.includes("::")) return null;
  const parts = code.split("::");
  const ifcEntity = (parts[0] ?? "").trim();
  const predefinedType = normalizePredefinedType((parts[1] ?? "").trim()) || "NOTDEFINED";
  if (!ifcEntity || !/^Ifc[A-Z]/.test(ifcEntity)) return null;
  return { ifcEntity, predefinedType };
}

const TYP_POZADAVKU = {
  atribut: "attribute",
  vlastnost: "property",
  součást: "relation",
  klasifikace: "classification",
  materiál: "material",
} as const;

const KLASIFIKACE_LIST_PREFIX = "KLASIFIKACE_";

export interface ExcelImportResult {
  project: Project;
  warnings: string[];
}

export async function importProjectFromExcel(file: File): Promise<ExcelImportResult> {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const warnings: string[] = [];

  const projSheet = wb.getWorksheet("PROJEKT");
  const fazeSheet = wb.getWorksheet("FÁZE");
  const ciselnikySheet = wb.getWorksheet("ČÍSELNÍKY");
  const prvkySheet = wb.getWorksheet("PRVKY");
  const pozadavkySheet = wb.getWorksheet("POŽADAVKY");

  const now = new Date().toISOString();

  let projectName = "Importovaný projekt";
  let projectAuthor = "";
  let projectDescription = "";
  let ifcSchema = "IFC4X3";

  let ifcDocumentationUrl = "";
  let modelDefinitionViewMvd = "";

  if (projSheet) {
    const h1 = projSheet.getRow(1);
    const r2 = projSheet.getRow(2);
    projectName = getVal(r2, findCol(h1, "Název") || 1) || projectName;
    projectAuthor = getVal(r2, findCol(h1, "Autor") || 2);
    projectDescription = getVal(r2, findCol(h1, "Popis") || 3);
    const colIfcSpec = findCol(h1, "IFC_specifikace") >= 0 ? findCol(h1, "IFC_specifikace") : findCol(h1, "IFC schéma");
    ifcSchema = getVal(r2, colIfcSpec >= 0 ? colIfcSpec : 4) || ifcSchema;
    ifcDocumentationUrl = getVal(r2, findCol(h1, "IFC_dokumentace") || 0);
    const colMvd = findCol(h1, "Model_View_Definition_MVD") >= 0 ? findCol(h1, "Model_View_Definition_MVD") : findCol(h1, "Model_Definition_View_MVD");
    modelDefinitionViewMvd = getVal(r2, colMvd >= 0 ? colMvd : 0);
  } else {
    warnings.push("List PROJEKT chybí – použity výchozí hodnoty.");
  }

  let phases: Phase[] = [];
  if (fazeSheet) {
    const h1 = fazeSheet.getRow(1);
    const colKod = findCol(h1, "Kód") || 1;
    const colNazev = findCol(h1, "Název") || 2;
    const colPopis = findCol(h1, "Popis") || 3;
    for (let r = 2; r <= (fazeSheet.rowCount ?? 0); r++) {
      const row = fazeSheet.getRow(r);
      const code = getVal(row, colKod);
      const name = getVal(row, colNazev);
      if (!code && !name) continue;
      phases.push({
        id: makeId(),
        code: code || name,
        name: name || code,
        description: getVal(row, colPopis) || undefined,
      });
    }
  }
  if (phases.length === 0) {
    // Roundtrip: ak chýba list FÁZE, odvodiť fázy zo stĺpcov POŽADAVKY (za Výskyt)
    if (pozadavkySheet && (pozadavkySheet.rowCount ?? 0) > 1) {
      const h1Poz = pozadavkySheet.getRow(1);
      const colVyskytPoz = findCol(h1Poz, "Výskyt");
      if (colVyskytPoz >= 0) {
        const seenPhaseNames = new Set<string>();
        for (let i = colVyskytPoz + 1; i <= MAX_COLS; i++) {
          const v = getVal(h1Poz, i);
          if (v && !seenPhaseNames.has(v)) {
            seenPhaseNames.add(v);
            phases.push({
              id: makeId(),
              code: v,
              name: v,
              description: undefined,
            });
          }
        }
      }
    }
    if (phases.length === 0) {
      phases = [{ id: "phase-1", code: "Fáze1", name: "Fáze1" }];
      warnings.push("List FÁZE chybí nebo je prázdný – použita výchozí fáze.");
    } else {
      warnings.push("List FÁZE chybí – fáze odvozeny ze sloupců v POŽADAVKY.");
    }
  }

  const phaseByName = new Map<string, Phase>();
  phases.forEach((p) => {
    phaseByName.set(p.name, p);
    phaseByName.set(p.code, p);
  });

  const codeLists: CodeList[] = [];
  if (ciselnikySheet) {
    const h1 = ciselnikySheet.getRow(1);
    const colNazev = findCol(h1, "Název") || 1;
    const colHodnoty = findCol(h1, "Hodnoty") || 2;
    const colPoznamka = findCol(h1, "Poznámka") || 3;
    for (let r = 2; r <= (ciselnikySheet.rowCount ?? 0); r++) {
      const row = ciselnikySheet.getRow(r);
      const name = getVal(row, colNazev);
      if (!name) continue;
      const valuesRaw = getVal(row, colHodnoty);
      const values = parseEnumValues(valuesRaw);
      codeLists.push({
        id: makeId(),
        name,
        values,
        note: getVal(row, colPoznamka) || undefined,
      });
    }
  }

  // Preferujeme POŽADAVKY pro třídění a mapování – obsahuje flattened požadavky včetně hierarchie a mapovaných systémů
  const sourceSheet =
    pozadavkySheet && (pozadavkySheet.rowCount ?? 0) > 1
      ? pozadavkySheet
      : prvkySheet && (prvkySheet.rowCount ?? 0) > 1
        ? prvkySheet
        : pozadavkySheet;
  const classificationEntries: ClassificationSystemEntry[] = [];
  let primaryEntry: ClassificationSystemEntry | undefined;
  const mappedSystemCols: Array<{ header: string; entry: ClassificationSystemEntry; isAuthoring: boolean }> = [];

  if (sourceSheet) {
    const h1 = sourceSheet.getRow(1);
    const colKod = findCol(h1, "Třídící_kód");
    const hierarchyCols: Array<{ col: number; level: number }> = [];
    const mappedColInfos: Array<{ header: string; col: number; name: string; isAuthoring: boolean }> = [];
    for (let i = 1; i <= MAX_COLS; i++) {
      const v = getVal(h1, i);
      const matchUroven = v.match(/^Třídění_úroveň_(\d+)$/i);
      if (matchUroven) {
        hierarchyCols.push({ col: i, level: parseInt(matchUroven[1], 10) });
      } else if (v.startsWith("Třídění_AN_")) {
        mappedColInfos.push({ header: v, col: i, name: v.replace("Třídění_AN_", ""), isAuthoring: true });
      } else if (v.startsWith("Třídění_") && !v.match(/^Třídění_úroveň_\d+$/)) {
        mappedColInfos.push({ header: v, col: i, name: v.replace("Třídění_", ""), isAuthoring: false });
      }
    }
    hierarchyCols.sort((a, b) => a.level - b.level);

    const pathToCode = (path: string[]): string =>
      path.filter(Boolean).join("::") || "";
    const getPathFromRow = (row: ExcelJS.Row): string[] =>
      hierarchyCols.map((h) => getVal(row, h.col));
    const getCodeFromRow = (row: ExcelJS.Row): string => {
      const kod = colKod >= 0 ? getVal(row, colKod) : "";
      if (kod) return kod;
      return pathToCode(getPathFromRow(row));
    };

    const seenPaths = new Map<string, ClassificationNode>();
    const rows: Array<{ path: string[]; code: string }> = [];
    for (let r = 2; r <= (sourceSheet.rowCount ?? 0); r++) {
      const row = sourceSheet.getRow(r);
      const path = getPathFromRow(row);
      const code = getCodeFromRow(row);
      if (!code && path.every((p) => !p)) continue;
      const pathKey = path.join("|");
      if (seenPaths.has(pathKey)) continue;
      seenPaths.set(pathKey, {} as ClassificationNode);
      rows.push({ path, code: code || pathToCode(path) });
    }

    const buildTree = (): ClassificationNode[] => {
      const roots: ClassificationNode[] = [];
      const nodeByPath = new Map<string, ClassificationNode>();
      rows.forEach(({ path, code }) => {
        for (let depth = 0; depth < path.length; depth++) {
          const subPath = path.slice(0, depth + 1);
          const key = subPath.join("|");
          if (nodeByPath.has(key)) continue;
          const nodeCode = depth === path.length - 1 ? (code || pathToCode(subPath)) : pathToCode(subPath);
          const node: ClassificationNode = {
            code: nodeCode,
            description: subPath[depth] || "",
            level: depth + 1,
            children: [],
          };
          nodeByPath.set(key, node);
          if (depth === 0) {
            roots.push(node);
          } else {
            const parentKey = path.slice(0, depth).join("|");
            const parent = nodeByPath.get(parentKey);
            if (parent) parent.children!.push(node);
            else roots.push(node);
          }
        }
      });
      return roots;
    };

    const primaryNodes = buildTree();
    const looksLikeIfcHierarchy = (): boolean => {
      if (hierarchyCols.length === 0) return false;
      const firstLevelCol = hierarchyCols[0]?.col;
      if (!firstLevelCol) return false;
      let matchCount = 0;
      const sampleSize = Math.min(5, rows.length);
      for (let i = 0; i < sampleSize && i < rows.length; i++) {
        const val = rows[i]?.path[0] ?? "";
        if (val && /^Ifc[A-Z]/.test(val)) matchCount++;
      }
      return matchCount >= Math.max(1, sampleSize * 0.5);
    };
    const isIfcPrimary = looksLikeIfcHierarchy();
    primaryEntry = {
      id: makeId(),
      name: isIfcPrimary ? "IFC entity" : "Primární klasifikace",
      sourceName: sourceSheet.name || "Zdroj",
      nodes: primaryNodes,
      isPrimary: true,
      isIfcSystem: isIfcPrimary,
      systemKind: isIfcPrimary ? "ifc" : "classification",
    };
    classificationEntries.push(primaryEntry);

    const klasifikaceSheets = wb.worksheets.filter(
      (ws) => ws.name && ws.name.startsWith(KLASIFIKACE_LIST_PREFIX)
    );
    for (const mc of mappedColInfos) {
      let entry = klasifikaceSheets
        .map((ws) => ({
          sheet: ws,
          baseName: ws.name!.replace(KLASIFIKACE_LIST_PREFIX, ""),
        }))
        .find((x) => x.baseName === mc.name)
        ?.sheet;
      let nodes: ClassificationNode[] = [];
      if (entry) {
        const sh1 = entry.getRow(1);
        const cCode = findCol(sh1, "Třídící_kód") >= 0 ? findCol(sh1, "Třídící_kód") : findCol(sh1, "Kód");
        const cPopis = findCol(sh1, "Popis");
        const cUroven = findCol(sh1, "Úroveň");
        if (cCode >= 0 && cPopis >= 0 && cUroven >= 0) {
          const flat: Array<{ code: string; description: string; level: number }> = [];
          for (let r = 2; r <= (entry.rowCount ?? 0); r++) {
            const rw = entry.getRow(r);
            const code = getVal(rw, cCode);
            const desc = getVal(rw, cPopis);
            const lvl = Number(rw.getCell(cUroven).value) || flat.length + 1;
            if (code || desc) flat.push({ code: code || desc, description: desc || code, level: lvl });
          }
          flat.sort((a, b) => a.level - b.level || (a.code || "").localeCompare(b.code || ""));
          const stack: ClassificationNode[] = [];
          flat.forEach((f) => {
            const node: ClassificationNode = { code: f.code, description: f.description, level: f.level, children: [] };
            while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
            (stack.length ? stack[stack.length - 1].children! : nodes).push(node);
            stack.push(node);
          });
        }
      }
      if (nodes.length === 0) {
        const values = new Set<string>();
        for (let r = 2; r <= (sourceSheet.rowCount ?? 0); r++) {
          const val = getVal(sourceSheet.getRow(r), mc.col);
          if (val) values.add(val);
        }
        nodes = [...values].map((v) => ({ code: v, description: v, level: 1, children: [] as ClassificationNode[] }));
      }
      const mappedEntry: ClassificationSystemEntry = {
        id: makeId(),
        name: mc.name,
        sourceName: mc.name,
        nodes,
        isPrimary: false,
        systemKind: mc.isAuthoring ? "authoring" : "classification",
      };
      classificationEntries.push(mappedEntry);
      mappedSystemCols.push({ header: mc.header, entry: mappedEntry, isAuthoring: mc.isAuthoring });
    }

    primaryEntry.mappedSystemIds = mappedSystemCols.map((m) => m.entry.id);
    const authoringIds = mappedSystemCols.filter((m) => m.isAuthoring).map((m) => m.entry.id);
    if (authoringIds.length > 0) primaryEntry.authoringToolSystemIds = authoringIds;
  }

  const objects: Record<string, ProjectObject> = {};
  if (sourceSheet && primaryEntry) {
    const h1 = sourceSheet.getRow(1);
    const colKod = findCol(h1, "Třídící_kód");
    const hierarchyColsObj: Array<{ col: number; level: number }> = [];
    for (let i = 1; i <= MAX_COLS; i++) {
      const v = getVal(h1, i);
      const m = v.match(/^Třídění_úroveň_(\d+)$/i);
      if (m) hierarchyColsObj.push({ col: i, level: parseInt(m[1], 10) });
    }
    hierarchyColsObj.sort((a, b) => a.level - b.level);
    const getCodeFromRowObj = (row: ExcelJS.Row): string => {
      const kod = colKod >= 0 ? getVal(row, colKod) : "";
      if (kod) return kod;
      const path = hierarchyColsObj.map((h) => getVal(row, h.col));
      return path.filter(Boolean).join("::") || "";
    };
    const colIfcEntity = findCol(h1, "IFC_entita") >= 0 ? findCol(h1, "IFC_entita") : findCol(h1, "IFC Entita");
    const colPredefined = findCol(h1, "IFC_predefinedType") >= 0 ? findCol(h1, "IFC_predefinedType") : findCol(h1, "IFC PredefinedType");
    const colIfcEntityCz = findCol(h1, "IFC_entita_CZ");
    const colPredefinedCz = findCol(h1, "IFC_predefinedType_CZ");
    const colPopis = findCol(h1, "Popis");
    const colPoznamka = findCol(h1, "Poznámka");
    const colPriklady = findCol(h1, "Příklady");

    const seenCodes = new Set<string>();
    for (let r = 2; r <= (sourceSheet.rowCount ?? 0); r++) {
      const row = sourceSheet.getRow(r);
      const code = getCodeFromRowObj(row);
      if (!code || seenCodes.has(code)) continue;
      seenCodes.add(code);

      const leafNode = primaryEntry ? findNodeByCode(primaryEntry.nodes ?? [], code) : undefined;
      const mappedValues: Record<string, string> = {};
      mappedSystemCols.forEach((m) => {
        const col = findCol(h1, m.header);
        if (col >= 0) {
          const val = getVal(row, col);
          if (val) mappedValues[m.entry.id] = val;
        }
      });
      if (leafNode && Object.keys(mappedValues).length > 0) {
        leafNode.mappedValues = mappedValues;
      }

      let ifcEntity = getVal(row, colIfcEntity);
      let predefinedRaw = getVal(row, colPredefined);
      const fromCodeObj = parseIfcFromCode(code);
      if ((!ifcEntity || !predefinedRaw) && fromCodeObj) {
        if (!ifcEntity) ifcEntity = fromCodeObj.ifcEntity;
        if (!predefinedRaw) predefinedRaw = fromCodeObj.predefinedType;
      }
      const predefined = predefinedRaw ? normalizePredefinedType(predefinedRaw) : "";
      const effectiveIfcEntity = ifcEntity || fromCodeObj?.ifcEntity || "";
      const effectivePredefined = predefined || fromCodeObj?.predefinedType || "NOTDEFINED";
      if (leafNode && effectiveIfcEntity) {
        leafNode.ifcEntity = effectiveIfcEntity;
        leafNode.predefinedType = effectivePredefined;
        const ifcSystemId = primaryEntry.mappedSystemIds?.find((sid) =>
          classificationEntries.some((e) => e.id === sid && e.isIfcSystem)
        );
        if (ifcSystemId) {
          if (!leafNode.mappedValues) leafNode.mappedValues = {};
          leafNode.mappedValues[ifcSystemId] = `${effectiveIfcEntity}::${effectivePredefined}`;
        }
      }
      const description = primaryEntry ? (findNodeByCode(primaryEntry.nodes ?? [], code)?.description ?? "") : "";
      const ifcEntityCz = colIfcEntityCz >= 0 ? getVal(row, colIfcEntityCz) : undefined;
      const predefinedCz = colPredefinedCz >= 0 ? getVal(row, colPredefinedCz) : undefined;
      // V listu POŽADAVKY je každý řádek požadavek – sloupce Popis, Poznámka, Příklady patří požadavku, ne objektu. Nepřebírat je na objekt.
      const objectPopisPoznamkaPriklady =
        sourceSheet === pozadavkySheet
          ? {}
          : {
              popis: getVal(row, colPopis) || undefined,
              poznamka: getVal(row, colPoznamka) || undefined,
              priklady: getVal(row, colPriklady) || undefined,
            };
      objects[code] = {
        code,
        description,
        ifcEntity: ifcEntity || "",
        ...(ifcEntityCz?.trim() && { ifcEntityCz: ifcEntityCz.trim() }),
        predefinedType:
          predefined ? { mode: "ENUM" as const, value: predefined } : { mode: "NONE" as const },
        ...(predefinedCz?.trim() && { predefinedTypeCz: predefinedCz.trim() }),
        ifcEntityPhases: phases.map((p) => p.id),
        predefinedTypePhases: phases.map((p) => p.id),
        ...objectPopisPoznamkaPriklady,
        requirements: {
          attributes: [],
          properties: [],
          relations: [],
          classifications: [
            {
              id: makeId(),
              classificationId: primaryEntry?.id ?? "",
              systemEntryId: primaryEntry?.id,
              system: primaryEntry?.name ?? "Klasifikace",
              identification: code,
              value: code,
              name: description,
              readOnly: true,
              occurrence: "required",
              isApplicability: true,
              extensions: {},
              phases: phases.map((p) => p.id),
            },
          ],
          materials: [],
        },
      };
    }
  }

  const codeListByName = new Map<string, CodeList>();
  codeLists.forEach((c) => codeListByName.set(c.name, c));

  if (pozadavkySheet) {
    const h1 = pozadavkySheet.getRow(1);
    const colKodPoz = findCol(h1, "Třídící_kód");
    const hierarchyColsPoz: Array<{ col: number; level: number }> = [];
    for (let i = 1; i <= MAX_COLS; i++) {
      const v = getVal(h1, i);
      const m = v.match(/^Třídění_úroveň_(\d+)$/i);
      if (m) hierarchyColsPoz.push({ col: i, level: parseInt(m[1], 10) });
    }
    hierarchyColsPoz.sort((a, b) => a.level - b.level);
    const getCodeFromPozRow = (row: ExcelJS.Row): string => {
      const kod = colKodPoz >= 0 ? getVal(row, colKodPoz) : "";
      if (kod) return kod;
      const path = hierarchyColsPoz.map((h) => getVal(row, h.col));
      return path.filter(Boolean).join("::") || "";
    };
    const colTyp = findCol(h1, "Typ_požadavku");
    const colIfcEntityPoz = findCol(h1, "IFC_entita") >= 0 ? findCol(h1, "IFC_entita") : findCol(h1, "IFC Entita");
    const colPredefinedPoz = findCol(h1, "IFC_predefinedType") >= 0 ? findCol(h1, "IFC_predefinedType") : findCol(h1, "IFC PredefinedType");
    const colIfcEntityCzPoz = findCol(h1, "IFC_entita_CZ");
    const colPredefinedCzPoz = findCol(h1, "IFC_predefinedType_CZ");
    const colSkupina =
      findCol(h1, "Skupina") >= 0
        ? findCol(h1, "Skupina")
        : findCol(h1, "Skupina_vlastností") >= 0
          ? findCol(h1, "Skupina_vlastností")
          : findCol(h1, "Seskupení");
    const colSkupinaCz = findCol(h1, "Skupina_CZ");
    const colParametrHodnoty = findCol(h1, "Parametr_hodnoty");
    const colParametrHodnotyCz = findCol(h1, "Parametr_hodnoty_CZ");
    const colDataType = findCol(h1, "IFC_datový_typ");
    const colOmezeni = findCol(h1, "Omezení");
    const colHodnoty = findCol(h1, "Požadované_hodnoty");
    const colHodnotyCz = findCol(h1, "Požadované_hodnoty_CZ");
    const colJednotka = findCol(h1, "Jednotka");
    const colCiselnik = findCol(h1, "Číselník");
    const colUri = findCol(h1, "URI");
    const colPopis = findCol(h1, "Popis");
    const colPoznamka = findCol(h1, "Poznámka");
    const colPriklady = findCol(h1, "Příklady");
    const colVyskyt = findCol(h1, "Výskyt");

    const phaseCols: Array<{ col: number; phaseId: string }> = [];
    if (colVyskyt >= 0) {
      for (let i = colVyskyt + 1; i <= MAX_COLS; i++) {
        const v = getVal(h1, i);
        if (v && phaseByName.has(v)) {
          const p = phaseByName.get(v)!;
          phaseCols.push({ col: i, phaseId: p.id });
        }
      }
    }

    for (let r = 2; r <= (pozadavkySheet.rowCount ?? 0); r++) {
      const row = pozadavkySheet.getRow(r);
      const code = getCodeFromPozRow(row);
      if (!code) continue;
      let obj = objects[code];
      const ifcEntityCzVal = colIfcEntityCzPoz >= 0 ? getVal(row, colIfcEntityCzPoz) : "";
      const predefinedCzVal = colPredefinedCzPoz >= 0 ? getVal(row, colPredefinedCzPoz) : "";
      const skupinaCzVal = colSkupinaCz >= 0 ? getVal(row, colSkupinaCz) : "";
      const parametrCzVal = colParametrHodnotyCz >= 0 ? getVal(row, colParametrHodnotyCz) : "";
      const hodnotyCzVal = colHodnotyCz >= 0 ? getVal(row, colHodnotyCz) : "";
      let ifcEntityVal = colIfcEntityPoz >= 0 ? getVal(row, colIfcEntityPoz) : "";
      let predefinedVal = colPredefinedPoz >= 0 ? getVal(row, colPredefinedPoz) : "";
      const fromCode = parseIfcFromCode(code);
      if ((!ifcEntityVal || !predefinedVal) && fromCode) {
        if (!ifcEntityVal) ifcEntityVal = fromCode.ifcEntity;
        if (!predefinedVal) predefinedVal = fromCode.predefinedType;
      }
      if (!obj) {
        const descFromHierarchy = getVal(row, findCol(h1, "Třídění_úroveň_1") || 0) || code;
        obj = {
          code,
          description: descFromHierarchy,
          ifcEntity: ifcEntityVal || "",
          ...(ifcEntityCzVal?.trim() && { ifcEntityCz: ifcEntityCzVal.trim() }),
          predefinedType: (() => {
            const pt = predefinedVal ? normalizePredefinedType(predefinedVal) : "";
            return pt ? { mode: "ENUM" as const, value: pt } : { mode: "NONE" as const };
          })(),
          ...(predefinedCzVal?.trim() && { predefinedTypeCz: predefinedCzVal.trim() }),
          ifcEntityPhases: phases.map((p) => p.id),
          predefinedTypePhases: phases.map((p) => p.id),
          requirements: {
            attributes: [],
            properties: [],
            relations: [],
            classifications: [
              {
                id: makeId(),
                classificationId: primaryEntry?.id ?? "",
                systemEntryId: primaryEntry?.id,
                system: primaryEntry?.name ?? "Klasifikace",
                identification: code,
                value: code,
                name: descFromHierarchy,
                readOnly: true,
                occurrence: "required",
                isApplicability: true,
                extensions: {},
                phases: phases.map((p) => p.id),
              },
            ],
            materials: [],
          },
        };
        objects[code] = obj;
      } else {
        // Přepsat IFC_entita a IFC_predefinedType z řádku (nebo z kódu IfcEntity::PredefinedType), aby mapování a filtrování v hierarchii fungovalo
        const fallbackFromCode = fromCode ?? parseIfcFromCode(code);
        const newIfcEntity = ifcEntityVal || fallbackFromCode?.ifcEntity || "";
        const newPredefined = predefinedVal ? normalizePredefinedType(predefinedVal) : (fallbackFromCode?.predefinedType || "");
        if (newIfcEntity || newPredefined) {
          obj.ifcEntity = newIfcEntity;
          if (ifcEntityCzVal?.trim()) obj.ifcEntityCz = ifcEntityCzVal.trim();
          obj.predefinedType = newPredefined ? { mode: "ENUM" as const, value: newPredefined } : { mode: "NONE" as const };
          if (newPredefined && predefinedCzVal?.trim()) obj.predefinedTypeCz = predefinedCzVal.trim();
          const leafNodePoz = primaryEntry ? findNodeByCode(primaryEntry.nodes ?? [], code) : undefined;
          if (leafNodePoz && newIfcEntity) {
            leafNodePoz.ifcEntity = newIfcEntity;
            leafNodePoz.predefinedType = newPredefined || "NOTDEFINED";
            const ifcSystemIdPoz = primaryEntry.mappedSystemIds?.find((sid) =>
              classificationEntries.some((e) => e.id === sid && e.isIfcSystem)
            );
            if (ifcSystemIdPoz) {
              if (!leafNodePoz.mappedValues) leafNodePoz.mappedValues = {};
              leafNodePoz.mappedValues[ifcSystemIdPoz] = `${newIfcEntity}::${newPredefined || "NOTDEFINED"}`;
            }
          }
        }
      }

      const typRaw = getVal(row, colTyp).toLowerCase();
      const typ = TYP_POZADAVKU[typRaw as keyof typeof TYP_POZADAVKU];
      const skupina = colSkupina >= 0 ? getVal(row, colSkupina) : "";
      const parametrHodnoty = colParametrHodnoty >= 0 ? getVal(row, colParametrHodnoty) : "";
      const dataType = getVal(row, colDataType);
      const omezeniRaw = getVal(row, colOmezeni).toLowerCase();
      const constraint = OMEZENI_MAP[omezeniRaw] || "FILLED";
      const hodnotyRaw = getVal(row, colHodnoty);
      const hodnoty = constraint === "ENUM" ? parseEnumValues(hodnotyRaw) : [];
      const jednotka = getVal(row, colJednotka);
      const ciselnikName = getVal(row, colCiselnik);
      const uri = getVal(row, colUri);
      const popis = getVal(row, colPopis);
      const poznamka = getVal(row, colPoznamka);
      const priklady = getVal(row, colPriklady);
      const vyskytRaw = getVal(row, colVyskyt).toLowerCase();
      const occurrence = VYSKYT_MAP[vyskytRaw] || "required";

      const reqPhases: string[] = [];
      phaseCols.forEach(({ col, phaseId }) => {
        if (getVal(row, col).toLowerCase() === "ano") reqPhases.push(phaseId);
      });
      const phasesForReq = reqPhases.length > 0 ? reqPhases : phases.map((p) => p.id);

      const cl = ciselnikName ? codeListByName.get(ciselnikName) : undefined;
      const extensions = cl ? { [ENUM_CODELIST_ID_KEY]: cl.id } : {};

      if (typ === "attribute") {
        const req: AttributeRequirement = {
          id: makeId(),
          attribute: parametrHodnoty || skupina || "Name",
          ...(parametrCzVal?.trim() && { attributeCz: parametrCzVal.trim() }),
          required: occurrence === "required",
          dataType: dataType || undefined,
          occurrence: occurrence as "required" | "optional" | "prohibited",
          constraint: constraint as AttributeRequirement["constraint"],
          value: constraint !== "ENUM" ? hodnotyRaw || undefined : undefined,
          ...(hodnotyCzVal?.trim() && (constraint !== "ENUM" || !cl) && { valueCz: hodnotyCzVal.trim() }),
          allowedValues: constraint === "ENUM" ? (hodnoty.length ? hodnoty : cl?.values) : undefined,
          unit: jednotka || undefined,
          uri: uri || undefined,
          popis: popis || undefined,
          note: poznamka || undefined,
          priklady: priklady || undefined,
          extensions,
          phases: phasesForReq,
        };
        obj.requirements.attributes.push(req);
      } else if (typ === "property") {
        const [psetNameFallback, propNameFallback] = skupina.includes(".")
          ? skupina.split(".", 2)
          : [skupina, ""];
        const psetName = skupina || psetNameFallback || "_NEW_";
        const source = psetName.startsWith("Qto_")
          ? ("QTO" as const)
          : psetName.startsWith("Pset_")
            ? ("PSET" as const)
            : ("CUSTOM" as const);
        const req: PropertyRequirement = {
          id: makeId(),
          source,
          psetName,
          ...(skupinaCzVal?.trim() && { psetNameCz: skupinaCzVal.trim() }),
          propertyName: parametrHodnoty || propNameFallback || "_NEW_",
          ...(parametrCzVal?.trim() && { propertyNameCz: parametrCzVal.trim() }),
          dataType: dataType || "IfcLabel",
          required: occurrence === "required",
          occurrence: occurrence as "required" | "optional" | "prohibited",
          constraint: (constraint || "FILLED") as PropertyRequirement["constraint"],
          value: constraint !== "ENUM" ? hodnotyRaw || undefined : undefined,
          ...(hodnotyCzVal?.trim() && (constraint !== "ENUM" || !cl) && { valueCz: hodnotyCzVal.trim() }),
          allowedValues: constraint === "ENUM" ? (hodnoty.length ? hodnoty : cl?.values) : undefined,
          unit: jednotka || undefined,
          uri: uri || undefined,
          popis: popis || undefined,
          note: poznamka || undefined,
          priklady: priklady || undefined,
          extensions,
          phases: phasesForReq,
        };
        obj.requirements.properties.push(req);
      } else if (typ === "relation") {
        const entitySource = parametrHodnoty.match(/IFCREL\w+/i) ? skupina : parametrHodnoty;
        const [entityType, entityPredefinedType] = entitySource.includes(".")
          ? entitySource.split(".", 2)
          : [entitySource, undefined];
        const relTypeFromHodnoty = hodnotyRaw.match(/IFCREL\w+/i) ?? parametrHodnoty.match(/IFCREL\w+/i);
        const req: RelationRequirement = {
          id: makeId(),
          relationType: (relTypeFromHodnoty?.[0].toUpperCase() as RelationRequirement["relationType"]) || "IFCRELAGGREGATES",
          ...(parametrCzVal?.trim() && { entityTypeCz: parametrCzVal.trim() }),
          ...(hodnotyCzVal?.trim() && { relationTypeCz: hodnotyCzVal.trim() }),
          entityType: entityType || undefined,
          entityPredefinedType: entityPredefinedType || undefined,
          occurrence: occurrence as "required" | "optional" | "prohibited",
          popis: popis || undefined,
          note: poznamka || undefined,
          priklady: priklady || undefined,
          extensions: {},
          phases: phasesForReq,
        };
        if (relTypeFromHodnoty) req.relationType = relTypeFromHodnoty[0].toUpperCase() as RelationRequirement["relationType"];
        obj.requirements.relations.push(req);
      } else if (typ === "classification") {
        const sysEntry = classificationEntries.find(
          (e) =>
            e.name === skupina ||
            e.name?.includes(skupina) ||
            e.name === parametrHodnoty ||
            e.name?.includes(parametrHodnoty)
        );
        if (sysEntry?.isPrimary) continue;
        if (sysEntry?.isIfcSystem) continue;
        const identificationFromNote = poznamka.match(/\[Identifikace:\s*([^\]]+)\]/);
        const identification = identificationFromNote?.[1]?.trim() || code;
        const noteWithoutIdentification = poznamka.replace(/\s*\[Identifikace:\s*[^\]]+\]\s*/g, "").trim();
        const req: ClassificationRequirement = {
          id: makeId(),
          classificationId: primaryEntry?.id ?? "",
          systemEntryId: sysEntry?.id,
          system: parametrHodnoty || skupina || "Klasifikace",
          ...(parametrCzVal?.trim() && { systemCz: parametrCzVal.trim() }),
          identification,
          value: constraint === "ENUM" && hodnoty.length ? hodnoty.join(";") : (hodnotyRaw || code),
          ...(hodnotyCzVal?.trim() && constraint !== "ENUM" && { valueCz: hodnotyCzVal.trim() }),
          name: parametrHodnoty || "Klasifikace",
          occurrence: occurrence as "required" | "optional" | "prohibited",
          constraint: (constraint || "FILLED") as ClassificationRequirement["constraint"],
          uri: uri || undefined,
          description: popis || undefined,
          note: noteWithoutIdentification || undefined,
          priklady: priklady || undefined,
          extensions: {},
          phases: phasesForReq,
        };
        if (sysEntry && !sysEntry.isIfcSystem) {
          obj.requirements.classifications.push(req);
        }
      } else if (typ === "material") {
        const req: MaterialRequirement = {
          id: makeId(),
          required: occurrence === "required",
          occurrence: occurrence as "required" | "optional" | "prohibited",
          categoryMode: (parametrHodnoty || skupina) ? "SIMPLE" : "NONE",
          category: parametrHodnoty || skupina || undefined,
          ...(parametrCzVal?.trim() && { categoryCz: parametrCzVal.trim() }),
          constraint: (constraint || "FILLED") as MaterialRequirement["constraint"],
          value:
            constraint === "ENUM"
              ? (hodnoty.length ? hodnoty : cl?.values ?? []).join(";")
              : hodnotyRaw || undefined,
          ...(hodnotyCzVal?.trim() && (constraint !== "ENUM" || !cl) && { valueCz: hodnotyCzVal.trim() }),
          extensions,
          popis: popis || undefined,
          note: poznamka || undefined,
          priklady: priklady || undefined,
          phases: phasesForReq,
        };
        obj.requirements.materials.push(req);
      }
    }
  }

  const classification = {
    nodes: primaryEntry?.nodes ?? [],
    sourceName: primaryEntry?.name ?? "Klasifikace",
    hash: undefined as string | undefined,
  };

  const project: Project = {
    projectId: makeId(),
    name: projectName,
    author: projectAuthor,
    description: projectDescription,
    createdAt: now,
    updatedAt: now,
    ifcSchemaVersion: "IFC4X3",
    ifcSchemaVersionDisplay: ifcSchema || undefined,
    ifcDocumentationUrl: ifcDocumentationUrl.trim() || undefined,
    modelDefinitionViewMvd: modelDefinitionViewMvd.trim() || undefined,
    classification,
    classifications: [],
    primaryClassificationId: primaryEntry?.id ?? makeId(),
    phases,
    objects,
    codeLists,
    classificationSystemEntries: classificationEntries,
  };

  return {
    project: ensureProjectPhases(project),
    warnings,
  };
}
