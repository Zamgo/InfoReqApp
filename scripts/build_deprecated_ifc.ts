/**
 * Jednorázové vygenerování seznamu deprecated IFC entit a predefined type hodnot
 * ze stránky buildingSMART Validation Service (IFC102 Gherkin rules):
 * https://buildingsmart.github.io/ifc-gherkin-rules/branches/main/features/IFC102_Absence-of-deprecated-entities.html
 *
 * Parsuje HTML/text stránky a vytáhne:
 * - deprecated entity (scénáře "Check for deprecated entities" + "Check for deprecated explicitly instantiated entities")
 * - deprecated hodnoty PredefinedType (scénář "Check for deprecated enumerated values")
 *
 * Použití: tsx scripts/build_deprecated_ifc.ts
 * Výstup: public/ifc/deprecated_ifc4x3.json, public/ifc/deprecated_ifc4.json
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd());
const OUTPUT_DIR = path.join(ROOT, "public", "ifc");

const GHERKIN_SOURCE_URL =
  "https://buildingsmart.github.io/ifc-gherkin-rules/branches/main/features/IFC102_Absence-of-deprecated-entities.html";

/** Hodnota v uvozovkách nebo více hodnot oddělených " or ". Odstraní HTML tagy. */
function parseValueCell(cell: string): string[] {
  const cleaned = cell.replace(/<[^>]+>/g, "").trim();
  const parts = cleaned.split(/\s+or\s+/).map((s) => s.trim().replace(/^'|'$/g, ""));
  return parts.filter(Boolean).map((s) => s.toUpperCase());
}

interface DeprecatedOutput {
  deprecatedEntities: string[];
  deprecatedPredefinedTypesByEnum: Record<string, string[]>;
  /** enum -> value (UPPERCASE) -> replacement_or_note z CSV */
  deprecatedPredefinedNotesByEnum: Record<string, Record<string, string>>;
}

interface SchemaIndexMinimal {
  entities: Record<string, { attributes?: Array<{ name: string; dataType: string }> }>;
}

/** Z bloku textu (jeden scénář) vytáhne řádky tabulky Examples – sloupec Entity (jedna pipe tabulka). */
function extractEntityTableFromBlock(block: string): string[] {
  const entities: string[] = [];
  const examplesIdx = block.indexOf("Examples:");
  if (examplesIdx < 0) return entities;
  const tableStart = block.slice(examplesIdx);
  const lines = tableStart.split(/\n/);
  for (const line of lines) {
    const m = line.match(/\|\s*(Ifc[A-Za-z0-9]+)\s*\|/);
    if (m) {
      const name = m[1].trim();
      if (name !== "Entity") entities.push(name);
    }
    if (line.trim() === "" && entities.length > 0) break;
    if (/^\s*Scenario\b/.test(line) || /^\s*Given\s+A\s+model\s+with\s+Schema/.test(line)) break;
  }
  return [...new Set(entities)];
}

/** Rozdělí text na bloky podle řádků "NNN |   Scenario Outline: ..." (Gherkin s čísly řádků). */
function extractEntityTable(text: string, scenarioTitleSubstring: string): string[] {
  const entities: string[] = [];
  const blocks = text.split(/\n\d+\s*\|\s*Scenario\s+Outline\s*:/);
  for (const block of blocks) {
    if (!block.includes(scenarioTitleSubstring)) continue;
    for (const name of extractEntityTableFromBlock(block)) {
      entities.push(name);
    }
  }
  return [...new Set(entities)];
}

/** Z bloku textu vytáhne řádky tabulky Examples pro deprecated enumerated values (Entity | Value). Řádky mohou mít prefix "NNN | ". */
function extractEnumTableFromBlock(block: string): Array<{ entity: string; values: string[] }> {
  const result: Array<{ entity: string; values: string[] }> = [];
  const examplesIdx = block.indexOf("Examples:");
  if (examplesIdx < 0) return result;
  const tableStart = block.slice(examplesIdx);
  const lines = tableStart.split(/\n/);
  let headerSeen = false;
  for (const line of lines) {
    const parts = line.split("|").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const isNumbered = /^\d+$/.test(parts[0]);
      const entityCol = isNumbered ? parts[1] : parts[0];
      const valueCol = isNumbered ? parts[2] : parts[1];
      if (entityCol === "Entity" && (valueCol === "Value" || valueCol?.includes("Value"))) {
        headerSeen = true;
        continue;
      }
      if (headerSeen && entityCol?.startsWith("Ifc") && valueCol) {
        const values = parseValueCell(valueCol);
        if (values.length) result.push({ entity: entityCol.trim(), values });
      }
    }
    if (line.trim() === "" && result.length > 0) break;
    if (/^\d+\s*\|/.test(line) && line.includes("Scenario")) break;
  }
  return result;
}

