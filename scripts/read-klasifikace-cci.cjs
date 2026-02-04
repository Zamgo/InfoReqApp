const ExcelJS = require("exceljs");
const path = require("path");

async function analyze() {
  const filePath = path.join(__dirname, "..", "Vzorov\u00e9 soubory", "Klasifikace_CCI.xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];

  console.log("=== Rows with H,I,J codes (full code) and IFC_class, Popis ===");
  let lastH = null, lastI = null, lastJ = null;
  const rowsWithCodes = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    let h = row.getCell(8).value;
    let i = row.getCell(9).value;
    let j = row.getCell(10).value;
    if (h) lastH = h;
    if (i) lastI = i;
    if (j) lastJ = j;
    const code = lastH && lastI && lastJ ? [lastH, lastI, lastJ].join("-") : null;
    const ifcClass = row.getCell(4).value;
    const popis = row.getCell(2).value;
    const cesta = row.getCell(1).value;
    if (code && ifcClass) {
      rowsWithCodes.push({ row: r, code, ifcClass, popis, cesta });
    }
  }
  rowsWithCodes.forEach((x) => console.log(JSON.stringify(x)));
}

analyze().catch((e) => console.error(e));
