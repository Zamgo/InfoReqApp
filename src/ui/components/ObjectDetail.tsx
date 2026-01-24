import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClassificationNode } from "../../classification/types";
import type { SchemaIndex } from "../../schema/types";
import { makeId } from "../../utils/id";
import type { CodeList, MaterialRequirement, Phase, ProjectObject, PropertyRequirement, RelationRequirement } from "../../project/types";
import { ENUM_CODELIST_ID_KEY, formatEnumValues, parseEnumValues } from "../../project/enumeration";

type TabKey = "attributes" | "properties" | "partOf" | "material" | "classification" | "ids";

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
  codeLists: CodeList[];
  onSaveEnumAsCodeList: (opts: { objectCode: string; propertyId: string; name: string; values: string[]; link: boolean }) => void;
}

const TAB_LABELS: Record<TabKey, string> = {
  attributes: "Atributy",
  properties: "Vlastnosti",
  partOf: "Součástí (PartOf)",
  material: "Materiál",
  classification: "Klasifikace",
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

// Czech help text for relation types (displayed in modal)
const RELATION_TYPES_HELP_TEXT = `Vztah IFCRELAGGREGATES popisuje, jak lze více menších dílčích objektů agregovat do jednoho většího objektu. Například několik podlaží budovy tvoří jednu budovu. Jiným příkladem je deska, kterou tvoří nosníky, podlahové desky a spoje. Nebo sestava, kterou tvoří konzoly, sloupky (mullions) a ocelové plechy.

Vztah IFCRELASSIGNSTOGROUP popisuje, jak lze více objektů seskupit do jedné kolekce objektů pro libovolný účel užití. Například potrubí, vzduchotechnické jednotky (AHU), ventilátory a žaluzie mohou být seskupeny do jednoho distribučního systému. Jiným příkladem je seskupení kabelů, rozvaděčů a zásuvek do jednoho elektrického okruhu. Případně mohou být prostory seskupeny do zón nebo udržovatelná aktiva seskupena do inventáře.

Vztah IFCRELCONTAINEDINSPATIALSTRUCTURE popisuje, jak jsou jednotlivé objekty umístěny v určitém prostoru nebo lokalitě. Například čerpadlo může být umístěno v prostoru, sloup může být umístěn v podlaží budovy (např. 2. NP) nebo prvky městského mobiliáře mohou být umístěny na stavebním pozemku. Každý objekt musí mít v IFC právě jeden primární kontejner prostorové struktury, i když může být zároveň odkazován z více umístění (například sloup procházející více podlažími). Tento vztah se vždy vztahuje pouze k primárnímu umístění.

Vztah IFCRELNESTS popisuje, jak může být fyzický objekt připojen k většímu „hostitelskému" objektu, typicky prostřednictvím fyzického spojení, jako je předvrtaný otvor nebo připojovací svorka. Při pohybu hostitelského objektu se s ním pohybují i všechny vnořené (připojené) objekty.

Vztah IFCRELVOIDSELEMENT popisuje, že otvor (void) náleží určitému prvku.

Vztah IFCRELFILLSELEMENT popisuje, jak prvek vyplňuje otvor a stává se jeho součástí.`;

const CONSTRAINT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "FILLED", label: "Žádné" },
  { value: "ENUM", label: "Výčet" },
  { value: "PATTERN", label: "Vzor" },
  { value: "RANGE", label: "Ohraničení" },
  { value: "LENGTH", label: "Délka" },
];

// Mapování IFC atributů na jejich datové typy
const ATTRIBUTE_DATA_TYPES: Record<string, string> = {
  Name: "IfcLabel",
  Description: "IfcText",
  Tag: "IfcIdentifier",
  ObjectType: "IfcLabel",
  GlobalId: "IfcGloballyUniqueId",
  PredefinedType: "IfcLabel",
};

// Omezení pro atributy - stejné jako u vlastností
const ATTRIBUTE_CONSTRAINT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "FILLED", label: "Žádné" },
  { value: "ENUM", label: "Výčet" },
  { value: "PATTERN", label: "Vzor" },
  { value: "RANGE", label: "Ohraničení" },
  { value: "LENGTH", label: "Délka" },
];

// Režimy pro sloupec Kategorie materiálu
const MATERIAL_CATEGORY_MODE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "NONE", label: "Není definováno" },
  { value: "SIMPLE", label: "Jednoduchá hodnota" },
  { value: "ENUM", label: "Výčet" },
];

// Omezení pro materiály - stejná jako u ostatních karet
const MATERIAL_CONSTRAINT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "FILLED", label: "Žádné" },
  { value: "ENUM", label: "Výčet" },
  { value: "PATTERN", label: "Vzor" },
  { value: "RANGE", label: "Ohraničení" },
  { value: "LENGTH", label: "Délka" },
];

// Funkce pro zjištění, zda je omezení povoleno pro datový typ atributu
const isAttributeConstraintAllowed = (attribute: string, constraint: string) => {
  const dataType = ATTRIBUTE_DATA_TYPES[attribute] ?? "IfcLabel";
  return isConstraintAllowedForDataType(dataType, constraint);
};

const isIfcBooleanType = (dataType?: string) => (dataType ?? "").trim().toLowerCase() === "ifcboolean";

const isIfcTextLikeType = (dataType?: string) => {
  const dt = (dataType ?? "").trim().toLowerCase();
  return (
    dt === "ifclabel" ||
    dt === "ifctext" ||
    dt === "ifcidentifier" ||
    dt === "ifcurireference" ||
    dt === "ifcgloballyuniqueid"
  );
};

const isIfcNumericLikeType = (dataType?: string) => {
  const dt = (dataType ?? "").trim().toLowerCase();
  if (!dt) return false;
  if (dt === "ifcinteger" || dt === "ifcreal" || dt === "ifccountmeasure") return true;
  // common IFC measure types
  if (dt.endsWith("measure")) return true;
  // common IFC numeric types
  if (dt.includes("integer") || dt.includes("real") || dt.includes("number")) return true;
  return false;
};

const isConstraintAllowedForDataType = (dataType: string | undefined, constraint: string) => {
  const c = (constraint ?? "").trim().toUpperCase();
  // Always allow "none"
  if (c === "FILLED") return true;
  // IfcBoolean: only "ENUM" makes sense (besides "FILLED")
  if (isIfcBooleanType(dataType)) return c === "ENUM";
  // Text-like: RANGE doesn't make sense
  if (isIfcTextLikeType(dataType)) return c !== "RANGE";
  // Numeric-like: LENGTH doesn't make sense
  if (isIfcNumericLikeType(dataType)) return c !== "LENGTH";
  // Other/sporné typy neomezujeme
  return true;
};

const UNIT_PRESETS: Array<{ value: string; label?: string }> = [
  { value: "", label: "—" },
  { value: "mm" },
  { value: "cm" },
  { value: "m" },
  { value: "m2" },
  { value: "m3" },
  { value: "kg" },
  { value: "t" },
  { value: "N" },
  { value: "kN" },
  { value: "Pa" },
  { value: "kPa" },
  { value: "MPa" },
  { value: "%" },
  { value: "°C" },
  { value: "s" },
  { value: "min" },
  { value: "h" },
  { value: "d" },
];

const isPresetUnit = (unit?: string) => {
  const u = (unit ?? "").trim();
  return UNIT_PRESETS.some((p) => p.value === u);
};