function extractDeprecatedEnumeratedValues(
  text: string,
  scenarioTitleSubstring: string,
): Array<{ entity: string; values: string[] }> {
  const result: Array<{ entity: string; values: string[] }> = [];
  const blocks = text.split(/\n\d+\s*\|\s*Scenario\s+Outline\s*:/);
  for (const block of blocks) {
    if (!block.includes(scenarioTitleSubstring)) continue;
    result.push(...extractEnumTableFromBlock(block));
  }
  return result;
}

function buildDeprecatedFromGherkin(html: string): {
  ifc43: DeprecatedOutput;
  ifc4: DeprecatedOutput;
} {
  const ifc43Entities = new Set<string>();
  const ifc4Entities = new Set<string>();

  for (const name of extractEntityTable(html, "Check for deprecated entities - IFC4.3")) {
    ifc43Entities.add(name);
  }
  for (const name of extractEntityTable(html, "Check for deprecated explicitly instantiated entities - IFC4.3")) {
    ifc43Entities.add(name);
  }

  for (const name of extractEntityTable(html, "Check for deprecated entities - IFC4")) {
    ifc4Entities.add(name);
  }
  for (const name of extractEntityTable(html, "Check for deprecated explicitly instantiated entities - IFC4")) {
    ifc4Entities.add(name);
  }

  const ifc43EnumRows = extractDeprecatedEnumeratedValues(html, "Check for deprecated enumerated values - IFC4.3");
  const ifc4EnumRows = extractDeprecatedEnumeratedValues(html, "Check for deprecated enumerated values - IFC4");

  const schemaPath43 = path.join(OUTPUT_DIR, "schema_index_ifc4x3.json");
  const schemaPath4 = path.join(OUTPUT_DIR, "schema_index_ifc4.json");

  function entityToEnumType(
    schema: SchemaIndexMinimal | null,
    entity: string,
  ): string | null {
    if (!schema?.entities[entity]) return null;
    const attr = schema.entities[entity].attributes?.find((a) => a.name === "PredefinedType");
    return attr?.dataType?.endsWith("Enum") ? attr.dataType : null;
  }

  function buildByEnum(
    rows: Array<{ entity: string; values: string[] }>,
    schema: SchemaIndexMinimal | null,
  ): Record<string, string[]> {
    const byEnum: Record<string, string[]> = {};
    for (const { entity, values } of rows) {
      const enumType = entityToEnumType(schema, entity);
      if (!enumType) continue;
      if (!byEnum[enumType]) byEnum[enumType] = [];
      for (const v of values) {
        if (!byEnum[enumType].includes(v)) byEnum[enumType].push(v);
      }
    }
    return byEnum;
  }

  const schema43: SchemaIndexMinimal | null = fs.existsSync(schemaPath43)
    ? JSON.parse(fs.readFileSync(schemaPath43, "utf-8"))
    : null;
  const schema4: SchemaIndexMinimal | null = fs.existsSync(schemaPath4)
    ? JSON.parse(fs.readFileSync(schemaPath4, "utf-8"))
    : null;

  const ifc43: DeprecatedOutput = {
    deprecatedEntities: [...ifc43Entities].sort(),
    deprecatedPredefinedTypesByEnum: buildByEnum(ifc43EnumRows, schema43),
    deprecatedPredefinedNotesByEnum: {},
  };
  const ifc4: DeprecatedOutput = {
    deprecatedEntities: [...ifc4Entities].sort(),
    deprecatedPredefinedTypesByEnum: buildByEnum(ifc4EnumRows, schema4),
    deprecatedPredefinedNotesByEnum: {},
  };

  return { ifc43, ifc4 };
}

