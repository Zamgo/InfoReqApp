import React, { useMemo, useState } from "react";
import { collectLeaves, filterTree } from "../../classification/parser";
import type { ClassificationData, ClassificationNode } from "../../classification/types";
import type { ClassificationSystemEntry, CodeList, Phase } from "../../project/types";
import { PhaseManager } from "./PhaseManager";
import { CodeListManager } from "./CodeListManager";
import { ClassificationSystemsManager } from "./ClassificationSystemsManager";

type ViewMode = "classification" | "ifc";

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
  classificationSystemUsage?: Record<
    string,
    Array<{
      objectCode: string;
      objectDescription?: string;
    }>
  >;
}

const TreeItem: React.FC<{
  node: ClassificationNode;
  selectedCode?: string;
  onSelectLeaf: (node: ClassificationNode) => void;
}> = ({ node, selectedCode, onSelectLeaf }) => {
  const [expanded, setExpanded] = useState(node.level <= 2);
  const isLeaf = node.children.length === 0;
  const isSelected = selectedCode === node.code;

  return (
    <div className="border-l border-slate-200 pl-3">
      <div className="flex items-center gap-2 py-1">
        {!isLeaf && (
          <button
            className="text-xs text-slate-500 hover:text-slate-800"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "−" : "+"}
          </button>
        )}
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
  classificationSystemUsage,
}) => {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"hierarchy" | "phases" | "codelists" | "classificationsystems">("hierarchy");
  const [viewMode, setViewMode] = useState<ViewMode>("classification");

  // Get the primary classification system if available
  const primarySystem = useMemo(() => {
    return classificationSystemEntries.find((s) => s.isPrimary);
  }, [classificationSystemEntries]);

  // Build the base nodes depending on view mode
  const baseNodes = useMemo(() => {
    if (!classification) return [];
    if (viewMode === "ifc") {
      return buildIfcTree(classification.nodes);
    }
    return classification.nodes;
  }, [classification, viewMode]);

  const filteredNodes = useMemo(() => {
    if (!baseNodes.length) return [];
    return filterTree(baseNodes, search);
  }, [baseNodes, search]);

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
        <div className="flex h-full flex-col gap-3 overflow-hidden p-3">
          {/* View mode selector and search */}
          <div className="flex items-center gap-2">
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as ViewMode)}
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
          {classification && (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="text-[11px] text-slate-500">
                Zdroj: {classification.sourceName}
              </span>
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
                  />
                ))
              ) : (
                <div className="text-sm text-slate-500">Žádný výsledek</div>
              ))}
          </div>
        </div>
      )}

      {activeTab === "phases" && (
        <div className="flex h-full flex-col p-3">
          <PhaseManager
            phases={phases}
            onAddPhase={onAddPhase}
            onUpdatePhase={onUpdatePhase}
            onDeletePhase={onDeletePhase}
          />
        </div>
      )}

      {activeTab === "codelists" && (
        <div className="flex h-full flex-col p-3">
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
        <div className="flex h-full flex-col p-3">
          <ClassificationSystemsManager
            systems={classificationSystemEntries}
            usage={classificationSystemUsage}
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
