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
import { ENUM_CODELIST_ID_KEY } from "../project/enumeration";

/**
 * Style constants for Excel formatting
 */
const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF4F46E5" }, // Indigo-600
};

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

/**
 * Apply header styling to a row
 */
const styleHeaderRow = (row: ExcelJS.Row) => {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = HEADER_ALIGNMENT;
    cell.border = CELL_BORDER;
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
 * Format phases array as semicolon-separated string
 */
const formatPhases = (phases?: string[]): string => {
  if (!phases || phases.length === 0) return "";
  return phases.join(";");
};

/**
 * Format boolean as ANO/NE
 */
const formatBoolean = (value?: boolean): string => {
  return value ? "ANO" : "NE";
};

/**
 * Create Sheet 1: PROJEKT (metadata)
 */
const createProjectSheet = (workbook: ExcelJS.Workbook, project: Project) => {
  const sheet = workbook.addWorksheet("PROJEKT");

  // Headers
  const headers = [
    "projectId",
    "name",
    "author",
    "description",
    "ifcSchemaVersion",
    "ifcSchemaVersionDisplay",
    "primaryClassificationId",
    "createdAt",
    "updatedAt",
  ];
  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);

  // Data
  const dataRow = sheet.addRow([
    project.projectId,
    project.name,
    project.author || "",
    project.description || "",
    project.ifcSchemaVersion,
    project.ifcSchemaVersionDisplay || "",
    project.primaryClassificationId,
    project.createdAt,
    project.updatedAt,
  ]);
  styleDataRow(dataRow);

  finalizeSheet(sheet, [36, 30, 20, 40, 15, 20, 36, 22, 22]);
};

/**
 * Create Sheet 2: FÁZE (Phases)
 */
const createPhasesSheet = (workbook: ExcelJS.Workbook, phases: Phase[]) => {
  const sheet = workbook.addWorksheet("FÁZE");

  const headers = ["id", "code", "name", "description"];
  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);

  phases.forEach((phase, index) => {
    const row = sheet.addRow([
      phase.id,
      phase.code,
      phase.name,
      phase.description || "",
    ]);
    styleDataRow(row, index % 2 === 1);
  });

  finalizeSheet(sheet, [36, 10, 30, 50]);
};

/**
 * Create Sheet 3: ČÍSELNÍKY (Code Lists)
 */
const createCodeListsSheet = (workbook: ExcelJS.Workbook, codeLists: CodeList[]) => {
  const sheet = workbook.addWorksheet("ČÍSELNÍKY");

  const headers = ["id", "name", "values", "note"];
  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);

  codeLists.forEach((codeList, index) => {
    const row = sheet.addRow([
      codeList.id,
      codeList.name,
      (codeList.values || []).join(";"),
      codeList.note || "",
    ]);
    styleDataRow(row, index % 2 === 1);
  });

  finalizeSheet(sheet, [36, 25, 60, 40]);
};

/**
 * Create Sheet 4: KLASIFIKAČNÍ_SYSTÉMY (Classification System Entries)
 */
const createClassificationSystemsSheet = (
  workbook: ExcelJS.Workbook,
  entries: ClassificationSystemEntry[]
) => {
  const sheet = workbook.addWorksheet("KLASIFIKAČNÍ_SYSTÉMY");

  const headers = ["id", "name", "uri", "description", "isPrimary", "sourceName"];
  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);

  entries.forEach((entry, index) => {
    const row = sheet.addRow([
      entry.id,
      entry.name,
      entry.uri || "",
      entry.description || "",
      formatBoolean(entry.isPrimary),
      entry.sourceName || "",
    ]);
    styleDataRow(row, index % 2 === 1);
  });

  finalizeSheet(sheet, [36, 25, 40, 40, 12, 30]);
};

/**
 * Flatten classification tree to rows
 */
const flattenClassificationNodes = (
  nodes: ClassificationNode[],
  systemId: string,
  parentCode: string = ""
): Array<{
  systemId: string;
  code: string;
  description: string;
  level: number;
  parentCode: string;
  category?: string;
  ifcEntity?: string;
  predefinedType?: string;
}> => {
  const rows: Array<{
    systemId: string;
    code: string;
    description: string;
    level: number;
    parentCode: string;
    category?: string;
    ifcEntity?: string;
    predefinedType?: string;
  }> = [];

  nodes.forEach((node) => {
    rows.push({
      systemId,
      code: node.code,
      description: node.description,
      level: node.level,
      parentCode,
      category: node.category,
      ifcEntity: node.ifcEntity,
      predefinedType: node.predefinedType,
    });

    if (node.children && node.children.length > 0) {
      rows.push(...flattenClassificationNodes(node.children, systemId, node.code));
    }
  });

  return rows;
};

