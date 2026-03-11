import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collectLeaves, filterTree } from "../../classification/parser";
import {
  type HierarchyViewMode,
  getHierarchyViewOptions,
  getHierarchyNodesForView,
} from "../../classification/hierarchyView";
import type { ClassificationData, ClassificationNode } from "../../classification/types";
import type { ClassificationSystemEntry, CodeList, Phase, ProjectObject, PurposeOfUseEntry } from "../../project/types";
import { PhaseManager } from "./PhaseManager";
import { PurposeOfUseManager } from "./PurposeOfUseManager";
import { CodeListManager } from "./CodeListManager";
import { ClassificationSystemsManager } from "./ClassificationSystemsManager";
import { useTranslation } from "../../translation/TranslationContext";

/**
 * Get maximum depth of the tree
 */
const getMaxLevel = (nodes: ClassificationNode[]): number => {
  let max = 0;
  const traverse = (node: ClassificationNode) => {
    if (node.level > max) max = node.level;
    node.children.forEach(traverse);
  };
  nodes.forEach(traverse);
  return max;
};

/**
 * Build a tree grouped by IFC entity types (jeden pohled – dělení dle IFC Entity).
 * Použije object.ifcEntity jako záložní zdroj, aby hierarchie odpovídala nastavení objektů i když uzel ještě nemá ifcEntity.
 */
const _buildIfcTree = (
  nodes: ClassificationNode[],
  objects?: Record<string, ProjectObject>
): ClassificationNode[] => {
  const leaves = collectLeaves(nodes);
  const byEntity: Record<string, ClassificationNode[]> = {};
  leaves.forEach((leaf) => {
    const entity = leaf.ifcEntity || objects?.[leaf.code]?.ifcEntity?.trim() || "Bez IFC entity";
    (byEntity[entity] ??= []).push(leaf);
  });

  // Sort entities alphabetically, but put "Bez IFC entity" last
  const sortedEntities = Object.keys(byEntity).sort((a, b) => {
    if (a === "Bez IFC entity") return 1;
    if (b === "Bez IFC entity") return -1;
    return a.localeCompare(b);
  });

  return sortedEntities.map((entity) => ({
    code: entity,
    description: entity,
    level: 1,
    children: byEntity[entity]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((item) => ({
        ...item,
        level: 2,
        children: [],
      })),
  }));
};

/**
 * Build a tree grouped by IFC predefined types (jeden pohled – dělení dle PredefinedType).
 * Použije object.predefinedType jako záložní zdroj.
 */
const _buildPredefinedTypeTree = (
  nodes: ClassificationNode[],
  objects?: Record<string, ProjectObject>
): ClassificationNode[] => {
  const leaves = collectLeaves(nodes);
  const byType: Record<string, ClassificationNode[]> = {};
  leaves.forEach((leaf) => {
    const ptFromObj =
      objects?.[leaf.code]?.predefinedType?.mode === "ENUM" || objects?.[leaf.code]?.predefinedType?.mode === "USERDEFINED"
        ? (objects[leaf.code].predefinedType?.value ?? "").trim() || "NOTDEFINED"
        : "";
    const key = leaf.predefinedType || ptFromObj || "Bez PredefinedType";
    (byType[key] ??= []).push(leaf);
  });
  const sortedKeys = Object.keys(byType).sort((a, b) => {
    if (a === "Bez PredefinedType") return 1;
    if (b === "Bez PredefinedType") return -1;
    return a.localeCompare(b);
  });
  return sortedKeys.map((key) => ({
    code: key,
    description: key,
    level: 1,
    children: byType[key]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((item) => ({ ...item, level: 2, children: [] })),
  }));
};

/**
 * Jednotný IFC pohled: úroveň 1 = IFC entity, úroveň 2 = predefined type pod správnou entitou, úroveň 3 = konkrétní prvky.
 * Používá se když IFC není primární klasifikace (jako dříve při zvláštním IFC klasifikačním systému).
 */
const _buildUnifiedIfcTree = (
  nodes: ClassificationNode[],
  objects?: Record<string, ProjectObject>
): ClassificationNode[] => {
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
    return {
      code: entity,
      description: entity,
      level: 1,
      children: level2Children,
    };
  });
};

const UNASSIGNED_LABEL = "nepřiřazeno";

/**
 * Build a tree grouped by a mapped system's values from classification nodes (node.mappedValues)
 */
