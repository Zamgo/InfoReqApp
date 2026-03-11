import React, { useCallback, useEffect, useMemo, useRef, useState, startTransition, type MouseEvent as ReactMouseEvent } from "react";
import { ClassificationPanel } from "./ui/components/ClassificationPanel";
import { ObjectDetail } from "./ui/components/ObjectDetail";
import { ProjectDetailsDialog } from "./ui/components/ProjectDetailsDialog";
import { SettingsDialog } from "./ui/components/SettingsDialog";
import { TranslationProvider } from "./translation/TranslationContext";
import { IDSExportDialog } from "./ui/components/IDSExportDialog";
import { ExcelExportDialog, type SheetSelection } from "./ui/components/ExcelExportDialog";
import { parseClassificationTsv, parseClassificationSimpleList, detectClassificationFormat, collectLeaves, findNodeByCode, removeNodeByCode, addNodeAsSibling, updateLeafMappedValue, updateLeafIfcEntityPredefinedType } from "./classification/parser";
import { parseClassificationXlsx } from "./classification/sampleXlsx";
import {
  buildClassificationFromSchema,
  buildClassificationFromSchemaFiltered,
  collectSelectedCodesFromClassificationNodes,
  buildPureNodesWithIfcMapping,
  toIfcCode,
} from "./classification/ifcTree";
import type { ClassificationData, ClassificationNode } from "./classification/types";
import { SchemaProvider, useSchema } from "./schema/SchemaProvider";
import { normalizeIfcSchemaVersion } from "./schema/ifcVersionConfig";
import type { AttributeRequirement, ClassificationRequirement, ClassificationSystemEntry, CodeList, MaterialRequirement, ObjectRequirements, Phase, Project, ProjectObject, PropertyRequirement, RelationRequirement } from "./project/types";
import {
  createEmptyProject,
  clearAllAppDataOnReset,
  ensureObject,
  exportProjectFile,
  importProjectFile,
  loadProjectFromStorage,
  saveProjectToStorage,
} from "./project/storage";
import { parseIdsXml, mergeIdsIntoProject } from "./import/ids";
import { importProjectFromExcel } from "./import/excel";
import { ensurePhaseList, ensureProjectPhases, removePhaseFromProject } from "./project/phases";
import { ENUM_CODELIST_ID_KEY, formatEnumValues } from "./project/enumeration";
import { exportExcelFile } from "./export/excel";
import "./index.css";
import { makeId } from "./utils/id";
import { parseAuthoringValues, joinAuthoringValues } from "./project/authoring";
import { computePsetFingerprint, computeAttributeItemFingerprint, computeClassificationItemFingerprint, computeMaterialItemFingerprint, computeRelationItemFingerprint, type RequirementItemKind } from "./project/requirementFingerprint";
import { migrateProject } from "./project/migration";

const applyCodeListPropagation = (project: Project, list: CodeList): Project => {
  // Update all properties that are linked to this code list
  const nextObjects: Project["objects"] = { ...project.objects };
  let changed = false;

  Object.entries(nextObjects).forEach(([code, obj]) => {
    let objChanged = false;
    const nextReqs = { ...obj.requirements };
    const nextProps = obj.requirements.properties.map((p) => {
      const id = (p.extensions?.[ENUM_CODELIST_ID_KEY] as string | undefined) ?? undefined;
      if (p.constraint !== "ENUM" || !id || id !== list.id) return p;
        const nextValue = formatEnumValues(list.values ?? []);
      if ((p.value ?? "") === nextValue) return p;
      objChanged = true;
      return { ...p, value: nextValue };
    });
    if (objChanged) {
      changed = true;
      nextReqs.properties = nextProps;
      nextObjects[code] = { ...obj, requirements: nextReqs };
    }
  });

  return changed ? { ...project, objects: nextObjects } : project;
};

interface AppInnerProps {
  project: Project | null;
  setProject: React.Dispatch<React.SetStateAction<Project | null>>;
}