/**
 * Create Sheet 5: KLASIFIKACE_HIERARCHIE (Classification Tree)
 */
const createClassificationHierarchySheet = (
  workbook: ExcelJS.Workbook,
  entries: ClassificationSystemEntry[]
) => {
  const sheet = workbook.addWorksheet("KLASIFIKACE_HIERARCHIE");

  const headers = [
    "systemId",
    "code",
    "description",
    "level",
    "parentCode",
    "category",
    "ifcEntity",
    "predefinedType",
  ];
  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);

  let rowIndex = 0;
  entries.forEach((entry) => {
    if (entry.nodes && entry.nodes.length > 0) {
      const flatNodes = flattenClassificationNodes(entry.nodes, entry.id);
      flatNodes.forEach((node) => {
        const row = sheet.addRow([
          node.systemId,
          node.code,
          node.description,
          node.level,
          node.parentCode,
          node.category || "",
          node.ifcEntity || "",
          node.predefinedType || "",
        ]);
        styleDataRow(row, rowIndex % 2 === 1);
        rowIndex++;
      });
    }
  });

  finalizeSheet(sheet, [36, 15, 40, 8, 15, 20, 20, 20]);
};

/**
 * Create Sheet 6: OBJEKTY (Objects)
 * Includes authoring classification columns (e.g. Kategorie RVT) when primary system has mapped systems.
 */
const createObjectsSheet = (
  workbook: ExcelJS.Workbook,
  objects: Record<string, ProjectObject>,
  classificationSystemEntries: ClassificationSystemEntry[] = []
) => {
  const sheet = workbook.addWorksheet("OBJEKTY");

  const primaryEntry = classificationSystemEntries.find((e) => e.isPrimary);
  const authoringSystemIds = (primaryEntry?.authoringToolSystemIds?.length
    ? primaryEntry.authoringToolSystemIds
    : primaryEntry?.mappedSystemIds) ?? [];
  const effectiveKind = (e: ClassificationSystemEntry) =>
    e.systemKind ?? (e.isIfcSystem ? "ifc" : "classification");
  const authoringEntries = authoringSystemIds
    .map((id) => classificationSystemEntries.find((e) => e.id === id))
    .filter((e): e is ClassificationSystemEntry => !!e && effectiveKind(e) === "authoring");

  const headers = [
    "code",
    "description",
    "ifcEntity",
    "predefinedTypeMode",
    "predefinedTypeValue",
    ...authoringEntries.map((e) => `authoring_${e.name}`),
  ];
  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);

  const getAuthoringCode = (obj: ProjectObject, systemEntryId: string) =>
    (obj.authoringClassifications ?? []).find((a) => a.systemEntryId === systemEntryId)?.code ?? "";

  const objectList = Object.values(objects);
  objectList.forEach((obj, index) => {
    const row = sheet.addRow([
      obj.code,
      obj.description,
      obj.ifcEntity,
      obj.predefinedType.mode,
      obj.predefinedType.value || "",
      ...authoringEntries.map((e) => getAuthoringCode(obj, e.id)),
    ]);
    styleDataRow(row, index % 2 === 1);
  });

  const widths = [15, 40, 20, 18, 20, ...authoringEntries.map(() => 25)];
  finalizeSheet(sheet, widths);
};

/**
 * Get codeListId from extensions
 */
const getCodeListId = (extensions?: Record<string, unknown>): string => {
  if (!extensions) return "";
  return (extensions[ENUM_CODELIST_ID_KEY] as string) || "";
};

/**
 * Create Sheet 7: ATRIBUTY (Attribute Requirements)
 */
