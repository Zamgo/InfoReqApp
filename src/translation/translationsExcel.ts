/**
 * Export šablony překladů (Entity + PredefinedTypes) do Excelu a import z Excelu do CustomTranslations.
 * Jeden Excel může obsahovat překlady pro více IFC verzí – listy Entity/Entity_PredefinedType, PredefinedTypes, **Pset_Qto**.
 * Volitelný sloupec IFC_verze (IFC4 / IFC4X3) filtruje řádky podle verze projektu.
 */
import ExcelJS from "exceljs";
import type { SchemaIndex } from "../schema/types";
import type { CustomTranslations } from "../project/types";
import type { IfcSchemaVersion } from "../schema/ifcVersionConfig";

const SHEET_ENTITY = "Entity";
const SHEET_PREDEFINED_TYPES = "PredefinedTypes";
const COL_IFC_ENTITY = "IFC_entita";
const COL_PREDEFINED_TYPE = "PredefinedType";
const COL_TRANSLATION = "Překlad";
const COL_IFC_VERZE = "IFC_verze";

/** URL výchozího Excelu s překlady (v public/ifc/translations/). */
export const DEFAULT_TRANSLATIONS_EXCEL_URL = "/ifc/translations/Preklady.xlsx";

/** URL překladů podle IFC verze (soubory z IFC/TRANSLATION zkopírované do public/ifc/translations/). */
export const TRANSLATIONS_EXCEL_BY_VERSION: Record<IfcSchemaVersion, string> = {
  IFC4X3: "/ifc/translations/IFC_4_3_ADD2_cs.xlsx",
  IFC4: "/ifc/translations/IFC_4_ADD2_TC1_cs.xlsx",
};

/** Vrátí URL Excelu s překlady pro danou verzi (nebo jednotný Preklady.xlsx, pokud verze není zadaná). */
export function getDefaultTranslationsUrl(ifcVersion: IfcSchemaVersion | null): string {
  if (ifcVersion) return TRANSLATIONS_EXCEL_BY_VERSION[ifcVersion];
  return DEFAULT_TRANSLATIONS_EXCEL_URL;
}

/** Text buňky včetně RichText / výsledku vzorce (stejně jako import projektu z Excelu). */
function getCellText(cell: ExcelJS.Cell): string {
  const t = cell.text;
  if (t == null || t === undefined) return "";
  return String(t).replace(/\u00a0/g, " ").trim();
}

/** Vygeneruje Excel šablonu s listy Entity a PredefinedTypes z SchemaIndex. */
export async function createTranslationsTemplateWorkbook(
  schemaIndex: SchemaIndex
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "InfoReqApp";

  const entityOrder = schemaIndex.entityListOrder ?? Object.keys(schemaIndex.entities).sort();
  const entities = schemaIndex.entities;

  const entitySheet = wb.addWorksheet(SHEET_ENTITY);
  entitySheet.getColumn(1).width = 28;
  entitySheet.getColumn(2).width = 32;
  entitySheet.addRow([COL_IFC_ENTITY, COL_TRANSLATION]);
  for (const name of entityOrder) {
    const ent = entities[name];
    if (ent?.abstract) continue;
    entitySheet.addRow([name, ""]);
  }

  const ptSheet = wb.addWorksheet(SHEET_PREDEFINED_TYPES);
  ptSheet.getColumn(1).width = 28;
  ptSheet.getColumn(2).width = 24;
  ptSheet.getColumn(3).width = 32;
  ptSheet.addRow([COL_IFC_ENTITY, COL_PREDEFINED_TYPE, COL_TRANSLATION]);
  for (const entityName of entityOrder) {
    const ent = entities[entityName];
    if (!ent?.predefinedTypeValues?.length) continue;
    for (const pt of ent.predefinedTypeValues) {
      ptSheet.addRow([entityName, pt, ""]);
    }
  }

  return (await wb.xlsx.writeBuffer()) as ExcelJS.Buffer;
}

