import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClassificationNode } from "../../classification/types";
import type { SchemaIndex } from "../../schema/types";
import { makeId } from "../../utils/id";
import type { ClassificationSystemEntry, CodeList, MaterialRequirement, Phase, ProjectObject, PropertyRequirement, RelationRequirement } from "../../project/types";
import { ENUM_CODELIST_ID_KEY, formatEnumValues, parseEnumValues } from "../../project/enumeration";
import { DocLink } from "./DocLink";

type TabKey = "attributes" | "properties" | "partOf" | "material" | "classification" | "ids";
type IdsSubTabKey = "schema" | "readable";
type OccurrenceFilter = "all" | "required" | "prohibited" | "optional";

const IFC_DOC_BASE = "https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/lexical";
const getIfcDocUrl = (identifier: string | undefined) => (identifier ? `${IFC_DOC_BASE}/${identifier}.htm` : undefined);

const PhaseSelector: React.FC<{ phases: Phase[]; value?: string[]; onChange: (ids: string[]) => void }> = ({ phases, value, onChange }) => {
  const selected = new Set(value ?? []);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      // Prevent unchecking the last phase - must have at least one
      if (next.size <= 1) return;
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(Array.from(next));
  };
  return (
    <div className="flex flex-wrap gap-2">
      {phases.map((phase) => {
        const isChecked = selected.has(phase.id);
        const isLastChecked = isChecked && selected.size === 1;
        return (
          <label 
            key={phase.id} 
            className={`inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs ${isLastChecked ? "opacity-70 cursor-not-allowed" : ""}`}
            title={isLastChecked ? "Musí být alespoň jedna fáze zaškrtnutá" : ""}
          >
            <input 
              type="checkbox" 
              className={`h-4 w-4 ${isLastChecked ? "cursor-not-allowed" : ""}`} 
              checked={isChecked} 
              onChange={() => toggle(phase.id)} 
              disabled={isLastChecked}
            />
            <span className="font-semibold">{phase.code}</span>
          </label>
        );
      })}
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
  classificationSystemEntries: ClassificationSystemEntry[];
  onSaveEnumAsCodeList: (opts: { objectCode: string; propertyId: string; name: string; values: string[]; link: boolean }) => void;
}

