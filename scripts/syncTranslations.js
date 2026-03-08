/**
 * Zkopíruje Excel soubory z IFC/TRANSLATION do public/ifc/translations/.
 * Aplikace očekává výchozí soubor na /ifc/translations/Preklady.xlsx.
 * Spusťte před dev/build nebo po úpravě překladů v IFC/TRANSLATION.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "IFC", "TRANSLATION");
const destDir = path.join(root, "public", "ifc", "translations");

if (!fs.existsSync(srcDir)) {
  fs.mkdirSync(destDir, { recursive: true });
  console.log("sync:translations – IFC/TRANSLATION neexistuje, vytvořena prázdná public/ifc/translations");
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
const entries = fs.readdirSync(srcDir, { withFileTypes: true });
let copied = 0;
for (const e of entries) {
  if (!e.isFile()) continue;
  const lower = e.name.toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) continue;
  const src = path.join(srcDir, e.name);
  const dest = path.join(destDir, e.name);
  fs.copyFileSync(src, dest);
  copied++;
  console.log("sync:translations – zkopírováno:", e.name);
}
if (copied === 0) {
  console.log("sync:translations – v IFC/TRANSLATION nejsou žádné .xlsx/.xls soubory");
} else {
  console.log("sync:translations – celkem", copied, "soubor(ů)");
}
