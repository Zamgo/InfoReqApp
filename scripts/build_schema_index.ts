import fs from "fs";
import path from "path";

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

type SchemaEntity = {
  name: string;
  standardPsets: string[];
  standardQtoSets: string[];
  predefinedTypeValues: string[];
};

type SchemaIndex = {
  entities: Record<string, SchemaEntity>;
  psets: Record<string, PropertySetDefinition>;
  qtos: Record<string, QuantitySetDefinition>;
  dataTypes: string[];
};

const INPUT_PATH = path.resolve("IFC_4x3.json");
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
