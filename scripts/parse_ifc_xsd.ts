/**
 * Parses IFC4X3_ADD2.xsd to extract entity attributes and enum values.
 * Used to populate the attributes dropdown and enum constraints in the app.
 */

import fs from "fs";
import path from "path";
import { XMLParser } from "fast-xml-parser";

export type AttributeDefinition = {
  name: string;
  dataType: string;
  isOptional: boolean;
  allowedValues?: string[];
};

/** Normalize XSD enum value (lowercase_underscore) to IFC/IDS convention (UPPERCASE) */
function toIfcEnumValue(val: string): string {
  return String(val || "").trim().toUpperCase().replace(/-/g, "_");
}

/** Extract enum values from xs:simpleType restriction */
function extractEnumValues(restriction: any): string[] {
  if (!restriction) return [];
  const items = restriction["xs:enumeration"];
  if (!items) return [];
  const arr = Array.isArray(items) ? items : [items];
  return arr
    .map((e: any) => e?.["@_value"] ?? e?.value)
    .filter(Boolean)
    .map(toIfcEnumValue);
}

/** Resolve type name (strip ifc: prefix) */
function resolveType(t: string | undefined): string {
  if (!t || typeof t !== "string") return "IfcLabel";
  const s = t.trim();
  return s.includes(":") ? s.split(":")[1] ?? s : s;
}

/** Collect attributes from xs:extension (direct xs:attribute children) */
function collectAttributesFromExtension(ext: any, enums: Map<string, string[]>): AttributeDefinition[] {
  if (!ext) return [];
  const attrs: AttributeDefinition[] = [];
  const attrEl = ext["xs:attribute"];
  if (!attrEl) return [];
  const arr = Array.isArray(attrEl) ? attrEl : [attrEl];
  for (const a of arr) {
    const name = a?.["@_name"] ?? a?.name;
    if (!name) continue;
    const rawType = a?.["@_type"] ?? a?.type;
    const type = resolveType(rawType);
    const use = ((a?.["@_use"] ?? a?.use) || "optional") as string;
    const isOptional = use !== "required";
    const allowedValues = type.endsWith("Enum") ? enums.get(type) : undefined;
    attrs.push({ name, dataType: type, isOptional, allowedValues });
  }
  return attrs;
}

/** Get extension element from complexContent */
function getExtension(complexContent: any): any {
  if (!complexContent) return null;
  const cc = complexContent["xs:complexContent"] ?? complexContent;
  const ext = cc?.["xs:extension"] ?? cc?.extension;
  return ext ?? null;
}

/** Get base type from extension (strip ifc: prefix) */
function getBase(ext: any): string | null {
  if (!ext) return null;
  const base = ext["@_base"] ?? ext.base;
  if (!base) return null;
  return resolveType(base);
}

export function parseIfcXsd(xsdPath: string): {
  enums: Map<string, string[]>;
  entityAttributes: Map<string, AttributeDefinition[]>;
} {
  const content = fs.readFileSync(xsdPath, "utf-8");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: false,
  });
  const parsed = parser.parse(content);
  const schema = parsed?.["xs:schema"] ?? parsed?.schema;
  if (!schema) throw new Error("Invalid XSD: no schema root found");

  const enums = new Map<string, string[]>();
  const complexTypes = new Map<string, { base: string | null; attributes: AttributeDefinition[] }>();

  // 1. Extract all enum types (xs:simpleType name ending with Enum)
  const simpleTypes = schema["xs:simpleType"];
  const simpleArr = simpleTypes ? (Array.isArray(simpleTypes) ? simpleTypes : [simpleTypes]) : [];
  for (const st of simpleArr) {
    const name = st?.["@_name"] ?? st?.name;
    if (!name || !name.endsWith("Enum")) continue;
    const restriction = st["xs:restriction"] ?? st?.restriction;
    const values = extractEnumValues(restriction);
    if (values.length > 0) enums.set(name, values);
  }

  // 2. Extract all complexTypes (build inheritance + own attributes)
  const ctList = schema["xs:complexType"];
  const ctArr = ctList ? (Array.isArray(ctList) ? ctList : [ctList]) : [];
  for (const ct of ctArr) {
    const name = ct?.["@_name"] ?? ct?.name;
    if (!name || !name.startsWith("Ifc")) continue;
    const complexContent = ct["xs:complexContent"] ?? ct?.complexContent;
    const ext = getExtension({ "xs:complexContent": complexContent }) ?? getExtension(ct);
    const base = getBase(ext);
    const attributes = collectAttributesFromExtension(ext, enums);
    complexTypes.set(name, { base, attributes });
  }

  // 3. Resolve full attribute list per entity (walk inheritance)
  const entityAttributes = new Map<string, AttributeDefinition[]>();

  function collectInheritedAttributes(entityName: string): AttributeDefinition[] {
    const cached = entityAttributes.get(entityName);
    if (cached) return cached;

    const def = complexTypes.get(entityName);
    if (!def) return [];

    const parentAttrs = def.base ? collectInheritedAttributes(def.base) : [];
    const seen = new Set(parentAttrs.map((a) => a.name));
    const combined = [...parentAttrs];
    for (const a of def.attributes) {
      if (seen.has(a.name)) {
        // Override parent attribute (child can refine)
        const idx = combined.findIndex((x) => x.name === a.name);
        if (idx >= 0) combined[idx] = a;
      } else {
        seen.add(a.name);
        combined.push(a);
      }
    }
    entityAttributes.set(entityName, combined);
    return combined;
  }

  for (const [name] of complexTypes) {
    if (name.startsWith("Ifc")) {
      collectInheritedAttributes(name);
    }
  }

  return { enums, entityAttributes };
}

/** Get attributes for an entity, suitable for schema index. */
export function getEntityAttributesFromXsd(
  entityCode: string,
  parsed: { entityAttributes: Map<string, AttributeDefinition[]> }
): AttributeDefinition[] {
  const attrs = parsed.entityAttributes.get(entityCode);
  return attrs ?? [];
}