export const ObjectDetail: React.FC<Props> = ({ node, object, schema, onChange, phases, codeLists, onSaveEnumAsCodeList }) => {
  const [activeTab, setActiveTab] = useState<TabKey>("properties");
  const [enumDraftByPropId, setEnumDraftByPropId] = useState<Record<string, string>>({});
  const [enumSaveDialog, setEnumSaveDialog] = useState<null | { propertyId: string; name: string; values: string[]; type?: "property" | "attribute" }>(null);
  const [unitModeByPropId, setUnitModeByPropId] = useState<Record<string, string>>({});
  const [enumDraftByAttrId, setEnumDraftByAttrId] = useState<Record<string, string>>({});
  const [enumDraftByMatId, setEnumDraftByMatId] = useState<Record<string, string>>({});
  const [categoryDraftByMatId, setCategoryDraftByMatId] = useState<Record<string, string>>({});
  const [showRelationHelpModal, setShowRelationHelpModal] = useState(false);

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
  const [selectedAttributes, setSelectedAttributes] = useState<Set<string>>(new Set());
  const [selectedRelations, setSelectedRelations] = useState<Set<string>>(new Set());
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(new Set());
  const [selectedClassifications, setSelectedClassifications] = useState<Set<string>>(new Set());
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

  // Synchronizace PredefinedType mezi kartou IFC entity a atributy
  useEffect(() => {
    const predefinedTypeAttr = object.requirements.attributes.find((a) => a.attribute === "PredefinedType");
    
    // Pokud není nastavena IFC entity nebo je PredefinedType nastaven na NONE, odstraníme atribut
    if (!object.ifcEntity || object.predefinedType.mode === "NONE") {
      if (predefinedTypeAttr) {
        updateRequirements((reqs) => {
          reqs.attributes = reqs.attributes.filter((a) => a.id !== predefinedTypeAttr.id);
        });
      }
      return;
    }

    // Pokud PredefinedType není NONE, musí existovat atribut
    if (!predefinedTypeAttr) {
      // Přidáme nový atribut PredefinedType
      const newAttr: import("../../project/types").AttributeRequirement = {
        id: makeId(),
        attribute: "PredefinedType",
        dataType: "IfcLabel",
        required: true,
        occurrence: "required",
        constraint: "ENUM",
        value: object.predefinedType.value ?? "",
        unit: "",
        note: "",
        extensions: {},
        phases: [],
      };
      updateRequirements((reqs) => {
        reqs.attributes.push(newAttr);
      });
      return;
    }

    // Aktualizujeme existující atribut podle aktuálního stavu predefinedType
    const currentValue = object.predefinedType.value ?? "";
    if (predefinedTypeAttr.constraint !== "ENUM" || 
        predefinedTypeAttr.occurrence !== "required" || 
        predefinedTypeAttr.value !== currentValue) {
      updateAttributeField(predefinedTypeAttr.id, {
        constraint: "ENUM",
        occurrence: "required",
        value: currentValue,
      });
    }
  }, [object.predefinedType, object.ifcEntity]);

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

  const mergeAssignmentsByName = (items: Array<{ name: string; forPredefinedType?: string }>) => {
    const map = new Map<string, { name: string; hasGeneric: boolean; predefinedTypes: Set<string> }>();
    items.forEach((it) => {
      const name = (it?.name ?? "").trim();
      if (!name) return;
      if (!map.has(name)) {
        map.set(name, { name, hasGeneric: false, predefinedTypes: new Set<string>() });
      }
      const row = map.get(name)!;
      if (!it.forPredefinedType) row.hasGeneric = true;
      else row.predefinedTypes.add(it.forPredefinedType);
    });
    return Array.from(map.values())
      .map((v) => ({
        name: v.name,
        hasGeneric: v.hasGeneric,
        predefinedTypes: Array.from(v.predefinedTypes.values()).sort(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const allPsets = useMemo(() => {
    if (!selectedEntity) return [];
    return (selectedEntity.standardPsets || []).map((p) => normalizeAssignment(p));
  }, [selectedEntity]);

  const allQtos = useMemo(() => {
    if (!selectedEntity) return [];
    return (selectedEntity.standardQtoSets || []).map((q) => normalizeAssignment(q));
  }, [selectedEntity]);

  const allowedPsets = useMemo(() => {
    return allPsets.filter((p) => !p.forPredefinedType || (selectedPredefinedValue && p.forPredefinedType === selectedPredefinedValue));
  }, [allPsets, selectedPredefinedValue]);

  const allowedQtos = useMemo(() => {
    return allQtos.filter((q) => !q.forPredefinedType || (selectedPredefinedValue && q.forPredefinedType === selectedPredefinedValue));
  }, [allQtos, selectedPredefinedValue]);

  const invalidSchemaGroups = useMemo(() => {
    return propertyGroups
      .filter((g) => g.source !== "CUSTOM")
      .filter((g) => !!g.psetName && !g.psetName!.startsWith("_NEW_"))
      .filter((g) => !isGroupAllowed(g.source, g.psetName))
      .map((g) => ({ key: g.key, source: g.source, name: g.psetName as string }));
  }, [propertyGroups, selectedEntity, selectedPredefinedValue, allowedPsets, allowedQtos]);

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

  const handleIfcEntityChange = (value: string) => {
    // Při změně IFC entity resetujeme PredefinedType na NONE
    updateObject({ 
      ifcEntity: value,
      predefinedType: { mode: "NONE" }
    });
  };

  const getAvailableAttributes = (currentId?: string) => {
    const allAttributes = ["Name", "Description", "Tag", "ObjectType", "GlobalId", "PredefinedType"];
    const used = new Set(
      object.requirements.attributes
        .filter((a) => a.id !== currentId)
        .map((a) => a.attribute),
    );
    
    // PredefinedType je vždy v seznamu, ale může být zašedlý pokud je nastaven na kartě IFC entity
    return allAttributes.filter((attr) => !used.has(attr));
  };

  const addAttribute = () => {
    const availableAttributes = getAvailableAttributes();
    if (availableAttributes.length === 0) return; // Všechny atributy jsou již použité
    
    const firstUnused = availableAttributes[0];
    updateRequirements((reqs) => {
      reqs.attributes.push({
        id: makeId(),
        attribute: firstUnused,
        dataType: ATTRIBUTE_DATA_TYPES[firstUnused] ?? "IfcLabel",
        required: true,
        occurrence: "optional",
        constraint: "FILLED",
        value: "",
        unit: "",
        note: "",
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
      // Pokud už ve skupině existuje prázdný řádek (typicky první po přidání Pset/Qto),
      // využij ho místo přidání nové vlastnosti.
      if (group.source !== "CUSTOM" && !isTempGroup && firstUnused) {
        const emptyIdx = reqs.properties.findIndex(
          (p) => groupKey(p.source, p.psetName) === groupKeyValue && (!p.propertyName || p.propertyName === ""),
        );
        if (emptyIdx >= 0) {
          const prev = reqs.properties[emptyIdx];
          reqs.properties[emptyIdx] = {
            ...prev,
            propertyName: firstUnused.name,
            dataType: firstUnused.dataType ?? prev.dataType ?? schema?.dataTypes?.[0] ?? "IfcText",
            unit: firstUnused.unit ?? "",
          };
          return;
        }
      }

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
      // Nejdřív vyplň existující prázdné řádky ve skupině, aby po akci nezůstaly viset.
      const emptyIdxs: number[] = [];
      reqs.properties.forEach((p, idx) => {
        if (groupKey(p.source, p.psetName) !== groupKeyValue) return;
        if (!p.propertyName || p.propertyName === "") emptyIdxs.push(idx);
      });

      const remaining = [...defs];
      emptyIdxs.forEach((idx) => {
        const def = remaining.shift();
        if (!def) return;
        const prev = reqs.properties[idx];
        reqs.properties[idx] = {
          ...prev,
          propertyName: def.name,
          dataType: def.dataType ?? prev.dataType ?? schema?.dataTypes?.[0] ?? "IfcText",
          unit: def.unit ?? "",
        };
      });

      // Pak přidej zbytek vlastností dle IFC.
      remaining.forEach((def) => {
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
        (p) => !groupKeysToDelete.includes(groupKey(p.source, p.psetName)) && !propertyIdsToDelete.includes(p.id),
      );
      reqs.properties = filteredProperties;
    });
    
    // Vyčistit označení
    setSelectedGroups(new Set());
    setSelectedProperties(new Set());
  };

  // === ATRIBUTY - výběr a mazání ===
  const isAttributeProtected = (attr: import("../../project/types").AttributeRequirement) => {
    // PredefinedType je chráněn, pokud je řízen z karty IFC entity
    return attr.attribute === "PredefinedType" && object.predefinedType.mode !== "NONE";
  };

  const toggleAttributeSelection = (attrId: string) => {
    // Nenechat vybrat chráněné atributy
    const attr = object.requirements.attributes.find((a) => a.id === attrId);
    if (attr && isAttributeProtected(attr)) return;
    
    setSelectedAttributes((prev) => {
      const next = new Set(prev);
      if (next.has(attrId)) next.delete(attrId);
      else next.add(attrId);
      return next;
    });
  };


  const selectAllAttributes = () => {
    // Nevybírat chráněné atributy
    const selectableIds = object.requirements.attributes
      .filter((a) => !isAttributeProtected(a))
      .map((a) => a.id);
    setSelectedAttributes(new Set(selectableIds));
  };

  const deleteSelectedAttributes = () => {
    const idsToDelete = Array.from(selectedAttributes);
    updateRequirements((reqs) => {
      // Nemazat chráněné atributy
      reqs.attributes = reqs.attributes.filter((a) => 
        !idsToDelete.includes(a.id) || isAttributeProtected(a)
      );
    });
    setSelectedAttributes(new Set());
  };

  const updateSelectedAttributes = (patch: Partial<import("../../project/types").AttributeRequirement>) => {
    if (selectedAttributes.size === 0) return;
    updateRequirements((reqs) => {
      reqs.attributes = reqs.attributes.map((a) =>
        selectedAttributes.has(a.id) ? { ...a, ...patch } : a
      );
    });
  };

  // === RELACE (PartOf) - výběr a mazání ===
  const toggleRelationSelection = (relId: string) => {
    setSelectedRelations((prev) => {
      const next = new Set(prev);
      if (next.has(relId)) next.delete(relId);
      else next.add(relId);
      return next;
    });
  };

  const selectAllRelations = () => {
    const allIds = object.requirements.relations.map((r) => r.id);
    setSelectedRelations(new Set(allIds));
  };

  const deleteSelectedRelations = () => {
    const idsToDelete = Array.from(selectedRelations);
    updateRequirements((reqs) => {
      reqs.relations = reqs.relations.filter((r) => !idsToDelete.includes(r.id));
    });
    setSelectedRelations(new Set());
  };

  const updateSelectedRelations = (patch: Partial<RelationRequirement>) => {
    if (selectedRelations.size === 0) return;
    updateRequirements((reqs) => {
      reqs.relations = reqs.relations.map((r) =>
        selectedRelations.has(r.id) ? { ...r, ...patch } : r
      );
    });
  };

  // === MATERIÁLY - výběr a mazání ===
  const toggleMaterialSelection = (matId: string) => {
    setSelectedMaterials((prev) => {
      const next = new Set(prev);
      if (next.has(matId)) next.delete(matId);
      else next.add(matId);
      return next;
    });
  };

  const selectAllMaterials = () => {
    const allIds = object.requirements.materials.map((m) => m.id);
    setSelectedMaterials(new Set(allIds));
  };

  const deleteSelectedMaterials = () => {
    const idsToDelete = Array.from(selectedMaterials);
    updateRequirements((reqs) => {
      reqs.materials = reqs.materials.filter((m) => !idsToDelete.includes(m.id));
    });
    setSelectedMaterials(new Set());
  };

  const updateSelectedMaterials = (patch: Partial<MaterialRequirement>) => {
    if (selectedMaterials.size === 0) return;
    updateRequirements((reqs) => {
      reqs.materials = reqs.materials.map((m) =>
        selectedMaterials.has(m.id) ? { ...m, ...patch } : m
      );
    });
  };

  // === KLASIFIKACE - výběr a mazání ===
  const toggleClassificationSelection = (clsId: string) => {
    // Nenechat vybrat chráněné klasifikace (readOnly)
    const cls = object.requirements.classifications.find((c) => c.id === clsId);
    if (cls?.readOnly) return;
    
    setSelectedClassifications((prev) => {
      const next = new Set(prev);
      if (next.has(clsId)) next.delete(clsId);
      else next.add(clsId);
      return next;
    });
  };

  const selectAllClassifications = () => {
    // Nevybírat chráněné klasifikace (readOnly)
    const selectableIds = object.requirements.classifications
      .filter((c) => !c.readOnly)
      .map((c) => c.id);
    setSelectedClassifications(new Set(selectableIds));
  };

  const deleteSelectedClassifications = () => {
    const idsToDelete = Array.from(selectedClassifications);
    updateRequirements((reqs) => {
      // Nemazat chráněné klasifikace (readOnly)
      reqs.classifications = reqs.classifications.filter((c) => 
        !idsToDelete.includes(c.id) || c.readOnly
      );
    });
    setSelectedClassifications(new Set());
  };

  const toggleGroup = (groupKeyValue: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupKeyValue]: !(prev[groupKeyValue] ?? true) }));
  };

  const addRelation = () => {
    updateRequirements((reqs) => {
      reqs.relations.push({
        id: makeId(),
        relationType: "IFCRELAGGREGATES",
        occurrence: "optional",
        entityType: "",
        entityPredefinedType: "",
        targetType: "", // legacy field for backwards compatibility
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
        occurrence: "optional",
        categoryMode: "NONE",
        category: "",
        uri: "",
        constraint: "FILLED",
        value: "",
        required: false, // legacy field for backwards compatibility
        materialType: undefined, // legacy field for backwards compatibility
        note: "",
        extensions: {},
        phases: [],
      });
    });
  };

  const updateMaterialField = (id: string, patch: Partial<MaterialRequirement>) => {
    updateRequirements((reqs) => {
      reqs.materials = reqs.materials.map((m) => (m.id === id ? { ...m, ...patch } : m));
    });
  };

  const updatePropertyField = (id: string, patch: Partial<PropertyRequirement>) => {
    updateRequirements((reqs) => {
      const idx = reqs.properties.findIndex((p) => p.id === id);
      if (idx >= 0) {
        const prev = reqs.properties[idx];
        let next = { ...prev, ...patch };
        
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

        // If type changes from IfcBoolean -> anything else, clear TRUE/FALSE leftovers
        if (isIfcBooleanType(prev.dataType) && !isIfcBooleanType(next.dataType)) {
          const v = (next.value ?? "").trim().toUpperCase();
          if (next.constraint === "ENUM" && (v === "TRUE" || v === "FALSE")) {
            next = { ...next, value: "" };
          }
        }

        // Enforce meaningful constraints for common data types
        if (next.constraint && !isConstraintAllowedForDataType(next.dataType, next.constraint)) {
          next = { ...next, constraint: "FILLED", value: "" };
        }

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

  const updateAttributeField = (id: string, patch: Partial<import("../../project/types").AttributeRequirement>) => {
    updateRequirements((reqs) => {
      const idx = reqs.attributes.findIndex((a) => a.id === id);
      if (idx >= 0) {
        const prev = reqs.attributes[idx];
        let next = { ...prev, ...patch };
        
        // Pokud se změní atribut, aktualizujeme datový typ
        if (patch.attribute !== undefined) {
          next.dataType = ATTRIBUTE_DATA_TYPES[patch.attribute] ?? "IfcLabel";
          
          // Pokud se mění atribut z PredefinedType na jiný, nastavíme predefinedType na NONE
          if (prev.attribute === "PredefinedType" && patch.attribute !== "PredefinedType") {
            updateObject({ predefinedType: { mode: "NONE" } });
          }
        }
        
        // Speciální logika pro PredefinedType - synchronizace s kartou IFC entity
        if (next.attribute === "PredefinedType" || prev.attribute === "PredefinedType") {
          if (next.attribute === "PredefinedType") {
            // Pokud se mění hodnota nebo constraint
            if (patch.value !== undefined || patch.constraint !== undefined) {
              // Pokud je constraint ENUM a hodnota je z IFC seznamu, synchronizujeme s predefinedType
              if (next.constraint === "ENUM") {
                // Pro USERDEFINED mode - hodnota je jednoduchý string, ne výčet
                if (object.predefinedType.mode === "USERDEFINED") {
                  // Pokud se mění hodnota, aktualizujeme predefinedType.value
                  if (patch.value !== undefined) {
                    updateObject({ predefinedType: { mode: "USERDEFINED", value: next.value ?? "" } });
                  }
                } else {
                  // Pro ENUM mode - hodnota může být výčet nebo jednoduchá hodnota
                  const enumValues = parseEnumValues(next.value ?? "");
                  if (enumValues.length > 0) {
                    // Pokud je hodnota v seznamu predefinedOptions, nastavíme ENUM mode
                    const matchingValue = predefinedOptions.find((opt) => enumValues.includes(opt));
                    if (matchingValue && matchingValue !== "USERDEFINED") {
                      updateObject({ predefinedType: { mode: "ENUM", value: matchingValue } });
                    } else if (enumValues.includes("USERDEFINED")) {
                      // Pokud je USERDEFINED v hodnotách, nastavíme USERDEFINED mode
                      const userDefinedValue = enumValues.find((v) => v !== "USERDEFINED") || "";
                      updateObject({ predefinedType: { mode: "USERDEFINED", value: userDefinedValue } });
                    } else if (enumValues.length === 1 && !predefinedOptions.includes(enumValues[0])) {
                      // Pokud je to jedna hodnota, která není v predefinedOptions, je to USERDEFINED
                      updateObject({ predefinedType: { mode: "USERDEFINED", value: enumValues[0] } });
                    }
                  } else if (next.value && !predefinedOptions.includes(next.value)) {
                    // Pokud je hodnota jednoduchý string a není v predefinedOptions, je to USERDEFINED
                    updateObject({ predefinedType: { mode: "USERDEFINED", value: next.value } });
                  }
                }
              } else if (next.constraint === "PATTERN" && next.value) {
                // Pokud je PATTERN, použijeme hodnotu jako vlastní USERDEFINED
                updateObject({ predefinedType: { mode: "USERDEFINED", value: next.value } });
              } else if (next.constraint === "FILLED" || !next.constraint) {
                // Pokud je FILLED nebo není constraint, resetujeme na NONE
                updateObject({ predefinedType: { mode: "NONE" } });
              } else if ((next.constraint === "RANGE" || next.constraint === "LENGTH") && next.value) {
                // Pro RANGE a LENGTH použijeme hodnotu jako USERDEFINED
                updateObject({ predefinedType: { mode: "USERDEFINED", value: next.value } });
              }
            }
          }
        }
        
        // Zajistíme, že omezení je platné pro daný atribut
        if (next.constraint && !isAttributeConstraintAllowed(next.attribute, next.constraint)) {
          next = { ...next, constraint: "FILLED", value: "" };
        }
        
        reqs.attributes[idx] = next;
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
      const item = reqs[type].find((i) => i.id === id);
      // Pokud odstraňujeme PredefinedType atribut, nastavíme predefinedType na NONE
      if (type === "attributes" && item && "attribute" in item && item.attribute === "PredefinedType") {
        updateObject({ predefinedType: { mode: "NONE" } });
      }
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
                <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={object.ifcEntity} onChange={(e) => handleIfcEntityChange(e.target.value)}>
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
                <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={object.predefinedType.mode === "NONE" ? "" : (object.predefinedType.mode === "USERDEFINED" ? "USERDEFINED" : object.predefinedType.value ?? "")} onChange={(e) => handlePredefinedChange(e.target.value)}>
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
            <div className="text-xs text-slate-500">
              <span>Záznamy IfcClassificationReference: <span className="font-semibold text-slate-700">{object.requirements.classifications.length}</span></span>
            </div>
            <button 
              className="mt-2 text-xs text-indigo-600 hover:underline" 
              onClick={() => setActiveTab("classification")}
            >
              Zobrazit a upravit na kartě Klasifikace
            </button>
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
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-slate-800">Atributy</div>
                <button className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500" onClick={addAttribute}>
                  Přidat atribut
                </button>
                {object.requirements.attributes.length > 0 && (
                  <>
                    <div className="h-4 w-px bg-slate-300" />
                    <button
                      className="rounded border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      onClick={selectAllAttributes}
                    >
                      Označit všechny
                    </button>
                    {selectedAttributes.size > 0 && (
                      <button
                        className="rounded border border-red-300 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                        onClick={deleteSelectedAttributes}
                      >
                        Smazat označené ({selectedAttributes.size})
                      </button>
                    )}
                  </>
                )}
              </div>
              <div className="text-xs text-slate-500">Ifc attributes (Name, Description, Tag ...)</div>
              <div className="overflow-auto rounded border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="w-8 px-2 py-2"></th>
                      <th className="px-2 py-2">Výskyt</th>
                      <th className="px-2 py-2">Atribut</th>
                      <th className="px-2 py-2">Datový typ</th>
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
                      <th className="px-2 py-2">Poznámka</th>
                      <th className="px-2 py-2">Fáze</th>
                      <th className="px-2 py-2 text-right">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {object.requirements.attributes.map((attr) => {
                      const dataType = attr.dataType ?? ATTRIBUTE_DATA_TYPES[attr.attribute] ?? "IfcLabel";
                      const isDisabled = attr.constraint === "FILLED" || attr.constraint === undefined;
                      const isPattern = attr.constraint === "PATTERN";
                      const isEnum = attr.constraint === "ENUM";
                      const isPredefinedType = attr.attribute === "PredefinedType";
                      const isPredefinedTypeFromIFC = isPredefinedType && object.predefinedType.mode !== "NONE";
                      
                      return (
                        <tr key={attr.id} className="border-t border-slate-200">
                          {/* CHECKBOX */}
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              className={`h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 ${isPredefinedTypeFromIFC ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                              checked={selectedAttributes.has(attr.id)}
                              onChange={() => !isPredefinedTypeFromIFC && toggleAttributeSelection(attr.id)}
                              disabled={isPredefinedTypeFromIFC}
                              title={isPredefinedTypeFromIFC ? "Chráněný atribut - nelze vybrat" : ""}
                            />
                          </td>
                          {/* VÝSKYT */}
                          <td className="px-2 py-2">
                            <select 
                              className={`w-full rounded border border-slate-300 px-2 py-1 text-sm ${isPredefinedTypeFromIFC ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}`}
                              value={isPredefinedTypeFromIFC ? "required" : (attr.occurrence ?? "optional")} 
                              onChange={(e) => {
                                const newValue = e.target.value as "required" | "prohibited" | "optional";
                                if (selectedAttributes.has(attr.id) && selectedAttributes.size > 0) {
                                  updateSelectedAttributes({ occurrence: newValue });
                                } else {
                                  updateAttributeField(attr.id, { occurrence: newValue });
                                }
                              }}
                              disabled={isPredefinedTypeFromIFC}
                              title={isPredefinedTypeFromIFC ? "PredefinedType je řízen z karty IFC entity" : ""}
                            >
                              <option value="required">Požadováno (required)</option>
                              <option value="prohibited">Zakázáno (prohibited)</option>
                              <option value="optional">Možné (optional)</option>
                            </select>
                          </td>
                          
                          {/* ATRIBUT - Atribut dropdown */}
                          <td className="px-2 py-2">
                            <select
                              className={`w-full rounded border border-slate-300 px-2 py-1 text-sm ${isPredefinedTypeFromIFC ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}`}
                              value={attr.attribute}
                              onChange={(e) => updateAttributeField(attr.id, { attribute: e.target.value })}
                              disabled={isPredefinedTypeFromIFC}
                              title={isPredefinedTypeFromIFC ? "PredefinedType je řízen z karty IFC entity" : ""}
                            >
                              {getAvailableAttributes(attr.id).map((opt) => {
                                const isPredefinedTypeOption = opt === "PredefinedType";
                                const isPredefinedTypeSetOnIFCEntity = isPredefinedTypeOption && object.predefinedType.mode !== "NONE";
                                return (
                                  <option 
                                    key={opt} 
                                    value={opt}
                                    disabled={isPredefinedTypeSetOnIFCEntity}
                                  >
                                    {opt}
                                  </option>
                                );
                              })}
                            </select>
                          </td>
                          
                          {/* DATOVÝ TYP - readonly, odvozeno z atributu */}
                          <td className="px-2 py-2">
                            <select
                              className="w-full rounded border border-slate-300 bg-slate-50 px-2 py-1 text-sm text-slate-600"
                              value={dataType}
                              disabled
                            >
                              <option value={dataType}>{dataType}</option>
                            </select>
                          </td>
                          
                          {/* OMEZENÍ */}
                          <td className="px-2 py-2">
                            {isPredefinedTypeFromIFC ? (
                              <span 
                                className="block w-full rounded border border-slate-200 bg-slate-100 px-2 py-1 text-sm text-slate-400 cursor-not-allowed"
                                title="PredefinedType je řízen z karty IFC entity"
                              >
                                Žádné
                              </span>
                            ) : (
                              <select 
                                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                value={attr.constraint ?? "FILLED"} 
                                onChange={(e) => updateAttributeField(attr.id, { constraint: e.target.value as any })}
                              >
                                {ATTRIBUTE_CONSTRAINT_OPTIONS.map((opt) => {
                                  const allowed = isAttributeConstraintAllowed(attr.attribute, opt.value);
                                  return (
                                    <option key={opt.value} value={opt.value} disabled={!allowed}>
                                      {opt.label}
                                    </option>
                                  );
                                })}
                              </select>
                            )}
                          </td>
                          
                          {/* HODNOTA */}
                          <td className="px-2 py-2">
                            {(() => {
                              // Pro PredefinedType z IFC entity - pouze zašedlá hodnota (ne výčet)
                              if (isPredefinedTypeFromIFC) {
                                return (
                                  <span 
                                    className="block w-full rounded border border-slate-200 bg-slate-100 px-2 py-1 text-sm text-slate-400 cursor-not-allowed"
                                    title="PredefinedType je řízen z karty IFC entity"
                                  >
                                    {attr.value || "—"}
                                  </span>
                                );
                              }
                              
                              // Pro PATTERN zobrazit speciální UI + odkazy
                              if (isPattern && !isDisabled) {
                                return (
                                  <div className="flex items-center gap-1">
                                    <input
                                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                      value={attr.value ?? ""}
                                      onChange={(e) => updateAttributeField(attr.id, { value: e.target.value })}
                                      placeholder='Regex pattern (např. ^DT[0-9]{2}$)'
                                    />
                                    <a
                                      href="https://regex101.com/"
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center text-slate-500 hover:text-indigo-600"
                                      title="Otevřít regex tester (regex101)"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <svg aria-hidden xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                                        <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3ZM5 5h5v2H7v10h10v-3h2v5H5V5Z" />
                                      </svg>
                                    </a>
                                  </div>
                                );
                              }

                              // Pro ENUM (výčet) – inline hodnoty nebo číselník + badges + nabídka uložení
                              if (isEnum && !isDisabled) {
                                const linkedCodeListId = (attr.extensions?.[ENUM_CODELIST_ID_KEY] as string | undefined) ?? undefined;
                                const linkedCodeList = linkedCodeListId ? codeLists.find((c) => c.id === linkedCodeListId) : undefined;
                                const values = linkedCodeList ? (linkedCodeList.values ?? []) : parseEnumValues(attr.value ?? "");
                                const displayValues = values.slice(0, 24);
                                const remaining = values.length - displayValues.length;

                                const detachFromCodeList = () => {
                                  const nextExtensions = { ...(attr.extensions ?? {}) } as Record<string, unknown>;
                                  delete (nextExtensions as any)[ENUM_CODELIST_ID_KEY];
                                  updateAttributeField(attr.id, { extensions: nextExtensions });
                                };

                                const linkToCodeList = (id: string) => {
                                  const list = codeLists.find((c) => c.id === id);
                                  if (!list) return;
                                  const nextExtensions = { ...(attr.extensions ?? {}) } as Record<string, unknown>;
                                  nextExtensions[ENUM_CODELIST_ID_KEY] = list.id;
                                  updateAttributeField(attr.id, { extensions: nextExtensions, value: formatEnumValues(list.values ?? []) });
                                };

                                return (
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1">
                                      <select
                                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                                        value={linkedCodeListId ? `codelist:${linkedCodeListId}` : "inline"}
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          if (v === "inline") {
                                            detachFromCodeList();
                                            return;
                                          }
                                          if (v.startsWith("codelist:")) {
                                            linkToCodeList(v.replace("codelist:", ""));
                                          }
                                        }}
                                      >
                                        <option value="inline">Vlastní</option>
                                        {codeLists.length > 0 && <option disabled>— Číselníky —</option>}
                                        {codeLists.map((cl) => (
                                          <option key={cl.id} value={`codelist:${cl.id}`}>
                                            {cl.name}
                                          </option>
                                        ))}
                                      </select>
                                      {linkedCodeListId && (
                                        <button
                                          className="rounded border border-slate-300 px-2 py-1 text-[11px] hover:bg-slate-50"
                                          onClick={detachFromCodeList}
                                          title="Odpojit od číselníku (ponechat hodnoty jako inline)"
                                        >
                                          Odpojit
                                        </button>
                                      )}
                                    </div>

                                    {!linkedCodeListId ? (
                                      <div className="flex items-center gap-1">
                                        <input
                                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                          placeholder="Napiš hodnotu a stiskni Enter"
                                          value={enumDraftByAttrId[attr.id] ?? ""}
                                          onChange={(e) =>
                                            setEnumDraftByAttrId((prev) => ({ ...prev, [attr.id]: e.target.value }))
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key !== "Enter") return;
                                            e.preventDefault();
                                            const raw = (enumDraftByAttrId[attr.id] ?? "").trim();
                                            if (!raw) return;
                                            const nextValues = Array.from(new Set([...values, raw]));
                                            updateAttributeField(attr.id, { value: formatEnumValues(nextValues) });
                                            setEnumDraftByAttrId((prev) => ({ ...prev, [attr.id]: "" }));
                                          }}
                                        />
                                        <button
                                          className={`flex items-center rounded border px-2 py-1 text-[11px] ${
                                            values.length === 0
                                              ? "border-slate-200 text-slate-400 cursor-not-allowed"
                                              : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-400"
                                          }`}
                                          disabled={values.length === 0}
                                          title="Uložit jako číselník a přiřadit"
                                          onClick={() => {
                                            const suggestedName = (attr.attribute || "").trim() || "Výčet";
                                            setEnumSaveDialog({
                                              propertyId: attr.id,
                                              name: suggestedName,
                                              values,
                                              type: "attribute",
                                            });
                                          }}
                                        >
                                          <svg
                                            aria-hidden
                                            xmlns="http://www.w3.org/2000/svg"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                            className="h-4 w-4"
                                          >
                                            <path d="M6 2h11l3 3v17H4V4a2 2 0 0 1 2-2Zm12 8V6.5L16.5 5H6v5h12ZM6 20h12v-8H6v8Zm2-6h8v4H8v-4Z" />
                                          </svg>
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                                        Používá číselník: <span className="font-semibold text-slate-800">{linkedCodeList?.name ?? linkedCodeListId}</span>
                                      </div>
                                    )}

                                    <div className="flex flex-wrap gap-1">
                                      {displayValues.map((v) => (
                                        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700" title={v}>
                                          <span>{v}</span>
                                          {!linkedCodeListId && (
                                            <button
                                              className="text-slate-400 hover:text-slate-700"
                                              title="Odebrat hodnotu"
                                              onClick={() => {
                                                const nextValues = values.filter((x) => x !== v);
                                                updateAttributeField(attr.id, { value: formatEnumValues(nextValues) });
                                              }}
                                            >
                                              ×
                                            </button>
                                          )}
                                        </span>
                                      ))}
                                      {remaining > 0 && (
                                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-700">
                                          +{remaining}
                                        </span>
                                      )}
                                      {values.length === 0 && (
                                        <span className="text-[11px] text-slate-400">Žádné hodnoty výčtu.</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              }
                              
                              // Pro FILLED (Žádné) - editovatelné pole s respektováním datového typu
                              if (isDisabled && !isPredefinedTypeFromIFC) {
                                const isBool = isIfcBooleanType(dataType);
                                const isNumeric = isIfcNumericLikeType(dataType);
                                
                                if (isBool) {
                                  return (
                                    <select
                                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                      value={attr.value ?? ""}
                                      onChange={(e) => updateAttributeField(attr.id, { value: e.target.value })}
                                    >
                                      <option value="">Bez požadavku</option>
                                      <option value="TRUE">TRUE</option>
                                      <option value="FALSE">FALSE</option>
                                    </select>
                                  );
                                }
                                
                                if (isNumeric) {
                                  return (
                                    <input
                                      type="number"
                                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                      value={attr.value ?? ""}
                                      onChange={(e) => updateAttributeField(attr.id, { value: e.target.value })}
                                      placeholder="Bez požadavku"
                                    />
                                  );
                                }
                                
                                return (
                                  <input
                                    className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                    value={attr.value ?? ""}
                                    onChange={(e) => updateAttributeField(attr.id, { value: e.target.value })}
                                    placeholder="Bez požadavku"
                                  />
                                );
                              }
                              
                              // Standardní input nebo disabled pro PredefinedType z IFC
                              return (
                                <input
                                  className={`w-full rounded border border-slate-300 px-2 py-1 text-sm ${isPredefinedTypeFromIFC ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}`}
                                  value={attr.value ?? ""}
                                  onChange={(e) => updateAttributeField(attr.id, { value: e.target.value })}
                                  disabled={isPredefinedTypeFromIFC}
                                  placeholder={isPredefinedTypeFromIFC ? "" : "Hodnota"}
                                  title={isPredefinedTypeFromIFC ? "PredefinedType je řízen z karty IFC entity" : ""}
                                />
                              );
                            })()}
                          </td>
                          
                          {/* POZNÁMKA */}
                          <td className="px-2 py-2">
                            <input 
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm" 
                              value={attr.note ?? ""} 
                              onChange={(e) => updateAttributeField(attr.id, { note: e.target.value })}
                              placeholder="Všeobecný popis" 
                            />
                          </td>
                          
                          {/* FÁZE */}
                          <td className="px-2 py-2">
                            <PhaseSelector
                              phases={phases}
                              value={attr.phases}
                              onChange={(ids) => updateAttributeField(attr.id, { phases: ids })}
                            />
                          </td>
                          
                          {/* AKCE */}
                          <td className="px-2 py-2 text-right">
                            <button className="text-xs text-red-600 hover:underline" onClick={() => removeRequirement("attributes", attr.id)}>
                              Odebrat
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {!object.requirements.attributes.length && (
                      <tr>
                        <td className="px-2 py-3 text-sm text-slate-500" colSpan={9}>
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

              {invalidSchemaGroups.length > 0 && (
                <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                  <div className="font-semibold">Některé skupiny neodpovídají zvolenému PredefinedType</div>
                  <div className="mt-1 text-xs text-red-700">
                    PredefinedType: <span className="font-semibold">{selectedPredefinedValue ?? "není vybrán"}</span>
                  </div>
                  <div className="mt-2 text-xs">
                    {invalidSchemaGroups.map((g) => (
                      <div key={g.key}>
                        - {g.source}: <span className="font-semibold">{g.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {propertyGroups.length === 0 && (
                <div className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                  Žádné vlastnosti. Přidejte skupinu Pset/Qto nebo vlastní.
                </div>
              )}

              <div className="space-y-3 pr-1">
                {propertyGroups.map((group) => {
                const expanded = expandedGroups[group.key] ?? true;
                const isSchemaBound = group.source !== "CUSTOM";
                const schemaOptionsRaw = group.source === "PSET" ? allPsets : allQtos;
                const schemaOptions = mergeAssignmentsByName(schemaOptionsRaw);
                const usedSchemaGroupNames = new Set(
                  propertyGroups
                    .filter(
                      (g) =>
                        g.key !== group.key &&
                        g.source === group.source &&
                        g.source !== "CUSTOM" &&
                        g.psetName &&
                        !g.psetName.startsWith("_NEW_"),
                    )
                    .map((g) => g.psetName as string),
                );
                const schemaOptionsFiltered = schemaOptions.filter(
                  (item) => item.name === group.psetName || !usedSchemaGroupNames.has(item.name),
                );
                const propertyOptions = (currentId?: string) =>
                  isSchemaBound ? propertyOptionsForGroup(group.source, group.psetName, currentId) : [];
                const isTempGroup = group.psetName?.startsWith("_NEW_");
                const displayPsetName = isTempGroup ? "" : (group.psetName ?? "");
                const isInvalidGroup =
                  isSchemaBound && !!group.psetName && !isTempGroup && !isGroupAllowed(group.source, group.psetName);
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
                const cardBorder = isInvalidGroup ? "border-red-400" : colors.border;
                const badgeClass = isInvalidGroup ? "bg-red-100 text-red-800" : colors.badge;

                return (
                  <div key={group.key} className={`rounded border-2 ${cardBorder} bg-white shadow-sm`}>
                    <div className={`flex items-center justify-between border-b ${cardBorder} px-3 py-2`}>
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
                        <span className={`rounded px-2 py-1 text-[11px] font-semibold uppercase ${badgeClass}`}>
                          {group.source === "PSET" ? "Pset dle IFC" : group.source === "QTO" ? "Qto dle IFC" : "Vlastní"}
                        </span>
                        {isInvalidGroup && (
                          <span className="rounded bg-red-100 px-2 py-1 text-[11px] font-semibold uppercase text-red-800">
                            Neplatné pro PredefinedType
                          </span>
                        )}
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
                              className={`rounded border px-2 py-1 text-sm ${
                                isInvalidGroup ? "border-red-400 bg-red-50 text-red-900" : "border-slate-300"
                              }`}
                              value={displayPsetName}
                              onChange={(e) => renameGroup(group.key, e.target.value)}
                            >
                              <option value="">Vyplnit název</option>
                              {!schemaOptions.some((o) => o.name === group.psetName) && group.psetName && !isTempGroup && (
                                <option value={group.psetName}>{group.psetName}</option>
                              )}
                              {schemaOptionsFiltered.map((item) => (
                                <option
                                  key={`${item.name}`}
                                  value={item.name}
                                  disabled={
                                    !item.hasGeneric &&
                                    (!selectedPredefinedValue || !item.predefinedTypes.includes(selectedPredefinedValue))
                                  }
                                >
                                  {item.name}
                                </option>
                              ))}
                            </select>
                            <DocLink href={docHref} label={group.psetName ?? ""} />
                            {isInvalidGroup && (
                              <div className="text-xs text-red-700">
                                Skupina nepatří k aktuálnímu PredefinedType{" "}
                                <span className="font-semibold">{selectedPredefinedValue ?? "(není vybrán)"}</span>. Vyberte jiný Pset/Qto nebo změňte PredefinedType.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button className="rounded border border-slate-300 px-2 py-1 text-[11px] hover:bg-slate-50" onClick={() => addPropertyToGroup(group.key)}>
                          Přidat vlastnost
                        </button>
                        {isSchemaBound && displayPsetName && displayPsetName.length > 0 && isGroupAllowed(group.source, group.psetName) && (
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
                                <th className="px-2 py-2">Výskyt</th>
                                <th className="px-2 py-2">Vlastnost</th>
                                <th className="px-2 py-2">Datový typ</th>
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
                                      value={prop.constraint ?? "FILLED"} 
                                      onChange={(e) => updatePropertyField(prop.id, { constraint: e.target.value as any })}
                                    >
                                      {CONSTRAINT_OPTIONS.map((opt) => {
                                        const allowed = isConstraintAllowedForDataType(prop.dataType, opt.value);
                                        return (
                                        <option key={opt.value} value={opt.value} disabled={!allowed}>
                                          {opt.label}
                                        </option>
                                      );})}
                                    </select>
                                  </td>
                                  <td className="px-2 py-2">
                                    {(() => {
                                      const isDisabled = prop.constraint === "FILLED" || prop.constraint === undefined;
                                      const isLength = prop.constraint === "LENGTH";
                                      const isPattern = prop.constraint === "PATTERN";
                                      const isEnum = prop.constraint === "ENUM";
                                      const enumValues = getEnumAllowedValues(prop);
                                      const linkedCodeListId = (prop.extensions?.[ENUM_CODELIST_ID_KEY] as string | undefined) ?? undefined;
                                      const linkedCodeList = linkedCodeListId ? codeLists.find((c) => c.id === linkedCodeListId) : undefined;
                                      const isBool = isIfcBooleanType(prop.dataType);
                                      
                                      // Pro PATTERN zobrazit speciální UI + odkazy (IDS + tester)
                                      if (isPattern && !isDisabled) {
                                        return (
                                          <div className="flex items-center gap-1">
                                            <input
                                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                              value={prop.value ?? ""}
                                              onChange={(e) => updatePropertyField(prop.id, { value: e.target.value })}
                                              placeholder='Regex pattern (např. ^DT[0-9]{2}$)'
                                            />
                                            <a
                                              href="https://regex101.com/"
                                              target="_blank"
                                              rel="noreferrer"
                                              className="flex items-center text-slate-500 hover:text-indigo-600"
                                              title="Otevřít regex tester (regex101)"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <svg aria-hidden xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                                                <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3ZM5 5h5v2H7v10h10v-3h2v5H5V5Z" />
                                              </svg>
                                            </a>
                                          </div>
                                        );
                                      }

                                      // IfcBoolean + ENUM: only TRUE/FALSE
                                      if (isBool && isEnum && !isDisabled) {
                                        return (
                                          <select
                                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                            value={(prop.value ?? "").toUpperCase() === "FALSE" ? "FALSE" : "TRUE"}
                                            onChange={(e) => updatePropertyField(prop.id, { value: e.target.value })}
                                          >
                                            <option value="TRUE">TRUE</option>
                                            <option value="FALSE">FALSE</option>
                                          </select>
                                        );
                                      }

                                      // Pro ENUM (výčet) – inline hodnoty nebo číselník + badges + nabídka uložení
                                      if (isEnum && !isDisabled) {
                                        const values = linkedCodeList ? (linkedCodeList.values ?? []) : parseEnumValues(prop.value ?? "");
                                        const displayValues = values.slice(0, 24);
                                        const remaining = values.length - displayValues.length;

                                        const detachFromCodeList = () => {
                                          const nextExtensions = { ...(prop.extensions ?? {}) } as Record<string, unknown>;
                                          delete (nextExtensions as any)[ENUM_CODELIST_ID_KEY];
                                          updatePropertyField(prop.id, { extensions: nextExtensions });
                                        };

                                        const linkToCodeList = (id: string) => {
                                          const list = codeLists.find((c) => c.id === id);
                                          if (!list) return;
                                          const nextExtensions = { ...(prop.extensions ?? {}) } as Record<string, unknown>;
                                          nextExtensions[ENUM_CODELIST_ID_KEY] = list.id;
                                          updatePropertyField(prop.id, { extensions: nextExtensions, value: formatEnumValues(list.values ?? []) });
                                        };

                                        return (
                                          <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-1">
                                              <select
                                                className="rounded border border-slate-300 px-2 py-1 text-xs"
                                                value={linkedCodeListId ? `codelist:${linkedCodeListId}` : "inline"}
                                                onChange={(e) => {
                                                  const v = e.target.value;
                                                  if (v === "inline") {
                                                    detachFromCodeList();
                                                    return;
                                                  }
                                                  if (v.startsWith("codelist:")) {
                                                    linkToCodeList(v.replace("codelist:", ""));
                                                  }
                                                }}
                                              >
                                                <option value="inline">Vlastní</option>
                                                {codeLists.length > 0 && <option disabled>— Číselníky —</option>}
                                                {codeLists.map((cl) => (
                                                  <option key={cl.id} value={`codelist:${cl.id}`}>
                                                    {cl.name}
                                                  </option>
                                                ))}
                                              </select>
                                              {linkedCodeListId && (
                                                <button
                                                  className="rounded border border-slate-300 px-2 py-1 text-[11px] hover:bg-slate-50"
                                                  onClick={detachFromCodeList}
                                                  title="Odpojit od číselníku (ponechat hodnoty jako inline)"
                                                >
                                                  Odpojit
                                                </button>
                                              )}
                                              {enumValues && enumValues.length > 0 && !linkedCodeListId && (
                                                <button
                                                  className="rounded border border-slate-300 px-2 py-1 text-[11px] hover:bg-slate-50"
                                                  onClick={() => updatePropertyField(prop.id, { value: formatEnumValues(enumValues) })}
                                                  title="Zkopírovat IFC předdefinované hodnoty do výčtu"
                                                >
                                                  Použít IFC hodnoty
                                                </button>
                                              )}
                                            </div>

                                            {!linkedCodeListId ? (
                                              <div className="flex items-center gap-1">
                                                <input
                                                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                                  placeholder="Napiš hodnotu a stiskni Enter"
                                                  value={enumDraftByPropId[prop.id] ?? ""}
                                                  onChange={(e) =>
                                                    setEnumDraftByPropId((prev) => ({ ...prev, [prop.id]: e.target.value }))
                                                  }
                                                  onKeyDown={(e) => {
                                                    if (e.key !== "Enter") return;
                                                    e.preventDefault();
                                                    const raw = (enumDraftByPropId[prop.id] ?? "").trim();
                                                    if (!raw) return;
                                                    const nextValues = Array.from(new Set([...values, raw]));
                                                    updatePropertyField(prop.id, { value: formatEnumValues(nextValues) });
                                                    setEnumDraftByPropId((prev) => ({ ...prev, [prop.id]: "" }));
                                                  }}
                                                />
                                                <button
                                                  className={`flex items-center rounded border px-2 py-1 text-[11px] ${
                                                    values.length === 0
                                                      ? "border-slate-200 text-slate-400 cursor-not-allowed"
                                                      : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-400"
                                                  }`}
                                                  disabled={values.length === 0}
                                                  title="Uložit jako číselník a přiřadit"
                                                  onClick={() => {
                                                    const suggestedName =
                                                      (prop.propertyName || "").trim() ||
                                                      (prop.psetName ? `${prop.psetName}` : "") ||
                                                      "Výčet";
                                                    setEnumSaveDialog({
                                                      propertyId: prop.id,
                                                      name: suggestedName,
                                                      values,
                                                      type: "property",
                                                    });
                                                  }}
                                                >
                                                  <svg
                                                    aria-hidden
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 24 24"
                                                    fill="currentColor"
                                                    className="h-4 w-4"
                                                  >
                                                    <path d="M6 2h11l3 3v17H4V4a2 2 0 0 1 2-2Zm12 8V6.5L16.5 5H6v5h12ZM6 20h12v-8H6v8Zm2-6h8v4H8v-4Z" />
                                                  </svg>
                                                </button>
                                              </div>
                                            ) : (
                                              <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                                                Používá číselník: <span className="font-semibold text-slate-800">{linkedCodeList?.name ?? linkedCodeListId}</span>
                                              </div>
                                            )}

                                            <div className="flex flex-wrap gap-1">
                                              {displayValues.map((v) => (
                                                <span key={v} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700" title={v}>
                                                  <span>{v}</span>
                                                  {!linkedCodeListId && (
                                                    <button
                                                      className="text-slate-400 hover:text-slate-700"
                                                      title="Odebrat hodnotu"
                                                      onClick={() => {
                                                        const nextValues = values.filter((x) => x !== v);
                                                        updatePropertyField(prop.id, { value: formatEnumValues(nextValues) });
                                                      }}
                                                    >
                                                      ×
                                                    </button>
                                                  )}
                                                </span>
                                              ))}
                                              {remaining > 0 && (
                                                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-700">
                                                  +{remaining}
                                                </span>
                                              )}
                                              {values.length === 0 && (
                                                <span className="text-[11px] text-slate-400">Žádné hodnoty výčtu.</span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      }

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
                                        const handleTypeChange = (newType: string) => {
                                          const v = (parsed as any).min || (parsed as any).max || "0";
                                          let newValue = "";
                                          if (newType === "min-inclusive") newValue = `min:${v}:inclusive`;
                                          else if (newType === "min-exclusive") newValue = `min:${v}:exclusive`;
                                          else if (newType === "max-inclusive") newValue = `max:${v}:inclusive`;
                                          else if (newType === "max-exclusive") newValue = `max:${v}:exclusive`;
                                          else if (newType === "range") newValue = `min:${v}:inclusive|max:${(parsed as any).max || "0"}:inclusive`;
                                          updatePropertyField(prop.id, { value: newValue });
                                        };

                                        const handleValueChange = (v1: string, v2?: string) => {
                                          const p = parsed as any;
                                          let newValue = "";
                                          const type = p.hasMin && p.hasMax ? "range" : p.hasMin ? (p.minInclusive ? "min-inclusive" : "min-exclusive") : (p.maxInclusive ? "max-inclusive" : "max-exclusive");
                                          
                                          if (type === "min-inclusive") newValue = `min:${v1}:inclusive`;
                                          else if (type === "min-exclusive") newValue = `min:${v1}:exclusive`;
                                          else if (type === "max-inclusive") newValue = `max:${v1}:inclusive`;
                                          else if (type === "max-exclusive") newValue = `max:${v1}:exclusive`;
                                          else if (type === "range") newValue = `min:${v1}:inclusive|max:${v2 ?? p.max}:inclusive`;
                                          updatePropertyField(prop.id, { value: newValue });
                                        };

                                        const p = parsed as any;
                                        const currentType = p.hasMin && p.hasMax ? "range" : p.hasMin ? (p.minInclusive ? "min-inclusive" : "min-exclusive") : (p.maxInclusive ? "max-inclusive" : "max-exclusive");

                                        return (
                                          <div className="flex flex-col gap-1">
                                            <select
                                              className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                                              value={currentType}
                                              onChange={(e) => handleTypeChange(e.target.value)}
                                            >
                                              <option value="min-inclusive">≥ (větší nebo rovno)</option>
                                              <option value="min-exclusive">&gt; (větší než)</option>
                                              <option value="max-inclusive">≤ (menší nebo rovno)</option>
                                              <option value="max-exclusive">&lt; (menší než)</option>
                                              <option value="range">Rozmezí (od-do)</option>
                                            </select>
                                            {currentType === "range" ? (
                                              <div className="flex items-center gap-1">
                                                <input
                                                  type="number"
                                                  className="w-full rounded border border-slate-300 px-1 py-1 text-sm"
                                                  value={p.min}
                                                  onChange={(e) => handleValueChange(e.target.value, p.max)}
                                                  placeholder="Min"
                                                />
                                                <span className="text-xs text-slate-400">-</span>
                                                <input
                                                  type="number"
                                                  className="w-full rounded border border-slate-300 px-1 py-1 text-sm"
                                                  value={p.max}
                                                  onChange={(e) => handleValueChange(p.min, e.target.value)}
                                                  placeholder="Max"
                                                />
                                              </div>
                                            ) : (
                                              <input
                                                type="number"
                                                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                                value={p.hasMin ? p.min : p.max}
                                                onChange={(e) => handleValueChange(e.target.value)}
                                                placeholder="Hodnota"
                                              />
                                            )}
                                          </div>
                                        );
                                      }
                                      
                                      // Pro FILLED (Žádné) - editovatelné pole s respektováním datového typu
                                      if (isDisabled) {
                                        const isNumeric = isIfcNumericLikeType(prop.dataType);
                                        
                                        if (isBool) {
                                          return (
                                            <select
                                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                              value={prop.value ?? ""}
                                              onChange={(e) => updatePropertyField(prop.id, { value: e.target.value })}
                                            >
                                              <option value="">Bez požadavku</option>
                                              <option value="TRUE">TRUE</option>
                                              <option value="FALSE">FALSE</option>
                                            </select>
                                          );
                                        }
                                        
                                        if (isNumeric) {
                                          return (
                                            <input
                                              type="number"
                                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                              value={prop.value ?? ""}
                                              onChange={(e) => updatePropertyField(prop.id, { value: e.target.value })}
                                              placeholder="Bez požadavku"
                                            />
                                          );
                                        }
                                        
                                        // Pro enum hodnoty z IFC - zobrazit select
                                        if (enumValues && enumValues.length > 0) {
                                          return (
                                            <select
                                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                              value={prop.value ?? ""}
                                              onChange={(e) => updatePropertyField(prop.id, { value: e.target.value })}
                                            >
                                              <option value="">Bez požadavku</option>
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
                                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                            value={prop.value ?? ""}
                                            onChange={(e) => updatePropertyField(prop.id, { value: e.target.value })}
                                            placeholder="Bez požadavku"
                                          />
                                        );
                                      }
                                      
                                      // Fallback - pokud máme předdefinované IFC hodnoty, použít select
                                      if (enumValues && enumValues.length > 0) {
                                        return (
                                          <select
                                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                            value={prop.value ?? ""}
                                            onChange={(e) => updatePropertyField(prop.id, { value: e.target.value })}
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
                                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                          value={prop.value ?? ""}
                                          onChange={(e) => updatePropertyField(prop.id, { value: e.target.value })}
                                          placeholder="Hodnota"
                                        />
                                      );
                                    })()}
                                  </td>
                                  <td className="px-2 py-2">
                                    {(() => {
                                      const unit = prop.unit ?? "";
                                      const derived =
                                        unit.trim() !== "" && isPresetUnit(unit) ? unit.trim() : unit.trim() === "" ? "" : "__CUSTOM__";
                                      const mode = unitModeByPropId[prop.id] ?? derived;
                                      return (
                                        <div className="flex flex-col gap-1">
                                          <select
                                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                            value={mode}
                                            onChange={(e) => {
                                              const v = e.target.value;
                                              if (v === "__CUSTOM__") {
                                                // switch to custom input mode
                                                setUnitModeByPropId((prev) => ({ ...prev, [prop.id]: "__CUSTOM__" }));
                                                // if previously a preset (incl. empty), clear to make space for typing
                                                if (isPresetUnit(unit)) updatePropertyField(prop.id, { unit: "" });
                                                return;
                                              }
                                              setUnitModeByPropId((prev) => ({ ...prev, [prop.id]: v }));
                                              updatePropertyField(prop.id, { unit: v });
                                            }}
                                          >
                                            <option value="__CUSTOM__">Vlastní</option>
                                            {UNIT_PRESETS.map((p) => (
                                              <option key={p.value} value={p.value}>
                                                {p.label ?? (p.value || "—")}
                                              </option>
                                            ))}
                                          </select>
                                          {mode === "__CUSTOM__" && (
                                            <input
                                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                              placeholder="Zadejte jednotku"
                                              value={unit}
                                              onChange={(e) => {
                                                // ensure we stay in custom mode while typing
                                                if (unitModeByPropId[prop.id] !== "__CUSTOM__") {
                                                  setUnitModeByPropId((prev) => ({ ...prev, [prop.id]: "__CUSTOM__" }));
                                                }
                                                updatePropertyField(prop.id, { unit: e.target.value });
                                              }}
                                            />
                                          )}
                                        </div>
                                      );
                                    })()}
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

          {enumSaveDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
                <div className="mb-2 text-lg font-semibold text-slate-800">Uložit výčet do číselníků?</div>
                <div className="mb-3 text-sm text-slate-600">
                  Zadejte název číselníku. Po uložení se číselník vytvoří a {enumSaveDialog.type === "attribute" ? "tento atribut" : "tato vlastnost"} se na něj automaticky naváže.
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Název číselníku</label>
                    <input
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      value={enumSaveDialog.name}
                      onChange={(e) => setEnumSaveDialog((p) => (p ? { ...p, name: e.target.value } : p))}
                    />
                  </div>
                  <div className="rounded border border-slate-200 bg-slate-50 p-2">
                    <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Hodnoty</div>
                    <div className="flex flex-wrap gap-1">
                      {enumSaveDialog.values.slice(0, 40).map((v) => (
                        <span key={v} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                          {v}
                        </span>
                      ))}
                      {enumSaveDialog.values.length > 40 && (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-700">
                          +{enumSaveDialog.values.length - 40}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                    onClick={() => setEnumSaveDialog(null)}
                  >
                    Neukládat
                  </button>
                  <button
                    className="rounded bg-indigo-600 px-3 py-1 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                    onClick={() => {
                      onSaveEnumAsCodeList({
                        objectCode: object.code,
                        propertyId: enumSaveDialog.propertyId,
                        name: enumSaveDialog.name,
                        values: enumSaveDialog.values,
                        link: true,
                      });
                      setEnumSaveDialog(null);
                    }}
                    disabled={enumSaveDialog.values.length === 0}
                  >
                    Vytvořit a přiřadit
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal pro nápovědu k typům vztahů */}
          {showRelationHelpModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowRelationHelpModal(false)}>
              <div className="w-full max-w-2xl max-h-[80vh] overflow-auto rounded-lg bg-white p-5 shadow-xl m-4" onClick={(e) => e.stopPropagation()}>
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-lg font-semibold text-slate-800">Nápověda k typům vztahů (PartOf)</div>
                  <button
                    className="rounded p-1 hover:bg-slate-100"
                    onClick={() => setShowRelationHelpModal(false)}
                    title="Zavřít"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-slate-500">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                  </button>
                </div>
                <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {RELATION_TYPES_HELP_TEXT}
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                    onClick={() => setShowRelationHelpModal(false)}
                  >
                    Zavřít
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "partOf" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-slate-800">Součástí (PartOf)</div>
                <button className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500" onClick={addRelation}>
                  Přidat vztah
                </button>
                {object.requirements.relations.length > 0 && (
                  <>
                    <div className="h-4 w-px bg-slate-300" />
                    <button
                      className="rounded border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      onClick={selectAllRelations}
                    >
                      Označit všechny
                    </button>
                    {selectedRelations.size > 0 && (
                      <button
                        className="rounded border border-red-300 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                        onClick={deleteSelectedRelations}
                      >
                        Smazat označené ({selectedRelations.size})
                      </button>
                    )}
                  </>
                )}
              </div>
              <div className="text-xs text-slate-500">Vztahy mezi IFC entitami (IfcRelAggregates, IfcRelNests, ...)</div>
              <div className="overflow-auto rounded border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="w-8 px-2 py-2"></th>
                      <th className="px-2 py-2">Výskyt</th>
                      <th className="px-2 py-2">Součást entity</th>
                      <th className="px-2 py-2">PredefinedType</th>
                      <th className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <span>Vztah</span>
                          <a 
                            href="https://github.com/buildingSMART/IDS/blob/development/Documentation/UserManual/partof-facet.md" 
                            target="_blank" 
                            rel="noreferrer" 
                            className="text-slate-500 hover:text-indigo-600" 
                            title="Otevřít dokumentaci k PartOf facetu"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg aria-hidden xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
                              <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3ZM5 5h5v2H7v10h10v-3h2v5H5V5Z" />
                            </svg>
                          </a>
                        </div>
                      </th>
                      <th className="px-2 py-2">Poznámka</th>
                      <th className="px-2 py-2">Fáze</th>
                      <th className="px-2 py-2 text-right">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {object.requirements.relations.map((rel) => {
                      // Get predefined types for selected entity
                      const relEntityDef = rel.entityType ? schema?.entities[rel.entityType] : undefined;
                      const relPredefinedOptions = relEntityDef?.predefinedTypeValues ?? [];
                      
                      return (
                        <tr key={rel.id} className="border-t border-slate-200">
                          {/* CHECKBOX */}
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              checked={selectedRelations.has(rel.id)}
                              onChange={() => toggleRelationSelection(rel.id)}
                            />
                          </td>
                          {/* VÝSKYT */}
                          <td className="px-2 py-2">
                            <select 
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                              value={rel.occurrence ?? "optional"} 
                              onChange={(e) => {
                                const newValue = e.target.value as "required" | "prohibited" | "optional";
                                if (selectedRelations.has(rel.id) && selectedRelations.size > 0) {
                                  updateSelectedRelations({ occurrence: newValue });
                                } else {
                                  updateRelationField(rel.id, { occurrence: newValue });
                                }
                              }}
                            >
                              <option value="required">Požadováno (required)</option>
                              <option value="prohibited">Zakázáno (prohibited)</option>
                              <option value="optional">Možné (optional)</option>
                            </select>
                          </td>
                          {/* SOUČÁST ENTITY */}
                          <td className="px-2 py-2">
                            <select
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                              value={rel.entityType ?? ""}
                              onChange={(e) => {
                                // When entity changes, reset predefinedType
                                updateRelationField(rel.id, { 
                                  entityType: e.target.value,
                                  entityPredefinedType: "",
                                  // Also update legacy targetType for backwards compatibility
                                  targetType: e.target.value
                                });
                              }}
                            >
                              <option value="">-- Vyberte entitu --</option>
                              {entities.map((ent) => (
                                <option key={ent} value={ent}>
                                  {ent}
                                </option>
                              ))}
                            </select>
                          </td>
                          {/* PREDEFINED TYPE */}
                          <td className="px-2 py-2">
                            <select
                              className={`w-full rounded border border-slate-300 px-2 py-1 text-sm ${!rel.entityType ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}`}
                              value={rel.entityPredefinedType ?? ""}
                              onChange={(e) => updateRelationField(rel.id, { entityPredefinedType: e.target.value })}
                              disabled={!rel.entityType || relPredefinedOptions.length === 0}
                            >
                              <option value="">-- Není definováno --</option>
                              {relPredefinedOptions.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </td>
                          {/* VZTAH (TYP RELACE) */}
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-1">
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
                              <button
                                type="button"
                                className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-200 text-slate-600 hover:bg-indigo-100 hover:text-indigo-600 text-xs font-bold flex-shrink-0"
                                onClick={() => setShowRelationHelpModal(true)}
                                title="Zobrazit nápovědu k typům vztahů"
                              >
                                ?
                              </button>
                            </div>
                          </td>
                          {/* POZNÁMKA */}
                          <td className="px-2 py-2">
                            <input 
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm" 
                              value={rel.note ?? ""} 
                              onChange={(e) => updateRelationField(rel.id, { note: e.target.value })} 
                              placeholder="Poznámka k relaci" 
                            />
                          </td>
                          {/* FÁZE */}
                          <td className="px-2 py-2">
                            <PhaseSelector phases={phases} value={rel.phases} onChange={(ids) => updateRelationField(rel.id, { phases: ids })} />
                          </td>
                          {/* AKCE */}
                          <td className="px-2 py-2 text-right">
                            <button className="text-xs text-red-600 hover:underline" onClick={() => removeRequirement("relations", rel.id)}>
                              Odebrat
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {!object.requirements.relations.length && (
                      <tr>
                        <td className="px-2 py-3 text-sm text-slate-500" colSpan={8}>
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
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-slate-800">Materiál</div>
                <button className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500" onClick={addMaterial}>
                  Přidat materiál
                </button>
                {object.requirements.materials.length > 0 && (
                  <>
                    <div className="h-4 w-px bg-slate-300" />
                    <button
                      className="rounded border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      onClick={selectAllMaterials}
                    >
                      Označit všechny
                    </button>
                    {selectedMaterials.size > 0 && (
                      <button
                        className="rounded border border-red-300 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                        onClick={deleteSelectedMaterials}
                      >
                        Smazat označené ({selectedMaterials.size})
                      </button>
                    )}
                  </>
                )}
              </div>
              <div className="text-xs text-slate-500">Materiálové požadavky (IfcMaterial, IfcMaterialLayerSet, ...)</div>
              <div className="overflow-auto rounded border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="w-8 px-2 py-2"></th>
                      <th className="px-2 py-2">Výskyt</th>
                      <th className="px-2 py-2">Kategorie</th>
                      <th className="px-2 py-2">URI</th>
                      <th className="px-2 py-2">Omezení</th>
                      <th className="px-2 py-2">Hodnota</th>
                      <th className="px-2 py-2">Fáze</th>
                      <th className="px-2 py-2 text-right">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {object.requirements.materials.map((mat) => (
                      <tr key={mat.id} className="border-t border-slate-200">
                        {/* CHECKBOX */}
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={selectedMaterials.has(mat.id)}
                            onChange={() => toggleMaterialSelection(mat.id)}
                          />
                        </td>
                        {/* VÝSKYT */}
                        <td className="px-2 py-2">
                          <select 
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            value={mat.occurrence ?? "optional"} 
                            onChange={(e) => {
                              const newValue = e.target.value as "required" | "prohibited" | "optional";
                              if (selectedMaterials.has(mat.id) && selectedMaterials.size > 0) {
                                updateSelectedMaterials({ occurrence: newValue });
                              } else {
                                updateMaterialField(mat.id, { occurrence: newValue });
                              }
                            }}
                          >
                            <option value="required">Požadováno (required)</option>
                            <option value="prohibited">Zakázáno (prohibited)</option>
                            <option value="optional">Možné (optional)</option>
                          </select>
                        </td>
                        {/* KATEGORIE - s režimem (Není definováno / Jednoduchá hodnota / Výčet) */}
                        <td className="px-2 py-2">
                          {(() => {
                            const categoryMode = mat.categoryMode ?? "NONE";
                            const linkedCategoryCodeListId = (mat.extensions?.["categoryCodeListId"] as string | undefined) ?? undefined;
                            const linkedCategoryCodeList = linkedCategoryCodeListId ? codeLists.find((c) => c.id === linkedCategoryCodeListId) : undefined;

                            return (
                              <div className="flex flex-col gap-1">
                                {/* Výběr režimu */}
                                <select
                                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                                  value={categoryMode}
                                  onChange={(e) => updateMaterialField(mat.id, { categoryMode: e.target.value as any, category: "" })}
                                >
                                  {MATERIAL_CATEGORY_MODE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>

                                {/* Obsah podle režimu */}
                                {categoryMode === "NONE" && (
                                  <span className="text-slate-400 text-xs">—</span>
                                )}

                                {categoryMode === "SIMPLE" && (
                                  <input
                                    type="text"
                                    className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                    value={mat.category ?? ""}
                                    onChange={(e) => updateMaterialField(mat.id, { category: e.target.value })}
                                    placeholder="Zadejte hodnotu..."
                                  />
                                )}

                                {categoryMode === "ENUM" && (() => {
                                  const values = linkedCategoryCodeList ? (linkedCategoryCodeList.values ?? []) : parseEnumValues(mat.category ?? "");
                                  const displayValues = values.slice(0, 12);
                                  const remaining = values.length - displayValues.length;

                                  const detachFromCodeList = () => {
                                    const nextExtensions = { ...(mat.extensions ?? {}) } as Record<string, unknown>;
                                    delete (nextExtensions as any)["categoryCodeListId"];
                                    updateMaterialField(mat.id, { extensions: nextExtensions });
                                  };

                                  const linkToCodeList = (id: string) => {
                                    const list = codeLists.find((c) => c.id === id);
                                    if (!list) return;
                                    const nextExtensions = { ...(mat.extensions ?? {}) } as Record<string, unknown>;
                                    nextExtensions["categoryCodeListId"] = list.id;
                                    updateMaterialField(mat.id, { extensions: nextExtensions, category: formatEnumValues(list.values ?? []) });
                                  };

                                  return (
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-1">
                                        <select
                                          className="rounded border border-slate-300 px-2 py-1 text-xs"
                                          value={linkedCategoryCodeListId ? `codelist:${linkedCategoryCodeListId}` : "inline"}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            if (v === "inline") {
                                              detachFromCodeList();
                                              return;
                                            }
                                            if (v.startsWith("codelist:")) {
                                              linkToCodeList(v.replace("codelist:", ""));
                                            }
                                          }}
                                        >
                                          <option value="inline">Vlastní</option>
                                          {codeLists.length > 0 && <option disabled>— Číselníky —</option>}
                                          {codeLists.map((cl) => (
                                            <option key={cl.id} value={`codelist:${cl.id}`}>
                                              {cl.name}
                                            </option>
                                          ))}
                                        </select>
                                        {linkedCategoryCodeListId && (
                                          <button
                                            className="rounded border border-slate-300 px-2 py-1 text-[11px] hover:bg-slate-50"
                                            onClick={detachFromCodeList}
                                            title="Odpojit od číselníku"
                                          >
                                            Odpojit
                                          </button>
                                        )}
                                      </div>

                                      {!linkedCategoryCodeListId ? (
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="text"
                                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                            placeholder="Napiš hodnotu a stiskni Enter"
                                            value={categoryDraftByMatId[mat.id] ?? ""}
                                            onChange={(e) =>
                                              setCategoryDraftByMatId((prev) => ({ ...prev, [mat.id]: e.target.value }))
                                            }
                                            onKeyDown={(e) => {
                                              if (e.key !== "Enter") return;
                                              e.preventDefault();
                                              const raw = (categoryDraftByMatId[mat.id] ?? "").trim();
                                              if (!raw) return;
                                              const nextValues = Array.from(new Set([...values, raw]));
                                              updateMaterialField(mat.id, { category: formatEnumValues(nextValues) });
                                              setCategoryDraftByMatId((prev) => ({ ...prev, [mat.id]: "" }));
                                            }}
                                          />
                                          <button
                                            className={`flex items-center rounded border px-2 py-1 text-[11px] ${
                                              values.length === 0
                                                ? "border-slate-200 text-slate-400 cursor-not-allowed"
                                                : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-400"
                                            }`}
                                            disabled={values.length === 0}
                                            title="Uložit jako číselník a přiřadit"
                                            onClick={() => {
                                              setEnumSaveDialog({
                                                propertyId: `cat-${mat.id}`,
                                                name: "Kategorie materiálu",
                                                values,
                                                type: "property",
                                              });
                                            }}
                                          >
                                            <svg
                                              aria-hidden
                                              xmlns="http://www.w3.org/2000/svg"
                                              viewBox="0 0 24 24"
                                              fill="currentColor"
                                              className="h-4 w-4"
                                            >
                                              <path d="M6 2h11l3 3v17H4V4a2 2 0 0 1 2-2Zm12 8V6.5L16.5 5H6v5h12ZM6 20h12v-8H6v8Zm2-6h8v4H8v-4Z" />
                                            </svg>
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                                          Používá číselník: <span className="font-semibold text-slate-800">{linkedCategoryCodeList?.name ?? linkedCategoryCodeListId}</span>
                                        </div>
                                      )}

                                      <div className="flex flex-wrap gap-1">
                                        {displayValues.map((v) => (
                                          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700" title={v}>
                                            <span>{v}</span>
                                            {!linkedCategoryCodeListId && (
                                              <button
                                                className="text-slate-400 hover:text-slate-700"
                                                title="Odebrat hodnotu"
                                                onClick={() => {
                                                  const nextValues = values.filter((x) => x !== v);
                                                  updateMaterialField(mat.id, { category: formatEnumValues(nextValues) });
                                                }}
                                              >
                                                ×
                                              </button>
                                            )}
                                          </span>
                                        ))}
                                        {remaining > 0 && (
                                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-700">
                                            +{remaining}
                                          </span>
                                        )}
                                        {values.length === 0 && (
                                          <span className="text-[11px] text-slate-400">Žádné hodnoty.</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })()}
                        </td>
                        {/* URI */}
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            value={mat.uri ?? ""}
                            onChange={(e) => updateMaterialField(mat.id, { uri: e.target.value })}
                            placeholder="URI materiálu"
                          />
                        </td>
                        {/* OMEZENÍ */}
                        <td className="px-2 py-2">
                          <select
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            value={mat.constraint ?? "FILLED"}
                            onChange={(e) => updateMaterialField(mat.id, { constraint: e.target.value as any, value: "" })}
                          >
                            {MATERIAL_CONSTRAINT_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        {/* HODNOTA */}
                        <td className="px-2 py-2">
                          {(() => {
                            const isDisabled = mat.constraint === "FILLED" || mat.constraint === undefined;
                            const isLength = mat.constraint === "LENGTH";
                            const isPattern = mat.constraint === "PATTERN";
                            const isEnum = mat.constraint === "ENUM";
                            const isRange = mat.constraint === "RANGE";
                            const linkedCodeListId = (mat.extensions?.[ENUM_CODELIST_ID_KEY] as string | undefined) ?? undefined;
                            const linkedCodeList = linkedCodeListId ? codeLists.find((c) => c.id === linkedCodeListId) : undefined;

                            // Pro FILLED (Žádné) - editovatelné pole s placeholderem "Bez požadavku"
                            if (isDisabled) {
                              return (
                                <input
                                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                  value={mat.value ?? ""}
                                  onChange={(e) => updateMaterialField(mat.id, { value: e.target.value })}
                                  placeholder="Bez požadavku"
                                />
                              );
                            }

                            // Pro PATTERN - input s odkazem na regex101
                            if (isPattern) {
                              return (
                                <div className="flex items-center gap-1">
                                  <input
                                    className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                    value={mat.value ?? ""}
                                    onChange={(e) => updateMaterialField(mat.id, { value: e.target.value })}
                                    placeholder='Regex pattern (např. ^DT[0-9]{2}$)'
                                  />
                                  <a
                                    href="https://regex101.com/"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center text-slate-500 hover:text-indigo-600"
                                    title="Otevřít regex tester (regex101)"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <svg aria-hidden xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                                      <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3ZM5 5h5v2H7v10h10v-3h2v5H5V5Z" />
                                    </svg>
                                  </a>
                                </div>
                              );
                            }

                            // Pro ENUM (výčet) – inline hodnoty nebo číselník + badges + nabídka uložení
                            if (isEnum) {
                              const values = linkedCodeList ? (linkedCodeList.values ?? []) : parseEnumValues(mat.value ?? "");
                              const displayValues = values.slice(0, 24);
                              const remaining = values.length - displayValues.length;

                              const detachFromCodeList = () => {
                                const nextExtensions = { ...(mat.extensions ?? {}) } as Record<string, unknown>;
                                delete (nextExtensions as any)[ENUM_CODELIST_ID_KEY];
                                updateMaterialField(mat.id, { extensions: nextExtensions });
                              };

                              const linkToCodeList = (id: string) => {
                                const list = codeLists.find((c) => c.id === id);
                                if (!list) return;
                                const nextExtensions = { ...(mat.extensions ?? {}) } as Record<string, unknown>;
                                nextExtensions[ENUM_CODELIST_ID_KEY] = list.id;
                                updateMaterialField(mat.id, { extensions: nextExtensions, value: formatEnumValues(list.values ?? []) });
                              };

                              return (
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1">
                                    <select
                                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                                      value={linkedCodeListId ? `codelist:${linkedCodeListId}` : "inline"}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        if (v === "inline") {
                                          detachFromCodeList();
                                          return;
                                        }
                                        if (v.startsWith("codelist:")) {
                                          linkToCodeList(v.replace("codelist:", ""));
                                        }
                                      }}
                                    >
                                      <option value="inline">Vlastní</option>
                                      {codeLists.length > 0 && <option disabled>— Číselníky —</option>}
                                      {codeLists.map((cl) => (
                                        <option key={cl.id} value={`codelist:${cl.id}`}>
                                          {cl.name}
                                        </option>
                                      ))}
                                    </select>
                                    {linkedCodeListId && (
                                      <button
                                        className="rounded border border-slate-300 px-2 py-1 text-[11px] hover:bg-slate-50"
                                        onClick={detachFromCodeList}
                                        title="Odpojit od číselníku (ponechat hodnoty jako inline)"
                                      >
                                        Odpojit
                                      </button>
                                    )}
                                  </div>

                                  {!linkedCodeListId ? (
                                    <div className="flex items-center gap-1">
                                      <input
                                        className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                        placeholder="Napiš hodnotu a stiskni Enter"
                                        value={enumDraftByMatId[mat.id] ?? ""}
                                        onChange={(e) =>
                                          setEnumDraftByMatId((prev) => ({ ...prev, [mat.id]: e.target.value }))
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key !== "Enter") return;
                                          e.preventDefault();
                                          const raw = (enumDraftByMatId[mat.id] ?? "").trim();
                                          if (!raw) return;
                                          const nextValues = Array.from(new Set([...values, raw]));
                                          updateMaterialField(mat.id, { value: formatEnumValues(nextValues) });
                                          setEnumDraftByMatId((prev) => ({ ...prev, [mat.id]: "" }));
                                        }}
                                      />
                                      <button
                                        className={`flex items-center rounded border px-2 py-1 text-[11px] ${
                                          values.length === 0
                                            ? "border-slate-200 text-slate-400 cursor-not-allowed"
                                            : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-400"
                                        }`}
                                        disabled={values.length === 0}
                                        title="Uložit jako číselník a přiřadit"
                                        onClick={() => {
                                          const suggestedName = (mat.category || "").trim() || "Výčet materiálu";
                                          setEnumSaveDialog({
                                            propertyId: mat.id,
                                            name: suggestedName,
                                            values,
                                            type: "property", // použijeme property type pro uložení
                                          });
                                        }}
                                      >
                                        <svg
                                          aria-hidden
                                          xmlns="http://www.w3.org/2000/svg"
                                          viewBox="0 0 24 24"
                                          fill="currentColor"
                                          className="h-4 w-4"
                                        >
                                          <path d="M6 2h11l3 3v17H4V4a2 2 0 0 1 2-2Zm12 8V6.5L16.5 5H6v5h12ZM6 20h12v-8H6v8Zm2-6h8v4H8v-4Z" />
                                        </svg>
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                                      Používá číselník: <span className="font-semibold text-slate-800">{linkedCodeList?.name ?? linkedCodeListId}</span>
                                    </div>
                                  )}

                                  <div className="flex flex-wrap gap-1">
                                    {displayValues.map((v) => (
                                      <span key={v} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700" title={v}>
                                        <span>{v}</span>
                                        {!linkedCodeListId && (
                                          <button
                                            className="text-slate-400 hover:text-slate-700"
                                            title="Odebrat hodnotu"
                                            onClick={() => {
                                              const nextValues = values.filter((x) => x !== v);
                                              updateMaterialField(mat.id, { value: formatEnumValues(nextValues) });
                                            }}
                                          >
                                            ×
                                          </button>
                                        )}
                                      </span>
                                    ))}
                                    {remaining > 0 && (
                                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-700">
                                        +{remaining}
                                      </span>
                                    )}
                                    {values.length === 0 && (
                                      <span className="text-[11px] text-slate-400">Žádné hodnoty výčtu.</span>
                                    )}
                                  </div>
                                </div>
                              );
                            }

                            // Pro LENGTH - speciální UI pro zadávání délky
                            if (isLength) {
                              const lengthValue = mat.value ?? "";
                              const parseLengthValue = (val: string) => {
                                if (!val) return { type: "exact", exact: "", min: "", max: "" };
                                if (val.startsWith("min:")) {
                                  return { type: "min", exact: "", min: val.replace("min:", ""), max: "" };
                                }
                                if (val.startsWith("max:")) {
                                  return { type: "max", exact: "", min: "", max: val.replace("max:", "") };
                                }
                                if (/^\d+$/.test(val)) {
                                  return { type: "exact", exact: val, min: "", max: "" };
                                }
                                return { type: "exact", exact: val, min: "", max: "" };
                              };
                              
                              const parsed = parseLengthValue(lengthValue);
                              const currentType = parsed.type;
                              
                              const getCurrentValue = () => {
                                if (currentType === "exact") return parsed.exact;
                                if (currentType === "min") return parsed.min;
                                if (currentType === "max") return parsed.max;
                                return "";
                              };
                              
                              const handleTypeChange = (newType: string) => {
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
                                updateMaterialField(mat.id, { value: newValue });
                              };
                              
                              const handleValueChange = (newValue: string) => {
                                const valueToUse = newValue || "1";
                                let valueToSave = "";
                                if (currentType === "exact") {
                                  valueToSave = valueToUse;
                                } else if (currentType === "min") {
                                  valueToSave = `min:${valueToUse}`;
                                } else if (currentType === "max") {
                                  valueToSave = `max:${valueToUse}`;
                                }
                                updateMaterialField(mat.id, { value: valueToSave });
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

                            // Pro RANGE/Bounds - speciální UI pro zadávání ohraničení
                            if (isRange) {
                              const rangeValue = mat.value ?? "";
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
                              const handleTypeChange = (newType: string) => {
                                const v = (parsed as any).min || (parsed as any).max || "0";
                                let newValue = "";
                                if (newType === "min-inclusive") newValue = `min:${v}:inclusive`;
                                else if (newType === "min-exclusive") newValue = `min:${v}:exclusive`;
                                else if (newType === "max-inclusive") newValue = `max:${v}:inclusive`;
                                else if (newType === "max-exclusive") newValue = `max:${v}:exclusive`;
                                else if (newType === "range") newValue = `min:${v}:inclusive|max:${(parsed as any).max || "0"}:inclusive`;
                                updateMaterialField(mat.id, { value: newValue });
                              };

                              const handleValueChange = (v1: string, v2?: string) => {
                                const p = parsed as any;
                                let newValue = "";
                                const type = p.hasMin && p.hasMax ? "range" : p.hasMin ? (p.minInclusive ? "min-inclusive" : "min-exclusive") : (p.maxInclusive ? "max-inclusive" : "max-exclusive");
                                
                                if (type === "min-inclusive") newValue = `min:${v1}:inclusive`;
                                else if (type === "min-exclusive") newValue = `min:${v1}:exclusive`;
                                else if (type === "max-inclusive") newValue = `max:${v1}:inclusive`;
                                else if (type === "max-exclusive") newValue = `max:${v1}:exclusive`;
                                else if (type === "range") newValue = `min:${v1}:inclusive|max:${v2 ?? p.max}:inclusive`;
                                updateMaterialField(mat.id, { value: newValue });
                              };

                              const p = parsed as any;
                              const currentType = p.hasMin && p.hasMax ? "range" : p.hasMin ? (p.minInclusive ? "min-inclusive" : "min-exclusive") : (p.maxInclusive ? "max-inclusive" : "max-exclusive");

                              return (
                                <div className="flex flex-col gap-1">
                                  <select
                                    className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                                    value={currentType}
                                    onChange={(e) => handleTypeChange(e.target.value)}
                                  >
                                    <option value="min-inclusive">≥ (větší nebo rovno)</option>
                                    <option value="min-exclusive">&gt; (větší než)</option>
                                    <option value="max-inclusive">≤ (menší nebo rovno)</option>
                                    <option value="max-exclusive">&lt; (menší než)</option>
                                    <option value="range">Rozmezí (od-do)</option>
                                  </select>
                                  {currentType === "range" ? (
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number"
                                        className="w-full rounded border border-slate-300 px-1 py-1 text-sm"
                                        value={p.min}
                                        onChange={(e) => handleValueChange(e.target.value, p.max)}
                                        placeholder="Min"
                                      />
                                      <span className="text-xs text-slate-400">-</span>
                                      <input
                                        type="number"
                                        className="w-full rounded border border-slate-300 px-1 py-1 text-sm"
                                        value={p.max}
                                        onChange={(e) => handleValueChange(p.min, e.target.value)}
                                        placeholder="Max"
                                      />
                                    </div>
                                  ) : (
                                    <input
                                      type="number"
                                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                      value={p.hasMin ? p.min : p.max}
                                      onChange={(e) => handleValueChange(e.target.value)}
                                      placeholder="Hodnota"
                                    />
                                  )}
                                </div>
                              );
                            }

                            // Fallback - prostý input
                            return (
                              <input
                                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                value={mat.value ?? ""}
                                onChange={(e) => updateMaterialField(mat.id, { value: e.target.value })}
                              />
                            );
                          })()}
                        </td>
                        {/* FÁZE */}
                        <td className="px-2 py-2">
                          <PhaseSelector phases={phases} value={mat.phases} onChange={(ids) => updateMaterialField(mat.id, { phases: ids })} />
                        </td>
                        {/* AKCE */}
                        <td className="px-2 py-2 text-right">
                          <button className="text-xs text-red-600 hover:underline" onClick={() => removeRequirement("materials", mat.id)}>
                            Odebrat
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!object.requirements.materials.length && (
                      <tr>
                        <td className="px-2 py-3 text-sm text-slate-500" colSpan={8}>
                          Žádné materiálové požadavky.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "classification" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-slate-800">Klasifikace</div>
                <button className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500" onClick={addClassification}>
                  Přidat klasifikaci
                </button>
                {object.requirements.classifications.length > 0 && (
                  <>
                    <div className="h-4 w-px bg-slate-300" />
                    <button
                      className="rounded border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      onClick={selectAllClassifications}
                    >
                      Označit všechny
                    </button>
                    {selectedClassifications.size > 0 && (
                      <button
                        className="rounded border border-red-300 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                        onClick={deleteSelectedClassifications}
                      >
                        Smazat označené ({selectedClassifications.size})
                      </button>
                    )}
                  </>
                )}
              </div>
              <div className="text-xs text-slate-500">Záznamy IfcClassificationReference</div>
              <div className="overflow-auto rounded border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="w-8 px-2 py-2"></th>
                      <th className="px-2 py-2">Systém</th>
                      <th className="px-2 py-2">Identifikace</th>
                      <th className="px-2 py-2">Název</th>
                      <th className="px-2 py-2">Popis</th>
                      <th className="px-2 py-2">Fáze</th>
                      <th className="px-2 py-2 text-right">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {object.requirements.classifications.map((cls) => (
                      <tr key={cls.id} className="border-t border-slate-200">
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            className={`h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 ${cls.readOnly ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                            checked={selectedClassifications.has(cls.id)}
                            onChange={() => !cls.readOnly && toggleClassificationSelection(cls.id)}
                            disabled={cls.readOnly}
                            title={cls.readOnly ? "Primární klasifikace - nelze vybrat" : ""}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className={`w-full rounded border border-slate-300 px-2 py-1 text-sm ${cls.readOnly ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}`}
                            value={cls.system}
                            onChange={(e) =>
                              updateRequirements((reqs) => {
                                reqs.classifications = reqs.classifications.map((c) => (c.id === cls.id ? { ...c, system: e.target.value } : c));
                              })
                            }
                            disabled={cls.readOnly}
                            placeholder="Klasifikační systém"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className={`w-full rounded border border-slate-300 px-2 py-1 text-sm ${cls.readOnly ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}`}
                            value={cls.identification ?? cls.code ?? ""}
                            onChange={(e) =>
                              updateRequirements((reqs) => {
                                reqs.classifications = reqs.classifications.map((c) => (c.id === cls.id ? { ...c, identification: e.target.value, code: e.target.value } : c));
                              })
                            }
                            disabled={cls.readOnly}
                            placeholder="Kód klasifikace"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className={`w-full rounded border border-slate-300 px-2 py-1 text-sm ${cls.readOnly ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}`}
                            value={cls.name}
                            onChange={(e) =>
                              updateRequirements((reqs) => {
                                reqs.classifications = reqs.classifications.map((c) => (c.id === cls.id ? { ...c, name: e.target.value } : c));
                              })
                            }
                            disabled={cls.readOnly}
                            placeholder="Název položky"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className={`w-full rounded border border-slate-300 px-2 py-1 text-sm ${cls.readOnly ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}`}
                            value={cls.description ?? ""}
                            onChange={(e) =>
                              updateRequirements((reqs) => {
                                reqs.classifications = reqs.classifications.map((c) => (c.id === cls.id ? { ...c, description: e.target.value } : c));
                              })
                            }
                            disabled={cls.readOnly}
                            placeholder="Popis"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <PhaseSelector
                            phases={phases}
                            value={cls.phases}
                            onChange={(ids) =>
                              updateRequirements((reqs) => {
                                reqs.classifications = reqs.classifications.map((c) => (c.id === cls.id ? { ...c, phases: ids } : c));
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          {!cls.readOnly && (
                            <button className="text-xs text-red-600 hover:underline" onClick={() => removeRequirement("classifications", cls.id)}>
                              Odebrat
                            </button>
                          )}
                          {cls.readOnly && (
                            <span className="text-xs text-slate-400" title="Tato klasifikace je z primárního systému a nelze ji odebrat">
                              Primární
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!object.requirements.classifications.length && (
                      <tr>
                        <td className="px-2 py-3 text-sm text-slate-500" colSpan={7}>
                          Žádné klasifikace nejsou definovány.
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