const createAttributesSheet = (
  workbook: ExcelJS.Workbook,
  objects: Record<string, ProjectObject>
) => {
  const sheet = workbook.addWorksheet("ATRIBUTY");

  const headers = [
    "id",
    "objectCode",
    "attribute",
    "dataType",
    "occurrence",
    "constraint",
    "value",
    "allowedValues",
    "unit",
    "phases",
    "codeListId",
    "note",
  ];
  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);

  let rowIndex = 0;
  Object.values(objects).forEach((obj) => {
    obj.requirements.attributes.forEach((attr: AttributeRequirement) => {
      const row = sheet.addRow([
        attr.id,
        obj.code,
        attr.attribute,
        attr.dataType || "",
        attr.occurrence || "required",
        attr.constraint,
        attr.value || "",
        (attr.allowedValues || []).join(";"),
        attr.unit || "",
        formatPhases(attr.phases),
        getCodeListId(attr.extensions),
        attr.note || "",
      ]);
      styleDataRow(row, rowIndex % 2 === 1);
      rowIndex++;
    });
  });

  finalizeSheet(sheet, [36, 15, 20, 15, 12, 12, 30, 30, 10, 20, 36, 40]);
};

/**
 * Create Sheet 8: VLASTNOSTI (Property Requirements)
 */
const createPropertiesSheet = (
  workbook: ExcelJS.Workbook,
  objects: Record<string, ProjectObject>
) => {
  const sheet = workbook.addWorksheet("VLASTNOSTI");

  const headers = [
    "id",
    "objectCode",
    "source",
    "psetName",
    "propertyName",
    "dataType",
    "occurrence",
    "constraint",
    "value",
    "unit",
    "phases",
    "codeListId",
    "note",
  ];
  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);

  let rowIndex = 0;
  Object.values(objects).forEach((obj) => {
    obj.requirements.properties.forEach((prop: PropertyRequirement) => {
      const row = sheet.addRow([
        prop.id,
        obj.code,
        prop.source,
        prop.psetName,
        prop.propertyName,
        prop.dataType,
        prop.occurrence || "required",
        prop.constraint || "",
        prop.value || "",
        prop.unit || "",
        formatPhases(prop.phases),
        getCodeListId(prop.extensions),
        prop.note || "",
      ]);
      styleDataRow(row, rowIndex % 2 === 1);
      rowIndex++;
    });
  });

  finalizeSheet(sheet, [36, 15, 10, 30, 25, 15, 12, 12, 30, 10, 20, 36, 40]);
};

/**
 * Create Sheet 9: RELACE (Relation Requirements)
 */
const createRelationsSheet = (
  workbook: ExcelJS.Workbook,
  objects: Record<string, ProjectObject>
) => {
  const sheet = workbook.addWorksheet("RELACE");

  const headers = [
    "id",
    "objectCode",
    "relationType",
    "entityType",
    "entityPredefinedType",
    "occurrence",
    "minCardinality",
    "maxCardinality",
    "phases",
    "note",
  ];
  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);

  let rowIndex = 0;
  Object.values(objects).forEach((obj) => {
    obj.requirements.relations.forEach((rel: RelationRequirement) => {
      const row = sheet.addRow([
        rel.id,
        obj.code,
        rel.relationType,
        rel.entityType || "",
        rel.entityPredefinedType || "",
        rel.occurrence || "required",
        rel.minCardinality ?? "",
        rel.maxCardinality ?? "",
        formatPhases(rel.phases),
        rel.note || "",
      ]);
      styleDataRow(row, rowIndex % 2 === 1);
      rowIndex++;
    });
  });

  finalizeSheet(sheet, [36, 15, 30, 20, 20, 12, 12, 12, 20, 40]);
};

/**
 * Create Sheet 10: KLASIFIKACE_POŽADAVKY (Classification Requirements)
 */
const createClassificationRequirementsSheet = (
  workbook: ExcelJS.Workbook,
  objects: Record<string, ProjectObject>
) => {
  const sheet = workbook.addWorksheet("KLASIFIKACE_POŽADAVKY");

  const headers = [
    "id",
    "objectCode",
    "systemEntryId",
    "system",
    "identification",
    "value",
    "name",
    "uri",
    "constraint",
    "isApplicability",
    "phases",
  ];
  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);

  let rowIndex = 0;
  Object.values(objects).forEach((obj) => {
    obj.requirements.classifications.forEach((cls: ClassificationRequirement) => {
      const row = sheet.addRow([
        cls.id,
        obj.code,
        cls.systemEntryId || "",
        cls.system,
        cls.identification,
        cls.value || "",
        cls.name,
        cls.uri || "",
        cls.constraint || "",
        formatBoolean(cls.isApplicability),
        formatPhases(cls.phases),
      ]);
      styleDataRow(row, rowIndex % 2 === 1);
      rowIndex++;
    });
  });

  finalizeSheet(sheet, [36, 15, 36, 25, 20, 20, 30, 40, 12, 15, 20]);
};

