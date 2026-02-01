/**
 * Automatický překlad IFC názvů do češtiny - jednorázově v rámci aplikace.
 * Heuristiky + inline slovník pro běžné termíny.
 */
import type { TranslatableItemType, TranslationResult } from "../types";

/** Běžné IFC entity → čeština */
const ENTITY_MAP: Record<string, string> = {
  IfcWall: "Stěna",
  IfcDoor: "Dveře",
  IfcWindow: "Okno",
  IfcSlab: "Deska",
  IfcColumn: "Sloup",
  IfcBeam: "Trám",
  IfcRoof: "Střecha",
  IfcStair: "Schodiště",
  IfcRamp: "Rampa",
  IfcCurtainWall: "Zastěnující stěna",
  IfcCovering: "Obklad",
  IfcFooting: "Základ",
  IfcPile: "Pilot",
  IfcPlate: "Plech",
  IfcMember: "Prut",
  IfcSpace: "Prostor",
  IfcBuildingStorey: "Podlaží",
  IfcBuilding: "Budova",
  IfcSite: "Staveniště",
  IfcProject: "Projekt",
  IfcFurnishingElement: "Zařizovací prvek",
  IfcFurniture: "Nábytek",
  IfcBuildingElementProxy: "Proxy prvek budovy",
  IfcOpeningElement: "Otvor",
  IfcDistributionElement: "Distribuční prvek",
  IfcFlowTerminal: "Tokový koncový prvek",
  IfcFlowSegment: "Tokový segment",
  IfcFlowFitting: "Toková armatura",
  IfcFlowController: "Tokový regulátor",
  IfcPump: "Čerpadlo",
  IfcFan: "Ventilátor",
  IfcChiller: "Chladič",
  IfcBoiler: "Kotel",
  IfcDuctSegment: "Segment potrubí",
  IfcPipeSegment: "Segment potrubí",
  IfcDuctFitting: "Armatura potrubí",
  IfcPipeFitting: "Armatura potrubí",
  IfcValve: "Ventil",
  IfcFlowMeter: "Měřidlo průtoku",
  IfcAirTerminal: "Vzduchový koncový prvek",
  IfcLightFixture: "Světelný přístroj",
  IfcSwitchingDevice: "Spínací zařízení",
  IfcElectricDistributionBoard: "Rozváděč",
  IfcCableSegment: "Segment kabelu",
  IfcActuator: "Aktuátor",
  IfcSensor: "Snímač",
  IfcController: "Řadič",
  IfcAlarm: "Alarm",
  IfcSanitaryTerminal: "Sanitární koncový prvek",
  IfcWasteTerminal: "Odpady",
  IfcFlowStorageDevice: "Zařízení pro uložení média",
  IfcTank: "Nádrž",
  IfcMaterial: "Materiál",
  IfcMaterialLayer: "Vrstva materiálu",
  IfcMaterialProfile: "Profil materiálu",
};

/** Běžné PredefinedType hodnoty */
const PREDEFINED_TYPE_MAP: Record<string, string> = {
  SOLIDWALL: "Pevná stěna",
  PARTITIONING: "Příčka",
  ELEMENTEDWALL: "Elementovaná stěna",
  USERDEFINED: "Uživatelem definováno",
  NOTDEFINED: "Není definováno",
  SINGLE: "Jednoduché",
  DOUBLE: "Dvojité",
  TRIPLE: "Trojité",
  ELEMENTED: "Elementované",
  PLATE: "Deska",
  LOADBEARING: "Nosná",
  NONLOADBEARING: "Nenosná",
  EXTERNAL: "Vnější",
  INTERNAL: "Vnitřní",
  FIXED: "Pevné",
  OPERABLE: "Otevíratelné",
  FLOOR: "Podlaha",
  ROOF: "Střecha",
  LANDING: "Podest",
};

/** Běžné názvy vlastností */
const PROPERTY_MAP: Record<string, string> = {
  IsExternal: "Je venkovní",
  LoadBearing: "Nosnost",
  FireRating: "Požární odolnost",
  AcousticRating: "Akustická hodnota",
  Reference: "Reference",
  Status: "Stav",
  IsTypedBy: "Je typován",
  Name: "Název",
  Description: "Popis",
  ObjectType: "Typ objektu",
};

/** camelCase → čitelný text s českými ekvivalenty */
function camelCaseToCzech(text: string): string {
  const chunks = text
    .replace(/([A-Z])/g, " $1")
    .replace(/^Ifc|^Pset_|^Qto_/, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (chunks.length === 0) return text;

  const cz: Record<string, string> = {
    Is: "Je",
    Has: "Má",
    Load: "Nos",
    Bearing: "nost",
    External: "venkovní",
    Internal: "vnitřní",
    Fire: "Požární",
    Rating: "hodnocení",
    Name: "název",
    Type: "typ",
    Common: "společné",
    Base: "základní",
    Quantities: "množství",
    Wall: "stěny",
    Door: "dveří",
    Window: "oken",
    Slab: "desky",
    Beam: "trámu",
    Column: "sloupu",
  };

  return chunks
    .map((c) => cz[c] ?? c.charAt(0) + c.slice(1).toLowerCase())
    .join(" ");
}

function normalizeKey(s: string): string {
  return s.replace(/^Ifc|^Pset_|^Qto_/, "").replace(/_/g, "");
}

export async function translateAuto(
  type: TranslatableItemType,
  officialName: string,
  _context?: { entity?: string; psetName?: string }
): Promise<TranslationResult> {
  if (!officialName?.trim()) return { translated: null, source: null };

  const key = officialName.trim();
  let result: string | null = null;

  switch (type) {
    case "entity":
      result = ENTITY_MAP[key] ?? ENTITY_MAP[normalizeKey(key)];
      if (!result) {
        const withoutIfc = key.replace(/^Ifc/, "");
        result = camelCaseToCzech(withoutIfc);
      }
      break;
    case "predefinedType": {
      const upper = key.toUpperCase();
      result = PREDEFINED_TYPE_MAP[key] ?? PREDEFINED_TYPE_MAP[upper];
      if (!result) {
        result = camelCaseToCzech(key.replace(/_/g, " "));
        if (result === key && upper === key) {
          result = key.charAt(0) + key.slice(1).toLowerCase();
        }
      }
      break;
    }
    case "pset":
    case "qto":
      result = camelCaseToCzech(key.replace(/^Pset_|^Qto_/, "").replace(/_/g, " "));
      break;
    case "property":
      result = PROPERTY_MAP[key] ?? camelCaseToCzech(key);
      break;
    default:
      result = camelCaseToCzech(key);
  }

  return { translated: result || null, source: "auto" };
}
