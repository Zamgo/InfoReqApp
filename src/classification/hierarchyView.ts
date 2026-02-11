/**
 * Sdílená logika pohledů na hierarchii (klasifikace, IFC, namapované systémy).
 * Používá ClassificationPanel i dialog pro duplikaci skupin vlastností.
 */
import { collectLeaves } from "./parser";
import type { ClassificationNode } from "./types";
import type { ClassificationSystemEntry, ProjectObject } from "../project/types";
import type { ClassificationData } from "./types";
import { parseAuthoringValues } from "../project/authoring";

export type HierarchyViewMode = "classification" | "ifc" | "predefinedType" | `mapped:${string}`;

const UNASSIGNED_LABEL = "nepřiřazeno";
const UNMAPPED_LABEL = "—";

export function collectIfcEntities(nodes: ClassificationNode[]): string[] {
  const entities = new Set<string>();
  const traverse = (node: ClassificationNode) => {
    if (node.ifcEntity) entities.add(node.ifcEntity);
    node.children.forEach(traverse);
  };
  nodes.forEach(traverse);
  return Array.from(entities).sort();
}

export function buildUnifiedIfcTree(
  nodes: ClassificationNode[],
  objects?: Record<string, ProjectObject>
): ClassificationNode[] {
  const leaves = collectLeaves(nodes);
  const byEntity: Record<string, Record<string, ClassificationNode[]>> = {};
  const entityLabel = "Bez IFC entity";
  const typeLabel = "NOTDEFINED";
  leaves.forEach((leaf) => {
    const entity = leaf.ifcEntity || objects?.[leaf.code]?.ifcEntity?.trim() || entityLabel;
    const ptFromObj =
      objects?.[leaf.code]?.predefinedType?.mode === "ENUM" || objects?.[leaf.code]?.predefinedType?.mode === "USERDEFINED"
        ? (objects[leaf.code].predefinedType?.value ?? "").trim() || typeLabel
        : "";
    const predefinedType = leaf.predefinedType || ptFromObj || typeLabel;
    if (!byEntity[entity]) byEntity[entity] = {};
    (byEntity[entity][predefinedType] ??= []).push(leaf);
  });
  const sortedEntities = Object.keys(byEntity).sort((a, b) => {
    if (a === entityLabel) return 1;
    if (b === entityLabel) return -1;
    return a.localeCompare(b);
  });
  return sortedEntities.map((entity) => {
    const byType = byEntity[entity];
    const sortedTypes = Object.keys(byType).sort((a, b) => {
      if (a === typeLabel) return 1;
      if (b === typeLabel) return -1;
      return a.localeCompare(b);
    });
    const level2Children = sortedTypes.map((predefinedType) => {
      const items = byType[predefinedType].sort((a, b) => a.code.localeCompare(b.code));
      return {
        code: `${entity}.${predefinedType}`,
        description: predefinedType,
        level: 2,
        children: items.map((item) => ({ ...item, level: 3, children: [] })),
      };
    });
    return { code: entity, description: entity, level: 1, children: level2Children };
  });
}

export function buildMappedSystemTree(
  nodes: ClassificationNode[],
  systemEntryId: string
): ClassificationNode[] {
  const leaves = collectLeaves(nodes);
  const byValue: Record<string, ClassificationNode[]> = {};
  leaves.forEach((leaf) => {
    const key = leaf.mappedValues?.[systemEntryId] ?? "—";
    (byValue[key] ??= []).push(leaf);
  });
  const sortedKeys = Object.keys(byValue).sort((a, b) => {
    if (a === UNMAPPED_LABEL) return 1;
    if (b === UNMAPPED_LABEL) return -1;
    return a.localeCompare(b);
  });
  return sortedKeys.map((key) => ({
    code: key,
    description: key,
    level: 1,
    children: byValue[key]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((item) => ({ ...item, level: 2, children: [] })),
  }));
}

