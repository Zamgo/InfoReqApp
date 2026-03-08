/**
 * Generuje IFC_4.json – slovník výskytových entit pro IFC4 ve formátu bSDD (Classes).
 * Používá se stejný výběr entit jako v build_schema_index (isOccurrenceEntity), aby
 * IFC4 mohl používat stejný postup jako IFC 4.3 (build ze slovníku).
 *
 * Spuštění: tsx scripts/generate_ifc4_dictionary.ts
 * Výstup: IFC/IFC_4.json
 */

import fs from "fs";
import path from "path";
import { parseIfcXsd } from "./parse_ifc_xsd";

const ROOT = path.resolve(process.cwd());
const XSD_PATH = path.join(ROOT, "IFC", "IFC_4_ADD2_TC1", "XSD", "IFC4.xsd");
const OUTPUT_PATH = path.join(ROOT, "IFC", "IFC_4.json");

function isOccurrenceEntity(name: string): boolean {
  if (!name.startsWith("Ifc")) return false;
  if (name.endsWith("Type")) return false;
  if (name.startsWith("IfcRel")) return false;
  if (name === "IfcRelationship") return false;
  if (name.startsWith("IfcRepresentation")) return false;
  if (name.startsWith("IfcProperty")) return false;
  if (name.startsWith("IfcConstraint")) return false;
  if (name === "IfcResource" || name.startsWith("IfcResource")) return false;
  return true;
}

/** Odvození zobrazovacího jména z kódu (IfcWall -> Wall). */
function codeToName(code: string): string {
  const withoutIfc = code.replace(/^Ifc/, "");
  if (!withoutIfc) return code;
  return withoutIfc.charAt(0).toUpperCase() + withoutIfc.slice(1);
}

function main(): void {
  if (!fs.existsSync(XSD_PATH)) {
    console.error(`XSD nenalezen: ${XSD_PATH}`);
    process.exit(1);
  }

  console.log("🔧 Generuji IFC4 slovník z XSD ...");
  const { entityAttributes } = parseIfcXsd(XSD_PATH);

  const classes: Array<{ Code: string; Name: string; Definition: string; ClassType: string; ClassProperties: unknown[] }> = [];
  for (const [name] of entityAttributes) {
    if (!isOccurrenceEntity(name)) continue;
    classes.push({
      Code: name,
      Name: codeToName(name),
      Definition: "",
      ClassType: "Class",
      ClassProperties: [],
    });
  }

  classes.sort((a, b) => a.Code.localeCompare(b.Code));

  const dictionary = {
    ModelVersion: "2.0",
    OrganizationCode: "buildingsmart",
    DictionaryCode: "ifc",
    DictionaryName: "IFC",
    DictionaryVersion: "4",
    LanguageIsoCode: "EN",
    LanguageOnly: false,
    UseOwnUri: false,
    License: "CC BY-ND 4.0",
    LicenseUrl: "https://creativecommons.org/licenses/by-nd/4.0/legalcode",
    MoreInfoUrl: "https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/",
    QualityAssuranceProcedure: "IFC4 dictionary generated from XSD for schema index build. Entity list filtered to occurrence entities only (no *Type, no IfcRel*, etc.).",
    QualityAssuranceProcedureUrl: "https://technical.buildingsmart.org/standards/ifc/",
    ReleaseDate: new Date().toISOString().slice(0, 10),
    Classes: classes,
  };

  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(dictionary, null, 2), "utf-8");
  console.log(`✅ Zapsáno do ${OUTPUT_PATH} (${classes.length} tříd)`);
}

main();