const TAB_LABELS: Record<TabKey, string> = {
  attributes: "Atributy",
  properties: "Vlastnosti",
  partOf: "Součástí",
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

// Escape special XML characters
const escapeXml = (str: string): string => {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

// Valid IFC versions according to IDS schema
const VALID_IFC_VERSIONS = ["IFC2X3", "IFC4", "IFC4X3_ADD2"] as const;
type IdsIfcVersion = typeof VALID_IFC_VERSIONS[number];

// Valid cardinality values
type ConditionalCardinality = "required" | "prohibited" | "optional";
type SimpleCardinality = "required" | "prohibited";

// Helper to normalize entity name to uppercase (IDS requires uppercase)
const normalizeEntityName = (name: string): string => {
  if (!name) return "IFCBUILDINGELEMENT";
  // Convert IfcWall to IFCWALL
  return name.toUpperCase();
};

// Valid IDS data types from DataTypes.md (IFC4X3)
// These are the exact type names that can be used in the dataType attribute
const VALID_IDS_DATA_TYPES = new Set([
  // Common simple types
  "IFCBOOLEAN", "IFCLOGICAL", "IFCINTEGER", "IFCREAL", "IFCTEXT", "IFCLABEL", "IFCIDENTIFIER",
  // Measure types
  "IFCLENGTHMEASURE", "IFCAREAMEASURE", "IFCVOLUMEMEASURE", "IFCMASSMEASURE", "IFCTIMEMEASURE",
  "IFCTHERMODYNAMICTEMPERATUREMEASURE", "IFCELECTRICCURRENTMEASURE", "IFCLUMINOUSINTENSITYMEASURE",
  "IFCAMOUNTOFSUBSTANCEMEASURE", "IFCPLANEANGLEMEASURE", "IFCSOLIDANGLEMEASURE", "IFCPRESSUREMEASURE",
  "IFCFORCEMEASURE", "IFCENERGYMEASURE", "IFCPOWERMEASURE", "IFCFREQUENCYMEASURE", "IFCELECTRICVOLTAGEMEASURE",
  "IFCELECTRICRESISTANCEMEASURE", "IFCELECTRICCONDUCTANCEMEASURE", "IFCELECTRICCAPACITANCEMEASURE",
  "IFCMAGNETICFLUXMEASURE", "IFCMAGNETICFLUXDENSITYMEASURE", "IFCINDUCTANCEMEASURE", "IFCLUMINOUSFLUXMEASURE",
  "IFCILLUMINANCEMEASURE", "IFCRADIOACTIVITYMEASURE", "IFCMONETARYMEASURE", "IFCCOUNTMEASURE",
  "IFCPOSITIVELENGTHENTHMEASURE", "IFCNONNEGATIVELENGTHMEASURE", "IFCPOSITIVELENGTHMEASURE",
  "IFCPOSITIVEPLANEANGLEMEASURE", "IFCRATIOMEASURE", "IFCNORMALISEDRATIOMEASURE", "IFCPOSITIVERATIOMEASURE",
  "IFCCONTEXTDEPENDENTMEASURE", "IFCDESCRIPTIVEMEASURE", "IFCPARAMETERVALUE", "IFCNUMERICMEASURE",
  "IFCTHERMALCONDUCTIVITYMEASURE", "IFCTHERMALTRANSMITTANCEMEASURE", "IFCTHERMALRESISTANCEMEASURE",
  "IFCTHERMALADMITTANCEMEASURE", "IFCSPECIFICHEATCAPACITYMEASURE", "IFCHEATINGVALUEMEASURE",
  "IFCHEATFLUXDENSITYMEASURE", "IFCISOTHERMALMOISTURECAPACITYMEASURE", "IFCVAPORPERMEABILITYMEASURE",
  "IFCMOISTURECREDITRYMEASURE", "IFCDYNAMICVISCOSITYMEASURE", "IFCKINEMATICVISCOSITYMEASURE",
  "IFCMODULUSOFELASTICITYMEASURE", "IFCMODULUSOFSUBGRADEREACTIONMEASURE", "IFCSHEARMODULUSMEASURE",
  "IFCLINEARFORCEMEASURE", "IFCPLANARFORCEMEASURE", "IFCLINEARSTIFFNESSMEASURE", "IFCROTATIONALSTIFFNESSMEASURE",
  "IFCMOMENTOFINERTIAMEASURE", "IFCSECTIONALAREAINTEGRALMEASURE", "IFCSECTIONMODULUSMEASURE",
  "IFCWARPINGCONSTANTMEASURE", "IFCWARPINGMOMENTMEASURE", "IFCMASSDENSITYMEASURE", "IFCMASSFLOWRATEMEASURE",
  "IFCMASSPERLENGTHMEASURE", "IFCVOLUMETRICFLOWRATEMEASURE", "IFCROTATIONALFREQUENCYMEASURE",
  "IFCROTATIONALMASSMEASURE", "IFCSOUNDPOWERMEASURE", "IFCSOUNDPRESSUREMEASURE", "IFCSOUNDPOWERLEVELMEASURE",
  "IFCSOUNDPRESSURELEVELMEASURE", "IFCACCELERATIONMEASURE", "IFCANGULARVELOCITYMEASURE", "IFCLINEARVELOCITYMEASURE",
  "IFCCURVATUREMEASURE", "IFCTORQUEMEASURE", "IFCABSORBEDDOSEMEASURE", "IFCDOSEEQUIVALENTMEASURE",
  "IFCIONCONCENTRATIONMEASURE", "IFCTEMPERATUREGRADIENTMEASURE", "IFCTEMPERATURERATEOFCHANGEMEASURE",
  "IFCAREADENSITYMEASURE",
  // Date/time types
  "IFCDATE", "IFCDATETIME", "IFCTIME", "IFCDURATION", "IFCTIMESTAMP",
  // Other types
  "IFCGLOBALLYUNIQUEID", "IFCURIREFERENCE",
  // Common ENUM types from DataTypes.md (for PEnum_ mapping)
  "IFCASSEMBLYPLACEENUM", "IFCACTIONREQUESTTYPEENUM", "IFCACTIONSOURCETYPEENUM", "IFCACTIONTYPEENUM",
  "IFCACTUATORTYPEENUM", "IFCADDRESSTYPEENUM", "IFCAIRTERMINALBOXTYPEENUM", "IFCAIRTERMINALTYPEENUM",
  "IFCAIRTOAIRHEATRECOVERYTYPEENUM", "IFCALARMTYPEENUM", "IFCANALYSISMODELTYPEENUM", "IFCANALYSISTHEORYTYPEENUM",
  "IFCBEAMTYPEENUM", "IFCBENCHMARKENUM", "IFCBOILERTYPEENUM", "IFCBUILDINGELEMENTPROXYTYPEENUM",
  "IFCBUILDINGSYSTEMTYPEENUM", "IFCBURNERTYPEENUM", "IFCCABLECARRIERFITTINGTYPEENUM", "IFCCABLECARRIERSEGMENTTYPEENUM",
  "IFCCABLEFITTINGTYPEENUM", "IFCCABLESEGMENTTYPEENUM", "IFCCHANGEACTIONENUM", "IFCCHILLERTYPEENUM",
  "IFCCHIMNEYTYPEENUM", "IFCCOILTYPEENUM", "IFCCOLUMNTYPEENUM", "IFCCOMMUNICATIONSAPPLIANCETYPEENUM",
  "IFCCOMPRESSORTYPEENUM", "IFCCONDENSERTYPEENUM", "IFCCONNECTIONTYPEENUM", "IFCCONSTRAINTENUM",
  "IFCCONTROLLERTYPEENUM", "IFCCOOLEDBEAMTYPEENUM", "IFCCOOLINGTOWERTYPEENUM", "IFCCOSTSCHEDULETYPEENUM",
  "IFCCOVERINGTYPEENUM", "IFCCURTAINWALLTYPEENUM", "IFCDAMPERTYPEENUM", "IFCDATAORIGINENUM",
  "IFCDIRECTIONSENSEENUM", "IFCDISTRIBUTIONCHAMBERELEMENTTYPEENUM", "IFCDISTRIBUTIONPORTTYPEENUM",
  "IFCDISTRIBUTIONSYSTEMENUM", "IFCDOCUMENTCONFIDENTIALITYENUM", "IFCDOCUMENTSTATUSENUM",
  "IFCDOORPANELOPERATIONENUM", "IFCDOORPANELPOSITIONENUM", "IFCDOORTYPEENUM", "IFCDOORTYPEOPERATIONENUM",
  "IFCDUCTFITTINGTYPEENUM", "IFCDUCTSEGMENTTYPEENUM", "IFCDUCTSILENCERTYPEENUM",
  "IFCELECTRICAPPLIANCETYPEENUM", "IFCELECTRICDISTRIBUTIONBOARDTYPEENUM", "IFCELECTRICFLOWSTORAGEDEVICETYPEENUM",
  "IFCELECTRICGENERATORTYPEENUM", "IFCELECTRICMOTORTYPEENUM", "IFCELECTRICTIMECONTROLTYPEENUM",
  "IFCELEMENTASSEMBLYTYPEENUM", "IFCELEMENTCOMPOSITIONENUM", "IFCENGINETYPEENUM",
  "IFCEVAPORATIVECOOLERTYPEENUM", "IFCEVAPORATORTYPEENUM", "IFCEVENTTRIGGERTYPEENUM", "IFCEVENTTYPEENUM",
  "IFCEXTERNALSPATIALELEMENTTYPEENUM", "IFCFACILITYPARTCOMMONTYPEENUM", "IFCFACILITYUSAGEENUM",
  "IFCFANTYPEENUM", "IFCFASTENERTYPEENUM", "IFCFILTERTYPEENUM", "IFCFIRESUPPRESSIONTERMINALTYPEENUM",
  "IFCFLOWDIRECTIONENUM", "IFCFLOWINSTRUMENTTYPEENUM", "IFCFLOWMETERTYPEENUM",
  "IFCFOOTINGTYPEENUM", "IFCFURNITURETYPEENUM", "IFCGEOGRAPHICELEMENTTYPEENUM", "IFCGEOMETRICPROJECTIONENUM",
  "IFCGLOBALORLOCALENUM", "IFCGRIDTYPEENUM", "IFCHEATEXCHANGERTYPEENUM", "IFCHUMIDIFIERTYPEENUM",
  "IFCINTERCEPTORTYPEENUM", "IFCINTERNALOREXTERNALENUM", "IFCINVENTORYTYPEENUM",
  "IFCJUNCTIONBOXTYPEENUM", "IFCLAMPTYPEENUM", "IFCLAYERSETDIRECTIONENUM",
  "IFCLIGHTDISTRIBUTIONCURVEENUM", "IFCLIGHTEMISSIONSOURCEENUM", "IFCLIGHTFIXTURETYPEENUM",
  "IFCLOADGROUPTYPEENUM", "IFCLOGICALOPERATORENUM", "IFCMECHANICALFASTENERTYPEENUM", "IFCMEDICALDEVICETYPEENUM",
  "IFCMEMBERTYPEENUM", "IFCMOTORCONNECTIONTYPEENUM", "IFCOBJECTIVEENUM", "IFCOCCUPANTTYPEENUM",
  "IFCOPENINGELEMENTTYPEENUM", "IFCOUTLETTYPEENUM", "IFCPERFORMANCEHISTORYTYPEENUM",
  "IFCPERMEABLECOVERINGOPERATIONENUM", "IFCPERMITTYPEENUM", "IFCPHYSICALORVIRTUALENUM",
  "IFCPILECONSTRUCTIONENUM", "IFCPILETYPEENUM", "IFCPIPEFITTINGTYPEENUM", "IFCPIPESEGMENTTYPEENUM",
  "IFCPLATETYPEENUM", "IFCPROCEDURETYPEENUM", "IFCPROFILETYPEENUM", "IFCPROJECTEDORTRUELENGTHENUM",
  "IFCPROJECTIONELEMENTTYPEENUM", "IFCPROJECTORDERTYPEENUM", "IFCPROPERTYSETTEMPLATETYPEENUM",
  "IFCPROTECTIVEDEVICETRIPPINGUNITTYPEENUM", "IFCPROTECTIVEDEVICETYPEENUM", "IFCPUMPTYPEENUM",
  "IFCRAILINGTYPEENUM", "IFCRAMPFLIGHTTYPEENUM", "IFCRAMPTYPEENUM", "IFCRECURRENCETYPEENUM",
  "IFCREFERENTTYPEENUM", "IFCREFLECTANCEMETHODENUM", "IFCREINFORCINGBARROLEENUM", "IFCREINFORCINGBARSURFACEENUM",
  "IFCREINFORCINGBARTYPEENUM", "IFCREINFORCINGMESHTYPEENUM", "IFCROLEENUM", "IFCROOFTYPEENUM",
  "IFCSANITARYTERMINALTYPEENUM", "IFCSECTIONTYPEENUM", "IFCSENSORTYPEENUM", "IFCSEQUENCEENUM",
  "IFCSHADINGDEVICETYPEENUM", "IFCSIMPLEPROPERTYTEMPLATETYPEENUM", "IFCSLABTYPEENUM", "IFCSOLARDEVICETYPEENUM",
  "IFCSPACEHEATERTYPEENUM", "IFCSPACETYPEENUM", "IFCSPATIALZONETYPEENUM", "IFCSTACKTERMINALTYPEENUM",
  "IFCSTAIRFLIGHTTYPEENUM", "IFCSTAIRTYPEENUM", "IFCSTATEENUM", "IFCSTRUCTURALCURVEACTIVITYTYPEENUM",
  "IFCSTRUCTURALCURVEMEMBERTYPEENUM", "IFCSTRUCTURALSURFACEACTIVITYTYPEENUM", "IFCSTRUCTURALSURFACEMEMBERTYPEENUM",
  "IFCSUBCONTRACTRESOURCETYPEENUM", "IFCSURFACEFEATURETYPEENUM", "IFCSWITCHINGDEVICETYPEENUM",
  "IFCSYSTEMFURNITUREELEMENTTYPEENUM", "IFCTANKTYPEENUM", "IFCTASKDURATIONENUM", "IFCTASKTYPEENUM",
  "IFCTENDONANCHORTYPEENUM", "IFCTENDONTYPEENUM", "IFCTIMESERIESDATATYPEENUM", "IFCTRANSFORMERTYPEENUM",
  "IFCTRANSPORTELEMENTTYPEENUM", "IFCTUBEBUNDLETYPEENUM", "IFCUNITARYCONTROLELEMENTTYPEENUM",
  "IFCUNITARYEQUIPMENTTYPEENUM", "IFCUNITENUM", "IFCVALVETYPEENUM", "IFCVIBRATIONISOLATORTYPEENUM",
  "IFCVOIDINGFEATURETYPEENUM", "IFCWALLTYPEENUM", "IFCWASTETERMINALTYPEENUM",
  "IFCWINDOWPANELOPERATIONENUM", "IFCWINDOWPANELPOSITIONENUM", "IFCWINDOWTYPEENUM", "IFCWINDOWTYPEPARTITIONINGENUM",
  "IFCWORKCALENDARTYPEENUM", "IFCWORKPLANTYPEENUM", "IFCWORKSCHEDULETYPEENUM",
]);

// Mapping from common schema data types to valid IDS data types
const DATA_TYPE_MAPPING: Record<string, string> = {
  // Direct IFC types (case-insensitive)
  "ifcboolean": "IFCBOOLEAN",
  "ifclogical": "IFCLOGICAL",
  "ifcinteger": "IFCINTEGER",
  "ifcreal": "IFCREAL",
  "ifctext": "IFCTEXT",
  "ifclabel": "IFCLABEL",
  "ifcidentifier": "IFCIDENTIFIER",
  "ifclengthmeasure": "IFCLENGTHMEASURE",
  "ifcareameasure": "IFCAREAMEASURE",
  "ifcvolumemeasure": "IFCVOLUMEMEASURE",
  "ifcmassmeasure": "IFCMASSMEASURE",
  "ifctimemeasure": "IFCTIMEMEASURE",
  "ifccountmeasure": "IFCCOUNTMEASURE",
  "ifcthermodynamictemperaturemeasure": "IFCTHERMODYNAMICTEMPERATUREMEASURE",
  "ifcpressuremeasure": "IFCPRESSUREMEASURE",
  "ifcpowermeasure": "IFCPOWERMEASURE",
  "ifcenergymeasure": "IFCENERGYMEASURE",
  "ifcelectricvoltagemeasure": "IFCELECTRICVOLTAGEMEASURE",
  "ifcelectriccurrentmeasure": "IFCELECTRICCURRENTMEASURE",
  "ifcpositivelengthenthmeasure": "IFCPOSITIVELENGTHMEASURE",
  "ifcnonnegativelengthmeasure": "IFCNONNEGATIVELENGTHMEASURE",
  "ifcplaneanglemeasure": "IFCPLANEANGLEMEASURE",
  "ifcratiomeasure": "IFCRATIOMEASURE",
  "ifcnormalisedratiomeasure": "IFCNORMALISEDRATIOMEASURE",
  "ifcmonetarymeasure": "IFCMONETARYMEASURE",
  "ifcthermalconductivitymeasure": "IFCTHERMALCONDUCTIVITYMEASURE",
  "ifcthermaltransmittancemeasure": "IFCTHERMALTRANSMITTANCEMEASURE",
  "ifcmassdensitymeasure": "IFCMASSDENSITYMEASURE",
  "ifcdate": "IFCDATE",
  "ifcdatetime": "IFCDATETIME",
  "ifctime": "IFCTIME",
  "ifcduration": "IFCDURATION",
  "ifcgloballyuniqueid": "IFCGLOBALLYUNIQUEID",
  "ifcurireference": "IFCURIREFERENCE",
  
  // IFC Quantity types → OMIT dataType (let IDS infer from Qto_ definition)
  // These return empty string to signal "don't include dataType attribute"
  // IfcQuantityWeight, IfcQuantityLength, etc. are not valid IDS dataTypes
  // The actual value types (IFCMASSMEASURE, IFCLENGTHMEASURE) will be inferred by validator
  
  // Additional IFC property value types - also omit for complex types
  // These are container types, not actual data types
  
  // Common string/text types
  "string": "IFCLABEL",
  "text": "IFCTEXT",
  
  // Common numeric types
  "number": "IFCREAL",
  "integer": "IFCINTEGER",
  "real": "IFCREAL",
  "double": "IFCREAL",
  "float": "IFCREAL",
  
  // Boolean
  "boolean": "IFCBOOLEAN",
  "bool": "IFCBOOLEAN",
  
  // Positive/non-negative length measures
  "ifcpositivelengthmeasure": "IFCPOSITIVELENGTHMEASURE",
};

// Types that should NOT have dataType attribute in IDS output
// These are IFC container/quantity types that are not valid IDS dataTypes
// The IDS validator will infer the correct type from Qto_/Pset_ definitions
const OMIT_DATATYPE_PATTERNS = [
  "ifcquantity",        // IfcQuantityWeight, IfcQuantityLength, IfcQuantityArea, etc.
  "ifcproperty",        // IfcPropertySingleValue, IfcPropertyEnumeratedValue, etc.
];

// Helper to map IFC data types to valid IDS data types
// Returns undefined if dataType should be omitted from IDS output
const mapDataTypeToIds = (dataType?: string): string | undefined => {
  if (!dataType) return undefined;
  
  const dt = dataType.trim();
  const dtLower = dt.toLowerCase();
  
  // FIRST: Check if this type should be OMITTED from IDS output
  // IFC Quantity types (IfcQuantityWeight, etc.) and Property types are NOT valid IDS dataTypes
  // The IDS validator will infer the correct measure type from the Qto_ definition
  for (const pattern of OMIT_DATATYPE_PATTERNS) {
    if (dtLower.startsWith(pattern)) {
      return undefined; // Omit dataType attribute entirely
    }
  }
  
  // Check direct mapping
  if (DATA_TYPE_MAPPING[dtLower]) {
    return DATA_TYPE_MAPPING[dtLower];
  }
  
  // Handle PEnum_ types - these are Property Enumerations stored as IfcLabel in IFC
  // PEnum_AssemblyPlace → IFCLABEL (not IFCASSEMBLYPLACEENUM!)
  if (dtLower.startsWith("penum_") || dtLower.startsWith("penum")) {
    return "IFCLABEL";
  }
  
  // Try to find in valid types (case-insensitive)
  const dtUpper = dt.toUpperCase();
  if (VALID_IDS_DATA_TYPES.has(dtUpper)) {
    return dtUpper;
  }
  
  // Handle Ifc prefix - normalize to uppercase and check
  if (dtLower.startsWith("ifc")) {
    const normalized = dtUpper;
    if (VALID_IDS_DATA_TYPES.has(normalized)) {
      return normalized;
    }
    // If ends with MEASURE and is in valid types, use it
    if (normalized.endsWith("MEASURE") && VALID_IDS_DATA_TYPES.has(normalized)) {
      return normalized;
    }
    // If ends with ENUM and is in valid types, use it
    if (normalized.endsWith("ENUM") && VALID_IDS_DATA_TYPES.has(normalized)) {
      return normalized;
    }
  }
  
  // Default fallback for unknown types
  // If it looks like an enum type, use IFCLABEL
  if (dtLower.includes("enum") || dtLower.includes("type")) {
    return "IFCLABEL";
  }
  
  // For other unknown types, return IFCLABEL as safe default for strings
  return "IFCLABEL";
};

// Generate constraint XML for IDS
const generateConstraintXml = (
  constraint?: string,
  value?: string,
  indent: string = "          "
): string => {
  const c = (constraint ?? "FILLED").toUpperCase();
  const val = value ?? "";
  
  // If no value specified, no restriction
  if (!val) {
    return "";
  }
  
  // FILLED constraint with value = simple value requirement
  if (c === "FILLED") {
    return `${indent}<ids:value>\n${indent}  <ids:simpleValue>${escapeXml(val)}</ids:simpleValue>\n${indent}</ids:value>`;
  }
  
  if (c === "ENUM") {
    const values = val.split("|").map((v) => v.trim()).filter(Boolean);
    if (values.length === 0) return "";
    if (values.length === 1) {
      return `${indent}<ids:value>\n${indent}  <ids:simpleValue>${escapeXml(values[0])}</ids:simpleValue>\n${indent}</ids:value>`;
    }
    // Multiple values - use xs:restriction with enumeration
    let xml = `${indent}<ids:value>\n${indent}  <xs:restriction base="xs:string">`;
    values.forEach((v) => {
      xml += `\n${indent}    <xs:enumeration value="${escapeXml(v)}" />`;
    });
    xml += `\n${indent}  </xs:restriction>\n${indent}</ids:value>`;
    return xml;
  }
  
  if (c === "PATTERN") {
    return `${indent}<ids:value>\n${indent}  <xs:restriction base="xs:string">\n${indent}    <xs:pattern value="${escapeXml(val)}" />\n${indent}  </xs:restriction>\n${indent}</ids:value>`;
  }
  
  if (c === "RANGE") {
    // Parse range value like ">=10 AND <=100" or "10-100"
    const parts = val.split(/\s*(?:AND|,|;)\s*/i);
    let xml = `${indent}<ids:value>\n${indent}  <xs:restriction base="xs:double">`;
    parts.forEach((part) => {
      const trimmed = part.trim();
      if (trimmed.startsWith(">=")) {
        xml += `\n${indent}    <xs:minInclusive value="${escapeXml(trimmed.slice(2).trim())}" />`;
      } else if (trimmed.startsWith(">")) {
        xml += `\n${indent}    <xs:minExclusive value="${escapeXml(trimmed.slice(1).trim())}" />`;
      } else if (trimmed.startsWith("<=")) {
        xml += `\n${indent}    <xs:maxInclusive value="${escapeXml(trimmed.slice(2).trim())}" />`;
      } else if (trimmed.startsWith("<")) {
        xml += `\n${indent}    <xs:maxExclusive value="${escapeXml(trimmed.slice(1).trim())}" />`;
      }
    });
    xml += `\n${indent}  </xs:restriction>\n${indent}</ids:value>`;
    return xml;
  }
  
  if (c === "LENGTH") {
    // Parse length constraints like "min:5" or "max:100" or "5-100"
    const parts = val.split(/\s*(?:AND|,|;|-)\s*/i);
    let xml = `${indent}<ids:value>\n${indent}  <xs:restriction base="xs:string">`;
    parts.forEach((part, idx) => {
      const trimmed = part.trim();
      if (trimmed.startsWith("min:")) {
        xml += `\n${indent}    <xs:minLength value="${escapeXml(trimmed.slice(4).trim())}" />`;
      } else if (trimmed.startsWith("max:")) {
        xml += `\n${indent}    <xs:maxLength value="${escapeXml(trimmed.slice(4).trim())}" />`;
      } else if (!isNaN(Number(trimmed))) {
        // Simple number - if first, treat as min, if second, treat as max
        if (idx === 0) {
          xml += `\n${indent}    <xs:minLength value="${escapeXml(trimmed)}" />`;
        } else {
          xml += `\n${indent}    <xs:maxLength value="${escapeXml(trimmed)}" />`;
        }
      }
    });
    xml += `\n${indent}  </xs:restriction>\n${indent}</ids:value>`;
    return xml;
  }
  
  // Default: simple value
  return `${indent}<ids:value>\n${indent}  <ids:simpleValue>${escapeXml(val)}</ids:simpleValue>\n${indent}</ids:value>`;
};

// IDS Validation errors interface
interface IdsValidationError {
  type: "error" | "warning";
  message: string;
  field?: string;
}

// Validate IDS compliance
const validateIdsCompliance = (obj: import("../../project/types").ProjectObject): IdsValidationError[] => {
  const errors: IdsValidationError[] = [];
  
  // Check entity
  if (!obj.ifcEntity) {
    errors.push({ type: "error", message: "IFC entita není vybrána", field: "entity" });
  } else {
    const normalized = normalizeEntityName(obj.ifcEntity);
    if (!/^IFC[A-Z]+$/.test(normalized)) {
      errors.push({ type: "warning", message: `Název entity "${obj.ifcEntity}" bude převeden na "${normalized}"`, field: "entity" });
    }
  }
  
  // Check classifications - system is required
  obj.requirements.classifications.forEach((cls, idx) => {
    const hasSystem = cls.systemEntryId || cls.system || cls.name;
    if (!hasSystem) {
      errors.push({ type: "error", message: `Klasifikace #${idx + 1}: Systém je povinný`, field: `classification.${idx}` });
    }
  });
  
  // Check properties - dataType mapping and validation
  obj.requirements.properties.forEach((prop, idx) => {
    if (prop.dataType) {
      const mapped = mapDataTypeToIds(prop.dataType);
      const dtLower = prop.dataType.toLowerCase();
      const dtUpper = prop.dataType.toUpperCase().replace(/[^A-Z]/g, "");
      
      // Check if this is a known/expected mapping (in DATA_TYPE_MAPPING)
      const isKnownMapping = DATA_TYPE_MAPPING[dtLower] !== undefined;
      
      // Only show warning for unknown types that get fallback mapping
      // Don't show warning for:
      // - Types that are already valid IDS types (mapped === dtUpper)
      // - PEnum types (handled correctly)
      // - Known mappings in DATA_TYPE_MAPPING (e.g., IfcQuantityWeight → IFCMASSMEASURE)
      if (mapped && mapped !== dtUpper && !dtLower.startsWith("penum") && !isKnownMapping) {
        errors.push({ 
          type: "warning", 
          message: `Vlastnost "${prop.propertyName}": "${prop.dataType}" → ${mapped}`, 
          field: `property.${idx}` 
        });
      }
    }
    if (!prop.psetName) {
      errors.push({ type: "error", message: `Vlastnost #${idx + 1}: PropertySet je povinný`, field: `property.${idx}` });
    }
    if (!prop.propertyName) {
      errors.push({ type: "error", message: `Vlastnost #${idx + 1}: Název vlastnosti je povinný`, field: `property.${idx}` });
    }
  });
  
  // Check relations - entityType must be uppercase
  obj.requirements.relations.forEach((rel, idx) => {
    if (rel.entityType) {
      const normalized = normalizeEntityName(rel.entityType);
      if (!/^IFC[A-Z]+$/.test(normalized)) {
        errors.push({ type: "warning", message: `Relace #${idx + 1}: Entita "${rel.entityType}" bude převedena na "${normalized}"`, field: `relation.${idx}` });
      }
    }
  });
  
  return errors;
};

// Helper to check if a requirement matches a phase filter
const requirementMatchesPhase = (phases: string[] | undefined, phaseId: string | null): boolean => {
  // null phaseId means "all" - show everything
  if (phaseId === null) return true;
  // If requirement has no phases set, treat as "applies to all phases" (zobrazit vždy)
  if (!phases || phases.length === 0) return true;
  // Check if the phase is in the requirement's phases
  return phases.includes(phaseId);
};

// Filter a ProjectObject's requirements by phase
const filterObjectByPhase = (
  obj: import("../../project/types").ProjectObject,
  phaseId: string | null
): import("../../project/types").ProjectObject => {
  if (phaseId === null) return obj; // Return full object for "all"
  
  return {
    ...obj,
    requirements: {
      attributes: obj.requirements.attributes.filter((a) => requirementMatchesPhase(a.phases, phaseId)),
      properties: obj.requirements.properties.filter((p) => requirementMatchesPhase(p.phases, phaseId)),
      relations: obj.requirements.relations.filter((r) => requirementMatchesPhase(r.phases, phaseId)),
      classifications: obj.requirements.classifications.filter((c) => requirementMatchesPhase(c.phases, phaseId)),
      materials: obj.requirements.materials.filter((m) => requirementMatchesPhase(m.phases, phaseId)),
    },
  };
};

// Generate IDS XML from ProjectObject - compliant with IDS 1.0 XSD schema
const generateIdsXml = (
  obj: import("../../project/types").ProjectObject, 
  ifcVersion: IdsIfcVersion = "IFC4X3_ADD2", 
  phaseId: string | null = null, 
  phaseName?: string, 
  classificationSystemEntries: import("../../project/types").ClassificationSystemEntry[] = [],
  occurrenceFilter: "all" | "required" | "prohibited" | "optional" = "all"
): string => {
  // Filter object by phase
  const filteredObj = filterObjectByPhase(obj, phaseId);
  // Normalize entity name to uppercase
  const entityName = normalizeEntityName(filteredObj.ifcEntity);
  const specName = phaseName ? `${filteredObj.description || filteredObj.code} - ${phaseName}` : (filteredObj.description || filteredObj.code);
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<ids:ids xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd" xmlns:ids="http://standards.buildingsmart.org/IDS">
  <ids:info>
    <ids:title>${escapeXml(specName)}</ids:title>
    <ids:version>1.0</ids:version>
  </ids:info>
  <ids:specifications>
    <ids:specification ifcVersion="${ifcVersion}" name="${escapeXml(specName)}">
      <ids:applicability minOccurs="1" maxOccurs="unbounded">
        <ids:entity>
          <ids:name>
            <ids:simpleValue>${escapeXml(entityName)}</ids:simpleValue>
          </ids:name>`;
  
  // IfcEntity and PredefinedType phases are independent
  const ifcEntityPhases = obj.ifcEntityPhases ?? obj.entityPhases ?? (phaseId === null ? [] : [phaseId]);
  const predefinedTypePhases = obj.predefinedTypePhases ?? obj.entityPhases ?? (phaseId === null ? [] : [phaseId]);
  const entityAppliesToPhase = !phaseId ? (ifcEntityPhases.length > 0) : (ifcEntityPhases.length === 0 || ifcEntityPhases.includes(phaseId));
  const predefinedTypeApplies = filteredObj.predefinedType.mode !== "NONE" && !!filteredObj.predefinedType.value && (!phaseId ? (predefinedTypePhases.length > 0) : (predefinedTypePhases.length === 0 || predefinedTypePhases.includes(phaseId)));
  if (predefinedTypeApplies) {
    xml += `
          <ids:predefinedType>
            <ids:simpleValue>${escapeXml(filteredObj.predefinedType.value.toUpperCase())}</ids:simpleValue>
          </ids:predefinedType>`;
  }
  
  xml += `
        </ids:entity>`;
  
  // Add applicability classifications (isApplicability = true OR readOnly = true for primary classification)
  const applicabilityClassifications = filteredObj.requirements.classifications.filter((cls) => cls.isApplicability || cls.readOnly);
  applicabilityClassifications.forEach((cls) => {
    // Look up system name from entries first, fall back to stored value
    const entryName = cls.systemEntryId ? classificationSystemEntries.find((e) => e.id === cls.systemEntryId)?.name : undefined;
    const system = entryName || cls.system || cls.name;
    if (!system) return;
    
    const uriAttr = cls.uri ? ` uri="${escapeXml(cls.uri)}"` : "";
    
    xml += `
        <ids:classification${uriAttr}>`;
    
    // Value comes first in XSD sequence
    if (cls.value) {
      const constraint = cls.constraint ?? "FILLED";
      if (constraint === "ENUM") {
        const values = cls.value.split("|").map((v) => v.trim()).filter(Boolean);
        xml += `
          <ids:value>
            <xs:restriction base="xs:string">`;
        values.forEach((v) => {
          xml += `
              <xs:enumeration value="${escapeXml(v)}" />`;
        });
        xml += `
            </xs:restriction>
          </ids:value>`;
      } else if (constraint === "PATTERN") {
        xml += `
          <ids:value>
            <xs:restriction base="xs:string">
              <xs:pattern value="${escapeXml(cls.value)}" />
            </xs:restriction>
          </ids:value>`;
      } else {
        xml += `
          <ids:value>
            <ids:simpleValue>${escapeXml(cls.value)}</ids:simpleValue>
          </ids:value>`;
      }
    }
    
    xml += `
          <ids:system>
            <ids:simpleValue>${escapeXml(system)}</ids:simpleValue>
          </ids:system>
        </ids:classification>`;
  });
  
  // Applicability: attributes, properties, partOf, materials (marked as isApplicability)
  filteredObj.requirements.attributes.forEach((attr) => {
    if (!attr.isApplicability || attr.attribute === "PredefinedType") return;
    if (occurrenceFilter !== "all" && !matchesOccurrenceFilter(attr.occurrence, occurrenceFilter)) return;
    xml += `
        <ids:attribute>
          <ids:name>
            <ids:simpleValue>${escapeXml(attr.attribute)}</ids:simpleValue>
          </ids:name>`;
    const constraintXml = generateConstraintXml(attr.constraint, attr.value, "          ");
    if (constraintXml) xml += `\n${constraintXml}`;
    xml += `
        </ids:attribute>`;
  });
  filteredObj.requirements.properties.forEach((prop) => {
    if (!prop.isApplicability || !prop.psetName || prop.psetName.startsWith("_NEW_") || !prop.propertyName) return;
    if (occurrenceFilter !== "all" && !matchesOccurrenceFilter(prop.occurrence, occurrenceFilter)) return;
    const dataType = mapDataTypeToIds(prop.dataType);
    const dataTypeAttr = dataType ? ` dataType="${escapeXml(dataType)}"` : "";
    xml += `
        <ids:property${dataTypeAttr}>
          <ids:propertySet>
            <ids:simpleValue>${escapeXml(prop.psetName)}</ids:simpleValue>
          </ids:propertySet>
          <ids:baseName>
            <ids:simpleValue>${escapeXml(prop.propertyName)}</ids:simpleValue>
          </ids:baseName>`;
    const constraintXml = generateConstraintXml(prop.constraint, prop.value, "          ");
    if (constraintXml) xml += `\n${constraintXml}`;
    xml += `
        </ids:property>`;
  });
  filteredObj.requirements.relations.forEach((rel) => {
    if (!rel.isApplicability) return;
    if (occurrenceFilter !== "all" && !matchesOccurrenceFilter(rel.occurrence, occurrenceFilter)) return;
    const relationAttr = rel.relationType ? ` relation="${escapeXml(rel.relationType)}"` : "";
    const relatedEntityName = normalizeEntityName(rel.entityType || "IFCBUILDINGELEMENT");
    xml += `
        <ids:partOf${relationAttr}>
          <ids:entity>
            <ids:name>
              <ids:simpleValue>${escapeXml(relatedEntityName)}</ids:simpleValue>
            </ids:name>`;
    if (rel.entityPredefinedType) {
      xml += `
            <ids:predefinedType>
              <ids:simpleValue>${escapeXml(rel.entityPredefinedType.toUpperCase())}</ids:simpleValue>
            </ids:predefinedType>`;
    }
    xml += `
          </ids:entity>
        </ids:partOf>`;
  });
  filteredObj.requirements.materials.forEach((mat) => {
    if (!mat.isApplicability) return;
    if (occurrenceFilter !== "all" && !matchesOccurrenceFilter(mat.occurrence, occurrenceFilter)) return;
    const uriAttr = mat.uri ? ` uri="${escapeXml(mat.uri)}"` : "";
    xml += `
        <ids:material${uriAttr}>`;
    if (mat.value || (mat.category && mat.categoryMode !== "NONE")) {
      const val = mat.value || mat.category || "";
      const constraint = mat.constraint ?? "FILLED";
      if (constraint === "ENUM" && val.includes("|")) {
        const values = val.split("|").map((v) => v.trim()).filter(Boolean);
        xml += `
          <ids:value>
            <xs:restriction base="xs:string">`;
        values.forEach((v) => { xml += `
              <xs:enumeration value="${escapeXml(v)}" />`; });
        xml += `
            </xs:restriction>
          </ids:value>`;
      } else if (constraint === "PATTERN") {
        xml += `
          <ids:value>
            <xs:restriction base="xs:string">
              <xs:pattern value="${escapeXml(val)}" />
            </xs:restriction>
          </ids:value>`;
      } else {
        xml += `
          <ids:value>
            <ids:simpleValue>${escapeXml(val)}</ids:simpleValue>
          </ids:value>`;
      }
    }
    xml += `
        </ids:material>`;
  });
  
  xml += `
      </ids:applicability>
      <ids:requirements>`;
  
  // Requirements: only non-applicability items
  filteredObj.requirements.attributes.forEach((attr) => {
    if (attr.attribute === "PredefinedType") return; // Skip, already handled in entity
    if (attr.isApplicability) return; // In applicability section
    if (occurrenceFilter !== "all" && !matchesOccurrenceFilter(attr.occurrence, occurrenceFilter)) return;
    const cardinality: ConditionalCardinality = attr.occurrence === "prohibited" ? "prohibited" : attr.occurrence === "optional" ? "optional" : "required";
    xml += `
        <ids:attribute cardinality="${cardinality}">
          <ids:name>
            <ids:simpleValue>${escapeXml(attr.attribute)}</ids:simpleValue>
          </ids:name>`;
    const constraintXml = generateConstraintXml(attr.constraint, attr.value, "          ");
    if (constraintXml) {
      xml += `\n${constraintXml}`;
    }
    xml += `
        </ids:attribute>`;
  });
  
  filteredObj.requirements.properties.forEach((prop) => {
    if (!prop.psetName || prop.psetName.startsWith("_NEW_") || !prop.propertyName) return;
    if (prop.isApplicability) return; // In applicability section
    if (occurrenceFilter !== "all" && !matchesOccurrenceFilter(prop.occurrence, occurrenceFilter)) return;
    
    const cardinality: ConditionalCardinality = prop.occurrence === "prohibited" ? "prohibited" : prop.occurrence === "optional" ? "optional" : "required";
    const dataType = mapDataTypeToIds(prop.dataType);
    const dataTypeAttr = dataType ? ` dataType="${escapeXml(dataType)}"` : "";
    
    xml += `
        <ids:property cardinality="${cardinality}"${dataTypeAttr}>
          <ids:propertySet>
            <ids:simpleValue>${escapeXml(prop.psetName)}</ids:simpleValue>
          </ids:propertySet>
          <ids:baseName>
            <ids:simpleValue>${escapeXml(prop.propertyName)}</ids:simpleValue>
          </ids:baseName>`;
    const constraintXml = generateConstraintXml(prop.constraint, prop.value, "          ");
    if (constraintXml) {
      xml += `\n${constraintXml}`;
    }
    xml += `
        </ids:property>`;
  });
  
  // Relations (PartOf) - only non-applicability
  filteredObj.requirements.relations.forEach((rel) => {
    if (rel.isApplicability) return; // In applicability section
    if (occurrenceFilter !== "all" && !matchesOccurrenceFilter(rel.occurrence, occurrenceFilter)) return;
    const cardinality: SimpleCardinality = rel.occurrence === "prohibited" ? "prohibited" : "required";
    const relationAttr = rel.relationType ? ` relation="${escapeXml(rel.relationType)}"` : "";
    const relatedEntityName = normalizeEntityName(rel.entityType || "IFCBUILDINGELEMENT");
    
    xml += `
        <ids:partOf${relationAttr} cardinality="${cardinality}">
          <ids:entity>
            <ids:name>
              <ids:simpleValue>${escapeXml(relatedEntityName)}</ids:simpleValue>
            </ids:name>`;
    if (rel.entityPredefinedType) {
      xml += `
            <ids:predefinedType>
              <ids:simpleValue>${escapeXml(rel.entityPredefinedType.toUpperCase())}</ids:simpleValue>
            </ids:predefinedType>`;
    }
    xml += `
          </ids:entity>
        </ids:partOf>`;
  });
  
  // Classifications - system is required, value comes BEFORE system according to XSD sequence
  // Only include non-applicability classifications in requirements (exclude readOnly primary classifications)
  const requirementClassifications = filteredObj.requirements.classifications.filter((cls) => !cls.isApplicability && !cls.readOnly);
  requirementClassifications.forEach((cls) => {
    if (occurrenceFilter !== "all" && !matchesOccurrenceFilter(cls.occurrence ?? "required", occurrenceFilter)) return;
    // Look up system name from entries first, fall back to stored value
    const entryName = cls.systemEntryId ? classificationSystemEntries.find((e) => e.id === cls.systemEntryId)?.name : undefined;
    const system = entryName || cls.system || cls.name;
    // Skip classifications without system (required by XSD)
    if (!system) return;
    
    const cardinality: ConditionalCardinality = cls.occurrence === "prohibited" ? "prohibited" : cls.occurrence === "optional" ? "optional" : "required";
    const uriAttr = cls.uri ? ` uri="${escapeXml(cls.uri)}"` : "";
    
    xml += `
        <ids:classification cardinality="${cardinality}"${uriAttr}>`;
    
    // Value comes first in XSD sequence (minOccurs="0")
    if (cls.value) {
      const constraint = cls.constraint ?? "FILLED";
      if (constraint === "ENUM") {
        const values = cls.value.split("|").map((v) => v.trim()).filter(Boolean);
        xml += `
          <ids:value>
            <xs:restriction base="xs:string">`;
        values.forEach((v) => {
          xml += `
              <xs:enumeration value="${escapeXml(v)}" />`;
        });
        xml += `
            </xs:restriction>
          </ids:value>`;
      } else if (constraint === "PATTERN") {
        xml += `
          <ids:value>
            <xs:restriction base="xs:string">
              <xs:pattern value="${escapeXml(cls.value)}" />
            </xs:restriction>
          </ids:value>`;
      } else {
        xml += `
          <ids:value>
            <ids:simpleValue>${escapeXml(cls.value)}</ids:simpleValue>
          </ids:value>`;
      }
    }
    
    // System is required (minOccurs="1")
    xml += `
          <ids:system>
            <ids:simpleValue>${escapeXml(system)}</ids:simpleValue>
          </ids:system>
        </ids:classification>`;
  });
  
  // Materials
  filteredObj.requirements.materials.forEach((mat) => {
    if (mat.isApplicability) return; // In applicability section
    if (occurrenceFilter !== "all" && !matchesOccurrenceFilter(mat.occurrence, occurrenceFilter)) return;
    const cardinality: ConditionalCardinality = mat.occurrence === "prohibited" ? "prohibited" : mat.occurrence === "optional" ? "optional" : "required";
    const uriAttr = mat.uri ? ` uri="${escapeXml(mat.uri)}"` : "";
    
    xml += `
        <ids:material cardinality="${cardinality}"${uriAttr}>`;
    if (mat.category && mat.categoryMode !== "NONE") {
      const constraintXml = generateConstraintXml(mat.categoryMode === "ENUM" ? "ENUM" : undefined, mat.category, "          ");
      if (constraintXml) {
        xml += `\n${constraintXml}`;
      }
    }
    xml += `
        </ids:material>`;
  });
  
  xml += `
      </ids:requirements>
    </ids:specification>
  </ids:specifications>
</ids:ids>`;
  
  return xml;
};

// Translate constraint to human-readable Czech
const translateConstraint = (constraint?: string, value?: string, _dataType?: string): string => {
  const c = (constraint ?? "FILLED").toUpperCase();
  const val = value ?? "";
  
  // No value specified = any value allowed
  if (!val) {
    return "s libovolnou hodnotou";
  }
  
  // FILLED with value = exact value required
  if (c === "FILLED") {
    return `s hodnotou **${val}**`;
  }
  
  if (c === "ENUM") {
    const values = val.split("|").map((v) => v.trim()).filter(Boolean);
    if (values.length === 1) {
      return `s hodnotou "${values[0]}"`;
    }
    return `s hodnotou jednou z: ${values.join(", ")}`;
  }
  
  if (c === "PATTERN") {
    return `s hodnotou odpovídající vzoru ${val}`;
  }
  
  if (c === "RANGE") {
    const parts = val.split(/\s*(?:AND|,|;)\s*/i);
    const conditions: string[] = [];
    parts.forEach((part) => {
      const trimmed = part.trim();
      if (trimmed.startsWith(">=")) {
        conditions.push(`větší nebo rovno ${trimmed.slice(2).trim()}`);
      } else if (trimmed.startsWith(">")) {
        conditions.push(`větší než ${trimmed.slice(1).trim()}`);
      } else if (trimmed.startsWith("<=")) {
        conditions.push(`menší nebo rovno ${trimmed.slice(2).trim()}`);
      } else if (trimmed.startsWith("<")) {
        conditions.push(`menší než ${trimmed.slice(1).trim()}`);
      }
    });
    if (conditions.length > 0) {
      return `s hodnotou [${conditions.join(" a ")}]`;
    }
    return `s hodnotou v rozmezí ${val}`;
  }
  
  if (c === "LENGTH") {
    return `s délkou ${val}`;
  }
  
  return `s hodnotou "${val}"`;
};

// Helper to check if requirement matches occurrence filter
const matchesOccurrenceFilter = (
  occurrence: "required" | "prohibited" | "optional" | undefined,
  filter: "all" | "required" | "prohibited" | "optional"
): boolean => {
  if (filter === "all") return true;
  const actualOccurrence = occurrence || "required";
  return actualOccurrence === filter;
};

// Generate human-readable text from ProjectObject
const generateHumanReadable = (
  obj: import("../../project/types").ProjectObject,
  _phases: import("../../project/types").Phase[],
  classificationSystemEntries: import("../../project/types").ClassificationSystemEntry[],
  phaseId: string | null = null,
  occurrenceFilter: "all" | "required" | "prohibited" | "optional" = "all"
): { applicability: string[]; requirements: string[] } => {
  // Filter object by phase
  const filteredObj = filterObjectByPhase(obj, phaseId);
  
  const applicability: string[] = [];
  const requirements: string[] = [];
  
  // Entity a PredefinedType jsou v IDS vždy v applicability a vždy požadované – zobrazovat bez ohledu na filtr výskytu
  if (filteredObj.ifcEntity) {
    applicability.push(`IFC třídu **${filteredObj.ifcEntity}**`);
  }
  const predefinedTypePhasesReadable = obj.predefinedTypePhases ?? obj.entityPhases ?? (phaseId === null ? [] : [phaseId]);
  const predefinedTypeAppliesReadable = phaseId === null ? predefinedTypePhasesReadable.length > 0 : predefinedTypePhasesReadable.length === 0 || predefinedTypePhasesReadable.includes(phaseId);
  if (filteredObj.predefinedType.mode !== "NONE" && filteredObj.predefinedType.value && predefinedTypeAppliesReadable) {
    applicability.push(`s předdefinovaným typem **${filteredObj.predefinedType.value}**`);
  }
  
  // Attributes - applicability vs requirements (PredefinedType is only in Entity card, not in attributes)
  filteredObj.requirements.attributes.forEach((attr) => {
    if (attr.attribute === "PredefinedType") return; // Handled in Entity card
    if (!matchesOccurrenceFilter(attr.occurrence, occurrenceFilter)) return;
    const occurrence = attr.occurrence === "prohibited" ? "NESMÍ" : attr.occurrence === "optional" ? "MŮŽE" : "MUSÍ";
    const constraintText = translateConstraint(attr.constraint, attr.value, attr.dataType);
    const line = `atribut **${attr.attribute}** ${constraintText}${attr.dataType ? ` *(${attr.dataType})*` : ""}`;
    if (attr.isApplicability && occurrenceFilter === "all") {
      applicability.push(line);
    } else {
      requirements.push(`**${occurrence}** mít ${line}`);
    }
  });
  
  // Properties
  filteredObj.requirements.properties.forEach((prop) => {
    if (!prop.psetName || prop.psetName.startsWith("_NEW_") || !prop.propertyName) return;
    if (!matchesOccurrenceFilter(prop.occurrence, occurrenceFilter)) return;
    const occurrence = prop.occurrence === "prohibited" ? "NESMÍ" : prop.occurrence === "optional" ? "MŮŽE" : "MUSÍ";
    const constraintText = translateConstraint(prop.constraint, prop.value, prop.dataType);
    const psetType = prop.source === "PSET" ? "property setu" : prop.source === "QTO" ? "quantity setu" : "vlastní sady";
    const line = `vlastnost **${prop.propertyName}** ${psetType} **${prop.psetName}** ${constraintText}${prop.dataType ? ` *(${prop.dataType})*` : ""}`;
    if (prop.isApplicability && occurrenceFilter === "all") {
      applicability.push(line);
    } else {
      requirements.push(`**${occurrence}** mít ${line}`);
    }
  });
  
  // Relations
  filteredObj.requirements.relations.forEach((rel) => {
    if (!matchesOccurrenceFilter(rel.occurrence, occurrenceFilter)) return;
    const occurrence = rel.occurrence === "prohibited" ? "NESMÍ" : rel.occurrence === "optional" ? "MŮŽE" : "MUSÍ";
    const entityText = rel.entityType ? `IFC třídou **${rel.entityType}**` : "prvkem";
    const predefinedText = rel.entityPredefinedType ? ` s typem **${rel.entityPredefinedType}**` : "";
    const line = `relaci **${rel.relationType}** s ${entityText}${predefinedText}`;
    if (rel.isApplicability && occurrenceFilter === "all") {
      applicability.push(line);
    } else {
      requirements.push(`**${occurrence}** mít ${line}`);
    }
  });
  
  // Classifications - split by applicability
  filteredObj.requirements.classifications.forEach((cls) => {
    if (!cls.system && !cls.value && !cls.name && !cls.systemEntryId) return;
    // Look up system name from entries first, fall back to stored value
    const entryName = cls.systemEntryId ? classificationSystemEntries.find((e) => e.id === cls.systemEntryId)?.name : undefined;
    const systemName = entryName || cls.system || cls.name;
    
    if (cls.isApplicability || cls.readOnly) {
      // Add to applicability section (primary classifications are always applicability) – zobrazovat vždy bez ohledu na filtr výskytu
      if (cls.value) {
        applicability.push(`klasifikaci **${cls.value}** ze systému **${systemName}**`);
      } else {
        applicability.push(`klasifikaci ze systému **${systemName}**`);
      }
    } else {
      // Add to requirements section - use classification occurrence (primární je vždy required)
      const occurrence = cls.occurrence === "prohibited" ? "NESMÍ" : cls.occurrence === "optional" ? "MŮŽE" : "MUSÍ";
      if (matchesOccurrenceFilter(cls.occurrence ?? "required", occurrenceFilter)) {
        if (cls.value) {
          requirements.push(`**${occurrence}** mít klasifikaci **${cls.value}** ze systému **${systemName}**`);
        } else {
          requirements.push(`**${occurrence}** mít klasifikaci ze systému **${systemName}**`);
        }
      }
    }
  });
  
  // Materials - applicability vs requirements
  filteredObj.requirements.materials.forEach((mat) => {
    if (!matchesOccurrenceFilter(mat.occurrence, occurrenceFilter)) return;
    const occurrence = mat.occurrence === "prohibited" ? "NESMÍ" : mat.occurrence === "optional" ? "MŮŽE" : "MUSÍ";
    let categoryText = "";
    if (mat.category && mat.categoryMode !== "NONE") {
      categoryText = ` s kategorií **${mat.category}**`;
    }
    const line = `materiál${categoryText}`;
    if (mat.isApplicability && occurrenceFilter === "all") {
      applicability.push(line);
    } else {
      requirements.push(`**${occurrence}** mít ${line}`);
    }
  });
  
  return { applicability, requirements };
};

export const ObjectDetail: React.FC<Props> = ({ node, object, schema, onChange, phases, codeLists, classificationSystemEntries, onSaveEnumAsCodeList }) => {
  const [activeTab, setActiveTab] = useState<TabKey>("properties");
  const [idsSubTab, setIdsSubTab] = useState<IdsSubTabKey>("readable");
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null); // null = "Vše"
  const [occurrenceFilter, setOccurrenceFilter] = useState<OccurrenceFilter>("all");
  // Fixed IFC version for IDS export
  const selectedIfcVersion: IdsIfcVersion = "IFC4X3_ADD2";
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

  // Odstranit PredefinedType z atributů – řeší se pouze v identifikačních údajích (entita)
  useEffect(() => {
    const hasPredefinedTypeAttr = object.requirements.attributes.some((a) => a.attribute === "PredefinedType");
    if (hasPredefinedTypeAttr) {
      const nextAttrs = object.requirements.attributes.filter((a) => a.attribute !== "PredefinedType");
      onChangeRef.current({
        ...object,
        requirements: { ...object.requirements, attributes: nextAttrs },
      });
    }
  }, [object]);

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
    const allAttributes = ["Name", "Description", "Tag", "ObjectType", "GlobalId"];
    const used = new Set(
      object.requirements.attributes
        .filter((a) => a.id !== currentId && a.attribute !== "PredefinedType")
        .map((a) => a.attribute),
    );
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
        phases: phases.map((p) => p.id), // All phases by default
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
        phases: phases.map((p) => p.id), // All phases by default
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
        phases: phases.map((p) => p.id), // All phases by default
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
          phases: phases.map((p) => p.id), // All phases by default
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
  const toggleAttributeSelection = (attrId: string) => {
    setSelectedAttributes((prev) => {
      const next = new Set(prev);
      if (next.has(attrId)) next.delete(attrId);
      else next.add(attrId);
      return next;
    });
  };


  const selectAllAttributes = () => {
    const visibleAttrs = object.requirements.attributes.filter((a) => a.attribute !== "PredefinedType");
    setSelectedAttributes(new Set(visibleAttrs.map((a) => a.id)));
  };

  const deleteSelectedAttributes = () => {
    const idsToDelete = Array.from(selectedAttributes);
    updateRequirements((reqs) => {
      reqs.attributes = reqs.attributes.filter((a) => !idsToDelete.includes(a.id));
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
        phases: phases.map((p) => p.id), // All phases by default
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
        occurrence: "required",
        description: "",
        extensions: {},
        phases: phases.map((p) => p.id), // All phases by default
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
        phases: phases.map((p) => p.id), // All phases by default
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
      {/* Název objektu */}
      <div className="border-b border-indigo-200 bg-gradient-to-r from-indigo-50 to-white px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 rounded-full bg-indigo-500"></div>
          <div className="text-xl font-bold text-slate-800">{node.description || node.code}</div>
        </div>
      </div>

      {/* Identifikační údaje – údaje specifikující objekt (lze odvodit z klasifikačního systému / hierarchie) */}
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mb-3 flex items-center gap-2">
          <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Identifikační údaje</div>
          <div className="h-px flex-1 bg-slate-200"></div>
        </div>
        {(node.ifcEntity != null && node.ifcEntity !== "" && object.ifcEntity !== node.ifcEntity) && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
            <span>V hierarchii / klasifikačním systému je pro tento objekt uvedena entita <strong>{node.ifcEntity}</strong>. Údaje lze odvodit z klasifikace.</span>
            <button
              type="button"
              className="flex-shrink-0 rounded border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200"
              onClick={() => {
                const phaseIds = phases.map((p) => p.id);
                updateObject({
                  ifcEntity: node.ifcEntity ?? "",
                  predefinedType: node.predefinedType ? { mode: "ENUM", value: node.predefinedType } : { mode: "NONE" },
                  ifcEntityPhases: phaseIds,
                  predefinedTypePhases: phaseIds,
                });
              }}
            >
              Použít z hierarchie
            </button>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                Entita
                <DocLink 
                  href="https://github.com/buildingSMART/IDS/blob/development/Documentation/UserManual/entity-facet.md"
                  label="Entity Facet"
                  type="ids"
                />
                <DocLink href={getIfcDocUrl(object.ifcEntity)} label={object.ifcEntity ?? ""} type="ifc" />
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-slate-600 shrink-0">IfcEntity</label>
                <select className="min-w-[140px] max-w-[220px] rounded border border-slate-300 px-2 py-1 text-sm" value={object.ifcEntity} onChange={(e) => handleIfcEntityChange(e.target.value)}>
                  <option value="">-- Vyberte entitu --</option>
                  {entities.map((ent) => (
                    <option key={ent} value={ent}>
                      {ent}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-slate-600 shrink-0">Fáze</span>
                <PhaseSelector
                  phases={phases}
                  value={object.ifcEntityPhases ?? object.entityPhases ?? phases.map((p) => p.id)}
                  onChange={(ids) => updateObject({ ifcEntityPhases: ids })}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-slate-600 shrink-0">PredefinedType</label>
                <select className="min-w-[120px] max-w-[180px] rounded border border-slate-300 px-2 py-1 text-sm" value={object.predefinedType.mode === "NONE" ? "" : (object.predefinedType.mode === "USERDEFINED" ? "USERDEFINED" : object.predefinedType.value ?? "")} onChange={(e) => handlePredefinedChange(e.target.value)}>
                  <option value="">-- Není definováno --</option>
                  {predefinedOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                {object.predefinedType.mode === "USERDEFINED" && (
                  <input
                    className="min-w-[100px] max-w-[160px] rounded border border-slate-300 px-2 py-1 text-sm"
                    placeholder="Vlastní typ"
                    value={object.predefinedType.value ?? ""}
                    onChange={(e) => updateObject({ predefinedType: { mode: "USERDEFINED", value: e.target.value } })}
                  />
                )}
                <span className="text-xs text-slate-600 shrink-0">Fáze</span>
                <PhaseSelector
                  phases={phases}
                  value={object.predefinedTypePhases ?? object.entityPhases ?? phases.map((p) => p.id)}
                  onChange={(ids) => updateObject({ predefinedTypePhases: ids })}
                />
              </div>
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                Klasifikace
                <DocLink 
                  href="https://github.com/buildingSMART/IDS/blob/development/Documentation/UserManual/classification-facet.md"
                  label="Classification Facet"
                  type="ids"
                />
              </div>
            </div>
            {object.requirements.classifications.length > 0 ? (
              <div className="space-y-2">
                {object.requirements.classifications.map((cls, idx) => {
                  // Look up system name from entries first, fall back to stored value
                  const displaySystemName = cls.systemEntryId 
                    ? classificationSystemEntries.find((e) => e.id === cls.systemEntryId)?.name 
                    : cls.system;
                  return (
                  <div key={cls.id || idx} className={`rounded px-2 py-1.5 text-xs ${cls.readOnly ? "bg-indigo-100 border border-indigo-200" : "bg-white border border-slate-200"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800">{cls.value || cls.identification || cls.code || "—"}</span>
                      {cls.readOnly && <span className="rounded bg-indigo-500 px-1.5 py-0.5 text-[10px] font-medium text-white">Primární</span>}
                    </div>
                    <div className="mt-0.5 text-slate-500">
                      {displaySystemName && <span>{displaySystemName}</span>}
                      {cls.name && cls.name !== cls.value && <span className="ml-1">• {cls.name}</span>}
                    </div>
                  </div>
                )})}
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic">Žádná klasifikace</div>
            )}
            <button 
              className="mt-2 text-xs text-indigo-600 hover:underline" 
              onClick={() => setActiveTab("classification")}
            >
              Upravit klasifikace →
            </button>
          </div>
        </div>

        {/* Atributy v použitelnosti – velká tabulka (jako u klasifikací) */}
        {object.requirements.attributes.some((a) => a.isApplicability && a.attribute !== "PredefinedType") && (
          <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 md:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">Atributy v použitelnosti</div>
              <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={() => setActiveTab("attributes")}>
                Přidat / upravit v kartě Atributy →
              </button>
            </div>
            <div className="overflow-auto rounded border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Atribut</th>
                    <th className="px-2 py-2">Omezení</th>
                    <th className="px-2 py-2">Hodnota</th>
                    <th className="px-2 py-2">Fáze</th>
                    <th className="px-2 py-2 text-right">Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {object.requirements.attributes
                    .filter((a) => a.isApplicability && a.attribute !== "PredefinedType")
                    .map((attr) => (
                      <tr key={attr.id} className="border-t border-slate-200">
                        <td className="px-2 py-2">
                          <select className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={attr.attribute} onChange={(e) => updateAttributeField(attr.id, { attribute: e.target.value })}>
                            {getAvailableAttributes(attr.id).filter((opt) => opt !== "PredefinedType").map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <select className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={attr.constraint ?? "FILLED"} onChange={(e) => updateAttributeField(attr.id, { constraint: e.target.value as "FILLED" | "ENUM" | "PATTERN" | "RANGE" | "LENGTH" })}>
                            {ATTRIBUTE_CONSTRAINT_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={attr.value ?? ""} onChange={(e) => updateAttributeField(attr.id, { value: e.target.value })} placeholder="Hodnota" />
                        </td>
                        <td className="px-2 py-2">
                          <PhaseSelector phases={phases} value={attr.phases} onChange={(ids) => updateAttributeField(attr.id, { phases: ids })} />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => updateAttributeField(attr.id, { isApplicability: false })}>Odebrat z použitelnosti</button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Vlastnosti v použitelnosti – velká tabulka */}
        {object.requirements.properties.some((p) => p.isApplicability && (p.psetName || p.propertyName)) && (
          <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 md:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">Vlastnosti v použitelnosti</div>
              <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={() => setActiveTab("properties")}>
                Přidat / upravit v kartě Vlastnosti →
              </button>
            </div>
            <div className="overflow-auto rounded border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Property set / Qto</th>
                    <th className="px-2 py-2">Vlastnost</th>
                    <th className="px-2 py-2">Hodnota</th>
                    <th className="px-2 py-2">Fáze</th>
                    <th className="px-2 py-2 text-right">Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {object.requirements.properties
                    .filter((p) => p.isApplicability && (p.psetName || p.propertyName))
                    .map((prop) => (
                      <tr key={prop.id} className="border-t border-slate-200">
                        <td className="px-2 py-2">
                          <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={prop.psetName ?? ""} onChange={(e) => updatePropertyField(prop.id, { psetName: e.target.value })} placeholder="Pset/Qto" />
                        </td>
                        <td className="px-2 py-2">
                          <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={prop.propertyName ?? ""} onChange={(e) => updatePropertyField(prop.id, { propertyName: e.target.value })} placeholder="Vlastnost" />
                        </td>
                        <td className="px-2 py-2">
                          <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={prop.value ?? ""} onChange={(e) => updatePropertyField(prop.id, { value: e.target.value })} placeholder="Hodnota" />
                        </td>
                        <td className="px-2 py-2">
                          <PhaseSelector phases={phases} value={prop.phases} onChange={(ids) => updatePropertyField(prop.id, { phases: ids })} />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => updatePropertyField(prop.id, { isApplicability: false })}>Odebrat z použitelnosti</button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Součásti v použitelnosti – velká tabulka */}
        {object.requirements.relations.some((r) => r.isApplicability) && (
          <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 md:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">Součásti v použitelnosti</div>
              <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={() => setActiveTab("partOf")}>
                Přidat / upravit v kartě Součástí →
              </button>
            </div>
            <div className="overflow-auto rounded border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Vztah</th>
                    <th className="px-2 py-2">Součást entity</th>
                    <th className="px-2 py-2">PredefinedType</th>
                    <th className="px-2 py-2">Fáze</th>
                    <th className="px-2 py-2 text-right">Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {object.requirements.relations
                    .filter((r) => r.isApplicability)
                    .map((rel) => {
                      const relEntityDef = rel.entityType ? schema?.entities[rel.entityType] : undefined;
                      const relPredefinedOptions = relEntityDef?.predefinedTypeValues ?? [];
                      return (
                        <tr key={rel.id} className="border-t border-slate-200">
                          <td className="px-2 py-2">
                            <select className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={rel.relationType} onChange={(e) => updateRelationField(rel.id, { relationType: e.target.value as RelationRequirement["relationType"] })}>
                              {relationTypeOptions.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <select className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={rel.entityType ?? ""} onChange={(e) => updateRelationField(rel.id, { entityType: e.target.value, entityPredefinedType: "" })}>
                              <option value="">-- Entita --</option>
                              {entities.map((ent) => (
                                <option key={ent} value={ent}>{ent}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <select className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={rel.entityPredefinedType ?? ""} onChange={(e) => updateRelationField(rel.id, { entityPredefinedType: e.target.value })} disabled={!rel.entityType || relPredefinedOptions.length === 0}>
                              <option value="">--</option>
                              {relPredefinedOptions.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <PhaseSelector phases={phases} value={rel.phases} onChange={(ids) => updateRelationField(rel.id, { phases: ids })} />
                          </td>
                          <td className="px-2 py-2 text-right">
                            <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => updateRelationField(rel.id, { isApplicability: false })}>Odebrat z použitelnosti</button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Klasifikace – již existující blok; zobrazují se všechny, v použitelnosti jsou ty s isApplicability nebo readOnly */}

        {/* Materiál v použitelnosti – velká tabulka */}
        {object.requirements.materials.some((m) => m.isApplicability) && (
          <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 md:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">Materiál v použitelnosti</div>
              <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={() => setActiveTab("material")}>
                Přidat / upravit v kartě Materiál →
              </button>
            </div>
            <div className="overflow-auto rounded border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Kategorie</th>
                    <th className="px-2 py-2">Hodnota</th>
                    <th className="px-2 py-2">Fáze</th>
                    <th className="px-2 py-2 text-right">Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {object.requirements.materials
                    .filter((m) => m.isApplicability)
                    .map((mat) => (
                      <tr key={mat.id} className="border-t border-slate-200">
                        <td className="px-2 py-2">
                          <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={mat.category ?? ""} onChange={(e) => updateMaterialField(mat.id, { category: e.target.value })} placeholder="Kategorie" />
                        </td>
                        <td className="px-2 py-2">
                          <input className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={mat.value ?? ""} onChange={(e) => updateMaterialField(mat.id, { value: e.target.value })} placeholder="Hodnota" />
                        </td>
                        <td className="px-2 py-2">
                          <PhaseSelector phases={phases} value={mat.phases} onChange={(ids) => updateMaterialField(mat.id, { phases: ids })} />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => updateMaterialField(mat.id, { isApplicability: false })}>Odebrat z použitelnosti</button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Požadavky */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="bg-white px-4 pt-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Požadavky</div>
            <div className="h-px flex-1 bg-slate-200"></div>
          </div>
        </div>
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
          {activeTab === "attributes" && (() => {
            const visibleAttributes = object.requirements.attributes.filter((a) => a.attribute !== "PredefinedType");
            return (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <DocLink 
                  href="https://github.com/buildingSMART/IDS/blob/development/Documentation/UserManual/attribute-facet.md"
                  label="Attribute Facet"
                  type="ids"
                />
                <button className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500" onClick={addAttribute}>
                  Přidat atribut
                </button>
                {visibleAttributes.length > 0 && (
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
              {visibleAttributes.length === 0 ? (
                <div className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                  Žádné atributy. Přidejte atribut.
                </div>
              ) : (
                <>
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
                          <DocLink 
                            href="https://github.com/buildingSMART/IDS/blob/development/Documentation/UserManual/restrictions.md"
                            label="Restrictions"
                            type="ids"
                          />
                        </div>
                      </th>
                      <th className="px-2 py-2">Hodnota</th>
                      <th className="px-2 py-2">Poznámka</th>
                      <th className="px-2 py-2">Fáze</th>
                      <th className="px-2 py-2 text-center" title="Pokud je zaškrtnuto, požadavek bude v části Použitelnost (applicability)">Použitelnost</th>
                      <th className="px-2 py-2 text-right">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAttributes.map((attr) => {
                      const dataType = attr.dataType ?? ATTRIBUTE_DATA_TYPES[attr.attribute] ?? "IfcLabel";
                      const isDisabled = attr.constraint === "FILLED" || attr.constraint === undefined;
                      const isPattern = attr.constraint === "PATTERN";
                      const isEnum = attr.constraint === "ENUM";
                      
                      return (
                        <tr key={attr.id} className="border-t border-slate-200">
                          {/* CHECKBOX */}
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              checked={selectedAttributes.has(attr.id)}
                              onChange={() => toggleAttributeSelection(attr.id)}
                            />
                          </td>
                          {/* VÝSKYT */}
                          <td className="px-2 py-2">
                            <select 
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                              value={attr.occurrence ?? "optional"} 
                              onChange={(e) => {
                                const newValue = e.target.value as "required" | "prohibited" | "optional";
                                if (selectedAttributes.has(attr.id) && selectedAttributes.size > 0) {
                                  updateSelectedAttributes({ occurrence: newValue });
                                } else {
                                  updateAttributeField(attr.id, { occurrence: newValue });
                                }
                              }}
                            >
                              <option value="required">Požadováno (required)</option>
                              <option value="prohibited">Zakázáno (prohibited)</option>
                              <option value="optional">Možné (optional)</option>
                            </select>
                          </td>
                          
                          {/* ATRIBUT - Atribut dropdown */}
                          <td className="px-2 py-2">
                            <select
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                              value={attr.attribute}
                              onChange={(e) => updateAttributeField(attr.id, { attribute: e.target.value })}
                            >
                              {getAvailableAttributes(attr.id).map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
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
                          </td>
                          
                          {/* HODNOTA */}
                          <td className="px-2 py-2">
                            {(() => {
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
                              if (isDisabled) {
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
                              
                              // Standardní input
                              return (
                                <input
                                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                  value={attr.value ?? ""}
                                  onChange={(e) => updateAttributeField(attr.id, { value: e.target.value })}
                                  placeholder="Hodnota"
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
                          {/* POUŽITELNOST */}
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-green-600 focus:ring-green-500"
                              checked={attr.isApplicability ?? false}
                              onChange={(e) => updateAttributeField(attr.id, { isApplicability: e.target.checked })}
                              title="Pokud je zaškrtnuto, požadavek bude v části Použitelnost (applicability)"
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
                  </tbody>
                </table>
              </div>
                </>
              )}
            </div>
            );
          })()}

          {activeTab === "properties" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <DocLink 
                  href="https://github.com/buildingSMART/IDS/blob/development/Documentation/UserManual/property-facet.md"
                  label="Property Facet"
                  type="ids"
                />
                <button className="rounded border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100" onClick={() => addPropertyGroup("PSET")}>
                  Přidat skupinu vlastností Pset
                </button>
                <button className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100" onClick={() => addPropertyGroup("QTO")}>
                  Přidat skupinu vlastností Qto
                </button>
                <button className="rounded border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100" onClick={() => addPropertyGroup("CUSTOM")}>
                  Přidat vlastní skupinu vlastností
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

              {propertyGroups.length === 0 ? (
                <div className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                  Žádné vlastnosti. Přidejte skupinu Pset/Qto nebo vlastní.
                </div>
              ) : (
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
                                    <DocLink 
                                      href="https://github.com/buildingSMART/IDS/blob/development/Documentation/UserManual/restrictions.md"
                                      label="Restrictions"
                                      type="ids"
                                    />
                                  </div>
                                </th>
                                <th className="px-2 py-2">Hodnota</th>
                                <th className="px-2 py-2">Jednotka</th>
                                <th className="px-2 py-2">Poznámka</th>
                                <th className="px-2 py-2">Fáze</th>
                                <th className="px-2 py-2 text-center" title="Pokud je zaškrtnuto, požadavek bude v části Použitelnost (applicability)">Použitelnost</th>
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
                                  <td className="px-2 py-2 text-center">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 cursor-pointer rounded border-slate-300 text-green-600 focus:ring-green-500"
                                      checked={prop.isApplicability ?? false}
                                      onChange={(e) => updatePropertyField(prop.id, { isApplicability: e.target.checked })}
                                      title="Pokud je zaškrtnuto, požadavek bude v části Použitelnost (applicability)"
                                    />
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
              )}
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
                <DocLink 
                  href="https://github.com/buildingSMART/IDS/blob/development/Documentation/UserManual/partof-facet.md"
                  label="PartOf Facet"
                  type="ids"
                />
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
              {object.requirements.relations.length === 0 ? (
                <div className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                  Žádné vztahy. Přidejte vztah.
                </div>
              ) : (
                <>
              <div className="text-xs text-slate-500">Vztahy mezi IFC entitami (IfcRelAggregates, IfcRelNests, ...)</div>
              <div className="overflow-auto rounded border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="w-8 px-2 py-2"></th>
                      <th className="px-2 py-2">Výskyt</th>
                      <th className="px-2 py-2">Součást entity</th>
                      <th className="px-2 py-2">PredefinedType</th>
                      <th className="px-2 py-2">Vztah</th>
                      <th className="px-2 py-2">Poznámka</th>
                      <th className="px-2 py-2">Fáze</th>
                      <th className="px-2 py-2 text-center" title="Pokud je zaškrtnuto, požadavek bude v části Použitelnost (applicability)">Použitelnost</th>
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
                          {/* POUŽITELNOST */}
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-green-600 focus:ring-green-500"
                              checked={rel.isApplicability ?? false}
                              onChange={(e) => updateRelationField(rel.id, { isApplicability: e.target.checked })}
                              title="Pokud je zaškrtnuto, požadavek bude v části Použitelnost (applicability)"
                            />
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
                  </tbody>
                </table>
              </div>
                </>
              )}
            </div>
          )}

          {activeTab === "material" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <DocLink 
                  href="https://github.com/buildingSMART/IDS/blob/development/Documentation/UserManual/material-facet.md"
                  label="Material Facet"
                  type="ids"
                />
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
              {object.requirements.materials.length === 0 ? (
                <div className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                  Žádné materiálové požadavky. Přidejte materiál.
                </div>
              ) : (
                <>
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
                      <th className="px-2 py-2 text-center" title="Pokud je zaškrtnuto, požadavek bude v části Použitelnost (applicability)">Použitelnost</th>
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
                        {/* POUŽITELNOST */}
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer rounded border-slate-300 text-green-600 focus:ring-green-500"
                            checked={mat.isApplicability ?? false}
                            onChange={(e) => updateMaterialField(mat.id, { isApplicability: e.target.checked })}
                            title="Pokud je zaškrtnuto, požadavek bude v části Použitelnost (applicability)"
                          />
                        </td>
                        {/* AKCE */}
                        <td className="px-2 py-2 text-right">
                          <button className="text-xs text-red-600 hover:underline" onClick={() => removeRequirement("materials", mat.id)}>
                            Odebrat
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
                </>
              )}
            </div>
          )}

          {activeTab === "classification" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <DocLink 
                  href="https://github.com/buildingSMART/IDS/blob/development/Documentation/UserManual/classification-facet.md"
                  label="Classification Facet"
                  type="ids"
                />
                <button className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500" onClick={addClassification}>
                  Přidat klasifikaci
                </button>
                {object.requirements.classifications.some((c) => !c.readOnly) && (
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
              {object.requirements.classifications.length === 0 ? (
                <div className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                  Žádné klasifikace. Přidejte klasifikaci.
                </div>
              ) : (
                <>
              <div className="overflow-auto rounded border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="w-8 px-2 py-2"></th>
                      <th className="px-2 py-2">Výskyt</th>
                      <th className="px-2 py-2">Klasifikační systém</th>
                      <th className="px-2 py-2">Omezení</th>
                      <th className="px-2 py-2">Hodnota</th>
                      <th className="px-2 py-2">URI</th>
                      <th className="px-2 py-2">Popis</th>
                      <th className="px-2 py-2">Fáze</th>
                      <th className="px-2 py-2 text-center" title="Pokud je zaškrtnuto, klasifikace bude v části Použitelnost (applicability) místo Požadavky">Použitelnost</th>
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
                          {cls.readOnly ? (
                            <span className="text-xs font-medium text-slate-700">Požadované</span>
                          ) : (
                            <select
                              className="w-full min-w-[100px] rounded border border-slate-300 px-2 py-1 text-sm"
                              value={cls.occurrence ?? "required"}
                              onChange={(e) =>
                                updateRequirements((reqs) => {
                                  reqs.classifications = reqs.classifications.map((c) => (c.id === cls.id ? { ...c, occurrence: e.target.value as "required" | "prohibited" | "optional" } : c));
                                })
                              }
                            >
                              <option value="required">Požadované</option>
                              <option value="prohibited">Zakázané</option>
                              <option value="optional">Možné</option>
                            </select>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <select
                            className={`w-full rounded border border-slate-300 px-2 py-1 text-sm ${cls.readOnly ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}`}
                            value={cls.systemEntryId ?? ""}
                            onChange={(e) => {
                              const selectedEntryId = e.target.value;
                              const selectedEntry = classificationSystemEntries.find((s) => s.id === selectedEntryId);
                              updateRequirements((reqs) => {
                                reqs.classifications = reqs.classifications.map((c) =>
                                  c.id === cls.id
                                    ? {
                                        ...c,
                                        systemEntryId: selectedEntryId || undefined,
                                        system: selectedEntry?.name ?? c.system,
                                      }
                                    : c
                                );
                              });
                            }}
                            disabled={cls.readOnly}
                          >
                            <option value="">— Vyberte systém —</option>
                            {classificationSystemEntries.map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.name}
                              </option>
                            ))}
                          </select>
                          {!cls.systemEntryId && cls.system && (
                            <input
                              className={`mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm ${cls.readOnly ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}`}
                              value={cls.system}
                              onChange={(e) =>
                                updateRequirements((reqs) => {
                                  reqs.classifications = reqs.classifications.map((c) => (c.id === cls.id ? { ...c, system: e.target.value } : c));
                                })
                              }
                              disabled={cls.readOnly}
                              placeholder="Nebo zadejte název systému ručně"
                            />
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <select
                            className={`w-full rounded border border-slate-300 px-2 py-1 text-sm ${cls.readOnly ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}`}
                            value={cls.constraint ?? "FILLED"}
                            onChange={(e) =>
                              updateRequirements((reqs) => {
                                reqs.classifications = reqs.classifications.map((c) => (c.id === cls.id ? { ...c, constraint: e.target.value as "FILLED" | "ENUM" | "PATTERN" } : c));
                              })
                            }
                            disabled={cls.readOnly}
                          >
                            <option value="FILLED">Žádné</option>
                            <option value="ENUM">Výčet</option>
                            <option value="PATTERN">Vzor (regex)</option>
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className={`w-full rounded border border-slate-300 px-2 py-1 text-sm ${cls.readOnly ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}`}
                            value={cls.value ?? cls.identification ?? cls.code ?? ""}
                            onChange={(e) =>
                              updateRequirements((reqs) => {
                                reqs.classifications = reqs.classifications.map((c) => (c.id === cls.id ? { ...c, value: e.target.value, identification: e.target.value, code: e.target.value } : c));
                              })
                            }
                            disabled={cls.readOnly}
                            placeholder={cls.constraint === "ENUM" ? "Hodnoty oddělené |" : cls.constraint === "PATTERN" ? "Regex vzor" : "Hodnota klasifikace"}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className={`w-full rounded border border-slate-300 px-2 py-1 text-sm ${cls.readOnly ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}`}
                            value={cls.uri ?? ""}
                            onChange={(e) =>
                              updateRequirements((reqs) => {
                                reqs.classifications = reqs.classifications.map((c) => (c.id === cls.id ? { ...c, uri: e.target.value || undefined } : c));
                              })
                            }
                            disabled={cls.readOnly}
                            placeholder="URI odkaz"
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
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            className={`h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500 ${cls.readOnly ? "cursor-not-allowed" : "cursor-pointer"}`}
                            checked={cls.readOnly ? true : (cls.isApplicability ?? false)}
                            onChange={(e) =>
                              updateRequirements((reqs) => {
                                reqs.classifications = reqs.classifications.map((c) => (c.id === cls.id ? { ...c, isApplicability: e.target.checked } : c));
                              })
                            }
                            disabled={cls.readOnly}
                            title={cls.readOnly ? "Primární klasifikace je vždy v části Použitelnost" : "Pokud je zaškrtnuto, klasifikace bude v části Použitelnost (applicability)"}
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
                  </tbody>
                </table>
              </div>
                </>
              )}
            </div>
          )}

          {activeTab === "ids" && (() => {
            const validationErrors = validateIdsCompliance(object);
            const hasErrors = validationErrors.some((e) => e.type === "error");
            const hasWarnings = validationErrors.some((e) => e.type === "warning");
            // V náhledu IDS zobrazovat jen fáze zaškrtnuté u entity (ifcEntityPhases)
            const entityPhaseIds = object.ifcEntityPhases ?? object.entityPhases;
            const phasesForIdsPreview = entityPhaseIds?.length ? phases.filter((p) => entityPhaseIds.includes(p.id)) : phases;
            const effectivePhaseId = selectedPhaseId && phasesForIdsPreview.some((p) => p.id === selectedPhaseId) ? selectedPhaseId : null;
            
            return (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">IFC4X3_ADD2</span>
                  {hasErrors && (
                    <span className="text-xs text-red-600 flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                      {validationErrors.filter((e) => e.type === "error").length} chyb
                    </span>
                  )}
                  {!hasErrors && hasWarnings && (
                    <span className="text-xs text-amber-600 flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                      {validationErrors.filter((e) => e.type === "warning").length} varování
                    </span>
                  )}
                  {!hasErrors && !hasWarnings && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                      </svg>
                      Validní
                    </span>
                  )}
                </div>
                <button
                  className={`text-sm text-white px-3 py-1.5 rounded flex items-center gap-1.5 ${hasErrors ? "bg-slate-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700"}`}
                  onClick={() => {
                    if (hasErrors) return;
                    const currentPhase = phases.find((p) => p.id === effectivePhaseId);
                    const phaseName = currentPhase ? `${currentPhase.code} - ${currentPhase.name}` : undefined;
                    const xml = generateIdsXml(object, selectedIfcVersion, effectivePhaseId, phaseName, classificationSystemEntries);
                    const blob = new Blob([xml], { type: "application/xml" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    const baseFileName = (object.description || object.code || "specification").replace(/[^a-zA-Z0-9_-]/g, "_");
                    const fileName = currentPhase ? `${baseFileName}_${currentPhase.code}` : baseFileName;
                    a.download = `${fileName}.ids`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  disabled={hasErrors}
                  title={hasErrors ? "Opravte chyby před exportem" : "Stáhnout jako .ids soubor"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                    <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                  </svg>
                  Export IDS
                </button>
              </div>
              
              {/* Validation errors */}
              {validationErrors.length > 0 && (
                <div className="rounded border border-slate-200 bg-white p-3">
                  <div className="text-sm font-semibold text-slate-800 mb-2">Validace IDS</div>
                  <ul className="space-y-1">
                    {validationErrors.map((err, idx) => (
                      <li key={idx} className={`text-xs flex items-start gap-2 ${err.type === "error" ? "text-red-600" : "text-amber-600"}`}>
                        {err.type === "error" ? (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0 mt-0.5">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0 mt-0.5">
                            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                          </svg>
                        )}
                        <span>{err.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Phase tabs – pouze fáze zaškrtnuté u entity (ifcEntityPhases) */}
              {phases.length > 0 && (
                <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-1">
                  <button
                    className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
                      effectivePhaseId === null
                        ? "bg-indigo-100 text-indigo-700 border-b-2 border-indigo-500"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                    onClick={() => setSelectedPhaseId(null)}
                  >
                    Vše
                  </button>
                  {phasesForIdsPreview.map((phase) => (
                    <button
                      key={phase.id}
                      className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
                        effectivePhaseId === phase.id
                          ? "bg-indigo-100 text-indigo-700 border-b-2 border-indigo-500"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                      onClick={() => setSelectedPhaseId(phase.id)}
                      title={phase.name}
                    >
                      {phase.code}
                    </button>
                  ))}
                </div>
              )}
              
              {/* Content view mode tabs */}
              <div className="flex gap-2 border-b border-slate-200">
                <button
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    idsSubTab === "readable"
                      ? "border-b-2 border-indigo-500 text-indigo-600"
                      : "text-slate-600 hover:text-slate-800"
                  }`}
                  onClick={() => setIdsSubTab("readable")}
                >
                  Lidská řeč
                </button>
                <button
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    idsSubTab === "schema"
                      ? "border-b-2 border-indigo-500 text-indigo-600"
                      : "text-slate-600 hover:text-slate-800"
                  }`}
                  onClick={() => setIdsSubTab("schema")}
                >
                  Schéma IDS
                </button>
              </div>
              
              {/* Occurrence filter tabs */}
              <div className="flex gap-1 flex-wrap items-center">
                <span className="text-xs text-slate-500 mr-2">Výskyt:</span>
                <button
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    occurrenceFilter === "all"
                      ? "bg-slate-700 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  onClick={() => setOccurrenceFilter("all")}
                >
                  Vše
                </button>
                <button
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    occurrenceFilter === "required"
                      ? "bg-green-600 text-white"
                      : "bg-green-100 text-green-700 hover:bg-green-200"
                  }`}
                  onClick={() => setOccurrenceFilter("required")}
                >
                  Požadované
                </button>
                <button
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    occurrenceFilter === "prohibited"
                      ? "bg-red-600 text-white"
                      : "bg-red-100 text-red-700 hover:bg-red-200"
                  }`}
                  onClick={() => setOccurrenceFilter("prohibited")}
                >
                  Zakázané
                </button>
                <button
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    occurrenceFilter === "optional"
                      ? "bg-amber-600 text-white"
                      : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                  }`}
                  onClick={() => setOccurrenceFilter("optional")}
                >
                  Možné
                </button>
                {occurrenceFilter !== "all" && (
                  <span className="text-[10px] text-slate-400 ml-2">(pouze náhled)</span>
                )}
              </div>
              
              {/* Human-readable view */}
              {idsSubTab === "readable" && (() => {
                const currentPhase = phases.find((p) => p.id === effectivePhaseId);
                const { applicability, requirements } = generateHumanReadable(object, phases, classificationSystemEntries, effectivePhaseId, occurrenceFilter);
                const hasContent = applicability.length > 0 || requirements.length > 0;
                
                return (
                  <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-700">
                    {currentPhase && (
                      <div className="text-xs text-indigo-600 font-semibold mb-3">
                        Fáze: {currentPhase.code} - {currentPhase.name}
                      </div>
                    )}
                    {!hasContent ? (
                      <div className="text-slate-500 italic">
                        {effectivePhaseId 
                          ? `Žádné požadavky pro fázi ${currentPhase?.code || ""}.`
                          : "Nejsou definovány žádné požadavky. Přidejte entity, vlastnosti, relace nebo další požadavky v ostatních kartách."
                        }
                      </div>
                    ) : (
                      <>
                        {/* Applicability section */}
                        {applicability.length > 0 && (
                          <div className="mb-4">
                            <div className="font-semibold text-slate-800 mb-2">
                              Model <span className="text-indigo-600">MUSÍ</span> obsahovat entity, které mají:
                            </div>
                            <ul className="list-disc pl-5 space-y-1">
                              {applicability.map((item, idx) => (
                                <li key={idx} dangerouslySetInnerHTML={{ __html: item.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-slate-900">$1</strong>') }} />
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {/* Requirements section */}
                        {requirements.length > 0 && (
                          <div>
                            <div className="font-semibold text-slate-800 mb-2">
                              A splňovat následující požadavky:
                            </div>
                            <ul className="list-disc pl-5 space-y-1">
                              {requirements.map((item, idx) => (
                                <li 
                                  key={idx} 
                                  dangerouslySetInnerHTML={{ 
                                    __html: item
                                      .replace(/\*\*MUSÍ\*\*/g, '<strong class="text-indigo-600">MUSÍ</strong>')
                                      .replace(/\*\*NESMÍ\*\*/g, '<strong class="text-red-600">NESMÍ</strong>')
                                      .replace(/\*\*MŮŽE\*\*/g, '<strong class="text-amber-600">MŮŽE</strong>')
                                      .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-slate-900">$1</strong>')
                                      .replace(/\*([^*]+)\*/g, '<em class="text-slate-500">$1</em>')
                                  }} 
                                />
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {/* IFC version badge */}
                        <div className="mt-4 text-right text-xs text-slate-400">
                          #{selectedIfcVersion}
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
              
              {/* XML Schema view */}
              {idsSubTab === "schema" && (() => {
                const currentPhase = phases.find((p) => p.id === effectivePhaseId);
                const phaseName = currentPhase ? `${currentPhase.code} - ${currentPhase.name}` : undefined;
                // For preview, apply occurrence filter; for export, use "all"
                const xml = generateIdsXml(object, selectedIfcVersion, effectivePhaseId, phaseName, classificationSystemEntries, occurrenceFilter);
                const xmlForExport = generateIdsXml(object, selectedIfcVersion, effectivePhaseId, phaseName, classificationSystemEntries, "all");
                const fileName = currentPhase 
                  ? `${(object.description || object.code || "specification").replace(/[^a-zA-Z0-9_-]/g, "_")}_${currentPhase.code}`
                  : (object.description || object.code || "specification").replace(/[^a-zA-Z0-9_-]/g, "_");
                
                return (
                <div className="space-y-2">
                  {currentPhase && (
                    <div className="text-xs text-indigo-600 font-semibold">
                      Fáze: {currentPhase.code} - {currentPhase.name}
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-slate-500">
                      IDS XML schéma dle buildingSMART IDS 1.0
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                        onClick={() => {
                          navigator.clipboard.writeText(xml).then(() => {
                            // Could add a toast notification here
                          });
                        }}
                        title="Kopírovat do schránky"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12a1.5 1.5 0 01.439 1.061V11.5a1.5 1.5 0 01-1.5 1.5H8.5A1.5 1.5 0 017 11.5V3.5z" />
                          <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-1h-5A2.5 2.5 0 015.5 13V6h-1z" />
                        </svg>
                        Kopírovat
                      </button>
                      <button
                        className={`text-xs text-white px-2 py-1 rounded flex items-center gap-1 ${hasErrors ? "bg-slate-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700"}`}
                        onClick={() => {
                          if (hasErrors) return;
                          // Export always uses full XML (no occurrence filter)
                          const blob = new Blob([xmlForExport], { type: "application/xml" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `${fileName}.ids`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        }}
                        disabled={hasErrors}
                        title={hasErrors ? "Opravte chyby před exportem" : "Stáhnout jako .ids soubor (vždy export všech požadavků)"}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                          <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                        </svg>
                        Export .ids
                      </button>
                    </div>
                  </div>
                  <pre className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 overflow-auto max-h-[500px] font-mono whitespace-pre">
                    {xml}
                  </pre>
                </div>
                );
              })()}
              
            </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