export function buildMappedIfcSystemTree(
  nodes: ClassificationNode[],
  systemEntryId: string
): ClassificationNode[] {
  const leaves = collectLeaves(nodes);
  const byEntity: Record<string, Record<string, ClassificationNode[]>> = {};
  leaves.forEach((leaf) => {
    const fullKey = (leaf.mappedValues?.[systemEntryId] ?? "").trim() || UNMAPPED_LABEL;
    const [entityPart] = fullKey.includes("::") ? fullKey.split("::") : [fullKey];
    const entityKey = (entityPart ?? "").trim() || UNMAPPED_LABEL;
    if (!byEntity[entityKey]) byEntity[entityKey] = {};
    if (!byEntity[entityKey][fullKey]) byEntity[entityKey][fullKey] = [];
    byEntity[entityKey][fullKey].push(leaf);
  });
  const sortedEntities = Object.keys(byEntity).sort((a, b) => {
    if (a === UNMAPPED_LABEL) return 1;
    if (b === UNMAPPED_LABEL) return -1;
    return a.localeCompare(b);
  });
  return sortedEntities.map((entity) => {
    const byFullKey = byEntity[entity];
    const sortedFullKeys = Object.keys(byFullKey).sort((a, b) => {
      if (a === UNMAPPED_LABEL) return 1;
      if (b === UNMAPPED_LABEL) return -1;
      return a.localeCompare(b);
    });
    const level2Children = sortedFullKeys.map((fullKey) => {
      const items = byFullKey[fullKey].sort((a, b) => a.code.localeCompare(b.code));
      return {
        code: fullKey,
        description: fullKey,
        level: 2,
        children: items.map((item) => ({ ...item, level: 3, children: [] })),
      };
    });
    return { code: entity, description: entity, level: 1, children: level2Children };
  });
}

export function buildMappedIfcSystemTreeByValue(
  nodes: ClassificationNode[],
  getValue: (leaf: ClassificationNode) => string
): ClassificationNode[] {
  const leaves = collectLeaves(nodes);
  const byEntity: Record<string, Record<string, ClassificationNode[]>> = {};
  leaves.forEach((leaf) => {
    const raw = getValue(leaf);
    const fullKey = raw?.trim() ? raw.trim() : UNASSIGNED_LABEL;
    const [entityPart] = fullKey.includes("::") ? fullKey.split("::") : [fullKey];
    const entityKey = (entityPart ?? "").trim() && entityPart !== UNASSIGNED_LABEL ? entityPart.trim() : UNASSIGNED_LABEL;
    if (!byEntity[entityKey]) byEntity[entityKey] = {};
    if (!byEntity[entityKey][fullKey]) byEntity[entityKey][fullKey] = [];
    byEntity[entityKey][fullKey].push(leaf);
  });
  const sortedEntities = Object.keys(byEntity).sort((a, b) => {
    if (a === UNASSIGNED_LABEL) return 1;
    if (b === UNASSIGNED_LABEL) return -1;
    return a.localeCompare(b);
  });
  return sortedEntities.map((entity) => {
    const byFullKey = byEntity[entity];
    const sortedFullKeys = Object.keys(byFullKey).sort((a, b) => {
      if (a === UNASSIGNED_LABEL) return 1;
      if (b === UNASSIGNED_LABEL) return -1;
      return a.localeCompare(b);
    });
    const level2Children = sortedFullKeys.map((fullKey) => {
      const items = byFullKey[fullKey].sort((a, b) => a.code.localeCompare(b.code));
      return {
        code: fullKey,
        description: fullKey,
        level: 2,
        children: items.map((item) => ({ ...item, level: 3, children: [] })),
      };
    });
    return { code: entity, description: entity, level: 1, children: level2Children };
  });
}

export function buildMappedSystemTreeByValues(
  nodes: ClassificationNode[],
  getValues: (leaf: ClassificationNode) => string[]
): ClassificationNode[] {
  const leaves = collectLeaves(nodes);
  const byValue: Record<string, ClassificationNode[]> = {};
  leaves.forEach((leaf) => {
    const vals = getValues(leaf).map((v) => v?.trim()).filter(Boolean);
    if (vals.length === 0) {
      (byValue[UNASSIGNED_LABEL] ??= []).push(leaf);
    } else {
      vals.forEach((key) => (byValue[key] ??= []).push(leaf));
    }
  });
  const sortedKeys = Object.keys(byValue).sort((a, b) => {
    if (a === UNASSIGNED_LABEL) return 1;
    if (b === UNASSIGNED_LABEL) return -1;
    return a.localeCompare(b);
  });
  return sortedKeys.map((key) => ({
    code: key,
    description: key,
    level: 1,
    children: byValue[key]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((item) => ({ ...item, level: 2, children: [] })),
  }));
}