const _buildMappedSystemTree = (
  nodes: ClassificationNode[],
  systemEntryId: string
): ClassificationNode[] => {
  const leaves = collectLeaves(nodes);
  const byValue: Record<string, ClassificationNode[]> = {};
  leaves.forEach((leaf) => {
    const key = leaf.mappedValues?.[systemEntryId] ?? "—";
    (byValue[key] ??= []).push(leaf);
  });
  const sortedKeys = Object.keys(byValue).sort((a, b) => {
    if (a === "—") return 1;
    if (b === "—") return -1;
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
};

const UNMAPPED_LABEL = "—";

/**
 * Build a 3-level tree for IFC mapped system: Entity → Entity::PredefinedType → leaves.
 * Level 1 = IFC entity (e.g. IfcAirTerminal), Level 2 = entity::type (e.g. IfcAirTerminal::DIFFUSER), Level 3 = objects.
 */
const _buildMappedIfcSystemTree = (
  nodes: ClassificationNode[],
  systemEntryId: string
): ClassificationNode[] => {
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
    return {
      code: entity,
      description: entity,
      level: 1,
      children: level2Children,
    };
  });
};

/**
 * Same 3-level IFC tree but value from getValue(leaf) (e.g. from object's ifcEntity + predefinedType).
 */
const _buildMappedIfcSystemTreeByValue = (
  nodes: ClassificationNode[],
  getValue: (leaf: ClassificationNode) => string
): ClassificationNode[] => {
  const leaves = collectLeaves(nodes);
  const byEntity: Record<string, Record<string, ClassificationNode[]>> = {};
  const unassignedLabel = UNASSIGNED_LABEL;
  leaves.forEach((leaf) => {
    const raw = getValue(leaf);
    const fullKey = raw && raw.trim() !== "" ? raw.trim() : unassignedLabel;
    const [entityPart] = fullKey.includes("::") ? fullKey.split("::") : [fullKey];
    const entityKey = (entityPart ?? "").trim() && entityPart !== unassignedLabel ? entityPart.trim() : unassignedLabel;
    if (!byEntity[entityKey]) byEntity[entityKey] = {};
    if (!byEntity[entityKey][fullKey]) byEntity[entityKey][fullKey] = [];
    byEntity[entityKey][fullKey].push(leaf);
  });
  const sortedEntities = Object.keys(byEntity).sort((a, b) => {
    if (a === unassignedLabel) return 1;
    if (b === unassignedLabel) return -1;
    return a.localeCompare(b);
  });
  return sortedEntities.map((entity) => {
    const byFullKey = byEntity[entity];
    const sortedFullKeys = Object.keys(byFullKey).sort((a, b) => {
      if (a === unassignedLabel) return 1;
      if (b === unassignedLabel) return -1;
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
    return {
      code: entity,
      description: entity,
      level: 1,
      children: level2Children,
    };
  });
};

/**
 * Build a tree grouped by values – list se zobrazí ve VŠECH skupinách, do kterých patří (pro více kategorií autorských nástrojů).
 * getValues(leaf) vrací pole hodnot; prázdné pole → "nepřiřazeno".
 */
const _buildMappedSystemTreeByValues = (
  nodes: ClassificationNode[],
  getValues: (leaf: ClassificationNode) => string[]
): ClassificationNode[] => {
  const leaves = collectLeaves(nodes);
  const byValue: Record<string, ClassificationNode[]> = {};
  leaves.forEach((leaf) => {
    const vals = getValues(leaf).map((v) => v?.trim()).filter(Boolean);
    if (vals.length === 0) {
      const key = UNASSIGNED_LABEL;
      (byValue[key] ??= []).push(leaf);
    } else {
      vals.forEach((key) => {
        (byValue[key] ??= []).push(leaf);
      });
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
};

// Reserved for future hierarchy view modes (satisfies noUnusedLocals)
void [
  _buildIfcTree,
  _buildPredefinedTypeTree,
  _buildUnifiedIfcTree,
  _buildMappedSystemTree,
  _buildMappedIfcSystemTree,
  _buildMappedIfcSystemTreeByValue,
  _buildMappedSystemTreeByValues,
];

interface Props {
  classification: ClassificationData | null;
  /** Objekty projektu (code -> object) – pro pohled „třídění autorských nástrojů“ seskupení dle přiřazených hodnot */
  objects?: Record<string, ProjectObject>;
  selectedCode?: string;
  onSelectLeaf: (node: ClassificationNode) => void;
  onUploadFile: (file: File) => Promise<void>;
  phases: Phase[];
  onAddPhase: (phase: Phase) => void;
  onUpdatePhase: (phase: Phase) => void;
  onDeletePhase: (id: string) => void;
  purposeOfUseEntries: PurposeOfUseEntry[];
  onAddPurposeOfUse: (entry: PurposeOfUseEntry) => void;
  onUpdatePurposeOfUse: (entry: PurposeOfUseEntry) => void;
  onDeletePurposeOfUse: (id: string) => void;
  codeLists: CodeList[];
  onAddCodeList: (list: CodeList) => void;
  onImportCodeLists?: (lists: CodeList[]) => void;
  onUpdateCodeList: (id: string, updates: Partial<CodeList>) => void;
  onDeleteCodeList: (id: string) => void;
  codeListUsage?: Record<
    string,
    Array<{
      objectCode: string;
      objectDescription?: string;
      propertyLabel?: string;
    }>
  >;
  classificationSystemEntries: ClassificationSystemEntry[];
  onAddClassificationSystemEntry: (entry: ClassificationSystemEntry) => void;
  onUpdateClassificationSystemEntry: (id: string, updates: Partial<ClassificationSystemEntry>) => void;
  onDeleteClassificationSystemEntry: (id: string) => void;
  schemaIndex?: import("../../schema/types").SchemaIndex | null;
  onAddIfcClassificationSystem?: (onAdded?: (entry: ClassificationSystemEntry) => void) => void;
}

const TreeItem: React.FC<{
  node: ClassificationNode;
  selectedCode?: string;
  onSelectLeaf: (node: ClassificationNode) => void;
  expandLevel: number | null;
  expandTrigger: number;
  /** V pohledu klasifikace: text badge IFC třída.PredefinedType (např. IfcAirTerminal.NOTDEFINED) */
  getIfcBadgeLabel?: (node: ClassificationNode) => string | undefined;
  /** Objekty projektu – u listů zobrazíme object.description (název z applicability) pouze při primárním IFC */
  objects?: Record<string, ProjectObject>;
  /** Při primárním „Třídění dle IFC“ se název bere z IFC/object; jinak vždy z node (klasifikace) */
  isIfcPrimary?: boolean;
}> = ({ node, selectedCode, onSelectLeaf, expandLevel, expandTrigger, getIfcBadgeLabel, objects, isIfcPrimary }) => {
  const { showCzTranslations } = useTranslation();
  const [expanded, setExpanded] = useState(node.level <= 2);
  const isLeaf = node.children.length === 0;
  /** Výběr jen u skutečných objektů (kód existuje v objects). Po vyhledání může být uzel „list“ bez dětí, ale bez odpovídajícího objektu – ten nesmí otevřít nový objekt. */
  const isSelectableLeaf = isLeaf && !!objects?.[node.code];
  const isSelected = selectedCode === node.code;
  const obj = isLeaf ? objects?.[node.code] : undefined;
  const src = obj?.copiedFrom ? objects?.[obj.copiedFrom] : undefined;
  const isIncompleteCopy = !!(
    isLeaf &&
    obj?.copiedFrom &&
    src &&
    obj.ifcEntity === src.ifcEntity &&
    ((obj.predefinedType?.mode === "ENUM" || obj.predefinedType?.mode === "USERDEFINED" ? obj.predefinedType?.value : undefined) ===
      (src.predefinedType?.mode === "ENUM" || src.predefinedType?.mode === "USERDEFINED" ? src.predefinedType?.value : undefined))
  );
  // Při primární klasifikaci (ne IFC) vždy název z node; při Třídění dle IFC z IFC entity nebo object.description
  const displayLabel =
    !isIfcPrimary && isLeaf
      ? (node.description || node.code)
      : isLeaf && node.ifcEntity
        ? `${node.ifcEntity}.${node.predefinedType ?? "NOTDEFINED"}`
        : isLeaf && objects?.[node.code]?.description
          ? objects[node.code].description
          : (node.description || node.code);

  // Badge nezobrazovat u NOTDEFINED – jen u konkrétních predefined typů
  const ifcBadgeLabel =
    isLeaf &&
    node.ifcEntity &&
    node.predefinedType &&
    node.predefinedType !== "NOTDEFINED" &&
    (getIfcBadgeLabel?.(node) ?? `${node.ifcEntity}.${node.predefinedType}`);

  const czTranslation = showCzTranslations && isLeaf && obj && (obj.ifcEntityCz || obj.predefinedTypeCz)
    ? `${obj.ifcEntityCz || ""}${obj.ifcEntityCz && obj.predefinedTypeCz ? " - " : ""}${obj.predefinedTypeCz || ""}`
    : undefined;

  useEffect(() => {
    if (expandLevel !== null) {
      setExpanded(node.level <= expandLevel);
    }
  }, [expandLevel, expandTrigger, node.level]);

  return (
    <div className="border-l border-slate-200 pl-3">
      <div className="flex items-center gap-2 py-1">
        {!isLeaf && (
          <button
            className="flex h-5 w-5 items-center justify-center rounded text-xs text-slate-500 hover:bg-slate-200 hover:text-slate-800"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "−" : "+"}
          </button>
        )}
        {isLeaf && <span className="w-5" />}
        <div className="flex-1">
          <div
            className={`flex cursor-pointer items-center justify-between rounded px-2 py-1 hover:bg-slate-100 ${
              isIncompleteCopy ? "bg-red-100 text-red-800" : isSelected ? "bg-red-100 text-red-700" : "text-slate-800"
            }`}
            onClick={() => {
              if (isSelectableLeaf) onSelectLeaf(node);
              else if (!isLeaf) setExpanded((v) => !v);
            }}
            aria-label={isSelectableLeaf ? "Select leaf" : !isLeaf ? "Expand/Collapse" : undefined}
          >
            <div className="flex flex-col">
              <span className={`text-sm ${isLeaf ? "font-semibold" : "font-medium"}`}>
                {(displayLabel || node.code).replace(/::/g, ".")}
              </span>
              {!(isLeaf && node.ifcEntity) && node.code !== (displayLabel || node.code) && (
                <span className="text-[11px] text-slate-500">{node.code.replace(/::/g, ".")}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {ifcBadgeLabel && ifcBadgeLabel.replace(/::/g, ".") !== (displayLabel || node.code).replace(/::/g, ".") && !isIfcPrimary && (
                <span className="shrink-0 rounded bg-slate-200 px-2 py-0.5 text-[10px] text-slate-700">
                  {ifcBadgeLabel.replace(/::/g, ".")}
                </span>
              )}
              {czTranslation && (
                <span className="shrink-0 rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                  {czTranslation}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      {expanded &&
        node.children.map((child) => (
          <TreeItem
            key={child.code}
            node={child}
            selectedCode={selectedCode}
            onSelectLeaf={onSelectLeaf}
            expandLevel={expandLevel}
            expandTrigger={expandTrigger}
            getIfcBadgeLabel={getIfcBadgeLabel}
            objects={objects}
            isIfcPrimary={isIfcPrimary}
          />
        ))}
    </div>
  );
};

export const ClassificationPanel: React.FC<Props> = ({
  classification,
  objects = {},
  selectedCode,
  onSelectLeaf,
  onUploadFile,
  phases,
  onAddPhase,
  onUpdatePhase,
  onDeletePhase,
  purposeOfUseEntries = [],
  onAddPurposeOfUse,
  onUpdatePurposeOfUse,
  onDeletePurposeOfUse,
  codeLists,
  onAddCodeList,
  onImportCodeLists,
  onUpdateCodeList,
  onDeleteCodeList,
  codeListUsage,
  classificationSystemEntries,
  onAddClassificationSystemEntry,
  onUpdateClassificationSystemEntry,
  onDeleteClassificationSystemEntry,
  schemaIndex,
  onAddIfcClassificationSystem,
}) => {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"hierarchy" | "phases" | "useCases" | "codelists" | "classificationsystems">("hierarchy");
  const [viewMode, setViewMode] = useState<HierarchyViewMode>("classification");
  const [expandLevel, setExpandLevel] = useState<number | null>(null);
  const [expandTrigger, setExpandTrigger] = useState(0);

  // Primární namapovaná klasifikace – z ní vycházejí pohledy (dělení)
  const primarySystem = useMemo(() => {
    return classificationSystemEntries.find((s) => s.isPrimary);
  }, [classificationSystemEntries]);

  const hierarchyViewOptions = useMemo(
    () => getHierarchyViewOptions(classification, primarySystem, classificationSystemEntries, objects ?? {}),
    [classification, primarySystem, classificationSystemEntries, objects]
  );

  const baseNodes = useMemo(
    () =>
      getHierarchyNodesForView(
        viewMode,
        classification,
        primarySystem,
        classificationSystemEntries,
        objects ?? {}
      ),
    [viewMode, classification, primarySystem, classificationSystemEntries, objects]
  );

  const filteredNodes = useMemo(() => {
    if (!baseNodes.length) return [];
    return filterTree(baseNodes, search);
  }, [baseNodes, search]);

  // Objekty mimo hierarchii (existují v projektu, ale nejsou listem ve stromu) – zobrazíme je zvlášť se zvýrazněním
  const codesInTree = useMemo(
    () => new Set(collectLeaves(baseNodes).map((n) => n.code)),
    [baseNodes],
  );
  const orphanObjectCodes = useMemo(
    () => Object.keys(objects).filter((code) => !codesInTree.has(code)),
    [objects, codesInTree],
  );
  const filteredOrphanCodes = useMemo(() => {
    if (!search.trim() || orphanObjectCodes.length === 0) return orphanObjectCodes;
    const q = search.trim().toLowerCase();
    return orphanObjectCodes.filter((code) => {
      const obj = objects[code];
      const desc = (obj?.description ?? code).toLowerCase();
      return desc.includes(q) || code.toLowerCase().includes(q);
    });
  }, [orphanObjectCodes, objects, search]);

  // V pohledu „klasifikace“: badge IFC třída.PredefinedType (z uzlu nebo z mappedValues u pure systému) – u položek mimo hierarchii se badge nezobrazuje
  const getIfcBadgeLabel = useMemo((): ((node: ClassificationNode) => string | undefined) | undefined => {
    if (viewMode !== "classification") return undefined;
    const ifcSystemId = primarySystem?.mappedSystemIds?.find((sid) =>
      classificationSystemEntries.some((e) => e.id === sid && e.isIfcSystem)
    );
    return (node: ClassificationNode) => {
      if (node.ifcEntity) {
        return `${node.ifcEntity}.${node.predefinedType || "NOTDEFINED"}`;
      }
      if (ifcSystemId && node.mappedValues?.[ifcSystemId]) {
        const raw = (node.mappedValues[ifcSystemId] ?? "").trim();
        if (!raw) return undefined;
        const withDot = raw.replace(/::/g, ".");
        return raw.includes("::") ? withDot : `${withDot}.NOTDEFINED`;
      }
      return undefined;
    };
  }, [viewMode, primarySystem, classificationSystemEntries]);

  // Pokud aktuální pohled už není v seznamu (např. změna primárního systému), přepni na hlavní klasifikaci
  useEffect(() => {
    const valid = hierarchyViewOptions.some((opt) => opt.value === viewMode);
    if (hierarchyViewOptions.length > 0 && !valid) {
      setViewMode("classification");
    }
  }, [hierarchyViewOptions, viewMode]);

  // Get max level from the currently displayed tree (after filtering)
  const maxLevel = useMemo(() => {
    if (!filteredNodes.length) return 0;
    return getMaxLevel(filteredNodes);
  }, [filteredNodes]);

  // Expand/collapse handler
  const handleExpandToLevel = useCallback((level: number) => {
    setExpandLevel(level);
    setExpandTrigger((t) => t + 1);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden border-r border-slate-200 bg-white">
      <div className="flex items-center gap-1 border-b border-slate-200 px-3 pt-3">
        {[
          { key: "hierarchy", label: "Hierarchie" },
          { key: "phases", label: "Fáze" },
          { key: "useCases", label: "Účely užití" },
          { key: "codelists", label: "Číselníky" },
          { key: "classificationsystems", label: "Třídění a mapování prvků" },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`rounded-t px-3 py-2 text-sm ${
              activeTab === tab.key ? "bg-white text-red-600 shadow-inner" : "text-slate-600"
            }`}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "hierarchy" && (
        <div className="flex h-full flex-col gap-2 overflow-hidden p-3">
          {/* Pohled = dělení primárního namapovaného systému (hlavní klasifikace, IFC Entity, PredefinedType, namapované systémy) */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">Pohled:</span>
            <div className="flex items-center gap-2">
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as HierarchyViewMode)}
                className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
              >
                {hierarchyViewOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Hledat kód nebo popis"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>

          {/* Expand/Collapse controls */}
          {classification && maxLevel > 1 && (
            <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 pb-2">
              <span className="mr-1 text-xs text-slate-500">Zobrazit úroveň:</span>
              {Array.from({ length: maxLevel }, (_, i) => i + 1).map((level) => (
                <button
                  key={level}
                  onClick={() => handleExpandToLevel(level - 1)}
                  className={`rounded border px-2 py-0.5 text-xs hover:bg-slate-100 ${
                    expandLevel === level - 1
                      ? "border-red-400 bg-red-50 text-red-700"
                      : "border-slate-300 text-slate-600"
                  }`}
                  title={`Zobrazit do úrovně ${level}`}
                >
                  {level}
                </button>
              ))}
            </div>
          )}

          {classification && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="text-[11px] text-slate-500">
                Zdroj: {primarySystem?.name ?? classification.sourceName}
              </span>
              <span className="ml-auto text-[11px] text-slate-400">
                Pohled: {hierarchyViewOptions.find((o) => o.value === viewMode)?.label ?? viewMode}
              </span>
            </div>
          )}
          <div className="flex-1 overflow-auto rounded border border-slate-200 bg-slate-50 p-2">
            {!classification && (
              <div className="text-sm text-slate-500">
                Není načtena klasifikace. Přejděte do záložky „Třídění a mapování prvků“ a nahrajte soubor (TXT nebo XLSX) nebo přidejte třídící systém (IFC / čistý).
              </div>
            )}
            {classification &&
              (filteredNodes.length > 0 || filteredOrphanCodes.length > 0 ? (
                <>
                  {filteredNodes.map((node) => (
                    <TreeItem
                      key={node.code}
                      node={node}
                      selectedCode={selectedCode}
                      onSelectLeaf={onSelectLeaf}
                      expandLevel={expandLevel}
                      expandTrigger={expandTrigger}
                      getIfcBadgeLabel={getIfcBadgeLabel}
                      objects={objects}
                      isIfcPrimary={primarySystem?.isIfcSystem === true}
                    />
                  ))}
                  {viewMode === "classification" && filteredOrphanCodes.length > 0 && (
                    <div className="mt-3 border-t border-amber-200 pt-2">
                      <div className="mb-1.5 px-2 text-[11px] font-medium uppercase text-amber-700">
                        Entity mimo hierarchii
                      </div>
                      {filteredOrphanCodes.map((code) => {
                        const obj = objects[code];
                        const desc = obj?.description ?? code;
                        const isSelected = selectedCode === code;
                        const label =
                          code.includes("::")
                            ? code.replace("::", ".")
                            : (desc || code);
                        return (
                          <div
                            key={code}
                            className={`flex cursor-pointer items-center rounded px-2 py-1.5 pl-5 hover:bg-amber-100 ${
                              isSelected ? "bg-amber-200 text-amber-900" : "bg-amber-50 text-amber-900"
                            }`}
                            onClick={() =>
                              onSelectLeaf({
                                code,
                                description: desc,
                                level: 2,
                                children: [],
                              })
                            }
                          >
                            <span className="text-sm font-semibold">{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-slate-500">
                  Žádný výsledek
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="ml-2 text-red-600 hover:underline"
                    >
                      Zrušit hledání
                    </button>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {activeTab === "phases" && (
        <div className="flex flex-1 flex-col overflow-hidden p-3">
          <PhaseManager
            phases={phases}
            onAddPhase={onAddPhase}
            onUpdatePhase={onUpdatePhase}
            onDeletePhase={onDeletePhase}
          />
        </div>
      )}

      {activeTab === "useCases" && (
        <div className="flex flex-1 flex-col overflow-hidden p-3">
          <PurposeOfUseManager
            entries={purposeOfUseEntries}
            onAdd={onAddPurposeOfUse}
            onUpdate={onUpdatePurposeOfUse}
            onDelete={onDeletePurposeOfUse}
          />
        </div>
      )}

      {activeTab === "codelists" && (
        <div className="flex flex-1 flex-col overflow-hidden p-3">
          <CodeListManager
            codeLists={codeLists}
            usage={codeListUsage}
            onAdd={onAddCodeList}
            onImport={onImportCodeLists}
            onUpdate={onUpdateCodeList}
            onDelete={onDeleteCodeList}
          />
        </div>
      )}

      {activeTab === "classificationsystems" && (
        <div className="flex flex-1 flex-col overflow-hidden p-3">
          <ClassificationSystemsManager
            systems={classificationSystemEntries}
            onAdd={onAddClassificationSystemEntry}
            onUpdate={onUpdateClassificationSystemEntry}
            onDelete={onDeleteClassificationSystemEntry}
            onUploadFile={onUploadFile}
            schemaIndex={schemaIndex}
            onAddIfcClassificationSystem={onAddIfcClassificationSystem}
          />
        </div>
      )}
    </div>
  );
};
