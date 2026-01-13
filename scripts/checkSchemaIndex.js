import fs from "fs";
import path from "path";

const target = path.resolve("public/ifc/schema_index_ifc4x3.json");

if (!fs.existsSync(target)) {
  console.warn(
    `⚠️  Soubor schema_index_ifc4x3.json chybí. Spusťte "npm run build:schema".`,
  );
}
