import fs from "fs";
import path from "path";
import { XMLParser } from "fast-xml-parser";
import { parseIfcXsd, getEntityAttributesFromXsd, isDescendantOf } from "./parse_ifc_xsd";

/**
 * Jednotný postup pro obě verze (IFC 4.3 a IFC4) – pouze z oficiálních zdrojů buildingSMART (XSD + XML):
 *
 * 1. Seznam entit: z XSD – všechny třídy, pro které isDescendantOf(name, "IfcObjectDefinition", entityBases).
 * 2. Pro každou entitu: atributy a PredefinedType enum z XSD; parent a abstract z XSD.
 * 3. Pset/Qto přiřazení: z XML ApplicableClasses (4.3: IFC/IFC_4_3_ADD2/pSet_XSD; 4: IFC/IFC_4_ADD2_TC1/ZIP/psd + ZIP/qto).
 * 4. Společné dokončení: USERDEFINED v predefinedTypeValues, atribut PredefinedType pokud chybí, finalizePsetsQtos.
 *
 * Žádný bSDD JSON – obě verze stejně z XSD a XML v repozitáři (opakovatelné, dohledatelné).
 */

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

type AttributeDefinition = {
  name: string;
  dataType: string;
  isOptional: boolean;
  allowedValues?: string[];
};

type SchemaEntity = {
  name: string;
  attributes: AttributeDefinition[];
  standardPsets: PsetAssignment[];
  standardQtoSets: PsetAssignment[];
  predefinedTypeValues: string[];
  parent?: string;
  abstract?: boolean;
};

type SchemaIndex = {
  entities: Record<string, SchemaEntity>;
  psets: Record<string, PropertySetDefinition>;
  qtos: Record<string, QuantitySetDefinition>;
  dataTypes: string[];
  entityListOrder?: string[];
};

/** Paths resolved from project root (run from repo root). */
const ROOT = path.resolve(process.cwd());

/** Version-specific input/output config. Výstup (schema_index_*.json) má u obou verzí stejnou strukturu. */
export type SchemaBuildVersion = "4x3" | "4";

/** Zdroj: buildingSMART – XSD schéma a Pset/Qto XML v repozitáři (IFC/). Žádný bSDD JSON. */
const BUILD_CONFIG: Record<
  SchemaBuildVersion,
  {
    xsdPath: string;
    /** Jednotný adresář Pset_ + Qto_ (4.3). */
    psetQtoDir?: string;
    /** Oddělené adresáře Pset vs Qto (4). */
    psdDir?: string;
    qtoDir?: string;
    outputName: string;
  }
> = {
  "4x3": {
    xsdPath: path.join(ROOT, "IFC", "IFC_4_3_ADD2", "XSD", "IFC4X3_ADD2.xsd"),
    psetQtoDir: path.join(ROOT, "IFC", "IFC_4_3_ADD2", "pSet_XSD"),
    outputName: "schema_index_ifc4x3.json",
  },
  "4": {
    xsdPath: path.join(ROOT, "IFC", "IFC_4_ADD2_TC1", "XSD", "IFC4.xsd"),
    psdDir: path.join(ROOT, "IFC", "IFC_4_ADD2_TC1", "ZIP", "psd"),
    qtoDir: path.join(ROOT, "IFC", "IFC_4_ADD2_TC1", "ZIP", "qto"),
    outputName: "schema_index_ifc4.json",
  },
};

// Fallback: 4x3 pokud pSet_XSD neexistuje, zkusit legacy složku (starší rozložení)
const LEGACY_PSET_QTO_4X3 = path.join(ROOT, "IFC_4x3_Pset_Qto_Def");

const OUTPUT_DIR = path.join(ROOT, "public", "ifc");

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
  if (!forPredefinedType) list.push(name);
  else list.push({ name, forPredefinedType });
};

