# Struktura adresářů a úklid

Popis toho, co kde v repozitáři leží a jak to uklidit, aby byl kořen přehledný a další lidé se vyznali.

---

## Stav: chyby v kódu

- **Linter:** V `src` nejsou hlášené chyby.
- Při změnách vždy zkontrolovat `npm run build` a hlavní scénáře (načtení, export, přepnutí verze).

---

## Kořen repozitáře – co tam je a proč (po úklidu)

| Položka | Účel | Poznámka |
|--------|------|----------|
| **IFC/** | Zdrojové soubory IFC (XSD, Pset/Qto XML, **IFC_4x3.json**) pro build schema indexu | Build skript čte z `IFC/IFC_4x3.json` a z podsložek IFC_4_3_ADD2, IFC_4_ADD2_TC1. |
| **IDS/** | Dokumentace IDS (XSD, md), vzorové soubory (xlsx, txt), obrázky | Smíšené: dokumentace + vzorky. |
| **Archiv/** | Archiv souborů | Ponecháno; účel dle potřeby. |
| **img/** | Obrázky | Ponechat. |
| **Vzorové soubory/** | Vzorové klasifikace (TSV) a šablony (xlsx) | Sem byly přesunuty z kořene: Kategorie_RVT.txt, Klasifikace_*.txt, šablona Příloha_A-1-a_Datový_standard.xlsx. |
| **docs/** | Dokumentace (architektura, návody, **RELEASE.md**) | RELEASE.md byl přesunut z kořene do docs/. |
| **public/**, **src/**, **scripts/** | Aplikace a build | Beze změn. |
| **index.html**, **package.json**, **vite.config.ts**, **tsconfig*.json**, **tailwind.config.js**, **postcss.config.js** | Konfigurace a vstupní bod | Standardně v kořeni; nepřesouvat. |
| **dist/** | Výstup `npm run build` | V .gitignore; necommittovat. |

---

## Provedený úklid

- **Vzorové soubory:** Do složky **`Vzorové soubory/`** byly přesunuty z kořene: `Kategorie_RVT.txt`, `Klasifikace_IfcEntity.txt`, `Klasifikace_IfcEntity_CCI.txt`, `Klasifikace_Obecné.txt`, šablona `(Šablona) Příloha_A-1-a_Datový_standard.xlsx`. V kořeni už neleží.
- **IFC_4x3.json:** Přesunut do **`IFC/IFC_4x3.json`**. V `scripts/build_schema_index.ts` je `jsonPath` upraven na `path.join(ROOT, "IFC", "IFC_4x3.json")`.
- **RELEASE.md:** Přesunut do **`docs/RELEASE.md`**.

Žádný kód v `src` neodkazuje na cesty k přesunutým TXT ani xlsx; build schema 4x3 používá novou cestu k IFC_4x3.json.

## Co dál (volitelně)

- **Archiv:** Rozhodnout, zda je potřeba; případně přejmenovat na `docs/archive` nebo popsat účel zde.
- **IDS:** Lze ponechat jako „dokumentace + vzorky“, nebo vzorky přesunout do `Vzorové soubory/IDS`.
- **Přejmenování „Vzorové soubory“ na „samples“:** Pro srozumitelnost pro nečesky mluvící; nutné by bylo jen při mezinárodním sdílení.

---

## Shrnutí

- **Chyby:** Žádné linter chyby v `src`.
- **Úklid kořene:** Vzorové TXT a xlsx jsou ve složce `Vzorové soubory/`, IFC_4x3.json v `IFC/`, RELEASE.md v `docs/`. Kořen obsahuje jen konfiguraci, vstupní bod a složky (IFC, IDS, docs, public, src, scripts, Vzorové soubory, Archiv, img).
- **Další postup podle plánu:** (1) Dokumentace – hotovo. (2) Lehký úklid kódu – přesunout `migrateProject` do `src/project/`. (3) Testování – manuální checklist. (4) Nové funkce.
