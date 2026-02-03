const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");

async function analyze() {
  const baseDir = path.join(__dirname, "..");
  const dirs = fs.readdirSync(baseDir);
  const vzorDir = dirs.find((d) => d.toLowerCase().includes("vzor") && d.toLowerCase().includes("soubory"));
  if (!vzorDir) {
    console.log("Vzorové soubory not found. Dirs:", dirs);
    return;
  }
  const files = fs.readdirSync(path.join(baseDir, vzorDir));
  const fileToAnalyze = files.find((f) => f.toLowerCase().includes("zdroj") && f.endsWith(".xlsx"));
  if (!fileToAnalyze) {
    console.log("Zdroj file not found. Available:", files);
    return;
  }
  const filePath = path.join(baseDir, vzorDir, fileToAnalyze);
  console.log("Reading:", filePath);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  console.log("\n=== SHEETS ===");
  wb.eachSheet((ws, id) => {
    console.log("Sheet", id, ":", ws.name, "- rows:", ws.rowCount);
  });

  const zdroj = wb.getWorksheet("Zdroj");
  if (zdroj) {
    const row1 = zdroj.getRow(1);
    const headers = [];
    row1.eachCell((c) => headers.push(c.value));
    console.log("\n=== ZDROJ HEADERS ===");
    headers.forEach((h, i) => console.log(i + 1 + ":", h));
    console.log("\nSample rows (2-4):");
    for (let r = 2; r <= Math.min(4, zdroj.rowCount); r++) {
      const row = zdroj.getRow(r);
      const vals = [];
      row.eachCell((c) => vals.push(c.value));
      console.log("Row", r, ":", vals.slice(0, 18).join(" | "));
    }
  }

  const proj = wb.getWorksheet("PROJEKT");
  if (proj) {
    console.log("\n=== PROJEKT ===");
    proj.eachRow((r, i) => console.log("Row", i, ":", r.values));
  }

  const faze = wb.getWorksheet("FÁZE");
  if (faze) {
    console.log("\n=== FÁZE ===");
    faze.eachRow((r, i) => console.log("Row", i, ":", r.values));
  }

  const ciselniky = wb.getWorksheet("ČÍSELNÍKY");
  if (ciselniky) {
    console.log("\n=== ČÍSELNÍKY ===");
    ciselniky.eachRow((r, i) => {
      if (i <= 6) console.log("Row", i, ":", r.values);
    });
  }

  const klas = wb.getWorksheet("Klasifikace_hierarchie");
  if (klas) {
    console.log("\n=== Klasifikace_hierarchie (first 5 rows) ===");
    klas.eachRow((r, i) => {
      if (i <= 5) console.log("Row", i, ":", r.values);
    });
  }

  const prvky = wb.getWorksheet("PRVKY");
  if (prvky) {
    const row1 = prvky.getRow(1);
    const headers = [];
    row1.eachCell((c) => headers.push(c.value));
    console.log("\n=== PRVKY HEADERS (" + headers.length + ") ===");
    headers.forEach((h, i) => console.log(i + 1 + ":", h));
    console.log("\nPRVKY sample rows (2-4):");
    for (let r = 2; r <= Math.min(4, prvky.rowCount); r++) {
      const row = prvky.getRow(r);
      const vals = [];
      row.eachCell((c) => vals.push(c.value));
      console.log("Row", r, ":", vals.slice(0, 15).join(" | "));
    }
  }

  const pozadavky = wb.getWorksheet("POŽADAVKY");
  if (pozadavky) {
    const row1 = pozadavky.getRow(1);
    const headers = [];
    row1.eachCell((c) => headers.push(c.value));
    console.log("\n=== POŽADAVKY HEADERS (" + headers.length + ") ===");
    headers.forEach((h, i) => console.log(i + 1 + ":", h));
    console.log("\nPOŽADAVKY sample rows (2-7):");
    for (let r = 2; r <= Math.min(7, pozadavky.rowCount); r++) {
      const row = pozadavky.getRow(r);
      const vals = [];
      row.eachCell((c) => vals.push(c.value));
      console.log("Row", r, ":", vals.slice(0, 20).join(" | "));
    }
  }

  const klasIfc = wb.worksheets.find((ws) => ws.name && ws.name.includes("Klasifikace_Ifc"));
  if (klasIfc) {
    const row1 = klasIfc.getRow(1);
    const headers = [];
    row1.eachCell((c) => headers.push(c.value));
    console.log("\n=== " + klasIfc.name + " HEADERS ===");
    headers.forEach((h, i) => console.log(i + 1 + ":", h));
    console.log("Sample rows 2-3:", klasIfc.getRow(2).values, klasIfc.getRow(3).values);
  }

  const klasRvt = wb.worksheets.find((ws) => ws.name && ws.name.includes("Kategorie"));
  if (klasRvt) {
    const row1 = klasRvt.getRow(1);
    const headers = [];
    row1.eachCell((c) => headers.push(c.value));
    console.log("\n=== " + klasRvt.name + " HEADERS ===");
    headers.forEach((h, i) => console.log(i + 1 + ":", h));
    console.log("Sample rows 2-3:", klasRvt.getRow(2).values, klasRvt.getRow(3).values);
  }
}

analyze().catch((e) => console.error(e));