const QTO_TYPE_MAP: Record<string, string> = {
  Q_COUNT: "IfcQuantityCount",
  Q_LENGTH: "IfcQuantityLength",
  Q_AREA: "IfcQuantityArea",
  Q_VOLUME: "IfcQuantityVolume",
  Q_WEIGHT: "IfcQuantityWeight",
  Q_TIME: "IfcQuantityTime",
};

/** Get root Pset or Qto element; handles default namespace in IFC4 XML. */
function getPsetQtoRoot(parsed: any): any {
  if (parsed?.PropertySetDef) return parsed.PropertySetDef;
  if (parsed?.QtoSetDef) return parsed.QtoSetDef;
  const first = Object.values(parsed ?? {})[0];
  if (first && typeof first === "object") return first;
  return null;
}

function loadPsetXmlFromDir(
  dir: string,
  name: string,
): PropertyDefinition[] | null {
  const file = path.join(dir, `${name}.xml`);
  if (!fs.existsSync(file)) return null;
  try {
    const xml = fs.readFileSync(file, "utf-8");
    const parsed = parser.parse(xml);
    const root = getPsetQtoRoot(parsed);
    const defs = root?.PropertyDefs?.PropertyDef ?? root?.propertyDefs?.propertyDef;
    if (!defs) return null;
    const arr = Array.isArray(defs) ? defs : [defs];
    const properties: PropertyDefinition[] = [];
    for (const d of arr) {
      const propName = d?.Name ?? d?.name;
      if (!propName) continue;
      const pt = d?.PropertyType ?? d?.propertyType;
      let dataType = "UNKNOWN";
      let allowedValues: string[] | undefined;
      const single = pt?.TypePropertySingleValue ?? pt?.typePropertySingleValue;
      const enumVal = pt?.TypePropertyEnumeratedValue ?? pt?.typePropertyEnumeratedValue;
      if (single?.DataType?.type ?? single?.dataType?.type) {
        dataType = (single.DataType ?? single.dataType)?.type ?? dataType;
      } else if (enumVal?.EnumList ?? enumVal?.enumList) {
        const list = enumVal.EnumList ?? enumVal.enumList;
        dataType = list?.name ?? list?.Name ?? "ENUM";
        const items = list?.EnumItem ?? list?.enumItem;
        if (items) {
          allowedValues = (Array.isArray(items) ? items : [items]).map((e: any) => String(e?.value ?? e?.Value ?? e));
        }
      }
      properties.push({ name: String(propName), dataType, allowedValues });
    }
    return properties;
  } catch (err) {
    console.warn(`⚠️ Nepodařilo se načíst ${file}:`, err);
    return null;
  }
}

function loadQtoXmlFromDir(
  dir: string,
  name: string,
): PropertyDefinition[] | null {
  const file = path.join(dir, `${name}.xml`);
  if (!fs.existsSync(file)) return null;
  try {
    const xml = fs.readFileSync(file, "utf-8");
    const parsed = parser.parse(xml);
    const root = getPsetQtoRoot(parsed);
    const defs = root?.QtoDefs?.QtoDef ?? root?.qtoDefs?.qtoDef;
    if (!defs) return null;
    const arr = Array.isArray(defs) ? defs : [defs];
    const quantities: PropertyDefinition[] = [];
    for (const d of arr) {
      const qtoName = d?.Name ?? d?.name;
      if (!qtoName) continue;
      const qtoType = d?.QtoType ?? d?.qtoType ?? "UNKNOWN";
      quantities.push({
        name: String(qtoName),
        dataType: QTO_TYPE_MAP[qtoType] ?? qtoType,
      });
    }
    return quantities;
  } catch (err) {
    console.warn(`⚠️ Nepodařilo se načíst ${file}:`, err);
    return null;
  }
}

