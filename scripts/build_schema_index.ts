import fs from "fs";
import path from "path";
import { XMLParser } from "fast-xml-parser";

type PropertyDefinition = {
  name: string;
  dataType: string;
  unit?: string;
  allowedValues?: string[];
};

type PropertySetDefinition = {
  name: string;
  properties: PropertyDefinition[];
};

type QuantitySetDefinition = {
  name: string;
  quantities: PropertyDefinition[];
};

type PsetAssignment = string | { name: string; forPredefinedType?: string };

type SchemaEntity = {
  name: string;
  standardPsets: PsetAssignment[];
  standardQtoSets: PsetAssignment[];
  predefinedTypeValues: string[];
};

type SchemaIndex = {
  entities: Record<string, SchemaEntity>;
  psets: Record<string, PropertySetDefinition>;
  qtos: Record<string, QuantitySetDefinition>;
  dataTypes: string[];
};

const INPUT_PATH = path.resolve("IFC_4x3.json");
const PSET_QTO_DIR = path.resolve("IFC_4x3_Pset_Qto_Def");
const OUTPUT_DIR = path.resolve("public/ifc");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "schema_index_ifc4x3.json");

const fallbackDataTypes = [
  "IfcLabel",
  "IfcText",
  "IfcIdentifier",
  "IfcBoolean",
  "IfcInteger",
  "IfcReal",
  "IfcDate",
  "IfcDateTime",
  "IfcTime",
  "IfcDuration",
  "IfcPositiveLengthMeasure",
  "IfcAreaMeasure",
  "IfcVolumeMeasure",
  "IfcMassMeasure",
  "IfcPowerMeasure",
  "IfcPressureMeasure",
  "IfcThermodynamicTemperatureMeasure",
  "IfcQuantityCount",
  "IfcQuantityLength",
  "IfcQuantityArea",
  "IfcQuantityVolume",
  "IfcQuantityWeight",
  "IfcQuantityTime",
];

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const readJson = (file: string) => {
  if (!fs.existsSync(file)) {
    throw new Error(`Nenalezen vstupní soubor ${file}`);
  }
  const content = fs.readFileSync(file, "utf-8");
  return JSON.parse(content);
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  allowBooleanAttributes: true,
});