/** Stáhne šablonu překladů jako soubor. */
export async function downloadTranslationsTemplate(schemaIndex: SchemaIndex): Promise<void> {
  const buffer = await createTranslationsTemplateWorkbook(schemaIndex);
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Preklady_sablona.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

const findCol = (row: ExcelJS.Row, ...names: string[]) => {
  for (let i = 1; i <= 40; i++) {
    const v = getCellText(row.getCell(i)).toLowerCase();
    if (names.some((n) => n.toLowerCase() === v)) return i;
  }
  return -1;
};

/** Vrátí true, pokud má být řádek zahrnut pro danou IFC verzi (sloupec IFC_verze volitelný). */
function rowMatchesVersion(
  row: ExcelJS.Row,
  colVersion: number,
  ifcVersion: IfcSchemaVersion | null
): boolean {
  if (colVersion < 1 || !ifcVersion) return true;
  const v = getCellText(row.getCell(colVersion)).trim().toUpperCase();
  if (!v) return true;
  return v === ifcVersion.toUpperCase();
}

function findPsetQtoWorksheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet | undefined {
  for (const name of ["Pset_Qto", "pset_qto", "PSET_QTO"]) {
    const ws = wb.getWorksheet(name);
    if (ws) return ws;
  }
  for (const ws of wb.worksheets) {
    const n = ws.name?.trim() ?? "";
    if (/^pset[_-]?qto$/i.test(n)) return ws;
  }
  return undefined;
}

/** Načte Excel z bufferu a vrátí CustomTranslations. Volitelně filtruje řádky podle IFC_verze. */
export async function parseTranslationsFromBuffer(
  arrayBuffer: ArrayBuffer,
  schemaIndex: SchemaIndex | null,
  ifcVersion: IfcSchemaVersion | null = null
): Promise<CustomTranslations> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);

  const entities: Record<string, string> = {};
  const predefinedTypes: Record<string, string> = {};
  const entityDescriptionsCz: Record<string, string> = {};
  const entityDescriptionsEn: Record<string, string> = {};
  const predefinedTypeDescriptionsCz: Record<string, string> = {};
  const predefinedTypeDescriptionsEn: Record<string, string> = {};
  const propertySetNames: Record<string, string> = {};
  const propertyNames: Record<string, string> = {};

  const validEntities = schemaIndex
    ? new Set(Object.keys(schemaIndex.entities))
    : null;
  const validPredefinedByEntity = schemaIndex
    ? (entityName: string) => schemaIndex.entities[entityName]?.predefinedTypeValues ?? []
    : null;

  const entitySheet = wb.getWorksheet(SHEET_ENTITY) ?? wb.getWorksheet(1);
  if (entitySheet && (entitySheet.rowCount ?? 0) >= 1) {
    const header = entitySheet.getRow(1);
    const colTranslationCz = findCol(header, "Entity_PredefinedType_CZ", "Entity_PredefinedType_CZ");
    const colPredefinedType = findCol(header, COL_PREDEFINED_TYPE, "PredefinedType");
    const colLevel1 = findCol(header, "Entity_level_1", "Entity_level_1");
    const colDescCz = findCol(header, "Description_Definition_CZ");
    const colDescEn = findCol(header, "Description_Definition_EN");

    if (colTranslationCz >= 1 && colLevel1 >= 1) {
      for (let r = 2; r <= (entitySheet.rowCount ?? 0); r++) {
        const row = entitySheet.getRow(r);
        const translation = getCellText(row.getCell(colTranslationCz));
        const descCz = colDescCz >= 1 ? getCellText(row.getCell(colDescCz)) : "";
        const descEn = colDescEn >= 1 ? getCellText(row.getCell(colDescEn)) : "";

        if (!translation && !descCz && !descEn) continue;
        const entityLevels: string[] = [];
        for (let i = 1; i <= 8; i++) {
          const col = findCol(header, `Entity_level_${i}`);
          if (col >= 1) {
            const v = getCellText(row.getCell(col));
            if (v) entityLevels.push(v);
          }
        }
        const entityName = entityLevels.length > 0 ? entityLevels[entityLevels.length - 1]! : "";
        if (!entityName) continue;
        if (validEntities && !validEntities.has(entityName)) continue;
        const pt = colPredefinedType >= 1 ? getCellText(row.getCell(colPredefinedType)) : "";
        if (pt) {
          if (validPredefinedByEntity) {
            const allowed = validPredefinedByEntity(entityName);
            if (!allowed.some((p) => p === pt)) continue;
          }
          if (translation) predefinedTypes[`${entityName}::${pt}`] = translation;
          if (descCz) predefinedTypeDescriptionsCz[`${entityName}::${pt}`] = descCz;
          if (descEn) predefinedTypeDescriptionsEn[`${entityName}::${pt}`] = descEn;
        } else {
          if (translation) entities[entityName] = translation;
          if (descCz) entityDescriptionsCz[entityName] = descCz;
          if (descEn) entityDescriptionsEn[entityName] = descEn;
        }
      }
    } else {
      const colEntity = findCol(header, COL_IFC_ENTITY, "IFC_entita");
      const colTranslation = findCol(header, COL_TRANSLATION, "Překlad", "Translation");
      const colVerze = findCol(header, COL_IFC_VERZE, "IFC_verze");
      if (colEntity >= 1) {
        for (let r = 2; r <= (entitySheet.rowCount ?? 0); r++) {
          const row = entitySheet.getRow(r);
          if (!rowMatchesVersion(row, colVerze, ifcVersion)) continue;
          const entityName = getCellText(row.getCell(colEntity));
          const translation = colTranslation >= 1 ? getCellText(row.getCell(colTranslation)) : "";
          const descCz = colDescCz >= 1 ? getCellText(row.getCell(colDescCz)) : "";
          const descEn = colDescEn >= 1 ? getCellText(row.getCell(colDescEn)) : "";
          if (!entityName) continue;
          if (validEntities && !validEntities.has(entityName)) continue;
          if (translation) entities[entityName] = translation;
          if (descCz) entityDescriptionsCz[entityName] = descCz;
          if (descEn) entityDescriptionsEn[entityName] = descEn;
        }
      }
    }
  }

  const ptSheet = wb.getWorksheet(SHEET_PREDEFINED_TYPES) ?? wb.getWorksheet(2);
  if (ptSheet && (ptSheet.rowCount ?? 0) >= 1 && Object.keys(predefinedTypes).length === 0) {
    const header = ptSheet.getRow(1);
    const colEntity = findCol(header, COL_IFC_ENTITY, "IFC_entita");
    const colPt = findCol(header, COL_PREDEFINED_TYPE, "PredefinedType");
    const colTranslation = findCol(header, COL_TRANSLATION, "Překlad", "Translation");
    const colVerze = findCol(header, COL_IFC_VERZE, "IFC_verze");
    const colDescCz = findCol(header, "Description_Definition_CZ");
    const colDescEn = findCol(header, "Description_Definition_EN");

    if (colEntity >= 1 && colPt >= 1) {
      for (let r = 2; r <= (ptSheet.rowCount ?? 0); r++) {
        const row = ptSheet.getRow(r);
        if (!rowMatchesVersion(row, colVerze, ifcVersion)) continue;
        const entityName = getCellText(row.getCell(colEntity));
        const pt = getCellText(row.getCell(colPt));
        const translation = colTranslation >= 1 ? getCellText(row.getCell(colTranslation)) : "";
        const descCz = colDescCz >= 1 ? getCellText(row.getCell(colDescCz)) : "";
        const descEn = colDescEn >= 1 ? getCellText(row.getCell(colDescEn)) : "";
        if (!entityName || !pt) continue;
        if (validPredefinedByEntity) {
          const allowed = validPredefinedByEntity(entityName);
          if (!allowed.some((p) => p === pt)) continue;
        }
        if (translation) predefinedTypes[`${entityName}::${pt}`] = translation;
        if (descCz) predefinedTypeDescriptionsCz[`${entityName}::${pt}`] = descCz;
        if (descEn) predefinedTypeDescriptionsEn[`${entityName}::${pt}`] = descEn;
      }
    }
  }

  const psetQtoSheet = findPsetQtoWorksheet(wb);
  if (psetQtoSheet && (psetQtoSheet.rowCount ?? 0) >= 2) {
    const header = psetQtoSheet.getRow(1);
    const colNameEn = findCol(header, "Name_EN");
    const colNameCz = findCol(header, "Name_CZ");
    const colPropEn = findCol(header, "Property_Name_EN");
    const colPropCz = findCol(header, "Property_Name_CZ");
    const colVerze = findCol(header, COL_IFC_VERZE, "IFC_verze");
    if (colNameEn >= 1 && colNameCz >= 1 && colPropEn >= 1 && colPropCz >= 1) {
      for (let r = 2; r <= (psetQtoSheet.rowCount ?? 0); r++) {
        const row = psetQtoSheet.getRow(r);
        if (!rowMatchesVersion(row, colVerze, ifcVersion)) continue;
        const nameEn = getCellText(row.getCell(colNameEn));
        const nameCz = getCellText(row.getCell(colNameCz));
        const propEn = getCellText(row.getCell(colPropEn));
        const propCz = getCellText(row.getCell(colPropCz));
        if (nameEn && nameCz) propertySetNames[nameEn] = nameCz;
        if (nameEn && propEn && propCz) propertyNames[`${nameEn}::${propEn}`] = propCz;
      }
    }
  }

  return {
    entities,
    predefinedTypes,
    entityDescriptionsCz,
    entityDescriptionsEn,
    predefinedTypeDescriptionsCz,
    predefinedTypeDescriptionsEn,
    propertySetNames,
    propertyNames,
  };
}