/**
 * Create Sheet 11: MATERIÁLY (Material Requirements)
 */
const createMaterialsSheet = (
  workbook: ExcelJS.Workbook,
  objects: Record<string, ProjectObject>
) => {
  const sheet = workbook.addWorksheet("MATERIÁLY");

  const headers = [
    "id",
    "objectCode",
    "occurrence",
    "categoryMode",
    "category",
    "uri",
    "constraint",
    "value",
    "phases",
    "codeListId",
    "note",
  ];
  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);

  let rowIndex = 0;
  Object.values(objects).forEach((obj) => {
    obj.requirements.materials.forEach((mat: MaterialRequirement) => {
      const row = sheet.addRow([
        mat.id,
        obj.code,
        mat.occurrence || "required",
        mat.categoryMode || "",
        mat.category || "",
        mat.uri || "",
        mat.constraint || "",
        mat.value || "",
        formatPhases(mat.phases),
        getCodeListId(mat.extensions),
        mat.note || "",
      ]);
      styleDataRow(row, rowIndex % 2 === 1);
      rowIndex++;
    });
  });

  finalizeSheet(sheet, [36, 15, 12, 15, 25, 40, 12, 30, 20, 36, 40]);
};

/**
 * Sheet selection options for selective export
 */
export interface SheetSelection {
  projekt: boolean;
  faze: boolean;
  ciselniky: boolean;
  klasifikacniSystemy: boolean;
  klasifikaceHierarchie: boolean;
  objekty: boolean;
  atributy: boolean;
  vlastnosti: boolean;
  relace: boolean;
  klasifikacePozadavky: boolean;
  materialy: boolean;
}

/**
 * Default selection - all sheets selected
 */
export const DEFAULT_SHEET_SELECTION: SheetSelection = {
  projekt: true,
  faze: true,
  ciselniky: true,
  klasifikacniSystemy: true,
  klasifikaceHierarchie: true,
  objekty: true,
  atributy: true,
  vlastnosti: true,
  relace: true,
  klasifikacePozadavky: true,
  materialy: true,
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

  // Create sheets based on selection
  if (selection.projekt) {
    createProjectSheet(workbook, project);
  }
  if (selection.faze) {
    createPhasesSheet(workbook, project.phases);
  }
  if (selection.ciselniky) {
    createCodeListsSheet(workbook, project.codeLists || []);
  }
  if (selection.klasifikacniSystemy) {
    createClassificationSystemsSheet(workbook, project.classificationSystemEntries || []);
  }
  if (selection.klasifikaceHierarchie) {
    createClassificationHierarchySheet(workbook, project.classificationSystemEntries || []);
  }
  if (selection.objekty) {
    createObjectsSheet(workbook, project.objects, project.classificationSystemEntries ?? []);
  }
  if (selection.atributy) {
    createAttributesSheet(workbook, project.objects);
  }
  if (selection.vlastnosti) {
    createPropertiesSheet(workbook, project.objects);
  }
  if (selection.relace) {
    createRelationsSheet(workbook, project.objects);
  }
  if (selection.klasifikacePozadavky) {
    createClassificationRequirementsSheet(workbook, project.objects);
  }
  if (selection.materialy) {
    createMaterialsSheet(workbook, project.objects);
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
 * Get statistics about export content
 */
export const getExportStatistics = (project: Project): {
  phases: number;
  codeLists: number;
  classificationSystems: number;
  objects: number;
  attributes: number;
  properties: number;
  relations: number;
  classifications: number;
  materials: number;
} => {
  const objects = Object.values(project.objects);

  return {
    phases: project.phases.length,
    codeLists: (project.codeLists || []).length,
    classificationSystems: (project.classificationSystemEntries || []).length,
    objects: objects.length,
    attributes: objects.reduce((sum, obj) => sum + obj.requirements.attributes.length, 0),
    properties: objects.reduce((sum, obj) => sum + obj.requirements.properties.length, 0),
    relations: objects.reduce((sum, obj) => sum + obj.requirements.relations.length, 0),
    classifications: objects.reduce((sum, obj) => sum + obj.requirements.classifications.length, 0),
    materials: objects.reduce((sum, obj) => sum + obj.requirements.materials.length, 0),
  };
};