const normalizeToArray = <T>(value: T | T[] | undefined | null): T[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

const assignmentKey = (name: string, forPredefinedType?: string) =>
  `${name}::${forPredefinedType ?? ""}`;

const addAssignment = (
  list: PsetAssignment[],
  name: string,
  forPredefinedType?: string,
) => {
  const key = assignmentKey(name, forPredefinedType);
  for (const item of list) {
    if (typeof item === "string") {
      if (assignmentKey(item) === key) return;
    } else if (item?.name) {
      if (assignmentKey(item.name, item.forPredefinedType) === key) return;
    }
  }

  // Keep backward compatibility: store plain string when no PredefinedType is needed.
  if (!forPredefinedType) list.push(name);
  else list.push({ name, forPredefinedType });
};

const loadPsetXml = (name: string): PropertyDefinition[] | null => {
  const file = path.join(PSET_QTO_DIR, `${name}.xml`);
  if (!fs.existsSync(file)) return null;
  try {
    const xml = fs.readFileSync(file, "utf-8");
    const parsed = parser.parse(xml);
    const defs = parsed?.PropertySetDef?.PropertyDefs?.PropertyDef;
    if (!defs) return null;
    const arr = Array.isArray(defs) ? defs : [defs];
    const properties: PropertyDefinition[] = [];
    for (const d of arr) {
      const propName = d?.Name;
      if (!propName) continue;
      const pt = d?.PropertyType;
      let dataType = "UNKNOWN";
      let allowedValues: string[] | undefined;
      if (pt?.TypePropertySingleValue?.DataType?.type) {
        dataType = pt.TypePropertySingleValue.DataType.type;
      } else if (pt?.TypePropertyEnumeratedValue?.EnumList) {
        const list = pt.TypePropertyEnumeratedValue.EnumList;
        dataType = list?.name || "ENUM";
        const items = list?.EnumItem;
        if (items) {
          allowedValues = (Array.isArray(items) ? items : [items]).map(String);
        }
      }
      properties.push({ name: propName, dataType, allowedValues });
    }
    return properties;
  } catch (err) {
    console.warn(`⚠️ Nepodařilo se načíst ${file}:`, err);
    return null;
  }
};

const loadApplicableClasses = (name: string): string[] => {
  const file = path.join(PSET_QTO_DIR, `${name}.xml`);
  if (!fs.existsSync(file)) return [];
  try {
    const xml = fs.readFileSync(file, "utf-8");
    const parsed = parser.parse(xml);
    const root = parsed?.PropertySetDef ?? parsed?.QtoSetDef;
    const classNames = root?.ApplicableClasses?.ClassName;
    return normalizeToArray(classNames).map(String).filter(Boolean);
  } catch (err) {
    console.warn(`⚠️ Nepodařilo se načíst Applicability z ${file}:`, err);
    return [];
  }
};

const QTO_TYPE_MAP: Record<string, string> = {
  Q_COUNT: "IfcQuantityCount",
  Q_LENGTH: "IfcQuantityLength",
  Q_AREA: "IfcQuantityArea",
  Q_VOLUME: "IfcQuantityVolume",
  Q_WEIGHT: "IfcQuantityWeight",
  Q_TIME: "IfcQuantityTime",
};

const loadQtoXml = (name: string): PropertyDefinition[] | null => {
  const file = path.join(PSET_QTO_DIR, `${name}.xml`);
  if (!fs.existsSync(file)) return null;
  try {
    const xml = fs.readFileSync(file, "utf-8");
    const parsed = parser.parse(xml);
    const defs = parsed?.QtoSetDef?.QtoDefs?.QtoDef;
    if (!defs) return null;
    const arr = Array.isArray(defs) ? defs : [defs];
    const quantities: PropertyDefinition[] = [];
    for (const d of arr) {
      const qtoName = d?.Name;
      if (!qtoName) continue;
      const qtoType = d?.QtoType ?? "UNKNOWN";
      const dataType = QTO_TYPE_MAP[qtoType] ?? qtoType;
      quantities.push({ name: qtoName, dataType });
    }
    return quantities;
  } catch (err) {
    console.warn(`⚠️ Nepodařilo se načíst ${file}:`, err);
    return null;
  }
};

const derivePredefined = (
  classCode: string,
  propertiesByCode: Map<string, any>,
): string[] => {
  const enumName = `${classCode}TypeEnum`;
  const propertyEnumName = `${classCode.replace(/^Ifc/, "")}TypeEnum`;
  const candidates = [enumName, propertyEnumName];
  for (const candidate of candidates) {
    const prop = propertiesByCode.get(candidate);
    if (prop?.AllowedValues?.length) {
      return prop.AllowedValues.map((v: any) => v.Value || v.Code).filter(Boolean);
    }
  }
  return [];
};

const buildIndex = (): SchemaIndex => {
  const raw = readJson(INPUT_PATH);
  const classes: any[] = raw.Classes ?? [];
  const properties: any[] = raw.Properties ?? [];

  const propertiesByCode = new Map<string, any>();
  properties.forEach((p) => {
    if (p?.Code) propertiesByCode.set(p.Code, p);
  });

  const dataTypeSet = new Set<string>(
    properties.map((p) => p.DataType).filter(Boolean) as string[],
  );
  fallbackDataTypes.forEach((dt) => dataTypeSet.add(dt));

  const psets = new Map<string, PropertySetDefinition>();
  const qtos = new Map<string, QuantitySetDefinition>();
  const entities: Record<string, SchemaEntity> = {};
  const predefinedByParent = new Map<string, Set<string>>();

  const isPredefinedVariant = (cls: any) =>
    typeof cls?.Description === "string" &&
    cls.Description.toLowerCase().includes("predefined type") &&
    !!cls.ParentClassCode;

  // First pass: create main entities (skip predefined variants)
  for (const cls of classes) {
    if (!cls?.Code || isPredefinedVariant(cls)) continue;
    const entity: SchemaEntity = {
      name: cls.Code,
      standardPsets: [],
      standardQtoSets: [],
      predefinedTypeValues: [],
    };
    const psetSeen = new Set<string>();
    const qtoSeen = new Set<string>();

    const classProps: any[] = cls.ClassProperties ?? [];
    for (const cp of classProps) {
      const setName: string | undefined = cp.PropertySet;
      if (!setName) continue;
      const propCode: string = cp.PropertyCode;
      const propDef = propertiesByCode.get(propCode);
      const def: PropertyDefinition = {
        name: propCode,
        dataType: propDef?.DataType ?? "UNKNOWN",
        unit: propDef?.Unit,
        allowedValues: propDef?.AllowedValues?.map((v: any) => v.Value || v.Code),
      };

      if (setName.startsWith("Qto_")) {
        if (!qtos.has(setName)) {
          qtos.set(setName, { name: setName, quantities: [] });
        }
        qtos.get(setName)!.quantities.push(def);
        if (!qtoSeen.has(setName)) {
          entity.standardQtoSets.push(setName);
          qtoSeen.add(setName);
        }
      } else {
        if (!psets.has(setName)) {
          psets.set(setName, { name: setName, properties: [] });
        }
        psets.get(setName)!.properties.push(def);
        if (!psetSeen.has(setName)) {
          entity.standardPsets.push(setName);
          psetSeen.add(setName);
        }
      }
    }

    const predefined = derivePredefined(cls.Code, propertiesByCode);
    entity.predefinedTypeValues = Array.from(new Set([...predefined]));
    entities[cls.Code] = entity;
  }

  // Second pass: fold predefined variant classes into parent predefined enums
  for (const cls of classes) {
    if (!isPredefinedVariant(cls)) continue;
    const parent = cls.ParentClassCode;
    if (!parent) continue;
    const val = cls.Name || cls.Code.replace(parent, "");
    if (!predefinedByParent.has(parent)) predefinedByParent.set(parent, new Set());
    if (val) predefinedByParent.get(parent)!.add(String(val));
  }

  // Finalize predefined type lists with USERDEFINED
  for (const [code, entity] of Object.entries(entities)) {
    const collected = predefinedByParent.get(code);
    if (collected) {
      collected.forEach((v) => entity.predefinedTypeValues.push(v));
    }
    if (!entity.predefinedTypeValues.includes("USERDEFINED")) {
      entity.predefinedTypeValues.push("USERDEFINED");
    }
    entity.predefinedTypeValues = Array.from(new Set(entity.predefinedTypeValues));
  }

  // Override pset definitions from XML source when available
  for (const [name, def] of psets.entries()) {
    const xmlProps = loadPsetXml(name);
    if (xmlProps && xmlProps.length) {
      psets.set(name, { ...def, properties: xmlProps });
    }
  }

  // Override qto definitions from XML source when available
  for (const [name, def] of qtos.entries()) {
    const xmlQtos = loadQtoXml(name);
    if (xmlQtos && xmlQtos.length) {
      qtos.set(name, { ...def, quantities: xmlQtos });
    }
  }

  // Add missing Pset/Qto definitions and entity assignments from XML files.
  // This is required for type-driven override sets such as:
  // - ApplicableClasses: IfcWasteTerminal/WASTETRAP -> Pset_WasteTerminalTypeWasteTrap
  const xmlFiles = fs
    .readdirSync(PSET_QTO_DIR)
    .filter((f) => f.toLowerCase().endsWith(".xml"));

  for (const file of xmlFiles) {
    const setName = path.basename(file, ".xml");
    const isPset = setName.startsWith("Pset_");
    const isQto = setName.startsWith("Qto_");
    if (!isPset && !isQto) continue;

    if (isPset) {
      if (!psets.has(setName)) {
        const xmlProps = loadPsetXml(setName);
        psets.set(setName, { name: setName, properties: xmlProps ?? [] });
      }
    } else if (isQto) {
      if (!qtos.has(setName)) {
        const xmlQtos = loadQtoXml(setName);
        qtos.set(setName, { name: setName, quantities: xmlQtos ?? [] });
      }
    }

    const applicable = loadApplicableClasses(setName);
    if (!applicable.length) continue;

    for (const entry of applicable) {
      const [entityNameRaw, predefinedRaw] = entry.split("/");
      const entityName = (entityNameRaw ?? "").trim();
      const forPredefinedType = (predefinedRaw ?? "").trim() || undefined;
      const entity = entities[entityName];
      if (!entity) continue;

      if (isPset) addAssignment(entity.standardPsets, setName, forPredefinedType);
      if (isQto) addAssignment(entity.standardQtoSets, setName, forPredefinedType);
    }
  }

  // Filter out "Attributes" from standardPsets (it's not a real Pset)
  for (const entity of Object.values(entities)) {
    entity.standardPsets = entity.standardPsets.filter((n) =>
      typeof n === "string" ? n !== "Attributes" : n?.name !== "Attributes",
    );
  }
  // Also remove "Attributes" from psets map entirely
  psets.delete("Attributes");

  return {
    entities,
    psets: Object.fromEntries(psets.entries()),
    qtos: Object.fromEntries(qtos.entries()),
    dataTypes: Array.from(dataTypeSet),
  };
};

const main = () => {
  console.log("🔧 Generuji schema index z IFC_4x3.json ...");
  const index = buildIndex();
  ensureDir(OUTPUT_DIR);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(index, null, 2), "utf-8");
  console.log(
    `✅ Hotovo. Zapsáno do ${OUTPUT_PATH} (${Object.keys(index.entities).length} entit)`,
  );
};

main();
