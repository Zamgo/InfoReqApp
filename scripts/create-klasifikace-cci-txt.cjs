const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");

function normalize(str) {
  if (!str || typeof str !== "string") return "";
  const map = {
    á: "a", č: "c", ď: "d", é: "e", ě: "e", í: "i", ň: "n", ó: "o", ř: "r",
    š: "s", ť: "t", ú: "u", ů: "u", ý: "y", ž: "z",
    Á: "A", Č: "C", Ď: "D", É: "E", Ě: "E", Í: "I", Ň: "N", Ó: "O", Ř: "R",
    Š: "S", Ť: "T", Ú: "U", Ů: "U", Ý: "Y", Ž: "Z",
  };
  return str
    .trim()
    .toLowerCase()
    .split("")
    .map((c) => map[c] || c)
    .join("");
}

async function main() {
  const baseDir = path.join(__dirname, "..");
  const excelPath = path.join(baseDir, "Vzorov\u00e9 soubory", "Klasifikace_CCI.xlsx");
  const txtPath = path.join(baseDir, "Klasifikace_IfcEntity.txt");
  const outPath = path.join(baseDir, "Klasifikace_IfcEntity_CCI.txt");

  // 1. Build mapping from Excel: normalized name -> CCI code (H-I-J)
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(excelPath);
  const ws = wb.worksheets[0];

  const nameToCode = new Map();

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const h = row.getCell(8).value;
    const i = row.getCell(9).value;
    const j = row.getCell(10).value;
    // Pouze explicitně vyplněné hodnoty, bez dědičnosti - prázdné = prázdné
    const codeParts = [h, i, j].filter((v) => v != null && String(v).trim() !== "");
    const code = codeParts.join("-");

    const cesta = row.getCell(1).value;
    if (cesta) {
      const name = String(cesta).trim();
      const key = normalize(name);
      nameToCode.set(key, code);
      // Excel uses UTCH, TXT uses UTC - add alias for matching
      if (key.includes("utch")) {
        nameToCode.set(key.replace(/utch/g, "utc"), code);
      }
    }
  }

  // 2. Read TXT and replace third-level codes
  const txtContent = fs.readFileSync(txtPath, "utf-8");
  const lines = txtContent.split(/\r?\n/);
  const outLines = [];

  for (const line of lines) {
    if (!line.trim()) {
      outLines.push(line);
      continue;
    }

    const parts = line.split("\t");
    const level = parseInt(parts[2], 10);

    if (level === 3 && parts.length >= 5) {
      const name = parts[1];
      const key = normalize(name);
      const cciCode = nameToCode.get(key);

      if (nameToCode.has(key)) {
        parts[0] = cciCode;
        outLines.push(parts.join("\t"));
      } else {
        outLines.push(line);
      }
    } else {
      outLines.push(line);
    }
  }

  fs.writeFileSync(outPath, outLines.join("\n"), "utf-8");
  console.log("Created:", outPath);
}

main().catch((e) => console.error(e));
