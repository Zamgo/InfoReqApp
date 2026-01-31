import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collectLeaves, filterTree } from "../../classification/parser";
import type { ClassificationData, ClassificationNode } from "../../classification/types";
import type { ClassificationSystemEntry, CodeList, Phase, ProjectObject } from "../../project/types";
import { PhaseManager } from "./PhaseManager";
import { CodeListManager } from "./CodeListManager";
import { ClassificationSystemsManager } from "./ClassificationSystemsManager";

/** Pohled v hierarchii = jedno „dělení“ primárního namapovaného systému */
type HierarchyViewMode = "classification" | "ifc" | "predefinedType" | `mapped:${string}`;

/**
 * Collect all unique IFC entities from tree
 */
const collectIfcEntities = (nodes: ClassificationNode[]): string[] => {
  const entities = new Set<string>();
  const traverse = (node: ClassificationNode) => {
    if (node.ifcEntity) {
      entities.add(node.ifcEntity);
    }
    node.children.forEach(traverse);
  };
  nodes.forEach(traverse);
  return Array.from(entities).sort();
};

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
 * Build a tree grouped by IFC entity types (jeden pohled – dělení dle IFC Entity)
 */
const buildIfcTree = (nodes: ClassificationNode[]): ClassificationNode[] => {
  const leaves = collectLeaves(nodes);
  const byEntity: Record<string, ClassificationNode[]> = {};
  
  leaves.forEach((leaf) => {
    const entity = leaf.ifcEntity || "Bez IFC entity";
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
 * Build a tree grouped by IFC predefined types (jeden pohled – dělení dle PredefinedType)
 */
const buildPredefinedTypeTree = (nodes: ClassificationNode[]): ClassificationNode[] => {
  const leaves = collectLeaves(nodes);
  const byType: Record<string, ClassificationNode[]> = {};
  leaves.forEach((leaf) => {
    const key = leaf.predefinedType || "Bez PredefinedType";
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

const UNASSIGNED_LABEL = "nepřiřazeno";

/**
 * Build a tree grouped by a mapped system's values from classification nodes (node.mappedValues)
 */
const buildMappedSystemTree = (
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

/**
 * Build a tree grouped by value per leaf (object assignment nebo node.mappedValues).
 * getValue(leaf) vrací hodnotu pro daný list; prázdné → "nepřiřazeno".
 */
const buildMappedSystemTreeByValue = (
  nodes: ClassificationNode[],
  getValue: (leaf: ClassificationNode) => string
): ClassificationNode[] => {
  const leaves = collectLeaves(nodes);
  const byValue: Record<string, ClassificationNode[]> = {};
  leaves.forEach((leaf) => {
    const raw = getValue(leaf);
    const key = raw && raw.trim() !== "" ? raw.trim() : UNASSIGNED_LABEL;
    (byValue[key] ??= []).push(leaf);
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

interface Props {
  classification: ClassificationData | null;
  /** Objekty projektu (code -> object) – pro pohled „třídění autorských nástrojů“ seskupení dle přiřazených hodnot */
  objects?: Record<string, ProjectObject>;
  selectedCode?: string;
  onSelectLeaf: (node: ClassificationNode) => void;
  onUploadFile: (file: File) => Promise<void>;
  onResetDefault: () => void;
  phases: Phase[];
  onAddPhase: (phase: Phase) => void;
  onUpdatePhase: (phase: Phase) => void;
  onDeletePhase: (id: string) => void;
  codeLists: CodeList[];
  onAddCodeList: (list: CodeList) => void;
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
}

const TreeItem: React.FC<{
  node: ClassificationNode;
  selectedCode?: string;
  onSelectLeaf: (node: ClassificationNode) => void;
  expandLevel: number | null; // null = use default, number = expand to this level
  expandTrigger: number; // changes when expand/collapse action is triggered
}> = ({ node, selectedCode, onSelectLeaf, expandLevel, expandTrigger }) => {
  const [expanded, setExpanded] = useState(node.level <= 2);
  const isLeaf = node.children.length === 0;
  const isSelected = selectedCode === node.code;

  // React to external expand/collapse commands
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
              isSelected ? "bg-indigo-100 text-indigo-700" : "text-slate-800"
            }`}
            onClick={() => isLeaf && onSelectLeaf(node)}
            aria-label={isLeaf ? "Select leaf" : "Toggle"}
          >
            <div className="flex flex-col">
              <span className={`text-sm ${isLeaf ? "font-semibold" : "font-medium"}`}>
                {node.description || node.code}
              </span>
              <span className="text-[11px] text-slate-500">{node.code}</span>
            </div>
            {node.ifcEntity && isLeaf && (
              <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] uppercase text-slate-700">
                {node.ifcEntity}
              </span>
            )}
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
  onResetDefault,
  phases,
  onAddPhase,
  onUpdatePhase,
  onDeletePhase,
  codeLists,
  onAddCodeList,
  onUpdateCodeList,
  onDeleteCodeList,
  codeListUsage,
  classificationSystemEntries,
  onAddClassificationSystemEntry,
  onUpdateClassificationSystemEntry,
  onDeleteClassificationSystemEntry,
}) => {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"hierarchy" | "phases" | "codelists" | "classificationsystems">("hierarchy");
  const [viewMode, setViewMode] = useState<HierarchyViewMode>("classification");
  const [expandLevel, setExpandLevel] = useState<number | null>(null);
  const [expandTrigger, setExpandTrigger] = useState(0);

  // Primární namapovaná klasifikace – z ní vycházejí pohledy (dělení)
  const primarySystem = useMemo(() => {
    return classificationSystemEntries.find((s) => s.isPrimary);
  }, [classificationSystemEntries]);

  // Seznam pohledů = dělení primárního namapovaného systému (hlavní klasifikace, IFC Entity, PredefinedType, namapované systémy)
  const hierarchyViewOptions = useMemo((): { value: HierarchyViewMode; label: string }[] => {
    const fallback = [
      { value: "classification" as HierarchyViewMode, label: primarySystem?.name ?? "Klasifikace" },
    ];
    if (!classification) return fallback;
    const options: { value: HierarchyViewMode; label: string }[] = [];

    const nodes = classification.nodes;
    const hasIfcEntities = collectIfcEntities(nodes).length > 0;
    const hasPredefinedTypes = (() => {
      const set = new Set<string>();
      const traverse = (node: ClassificationNode) => {
        if (node.predefinedType) set.add(node.predefinedType);
        node.children.forEach(traverse);
      };
      nodes.forEach(traverse);
      return set.size > 0;
    })();

    // 1. Hlavní klasifikace (vždy)
    options.push({
      value: "classification",
      label: primarySystem?.name ?? "Klasifikace",
    });
    // 2. IFC Entity (pokud má data)
    if (hasIfcEntities) {
      options.push({ value: "ifc", label: "IFC Entity" });
    }
    // 3. IFC PredefinedType (pokud má data)
    if (hasPredefinedTypes) {
      options.push({ value: "predefinedType", label: "IFC PredefinedType" });
    }
    // 4. Každý namapovaný systém (třídění nástrojů, Kategorie RVT, …)
    (primarySystem?.mappedSystemIds ?? []).forEach((systemEntryId) => {
      const entry = classificationSystemEntries.find((e) => e.id === systemEntryId);
      options.push({
        value: `mapped:${systemEntryId}` as HierarchyViewMode,
        label: entry?.name ?? systemEntryId,
      });
    });

    return options;
  }, [classification, primarySystem, classificationSystemEntries]);

  // Strom podle vybraného pohledu (jedno dělení = jeden strom)
  const baseNodes = useMemo(() => {
    if (!classification) return [];
    const nodes = classification.nodes;
    if (viewMode === "classification") return nodes;
    if (viewMode === "ifc") return buildIfcTree(nodes);
    if (viewMode === "predefinedType") return buildPredefinedTypeTree(nodes);
    if (viewMode.startsWith("mapped:")) {
      const systemEntryId = viewMode.slice(7);
      // Když máme objekty, seskupujeme dle přiřazené hodnoty na objektu (authoringClassifications), jinak dle node.mappedValues
      if (Object.keys(objects).length > 0) {
        const getValue = (leaf: ClassificationNode): string => {
          const fromObject = objects[leaf.code]?.authoringClassifications?.find(
            (c) => c.systemEntryId === systemEntryId
          )?.code;
          if (fromObject != null && fromObject.trim() !== "") return fromObject.trim();
          return leaf.mappedValues?.[systemEntryId] ?? "";
        };
        return buildMappedSystemTreeByValue(nodes, getValue);
      }
      return buildMappedSystemTree(nodes, systemEntryId);
    }
    return nodes;
  }, [classification, viewMode, objects]);

  const filteredNodes = useMemo(() => {
    if (!baseNodes.length) return [];
    return filterTree(baseNodes, search);
  }, [baseNodes, search]);

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
          { key: "codelists", label: "Číselníky" },
          { key: "classificationsystems", label: "Klasifikační systémy a mapování" },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`rounded-t px-3 py-2 text-sm ${
              activeTab === tab.key ? "bg-white text-indigo-600 shadow-inner" : "text-slate-600"
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
                      ? "border-indigo-400 bg-indigo-50 text-indigo-700"
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
                Zdroj: {classification.sourceName}
              </span>
              <span className="ml-auto text-[11px] text-slate-400">
                Pohled: {hierarchyViewOptions.find((o) => o.value === viewMode)?.label ?? viewMode}
              </span>
            </div>
          )}
          <div className="flex-1 overflow-auto rounded border border-slate-200 bg-slate-50 p-2">
            {!classification && (
              <div className="text-sm text-slate-500">
                Není načtena klasifikace. Přejděte do záložky "Klasifikační systémy a mapování".
              </div>
            )}
            {classification &&
              (filteredNodes.length ? (
                filteredNodes.map((node) => (
                  <TreeItem
                    key={node.code}
                    node={node}
                    selectedCode={selectedCode}
                    onSelectLeaf={onSelectLeaf}
                    expandLevel={expandLevel}
                    expandTrigger={expandTrigger}
                  />
                ))
              ) : (
                <div className="text-sm text-slate-500">
                  Žádný výsledek
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="ml-2 text-indigo-600 hover:underline"
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

      {activeTab === "codelists" && (
        <div className="flex flex-1 flex-col overflow-hidden p-3">
          <CodeListManager
            codeLists={codeLists}
            usage={codeListUsage}
            onAdd={onAddCodeList}
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
            onResetDefault={onResetDefault}
          />
        </div>
      )}
    </div>
  );
};
