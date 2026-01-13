import React, { useMemo, useState } from "react";
import { filterTree } from "../../classification/parser";
import type { ClassificationData, ClassificationNode } from "../../classification/types";
import type { Phase } from "../../project/types";
import { PhaseManager } from "./PhaseManager";

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
}) => {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"hierarchy" | "phases">("hierarchy");

  const filteredNodes = useMemo(() => {
    if (!classification) return [];
    return filterTree(classification.nodes, search);
  }, [classification, search]);

  const onFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = e.target.files?.[0];
    if (file) {
      await onUploadFile(file);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden border-r border-slate-200 bg-white">
      <div className="flex items-center gap-1 border-b border-slate-200 px-3 pt-3">
        {[
          { key: "hierarchy", label: "Hierarchie" },
          { key: "phases", label: "Fáze" },
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
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Hledat kód nebo popis"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-slate-300 px-2 py-1 hover:bg-slate-50">
              <input
                type="file"
                accept=".txt"
                onChange={onFileChange}
                className="hidden"
              />
              <span>Import TXT</span>
            </label>
            <button
              className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
              onClick={onResetDefault}
            >
              Načíst výchozí
            </button>
            {classification && (
              <span className="ml-auto text-[11px] text-slate-500">
                Zdroj: {classification.sourceName}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-auto rounded border border-slate-200 bg-slate-50 p-2">
            {!classification && (
              <div className="text-sm text-slate-500">
                Není načtena klasifikace. Nahrajte TXT soubor.
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
    </div>
  );
};
