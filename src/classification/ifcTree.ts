import type { ClassificationData, ClassificationNode } from "./types";
import type { SchemaIndex } from "../schema/types";

const IFC_SOURCE_NAME = "Třídění dle IFC entit";

/**
 * Vytvoří strom klasifikace z IFC schématu: entita → predefined typy.
 * Každý list má ifcEntity a predefinedType vyplněné (pro kartu Identifikační údaje).
 */
export function buildClassificationFromSchema(schema: SchemaIndex): ClassificationData {
  const entities = schema.entities;
  const rootNodes: ClassificationNode[] = [];

  const entityNames = Object.keys(entities).sort();

  for (const entityName of entityNames) {
    const entity = entities[entityName];
    if (!entity) continue;

    const predefinedTypes = entity.predefinedTypeValues ?? [];
    const children: ClassificationNode[] = [];

    if (predefinedTypes.length === 0) {
      children.push({
        code: entityName,
        description: entityName,
        level: 2,
        ifcEntity: entityName,
        predefinedType: undefined,
        children: [],
      });
    } else {
      // NOTDEFINED – pro objekty bez zvoleného PredefinedType
      children.push({
        code: `${entityName}::NOTDEFINED`,
        description: "NOTDEFINED",
        level: 2,
        ifcEntity: entityName,
        predefinedType: undefined,
        children: [],
      });
      for (const pt of predefinedTypes) {
        const code = `${entityName}::${pt}`;
        children.push({
          code,
          description: pt,
          level: 2,
          ifcEntity: entityName,
          predefinedType: pt,
          children: [],
        });
      }
    }

    rootNodes.push({
      code: entityName,
      description: entityName,
      level: 1,
      ifcEntity: entityName,
      predefinedType: undefined,
      children,
    });
  }

  return {
    nodes: rootNodes,
    sourceName: IFC_SOURCE_NAME,
    hash: `ifc-${entityNames.length}`,
  };
}

/**
 * Vytvoří strom klasifikace pouze pro vybrané IFC entity a jejich PredefinedType.
 * selectedCodes = Set kódů listů (např. "IfcWall", "IfcWall::SOLIDWALL").
 */
export function buildClassificationFromSchemaFiltered(
  schema: SchemaIndex,
  selectedCodes: Set<string>,
): ClassificationData {
  const entities = schema.entities;
  const rootNodes: ClassificationNode[] = [];
  const entityNames = Object.keys(entities).sort();

  for (const entityName of entityNames) {
    const entity = entities[entityName];
    if (!entity) continue;

    const predefinedTypes = entity.predefinedTypeValues ?? [];
    const children: ClassificationNode[] = [];

    if (predefinedTypes.length === 0) {
      const entityCodes = [...selectedCodes].filter((c) => c === entityName || c.startsWith(entityName + "::"));
      if (entityCodes.length === 0) continue;
      for (const code of entityCodes) {
        if (code === entityName) {
          children.push({
            code: entityName,
            description: entityName,
            level: 2,
            ifcEntity: entityName,
            predefinedType: undefined,
            children: [],
          });
        } else {
          const ptVal = code.slice(entityName.length + 2);
          children.push({
            code,
            description: ptVal,
            level: 2,
            ifcEntity: entityName,
            predefinedType: ptVal,
            children: [],
          });
        }
      }
    } else {
      if (selectedCodes.has(`${entityName}::NOTDEFINED`)) {
        children.push({
          code: `${entityName}::NOTDEFINED`,
          description: "NOTDEFINED",
          level: 2,
          ifcEntity: entityName,
          predefinedType: undefined,
          children: [],
        });
      }
      for (const pt of predefinedTypes) {
        const code = `${entityName}::${pt}`;
        if (!selectedCodes.has(code)) continue;
        children.push({
          code,
          description: pt,
          level: 2,
          ifcEntity: entityName,
          predefinedType: pt,
          children: [],
        });
      }
      // IDS import: entita bez predefined type má v selectedCodes jen "IfcDoor" – přidáme list s kódem entity, aby se zobrazila v hierarchii
      if (children.length === 0 && selectedCodes.has(entityName)) {
        children.push({
          code: entityName,
          description: entityName,
          level: 2,
          ifcEntity: entityName,
          predefinedType: undefined,
          children: [],
        });
      }
      // Kódy z objektů (např. z IDS) mohou mít jinou velikost písmen než schema – přidáme list pro každý selectedCode entityName::*
      for (const code of selectedCodes) {
        if (code === entityName) continue;
        if (!code.startsWith(entityName + "::")) continue;
        if (children.some((c) => c.code === code)) continue;
        const ptVal = code.slice(entityName.length + 2);
        children.push({
          code,
          description: ptVal,
          level: 2,
          ifcEntity: entityName,
          predefinedType: ptVal,
          children: [],
        });
      }
      if (children.length === 0) continue;
    }

    rootNodes.push({
      code: entityName,
      description: entityName,
      level: 1,
      ifcEntity: entityName,
      predefinedType: undefined,
      children,
    });
  }

  return {
    nodes: rootNodes,
    sourceName: IFC_SOURCE_NAME,
    hash: `ifc-${rootNodes.length}-${selectedCodes.size}`,
  };
}

/**
 * Vrátí IFC kód listu pro danou entitu a volitelný PredefinedType (formát jako v IFC stromu).
 */
export function toIfcCode(
  schema: SchemaIndex,
  entityName: string,
  predefinedType: string | undefined,
): string {
  const entity = schema.entities[entityName];
  const hasTypes = entity && (entity.predefinedTypeValues?.length ?? 0) > 0;
  if (predefinedType) return `${entityName}::${predefinedType}`;
  if (hasTypes) return `${entityName}::NOTDEFINED`;
  return entityName;
}

/**
 * Z uzlu klasifikace (list s ifcEntity) vybere IFC kódy pro výběr entit do IFC stromu.
 */
export function collectSelectedCodesFromClassificationNodes(
  nodes: ClassificationNode[],
  schema: SchemaIndex,
): Set<string> {
  const codes = new Set<string>();
  const visit = (list: ClassificationNode[]) => {
    for (const node of list) {
      if (node.children.length === 0 && node.ifcEntity) {
        codes.add(toIfcCode(schema, node.ifcEntity, node.predefinedType));
      } else {
        visit(node.children);
      }
    }
  };
  visit(nodes);
  return codes;
}

/**
 * Vytvoří „čistý“ strom klasifikace (bez ifcEntity/predefinedType) s mappedValues
 * odkazujícími na IFC systém (každý list, který měl IFC, dostane mappedValues[ifcSystemId] = IFC kód).
 */
export function buildPureNodesWithIfcMapping(
  nodes: ClassificationNode[],
  ifcSystemId: string,
  schema: SchemaIndex,
): ClassificationNode[] {
  return nodes.map((node) => {
    const { ifcEntity, predefinedType, ...rest } = node;
    const childNodes = buildPureNodesWithIfcMapping(node.children, ifcSystemId, schema);
    let mappedValues = rest.mappedValues;
    if (node.children.length === 0 && node.ifcEntity) {
      const code = toIfcCode(schema, node.ifcEntity, node.predefinedType);
      mappedValues = { ...(rest.mappedValues ?? {}), [ifcSystemId]: code };
    }
    return {
      ...rest,
      children: childNodes,
      ...(mappedValues ? { mappedValues } : {}),
    };
  });
}