const AppInner: React.FC<AppInnerProps> = ({ project, setProject }) => {
  const { index: schemaIndex, loading: schemaLoading, error: schemaError } = useSchema();
  const [classification, setClassification] = useState<ClassificationData | null>(null);
  const [selectedCode, setSelectedCode] = useState<string>();
  const [selectedObject, setSelectedObject] = useState<ProjectObject | null>(null);
  const [status, setStatus] = useState<string>("");
  const [isProjectDetailsOpen, setIsProjectDetailsOpen] = useState<boolean>(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState<boolean>(false);
  const [isImportMenuOpen, setIsImportMenuOpen] = useState<boolean>(false);
  const [isIDSExportOpen, setIsIDSExportOpen] = useState<boolean>(false);
  const [isExcelExportOpen, setIsExcelExportOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const importMenuRef = useRef<HTMLDivElement>(null);
  const importJsonInputRef = useRef<HTMLInputElement>(null);
  const importIdsInputRef = useRef<HTMLInputElement>(null);
  const importExcelInputRef = useRef<HTMLInputElement>(null);
  
  // Resizable panel state
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    const stored = localStorage.getItem("infoReqApp_panelWidth");
    return stored ? parseInt(stored, 10) : 360;
  });
  const [leftPanelVisible, setLeftPanelVisible] = useState<boolean>(() => {
    const stored = localStorage.getItem("infoReqApp_leftPanelVisible");
    return stored !== null ? stored === "true" : true;
  });
  const isResizingRef = useRef<boolean>(false);
  const resizeContainerRef = useRef<HTMLDivElement>(null);

  const toggleLeftPanel = useCallback(() => {
    setLeftPanelVisible((v) => {
      const next = !v;
      localStorage.setItem("infoReqApp_leftPanelVisible", String(next));
      return next;
    });
  }, []);
  
  // Undo/Redo history
  const historyRef = useRef<Project[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const isUndoRedoRef = useRef<boolean>(false);

  const clearProject = useCallback(() => {
    clearAllAppDataOnReset();
    historyRef.current = [];
    historyIndexRef.current = -1;
    setProject(null);
    setClassification(null);
    setSelectedCode(undefined);
    setSelectedObject(null);
    setStatus("");
  }, []);

  /** Vrátí IFC mapování (entity + predefinedType) z primárního klasifikačního systému pro daný kód (z mappedValues). */
  const getIfcMappingFromPrimary = useCallback((proj: Project, code: string): { entity: string; predefinedType?: string } | null => {
    const primary = (proj.classificationSystemEntries ?? []).find((e) => e.isPrimary);
    const ifcSystemId = primary?.mappedSystemIds?.find((sid) =>
      (proj.classificationSystemEntries ?? []).some((e) => e.id === sid && e.isIfcSystem)
    );
    if (!primary?.nodes || !ifcSystemId) return null;
    const leaf = findNodeByCode(primary.nodes, code);
    const mapped = leaf?.mappedValues?.[ifcSystemId]?.trim();
    if (!mapped) return null;
    const [entity, typePart] = mapped.includes("::") ? mapped.split("::") : [mapped, ""];
    const pt = typePart?.trim() || undefined;
    return { entity: entity?.trim() ?? "", predefinedType: pt || undefined };
  }, []);

  /** Propaguje object.authoringClassifications do node.mappedValues (pro import – objekty mají data, uzly ne). */
  const propagateObjectAuthoringToNodes = useCallback((proj: Project): Project => {
    const primary = (proj.classificationSystemEntries ?? []).find((e) => e.isPrimary);
    const authoringIds = (primary?.authoringToolSystemIds?.length ? primary.authoringToolSystemIds : primary?.mappedSystemIds) ?? [];
    const authEntries = authoringIds
      .map((sid) => (proj.classificationSystemEntries ?? []).find((e) => e.id === sid))
      .filter((e): e is ClassificationSystemEntry => !!e && (e.systemKind ?? (e.isIfcSystem ? "ifc" : "classification")) === "authoring");
    if (!primary?.nodes || authEntries.length === 0) return proj;

    let changed = false;
    let nextNodes = primary.nodes;
    for (const [objCode, obj] of Object.entries(proj.objects)) {
      const auth = obj.authoringClassifications ?? [];
      if (auth.length === 0) continue;
      for (const entry of authEntries) {
        const codes = auth.filter((a) => a.systemEntryId === entry.id).map((a) => a.code).filter((c) => c?.trim());
        const val = joinAuthoringValues(codes);
        const leaf = findNodeByCode(nextNodes, objCode);
        const currVal = leaf?.mappedValues?.[entry.id] ?? "";
        if (currVal !== val) {
          nextNodes = updateLeafMappedValue(nextNodes, objCode, entry.id, val);
          changed = true;
        }
      }
    }
    if (!changed) return proj;
    const nextEntries = (proj.classificationSystemEntries ?? []).map((e) =>
      e.id === primary.id ? { ...e, nodes: nextNodes } : e
    );
    // Po importu JSON jsou classification.nodes a primary.nodes oddělené kopie (reference !==),
    // proto vždy synchronizujeme classification s primárním systémem při aktualizaci
    const nextClassification = proj.classification && primary
      ? { ...proj.classification, nodes: nextNodes }
      : proj.classification;
    return {
      ...proj,
      classificationSystemEntries: nextEntries,
      classification: nextClassification,
      updatedAt: new Date().toISOString(),
    };
  }, []);

  /** Propaguje mapování autorských nástrojů (mappedValues) z primárního systému do object.authoringClassifications. */
  const propagateAuthoringMappingToObjects = useCallback((proj: Project): Project => {
    const primary = (proj.classificationSystemEntries ?? []).find((e) => e.isPrimary);
    const authoringIds = (primary?.authoringToolSystemIds?.length ? primary.authoringToolSystemIds : primary?.mappedSystemIds) ?? [];
    const authEntries = authoringIds
      .map((sid) => (proj.classificationSystemEntries ?? []).find((e) => e.id === sid))
      .filter((e): e is ClassificationSystemEntry => !!e && (e.systemKind ?? (e.isIfcSystem ? "ifc" : "classification")) === "authoring");
    if (!primary?.nodes || authEntries.length === 0) return proj;

    let changed = false;
    const nextObjects: Project["objects"] = { ...proj.objects };
    for (const [objCode, obj] of Object.entries(nextObjects)) {
      const leaf = findNodeByCode(primary.nodes, objCode);
      if (!leaf) continue;
      const nextAuth: NonNullable<ProjectObject["authoringClassifications"]> = [];
      for (const entry of authEntries) {
        const vals = parseAuthoringValues(leaf.mappedValues?.[entry.id]);
        vals.forEach((code) => nextAuth.push({ systemEntryId: entry.id, code }));
      }
      const currAuth = obj.authoringClassifications ?? [];
      const currMatch = currAuth.length === nextAuth.length && nextAuth.every((a) => currAuth.some((c) => c.systemEntryId === a.systemEntryId && c.code === a.code));
      if (!currMatch) {
        nextObjects[objCode] = { ...obj, authoringClassifications: nextAuth.length ? nextAuth : undefined };
        changed = true;
      }
    }
    if (!changed) return proj;
    return { ...proj, objects: nextObjects, updatedAt: new Date().toISOString() };
  }, []);

  /** Propaguje mapování klasifikačních systémů (typ „Klasifikační systém“) z primárního systému do object.requirements.classifications. */
  const propagateClassificationMappingToObjects = useCallback((proj: Project): Project => {
    const primary = (proj.classificationSystemEntries ?? []).find((e) => e.isPrimary);
    const mappedClassificationIds = (primary?.mappedSystemIds ?? []).filter((sid) => {
      const e = (proj.classificationSystemEntries ?? []).find((x) => x.id === sid);
      return e && (e.systemKind ?? (e.isIfcSystem ? "ifc" : "classification")) === "classification";
    });
    if (!primary?.nodes || mappedClassificationIds.length === 0) return proj;

    let changed = false;
    const nextObjects: Project["objects"] = { ...proj.objects };
    for (const [objCode, obj] of Object.entries(nextObjects)) {
      const leaf = findNodeByCode(primary.nodes, objCode);
      if (!leaf) continue;
      const nextClassifications = [...(obj.requirements.classifications ?? [])];
      let clsChanged = false;
      for (const systemId of mappedClassificationIds) {
        const mappedVal = leaf.mappedValues?.[systemId]?.trim() ?? "";
        const entry = (proj.classificationSystemEntries ?? []).find((e) => e.id === systemId);
        const existing = nextClassifications.find((c) => c.systemEntryId === systemId);
        const newValue = mappedVal;
        if (existing) {
          if ((existing.value ?? "") !== newValue) {
            nextClassifications[nextClassifications.indexOf(existing)] = { ...existing, value: newValue, identification: newValue, code: newValue };
            clsChanged = true;
          }
        } else if (newValue && entry) {
          nextClassifications.push({
            id: makeId(),
            classificationId: proj.primaryClassificationId ?? "",
            systemEntryId: systemId,
            system: entry.name ?? "",
            identification: newValue,
            value: newValue,
            name: entry.name ?? "",
            occurrence: "optional",
            phases: obj.requirements.classifications?.[0]?.phases ?? proj.phases?.map((p) => p.id) ?? [],
            extensions: {},
          });
          clsChanged = true;
        }
      }
      if (clsChanged) {
        nextObjects[objCode] = {
          ...obj,
          requirements: { ...obj.requirements, classifications: nextClassifications },
        };
        changed = true;
      }
    }
    if (!changed) return proj;
    return { ...proj, objects: nextObjects, updatedAt: new Date().toISOString() };
  }, []);

  /** Propaguje IFC entitu a predefinedType z objektů do uzlů primárního klasifikačního systému. Používá se po importu/načtení, aby třídění a mapování prvků i filtrování v hierarchii odráželo nastavení objektů. */
  const propagateIfcFromObjectsToNodes = useCallback((proj: Project): Project => {
    const primary = (proj.classificationSystemEntries ?? []).find((e) => e.isPrimary);
    if (!primary?.nodes) return proj;
    const ifcSystemId = primary.mappedSystemIds?.find((sid) =>
      (proj.classificationSystemEntries ?? []).some((e) => e.id === sid && e.isIfcSystem)
    );
    let nextNodes = primary.nodes;
    let changed = false;
    for (const [code, obj] of Object.entries(proj.objects)) {
      if (!obj.ifcEntity?.trim()) continue;
      const leaf = findNodeByCode(nextNodes, code);
      if (!leaf) continue;
      const ptVal =
        obj.predefinedType?.mode === "ENUM" || obj.predefinedType?.mode === "USERDEFINED"
          ? (obj.predefinedType.value ?? "").trim() || "NOTDEFINED"
          : "NOTDEFINED";
      const ifcMappedValue = `${obj.ifcEntity}::${ptVal}`;
      if (leaf.ifcEntity !== obj.ifcEntity || (leaf.predefinedType ?? "NOTDEFINED") !== ptVal) {
        nextNodes = updateLeafIfcEntityPredefinedType(nextNodes, code, obj.ifcEntity, ptVal);
        changed = true;
      }
      if (ifcSystemId) {
        const currMapped = findNodeByCode(nextNodes, code)?.mappedValues?.[ifcSystemId] ?? "";
        if (currMapped !== ifcMappedValue) {
          nextNodes = updateLeafMappedValue(nextNodes, code, ifcSystemId, ifcMappedValue);
          changed = true;
        }
      }
    }
    if (!changed) return proj;
    const nextEntries = (proj.classificationSystemEntries ?? []).map((e) =>
      e.id === primary.id ? { ...e, nodes: nextNodes } : e
    );
    const nextClassification =
      proj.classification && primary ? { ...proj.classification, nodes: nextNodes } : proj.classification;
    return {
      ...proj,
      classificationSystemEntries: nextEntries,
      classification: nextClassification,
      updatedAt: new Date().toISOString(),
    };
  }, []);

  /** Propaguje IFC mapování z primárního klasifikačního systému do objektů. */
  const propagateMappingToObjects = useCallback((proj: Project): Project => {
    const primary = (proj.classificationSystemEntries ?? []).find((e) => e.isPrimary);
    const ifcSystemId = primary?.mappedSystemIds?.find((sid) =>
      (proj.classificationSystemEntries ?? []).some((e) => e.id === sid && e.isIfcSystem)
    );
    if (!primary?.nodes || !ifcSystemId) return proj;

    let changed = false;
    const nextObjects: Project["objects"] = { ...proj.objects };
    for (const [objCode, obj] of Object.entries(nextObjects)) {
      const leaf = findNodeByCode(primary.nodes, objCode);
      const mapped = leaf?.mappedValues?.[ifcSystemId]?.trim();
      if (!mapped) continue;
      const [entity, typePart] = mapped.includes("::") ? mapped.split("::") : [mapped, ""];
      const pt = typePart?.trim() || undefined;
      const newIfcEntity = entity || "";
      const newPredefined = pt
        ? { mode: "ENUM" as const, value: pt }
        : { mode: "NONE" as const };
      if (obj.ifcEntity !== newIfcEntity || JSON.stringify(obj.predefinedType) !== JSON.stringify(newPredefined)) {
        nextObjects[objCode] = {
          ...obj,
          ifcEntity: newIfcEntity,
          predefinedType: newPredefined,
        };
        changed = true;
      }
    }
    if (!changed) return proj;
    return {
      ...proj,
      objects: nextObjects,
      updatedAt: new Date().toISOString(),
    };
  }, []);

  // Načtení projektu z úložiště odložíme do dalšího ticku, aby hlavní vlákno nestrácelo čas
  // a UI se mohlo rychle vykreslit (prevence „zmrznutí“ při otevření s velkým projektem).
  useEffect(() => {
    const runLoad = () => {
      const stored = loadProjectFromStorage();
      if (!stored) return;
      const migrated = migrateProject(stored);
      let withPropagation = propagateIfcFromObjectsToNodes(migrated);
      withPropagation = propagateObjectAuthoringToNodes(withPropagation);
      withPropagation = propagateMappingToObjects(withPropagation);
      withPropagation = propagateAuthoringMappingToObjects(withPropagation);
      withPropagation = propagateClassificationMappingToObjects(withPropagation);
      const leaves = collectLeaves(withPropagation.classification.nodes);
      const firstCode = withPropagation.objects[leaves[0]?.code]?.code ?? leaves[0]?.code;
      const needsSave = withPropagation !== migrated;
      startTransition(() => {
        setProject(withPropagation);
        setClassification(withPropagation.classification);
        setSelectedCode(firstCode);
      });
      if (needsSave) {
        setTimeout(() => saveProjectToStorage(withPropagation), 0);
      }
    };
    const id = setTimeout(runLoad, 0);
    return () => clearTimeout(id);
  }, [propagateIfcFromObjectsToNodes, propagateObjectAuthoringToNodes, propagateMappingToObjects, propagateAuthoringMappingToObjects, propagateClassificationMappingToObjects]);

  const selectedNode = useMemo<ClassificationNode | undefined>(() => {
    if (!classification || !selectedCode) return undefined;
    return findNodeByCode(classification.nodes, selectedCode);
  }, [classification, selectedCode]);

  useEffect(() => {
    if (!project || !selectedCode) {
      setSelectedObject(null);
      return;
    }
    const node = classification ? findNodeByCode(classification.nodes, selectedCode) : undefined;
    if (!node) {
      // Objekt mimo hierarchii – zobrazit stejný objekt (project.objects[selectedCode]), ne duplikovat
      const orphanObject = project.objects[selectedCode];
      setSelectedObject(orphanObject ?? null);
      return;
    }
    if (!project.objects[node.code]) {
      const nextProject = { ...project, objects: { ...project.objects } };
      // U pure systému jsou IFC hodnoty v mappedValues primárního systému, ne na uzlu
      const mapping = getIfcMappingFromPrimary(nextProject, node.code);
      const defaultIfcEntity = node.ifcEntity ?? mapping?.entity ?? "";
      const ensured = ensureObject(nextProject, node.code, node.description, defaultIfcEntity);
      if (node.predefinedType) {
        ensured.predefinedType = { mode: "ENUM", value: node.predefinedType };
      } else if (mapping?.predefinedType) {
        ensured.predefinedType = { mode: "ENUM", value: mapping.predefinedType };
      } else {
        ensured.predefinedType = { mode: "NONE" };
      }
      // Don't add to history when auto-creating object on selection
      isUndoRedoRef.current = true;
      setProject(nextProject);
      saveProjectToStorage(nextProject);
      isUndoRedoRef.current = false;
      setSelectedObject(ensured);
    } else {
      setSelectedObject(project.objects[node.code]);
    }
  }, [project, selectedCode, classification, getIfcMappingFromPrimary]);

  const onSelectLeaf = (node: ClassificationNode) => {
    setSelectedCode(node.code);
  };

  const onUploadClassification = async (file: File) => {
    const isXlsx = /\.xlsx$/i.test(file.name);
    let parsed: import("./classification/types").ClassificationData;
    let isPure: boolean;
    let displayName: string;

    if (isXlsx) {
      try {
        parsed = await parseClassificationXlsx(file, file.name.replace(/\.xlsx$/i, ""));
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Import XLSX se nezdařil");
        setTimeout(() => setStatus(""), 5000);
        return;
      }
      const hasIfcInTree = (nodes: typeof parsed.nodes): boolean =>
        nodes.some((n) => !!n.ifcEntity || !!n.predefinedType || (n.children?.length ? hasIfcInTree(n.children) : false));
      isPure = !hasIfcInTree(parsed.nodes);
      displayName = parsed.sourceName || file.name.replace(/\.xlsx$/i, "");

      // Již namapovaný systém (sloupce IFC Entita / IFC PredefinedType): vytvořit dva systémy + mapování
      if (!isPure && schemaIndex) {
        const selectedCodes = collectSelectedCodesFromClassificationNodes(parsed.nodes, schemaIndex);
        const existingIfc = project?.classificationSystemEntries?.find((e) => e.isIfcSystem);
        let ifcEntry: ClassificationSystemEntry;
        let entries: ClassificationSystemEntry[];

        if (existingIfc?.nodes) {
          const existingCodes = new Set(collectLeaves(existingIfc.nodes).map((n) => n.code));
          selectedCodes.forEach((c) => existingCodes.add(c));
          const ifcData = buildClassificationFromSchemaFiltered(schemaIndex, existingCodes);
          ifcEntry = {
            ...existingIfc,
            nodes: ifcData.nodes,
            hash: ifcData.hash,
          };
          entries = (project!.classificationSystemEntries ?? []).map((e) =>
            e.id === existingIfc.id ? ifcEntry : e,
          );
        } else {
          const ifcData = buildClassificationFromSchemaFiltered(schemaIndex, selectedCodes);
          ifcEntry = {
            id: makeId(),
            name: "Třídění dle IFC entit",
            sourceName: "Třídění dle IFC entit",
            nodes: ifcData.nodes,
            hash: ifcData.hash,
            isPrimary: false,
            isIfcSystem: true,
            systemKind: "ifc",
          };
          entries = [...(project?.classificationSystemEntries ?? []), ifcEntry];
        }

        const pureNodes = buildPureNodesWithIfcMapping(parsed.nodes, ifcEntry.id, schemaIndex);
        const pureHash = parsed.hash ?? undefined;
        const pureEntry: ClassificationSystemEntry = {
          id: makeId(),
          name: displayName,
          sourceName: file.name,
          nodes: pureNodes,
          hash: pureHash,
          isPrimary: true,
          isPure: true,
          systemKind: "classification",
          mappedSystemIds: [ifcEntry.id],
        };

        const pureClassification: ClassificationData = {
          nodes: pureNodes,
          sourceName: displayName,
          hash: pureHash,
        };

        if (!project) {
          const newProject = createEmptyProject(pureClassification);
          newProject.classificationSystemEntries = [pureEntry, ifcEntry];
          newProject.primaryClassificationId = pureEntry.id;
          historyRef.current = [JSON.parse(JSON.stringify(newProject))];
          historyIndexRef.current = 0;
          setProject(newProject);
          setClassification(pureClassification);
          const leaves = collectLeaves(pureNodes);
          setSelectedCode(leaves[0]?.code);
          saveProjectToStorage(newProject);
          setStatus(`Vytvořeny dva klasifikační systémy a mapování: "${pureEntry.name}" + IFC`);
        } else {
          const allEntries = entries.map((e) => ({ ...e, isPrimary: false }));
          const withPure = [...allEntries, pureEntry];
          let next: Project = {
            ...project,
            classificationSystemEntries: withPure,
            classification: pureClassification,
            primaryClassificationId: pureEntry.id,
            updatedAt: new Date().toISOString(),
          };
          next = propagateMappingToObjects(next);
          next = propagateClassificationMappingToObjects(next);
          updateProjectWithHistory(next);
          setClassification(pureClassification);
          const leaves = collectLeaves(pureNodes);
          setSelectedCode(leaves[0]?.code);
          setStatus(`Přidány klasifikační systém "${pureEntry.name}" a mapování na IFC`);
        }
        setTimeout(() => setStatus(""), 3000);
        return;
      }

      if (!isPure && !schemaIndex) {
        setStatus("Pro automatické vytvoření mapování je potřeba načtené IFC schema. Importuji jeden systém.");
        setTimeout(() => setStatus(""), 4000);
      }
    } else {
      const text = await file.text();
      const format = detectClassificationFormat(text);
      parsed = format === "simple"
        ? parseClassificationSimpleList(text, file.name)
        : parseClassificationTsv(text, file.name);
      const hasIfcInTreeTxt = (nodes: typeof parsed.nodes): boolean =>
        nodes.some((n) => !!n.ifcEntity || !!n.predefinedType || (n.children?.length ? hasIfcInTreeTxt(n.children) : false));
      isPure = format === "simple" ? true : !hasIfcInTreeTxt(parsed.nodes);
      displayName = isPure && parsed.sourceName ? parsed.sourceName : file.name.replace(/\.txt$/i, "");

      // Již namapovaný systém (TSV s IFC sloupcem): vytvořit dva systémy + mapování
      if (!isPure && schemaIndex) {
        const selectedCodes = collectSelectedCodesFromClassificationNodes(parsed.nodes, schemaIndex);
        const existingIfc = project?.classificationSystemEntries?.find((e) => e.isIfcSystem);
        let ifcEntry: ClassificationSystemEntry;
        let entries: ClassificationSystemEntry[];

        if (existingIfc?.nodes) {
          const existingCodes = new Set(collectLeaves(existingIfc.nodes).map((n) => n.code));
          selectedCodes.forEach((c) => existingCodes.add(c));
          const ifcData = buildClassificationFromSchemaFiltered(schemaIndex, existingCodes);
          ifcEntry = {
            ...existingIfc,
            nodes: ifcData.nodes,
            hash: ifcData.hash,
          };
          entries = (project!.classificationSystemEntries ?? []).map((e) =>
            e.id === existingIfc.id ? ifcEntry : e,
          );
        } else {
          const ifcData = buildClassificationFromSchemaFiltered(schemaIndex, selectedCodes);
          ifcEntry = {
            id: makeId(),
            name: "Třídění dle IFC entit",
            sourceName: "Třídění dle IFC entit",
            nodes: ifcData.nodes,
            hash: ifcData.hash,
            isPrimary: false,
            isIfcSystem: true,
            systemKind: "ifc",
          };
          entries = [...(project?.classificationSystemEntries ?? []), ifcEntry];
        }

        const pureNodes = buildPureNodesWithIfcMapping(parsed.nodes, ifcEntry.id, schemaIndex);
        const pureHash = parsed.hash ?? undefined;
        const pureEntry: ClassificationSystemEntry = {
          id: makeId(),
          name: displayName,
          sourceName: file.name,
          nodes: pureNodes,
          hash: pureHash,
          isPrimary: true,
          isPure: true,
          systemKind: "classification",
          mappedSystemIds: [ifcEntry.id],
        };

        const pureClassification: ClassificationData = {
          nodes: pureNodes,
          sourceName: displayName,
          hash: pureHash,
        };

        if (!project) {
          const newProject = createEmptyProject(pureClassification);
          newProject.classificationSystemEntries = [pureEntry, ifcEntry];
          newProject.primaryClassificationId = pureEntry.id;
          historyRef.current = [JSON.parse(JSON.stringify(newProject))];
          historyIndexRef.current = 0;
          setProject(newProject);
          setClassification(pureClassification);
          const leaves = collectLeaves(pureNodes);
          setSelectedCode(leaves[0]?.code);
          saveProjectToStorage(newProject);
          setStatus(`Vytvořeny dva klasifikační systémy a mapování: "${pureEntry.name}" + IFC`);
        } else {
          const allEntries = entries.map((e) => ({ ...e, isPrimary: false }));
          const withPure = [...allEntries, pureEntry];
          let next: Project = {
            ...project,
            classificationSystemEntries: withPure,
            classification: pureClassification,
            primaryClassificationId: pureEntry.id,
            updatedAt: new Date().toISOString(),
          };
          next = propagateMappingToObjects(next);
          next = propagateClassificationMappingToObjects(next);
          updateProjectWithHistory(next);
          setClassification(pureClassification);
          const leaves = collectLeaves(pureNodes);
          setSelectedCode(leaves[0]?.code);
          setStatus(`Přidány klasifikační systém "${pureEntry.name}" a mapování na IFC`);
        }
        setTimeout(() => setStatus(""), 3000);
        return;
      }

      if (!isPure && !schemaIndex) {
        setStatus("Pro automatické vytvoření mapování je potřeba načtené IFC schema. Importuji jeden systém.");
        setTimeout(() => setStatus(""), 4000);
      }
    }

    const uploadedEntry: ClassificationSystemEntry = {
      id: makeId(),
      name: displayName,
      sourceName: file.name,
      nodes: parsed.nodes,
      hash: parsed.hash ?? undefined,
      isPrimary: !project,
      isPure: isPure,
      systemKind: "classification",
    };

    if (!project) {
      // První nahraná klasifikace vytvoří nový projekt (jako primární systém).
      const newProject = createEmptyProject(parsed);
      newProject.classificationSystemEntries = [uploadedEntry];
      historyRef.current = [JSON.parse(JSON.stringify(newProject))];
      historyIndexRef.current = 0;
      setProject(newProject);
      setClassification(parsed);
      const leaves = collectLeaves(parsed.nodes);
      setSelectedCode(leaves[0]?.code);
      saveProjectToStorage(newProject);
      setStatus(`Klasifikace "${uploadedEntry.name}" byla načtena a projekt vytvořen`);
    } else {
      const next: Project = {
        ...project,
        classificationSystemEntries: [...(project.classificationSystemEntries ?? []), uploadedEntry],
        updatedAt: new Date().toISOString(),
      };
      updateProjectWithHistory(next);
      setStatus(`Klasifikace "${uploadedEntry.name}" byla importována`);
    }
    setTimeout(() => setStatus(""), 3000);
  };

  const onUpdateObject = (obj: ProjectObject) => {
    if (!project) return;
    if (obj.locked) return;
    const primaryEntry = (project.classificationSystemEntries ?? []).find((e) => e.isPrimary);
    const primaryIsIfc = primaryEntry?.isIfcSystem === true;

    const prevObj = project.objects[obj.code];
    // Sloučit s aktuálním objektem v projektu – zachovat pole, která mohla být ztracena při rychlém psaní (např. authoringClassifications)
    const mergedObj = prevObj ? { ...prevObj, ...obj } : obj;
    const ifcChanged =
      prevObj &&
      (prevObj.ifcEntity !== mergedObj.ifcEntity ||
        JSON.stringify(prevObj.predefinedType) !== JSON.stringify(mergedObj.predefinedType));

    const ptVal = mergedObj.predefinedType.mode === "ENUM" && mergedObj.predefinedType.value ? mergedObj.predefinedType.value : undefined;
    const newCode =
      schemaIndex && mergedObj.ifcEntity
        ? toIfcCode(schemaIndex, mergedObj.ifcEntity, ptVal)
        : mergedObj.code;

    let next: Project;
    // Při primární „Klasifikaci“ měnit code a description podle IFC entity nesmíme – název zůstane z klasifikace
    if (primaryIsIfc && ifcChanged && newCode !== mergedObj.code && schemaIndex) {
      // Změna entity/typu → přepočítat code, přeřadit objekt pod nový klíč a aktualizovat IFC strom vlevo
      const nextObjects = { ...project.objects };
      delete nextObjects[obj.code];
      const updatedObj: ProjectObject = {
        ...mergedObj,
        code: newCode,
        description: formatIfcDescriptionFromCode(newCode),
      };
      nextObjects[newCode] = updatedObj;

      const ifcEntry = (project.classificationSystemEntries ?? []).find((e) => e.isIfcSystem);
      let nextEntries = project.classificationSystemEntries ?? [];
      let nextClassification = project.classification;
      if (ifcEntry?.nodes) {
        const currentCodes = new Set(collectLeaves(ifcEntry.nodes).map((n) => n.code));
        currentCodes.delete(mergedObj.code);
        currentCodes.add(newCode);
        const data = buildClassificationFromSchemaFiltered(schemaIndex, currentCodes);
        let dataNodes = data.nodes;
        const authoringIds = (ifcEntry.authoringToolSystemIds?.length ? ifcEntry.authoringToolSystemIds : ifcEntry.mappedSystemIds) ?? [];
        const authEntries = authoringIds
          .map((id) => (project.classificationSystemEntries ?? []).find((e) => e.id === id))
          .filter((e): e is ClassificationSystemEntry => !!e && (e.systemKind ?? "classification") === "authoring");
        for (const entry of authEntries) {
          const codes = (updatedObj.authoringClassifications ?? []).filter((a) => a.systemEntryId === entry.id).map((a) => a.code).filter((c) => c?.trim());
          dataNodes = updateLeafMappedValue(dataNodes, newCode, entry.id, joinAuthoringValues(codes));
        }
        nextEntries = nextEntries.map((e) =>
          e.id === ifcEntry.id ? { ...e, nodes: dataNodes, hash: data.hash } : e
        );
        if (ifcEntry.isPrimary) {
          nextClassification = { nodes: dataNodes, sourceName: data.sourceName, hash: data.hash };
          setClassification(nextClassification);
        }
      }

      next = {
        ...project,
        objects: nextObjects,
        classificationSystemEntries: nextEntries,
        classification: nextClassification,
        updatedAt: new Date().toISOString(),
      };
      updateProjectWithHistory(next);
      if (selectedCode === mergedObj.code) {
        setSelectedCode(newCode);
        setSelectedObject(updatedObj);
      }
      return;
    }

    next = {
      ...project,
      objects: { ...project.objects, [mergedObj.code]: mergedObj },
      updatedAt: new Date().toISOString(),
    };

    // Propagace autor. nástrojů zpět do namapované klasifikace (node.mappedValues)
    const authoringSystemIds = (primaryEntry?.authoringToolSystemIds?.length
      ? primaryEntry.authoringToolSystemIds
      : primaryEntry?.mappedSystemIds) ?? [];
    const authoringEntries = authoringSystemIds
      .map((id) => (project.classificationSystemEntries ?? []).find((e) => e.id === id))
      .filter((e): e is ClassificationSystemEntry => !!e && (e.systemKind ?? (e.isIfcSystem ? "ifc" : "classification")) === "authoring");
    if (primaryEntry?.nodes && authoringEntries.length > 0) {
      let nextNodes = primaryEntry.nodes;
      for (const entry of authoringEntries) {
        const codes = (mergedObj.authoringClassifications ?? []).filter((a) => a.systemEntryId === entry.id).map((a) => a.code).filter((c) => c?.trim());
        const val = joinAuthoringValues(codes);
        nextNodes = updateLeafMappedValue(nextNodes, mergedObj.code, entry.id, val);
      }
      next = {
        ...next,
        classificationSystemEntries: (next.classificationSystemEntries ?? []).map((e) =>
          e.id === primaryEntry.id ? { ...e, nodes: nextNodes } : e
        ),
        classification: project.classification && primaryEntry
          ? { ...project.classification, nodes: nextNodes }
          : next.classification,
      };
      if (project.classification && primaryEntry) {
        setClassification({ ...project.classification, nodes: nextNodes });
      }
    }

    // Propagace hodnot klasifikací (karta Klasifikace) do namapované klasifikace – pro nemapované systémy typu „Klasifikační systém“
    const mappedClassificationIds = (primaryEntry?.mappedSystemIds ?? []).filter((sid) => {
      const e = (project.classificationSystemEntries ?? []).find((x) => x.id === sid);
      return e && (e.systemKind ?? (e.isIfcSystem ? "ifc" : "classification")) === "classification";
    });
    if (primaryEntry?.nodes && mappedClassificationIds.length > 0) {
      const prevCls = prevObj?.requirements?.classifications ?? [];
      const currCls = mergedObj.requirements?.classifications ?? [];
      const clsChanged = currCls.some(
        (c) => c.systemEntryId && mappedClassificationIds.includes(c.systemEntryId) && !c.readOnly &&
          (prevCls.find((p) => p.id === c.id)?.value !== c.value)
      );
      if (clsChanged) {
        let nextNodes = next.classificationSystemEntries?.find((e) => e.id === primaryEntry.id)?.nodes ?? primaryEntry.nodes;
        for (const cls of currCls) {
          if (cls.systemEntryId && mappedClassificationIds.includes(cls.systemEntryId) && !cls.readOnly) {
            nextNodes = updateLeafMappedValue(nextNodes, mergedObj.code, cls.systemEntryId, cls.value ?? "");
          }
        }
        next = {
          ...next,
          classificationSystemEntries: (next.classificationSystemEntries ?? []).map((e) =>
            e.id === primaryEntry.id ? { ...e, nodes: nextNodes } : e
          ),
          classification: project.classification && primaryEntry
            ? { ...project.classification, nodes: nextNodes }
            : next.classification,
        };
        if (project.classification && primaryEntry) {
          setClassification({ ...project.classification, nodes: nextNodes });
        }
      }
    }

    // Propagace IFC entity a predefinedType z nastavení objektu do namapované klasifikace (primární systém není IFC)
    if (primaryEntry?.nodes && !primaryIsIfc && ifcChanged) {
      const ifcSystemId = primaryEntry.mappedSystemIds?.find((sid) =>
        (project.classificationSystemEntries ?? []).some((e) => e.id === sid && e.isIfcSystem)
      );
      const ptVal = mergedObj.predefinedType.mode === "ENUM" || mergedObj.predefinedType.mode === "USERDEFINED"
        ? (mergedObj.predefinedType.value ?? "NOTDEFINED")
        : "NOTDEFINED";
      const ifcMappedValue = `${mergedObj.ifcEntity || ""}::${ptVal}`;
      let nextNodes = next.classificationSystemEntries?.find((e) => e.id === primaryEntry.id)?.nodes ?? primaryEntry.nodes;
      if (ifcSystemId) {
        nextNodes = updateLeafMappedValue(nextNodes, mergedObj.code, ifcSystemId, ifcMappedValue);
      } else if (!primaryEntry.isPure) {
        nextNodes = updateLeafIfcEntityPredefinedType(nextNodes, mergedObj.code, mergedObj.ifcEntity || "", ptVal);
      }
      if (nextNodes !== (next.classificationSystemEntries?.find((e) => e.id === primaryEntry.id)?.nodes ?? primaryEntry.nodes)) {
        next = {
          ...next,
          classificationSystemEntries: (next.classificationSystemEntries ?? []).map((e) =>
            e.id === primaryEntry.id ? { ...e, nodes: nextNodes } : e
          ),
          classification: project.classification && primaryEntry
            ? { ...project.classification, nodes: nextNodes }
            : next.classification,
        };
        if (project.classification && primaryEntry) {
          setClassification({ ...project.classification, nodes: nextNodes });
        }
      }
    }

    updateProjectWithHistory(next);
    if (selectedObject && selectedObject.code === mergedObj.code) {
      setSelectedObject(mergedObj);
    }
  };

  const onImportProject = async (file: File) => {
    try {
      const imported = await importProjectFile(file);
      const migrated = migrateProject(imported);
      let withPropagation = propagateIfcFromObjectsToNodes(migrated);
      withPropagation = propagateObjectAuthoringToNodes(withPropagation);
      withPropagation = propagateMappingToObjects(withPropagation);
      withPropagation = propagateAuthoringMappingToObjects(withPropagation);
      withPropagation = propagateClassificationMappingToObjects(withPropagation);
      // Reset history for imported project
      historyRef.current = [JSON.parse(JSON.stringify(withPropagation))];
      historyIndexRef.current = 0;
      setProject(withPropagation);
      setClassification(withPropagation.classification);
      const leaves = collectLeaves(withPropagation.classification.nodes);
      setSelectedCode(leaves[0]?.code);
      saveProjectToStorage(withPropagation);
      setStatus("Projekt importován");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Import se nezdařil");
    }
  };

  const onImportExcel = async (file: File) => {
    setIsImportMenuOpen(false);
    try {
      const { project: imported, warnings } = await importProjectFromExcel(file);
      const migrated = migrateProject(imported);
      let withPropagation = propagateIfcFromObjectsToNodes(migrated);
      withPropagation = propagateObjectAuthoringToNodes(withPropagation);
      withPropagation = propagateMappingToObjects(withPropagation);
      withPropagation = propagateAuthoringMappingToObjects(withPropagation);
      withPropagation = propagateClassificationMappingToObjects(withPropagation);
      historyRef.current = [JSON.parse(JSON.stringify(withPropagation))];
      historyIndexRef.current = 0;
      setProject(withPropagation);
      setClassification(withPropagation.classification);
      const leaves = collectLeaves(withPropagation.classification.nodes);
      setSelectedCode(leaves[0]?.code);
      saveProjectToStorage(withPropagation);
      setStatus(
          warnings.length > 0
            ? `Excel importován (${warnings.length} upozornění):\n${warnings.map((w, i) => `${i + 1}. ${w}`).join("\n")}`
            : "Excel importován"
        );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Import Excel se nezdařil");
    }
    if (importExcelInputRef.current) importExcelInputRef.current.value = "";
  };

  const onImportIds = async (file: File) => {
    setIsImportMenuOpen(false);
    try {
      const xmlString = await file.text();
      const parsed = parseIdsXml(xmlString);
      const merged = mergeIdsIntoProject(parsed, project, schemaIndex ?? null);
      historyRef.current = [JSON.parse(JSON.stringify(merged))];
      historyIndexRef.current = 0;
      setProject(merged);
      // Nová reference, aby se hierarchie a strom jistě překreslily
      const classificationToSet = merged.classification
        ? { ...merged.classification, nodes: merged.classification.nodes ?? [] }
        : null;
      setClassification(classificationToSet);
      const leaves = collectLeaves(merged.classification?.nodes ?? []);
      const firstCode = leaves[0]?.code;
      if (firstCode) setSelectedCode(firstCode);
      saveProjectToStorage(merged);
      setStatus(project ? "IDS sloučen do projektu (přidány nové entity)" : "IDS importován, projekt vytvořen");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Import IDS se nezdařil");
    }
    if (importIdsInputRef.current) importIdsInputRef.current.value = "";
  };

  const onExportProject = () => {
    if (project) {
      exportProjectFile(project);
      setIsExportMenuOpen(false);
    }
  };

  const onExportIDS = () => {
    setIsExportMenuOpen(false);
    setIsIDSExportOpen(true);
  };

  const onExportExcel = () => {
    setIsExportMenuOpen(false);
    setIsExcelExportOpen(true);
  };

  const handleExcelExport = async (selection: SheetSelection) => {
    if (!project) return;
    setIsExcelExportOpen(false);
    setStatus("Generuji Excel soubor...");
    try {
      await exportExcelFile(project, selection);
      setStatus("Excel soubor byl úspěšně exportován");
      setTimeout(() => setStatus(""), 3000);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Export do Excel se nezdařil");
      setTimeout(() => setStatus(""), 5000);
    }
  };

  const onAddPhase = (phase: Phase) => {
    if (!project) return;
    const next = {
      ...project,
      phases: ensurePhaseList([...project.phases, phase]),
      updatedAt: new Date().toISOString(),
    };
    updateProjectWithHistory(next);
  };

  const onUpdatePhase = (phase: Phase) => {
    if (!project) return;
    const nextPhases = project.phases.map((p) => (p.id === phase.id ? phase : p));
    const next = ensureProjectPhases({ ...project, phases: nextPhases });
    updateProjectWithHistory(next);
  };

  const onDeletePhase = (phaseId: string) => {
    if (!project) return;
    const next = removePhaseFromProject(project, phaseId);
    updateProjectWithHistory(next);
  };

  const onAddPurposeOfUse = (entry: import("./project/types").PurposeOfUseEntry) => {
    if (!project) return;
    const next: Project = {
      ...project,
      purposeOfUseEntries: [...(project.purposeOfUseEntries ?? []), entry],
      updatedAt: new Date().toISOString(),
    };
    updateProjectWithHistory(next);
  };

  const onUpdatePurposeOfUse = (entry: import("./project/types").PurposeOfUseEntry) => {
    if (!project) return;
    const list = project.purposeOfUseEntries ?? [];
    const next: Project = {
      ...project,
      purposeOfUseEntries: list.map((e) => (e.id === entry.id ? entry : e)),
      updatedAt: new Date().toISOString(),
    };
    updateProjectWithHistory(next);
  };

  const onDeletePurposeOfUse = (id: string) => {
    if (!project) return;
    const next: Project = {
      ...project,
      purposeOfUseEntries: (project.purposeOfUseEntries ?? []).filter((e) => e.id !== id),
      updatedAt: new Date().toISOString(),
    };
    updateProjectWithHistory(next);
  };

  const onAddCodeList = (list: CodeList) => {
    if (!project) return;
    const next: Project = {
      ...project,
      codeLists: [...(project.codeLists ?? []), list],
      updatedAt: new Date().toISOString(),
    };
    updateProjectWithHistory(next);
  };

  const onImportCodeLists = (lists: CodeList[]) => {
    if (!project || lists.length === 0) return;
    const next: Project = {
      ...project,
      codeLists: [...(project.codeLists ?? []), ...lists],
      updatedAt: new Date().toISOString(),
    };
    updateProjectWithHistory(next);
  };

  const onUpdateCodeList = (id: string, updates: Partial<CodeList>) => {
    if (!project) return;
    const existing = (project.codeLists ?? []).find((c) => c.id === id);
    const nextLists = (project.codeLists ?? []).map((c) => (c.id === id ? { ...c, ...updates } : c));
    let next: Project = ensureProjectPhases({ ...project, codeLists: nextLists });
    const updated = existing ? nextLists.find((c) => c.id === id) : undefined;
    if (updated) next = applyCodeListPropagation(next, updated);
    updateProjectWithHistory(next);
  };

  const onDeleteCodeList = (id: string) => {
    if (!project) return;
    const nextLists = (project.codeLists ?? []).filter((c) => c.id !== id);
    const next: Project = ensureProjectPhases({ ...project, codeLists: nextLists });
    updateProjectWithHistory(next);
  };

  const onSaveEnumAsCodeList = (opts: {
    objectCode: string;
    propertyId: string;
    name: string;
    values: string[];
    link: boolean;
  }) => {
    if (!project) return;
    const list: CodeList = {
      id: makeId(),
      name: (opts.name || "").trim() || "Číselník",
      values: opts.values ?? [],
    };

    let next: Project = {
      ...project,
      codeLists: [...(project.codeLists ?? []), list],
      updatedAt: new Date().toISOString(),
    };

    if (opts.link) {
      const obj = next.objects[opts.objectCode];
      if (obj) {
        const nextReqs = { ...obj.requirements };
        nextReqs.properties = obj.requirements.properties.map((p) => {
          if (p.id !== opts.propertyId) return p;
          const nextExtensions = { ...(p.extensions ?? {}) } as Record<string, unknown>;
          nextExtensions[ENUM_CODELIST_ID_KEY] = list.id;
          return {
            ...p,
            constraint: "ENUM",
            value: formatEnumValues(list.values),
            extensions: nextExtensions,
          };
        });
        next = {
          ...next,
          objects: {
            ...next.objects,
            [opts.objectCode]: { ...obj, requirements: nextReqs },
          },
        };
      }
    }

    updateProjectWithHistory(next);
  };

  const codeListUsage = useMemo(() => {
    const usage: Record<
      string,
      Array<{ objectCode: string; objectDescription?: string; propertyLabel?: string }>
    > = {};
    if (!project) return usage;
    Object.values(project.objects).forEach((obj) => {
      obj.requirements.properties.forEach((p) => {
        const id = (p.extensions?.[ENUM_CODELIST_ID_KEY] as string | undefined) ?? undefined;
        if (!id || p.constraint !== "ENUM") return;
        const label = `${p.psetName || ""}${p.propertyName ? `.${p.propertyName}` : ""}`.trim() || undefined;
        (usage[id] ??= []).push({
          objectCode: obj.code,
          objectDescription: obj.description,
          propertyLabel: label,
        });
      });
    });
    return usage;
  }, [project]);

  // Classification System Entries handlers
  const onAddClassificationSystemEntry = (entry: ClassificationSystemEntry) => {
    if (!project) return;
    const next: Project = {
      ...project,
      classificationSystemEntries: [...(project.classificationSystemEntries ?? []), entry],
      updatedAt: new Date().toISOString(),
    };
    updateProjectWithHistory(next);
  };

  const onUpdateClassificationSystemEntry = (id: string, updates: Partial<ClassificationSystemEntry>) => {
    if (!project) return;
    
    // If setting this entry as primary, unset all others
    let nextEntries = (project.classificationSystemEntries ?? []).map((e) =>
      e.id === id ? { ...e, ...updates } : e
    );

    // Když systém přejde na „Klasifikační systém“, odebrat ho z authoringToolSystemIds u primárního
    if (updates.systemKind === "classification") {
      nextEntries = nextEntries.map((e) => {
        if (!e.isPrimary || !e.authoringToolSystemIds?.length) return e;
        const filtered = e.authoringToolSystemIds.filter((sid) => sid !== id);
        return filtered.length === e.authoringToolSystemIds.length ? e : { ...e, authoringToolSystemIds: filtered.length ? filtered : undefined };
      });
    }
    // Když systém přejde na „Autorský nástroj“ a je v mappedSystemIds primárního, přidat ho do authoringToolSystemIds
    if (updates.systemKind === "authoring") {
      nextEntries = nextEntries.map((e) => {
        if (!e.isPrimary || !e.mappedSystemIds?.includes(id)) return e;
        const current = e.authoringToolSystemIds ?? [];
        if (current.includes(id)) return e;
        return { ...e, authoringToolSystemIds: [...current, id] };
      });
    }
    // Když se změní authoringToolSystemIds u primárního, nastavit systemKind="authoring" u systémů v seznamu
    if (updates.authoringToolSystemIds && (nextEntries.find((e) => e.id === id)?.isPrimary ?? project.classificationSystemEntries?.find((e) => e.id === id)?.isPrimary)) {
      const newIds = new Set(updates.authoringToolSystemIds);
      nextEntries = nextEntries.map((e) => {
        if (newIds.has(e.id) && (e.systemKind ?? (e.isIfcSystem ? "ifc" : "classification")) !== "authoring") {
          return { ...e, systemKind: "authoring" as const };
        }
        return e;
      });
    }

    if (updates.isPrimary === true) {
      nextEntries = nextEntries.map((e) =>
        e.id !== id ? { ...e, isPrimary: false } : e
      );
    }
    
    const updatedEntry = nextEntries.find((e) => e.id === id);
    
    // Update the main classification if the primary entry's nodes changed
    let nextClassification = project.classification;
    if (updatedEntry?.isPrimary && updatedEntry.nodes) {
      nextClassification = {
        nodes: updatedEntry.nodes,
        sourceName: updatedEntry.sourceName || updatedEntry.name,
        hash: updatedEntry.hash,
      };
      setClassification(nextClassification);
    }
    
    // If isPrimary was just set, also update the main classification
    if (updates.isPrimary === true && updatedEntry?.nodes) {
      nextClassification = {
        nodes: updatedEntry.nodes,
        sourceName: updatedEntry.sourceName || updatedEntry.name,
        hash: updatedEntry.hash,
      };
      setClassification(nextClassification);
    }
    
    let next: Project = {
      ...project,
      classification: nextClassification,
      classificationSystemEntries: nextEntries,
      updatedAt: new Date().toISOString(),
    };
    // Po uložení mapování primárního systému propagovat IFC hodnoty do objektů
    if (updatedEntry?.isPrimary && updates.nodes) {
      next = propagateMappingToObjects(next);
    }
    // Po uložení mapování primárního systému propagovat autor. nástroje (mappedValues) do object.authoringClassifications
    if (updatedEntry?.isPrimary && (updates.nodes || updates.authoringToolSystemIds)) {
      next = propagateAuthoringMappingToObjects(next);
    }
    // Po uložení mapování primárního systému propagovat klasifikační systémy (mappedValues) do object.requirements.classifications
    if (updatedEntry?.isPrimary && updates.nodes) {
      next = propagateClassificationMappingToObjects(next);
    }
    updateProjectWithHistory(next);
  };

  const onAddIfcClassificationSystem = useCallback(
    (onAdded?: (entry: ClassificationSystemEntry) => void) => {
      if (!schemaIndex) {
        setStatus("Schema IFC není načtené. Spusťte npm run build:schema.");
        setTimeout(() => setStatus(""), 5000);
        return;
      }
      const ifcData = buildClassificationFromSchema(schemaIndex);
    const ifcEntry: ClassificationSystemEntry = {
      id: makeId(),
      name: ifcData.sourceName,
      sourceName: ifcData.sourceName,
      nodes: ifcData.nodes,
      hash: ifcData.hash,
      isPrimary: true,
      isIfcSystem: true,
      systemKind: "ifc",
    };

      if (!project) {
        const newProject = createEmptyProject(ifcData);
        newProject.classificationSystemEntries = [ifcEntry];
        historyRef.current = [JSON.parse(JSON.stringify(newProject))];
        historyIndexRef.current = 0;
        setProject(newProject);
        setClassification(ifcData);
        const leaves = collectLeaves(ifcData.nodes);
        setSelectedCode(leaves[0]?.code);
        saveProjectToStorage(newProject);
        setStatus("Projekt založen na třídění dle IFC entit.");
      } else {
        const nextEntries = (project.classificationSystemEntries ?? []).map((e) => ({
          ...e,
          isPrimary: false,
        }));
        nextEntries.unshift({ ...ifcEntry, isPrimary: true });
        const next: Project = {
          ...project,
          classification: ifcData,
          classificationSystemEntries: nextEntries,
          updatedAt: new Date().toISOString(),
        };
        setClassification(ifcData);
        updateProjectWithHistory(next);
        setStatus("Třídění dle IFC entit nastaveno jako primární.");
      }
      setTimeout(() => setStatus(""), 3000);
      onAdded?.(ifcEntry);
    },
    [schemaIndex, project]
  );

  /** Formát popisu objektu dle IFC třídění: „IfcEntity.PredefinedType“ nebo „IfcEntity“. */
  const formatIfcDescriptionFromCode = useCallback((code: string): string => {
    if (!code.includes("::")) return code;
    const [entity, predefinedType] = code.split("::");
    return predefinedType ? `${entity ?? ""}.${predefinedType}` : (entity ?? code);
  }, []);

  /** Přidá existující objekt (podle jeho code) do IFC hierarchie – žádný duplikát, stejný objekt; popis sjednotí na formát IFC. */
  const onAddToIfcHierarchy = useCallback(
    (objectCode: string) => {
      if (!project || !schemaIndex) return;
      const ifcEntry = (project.classificationSystemEntries ?? []).find((e) => e.isIfcSystem);
      if (!ifcEntry?.nodes) return;
      const currentCodes = new Set(collectLeaves(ifcEntry.nodes).map((n) => n.code));
      currentCodes.add(objectCode);
      const data = buildClassificationFromSchemaFiltered(schemaIndex, currentCodes);
      const nextEntries = (project.classificationSystemEntries ?? []).map((e) =>
        e.id === ifcEntry.id ? { ...e, nodes: data.nodes, hash: data.hash } : e
      );
      const nextObjects = { ...project.objects };
      const obj = nextObjects[objectCode];
      if (obj) {
        nextObjects[objectCode] = { ...obj, description: formatIfcDescriptionFromCode(objectCode) };
      }
      const next: Project = {
        ...project,
        classificationSystemEntries: nextEntries,
        objects: nextObjects,
        updatedAt: new Date().toISOString(),
      };
      if (ifcEntry.isPrimary) {
        next.classification = { nodes: data.nodes, sourceName: data.sourceName, hash: data.hash };
        setClassification(next.classification);
      }
      updateProjectWithHistory(next);
      setStatus(`Do hierarchie přidáno: ${objectCode}`);
      setTimeout(() => setStatus(""), 3000);
    },
    [project, schemaIndex, formatIfcDescriptionFromCode],
  );

  const onDeleteClassificationSystemEntry = (id: string) => {
    if (!project) return;
    const entries = project.classificationSystemEntries ?? [];
    const deletedEntry = entries.find((e) => e.id === id);
    const nextEntries = entries.filter((e) => e.id !== id);

    if (nextEntries.length === 0) {
      clearProject();
      return;
    }

    let next: Project = {
      ...project,
      classificationSystemEntries: nextEntries,
      updatedAt: new Date().toISOString(),
    };

    if (deletedEntry?.isPrimary) {
      const newPrimary = nextEntries[0];
      next = {
        ...next,
        classificationSystemEntries: nextEntries.map((e) =>
          e.id === newPrimary.id ? { ...e, isPrimary: true } : { ...e, isPrimary: false }
        ),
      };
      next.classification = {
        nodes: newPrimary.nodes ?? [],
        sourceName: newPrimary.sourceName ?? newPrimary.name,
        hash: newPrimary.hash,
      };
      setClassification(next.classification);
    }

    updateProjectWithHistory(next);
  };

  const onUpdateProjectDetails = (updates: Partial<Project>) => {
    if (!project) return;
    const next: Project = {
      ...project,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    updateProjectWithHistory(next);
  };

  // Undo/Redo functions
  const updateProjectWithHistory = (newProject: Project) => {
    if (isUndoRedoRef.current) {
      setProject(newProject);
      saveProjectToStorage(newProject);
      return;
    }

    // Remove any history after current index (when doing new action after undo)
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    }

    // Add new state to history
    historyRef.current.push(JSON.parse(JSON.stringify(newProject))); // Deep clone
    historyIndexRef.current = historyRef.current.length - 1;

    // Limit history size to 50 states
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
      historyIndexRef.current--;
    }

    setProject(newProject);
    saveProjectToStorage(newProject);
  };

  const onDeleteObject = useCallback(
    (code: string) => {
      if (!project) return;
      const obj = project.objects[code];
      if (obj?.locked) return;
      const name = obj?.description || obj?.code || code;
      if (!window.confirm(`Opravdu chcete odstranit objekt „${name}"? Bude odstraněn z hierarchie, klasifikace i mapování.`)) return;
      const primary = (project.classificationSystemEntries ?? []).find((e) => e.isPrimary);
      const primaryNodes = primary?.nodes ?? [];
      const newNodes = removeNodeByCode(primaryNodes, code);
      let next: Project = {
        ...project,
        objects: { ...project.objects },
        updatedAt: new Date().toISOString(),
      };
      delete next.objects[code];
      if (primary && primaryNodes.length > 0) {
        next = {
          ...next,
          classificationSystemEntries: (next.classificationSystemEntries ?? []).map((e) =>
            e.id === primary.id ? { ...e, nodes: newNodes } : e
          ),
          // Vždy aktualizovat zobrazenou klasifikaci podle nového stromu primárního systému,
          // aby levý panel (strom) odpovídal smazání – ne jen při shodě referencí (project.classification?.nodes === primary.nodes).
          classification: project.classification
            ? { ...project.classification, nodes: newNodes }
            : project.classification,
        };
      }
      updateProjectWithHistory(next);
      setClassification(next.classification ?? null);
      if (selectedCode === code) {
        const leaves = collectLeaves(newNodes);
        setSelectedCode(leaves[0]?.code);
        setSelectedObject(null);
      }
      setStatus(`Objekt „${name}" byl odstraněn`);
      setTimeout(() => setStatus(""), 3000);
    },
    [project, selectedCode],
  );

  const onToggleLockObject = useCallback(
    (obj: ProjectObject) => {
      if (!project) return;
      const next = {
        ...project,
        objects: { ...project.objects, [obj.code]: { ...obj, locked: !obj.locked } },
        updatedAt: new Date().toISOString(),
      };
      updateProjectWithHistory(next);
      if (selectedObject?.code === obj.code) {
        setSelectedObject({ ...obj, locked: !obj.locked });
      }
    },
    [project, selectedObject],
  );

  const onCopyObject = useCallback(
    (sourceCode: string) => {
      if (!project || !schemaIndex) return;
      const source = project.objects[sourceCode];
      if (!source) return;
      const primary = (project.classificationSystemEntries ?? []).find((e) => e.isPrimary);
      const primaryNodes = primary?.nodes ?? [];
      const shortId = makeId().slice(0, 8);

      const isIfcPrimary = primary?.isIfcSystem === true;
      const newCode = `${sourceCode}-copy-${shortId}`;

      const newObj: ProjectObject = {
        ...JSON.parse(JSON.stringify(source)),
        code: newCode,
        copiedFrom: sourceCode,
        locked: false,
      };

      const nextObjects = { ...project.objects, [newCode]: newObj };
      let next: Project = {
        ...project,
        objects: nextObjects,
        updatedAt: new Date().toISOString(),
      };

      if (primary && primaryNodes.length > 0) {
        if (isIfcPrimary) {
          const currentCodes = new Set(collectLeaves(primaryNodes).map((n) => n.code));
          currentCodes.add(newCode);
          const data = buildClassificationFromSchemaFiltered(schemaIndex, currentCodes);
          next = {
            ...next,
            classificationSystemEntries: (next.classificationSystemEntries ?? []).map((e) =>
              e.id === primary.id ? { ...e, nodes: data.nodes, hash: data.hash } : e
            ),
          };
          if (primary.isPrimary) {
            next.classification = { nodes: data.nodes, sourceName: data.sourceName, hash: data.hash };
            setClassification(next.classification);
          }
        } else {
          const sourceNode = findNodeByCode(primaryNodes, sourceCode);
          const newNode: ClassificationNode = sourceNode
            ? {
              ...sourceNode,
              code: newCode,
              description: newObj.description || newCode,
              children: [],
            }
            : {
              code: newCode,
              description: newObj.description || newCode,
              level: 2,
              children: [],
            };
          const newNodes = addNodeAsSibling(primaryNodes, sourceCode, newNode);
          next = {
            ...next,
            classificationSystemEntries: (next.classificationSystemEntries ?? []).map((e) =>
              e.id === primary.id ? { ...e, nodes: newNodes } : e
            ),
            classification: project.classification
              ? { ...project.classification, nodes: newNodes }
              : project.classification,
          };
          setClassification(next.classification);
        }
      }

      updateProjectWithHistory(next);
      setSelectedCode(newCode);
      setSelectedObject(newObj);
      setStatus(`Objekt zkopírován: ${newCode}`);
      setTimeout(() => setStatus(""), 3000);
    },
    [project, schemaIndex],
  );

  const onDuplicatePropertyGroupsToObjects = useCallback(
    (
      sourceObjectCode: string,
      groups: { groupKey: string; properties: PropertyRequirement[] }[],
      targetObjectCodes: string[],
    ) => {
      if (!project) return;
      const nextObjects = { ...project.objects };
      for (const targetCode of targetObjectCodes) {
        if (targetCode === sourceObjectCode) continue;
        const obj = nextObjects[targetCode];
        if (!obj) continue;
        const newProps: PropertyRequirement[] = [];
        for (const { properties } of groups) {
          for (const p of properties) {
            newProps.push({
              ...JSON.parse(JSON.stringify(p)),
              id: makeId(),
            });
          }
        }
        nextObjects[targetCode] = {
          ...obj,
          requirements: {
            ...obj.requirements,
            properties: [...obj.requirements.properties, ...newProps],
          },
        };
      }
      updateProjectWithHistory({
        ...project,
        objects: nextObjects,
        updatedAt: new Date().toISOString(),
      });
      setStatus(`Skupiny vlastností zkopírovány do ${targetObjectCodes.length} objektů`);
      setTimeout(() => setStatus(""), 3000);
    },
    [project],
  );

  const onDuplicateAttributesToObjects = useCallback(
    (sourceObjectCode: string, attributes: AttributeRequirement[], targetObjectCodes: string[]) => {
      if (!project) return;
      const nextObjects = { ...project.objects };
      for (const targetCode of targetObjectCodes) {
        if (targetCode === sourceObjectCode) continue;
        const obj = nextObjects[targetCode];
        if (!obj) continue;
        const newAttrs = attributes.map((a) => ({ ...JSON.parse(JSON.stringify(a)), id: makeId() }));
        nextObjects[targetCode] = {
          ...obj,
          requirements: {
            ...obj.requirements,
            attributes: [...obj.requirements.attributes, ...newAttrs],
          },
        };
      }
      updateProjectWithHistory({
        ...project,
        objects: nextObjects,
        updatedAt: new Date().toISOString(),
      });
      setStatus(`Atributy zkopírovány do ${targetObjectCodes.length} objektů`);
      setTimeout(() => setStatus(""), 3000);
    },
    [project],
  );

  const onDuplicateClassificationsToObjects = useCallback(
    (sourceObjectCode: string, classifications: ClassificationRequirement[], targetObjectCodes: string[]) => {
      if (!project) return;
      const nextObjects = { ...project.objects };
      for (const targetCode of targetObjectCodes) {
        if (targetCode === sourceObjectCode) continue;
        const obj = nextObjects[targetCode];
        if (!obj) continue;
        const newCls = classifications.map((c) => ({ ...JSON.parse(JSON.stringify(c)), id: makeId() }));
        nextObjects[targetCode] = {
          ...obj,
          requirements: {
            ...obj.requirements,
            classifications: [...obj.requirements.classifications, ...newCls],
          },
        };
      }
      updateProjectWithHistory({
        ...project,
        objects: nextObjects,
        updatedAt: new Date().toISOString(),
      });
      setStatus(`Klasifikace zkopírovány do ${targetObjectCodes.length} objektů`);
      setTimeout(() => setStatus(""), 3000);
    },
    [project],
  );

  const onDuplicateMaterialsToObjects = useCallback(
    (sourceObjectCode: string, materials: MaterialRequirement[], targetObjectCodes: string[]) => {
      if (!project) return;
      const nextObjects = { ...project.objects };
      for (const targetCode of targetObjectCodes) {
        if (targetCode === sourceObjectCode) continue;
        const obj = nextObjects[targetCode];
        if (!obj) continue;
        const newMats = materials.map((m) => ({ ...JSON.parse(JSON.stringify(m)), id: makeId() }));
        nextObjects[targetCode] = {
          ...obj,
          requirements: {
            ...obj.requirements,
            materials: [...obj.requirements.materials, ...newMats],
          },
        };
      }
      updateProjectWithHistory({
        ...project,
        objects: nextObjects,
        updatedAt: new Date().toISOString(),
      });
      setStatus(`Materiálové požadavky zkopírovány do ${targetObjectCodes.length} objektů`);
      setTimeout(() => setStatus(""), 3000);
    },
    [project],
  );

  const onDuplicateRelationsToObjects = useCallback(
    (sourceObjectCode: string, relations: RelationRequirement[], targetObjectCodes: string[]) => {
      if (!project) return;
      const nextObjects = { ...project.objects };
      for (const targetCode of targetObjectCodes) {
        if (targetCode === sourceObjectCode) continue;
        const obj = nextObjects[targetCode];
        if (!obj) continue;
        const newRels = relations.map((r) => ({ ...JSON.parse(JSON.stringify(r)), id: makeId() }));
        nextObjects[targetCode] = {
          ...obj,
          requirements: {
            ...obj.requirements,
            relations: [...obj.requirements.relations, ...newRels],
          },
        };
      }
      updateProjectWithHistory({
        ...project,
        objects: nextObjects,
        updatedAt: new Date().toISOString(),
      });
      setStatus(`Součásti (vztahy) zkopírovány do ${targetObjectCodes.length} objektů`);
      setTimeout(() => setStatus(""), 3000);
    },
    [project],
  );

  const onAssignGroupToObjects = useCallback(
    (
      kind: RequirementItemKind,
      fingerprint: string,
      objectCodes: string[],
      representativeItems: import("./project/requirementFingerprint").RequirementItemGroup["representativeItems"],
    ) => {
      if (!project) return;

      const targetSet = new Set(objectCodes);
      const nextObjects: Project["objects"] = { ...project.objects };
      let changed = false;

      for (const [code, obj] of Object.entries(project.objects)) {
        const reqs = obj.requirements;
        const shouldHave = targetSet.has(code);

        if (kind === "pset") {
          const psetMap = new Map<string, PropertyRequirement[]>();
          for (const p of reqs.properties) {
            const key = (p.psetName ?? "").trim();
            const arr = psetMap.get(key);
            if (arr) arr.push(p);
            else psetMap.set(key, [p]);
          }
          const props = representativeItems as PropertyRequirement[];
          const psetName = (props[0]?.psetName ?? "").trim();
          const existing = psetMap.get(psetName);
          const hasIt = existing && computePsetFingerprint(psetName, existing) === fingerprint;

          if (shouldHave && !hasIt) {
            const cloned = props.map((p) => ({ ...p, id: makeId() }));
            const other = reqs.properties.filter((p) => (p.psetName ?? "").trim() !== psetName);
            nextObjects[code] = { ...obj, requirements: { ...reqs, properties: [...other, ...cloned] } };
            changed = true;
          } else if (!shouldHave && hasIt) {
            const other = reqs.properties.filter((p) => (p.psetName ?? "").trim() !== psetName);
            nextObjects[code] = { ...obj, requirements: { ...reqs, properties: other } };
            changed = true;
          }
        } else if (kind === "attribute") {
          const idx = reqs.attributes.findIndex((a) => !a.isApplicability && computeAttributeItemFingerprint(a) === fingerprint);
          const hasIt = idx >= 0;

          if (shouldHave && !hasIt) {
            const item = (representativeItems as [AttributeRequirement])[0];
            nextObjects[code] = {
              ...obj,
              requirements: { ...reqs, attributes: [...reqs.attributes, { ...item, id: makeId() }] },
            };
            changed = true;
          } else if (!shouldHave && hasIt) {
            const nextAttrs = reqs.attributes.filter((_, i) => i !== idx);
            nextObjects[code] = { ...obj, requirements: { ...reqs, attributes: nextAttrs } };
            changed = true;
          }
        } else if (kind === "classification") {
          const idx = reqs.classifications.findIndex(
            (c) => !c.readOnly && !c.isApplicability && computeClassificationItemFingerprint(c) === fingerprint,
          );
          const hasIt = idx >= 0;

          if (shouldHave && !hasIt) {
            const item = (representativeItems as [ClassificationRequirement])[0];
            nextObjects[code] = {
              ...obj,
              requirements: { ...reqs, classifications: [...reqs.classifications, { ...item, id: makeId() }] },
            };
            changed = true;
          } else if (!shouldHave && hasIt) {
            const nextCls = reqs.classifications.filter((_, i) => i !== idx);
            nextObjects[code] = { ...obj, requirements: { ...reqs, classifications: nextCls } };
            changed = true;
          }
        } else if (kind === "material") {
          const idx = reqs.materials.findIndex((m) => !m.isApplicability && computeMaterialItemFingerprint(m) === fingerprint);
          const hasIt = idx >= 0;

          if (shouldHave && !hasIt) {
            const item = (representativeItems as [MaterialRequirement])[0];
            nextObjects[code] = {
              ...obj,
              requirements: { ...reqs, materials: [...reqs.materials, { ...item, id: makeId() }] },
            };
            changed = true;
          } else if (!shouldHave && hasIt) {
            const nextMat = reqs.materials.filter((_, i) => i !== idx);
            nextObjects[code] = { ...obj, requirements: { ...reqs, materials: nextMat } };
            changed = true;
          }
        } else if (kind === "relation") {
          const idx = reqs.relations.findIndex((r) => !r.isApplicability && computeRelationItemFingerprint(r) === fingerprint);
          const hasIt = idx >= 0;

          if (shouldHave && !hasIt) {
            const item = (representativeItems as [RelationRequirement])[0];
            nextObjects[code] = {
              ...obj,
              requirements: { ...reqs, relations: [...reqs.relations, { ...item, id: makeId() }] },
            };
            changed = true;
          } else if (!shouldHave && hasIt) {
            const nextRel = reqs.relations.filter((_, i) => i !== idx);
            nextObjects[code] = { ...obj, requirements: { ...reqs, relations: nextRel } };
            changed = true;
          }
        }
      }

      if (!changed) return;

      const next: Project = {
        ...project,
        objects: nextObjects,
        updatedAt: new Date().toISOString(),
      };

      updateProjectWithHistory(next);
    },
    [project],
  );

  const onUpdateRequirementItemGroup = useCallback(
    (kind: RequirementItemKind, fingerprint: string, updatedItems: import("./project/types").PropertyRequirement[] | [import("./project/types").AttributeRequirement] | [import("./project/types").ClassificationRequirement] | [import("./project/types").MaterialRequirement] | [import("./project/types").RelationRequirement]) => {
      if (!project) return;

      let changed = false;
      const nextObjects: Project["objects"] = { ...project.objects };

      for (const [code, obj] of Object.entries(project.objects)) {
        const reqs = obj.requirements;

        if (kind === "pset") {
          const psetMap = new Map<string, import("./project/types").PropertyRequirement[]>();
          for (const p of reqs.properties) {
            const key = (p.psetName ?? "").trim();
            const arr = psetMap.get(key);
            if (arr) arr.push(p);
            else psetMap.set(key, [p]);
          }
          for (const [psetName, props] of psetMap) {
            if (computePsetFingerprint(psetName, props) === fingerprint) {
              const updatedProps = updatedItems as import("./project/types").PropertyRequirement[];
              const otherProps = reqs.properties.filter((p) => (p.psetName ?? "").trim() !== psetName);
              const nextReqs: ObjectRequirements = { ...reqs, properties: [...otherProps, ...updatedProps] };
              nextObjects[code] = { ...obj, requirements: nextReqs };
              changed = true;
              break;
            }
          }
        } else if (kind === "attribute") {
          for (let i = 0; i < reqs.attributes.length; i++) {
            if (reqs.attributes[i].isApplicability) continue;
            if (computeAttributeItemFingerprint(reqs.attributes[i]) === fingerprint) {
              const nextAttrs = [...reqs.attributes];
              nextAttrs[i] = (updatedItems as [import("./project/types").AttributeRequirement])[0];
              nextObjects[code] = { ...obj, requirements: { ...reqs, attributes: nextAttrs } };
              changed = true;
              break;
            }
          }
        } else if (kind === "classification") {
          for (let i = 0; i < reqs.classifications.length; i++) {
            if (reqs.classifications[i].readOnly || reqs.classifications[i].isApplicability) continue;
            if (computeClassificationItemFingerprint(reqs.classifications[i]) === fingerprint) {
              const nextCls = [...reqs.classifications];
              nextCls[i] = (updatedItems as [import("./project/types").ClassificationRequirement])[0];
              nextObjects[code] = { ...obj, requirements: { ...reqs, classifications: nextCls } };
              changed = true;
              break;
            }
          }
        } else if (kind === "material") {
          for (let i = 0; i < reqs.materials.length; i++) {
            if (reqs.materials[i].isApplicability) continue;
            if (computeMaterialItemFingerprint(reqs.materials[i]) === fingerprint) {
              const nextMat = [...reqs.materials];
              nextMat[i] = (updatedItems as [import("./project/types").MaterialRequirement])[0];
              nextObjects[code] = { ...obj, requirements: { ...reqs, materials: nextMat } };
              changed = true;
              break;
            }
          }
        } else if (kind === "relation") {
          for (let i = 0; i < reqs.relations.length; i++) {
            if (reqs.relations[i].isApplicability) continue;
            if (computeRelationItemFingerprint(reqs.relations[i]) === fingerprint) {
              const nextRel = [...reqs.relations];
              nextRel[i] = (updatedItems as [import("./project/types").RelationRequirement])[0];
              nextObjects[code] = { ...obj, requirements: { ...reqs, relations: nextRel } };
              changed = true;
              break;
            }
          }
        }
      }

      if (!changed) return;

      const next: Project = {
        ...project,
        objects: nextObjects,
        updatedAt: new Date().toISOString(),
      };

      updateProjectWithHistory(next);
    },
    [project],
  );

  const canUndo = () => {
    return historyIndexRef.current > 0;
  };

  const canRedo = () => {
    return historyIndexRef.current < historyRef.current.length - 1;
  };

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    isUndoRedoRef.current = true;
    historyIndexRef.current--;
    const previousProject = historyRef.current[historyIndexRef.current];
    setProject(previousProject);
    setClassification(previousProject.classification ?? null);
    saveProjectToStorage(previousProject);
    isUndoRedoRef.current = false;
  }, []);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    isUndoRedoRef.current = true;
    historyIndexRef.current++;
    const nextProject = historyRef.current[historyIndexRef.current];
    setProject(nextProject);
    setClassification(nextProject.classification ?? null);
    saveProjectToStorage(nextProject);
    isUndoRedoRef.current = false;
  }, []);

  // Initialize history when project is first loaded (from storage or after clear + new classification)
  useEffect(() => {
    if (project && !isUndoRedoRef.current) {
      if (historyRef.current.length === 0) {
        historyRef.current = [JSON.parse(JSON.stringify(project))];
        historyIndexRef.current = 0;
      }
    }
  }, [project]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Close export/import menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
      if (importMenuRef.current && !importMenuRef.current.contains(event.target as Node)) {
        setIsImportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Panel resize handlers
  const handleResizeStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!isResizingRef.current || !resizeContainerRef.current) return;
      
      const containerRect = resizeContainerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      
      // Limit width between 250px and 800px
      const clampedWidth = Math.max(250, Math.min(800, newWidth));
      setPanelWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        // Save width to localStorage
        localStorage.setItem("infoReqApp_panelWidth", panelWidth.toString());
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [panelWidth]);

  return (
    <TranslationProvider project={project}>
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <div className="text-xs uppercase text-slate-500">InfoReqApp</div>
          <button
            className="text-lg font-semibold text-slate-800 hover:text-controlis-primary flex items-center gap-2 group"
            onClick={() => setIsProjectDetailsOpen(true)}
            disabled={!project}
            title="Klikněte pro úpravu údajů projektu"
          >
            {project?.name || "Nový projekt"}
            <svg 
              className="w-4 h-4 text-slate-400 group-hover:text-red-500" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            onClick={() => setIsSettingsOpen(true)}
            disabled={!project}
            title="Nastavení"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleUndo}
            disabled={!canUndo() || !project}
            title="Zpět (Ctrl+Z)"
          >
            ↶ Zpět
          </button>
          <button
            className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleRedo}
            disabled={!canRedo() || !project}
            title="Vpřed (Ctrl+Y)"
          >
            ↷ Vpřed
          </button>
          <button
            className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
            onClick={() => {
              if (window.confirm("Opravdu chcete projekt nenávratně zresetovat? Všechna data budou ztracena.")) {
                clearProject();
              }
            }}
            title="Reset projektu a začít znovu"
          >
            Reset projektu
          </button>
          {/* Import dropdown */}
          <div className="relative" ref={importMenuRef}>
            <button
              className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50 flex items-center gap-1"
              onClick={() => setIsImportMenuOpen(!isImportMenuOpen)}
            >
              Import
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isImportMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 rounded-md border border-slate-200 bg-white shadow-lg z-50">
                <div className="py-1">
                  <label className="flex cursor-pointer items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">
                    <input
                      ref={importJsonInputRef}
                      type="file"
                      accept="application/json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void onImportProject(file);
                        setIsImportMenuOpen(false);
                      }}
                    />
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    JSON
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">
                    <input
                      ref={importIdsInputRef}
                      type="file"
                      accept=".ids,application/xml,text/xml"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void onImportIds(file);
                      }}
                    />
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    IDS
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">
                    <input
                      ref={importExcelInputRef}
                      type="file"
                      accept=".xlsx"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void onImportExcel(file);
                      }}
                    />
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Excel
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Export dropdown */}
          <div className="relative" ref={exportMenuRef}>
            <button
              className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-500 flex items-center gap-1"
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              disabled={!project}
            >
              Export
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {isExportMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 rounded-md border border-slate-200 bg-white shadow-lg z-50">
                <div className="py-1">
                  <button
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                    onClick={onExportProject}
                  >
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    JSON
                  </button>
                  <button
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                    onClick={onExportIDS}
                  >
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    IDS
                  </button>
                  <button
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                    onClick={onExportExcel}
                  >
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Excel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {status && (
        <div className="flex items-start gap-2 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          <span className="flex-1 whitespace-pre-line">{status}</span>
          <button
            type="button"
            onClick={() => setStatus("")}
            className="flex-shrink-0 rounded p-0.5 hover:bg-amber-100 text-amber-800"
            title="Zavřít"
            aria-label="Zavřít"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div ref={resizeContainerRef} className="flex flex-1 overflow-hidden relative">
        {/* Toggle button when panel is hidden - show on left edge */}
        {!leftPanelVisible && (
          <button
            type="button"
            onClick={toggleLeftPanel}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-8 h-16 rounded-r-md border border-slate-300 bg-white shadow-md hover:bg-slate-50 flex items-center justify-center text-slate-600 hover:text-controlis-primary transition-colors"
            title="Zobrazit levý panel"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 12h14" />
            </svg>
          </button>
        )}
        {leftPanelVisible && (
          <>
        <div 
          className="flex-shrink-0 overflow-hidden"
          style={{ width: panelWidth }}
        >
          <ClassificationPanel
            classification={classification}
            objects={project?.objects}
            selectedCode={selectedCode}
            onSelectLeaf={onSelectLeaf}
            onUploadFile={onUploadClassification}
            phases={project?.phases ?? []}
            onAddPhase={onAddPhase}
            onUpdatePhase={onUpdatePhase}
            onDeletePhase={onDeletePhase}
            purposeOfUseEntries={project?.purposeOfUseEntries ?? []}
            onAddPurposeOfUse={onAddPurposeOfUse}
            onUpdatePurposeOfUse={onUpdatePurposeOfUse}
            onDeletePurposeOfUse={onDeletePurposeOfUse}
            codeLists={project?.codeLists ?? []}
            onAddCodeList={onAddCodeList}
            onImportCodeLists={onImportCodeLists}
            onUpdateCodeList={onUpdateCodeList}
            onDeleteCodeList={onDeleteCodeList}
            codeListUsage={codeListUsage}
            classificationSystemEntries={project?.classificationSystemEntries ?? []}
            onAddClassificationSystemEntry={onAddClassificationSystemEntry}
            onUpdateClassificationSystemEntry={onUpdateClassificationSystemEntry}
            onDeleteClassificationSystemEntry={onDeleteClassificationSystemEntry}
            schemaIndex={schemaIndex}
            onAddIfcClassificationSystem={onAddIfcClassificationSystem}
          />
        </div>
        
        {/* Resize handle and hide panel button */}
        <div className="flex items-stretch flex-shrink-0">
          <div
            className="w-1 cursor-col-resize bg-slate-200 hover:bg-red-400 active:bg-red-500 transition-colors"
            onMouseDown={handleResizeStart}
            title="Táhněte pro změnu šířky panelu"
          />
          <button
            type="button"
            onClick={toggleLeftPanel}
            className="w-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 border-l border-slate-200"
            title="Skrýt levý panel"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
          </>
        )}

        <div className="flex-1 overflow-hidden">
          {schemaLoading && (
            <div className="p-4 text-sm text-slate-600">Načítám schema index...</div>
          )}
          {schemaError && (
            <div className="p-4 text-sm text-red-600">
              {schemaError} (spusťte npm run build:schema)
            </div>
          )}
          {!selectedNode && (
            <div className="p-4 text-sm text-slate-600">Vyberte objekt ve stromu.</div>
          )}
          {selectedObject && (
            <ObjectDetail
              node={selectedNode ?? { code: selectedObject.code, description: selectedObject.description, level: 2, children: [] }}
              object={selectedObject}
              schema={schemaIndex}
              onChange={onUpdateObject}
              phases={project?.phases ?? []}
              codeLists={project?.codeLists ?? []}
              classificationSystemEntries={project?.classificationSystemEntries ?? []}
              project={project}
              onSaveEnumAsCodeList={onSaveEnumAsCodeList}
              onAddToIfcHierarchy={onAddToIfcHierarchy}
              onCopyObject={onCopyObject}
              onDeleteObject={onDeleteObject}
              onToggleLock={onToggleLockObject}
              onDuplicatePropertyGroupsToObjects={onDuplicatePropertyGroupsToObjects}
              onDuplicateAttributesToObjects={onDuplicateAttributesToObjects}
              onDuplicateClassificationsToObjects={onDuplicateClassificationsToObjects}
              onDuplicateMaterialsToObjects={onDuplicateMaterialsToObjects}
              onDuplicateRelationsToObjects={onDuplicateRelationsToObjects}
              onUpdateRequirementItemGroup={onUpdateRequirementItemGroup}
              onAssignGroupToObjects={onAssignGroupToObjects}
            />
          )}
        </div>
      </div>

      {/* Project Details Dialog */}
      {project && (
        <ProjectDetailsDialog
          project={project}
          isOpen={isProjectDetailsOpen}
          onClose={() => setIsProjectDetailsOpen(false)}
          onSave={onUpdateProjectDetails}
        />
      )}

      {/* IDS Export Dialog */}
      {project && (
        <IDSExportDialog
          project={project}
          classification={classification}
          isOpen={isIDSExportOpen}
          onClose={() => setIsIDSExportOpen(false)}
          onUpdateProject={onUpdateProjectDetails}
        />
      )}

      {/* Excel Export Dialog */}
      {project && (
        <ExcelExportDialog
          project={project}
          isOpen={isExcelExportOpen}
          onClose={() => setIsExcelExportOpen(false)}
          onExport={(selection) => void handleExcelExport(selection)}
        />
      )}

      {/* Settings Dialog */}
      <SettingsDialog
        project={project}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={onUpdateProjectDetails}
      />
    </div>
    </TranslationProvider>
  );
};

const App: React.FC = () => {
  const [project, setProject] = useState<Project | null>(null);
  const schemaVersion = normalizeIfcSchemaVersion(project?.ifcSchemaVersion);
  return (
    <SchemaProvider version={schemaVersion}>
      <AppInner project={project} setProject={setProject} />
    </SchemaProvider>
  );
};

export default App;