function loadApplicableClassesFromFile(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const xml = fs.readFileSync(filePath, "utf-8");
    const parsed = parser.parse(xml);
    const root = getPsetQtoRoot(parsed);
    const classNames = root?.ApplicableClasses?.ClassName ?? root?.applicableClasses?.className;
    return normalizeToArray(classNames).map(String).filter(Boolean);
  } catch (err) {
    console.warn(`⚠️ Nepodařilo se načíst Applicability z ${filePath}:`, err);
    return [];
  }
}

const HIERARCHY_ROOT = "IfcObjectDefinition";

/** Pre-order traversal: build ordered list of entity names by hierarchy (parent -> children). */
function buildEntityListOrder(entities: Record<string, SchemaEntity>): string[] {
  const childMap: Record<string, string[]> = {};
  const keySet = new Set(Object.keys(entities));
  const roots: string[] = [];
  for (const name of Object.keys(entities)) {
    const p = entities[name].parent;
    if (p != null && keySet.has(p)) {
      if (!childMap[p]) childMap[p] = [];
      childMap[p].push(name);
    } else {
      roots.push(name);
    }
  }
  for (const arr of Object.values(childMap)) arr.sort();
  roots.sort((a, b) => {
    if (a === HIERARCHY_ROOT) return -1;
    if (b === HIERARCHY_ROOT) return 1;
    return a.localeCompare(b);
  });
  const order: string[] = [];
  function walk(key: string) {
    for (const n of childMap[key] ?? []) {
      order.push(n);
      walk(n);
    }
  }
  for (const root of roots) {
    order.push(root);
    walk(root);
  }
  return order;
}

/** Resolve Pset/Qto dir for 4x3: IFC_4_3_ADD2/pSet_XSD (buildingSMART), fallback legacy. */
function getPsetQtoDir4x3(config: typeof BUILD_CONFIG["4x3"]): string | undefined {
  if (config.psetQtoDir && fs.existsSync(config.psetQtoDir)) return config.psetQtoDir;
  if (fs.existsSync(LEGACY_PSET_QTO_4X3)) return LEGACY_PSET_QTO_4X3;
  return undefined;
}

/** Společné dokončení entit: USERDEFINED v predefinedTypeValues, atribut PredefinedType pokud chybí. */
function finalizeSchemaEntities(entities: Record<string, SchemaEntity>): void {
  for (const entity of Object.values(entities)) {
    if (entity.predefinedTypeValues.length > 0 && !entity.predefinedTypeValues.includes("USERDEFINED")) {
      entity.predefinedTypeValues = Array.from(new Set([...entity.predefinedTypeValues, "USERDEFINED"]));
    }
    const hasPredefinedAttr = entity.attributes.some((a) => a.name === "PredefinedType");
    if (!hasPredefinedAttr && entity.predefinedTypeValues.length > 0) {
      entity.attributes.push({
        name: "PredefinedType",
        dataType: "IfcLabel",
        isOptional: true,
        allowedValues: [...entity.predefinedTypeValues],
      });
    }
  }
}

/** Dědění Pset/Qto od rodiče: potomci dostanou přiřazení z předků (XML často uvádí jen základní třídu). */
function inheritPsetQtoFromParents(entities: Record<string, SchemaEntity>, order: string[]): void {
  const key = (n: PsetAssignment) =>
    `${typeof n === "string" ? n : n?.name ?? ""}|${typeof n === "string" ? "" : n?.forPredefinedType ?? ""}`;
  for (const name of order) {
    const entity = entities[name];
    if (!entity?.parent || !entities[entity.parent]) continue;
    const parent = entities[entity.parent];
    const existingP = new Set(entity.standardPsets.map(key));
    const existingQ = new Set(entity.standardQtoSets.map(key));
    for (const p of parent.standardPsets) {
      if (!existingP.has(key(p))) {
        existingP.add(key(p));
        entity.standardPsets.unshift(p);
      }
    }
    for (const q of parent.standardQtoSets) {
      if (!existingQ.has(key(q))) {
        existingQ.add(key(q));
        entity.standardQtoSets.unshift(q);
      }
    }
  }
}

