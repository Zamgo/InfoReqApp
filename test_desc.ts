import { fetchBsddDescription } from './src/translation/translators/BsddTranslator';

async function main() {
  const isPt = true;
  const ifcEntity = "IfcSanitaryTerminal";
  const ptValue = "TOILET";
  const fillCz = true;
  const fillEn = true;

  let entityDescCz: string | null = null;
  let entityDescEn: string | null = null;
  let ptDescCz: string | null = null;
  let ptDescEn: string | null = null;

  if (fillCz) entityDescCz = await fetchBsddDescription("entity", ifcEntity, "cs-CZ");
  if (fillEn) entityDescEn = await fetchBsddDescription("entity", ifcEntity, "en-US");

  if (isPt) {
    if (fillCz) ptDescCz = await fetchBsddDescription("predefinedType", ptValue, "cs-CZ", { entity: ifcEntity });
    if (fillEn) ptDescEn = await fetchBsddDescription("predefinedType", ptValue, "en-US", { entity: ifcEntity });
  }

  const parts: string[] = [];

  const addPart = (ent: string | null, pt: string | null, lang: "CZ" | "EN") => {
    if (!ent && !pt) return;
    let text = "";
    if (ent && pt) {
      text = lang === "CZ" ? `Entita: ${ent}\nTyp: ${pt}` : `Entity: ${ent}\nType: ${pt}`;
    } else if (ent) {
      text = ent;
    } else if (pt) {
      text = lang === "CZ" ? `Typ: ${pt}` : `Type: ${pt}`;
    }
    parts.push(text);
  };

  addPart(entityDescEn, ptDescEn, "EN");
  
  const isCzSame = entityDescCz === entityDescEn && ptDescCz === ptDescEn;
  if (!isCzSame) {
    addPart(entityDescCz, ptDescCz, "CZ");
  }

  console.log(parts.join("\n\n"));
}
main();