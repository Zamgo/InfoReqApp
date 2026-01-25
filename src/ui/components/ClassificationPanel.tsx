import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collectLeaves, filterTree } from "../../classification/parser";
import type { ClassificationData, ClassificationNode } from "../../classification/types";
import type { ClassificationSystemEntry, CodeList, Phase } from "../../project/types";
import { PhaseManager } from "./PhaseManager";
import { CodeListManager } from "./CodeListManager";
import { ClassificationSystemsManager } from "./ClassificationSystemsManager";

type ViewMode = "classification" | "ifc";

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
 * Filter tree by IFC entity type
 */
const filterByIfcEntity = (nodes: ClassificationNode[], entity: string): ClassificationNode[] => {
  const filter = (node: ClassificationNode): ClassificationNode | null => {
    // If this node matches, include it with filtered children
    if (node.ifcEntity === entity) {
      return { ...node, children: [] };
    }
    // Otherwise check children
    const filteredChildren = node.children
      .map(filter)
      .filter((n): n is ClassificationNode => n !== null);
    
    if (filteredChildren.length > 0) {
      return { ...node, children: filteredChildren };
    }
    return null;
  };
  
  return nodes.map(filter).filter((n): n is ClassificationNode => n !== null);
};

/**
 * Build a tree grouped by IFC entity types
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

interface Props {
  classification: ClassificationData | null;
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
  const [viewMode, setViewMode] = useState<ViewMode>("classification");
  const [ifcEntityFilter, setIfcEntityFilter] = useState<string>(""); // filter by IFC entity
  const [expandLevel, setExpandLevel] = useState<number | null>(null);
  const [expandTrigger, setExpandTrigger] = useState(0);

  // Get the primary classification system if available
  const primarySystem = useMemo(() => {
    return classificationSystemEntries.find((s) => s.isPrimary);
  }, [classificationSystemEntries]);

  // Collect available IFC entities for filtering
  const availableIfcEntities = useMemo(() => {
    if (!classification) return [];
    return collectIfcEntities(classification.nodes);
  }, [classification]);

  // Build the base nodes depending on view mode
  const baseNodes = useMemo(() => {
    if (!classification) return [];
    if (viewMode === "ifc") {
      return buildIfcTree(classification.nodes);
    }
    return classification.nodes;
  }, [classification, viewMode]);

  // Apply IFC entity filter
  const ifcFilteredNodes = useMemo(() => {
    if (!baseNodes.length || !ifcEntityFilter || viewMode === "ifc") return baseNodes;
    return filterByIfcEntity(baseNodes, ifcEntityFilter);
  }, [baseNodes, ifcEntityFilter, viewMode]);

  const filteredNodes = useMemo(() => {
    if (!ifcFilteredNodes.length) return [];
    return filterTree(ifcFilteredNodes, search);
  }, [ifcFilteredNodes, search]);

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
          { key: "classificationsystems", label: "Klasifikační systémy" },
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
          {/* View mode selector and search */}
          <div className="flex items-center gap-2">
            <select
              value={viewMode}
              onChange={(e) => {
                setViewMode(e.target.value as ViewMode);
                setIfcEntityFilter(""); // reset filter when switching view
              }}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="classification">
                {primarySystem?.name || "Klasifikace"}
              </option>
              <option value="ifc">IFC Entity</option>
            </select>
            <input
              type="text"
              placeholder="Hledat kód nebo popis"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>

          {/* IFC Entity filter - only in classification view */}
          {viewMode === "classification" && availableIfcEntities.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">IFC filtr:</span>
              <select
                value={ifcEntityFilter}
                onChange={(e) => setIfcEntityFilter(e.target.value)}
                className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
              >
                <option value="">Všechny entity ({availableIfcEntities.length})</option>
                {availableIfcEntities.map((entity) => (
                  <option key={entity} value={entity}>
                    {entity}
                  </option>
                ))}
              </select>
              {ifcEntityFilter && (
                <button
                  onClick={() => setIfcEntityFilter("")}
                  className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  title="Zrušit filtr"
                >
                  ✕
                </button>
              )}
            </div>
          )}

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
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="text-[11px] text-slate-500">
                Zdroj: {classification.sourceName}
              </span>
              {ifcEntityFilter && (
                <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] text-indigo-700">
                  {ifcEntityFilter}
                </span>
              )}
              <span className="ml-auto text-[11px] text-slate-400">
                {viewMode === "classification" ? "Pohled: Klasifikace" : "Pohled: IFC Entity"}
              </span>
            </div>
          )}
          <div className="flex-1 overflow-auto rounded border border-slate-200 bg-slate-50 p-2">
            {!classification && (
              <div className="text-sm text-slate-500">
                Není načtena klasifikace. Přejděte do záložky "Klasifikační systémy".
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
                  {ifcEntityFilter && (
                    <button
                      onClick={() => setIfcEntityFilter("")}
                      className="ml-2 text-indigo-600 hover:underline"
                    >
                      Zrušit IFC filtr
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
