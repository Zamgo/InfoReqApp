# Excel roundtrip – co chybí pro kvalitní roundtrip

Import Excelu je nastaven na strukturu souboru **Zdroj_příklad.xlsx**. Níže je přehled, co v Excelu chybí nebo co by bylo potřeba doplnit pro plnohodnotný roundtrip (export → úprava v Excelu → import zpět).

## ✅ Co již funguje

- **PROJEKT**: Název, Autor, Popis, IFC_specifikace (nebo IFC schéma), IFC_dokumentace, Model_View_Definition_MVD
- **FÁZE**: Kód, Název, Popis
- **ČÍSELNÍKY**: Název, Hodnoty (oddělené `;`), Poznámka
- **KLASIFIKACE_*** listy: Třídící_kód (nebo Kód), Popis, Úroveň
- **PRVKY**: Třídící_kód, Třídění_úroveň_*, Třídění_&lt;systém&gt;, Třídění_AN_&lt;autorský nástroj&gt;, IFC_entita, IFC_predefinedType, Popis, Poznámka, Příklady
- **POŽADAVKY**: flattened požadavky – Typ_požadavku, Skupina, Parametr_hodnoty, IFC_datový_typ, Omezení, Požadované_hodnoty, Jednotka, Číselník, URI, Popis, Poznámka, Příklady, Výskyt, sloupce fází (Ano/Ne)

**Poznámky**:
- **Primární klasifikace** = vytvoří se z tabulky POŽADAVKY (při dostupnosti dat), jinak z PRVKY. Sloupce: Třídící_kód (volitelně), Třídění_úroveň_1, Třídění_úroveň_2, … Třídění_úroveň_x.
- **Mapované klasifikace** = sloupce Třídění_&lt;název&gt; (bez úrovně) jsou další klasifikační systémy namapované na primární. Prefix **Třídění_AN_** = autorský nástroj (zaškrtne se v mapování).
- **Třídící_kód** – pokud není vyplněn, kód se odvodí z hodnot Třídění_úroveň_* (např. `IfcDoor::NOTDEFINED`).
- **ID** – při importu se vytvářejí nová ID pro aplikaci; do exportu se ID neexportují.

## ❌ Co v Excelu chybí (pro roundtrip)

### 1. ~~**Název atributu**~~ ✅ Vyřešeno

- **Skupina_vlastností**: pouze u typu Vlastnost (název Pset/Qto).
- **Parametr_hodnoty**: identifikátor, na který se vážou Požadované_hodnoty – u Atributu název atributu, u Vlastnosti název vlastnosti, u Součást entita (IfcWall.WALL), u Klasifikace název systému, u Materiálu kategorie.

### 2. ~~**Typ vztahu u Součást**~~ ✅ Vyřešeno

- Typ vztahu (IFCRELAGGREGATES atd.) je v Požadované_hodnoty, entita součásti v Parametr_hodnoty.

### 3. **ID fází**

- **Problém**: Fáze se identifikují podle Kódu/Názvu. Při změně názvu fáze v Excelu se sloupce v POŽADAVKY neshodují.
- **Řešení**: Zachovat konzistenci – sloupce fází v POŽADAVKY musí odpovídat Názvům z listu FÁZE.

### 4. **ID číselníků**

- **Problém**: Číselníky se při importu vytvářejí znovu s novými ID. Odkazy z požadavků (sloupec Číselník) se řeší podle názvu.
- **Řešení**: Při roundtripu je to akceptovatelné – číselníky se spárují podle názvu. Při přejmenování číselníku se vazba ztratí.

### 5. **Vzorec VLOOKUP v Požadované_hodnoty**

- **Problém**: Export u výčtů s číselníkem vkládá VLOOKUP vzorec. Při importu se bere vypočtená hodnota; pokud je buňka prázdná nebo `[object Object]`, import selže nebo dostane prázdnou hodnotu.
- **Řešení**: Import bere `result` vzorce. V Excelu je vhodné mít vyplněné hodnoty (ne jen vzorec) pro spolehlivý roundtrip.

### 6. **Metadata IDS** (ids:info, ids:spec)

- **Problém**: Metadata IDS (title, copyright, version, author, …) se do Excelu neexportují.
- **Řešení**: Rozšířit list PROJEKT o sloupce pro metadata IDS, nebo přidat list METADATA.

### 7. **Identifikátor specifikace** (IDS identifier)

- **Problém**: `IdsSpecMetadata.identifier` pro jednotlivé objekty/fáze se neexportuje.
- **Řešení**: Přidat sloupec do POŽADAVKY nebo PRVKY.

## Struktura sloupců POŽADAVKY

| Sloupec | Atribut | Vlastnost | Součást | Klasifikace | Materiál |
|---------|---------|-----------|---------|-------------|----------|
| Skupina | — | psetName | — | — | — |
| Parametr_hodnoty | attribute | propertyName | entity.PredefinedType | system | category |
| Požadované_hodnoty | hodnota | hodnota | relationType | hodnota | hodnota |

U Klasifikace se identifikace (code) ukládá do Poznámky jako `[Identifikace: …]`.

## Použití importu

1. V menu **Import** zvolte **Excel**
2. Vyberte soubor `.xlsx` ve formátu Zdroj_příklad (listy PROJEKT, FÁZE, ČÍSELNÍKY, PRVKY, POŽADAVKY, KLASIFIKACE_*)
3. Projekt se načte; případná upozornění se zobrazí ve statusu
