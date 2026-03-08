# Stav vůči plánu MVP a návrh dalšího postupu

Tento dokument vychází z [plánu MVP auditu a roadmapy](.cursor/plans/inforeqapp_mvp_audit_a_roadmap_073282bd.plan.md) a shrnuje, co je hotové, co zbývá, a jak sladit další postup s úklidem struktury, dokumentací a testováním.

---

## 1. Kde jsme teď (vs. plán)

### Hotovo z plánu (priorita „řešit jako první“)

| Plán | Stav |
|------|------|
| Konfigurace IFC verze + SchemaProvider podle verze | **Hotovo.** `ifcVersionConfig.ts`, SchemaProvider bere `version` z App, typ `ifcSchemaVersion: "IFC4" \| "IFC4X3"`. |
| Build schema indexu pro obě verze | **Hotovo.** Parametrizovaný build (4x3 / 4), zdroje z `IFC/`, výstupy v `public/ifc/`. |
| Sjednocení IFC verze v aplikaci | **Hotovo.** Verze z projektu → SchemaProvider, IDS export, všechny odkazy (lexical, property, Pset, klasifikace, bSDD). |
| Výběr verze v nastavení projektu | **Hotovo.** ProjectDetailsDialog – select IFC4 / IFC 4.3, předvyplnění dokumentační URL. |
| Živá dokumentace – začátek | **Doplněno.** Kromě overview a schema-and-version máme `modules.md`, `data-flows.md`, `sensitive-areas.md`, `translation-vs-mapping.md`, `glossary.md`, pravidlo v README a `structure.md` (struktura adresářů a úklid). |

### Z plánu zatím nedotčeno (priorita „jako druhé“ / „odložit“)

- **Úklid struktury:** vyčlenit logiku z App (migrace do project vrstvy), rozumně rozsekat ObjectDetail – **neřešeno** (ObjectDetail i App zůstávají velké).
- **Dokumentace:** plán požadoval modules, data-flows, sensitive-areas, translation-vs-mapping, glosář – **hotovo**.
- **Příprava na vlastní překlady a mapování:** návrh vrstvy „entity display / mapping“ – **jen v plánu**, v kódu ne.
- **Unit testy, velký refaktor ObjectDetail, backend** – odloženo, beze změny.

### Shrnutí

- **2 IFC verze** jsou z plánu v podstatě vyřešené (konfig, build, načítání podle projektu, odkazy, výběr v UI).
- **Dokumentace** je doplněná (modules, data-flows, sensitive-areas, translation-vs-mapping, glossary, structure); další úklid je přesun migrace a úklid adresářů (viz structure.md).
- **Struktura a úklid** (App, ObjectDetail, migrace) zůstávají podle plánu na „druhou vlnu“ a zatím nebyly řešeny.

---

## 2. Tvůj návrh pořadí: úklid + dokumentace → testování → nové funkce

Toto pořadí dává smysl a je v souladu s plánem.

1. **Nejprve uklidit strukturu a popsat v MD, jak vše funguje**  
   - Sníží to riziko, že při testování nebo při nových funkcích něco rozbijeme bez povědomí o závislostech.  
   - Dokumentace „vedle v MD“ slouží jako základ pro návod i pro případnou obdobnou aplikaci a usnadní předání.

2. **Pak otestovat, že dosavadní funkce přežily**  
   - Po změnách (2 IFC verze, odkazy, stav projektu v App) je vhodné systematicky projít hlavní scénáře (načtení projektu, přepnutí verze, export IDS/Excel, import, klasifikace).  
   - Bez doplněné dokumentace (moduly, toky) by bylo těžší vědět, *co všechno* má být otestované.

3. **Až potom nové funkce**  
   - Nové funkce na stabilizované a zdokumentované základy jsou bezpečnější a předatelnost zůstane udržitelná.

Doporučení: **držet se tohoto pořadí** a v „úklidu“ nejdřív dokončit dokumentaci a lehké strukturní úpravy (viz níže), ne hned velký refaktor ObjectDetail/App.

---

## 3. Konkrétní návrhy: co dělat v „úklidu struktury“ a v dokumentaci

### 3.1 Dokumentace (priorita v rámci úklidu)

Cíl: mít na jednom místě popis, jak aplikace funguje, aby z toho šel odvodit návod nebo obdobná aplikace.

- **Doplnit podle plánu (v `docs/architecture/`):**
  - **`modules.md`** – hlavní moduly (project, schema, classification, import/export, translation, UI), odpovědnosti a závislosti (kdo volá koho, kdo používá schema). Lze vycházet z tabulky v `overview.md` a rozepsat soubory a klíčové exporty.
  - **`data-flows.md`** – načtení/ukládání projektu, načtení schématu podle verze, průchod dat z importu (IDS/Excel) do projektu a do UI, export IDS/Excel; kde se bere IFC verze. Jednoduché kroky nebo diagramy (mermaid).
  - **`sensitive-areas.md`** – místa citlivá na změnu: SchemaProvider a URL, build_schema_index a cesty, export/ids a ifcVersion, ObjectDetail a předávání schema, migrace projektu v App, kde se mění při přidání nové IFC verze.