/** Společné dokončení Pset/Qto: odstranění "Attributes" z přiřazení i z mapy. */
function finalizePsetsQtos(entities: Record<string, SchemaEntity>, psets: Map<string, PropertySetDefinition>): void {
  for (const entity of Object.values(entities)) {
    entity.standardPsets = entity.standardPsets.filter((n) =>
      typeof n === "string" ? n !== "Attributes" : n?.name !== "Attributes",
    );
  }
  psets.delete("Attributes");
}

/**
 * Aplikuje ApplicableClasses z XML souborů v daném adresáři na entities (standardPsets/standardQtoSets).
 * Jednotný postup pro 4.3 (jeden adresář s Pset_ i Qto_) i 4 (jeden adresář pouze Pset nebo pouze Qto).
 * Pokud isPsetDir === undefined, rozlišení podle názvu souboru (Pset_ vs Qto_).
 */
function applyApplicableClassesFromDir(
  dir: string,
  entities: Record<string, SchemaEntity>,
  psets: Map<string, PropertySetDefinition>,
  qtos: Map<string, QuantitySetDefinition>,
  isPsetDir?: boolean,
): void {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".xml"));
  for (const file of files) {
    const setName = path.basename(file, ".xml");
    const filePath = path.join(dir, file);
    const isPset = isPsetDir ?? setName.startsWith("Pset_");
    if (isPset) {
      const xmlProps = loadPsetXmlFromDir(dir, setName);
      if (xmlProps?.length) psets.set(setName, { name: setName, properties: xmlProps });
    } else {
      const xmlQtos = loadQtoXmlFromDir(dir, setName);
      if (xmlQtos?.length) qtos.set(setName, { name: setName, quantities: xmlQtos });
    }
    const applicable = loadApplicableClassesFromFile(filePath);
    for (const entry of applicable) {
      const [entityNameRaw, predefinedRaw] = entry.split("/");
      const entityName = (entityNameRaw ?? "").trim();
      const forPredefinedType = (predefinedRaw ?? "").trim() || undefined;
      const entity = entities[entityName];
      if (!entity) continue;
      if (isPset) addAssignment(entity.standardPsets, setName, forPredefinedType);
      else addAssignment(entity.standardQtoSets, setName, forPredefinedType);
    }
  }
}

/** Build schema index pro IFC 4.3 pouze z XSD + XML (buildingSMART zdroje v repozitáři). */
function buildIndex4x3FromXsd(config: typeof BUILD_CONFIG["4x3"]): SchemaIndex {
  if (!fs.existsSync(config.xsdPath)) {
    throw new Error(`XSD nenalezen: ${config.xsdPath}`);
  }
  const xsdParsed = parseIfcXsd(config.xsdPath);
  const entities: Record<string, SchemaEntity> = {};
  const psets = new Map<string, PropertySetDefinition>();
  const qtos = new Map<string, QuantitySetDefinition>();
  const { entityBases, entityAbstract } = xsdParsed;

  for (const [name] of xsdParsed.entityAttributes) {
    if (!isDescendantOf(name, "IfcObjectDefinition", entityBases)) continue;
    const attrs = getEntityAttributesFromXsd(name, xsdParsed);
    const predefinedTypeAttr = attrs.find((a) => a.name === "PredefinedType");
    const predefinedTypeValues = predefinedTypeAttr?.allowedValues ?? [];
    const withUser = predefinedTypeValues.includes("USERDEFINED")
      ? predefinedTypeValues
      : [...predefinedTypeValues, "USERDEFINED"];

    entities[name] = {
      name,
      attributes: attrs,
      standardPsets: [],
      standardQtoSets: [],
      predefinedTypeValues: Array.from(new Set(withUser)),
      parent: entityBases.get(name) ?? undefined,
      abstract: entityAbstract.get(name) ?? false,
    };
  }

  finalizeSchemaEntities(entities);

  const PSET_QTO_DIR = getPsetQtoDir4x3(config);
  if (PSET_QTO_DIR) {
    applyApplicableClassesFromDir(PSET_QTO_DIR, entities, psets, qtos);
  }
  inheritPsetQtoFromParents(entities, buildEntityListOrder(entities));
  finalizePsetsQtos(entities, psets);

  return {
    entities,
    psets: Object.fromEntries(psets.entries()),
    qtos: Object.fromEntries(qtos.entries()),
    dataTypes: Array.from(new Set(fallbackDataTypes)),
    entityListOrder: buildEntityListOrder(entities),
  };
}

