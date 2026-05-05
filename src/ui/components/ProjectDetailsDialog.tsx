import React, { useEffect, useRef, useState } from "react";
import type { Project } from "../../project/types";
import {
  SUPPORTED_IFC_VERSIONS,
  getDisplayLabel,
  getIfcDocumentationBaseUrl,
  normalizeIfcSchemaVersion,
  type IfcSchemaVersion,
} from "../../schema/ifcVersionConfig";

interface Props {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Project>) => void;
}

const DEFAULT_MVD_DATABASE_URL = "https://technical.buildingsmart.org/standards/ifc/mvd/mvd-database/";

interface FormData {
  name: string;
  author: string;
  description: string;
  ifcSchemaVersion: IfcSchemaVersion;
  ifcDocumentationUrl: string;
  modelDefinitionViewMvd: string;
}

export const ProjectDetailsDialog: React.FC<Props> = ({
  project,
  isOpen,
  onClose,
  onSave,
}) => {
  const defaultDocUrlForVersion = (v: IfcSchemaVersion) => getIfcDocumentationBaseUrl(v);

  const [formData, setFormData] = useState<FormData>({
    name: project.name || "",
    author: project.author || "",
    description: project.description || "",
    ifcSchemaVersion: normalizeIfcSchemaVersion(project.ifcSchemaVersion),
    ifcDocumentationUrl: project.ifcDocumentationUrl || defaultDocUrlForVersion(normalizeIfcSchemaVersion(project.ifcSchemaVersion)),
    modelDefinitionViewMvd: project.modelDefinitionViewMvd || "Reference View",
  });

  // Reset form pouze při otevření dialogu, ne při každé změně project – jinak by se přepsal výběr verze IFC
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const justOpened = isOpen && !prevOpenRef.current;
    prevOpenRef.current = isOpen;
    if (justOpened) {
      const version = normalizeIfcSchemaVersion(project.ifcSchemaVersion);
      setFormData({
        name: project.name || "",
        author: project.author || "",
        description: project.description || "",
        ifcSchemaVersion: version,
        ifcDocumentationUrl: project.ifcDocumentationUrl || defaultDocUrlForVersion(version),
        modelDefinitionViewMvd: project.modelDefinitionViewMvd || "Reference View",
      });
    }
  }, [isOpen, project]);

  const isAuthorValid = (v: string) => {
    const t = v.trim();
    return t.length > 0 && /@[^@]*\.[^@]+/.test(t);
  };

  const handleSave = () => {
    if (!formData.name.trim() || !isAuthorValid(formData.author)) return;
    onSave({
      name: formData.name.trim(),
      author: formData.author.trim() || undefined,
      description: formData.description.trim() || undefined,
      ifcSchemaVersion: formData.ifcSchemaVersion,
      ifcSchemaVersionDisplay: getDisplayLabel(formData.ifcSchemaVersion),
      ifcDocumentationUrl: formData.ifcDocumentationUrl.trim() || undefined,
      modelDefinitionViewMvd: formData.modelDefinitionViewMvd.trim() || undefined,
    });
    onClose();
  };

  const handleVersionChange = (version: IfcSchemaVersion) => {
    setFormData((prev) => ({
      ...prev,
      ifcSchemaVersion: version,
      ifcDocumentationUrl: defaultDocUrlForVersion(version),
    }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Close only when the actual backdrop is clicked, not form interactions.
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  // Format date for display
  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("cs-CZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
      onMouseDown={handleBackdropMouseDown}
      onKeyDown={handleKeyDown}
    >
      <div
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl"
      >
        {/* Header */}
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">Údaje projektu</h2>
          <p className="text-sm text-slate-500">Základní informace o projektu</p>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <div className="space-y-4">
            {/* Project Name */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Název projektu <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Zadejte název projektu"
              />
            </div>

            {/* Author */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Autor (e-mail) <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                className={`w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                  formData.author.trim() && !isAuthorValid(formData.author)
                    ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                    : "border-slate-300 focus:border-red-500 focus:ring-red-500"
                }`}
                value={formData.author}
                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                placeholder="email@example.com"
              />
              {!isAuthorValid(formData.author) && (
                <p className="mt-1 text-xs text-red-600">Autor musí být e-mail (např. jmeno@domena.cz)</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Popis
              </label>
              <textarea
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Popis projektu"
              />
            </div>

            {/* IFC Version */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Verze IFC schématu
              </label>
              <select
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                value={formData.ifcSchemaVersion}
                onChange={(e) => handleVersionChange(e.target.value as IfcSchemaVersion)}
              >
                {SUPPORTED_IFC_VERSIONS.map((v) => (
                  <option key={v} value={v}>
                    {getDisplayLabel(v)}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Ovlivní načtené schema, export IDS a odkazy na dokumentaci.
              </p>
              <a
                href={formData.ifcDocumentationUrl || defaultDocUrlForVersion(formData.ifcSchemaVersion)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-xs text-red-600 hover:text-red-800 hover:underline"
              >
                IFC dokumentace ↗
              </a>
            </div>

            {/* IFC Documentation URL (editable) */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                URL IFC dokumentace
              </label>
              <input
                type="url"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                value={formData.ifcDocumentationUrl}
                onChange={(e) => setFormData({ ...formData, ifcDocumentationUrl: e.target.value })}
                placeholder={defaultDocUrlForVersion(formData.ifcSchemaVersion)}
              />
            </div>

            {/* Model View Definition (MVD) */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Model View Definition (MVD)
              </label>
              <input
                type="text"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                value={formData.modelDefinitionViewMvd}
                onChange={(e) => setFormData({ ...formData, modelDefinitionViewMvd: e.target.value })}
                placeholder="Reference View"
              />
              <a
                href={DEFAULT_MVD_DATABASE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-xs text-red-600 hover:text-red-800 hover:underline"
              >
                MVD databáze buildingSMART ↗
              </a>
            </div>

            {/* Dates (read-only info) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Vytvořeno
                </label>
                <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {formatDate(project.createdAt)}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Poslední úprava
                </label>
                <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {formatDate(project.updatedAt)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button
            className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={onClose}
          >
            Zrušit
          </button>
          <button
            className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
            onClick={handleSave}
            disabled={!formData.name.trim() || !isAuthorValid(formData.author)}
          >
            Uložit
          </button>
        </div>
      </div>
    </div>
  );
};
