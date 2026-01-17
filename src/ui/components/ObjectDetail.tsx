import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClassificationNode } from "../../classification/types";
import type { SchemaIndex } from "../../schema/types";
import { makeId } from "../../utils/id";
import type { Phase, ProjectObject, PropertyRequirement, RelationRequirement } from "../../project/types";

type TabKey = "attributes" | "properties" | "partOf" | "material" | "ids";

const IFC_DOC_BASE = "https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/lexical";
const getIfcDocUrl = (identifier: string | undefined) => (identifier ? `${IFC_DOC_BASE}/${identifier}.htm` : undefined);

const DocLink: React.FC<{ href?: string; label: string }> = ({ href, label }) => {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex items-center text-slate-500 hover:text-indigo-600" title={`Otevřít dokumentaci pro ${label}`}>
      <svg aria-hidden xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3ZM5 5h5v2H7v10h10v-3h2v5H5V5Z" />
      </svg>
    </a>
  );
};

const PhaseSelector: React.FC<{ phases: Phase[]; value?: string[]; onChange: (ids: string[]) => void }> = ({ phases, value, onChange }) => {
  const selected = new Set(value ?? []);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };
  return (
    <div className="flex flex-wrap gap-2">
      {phases.map((phase) => (
        <label key={phase.id} className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs">
          <input type="checkbox" className="h-4 w-4" checked={selected.has(phase.id)} onChange={() => toggle(phase.id)} />
          <span className="font-semibold">{phase.code}</span>
        </label>
      ))}
    </div>
  );
};

interface Props {
  node: ClassificationNode;
  object: ProjectObject;
  schema: SchemaIndex | null;
  onChange: (obj: ProjectObject) => void;
  phases: Phase[];
}

const TAB_LABELS: Record<TabKey, string> = {
  attributes: "Atributy",
  properties: "Vlastnosti",
  partOf: "Součástí (PartOf)",
  material: "Materiál",
  ids: "IDS náhled",
};

const relationTypeOptions: RelationRequirement["relationType"][] = [
  "IFCRELAGGREGATES",
  "IFCRELASSIGNSTOGROUP",
  "IFCRELCONTAINEDINSPATIALSTRUCTURE",
  "IFCRELNESTS",
  "IFCRELVOIDSELEMENT",
  "IFCRELFILLSELEMENT",
];

// Mapování hodnot podmínky pro zobrazení
const CONSTRAINT_LABELS: Record<string, string> = {
  FILLED: "Žádné",
  ENUM: "Výčet",
  PATTERN: "Vzor",
  RANGE: "Ohraničení",
  LENGTH: "Délka",
};

const CONSTRAINT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "FILLED", label: "Žádné" },
  { value: "ENUM", label: "Výčet" },
  { value: "PATTERN", label: "Vzor" },
  { value: "RANGE", label: "Ohraničení" },
  { value: "LENGTH", label: "Délka" },
];

