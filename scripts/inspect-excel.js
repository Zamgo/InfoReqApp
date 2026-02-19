const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");

const base = path.join(__dirname, "..");
const dir = path.join(base, "Vzorov\u00e9 soubory");
const files = fs.readdirSync(dir).filter((f) => f.includes("P") && f.endsWith(".xlsx"));
const filePath = path.join(dir, files[0] || "P\u0159\u00edloha_A-1-a_Datov\u00fd_standard.xlsx");

if (!fs.existsSync(filePath)) {
  console.error("File not found:", filePath);
  process.exit(1);
}

const wb = new ExcelJS.Workbook();
wb.xlsx
  .readFile(filePath)
  .then(() => {
    const ws = wb.getWorksheet("POŽADAVKY");
    if (!ws) return;
    const r1 = ws.getRow(1);
    const headers = [];
    for (let i = 1; i <= 50; i++) {
      const v = r1.getCell(i).value;
      const s = v != null ? String(v).trim() : "";
      if (s) headers.push({ i, s });
    }
    console.log("POŽADAVKY headers with index:");
    headers.forEach((h) => console.log("  ", h.i, h.s));
    const colCiselnik = headers.find((h) => /^\u010c\u00edseln\u00edk$/i.test(h.s.normalize("NFC")) || /ciselnik/i.test(h.s.replace(/[\u0300-\u036f]/g, "")));
    console.log("Column matching Číselník:", colCiselnik);
    console.log("\nSample rows (Typ=8, Skupina=9, Param=10, Omezeni=12, Hodnoty=13, Ciselnik=15):");
    for (let r = 2; r <= Math.min(30, ws.rowCount || 0); r++) {
      const row = ws.getRow(r);
      const typ = row.getCell(8).value;
      const skupina = row.getCell(9).value;
      const param = row.getCell(10).value;
      const omezeni = row.getCell(12).value;
      const hodnoty = row.getCell(13).value;
      const c15 = row.getCell(15).value;
      if (String(typ || "").toLowerCase().includes("vlastnost") || r <= 10)
        console.log("R" + r, typ, "|", param, "|", omezeni, "|", String(hodnoty || "").slice(0, 35), "| col15:", c15);
    }
  })
  .catch((e) => console.error(e));