- **V `docs/` (nebo `docs/translation/`):**
  - **`translation-vs-mapping.md`** – krátce: (a) zobrazení IFC názvů (OFF/AUTO/BSDD), (b) CZ sloupce v požadavcích (uložené v projektu), (c) budoucí vlastní mapování entit. Odkaz na TRANSLATION_DESIGN.md.
- **Terminologie:** na konec `overview.md` nebo samostatný **`glossary.md`** – Projekt, Objekt (kód), Klasifikace, IFC entita, PredefinedType, IDS, fáze, číselník. Jednotná terminologie pro technický popis i pro budoucí návod.
- **Živá dokumentace:** v `README.md` přidat odkaz na `docs/architecture/` a krátké pravidlo: při větší změně modulu nebo datového toku aktualizovat příslušný soubor (modules, data-flows, sensitive-areas).

Tím se naplní to, co plán v sekci D požadoval, a zároveň vznikne základ pro „návod nebo obdobnou aplikaci“.

### 3.2 Úklid struktury (bez velkého refaktoru)

Plán navrhoval vyčlenit logiku z App a rozsekat ObjectDetail. To lze dělat postupně; v první vlně úklidu doporučuji:

- **Migrace projektu:** přesunout `migrateProject` (a související pomocné funkce, které dnes žijí v App) do `src/project/` (např. `migration.ts` nebo rozšířit `storage.ts`) a volat je při loadu ze storage. App pak jen volá „load / migrate / setProject“. Dopad: jedno místo pro migraci, menší App, snazší testování persistence.
- **ObjectDetail:** neřešit hned rozdělení na mnoho souborů. Místo toho v `sensitive-areas.md` (a případně v `modules.md`) popsat, které bloky v ObjectDetail odpovídají za co (např. sekce požadavků, IDS náhled, fáze, číselníky). Až budete chtít refaktorovat, bude jasné, co lze vyčlenit jako první.
- **Odstranit mrtvou závislost:** `idb-keyval` v `package.json` není v `src` používán – odstranit z dependencies, pokud neplánujete brzy IndexedDB.

Velký refaktor ObjectDetail (rozbití na mnoho komponent) nechat až po doplnění dokumentace a po testování, aby bylo zřejmé, které části jsou stabilní.

---

## 4. Testování „že všechny funkce přežily“

- **Checklist hlavních scénářů** (lze založit jako `docs/testing/manual-checklist.md` nebo přímo v `docs/`):
  - Načtení projektu z localStorage (existující projekt IFC4X3).
  - Vytvoření nového projektu (z TSV, z IFC stromu, z Excelu – dle toho, co používáte).
  - Změna IFC verze v Údaje projektu (IFC4 ↔ IFC 4.3), uložení, kontrola že se načetlo správné schema a že odkazy (entity, Pset, property) vedou na správnou dokumentaci.
  - Export IDS (zvolená fáze, filtr výskytu) – kontrola že `ifcVersion` v XML odpovídá verzi projektu.
  - Export Excel – kontrola že metadatový list obsahuje správnou verzi a URL dokumentace.
  - Import IDS / import Excel – že se data správně sloučí a zobrazí.
  - Klasifikace: přidání systému, mapování na IFC entity, výběr entit v kartě objektu.
  - Číselníky, fáze, CZ překlady (pokud používáte) – alespoň jeden zástupný test.

- Odkazy na buildingSMART pro IFC4 (ADD2_TC1, HTML/link/, lowercase) už jsou v konfigu; v checklistu stačí explicitně zkontrolovat pár odkazů po přepnutí na IFC4.

Tím pádem máte ověření, že dosavadní funkce po změnách (2 verze, odkazy, stav v App) stále fungují, a zároveň máte seznam scénářů pro pozdější regrese.

---

## 5. Doporučené pořadí kroků (souhrn)

1. **Dokumentace**  
   - Doplnit `modules.md`, `data-flows.md`, `sensitive-areas.md`, `translation-vs-mapping.md`, glosář (v overview nebo glossary).  
   - V README odkaz na `docs/architecture/` a pravidlo aktualizace docs.

2. **Lehký úklid**  
   - Přesunout migraci projektu do project vrstvy.  
   - (Volitelně) odstranit `idb-keyval` z dependencies.  
   - Nechat velký refaktor ObjectDetail na později.

3. **Testování**  
   - Projít podle checklistu hlavní scénáře (načtení, verze, export IDS/Excel, import, klasifikace).  
   - Opravit případné chyby odhalené testem.

4. **Nové funkce**  
   - Až bude dokumentace a testování hotové, přidávat nové funkce s odkazem na modules/data-flows a s aktualizací docs tam, kde se změní odpovědnosti nebo toky.

Tím se naplní tvoje vize: nejdřív uklidit a popsat (v MD), ověřit že stávající funkce přežily, pak rozvíjet aplikaci o nové funkce, s dokumentací vhodnou i pro návod nebo pro vytvoření obdobné aplikace.