/** Build schema index pro IFC4 pouze z XSD + XML (buildingSMART zdroje v repozitáři). */
function buildIndex4(config: typeof BUILD_CONFIG["4"]): SchemaIndex {
  const xsdPath = config.xsdPath;
  if (!fs.existsSync(xsdPath)) {
    throw new Error(`XSD nenalezen: ${xsdPath}`);
  }

  const xsdParsed = parseIfcXsd(xsdPath);
  const entities: Record<string, SchemaEntity> = {};
  const psets = new Map<string, PropertySetDefinition>();
  const qtos = new Map<string, QuantitySetDefinition>();
  const { entityBases, entityAbstract } = xsdParsed;

  for (const [name] of xsdParsed.entityAttributes) {
    if (!isDescendantOf(name, "IfcObjectDefinition", entityBases)) continue;
    const attrs = getEntityAttributesFromXsd(name, xsdParsed);
    const predefinedTypeAttr = attrs.find((a) => a.name === "PredefinedType");
    const predefinedTypeValues = predefinedTypeAttr?.allowedValues ?? [];
    const withUser = predefinedTypeValues.includes("USERDEFINED")
      ? predefinedTypeValues
      : [...predefinedTypeValues, "USERDEFINED"];

    entities[name] = {
      name,
      attributes: attrs,
      standardPsets: [],
      standardQtoSets: [],
      predefinedTypeValues: Array.from(new Set(withUser)),
      parent: entityBases.get(name) ?? undefined,
      abstract: entityAbstract.get(name) ?? false,
    };
  }

  finalizeSchemaEntities(entities);

  if (config.psdDir) applyApplicableClassesFromDir(config.psdDir, entities, psets, qtos, true);
  if (config.qtoDir) applyApplicableClassesFromDir(config.qtoDir, entities, psets, qtos, false);
  inheritPsetQtoFromParents(entities, buildEntityListOrder(entities));
  finalizePsetsQtos(entities, psets);

  return {
    entities,
    psets: Object.fromEntries(psets.entries()),
    qtos: Object.fromEntries(qtos.entries()),
    dataTypes: Array.from(new Set(fallbackDataTypes)),
    entityListOrder: buildEntityListOrder(entities),
  };
}

function buildIndex(version: SchemaBuildVersion): SchemaIndex {
  const config = BUILD_CONFIG[version];
  if (version === "4x3") {
    return buildIndex4x3FromXsd(config as typeof BUILD_CONFIG["4x3"]);
  }
  return buildIndex4(config as typeof BUILD_CONFIG["4"]);
}

const main = () => {
  const version = (process.argv[2] ?? "4x3") as SchemaBuildVersion;
  if (version !== "4x3" && version !== "4") {
    console.error("Použití: tsx scripts/build_schema_index.ts [4x3|4]");
    process.exit(1);
  }

  const config = BUILD_CONFIG[version];
  console.log(`🔧 Generuji schema index pro IFC ${version} ...`);
  const index = buildIndex(version);
  ensureDir(OUTPUT_DIR);
  const outputPath = path.join(OUTPUT_DIR, config.outputName);
  fs.writeFileSync(outputPath, JSON.stringify(index, null, 2), "utf-8");
  console.log(
    `✅ Hotovo. Zapsáno do ${outputPath} (${Object.keys(index.entities).length} entit)`,
  );
};

main();