/**
 * Sloučí do IFC4.3 deprecated predefined types z lokálního CSV souboru
 * (např. IFC/ifc43_deprecated_predefined_types.csv).
 * CSV formát: entity,enum_name,deprecated_value,deprecation_version,replacement_or_note
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let end = i + 1;
      while (end < line.length) {
        if (line[end] === '"') {
          if (line[end + 1] === '"') end += 2;
          else break;
        } else end++;
      }
      result.push(line.slice(i + 1, end).replace(/""/g, '"'));
      i = end + 1;
      if (line[i] === ",") i++;
    } else {
      const comma = line.indexOf(",", i);
      if (comma < 0) {
        result.push(line.slice(i).trim());
        break;
      }
      result.push(line.slice(i, comma).trim());
      i = comma + 1;
    }
  }
  return result;
}

function mergeCsvDeprecatedForIfc43(base: DeprecatedOutput): DeprecatedOutput {
  const csvPathEnv = process.env.IFC43_DEPRECATED_CSV;
  const candidatePaths = [
    csvPathEnv && csvPathEnv.trim(),
    path.join(ROOT, "IFC", "ifc43_deprecated_predefined_types.csv"),
  ].filter((p): p is string => !!p);

  let csvPath: string | null = null;
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      csvPath = p;
      break;
    }
  }
  if (!csvPath) return base;

  const text = fs.readFileSync(csvPath, "utf-8");
  const lines = text.split(/\r?\n/).slice(1); // skip header

  const merged: DeprecatedOutput = {
    deprecatedEntities: [...base.deprecatedEntities],
    deprecatedPredefinedTypesByEnum: Object.fromEntries(
      Object.entries(base.deprecatedPredefinedTypesByEnum).map(([k, v]) => [k, [...v]]),
    ),
    deprecatedPredefinedNotesByEnum: Object.fromEntries(
      Object.entries(base.deprecatedPredefinedNotesByEnum || {}).map(([k, v]) => [k, { ...v }]),
    ),
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = parseCsvLine(line);
    const enumName = parts[1]?.trim();
    const rawVal = parts[2]?.trim();
    const note = parts[4]?.trim();
    if (!enumName || !rawVal) continue;
    const value = rawVal.toUpperCase();
    if (!merged.deprecatedPredefinedTypesByEnum[enumName]) {
      merged.deprecatedPredefinedTypesByEnum[enumName] = [];
    }
    const arr = merged.deprecatedPredefinedTypesByEnum[enumName];
    if (!arr.includes(value)) arr.push(value);
    if (note) {
      if (!merged.deprecatedPredefinedNotesByEnum[enumName]) {
        merged.deprecatedPredefinedNotesByEnum[enumName] = {};
      }
      merged.deprecatedPredefinedNotesByEnum[enumName][value] = note;
    }
  }

  return merged;
}

/** Do libovolného výstupu (IFC4 nebo IFC4.3) doplní pouze poznámky z CSV – aby se doporučení zobrazovala i při verzi IFC4. */
function mergeCsvNotesInto(base: DeprecatedOutput): DeprecatedOutput {
  const csvPathEnv = process.env.IFC43_DEPRECATED_CSV;
  const candidatePaths = [
    csvPathEnv && csvPathEnv.trim(),
    path.join(ROOT, "IFC", "ifc43_deprecated_predefined_types.csv"),
  ].filter((p): p is string => !!p);

  let csvPath: string | null = null;
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      csvPath = p;
      break;
    }
  }
  if (!csvPath) return base;

  const text = fs.readFileSync(csvPath, "utf-8");
  const lines = text.split(/\r?\n/).slice(1);

  const result: DeprecatedOutput = {
    deprecatedEntities: [...base.deprecatedEntities],
    deprecatedPredefinedTypesByEnum: Object.fromEntries(
      Object.entries(base.deprecatedPredefinedTypesByEnum).map(([k, v]) => [k, [...v]]),
    ),
    deprecatedPredefinedNotesByEnum: Object.fromEntries(
      Object.entries(base.deprecatedPredefinedNotesByEnum || {}).map(([k, v]) => [k, { ...v }]),
    ),
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = parseCsvLine(line);
    const enumName = parts[1]?.trim();
    const rawVal = parts[2]?.trim();
    const note = parts[4]?.trim();
    if (!enumName || !rawVal || !note) continue;
    const value = rawVal.toUpperCase();
    if (!result.deprecatedPredefinedNotesByEnum[enumName]) {
      result.deprecatedPredefinedNotesByEnum[enumName] = {};
    }
    result.deprecatedPredefinedNotesByEnum[enumName][value] = note;
  }
  return result;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const html = await res.text();
  const preBlocks = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/gi);
  if (preBlocks) {
    for (const block of preBlocks) {
      const inner = block.replace(/<pre[^>]*>|<\/pre>/gi, "").trim();
      if (inner.includes("Scenario Outline") && inner.includes("Check for deprecated entities")) {
        return inner
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&")
          .replace(/&#39;/g, "'")
          .replace(/&#64;/g, "@");
      }
    }
  }
  return html;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const main = async () => {
  console.log("\n🔧 Načítám IFC102 deprecated z buildingSMART Gherkin rules ...\n");
  const html = await fetchText(GHERKIN_SOURCE_URL);
  const fromGherkin = buildDeprecatedFromGherkin(html);
  const ifc43 = mergeCsvDeprecatedForIfc43(fromGherkin.ifc43);
  const ifc4 = mergeCsvNotesInto(fromGherkin.ifc4);

  ensureDir(OUTPUT_DIR);

  const path43 = path.join(OUTPUT_DIR, "deprecated_ifc4x3.json");
  const path4 = path.join(OUTPUT_DIR, "deprecated_ifc4.json");
  fs.writeFileSync(path43, JSON.stringify(ifc43, null, 2), "utf-8");
  fs.writeFileSync(path4, JSON.stringify(ifc4, null, 2), "utf-8");

  console.log(`  IFC 4.3: ${ifc43.deprecatedEntities.length} deprecated entit, ${Object.keys(ifc43.deprecatedPredefinedTypesByEnum).length} enum typů`);
  console.log(`  IFC 4:   ${ifc4.deprecatedEntities.length} deprecated entit, ${Object.keys(ifc4.deprecatedPredefinedTypesByEnum).length} enum typů`);
  console.log(`\n✅ Zapsáno: ${path43}`);
  console.log(`✅ Zapsáno: ${path4}\n`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