/** Načte Excel ze souboru a vrátí CustomTranslations. */
export async function parseTranslationsExcel(
  file: File,
  schemaIndex: SchemaIndex | null,
  ifcVersion: IfcSchemaVersion | null = null
): Promise<CustomTranslations> {
  const arrayBuffer = await file.arrayBuffer();
  return parseTranslationsFromBuffer(arrayBuffer, schemaIndex, ifcVersion);
}

/** Stáhne výchozí Excel s překlady z URL a načte ho do CustomTranslations. Při 404 vrátí prázdné. */
export async function fetchAndParseDefaultTranslations(
  url: string,
  schemaIndex: SchemaIndex | null,
  ifcVersion: IfcSchemaVersion | null
): Promise<CustomTranslations> {
  const res = await fetch(url);
  if (!res.ok) return { entities: {}, predefinedTypes: {}, propertySetNames: {}, propertyNames: {} };
  const arrayBuffer = await res.arrayBuffer();
  return parseTranslationsFromBuffer(arrayBuffer, schemaIndex, ifcVersion);
}

/** Spustí stažení výchozího Excelu s překlady (pro danou IFC verzi nebo jednotný Preklady.xlsx). */
export function downloadDefaultTranslationsExcel(ifcVersion: IfcSchemaVersion | null): void {
  const url = getDefaultTranslationsUrl(ifcVersion);
  const name = ifcVersion ? (ifcVersion === "IFC4X3" ? "Preklady_IFC_4_3_ADD2_cs.xlsx" : "Preklady_IFC_4_ADD2_TC1_cs.xlsx") : "Preklady.xlsx";
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.click();
}