export const ObjectDetail: React.FC<Props> = ({ node, object, schema, onChange, phases }) => {
  const [activeTab, setActiveTab] = useState<TabKey>("properties");

  const entities = useMemo(() => (schema ? Object.keys(schema.entities).sort() : []), [schema]);
  const selectedEntity = object.ifcEntity ? schema?.entities[object.ifcEntity] : undefined;
  const selectedPredefinedValue =
    object.predefinedType.mode === "ENUM" || object.predefinedType.mode === "USERDEFINED"
      ? object.predefinedType.value ?? ""
      : undefined;
  const predefinedOptions = useMemo(() => {
    const values = selectedEntity?.predefinedTypeValues ?? [];
    const ensureUserDefined = values.includes("USERDEFINED") ? values : [...values, "USERDEFINED"];
    return ensureUserDefined.length ? ensureUserDefined : ["USERDEFINED"];
  }, [selectedEntity]);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [customGroupNames, setCustomGroupNames] = useState<Record<string, string>>({});
  const [customGroupErrors, setCustomGroupErrors] = useState<Record<string, string>>({});
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [selectedProperties, setSelectedProperties] = useState<Set<string>>(new Set());
  // Ref pro uložení aktuálních hodnot selectedGroups a selectedProperties pro mazání
  const selectedGroupsRef = useRef<Set<string>>(new Set());
  const selectedPropertiesRef = useRef<Set<string>>(new Set());
  
  // Synchronizovat ref s state
  useEffect(() => {
    selectedGroupsRef.current = selectedGroups;
  }, [selectedGroups]);
  
  useEffect(() => {
    selectedPropertiesRef.current = selectedProperties;
  }, [selectedProperties]);

  // Ref pro uložení onChange callbacku, aby se nemusel přidávat do závislostí
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Vyčistit propertyName, které obsahují _NEW_ nebo se shodují s psetName
  useEffect(() => {
    const needsCleanup = object.requirements.properties.some((prop) => {
      const propPropertyName = prop.propertyName || "";
      const propPsetName = prop.psetName || "";
      return propPropertyName.startsWith("_NEW_") || propPropertyName === propPsetName;
    });

    if (needsCleanup) {
      const next = {
        ...object.requirements,
        attributes: [...object.requirements.attributes],
        properties: object.requirements.properties.map((prop) => {
          const propPropertyName = prop.propertyName || "";
          const propPsetName = prop.psetName || "";
          if (propPropertyName.startsWith("_NEW_") || propPropertyName === propPsetName) {
            return { ...prop, propertyName: "" };
          }
          return prop;
        }),
        relations: [...object.requirements.relations],
        classifications: [...object.requirements.classifications],
        materials: [...object.requirements.materials],
      };
      onChangeRef.current({ ...object, requirements: next });
    }
  }, [object.requirements.properties, object]);

  const groupKey = (source: PropertyRequirement["source"], psetName?: string) => `${source}:${psetName || "(custom)"}`;

  const isGroupAllowed = (source: PropertyRequirement["source"], psetName?: string) => {
    if (source === "CUSTOM") return true;
    if (!psetName || !selectedEntity) return false;
    const list = source === "PSET" ? allowedPsets : allowedQtos;
    return list.some((p) => p.name === psetName);
  };

  const getSchemaDefs = (source: PropertyRequirement["source"], psetName: string | undefined) => {
    if (!schema || !isGroupAllowed(source, psetName)) return [];
    const rawDefs =
      source === "PSET"
        ? schema.psets[psetName ?? ""]?.properties ?? []
        : source === "QTO"
          ? schema.qtos[psetName ?? ""]?.quantities ?? []
          : [];
    const seen = new Set<string>();
    return rawDefs.filter((d) => {
      if (seen.has(d.name)) return false;
      seen.add(d.name);
      return true;
    });
  };

  const propertyGroups = useMemo(() => {
    const map = new Map<string, { key: string; source: PropertyRequirement["source"]; psetName?: string; properties: PropertyRequirement[] }>();
    object.requirements.properties.forEach((prop) => {
      const key = groupKey(prop.source, prop.psetName);
      if (!map.has(key)) {
        map.set(key, { key, source: prop.source, psetName: prop.psetName, properties: [] });
      }
      map.get(key)!.properties.push(prop);
    });
    return Array.from(map.values());
  }, [object.requirements.properties]);

  const propertyOptionsForGroup = (
    source: PropertyRequirement["source"],
    psetName: string | undefined,
    currentId?: string,
  ) => {
    const defs = getSchemaDefs(source, psetName);
    if (!defs.length) return defs;
    const used = new Set(
      object.requirements.properties
        .filter((p) => p.id !== currentId && p.source === source && (p.psetName || "") === (psetName || ""))
        .map((p) => p.propertyName),
    );
    return defs.filter((d) => !used.has(d.name));
  };

  const normalizeAssignment = (item: any) => {
    if (!item) return { name: "" };
    if (typeof item === "string") return { name: item as string, forPredefinedType: undefined as string | undefined };
    return { name: item.name as string, forPredefinedType: item.forPredefinedType as string | undefined };
  };

  const allowedPsets = useMemo(() => {
    if (!selectedEntity) return [];
    return (selectedEntity.standardPsets || [])
      .map((p) => normalizeAssignment(p))
      .filter((p) => !p.forPredefinedType || (selectedPredefinedValue && p.forPredefinedType === selectedPredefinedValue));
  }, [selectedEntity, selectedPredefinedValue]);

  const allowedQtos = useMemo(() => {
    if (!selectedEntity) return [];
    return (selectedEntity.standardQtoSets || [])
      .map((q) => normalizeAssignment(q))
      .filter((q) => !q.forPredefinedType || (selectedPredefinedValue && q.forPredefinedType === selectedPredefinedValue));
  }, [selectedEntity, selectedPredefinedValue]);

  const updateObject = (partial: Partial<ProjectObject>) => onChange({ ...object, ...partial });

  const updateRequirements = useCallback((updater: (requirements: ProjectObject["requirements"]) => void) => {
    const next = {
      ...object.requirements,
      attributes: [...object.requirements.attributes],
      properties: [...object.requirements.properties],
      relations: [...object.requirements.relations],
      classifications: [...object.requirements.classifications],
      materials: [...object.requirements.materials],
    };
    updater(next);
    // Vždy vytvořit nové pole pro properties (pro React re-render)
    next.properties = [...next.properties];
    onChangeRef.current({ ...object, requirements: next });
  }, [object]);

  const handlePredefinedChange = (value: string) => {
    if (!value) {
      updateObject({ predefinedType: { mode: "NONE" } });
      return;
    }
    if (value === "USERDEFINED") {
      updateObject({ predefinedType: { mode: "USERDEFINED", value: "" } });
    } else {
      updateObject({ predefinedType: { mode: "ENUM", value } });
    }
  };

  const addAttribute = () => {
    updateRequirements((reqs) => {
      reqs.attributes.push({
        id: makeId(),
        attribute: "Name",
        required: true,
        constraint: "FILLED",
        value: "",
        extensions: {},
        phases: [],
      });
    });
  };

  const addPropertyGroup = (source: PropertyRequirement["source"]) => {
    // Pro novou skupinu vytvoříme vlastnost s dočasným unikátním identifikátorem v psetName
    // Tím zajistíme, že každá nová skupina bude samostatná
    // Uživatel pak vybere název ze selectu, což nahradí tento dočasný identifikátor
    const tempId = `_NEW_${makeId()}`;
    updateRequirements((reqs) => {
      reqs.properties.push({
        id: makeId(),
        source,
        psetName: tempId,
        propertyName: "",
        dataType: schema?.dataTypes?.[0] ?? "IfcText",
        required: true,
        occurrence: "optional",
        constraint: "FILLED",
        value: "",
        unit: "",
        extensions: {},
        phases: [],
      });
    });
  };

  const addPropertyToGroup = (groupKeyValue: string) => {
    const group = propertyGroups.find((g) => g.key === groupKeyValue);
    if (!group) return;
    // Pro custom skupiny a dočasné skupiny vždy povolíme přidání vlastnosti
    const isTempGroup = group.psetName?.startsWith("_NEW_");
    if (group.source !== "CUSTOM" && !isTempGroup && !isGroupAllowed(group.source, group.psetName)) return;
    const options = propertyOptionsForGroup(group.source, group.psetName);
    const firstUnused = options[0];
    // Pro PSET/QTO skupiny, které ještě nemají vybraný název (dočasné), povolíme přidání vlastnosti s prázdným propertyName
    if (group.source !== "CUSTOM" && !isTempGroup && !firstUnused) return;
    updateRequirements((reqs) => {
      // Pro CUSTOM a dočasné skupiny vždy nastavíme prázdný propertyName
      const newPropertyName = group.source === "CUSTOM" || isTempGroup ? "" : firstUnused?.name ?? "";
      
      reqs.properties.push({
        id: makeId(),
        source: group.source,
        psetName: group.psetName ?? "",
        propertyName: newPropertyName,
        dataType: group.source === "CUSTOM" || isTempGroup ? schema?.dataTypes?.[0] ?? "IfcText" : firstUnused?.dataType ?? schema?.dataTypes?.[0] ?? "IfcText",
        required: true,
        occurrence: "optional",
        constraint: "FILLED",
        value: "",
        unit: group.source === "CUSTOM" || isTempGroup ? "" : firstUnused?.unit ?? "",
        extensions: {},
        phases: [],
      });
    });
  };

  const addAllFromSchema = (groupKeyValue: string) => {
    const group = propertyGroups.find((g) => g.key === groupKeyValue);
    if (!group || group.source === "CUSTOM" || !group.psetName) return;
    // Kontrola, že nejde o dočasnou skupinu
    if (group.psetName.startsWith("_NEW_")) return;
    if (!isGroupAllowed(group.source, group.psetName)) return;
    const defs = propertyOptionsForGroup(group.source, group.psetName);
    if (!defs.length) return;
    updateRequirements((reqs) => {
      defs.forEach((def) => {
        reqs.properties.push({
          id: makeId(),
          source: group.source,
          psetName: group.psetName ?? "",
          propertyName: def.name,
          dataType: def.dataType ?? schema?.dataTypes?.[0] ?? "IfcText",
          required: true,
          occurrence: "optional",
          constraint: "FILLED",
          value: "",
          unit: def.unit ?? "",
          extensions: {},
          phases: [],
        });
      });
    });
  };

  const copyGroup = (groupKeyValue: string) => {
    const group = propertyGroups.find((g) => g.key === groupKeyValue);
    if (!group) return;
    const newName = `${group.psetName || "Custom"}_copy_${makeId().slice(0, 4)}`;
    updateRequirements((reqs) => {
      group.properties.forEach((p) => {
        reqs.properties.push({
          ...p,
          id: makeId(),
          psetName: newName,
        });
      });
    });
  };

  const deleteGroup = (groupKeyValue: string) => {
    updateRequirements((reqs) => {
      // Vytvořit nové pole s filtrovanými vlastnostmi
      const filteredProperties = reqs.properties.filter((p) => groupKey(p.source, p.psetName) !== groupKeyValue);
      reqs.properties = filteredProperties;
    });
  };

  const renameGroup = (groupKeyValue: string, newName: string, isCustomInput = false) => {
    const guessedSource = groupKeyValue.startsWith("PSET")
      ? "PSET"
      : groupKeyValue.startsWith("QTO")
        ? "QTO"
        : "CUSTOM";
    
    // Pro custom input - ulož lokální hodnotu, ale neaktualizuj globální state okamžitě
    if (isCustomInput && guessedSource === "CUSTOM") {
      // Validace: vlastní název nesmí začínat "Qto_" nebo "Pset_"
      const trimmedLower = newName.trim().toLowerCase();
      if (trimmedLower.startsWith("qto_") || trimmedLower.startsWith("pset_")) {
        setCustomGroupErrors((prev) => ({
          ...prev,
          [groupKeyValue]: "Takovýto název není ve vlastní skupině vlastností povolen",
        }));
        return; // Neuložit, pokud začíná zakázaným prefixem
      }
      // Vymazat chybu, pokud je hodnota validní
      setCustomGroupErrors((prev) => {
        const next = { ...prev };
        delete next[groupKeyValue];
        return next;
      });
      setCustomGroupNames((prev) => ({ ...prev, [groupKeyValue]: newName }));
      return;
    }
    
    const trimmed = newName.trim();
    
    // Validace pro custom: nesmí začínat "Qto_" nebo "Pset_"
    if (guessedSource === "CUSTOM") {
      if (trimmed.toLowerCase().startsWith("qto_") || trimmed.toLowerCase().startsWith("pset_")) {
        return; // Neuložit
      }
    }
    
    if (trimmed && !isGroupAllowed(guessedSource as PropertyRequirement["source"], trimmed)) return;
    updateRequirements((reqs) => {
      reqs.properties = reqs.properties.map((p) => {
        if (groupKey(p.source, p.psetName) !== groupKeyValue) return p;
        const updated = { ...p, psetName: trimmed };
        if (p.source === "CUSTOM") {
          // Vymazat lokální hodnotu a chybu po úspěšné aktualizaci
          setCustomGroupNames((prev) => {
            const next = { ...prev };
            delete next[groupKeyValue];
            return next;
          });
          setCustomGroupErrors((prev) => {
            const next = { ...prev };
            delete next[groupKeyValue];
            return next;
          });
          return updated;
        }
        const options = propertyOptionsForGroup(p.source, trimmed, p.id);
        // Pokud je propertyName prázdný, ponecháme ho prázdný - uživatel si vybere sám
        if (!updated.propertyName || updated.propertyName === "") {
          return updated;
        }
        // Pouze pokud propertyName není prázdný a není validní, nastavíme první dostupnou hodnotu
        const stillValid = options.some((d) => d.name === updated.propertyName);
        if (!stillValid) {
          const first = options[0];
          return {
            ...updated,
            propertyName: first?.name ?? "",
            dataType: first?.dataType ?? updated.dataType,
            unit: first?.unit ?? updated.unit,
          };
        }
        return updated;
      });
    });
  };

  const handleCustomGroupBlur = (groupKeyValue: string) => {
    const localValue = customGroupNames[groupKeyValue];
    if (localValue !== undefined) {
      renameGroup(groupKeyValue, localValue, false); // Uložit trimnutou hodnotu při blur
    }
  };

  const toggleGroupSelection = (groupKey: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const togglePropertySelection = (propertyId: string) => {
    setSelectedProperties((prev) => {
      const next = new Set(prev);
      if (next.has(propertyId)) {
        next.delete(propertyId);
      } else {
        next.add(propertyId);
      }
      return next;
    });
  };

  const selectAllGroups = () => {
    const allGroupKeys = propertyGroups.map((g) => g.key);
    setSelectedGroups(new Set(allGroupKeys));
  };

  const deleteSelectedItems = () => {
    // Získat aktuální hodnoty z ref (vždy aktuální)
    const groupKeysToDelete = Array.from(selectedGroupsRef.current);
    const propertyIdsToDelete = Array.from(selectedPropertiesRef.current);
    
    // Smazat vlastnosti
    updateRequirements((reqs) => {
      // Vytvořit nové pole s filtrovanými vlastnostmi (smazat označené skupiny i jednotlivé vlastnosti)
      const filteredProperties = reqs.properties.filter(
        (p) => !groupKeysToDelete.includes(groupKey(p.source, p.psetName)) && !propertyIdsToDelete.has(p.id)
      );
      reqs.properties = filteredProperties;
    });
    
    // Vyčistit označení
    setSelectedGroups(new Set());
    setSelectedProperties(new Set());
  };

  const toggleGroup = (groupKeyValue: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupKeyValue]: !(prev[groupKeyValue] ?? true) }));
  };

  const addRelation = () => {
    updateRequirements((reqs) => {
      reqs.relations.push({
        id: makeId(),
        relationType: "IFCRELAGGREGATES",
        targetType: "",
        minCardinality: 0,
        maxCardinality: 1,
        note: "",
        extensions: {},
        phases: [],
      });
    });
  };

  const addClassification = () => {
    updateRequirements((reqs) => {
      reqs.classifications.push({
        id: makeId(),
        classificationId: "",
        system: "",
        identification: "",
        name: "",
        readOnly: false,
        description: "",
        extensions: {},
        phases: [],
      });
    });
  };

  const addMaterial = () => {
    updateRequirements((reqs) => {
      reqs.materials.push({
        id: makeId(),
        required: false,
        materialType: undefined,
        note: "",
        extensions: {},
        phases: [],
      });
    });
  };

  const updatePropertyField = (id: string, patch: Partial<PropertyRequirement>) => {
    updateRequirements((reqs) => {
      const idx = reqs.properties.findIndex((p) => p.id === id);
      if (idx >= 0) {
        let next = { ...reqs.properties[idx], ...patch };
        
        // Zajistíme, že propertyName nikdy nebude obsahovat psetName (zejména pro dočasné skupiny)
        const isTempPsetName = next.psetName?.startsWith("_NEW_");
        
        // Pokud propertyName obsahuje _NEW_ nebo se shoduje s psetName, vždy nastav prázdný string
        if (next.propertyName?.startsWith("_NEW_") || next.propertyName === next.psetName) {
          next.propertyName = "";
        }
        
        // Pokud je to dočasná skupina a propertyName není prázdné, ale obsahuje něco divného, vyčisti to
        if (isTempPsetName && next.propertyName && next.propertyName !== "" && next.propertyName === next.psetName) {
          next.propertyName = "";
        }
        
        const isSchemaBound = next.source === "PSET" || next.source === "QTO";
        const key = groupKey(next.source, next.psetName);

        if (isSchemaBound && (patch.psetName !== undefined || patch.propertyName !== undefined)) {
          const duplicateName =
            patch.propertyName !== undefined &&
            reqs.properties.some(
              (p) =>
                p.id !== id &&
                groupKey(p.source, p.psetName) === key &&
                p.propertyName === patch.propertyName,
            );
          if (duplicateName) return;

          if (patch.psetName !== undefined) {
            const options = propertyOptionsForGroup(next.source, next.psetName, id);
            // Pokud je propertyName prázdný, ponecháme ho prázdný - uživatel si vybere sám
            if (!next.propertyName || next.propertyName === "") {
              // Pouze aktualizujeme dataType a unit, pokud je to vhodné, ale propertyName zůstane prázdný
            } else {
              // Pouze pokud propertyName není prázdný a není validní, nastavíme první dostupnou hodnotu
              const stillValid = options.some((d) => d.name === next.propertyName);
              if (!stillValid) {
                const first = options[0];
                next = {
                  ...next,
                  propertyName: first?.name ?? "",
                  dataType: first?.dataType ?? next.dataType,
                  unit: first?.unit ?? next.unit,
                };
              }
            }
          }

          if (patch.propertyName !== undefined) {
            const def = getSchemaDefs(next.source, next.psetName).find((d) => d.name === patch.propertyName);
            if (def) {
              next = { ...next, dataType: def.dataType ?? next.dataType, unit: def.unit ?? "" };
            }
          }
        }

        reqs.properties[idx] = next;
      }
    });
  };

  const updateRelationField = (id: string, patch: Partial<RelationRequirement>) => {
    updateRequirements((reqs) => {
      const idx = reqs.relations.findIndex((p) => p.id === id);
      if (idx >= 0) reqs.relations[idx] = { ...reqs.relations[idx], ...patch };
    });
  };

  const removeRequirement = (type: keyof ProjectObject["requirements"], id: string) => {
    updateRequirements((reqs) => {
      reqs[type] = reqs[type].filter((item) => item.id !== id) as any;
    });
  };

  // Filtrovat pouze IFC datové typy (začínají na "Ifc")
  const baseDataTypes = useMemo(() => {
    const allTypes = schema?.dataTypes ?? ["IfcLabel", "IfcText", "IfcIdentifier", "IfcBoolean", "IfcInteger", "IfcReal", "IfcDate", "IfcDateTime", "IfcTime", "IfcDuration"];
    return allTypes.filter((dt) => dt.startsWith("Ifc"));
  }, [schema?.dataTypes]);
  
  const getDataTypeOptionsForProp = (prop: PropertyRequirement) => {
    // Pokud má vlastnost datový typ, který není v seznamu, přidat ho (ale pouze pokud začíná na "Ifc")
    if (prop.dataType && !baseDataTypes.includes(prop.dataType)) {
      // Pokud typ začíná na "Ifc", přidat ho, jinak ignorovat
      if (prop.dataType.startsWith("Ifc")) {
        return [prop.dataType, ...baseDataTypes];
      }
    }
    return baseDataTypes;
  };

  const getPropertyDefinition = (prop: PropertyRequirement) => {
    if (prop.source === "CUSTOM" || !prop.psetName || !prop.propertyName) return undefined;
    const defs = getSchemaDefs(prop.source, prop.psetName);
    return defs.find((d) => d.name === prop.propertyName);
  };

  const getEnumAllowedValues = (prop: PropertyRequirement): string[] | undefined => {
    // Only restrict values for properties from IFC schema (PSET/QTO), not CUSTOM
    if (prop.source === "CUSTOM") return undefined;
    
    const def = getPropertyDefinition(prop);
    // If property definition has allowedValues from IFC XML schema, use them
    if (def?.allowedValues && def.allowedValues.length > 0) {
      return def.allowedValues;
    }
    
    return undefined;
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="mb-2 text-lg font-semibold text-slate-800">Identifikační údaje</div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">Entita</div>
              <DocLink href={getIfcDocUrl(object.ifcEntity)} label={object.ifcEntity ?? ""} />
            </div>
            <div className="mb-2 text-xs text-slate-500">{node.description || node.code}</div>
            <div className="flex flex-col gap-2">
              <div>
                <label className="text-xs text-slate-600">IfcEntity</label>
                <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={object.ifcEntity} onChange={(e) => updateObject({ ifcEntity: e.target.value })}>
                  <option value="">-- Vyberte entitu --</option>
                  {entities.map((ent) => (
                    <option key={ent} value={ent}>
                      {ent}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-600">PredefinedType</label>
                <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={object.predefinedType.mode === "NONE" ? "" : object.predefinedType.value ?? ""} onChange={(e) => handlePredefinedChange(e.target.value)}>
                  <option value="">-- Není definováno --</option>
                  {predefinedOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                {object.predefinedType.mode === "USERDEFINED" && (
                  <input
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    placeholder="Zadejte vlastní typ"
                    value={object.predefinedType.value ?? ""}
                    onChange={(e) => updateObject({ predefinedType: { mode: "USERDEFINED", value: e.target.value } })}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">Klasifikace</div>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Záznamy IfcClassificationReference</span>
              <button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100" onClick={addClassification}>
                Přidat klasifikaci
              </button>
            </div>
            <div className="mt-2 max-h-40 overflow-auto rounded border border-slate-200 bg-white">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500">
                  <tr>
                    <th className="px-2 py-1">Systém</th>
                    <th className="px-2 py-1">Identifikace</th>
                    <th className="px-2 py-1">Název</th>
                    <th className="px-2 py-1">Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {object.requirements.classifications.map((cls) => (
                    <tr key={cls.id} className="border-t border-slate-200">
                      <td className="px-2 py-1">
                        <input
                          className="w-full rounded border border-slate-200 px-2 py-1"
                          value={cls.system}
                          onChange={(e) =>
                            updateRequirements((reqs) => {
                              reqs.classifications = reqs.classifications.map((c) => (c.id === cls.id ? { ...c, system: e.target.value } : c));
                            })
                          }
                          disabled={cls.readOnly}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-full rounded border border-slate-200 px-2 py-1"
                          value={cls.identification ?? cls.code ?? ""}
                          onChange={(e) =>
                            updateRequirements((reqs) => {
                              reqs.classifications = reqs.classifications.map((c) => (c.id === cls.id ? { ...c, identification: e.target.value, code: e.target.value } : c));
                            })
                          }
                          disabled={cls.readOnly}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-full rounded border border-slate-200 px-2 py-1"
                          value={cls.name}
                          onChange={(e) =>
                            updateRequirements((reqs) => {
                              reqs.classifications = reqs.classifications.map((c) => (c.id === cls.id ? { ...c, name: e.target.value } : c));
                            })
                          }
                          disabled={cls.readOnly}
                        />
                      </td>
                      <td className="px-2 py-1 text-right">
                        {!cls.readOnly && (
                          <button className="text-xs text-red-600 hover:underline" onClick={() => removeRequirement("classifications", cls.id)}>
                            Odebrat
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!object.requirements.classifications.length && (
                    <tr>
                      <td className="px-2 py-2 text-slate-500" colSpan={4}>
                        Žádné klasifikace.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center border-b border-slate-200 bg-white px-4">
          {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
            <button
              key={key}
              className={`px-3 py-2 text-sm ${activeTab === key ? "border-b-2 border-indigo-600 font-semibold text-indigo-700" : "text-slate-600 hover:text-slate-800"}`}
              onClick={() => setActiveTab(key)}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-4">
          {activeTab === "attributes" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-800">Atributy</div>
                  <div className="text-xs text-slate-500">Ifc attributes (Name, Description, Tag ...)</div>
                </div>
                <button className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500" onClick={addAttribute}>
                  Přidat atribut
                </button>
              </div>
              <div className="overflow-auto rounded border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Atribut</th>
                      <th className="px-2 py-2">Podmínka</th>
                      <th className="px-2 py-2">Hodnota</th>
                      <th className="px-2 py-2">Fáze</th>
                      <th className="px-2 py-2 text-right">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {object.requirements.attributes.map((attr) => (
                      <tr key={attr.id} className="border-t border-slate-200">
                        <td className="px-2 py-2">
                          <select
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            value={attr.attribute}
                            onChange={(e) =>
                              updateRequirements((reqs) => {
                                reqs.attributes = reqs.attributes.map((a) => (a.id === attr.id ? { ...a, attribute: e.target.value } : a));
                              })
                            }
                          >
                            {["Name", "Description", "Tag", "ObjectType", "GlobalId"].map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <select
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            value={attr.constraint}
                            onChange={(e) =>
                              updateRequirements((reqs) => {
                                reqs.attributes = reqs.attributes.map((a) => (a.id === attr.id ? { ...a, constraint: e.target.value as any } : a));
                              })
                            }
                          >
                            {["EXISTS", "EQUALS", "PATTERN", "ENUM"].map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            value={attr.value ?? ""}
                            onChange={(e) =>
                              updateRequirements((reqs) => {
                                reqs.attributes = reqs.attributes.map((a) => (a.id === attr.id ? { ...a, value: e.target.value } : a));
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <PhaseSelector
                            phases={phases}
                            value={attr.phases}
                            onChange={(ids) =>
                              updateRequirements((reqs) => {
                                reqs.attributes = reqs.attributes.map((a) => (a.id === attr.id ? { ...a, phases: ids } : a));
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button className="text-xs text-red-600 hover:underline" onClick={() => removeRequirement("attributes", attr.id)}>
                            Odebrat
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!object.requirements.attributes.length && (
                      <tr>
                        <td className="px-2 py-3 text-sm text-slate-500" colSpan={5}>
                          Žádné atributy nejsou definovány.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "properties" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-slate-800">Vlastnosti (Pset i Qto)</div>
                <button className="rounded border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100" onClick={() => addPropertyGroup("PSET")}>
                  Přidat Pset
                </button>
                <button className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100" onClick={() => addPropertyGroup("QTO")}>
                  Přidat Qto
                </button>
                <button className="rounded border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100" onClick={() => addPropertyGroup("CUSTOM")}>
                  Přidat vlastní
                </button>
                {propertyGroups.length > 0 && (
                  <>
                    <div className="h-4 w-px bg-slate-300" />
                    <button
                      className="rounded border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      onClick={selectAllGroups}
                    >
                      Označit všechny skupiny
                    </button>
                    {(selectedGroups.size > 0 || selectedProperties.size > 0) && (
                      <button
                        className="rounded border border-red-300 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                        onClick={deleteSelectedItems}
                      >
                        Smazat označené ({selectedGroups.size + selectedProperties.size})
                      </button>
                    )}
                  </>
                )}
              </div>

              {propertyGroups.length === 0 && (
                <div className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                  Žádné vlastnosti. Přidejte skupinu Pset/Qto nebo vlastní.
                </div>
              )}

              <div className="space-y-3 pr-1">
                {propertyGroups.map((group) => {
                const expanded = expandedGroups[group.key] ?? true;
                const isSchemaBound = group.source !== "CUSTOM";
                const schemaOptions = group.source === "PSET" ? allowedPsets : allowedQtos;
                const propertyOptions = (currentId?: string) =>
                  isSchemaBound ? propertyOptionsForGroup(group.source, group.psetName, currentId) : [];
                const isTempGroup = group.psetName?.startsWith("_NEW_");
                const displayPsetName = isTempGroup ? "" : (group.psetName ?? "");
                const headerLabel =
                  group.psetName && group.psetName.length && !isTempGroup ? group.psetName : group.source === "CUSTOM" ? "Vlastní skupina" : "Nová skupina";
                  const docHref =
                    isSchemaBound && group.psetName && !isTempGroup
                      ? `https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/lexical/${group.psetName}.htm`
                      : undefined;

                const groupColors = {
                  PSET: {
                    border: "border-blue-300",
                    badge: "bg-blue-100 text-blue-800",
                    rowBorder: "border-l-4 border-blue-400",
                  },
                  QTO: {
                    border: "border-emerald-300",
                    badge: "bg-emerald-100 text-emerald-800",
                    rowBorder: "border-l-4 border-emerald-400",
                  },
                  CUSTOM: {
                    border: "border-amber-300",
                    badge: "bg-amber-100 text-amber-800",
                    rowBorder: "border-l-4 border-amber-400",
                  },
                };
                const colors = groupColors[group.source] || groupColors.CUSTOM;

                return (
                  <div key={group.key} className={`rounded border-2 ${colors.border} bg-white shadow-sm`}>
                    <div className={`flex items-center justify-between border-b ${colors.border} px-3 py-2`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={selectedGroups.has(group.key)}
                          onChange={() => toggleGroupSelection(group.key)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          className="flex items-center justify-center rounded border border-slate-300 p-1.5 hover:bg-slate-50"
                          onClick={() => toggleGroup(group.key)}
                          title={expanded ? "Skrýt" : "Zobrazit"}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`h-4 w-4 text-slate-600 transition-transform ${expanded ? "rotate-180" : ""}`}
                          >
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </button>
                        <span className={`rounded px-2 py-1 text-[11px] font-semibold uppercase ${colors.badge}`}>
                          {group.source === "PSET" ? "Pset dle IFC" : group.source === "QTO" ? "Qto dle IFC" : "Vlastní"}
                        </span>
                        {group.source === "CUSTOM" ? (
                          <div className="flex items-center gap-2">
                            <input
                              className={`rounded border px-2 py-1 text-sm ${
                                customGroupErrors[group.key] ? "border-red-300 bg-red-50" : "border-slate-300"
                              }`}
                              value={customGroupNames[group.key] !== undefined ? customGroupNames[group.key] : (group.psetName && !group.psetName.startsWith("_NEW_") ? group.psetName : "")}
                              onChange={(e) => renameGroup(group.key, e.target.value, true)}
                              onBlur={() => handleCustomGroupBlur(group.key)}
                              placeholder="Vyplnit název"
                            />
                            {customGroupErrors[group.key] && (
                              <span className="text-xs text-red-600 whitespace-nowrap">{customGroupErrors[group.key]}</span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <select
                              className="rounded border border-slate-300 px-2 py-1 text-sm"
                              value={displayPsetName}
                              onChange={(e) => renameGroup(group.key, e.target.value)}
                            >
                              <option value="">Vyplnit název</option>
                              {!schemaOptions.some((o) => o.name === group.psetName) && group.psetName && !isTempGroup && (
                                <option value={group.psetName}>{group.psetName}</option>
                              )}
                              {schemaOptions.map((item) => (
                                <option key={item.name} value={item.name}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                            <DocLink href={docHref} label={group.psetName ?? ""} />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button className="rounded border border-slate-300 px-2 py-1 text-[11px] hover:bg-slate-50" onClick={() => addPropertyToGroup(group.key)}>
                          Přidat vlastnost
                        </button>
                        {isSchemaBound && displayPsetName && displayPsetName.length > 0 && (
                          <button className="rounded border border-slate-300 px-2 py-1 text-[11px] hover:bg-slate-50" onClick={() => addAllFromSchema(group.key)}>
                            Přidat všechny dle IFC
                          </button>
                        )}
                        <button className="rounded border border-red-300 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50" onClick={() => deleteGroup(group.key)}>
                          Smazat skupinu
                        </button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="overflow-auto px-3 py-2">
                        {group.properties.length === 0 && (
                          <div className="rounded border border-dashed border-slate-200 p-2 text-xs text-slate-600">
                            Skupina je prázdná. Přidejte vlastnost.
                          </div>
                        )}
                        {group.properties.length > 0 && (
                          <table className="min-w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                              <tr>
                                <th className="w-8 px-2 py-2"></th>
                                <th className="px-2 py-2">Vlastnost</th>
                                <th className="px-2 py-2">Datový typ</th>
                                <th className="px-2 py-2">Výskyt</th>
                                <th className="px-2 py-2">
                                  <div className="flex items-center gap-1">
                                    <span>Omezení</span>
                                    <a 
                                      href="https://github.com/buildingSMART/IDS/blob/development/Documentation/UserManual/restrictions.md" 
                                      target="_blank" 
                                      rel="noreferrer" 
                                      className="text-slate-500 hover:text-indigo-600" 
                                      title="Otevřít dokumentaci k omezením"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <svg aria-hidden xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
                                        <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3ZM5 5h5v2H7v10h10v-3h2v5H5V5Z" />
                                      </svg>
                                    </a>
                                  </div>
                                </th>
                                <th className="px-2 py-2">Hodnota</th>
                                <th className="px-2 py-2">Jednotka</th>
                                <th className="px-2 py-2">Poznámka</th>
                                <th className="px-2 py-2">Fáze</th>
                                <th className="px-2 py-2 text-right">Akce</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.properties.map((prop) => (
                                <tr key={prop.id} className={`border-t border-slate-200 ${colors.rowBorder}`}>
                                  <td className="px-2 py-2">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                      checked={selectedProperties.has(prop.id)}
                                      onChange={() => togglePropertySelection(prop.id)}
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    {group.source === "CUSTOM" || isTempGroup ? (
                                      <input
                                        className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                        value={(() => {
                                          const propPropertyName = prop.propertyName || "";
                                          const propPsetName = prop.psetName || "";
                                          
                                          // Vždy zobraz prázdný string, pokud propertyName obsahuje _NEW_ nebo se shoduje s psetName
                                          if (propPropertyName.startsWith("_NEW_") || propPropertyName === propPsetName) {
                                            return "";
                                          }
                                          return propPropertyName;
                                        })()}
                                        onChange={(e) => {
                                          const newValue = e.target.value;
                                          // Pokud uživatel zadá text začínající na _NEW_, ignoruj to a nastav prázdný string
                                          if (newValue.startsWith("_NEW_")) {
                                            updatePropertyField(prop.id, { propertyName: "" });
                                          } else {
                                            updatePropertyField(prop.id, { propertyName: newValue });
                                          }
                                        }}
                                        placeholder="Vlastnost"
                                      />
                                    ) : (
                                      <select
                                        className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                        value={prop.propertyName}
                                        onChange={(e) => updatePropertyField(prop.id, { propertyName: e.target.value })}
                                        disabled={!group.psetName}
                                      >
                                        <option value="">— vybrat —</option>
                                        {propertyOptions(prop.id).map((pdef) => (
                                          <option key={pdef.name} value={pdef.name}>
                                            {pdef.name}
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </td>
                                  <td className="px-2 py-2">
                                    <select
                                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                      value={prop.dataType}
                                      onChange={(e) => updatePropertyField(prop.id, { dataType: e.target.value })}
                                      disabled={group.source !== "CUSTOM"}
                                    >
                                      {getDataTypeOptionsForProp(prop).map((dt) => (
                                        <option key={dt} value={dt}>
                                          {dt}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-2 py-2">
                                    <select 
                                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm" 
                                      value={prop.occurrence ?? "optional"} 
                                      onChange={(e) => updatePropertyField(prop.id, { occurrence: e.target.value as "required" | "prohibited" | "optional" })}
                                    >
                                      <option value="required">Požadováno (required)</option>
                                      <option value="prohibited">Zakázáno (prohibited)</option>
                                      <option value="optional">Možné (optional)</option>
                                    </select>
                                  </td>
                                  <td className="px-2 py-2">
                                    <select 
                                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm" 
                                      value={prop.constraint ?? "FILLED"} 
                                      onChange={(e) => updatePropertyField(prop.id, { constraint: e.target.value as any })}
                                    >
                                      {CONSTRAINT_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-2 py-2">
                                    {(() => {
                                      const isDisabled = prop.constraint === "FILLED" || prop.constraint === undefined;
                                      const isLength = prop.constraint === "LENGTH";
                                      const enumValues = getEnumAllowedValues(prop);
                                      
                                      // Pro LENGTH zobrazit speciální UI pro zadávání délky
                                      if (isLength && !isDisabled) {
                                        // Parsování hodnoty délky
                                        const lengthValue = prop.value ?? "";
                                        const parseLengthValue = (val: string) => {
                                          if (!val) return { type: "exact", exact: "", min: "", max: "" };
                                          if (val.startsWith("min:")) {
                                            return { type: "min", exact: "", min: val.replace("min:", ""), max: "" };
                                          }
                                          if (val.startsWith("max:")) {
                                            return { type: "max", exact: "", min: "", max: val.replace("max:", "") };
                                          }
                                          // Pokud je to jen číslo, je to přesná délka
                                          if (/^\d+$/.test(val)) {
                                            return { type: "exact", exact: val, min: "", max: "" };
                                          }
                                          return { type: "exact", exact: val, min: "", max: "" };
                                        };
                                        
                                        const parsed = parseLengthValue(lengthValue);
                                        // Použít parsed.type jako výchozí, ale při změně selectu se aktualizuje přes prop.value
                                        const currentType = parsed.type;
                                        
                                        // Získat aktuální hodnotu podle typu
                                        const getCurrentValue = () => {
                                          if (currentType === "exact") return parsed.exact;
                                          if (currentType === "min") return parsed.min;
                                          if (currentType === "max") return parsed.max;
                                          return "";
                                        };
                                        
                                        const handleTypeChange = (newType: string) => {
                                          // Při změně typu zachovat číselnou hodnotu pokud existuje, jinak nastavit na 1
                                          const currentValue = getCurrentValue();
                                          const valueToUse = currentValue || "1";
                                          let newValue = "";
                                          if (newType === "exact") {
                                            newValue = valueToUse;
                                          } else if (newType === "min") {
                                            newValue = `min:${valueToUse}`;
                                          } else if (newType === "max") {
                                            newValue = `max:${valueToUse}`;
                                          }
                                          updatePropertyField(prop.id, { value: newValue });
                                        };
                                        
                                        const handleValueChange = (newValue: string) => {
                                          // Pokud je hodnota prázdná, použít 1
                                          const valueToUse = newValue || "1";
                                          let valueToSave = "";
                                          if (currentType === "exact") {
                                            valueToSave = valueToUse;
                                          } else if (currentType === "min") {
                                            valueToSave = `min:${valueToUse}`;
                                          } else if (currentType === "max") {
                                            valueToSave = `max:${valueToUse}`;
                                          }
                                          updatePropertyField(prop.id, { value: valueToSave });
                                        };
                                        
                                        return (
                                          <div className="flex flex-col gap-1">
                                            <select
                                              className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                                              value={currentType}
                                              onChange={(e) => handleTypeChange(e.target.value)}
                                            >
                                              <option value="exact">Přesná délka</option>
                                              <option value="min">Minimální délka</option>
                                              <option value="max">Maximální délka</option>
                                            </select>
                                            <input
                                              type="number"
                                              min="1"
                                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                              value={getCurrentValue() || "1"}
                                              onChange={(e) => handleValueChange(e.target.value)}
                                              placeholder="Počet znaků"
                                            />
                                          </div>
                                        );
                                      }
                                      
                                      // Pro RANGE/Bounds zobrazit speciální UI pro zadávání ohraničení
                                      const isRange = prop.constraint === "RANGE";
                                      if (isRange && !isDisabled) {
                                        // Parsování hodnoty bounds - formát: "min:3:inclusive" nebo "max:10:exclusive" nebo "min:3:inclusive|max:10:inclusive"
                                        const rangeValue = prop.value ?? "";
                                        const parseRangeValue = (val: string) => {
                                          if (!val) return { hasMin: false, min: "", minInclusive: true, hasMax: false, max: "", maxInclusive: true };
                                          
                                          const parts = val.split("|");
                                          let result = { hasMin: false, min: "", minInclusive: true, hasMax: false, max: "", maxInclusive: true };
                                          
                                          parts.forEach(part => {
                                            if (part.startsWith("min:")) {
                                              const minPart = part.replace("min:", "");
                                              const [minVal, inclusive] = minPart.split(":");
                                              result.hasMin = true;
                                              result.min = minVal;
                                              result.minInclusive = inclusive !== "exclusive";
                                            } else if (part.startsWith("max:")) {
                                              const maxPart = part.replace("max:", "");
                                              const [maxVal, inclusive] = maxPart.split(":");
                                              result.hasMax = true;
                                              result.max = maxVal;
                                              result.maxInclusive = inclusive !== "exclusive";
                                            }
                                          });
                                          
                                          return result;
                                        };
                                        
                                        const parsed = parseRangeValue(rangeValue);
                                        
                                        const handleRangeChange = (hasMin: boolean, min: string, minInclusive: boolean, hasMax: boolean, max: string, maxInclusive: boolean) => {
                                          const parts: string[] = [];
                                          if (hasMin && min) {
                                            parts.push(`min:${min}:${minInclusive ? "inclusive" : "exclusive"}`);
                                          }
                                          if (hasMax && max) {
                                            parts.push(`max:${max}:${maxInclusive ? "inclusive" : "exclusive"}`);
                                          }
                                          const newValue = parts.join("|");
                                          if (newValue) {
                                            updatePropertyField(prop.id, { value: newValue });
                                          } else {
                                            updatePropertyField(prop.id, { value: "" });
                                          }
                                        };
                                        
                                        return (
                                          <div className="flex flex-col gap-2">
                                            <div className="flex items-center gap-2">
                                              <input
                                                type="checkbox"
                                                checked={parsed.hasMin}
                                                onChange={(e) => handleRangeChange(e.target.checked, parsed.min, parsed.minInclusive, parsed.hasMax, parsed.max, parsed.maxInclusive)}
                                                className="h-4 w-4"
                                              />
                                              <label className="text-xs text-slate-600">Minimum</label>
                                              {parsed.hasMin && (
                                                <>
                                                  <input
                                                    type="number"
                                                    className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                                                    value={parsed.min}
                                                    onChange={(e) => handleRangeChange(true, e.target.value, parsed.minInclusive, parsed.hasMax, parsed.max, parsed.maxInclusive)}
                                                    placeholder="Hodnota"
                                                  />
                                                  <select
                                                    className="rounded border border-slate-300 px-2 py-1 text-xs"
                                                    value={parsed.minInclusive ? "inclusive" : "exclusive"}
                                                    onChange={(e) => handleRangeChange(true, parsed.min, e.target.value === "inclusive", parsed.hasMax, parsed.max, parsed.maxInclusive)}
                                                  >
                                                    <option value="inclusive">≥ (větší nebo rovno)</option>
                                                    <option value="exclusive">&gt; (větší než)</option>
                                                  </select>
                                                </>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <input
                                                type="checkbox"
                                                checked={parsed.hasMax}
                                                onChange={(e) => handleRangeChange(parsed.hasMin, parsed.min, parsed.minInclusive, e.target.checked, parsed.max, parsed.maxInclusive)}
                                                className="h-4 w-4"
                                              />
                                              <label className="text-xs text-slate-600">Maximum</label>
                                              {parsed.hasMax && (
                                                <>
                                                  <input
                                                    type="number"
                                                    className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                                                    value={parsed.max}
                                                    onChange={(e) => handleRangeChange(parsed.hasMin, parsed.min, parsed.minInclusive, true, e.target.value, parsed.maxInclusive)}
                                                    placeholder="Hodnota"
                                                  />
                                                  <select
                                                    className="rounded border border-slate-300 px-2 py-1 text-xs"
                                                    value={parsed.maxInclusive ? "inclusive" : "exclusive"}
                                                    onChange={(e) => handleRangeChange(parsed.hasMin, parsed.min, parsed.minInclusive, true, parsed.max, e.target.value === "inclusive")}
                                                  >
                                                    <option value="inclusive">≤ (menší nebo rovno)</option>
                                                    <option value="exclusive">&lt; (menší než)</option>
                                                  </select>
                                                </>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      }
                                      
                                      if (enumValues && enumValues.length > 0) {
                                        return (
                                          <select
                                            className={`w-full rounded border border-slate-300 px-2 py-1 text-sm ${isDisabled ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}`}
                                            value={prop.value ?? ""}
                                            onChange={(e) => updatePropertyField(prop.id, { value: e.target.value })}
                                            disabled={isDisabled}
                                          >
                                            <option value="">— vybrat hodnotu —</option>
                                            {enumValues.map((val) => (
                                              <option key={val} value={val}>
                                                {val}
                                              </option>
                                            ))}
                                          </select>
                                        );
                                      }
                                      return (
                                        <input
                                          className={`w-full rounded border border-slate-300 px-2 py-1 text-sm ${isDisabled ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}`}
                                          value={prop.value ?? ""}
                                          onChange={(e) => updatePropertyField(prop.id, { value: e.target.value })}
                                          disabled={isDisabled}
                                        />
                                      );
                                    })()}
                                  </td>
                                  <td className="px-2 py-2">
                                    <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={prop.unit ?? ""} onChange={(e) => updatePropertyField(prop.id, { unit: e.target.value })} />
                                  </td>
                                  <td className="px-2 py-2">
                                    <input 
                                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm" 
                                      value={prop.note ?? ""} 
                                      onChange={(e) => updatePropertyField(prop.id, { note: e.target.value })}
                                      placeholder="Všeobecný popis" 
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    <PhaseSelector phases={phases} value={prop.phases} onChange={(ids) => updatePropertyField(prop.id, { phases: ids })} />
                                  </td>
                                  <td className="px-2 py-2 text-right">
                                    <button className="text-xs text-red-600 hover:underline" onClick={() => removeRequirement("properties", prop.id)}>
                                      Odebrat
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
                })}
              </div>
            </div>
          )}

          {activeTab === "partOf" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-800">Součástí (PartOf)</div>
                <button className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500" onClick={addRelation}>
                  Přidat vztah
                </button>
              </div>
              <div className="overflow-auto rounded border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Typ relace</th>
                      <th className="px-2 py-2">Cílový typ</th>
                      <th className="px-2 py-2">Min</th>
                      <th className="px-2 py-2">Max</th>
                      <th className="px-2 py-2">Poznámka</th>
                      <th className="px-2 py-2">Fáze</th>
                      <th className="px-2 py-2 text-right">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {object.requirements.relations.map((rel) => (
                      <tr key={rel.id} className="border-t border-slate-200">
                        <td className="px-2 py-2">
                          <select
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            value={rel.relationType}
                            onChange={(e) => updateRelationField(rel.id, { relationType: e.target.value as any })}
                          >
                            {relationTypeOptions.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={rel.targetType ?? ""} onChange={(e) => updateRelationField(rel.id, { targetType: e.target.value })} />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={rel.minCardinality ?? 0} onChange={(e) => updateRelationField(rel.id, { minCardinality: Number(e.target.value) })} />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={rel.maxCardinality ?? 1} onChange={(e) => updateRelationField(rel.id, { maxCardinality: Number(e.target.value) })} />
                        </td>
                        <td className="px-2 py-2">
                          <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={rel.note ?? ""} onChange={(e) => updateRelationField(rel.id, { note: e.target.value })} />
                        </td>
                        <td className="px-2 py-2">
                          <PhaseSelector phases={phases} value={rel.phases} onChange={(ids) => updateRelationField(rel.id, { phases: ids })} />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button className="text-xs text-red-600 hover:underline" onClick={() => removeRequirement("relations", rel.id)}>
                            Odebrat
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!object.requirements.relations.length && (
                      <tr>
                        <td className="px-2 py-3 text-sm text-slate-500" colSpan={7}>
                          Žádné vztahy.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "material" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-800">Materiál</div>
                <button className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500" onClick={addMaterial}>
                  Přidat materiál
                </button>
              </div>
              <div className="overflow-auto rounded border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Požadováno</th>
                      <th className="px-2 py-2">Typ</th>
                      <th className="px-2 py-2">Poznámka</th>
                      <th className="px-2 py-2">Fáze</th>
                      <th className="px-2 py-2 text-right">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {object.requirements.materials.map((mat) => (
                      <tr key={mat.id} className="border-t border-slate-200">
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={mat.required}
                            onChange={(e) =>
                              updateRequirements((reqs) => {
                                reqs.materials = reqs.materials.map((m) => (m.id === mat.id ? { ...m, required: e.target.checked } : m));
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <select
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            value={mat.materialType ?? ""}
                            onChange={(e) =>
                              updateRequirements((reqs) => {
                                reqs.materials = reqs.materials.map((m) => (m.id === mat.id ? { ...m, materialType: e.target.value as any } : m));
                              })
                            }
                          >
                            <option value="">--</option>
                            {["SINGLE", "LAYER", "PROFILE", "CONSTITUENT"].map((mt) => (
                              <option key={mt} value={mt}>
                                {mt}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            value={mat.note ?? ""}
                            onChange={(e) =>
                              updateRequirements((reqs) => {
                                reqs.materials = reqs.materials.map((m) => (m.id === mat.id ? { ...m, note: e.target.value } : m));
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <PhaseSelector
                            phases={phases}
                            value={mat.phases}
                            onChange={(ids) =>
                              updateRequirements((reqs) => {
                                reqs.materials = reqs.materials.map((m) => (m.id === mat.id ? { ...m, phases: ids } : m));
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button className="text-xs text-red-600 hover:underline" onClick={() => removeRequirement("materials", mat.id)}>
                            Odebrat
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!object.requirements.materials.length && (
                      <tr>
                        <td className="px-2 py-3 text-sm text-slate-500" colSpan={5}>
                          Žádné materiálové požadavky.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "ids" && (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-slate-800">IDS náhled</div>
              <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <div className="font-semibold">Shrnutí facet</div>
                <ul className="list-disc pl-5">
                  <li>Entity: {object.ifcEntity || "není vybrána"}</li>
                  <li>PredefinedType: {object.predefinedType.value ?? "není vybrán"}</li>
                  <li>Atributy: {object.requirements.attributes.length}</li>
                  <li>Vlastnosti: {object.requirements.properties.length}</li>
                  <li>Součástí (PartOf): {object.requirements.relations.length}</li>
                  <li>Materiál: {object.requirements.materials.length}</li>
                  <li>Klasifikace: {object.requirements.classifications.length}</li>
                </ul>
                <div className="mt-3 text-xs text-slate-500">
                  Základní validace: Vyberte IfcEntity pro plnou kompatibilitu s IDS. Typy relací jsou omezeny dle IDS schématu.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
