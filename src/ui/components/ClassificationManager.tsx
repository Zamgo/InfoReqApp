import React, { useState } from "react";
import type { ClassificationSystem, IfcClassification } from "../../classification/types";
import { DocLink } from "./DocLink";

interface Props {
  classifications: ClassificationSystem[];
  primaryClassificationId: string;
  onAddClassification: (system: ClassificationSystem) => void;
  onUpdateClassification: (id: string, updates: Partial<ClassificationSystem>) => void;
  onDeleteClassification: (id: string) => void;
  onSetPrimary: (id: string) => void;
  onUploadFile: (file: File, ifcMetadata?: Partial<IfcClassification>) => Promise<void>;
}

const IFC_CLASSIFICATION_DOC_URL =
  "https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcClassification.htm";

interface EditingClassification {
  id: string;
  ifcClassification: IfcClassification;
}

export const ClassificationManager: React.FC<Props> = ({
  classifications,
  primaryClassificationId,
  onUpdateClassification,
  onDeleteClassification,
  onSetPrimary,
  onUploadFile,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<EditingClassification | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newClassificationMetadata, setNewClassificationMetadata] = useState<Partial<IfcClassification>>({
    Name: "",
    Source: "",
    Edition: "",
    Description: "",
    Specification: "",
  });
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEditing = (cls: ClassificationSystem) => {
    setEditing({
      id: cls.id,
      ifcClassification: { ...cls.ifcClassification },
    });
  };

  const saveEditing = () => {
    if (!editing) return;
    onUpdateClassification(editing.id, {
      ifcClassification: editing.ifcClassification,
    });
    setEditing(null);
  };

  const cancelEditing = () => {
    setEditing(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
      setNewClassificationMetadata({
        Name: file.name.replace(/\.[^/.]+$/, ""),
        Source: "",
        Edition: "",
        Description: "",
        Specification: "",
      });
      setShowAddDialog(true);
    }
    e.target.value = "";
  };

  const confirmAddClassification = async () => {
    if (!pendingFile) return;
    await onUploadFile(pendingFile, newClassificationMetadata);
    setPendingFile(null);
    setShowAddDialog(false);
    setNewClassificationMetadata({
      Name: "",
      Source: "",
      Edition: "",
      Description: "",
      Specification: "",
    });
  };

  const cancelAddClassification = () => {
    setPendingFile(null);
    setShowAddDialog(false);
  };

  return (
    <div className="space-y-3">
      {/* Header with IFC entity info */}
      <div className="rounded border border-indigo-100 bg-indigo-50/50 p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-800">IfcClassification</h3>
              <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                IFC 4x3
              </span>
              <DocLink 
                href={IFC_CLASSIFICATION_DOC_URL}
                label="IfcClassification"
                type="ifc"
              />
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Správa klasifikačních systémů dle entity{" "}
              <a
                href={IFC_CLASSIFICATION_DOC_URL}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-indigo-600 hover:underline"
              >
                IfcClassification
              </a>{" "}
              ze schématu IFC 4x3 (buildingSMART)
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500">
            <input
              type="file"
              accept=".txt"
              onChange={handleFileSelect}
              className="hidden"
            />
            + Přidat klasifikaci
          </label>
        </div>
      </div>

      {classifications.length === 0 && (
        <div className="rounded border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
          Žádné klasifikace. Přidejte TXT soubor s hierarchií.
        </div>
      )}

      {classifications.map((cls) => {
        const isExpanded = expanded.has(cls.id);
        const isPrimary = cls.id === primaryClassificationId;
        const isEditing = editing?.id === cls.id;

        return (
          <div
            key={cls.id}
            className={`rounded border ${isPrimary ? "border-indigo-300 bg-indigo-50/30" : "border-slate-200 bg-white"} p-3`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  className="text-slate-500 hover:text-slate-700"
                  onClick={() => toggleExpanded(cls.id)}
                >
                  {isExpanded ? "▼" : "▶"}
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">
                      {cls.ifcClassification.Name}
                    </span>
                    {isPrimary && (
                      <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        PRIMÁRNÍ
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {cls.sourceName} • {cls.nodes.length > 0 ? `${countLeaves(cls.nodes)} položek` : "prázdná"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!isPrimary && (
                  <button
                    className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
                    onClick={() => onSetPrimary(cls.id)}
                    title="Nastavit jako primární klasifikaci"
                  >
                    Nastavit primární
                  </button>
                )}
                <button
                  className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
                  onClick={() => startEditing(cls)}
                >
                  Upravit
                </button>
                {!isPrimary && (
                  <button
                    className="rounded px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50"
                    onClick={() => onDeleteClassification(cls.id)}
                  >
                    Smazat
                  </button>
                )}
              </div>
            </div>

            {isExpanded && !isEditing && (
              <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center gap-2 border-b border-slate-200 pb-2">
                  <span className="text-xs font-semibold text-slate-600">Atributy IfcClassification</span>
                  <DocLink 
                    href={IFC_CLASSIFICATION_DOC_URL}
                    label="IfcClassification"
                    type="ifc"
                    className="scale-75"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="font-medium text-slate-500">Name</span>
                    <span className="ml-1 text-[10px] text-amber-600">(povinný)</span>
                    <div className="text-slate-800">{cls.ifcClassification.Name}</div>
                  </div>
                  <div>
                    <span className="font-medium text-slate-500">Source</span>
                    <span className="ml-1 text-[10px] text-slate-400">(volitelný)</span>
                    <div className="text-slate-800">{cls.ifcClassification.Source || "—"}</div>
                  </div>
                  <div>
                    <span className="font-medium text-slate-500">Edition</span>
                    <span className="ml-1 text-[10px] text-slate-400">(volitelný)</span>
                    <div className="text-slate-800">{cls.ifcClassification.Edition || "—"}</div>
                  </div>
                  <div>
                    <span className="font-medium text-slate-500">EditionDate</span>
                    <span className="ml-1 text-[10px] text-slate-400">(volitelný)</span>
                    <div className="text-slate-800">{cls.ifcClassification.EditionDate || "—"}</div>
                  </div>
                  <div className="col-span-2">
                    <span className="font-medium text-slate-500">Description</span>
                    <span className="ml-1 text-[10px] text-slate-400">(volitelný)</span>
                    <div className="text-slate-800">{cls.ifcClassification.Description || "—"}</div>
                  </div>
                  <div className="col-span-2">
                    <span className="font-medium text-slate-500">Specification</span>
                    <span className="ml-1 text-[10px] text-slate-400">(volitelný, URI)</span>
                    <div>
                      {cls.ifcClassification.Specification ? (
                        <a
                          href={cls.ifcClassification.Specification}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-600 hover:underline"
                        >
                          {cls.ifcClassification.Specification}
                        </a>
                      ) : (
                        <span className="text-slate-800">—</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isExpanded && isEditing && editing && (
              <div className="mt-3 space-y-2 rounded border border-indigo-200 bg-indigo-50/50 p-3">
                <div className="mb-2 flex items-center gap-2 border-b border-indigo-200 pb-2">
                  <span className="text-xs font-semibold text-indigo-700">Editace atributů IfcClassification</span>
                  <DocLink 
                    href={IFC_CLASSIFICATION_DOC_URL}
                    label="IfcClassification"
                    type="ifc"
                    className="scale-75"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      <span className="text-indigo-700">Name</span> <span className="text-red-500">*</span>
                      <span className="ml-1 text-[10px] font-normal text-slate-400">(IfcLabel)</span>
                    </label>
                    <input
                      type="text"
                      value={editing.ifcClassification.Name}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          ifcClassification: { ...editing.ifcClassification, Name: e.target.value },
                        })
                      }
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      placeholder="Název klasifikačního systému"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      <span className="text-indigo-700">Source</span>
                      <span className="ml-1 text-[10px] font-normal text-slate-400">(IfcLabel)</span>
                    </label>
                    <input
                      type="text"
                      value={editing.ifcClassification.Source ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          ifcClassification: { ...editing.ifcClassification, Source: e.target.value },
                        })
                      }
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      placeholder="Zdroj/vydavatel"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      <span className="text-indigo-700">Edition</span>
                      <span className="ml-1 text-[10px] font-normal text-slate-400">(IfcLabel)</span>
                    </label>
                    <input
                      type="text"
                      value={editing.ifcClassification.Edition ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          ifcClassification: { ...editing.ifcClassification, Edition: e.target.value },
                        })
                      }
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      placeholder="Verze/edice"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      <span className="text-indigo-700">EditionDate</span>
                      <span className="ml-1 text-[10px] font-normal text-slate-400">(IfcDate)</span>
                    </label>
                    <input
                      type="date"
                      value={editing.ifcClassification.EditionDate ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          ifcClassification: { ...editing.ifcClassification, EditionDate: e.target.value },
                        })
                      }
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      <span className="text-indigo-700">Description</span>
                      <span className="ml-1 text-[10px] font-normal text-slate-400">(IfcText)</span>
                    </label>
                    <textarea
                      value={editing.ifcClassification.Description ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          ifcClassification: { ...editing.ifcClassification, Description: e.target.value },
                        })
                      }
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      rows={2}
                      placeholder="Popis klasifikačního systému"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      <span className="text-indigo-700">Specification</span>
                      <span className="ml-1 text-[10px] font-normal text-slate-400">(IfcURIReference)</span>
                    </label>
                    <input
                      type="url"
                      value={editing.ifcClassification.Specification ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          ifcClassification: { ...editing.ifcClassification, Specification: e.target.value },
                        })
                      }
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      placeholder="https://..."
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
                    onClick={cancelEditing}
                  >
                    Zrušit
                  </button>
                  <button
                    className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500"
                    onClick={saveEditing}
                  >
                    Uložit
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Add Classification Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <h3 className="text-lg font-semibold text-slate-800">
                Nová IfcClassification
              </h3>
              <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                IFC 4x3
              </span>
            </div>
            <p className="mb-2 text-sm text-slate-600">
              Soubor hierarchie: <span className="font-medium">{pendingFile?.name}</span>
            </p>
            <div className="mb-4 rounded border border-indigo-100 bg-indigo-50/50 p-3">
              <p className="text-xs text-slate-600">
                Vyplňte <strong>atributy entity IfcClassification</strong> dle schématu IFC 4x3.{" "}
                <a
                  href={IFC_CLASSIFICATION_DOC_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-indigo-600 hover:underline"
                >
                  Viz buildingSMART dokumentace →
                </a>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  <span className="text-indigo-700">Name</span> <span className="text-red-500">*</span>
                  <span className="ml-1 text-[10px] font-normal text-slate-400">(IfcLabel)</span>
                </label>
                <input
                  type="text"
                  value={newClassificationMetadata.Name ?? ""}
                  onChange={(e) =>
                    setNewClassificationMetadata((p) => ({ ...p, Name: e.target.value }))
                  }
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  placeholder="Název klasifikačního systému"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  <span className="text-indigo-700">Source</span>
                  <span className="ml-1 text-[10px] font-normal text-slate-400">(IfcLabel)</span>
                </label>
                <input
                  type="text"
                  value={newClassificationMetadata.Source ?? ""}
                  onChange={(e) =>
                    setNewClassificationMetadata((p) => ({ ...p, Source: e.target.value }))
                  }
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  placeholder="Zdroj/vydavatel klasifikace"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  <span className="text-indigo-700">Edition</span>
                  <span className="ml-1 text-[10px] font-normal text-slate-400">(IfcLabel)</span>
                </label>
                <input
                  type="text"
                  value={newClassificationMetadata.Edition ?? ""}
                  onChange={(e) =>
                    setNewClassificationMetadata((p) => ({ ...p, Edition: e.target.value }))
                  }
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  placeholder="Verze/edice"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  <span className="text-indigo-700">EditionDate</span>
                  <span className="ml-1 text-[10px] font-normal text-slate-400">(IfcDate)</span>
                </label>
                <input
                  type="date"
                  value={newClassificationMetadata.EditionDate ?? ""}
                  onChange={(e) =>
                    setNewClassificationMetadata((p) => ({ ...p, EditionDate: e.target.value }))
                  }
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  <span className="text-indigo-700">Description</span>
                  <span className="ml-1 text-[10px] font-normal text-slate-400">(IfcText)</span>
                </label>
                <textarea
                  value={newClassificationMetadata.Description ?? ""}
                  onChange={(e) =>
                    setNewClassificationMetadata((p) => ({ ...p, Description: e.target.value }))
                  }
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  rows={2}
                  placeholder="Popis klasifikačního systému"
                />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  <span className="text-indigo-700">Specification</span>
                  <span className="ml-1 text-[10px] font-normal text-slate-400">(IfcURIReference)</span>
                </label>
                <input
                  type="url"
                  value={newClassificationMetadata.Specification ?? ""}
                  onChange={(e) =>
                    setNewClassificationMetadata((p) => ({ ...p, Specification: e.target.value }))
                  }
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  placeholder="https://example.com/classification-spec"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                onClick={cancelAddClassification}
              >
                Zrušit
              </button>
              <button
                className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                onClick={confirmAddClassification}
                disabled={!newClassificationMetadata.Name}
              >
                Přidat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper to count leaf nodes
function countLeaves(nodes: ClassificationSystem["nodes"]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.children.length === 0) count++;
    else count += countLeaves(node.children);
  }
  return count;
}