export function getHierarchyViewOptions(
  classification: ClassificationData | null,
  primarySystem: ClassificationSystemEntry | undefined,
  classificationSystemEntries: ClassificationSystemEntry[],
  objects?: Record<string, ProjectObject>
): { value: HierarchyViewMode; label: string }[] {
  const fallback = [{ value: "classification" as HierarchyViewMode, label: primarySystem?.name ?? "Klasifikace" }];
  const nodes = classification?.nodes ?? [];
  const hasIfcInNodes = collectIfcEntities(nodes).length > 0;
  const hasPredefinedTypesInNodes = (() => {
    const set = new Set<string>();
    const traverse = (node: ClassificationNode) => {
      if (node.predefinedType) set.add(node.predefinedType);
      node.children.forEach(traverse);
    };
    nodes.forEach(traverse);
    return set.size > 0;
  })();
  const hasIfcInObjects =
    objects &&
    Object.values(objects).some(
      (o) =>
        (o?.ifcEntity?.trim() ?? "") !== "" ||
        ((o?.predefinedType?.mode === "ENUM" || o?.predefinedType?.mode === "USERDEFINED") && (o?.predefinedType?.value ?? "").trim() !== "")
    );
  const options: { value: HierarchyViewMode; label: string }[] = [
    { value: "classification", label: primarySystem?.name ?? "Klasifikace" },
  ];
  const isIfcPrimary = primarySystem?.isIfcSystem === true;
  if (!isIfcPrimary && (hasIfcInNodes || hasPredefinedTypesInNodes || hasIfcInObjects)) {
    options.push({ value: "ifc", label: "IFC" });
  }
  (primarySystem?.mappedSystemIds ?? []).forEach((systemEntryId) => {
    const entry = classificationSystemEntries.find((e) => e.id === systemEntryId);
    options.push({ value: `mapped:${systemEntryId}` as HierarchyViewMode, label: entry?.name ?? systemEntryId });
  });
  if (!classification?.nodes?.length) return options.length > 1 ? options : fallback;
  return options;
}

function virtualLeafFromObject(code: string, obj: ProjectObject): ClassificationNode {
  const pt =
    obj.predefinedType?.mode === "ENUM" || obj.predefinedType?.mode === "USERDEFINED"
      ? (obj.predefinedType?.value ?? "").trim() || undefined
      : undefined;
  return {
    code,
    description: obj.description ?? code,
    level: 2,
    children: [],
    ifcEntity: obj.ifcEntity?.trim() || undefined,
    predefinedType: pt,
  };
}

export function getHierarchyNodesForView(
  viewMode: HierarchyViewMode,
  classification: ClassificationData | null,
  primarySystem: ClassificationSystemEntry | undefined,
  classificationSystemEntries: ClassificationSystemEntry[],
  objects: Record<string, ProjectObject>
): ClassificationNode[] {
  const nodes =
    viewMode === "classification"
      ? (primarySystem?.nodes ?? classification?.nodes ?? [])
      : (classification?.nodes ?? []);
  if (viewMode === "classification") {
    if (!nodes.length) return [];
    return nodes;
  }
  if (viewMode === "ifc" || viewMode === "predefinedType") {
    const leaves = nodes.length > 0 ? collectLeaves(nodes) : [];
    const leafCodes = new Set(leaves.map((l) => l.code));
    const orphanCodes = (Object.keys(objects) as string[]).filter((code) => !leafCodes.has(code));
    const virtualLeaves: ClassificationNode[] = orphanCodes.map((code) =>
      virtualLeafFromObject(code, objects[code])
    );
    const allLeaves = leaves.length || virtualLeaves.length ? [...leaves, ...virtualLeaves] : [];
    if (allLeaves.length === 0) return [];
    const syntheticRoot: ClassificationNode = {
      code: "_",
      description: "",
      level: 0,
      children: allLeaves,
    };
    return buildUnifiedIfcTree([syntheticRoot], objects);
  }
  if (!nodes.length) return [];
  if (viewMode.startsWith("mapped:")) {
    const systemEntryId = viewMode.slice(7);
    const entry = classificationSystemEntries.find((e) => e.id === systemEntryId);
    const isIfcSystem = entry?.isIfcSystem === true;
    if (Object.keys(objects).length > 0) {
      if (isIfcSystem) {
        const getValue = (leaf: ClassificationNode): string => {
          const o = objects[leaf.code];
          const pt = o?.predefinedType?.mode === "ENUM" ? o?.predefinedType?.value : undefined;
          return pt ? `${o?.ifcEntity ?? ""}::${pt}`.trim() : (o?.ifcEntity?.trim() ?? leaf.mappedValues?.[systemEntryId] ?? "");
        };
        return buildMappedIfcSystemTreeByValue(nodes, getValue);
      }
      const getValues = (leaf: ClassificationNode): string[] => {
        const fromObject = (objects[leaf.code]?.authoringClassifications ?? [])
          .filter((c) => c.systemEntryId === systemEntryId)
          .map((c) => c.code)
          .filter((c) => c?.trim());
        if (fromObject.length > 0) return fromObject;
        return parseAuthoringValues(leaf.mappedValues?.[systemEntryId] ?? "");
      };
      return buildMappedSystemTreeByValues(nodes, getValues);
    }
    return isIfcSystem ? buildMappedIfcSystemTree(nodes, systemEntryId) : buildMappedSystemTree(nodes, systemEntryId);
  }
  return nodes;
}
