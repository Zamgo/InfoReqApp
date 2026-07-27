import ExcelJS from "exceljs";
import type {
  Project,
  Phase,
  CodeList,
  ClassificationSystemEntry,
  AttributeRequirement,
  PropertyRequirement,
  RelationRequirement,
  ClassificationRequirement,
  MaterialRequirement,
} from "../project/types";
import type { ClassificationNode } from "../classification/types";
import { ENUM_CODELIST_ID_KEY } from "../project/enumeration";
import { collectLeaves, getPathToNode, findNodeByCode } from "../classification/parser";
import { getIfcDocumentationBaseUrl, normalizeIfcSchemaVersion } from "../schema/ifcVersionConfig";
import {
  getIdsProjectedFacetId,
  getIdsProjectedFacetSection,
  projectIdsRequirementsForEntity,
} from "../ids/requirementProjection";

const withCanonicalIdsForExcel = (project: Project): Project => {
  if (!(project.idsSpecifications?.length)) return project;
  const objects = Object.fromEntries(Object.entries(project.objects).map(([code, object]) => {
    const projected = projectIdsRequirementsForEntity(
      project,
      object.ifcEntity,
      object.predefinedType.mode === "ENUM" ? object.predefinedType.value : undefined,
    );
    const merge = <T extends { id: string; extensions: Record<string, unknown> }>(
      stored: T[],
      canonical: T[],
    ): T[] => {
      const seen = new Set<string>();
      return [...stored, ...canonical].filter((item) => {
        const facetId = getIdsProjectedFacetId(item);
        const section = getIdsProjectedFacetSection(item);
        const key = facetId ? `${section}:${facetId}` : `project:${item.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    return [code, {
      ...object,
      requirements: {
        attributes: merge(object.requirements.attributes, projected.attributes),
        properties: merge(object.requirements.properties, projected.properties),
        relations: merge(object.requirements.relations, projected.relations),
        classifications: merge(object.requirements.classifications, projected.classifications),
        materials: merge(object.requirements.materials, projected.materials),
      },
    }];
  }));
  return { ...project, objects };
};

/**
 * Konvence pojmenování v exportu:
 * - Prefix "Třídění_" s velkým T, zbytek malé (třídění)
 * - Sloupce: Třídící_kód, Třídění_úroveň_1, Třídění_úroveň_2, Třídění_<systém>, Třídění_AN_<autorský nástroj>
 * - Názvy listů klasifikací: KLASIFIKACE_<název> (např. KLASIFIKACE_ASR, KLASIFIKACE_Kategorie RVT)
 */

/**
 * Style constants for Excel formatting
 */
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 11,
};

const HEADER_ALIGNMENT: Partial<ExcelJS.Alignment> = {
  vertical: "middle",
  horizontal: "center",
  wrapText: true,
};

const CELL_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE2E8F0" } },
  left: { style: "thin", color: { argb: "FFE2E8F0" } },
  bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
  right: { style: "thin", color: { argb: "FFE2E8F0" } },
};

/** Barvy pro sekce hlavičky Zdroj: Identifikační údaje, Další klasifikace, IFC entity, Požadavky */
const HEADER_FILL_IDENTIFIKACNI: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF16A34A" }, // Green-600 – Kód + hierarchie primární klasifikace
};
const HEADER_FILL_DALSI_KLASIFIKACE: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0D9488" }, // Teal-600 – další klasifikační systémy
};
const HEADER_FILL_AUTORSKE_NASTROJE: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF7C3AED" }, // Violet-600 – třídění autorských nástrojů
};
const HEADER_FILL_IFC: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF2563EB" }, // Blue-600
};
const HEADER_FILL_POZADAVKY: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEA580C" }, // Orange-600
};
const HEADER_FILL_PROJEKT: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFDC2626" }, // Red-600
};

/**
 * Apply section-colored header styling to Zdroj sheet row (1-based column indices)
 * @param row Header row
 * @param identifikacniColCount Kód + hierarchie primární klasifikace (zelená)
 * @param dalsiKlasifikaceColCount Další klasifikační systémy (tyrkysová)
 * @param autorskeNastrojeColCount Třídění autorských nástrojů (fialová)
 * @param ifcColCount IFC_entita, IFC_predefinedType (modrá)
 */
const styleZdrojHeaderRow = (
  row: ExcelJS.Row,
  identifikacniColCount: number,
  dalsiKlasifikaceColCount: number,
  autorskeNastrojeColCount: number,
  ifcColCount: number
) => {
  let colIndex = 1;
  row.eachCell((cell) => {
    cell.font = HEADER_FONT;
    cell.alignment = HEADER_ALIGNMENT;
    cell.border = CELL_BORDER;
    if (colIndex <= identifikacniColCount) {
      cell.fill = HEADER_FILL_IDENTIFIKACNI;
    } else if (colIndex <= identifikacniColCount + dalsiKlasifikaceColCount) {
      cell.fill = HEADER_FILL_DALSI_KLASIFIKACE;
    } else if (colIndex <= identifikacniColCount + dalsiKlasifikaceColCount + autorskeNastrojeColCount) {
      cell.fill = HEADER_FILL_AUTORSKE_NASTROJE;
    } else if (colIndex <= identifikacniColCount + dalsiKlasifikaceColCount + autorskeNastrojeColCount + ifcColCount) {
      cell.fill = HEADER_FILL_IFC;
    } else {
      cell.fill = HEADER_FILL_POZADAVKY;
    }
    colIndex++;
  });
  row.height = 28;
};

/**
 * Apply data cell styling
 */
const styleDataRow = (row: ExcelJS.Row, isAlternate: boolean = false) => {
  row.eachCell((cell) => {
    cell.border = CELL_BORDER;
    cell.alignment = { vertical: "top", wrapText: true };
    if (isAlternate) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF8FAFC" }, // Slate-50
      };
    }
  });
};

/**
 * Convert 1-based column index to Excel column letter (1=A, 27=AA, ...)
 */
const getColumnLetter = (col: number): string => {
  let letter = "";
  let c = col;
  while (c > 0) {
    const mod = (c - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    c = Math.floor((c - 1) / 26);
  }
  return letter;
};

/**
 * Set column widths and freeze header row
 */
const finalizeSheet = (sheet: ExcelJS.Worksheet, widths: number[]) => {
  widths.forEach((width, index) => {
    const col = sheet.getColumn(index + 1);
    col.width = width;
  });
  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];
};

type GuideBlock =
  | { type: "title"; text: string }
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "example"; lines: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

const GUIDE_BLOCKS: GuideBlock[] = [
  { type: "title", text: "Uživatelský návod k Excel exportu informačních požadavků" },
  {
    type: "paragraph",
    text: "Tento Excel představuje přehled alfanumerických požadavků na informace v rámci projektu v tabulkové podobě. Je určen pro předání požadavků na informace, které mají být dodány v digitálním modelu stavby (DiMS) podle standardu IFC.",
  },
  { type: "paragraph", text: "Hlavním účelem souboru je srozumitelně popsat:" },
  {
    type: "bullets",
    items: [
      "na jaké prvky modelu se požadavky vztahují,",
      "jaké informace mají tyto prvky obsahovat,",
      "jak mají být hodnoty vyplněny nebo omezeny,",
      "ve kterých projektových fázích požadavky platí.",
    ],
  },
  {
    type: "paragraph",
    text: "Excel je pracovní a uživatelsky čitelná forma datového standardu. Navazuje na principy IDS, ale prezentuje je ve formě tabulek, se kterými lze běžně pracovat v Excelu.",
  },
  { type: "heading", text: "Vazba na IDS a IFC" },
  {
    type: "paragraph",
    text: "Struktura požadavků vychází z IDS, tedy Information Delivery Specification. IDS je standard buildingSMART pro definování informačních požadavků ve strojově čitelné podobě. Umožňuje popsat, jaké objekty mají být v IFC modelu obsaženy a jaké informace k nim mají být dodány.",
  },
  { type: "paragraph", text: "V praxi IDS odpovídá na otázky:" },
  {
    type: "bullets",
    items: [
      "pro jaký typ prvku požadavek platí,",
      "jakou vlastnost, atribut, materiál, klasifikaci nebo vazbu má prvek obsahovat,",
      "jaká hodnota je očekávaná,",
      "zda je informace povinná, volitelná, nebo naopak zakázaná.",
    ],
  },
  {
    type: "paragraph",
    text: "Tento Excel používá stejnou logiku, ale převádí ji do přehledné tabulkové podoby. Slouží tedy jako čitelný podklad nad informačními požadavky, které mohou být následně využity i pro tvorbu nebo kontrolu IDS.",
  },
  { type: "paragraph", text: "Oficiální zdroje k IDS:" },
  {
    type: "bullets",
    items: [
      "buildingSMART IDS: https://www.buildingsmart.org/standards/bsi-standards/information-delivery-specification-ids/",
      "GitHub repozitář standardu IDS: https://github.com/buildingSMART/IDS",
    ],
  },
  { type: "heading", text: "Základní princip čtení" },
  {
    type: "paragraph",
    text: "Nejdůležitějším listem je POŽADAVKY. Každý řádek tohoto listu představuje jeden konkrétní informační požadavek pro určitý typ prvku.",
  },
  { type: "paragraph", text: "Řádek je vhodné číst jako větu:" },
  {
    type: "example",
    lines: [
      "Pro daný prvek požadujeme danou informaci, v určité podobě, s daným pravidlem a v určených fázích projektu.",
    ],
  },
  {
    type: "paragraph",
    text: "První část řádku identifikuje prvek nebo skupinu prvků. Další část popisuje požadovanou informaci. Poslední část určuje platnost požadavku v projektových fázích.",
  },
  { type: "paragraph", text: "Příklad čtení řádku:" },
  {
    type: "example",
    lines: [
      "Pro dveře je požadována vlastnost FireRating ve skupině Pset_DoorCommon.",
      "Hodnota musí být vybrána z povoleného seznamu.",
      "Požadavek platí ve fázích označených hodnotou Ano.",
    ],
  },
  { type: "heading", text: "Proč se rozlišují typy požadavků" },
  {
    type: "paragraph",
    text: "IFC standard neukládá všechny informace jedním způsobem. Některé informace jsou základní součástí IFC entity jako atributy, jiné jsou uloženy jako vlastnosti ve specifických skupinách vlastností, další vyjadřují materiál, klasifikaci nebo vztah mezi prvky.",
  },
  {
    type: "paragraph",
    text: "Proto list POŽADAVKY rozlišuje sloupec Typ_požadavku. Tento sloupec určuje, jaký druh informace má být v modelu kontrolován a kde se taková informace v IFC logice obvykle nachází.",
  },
  {
    type: "paragraph",
    text: "Rozlišení typů požadavků je důležité pro správnou interpretaci dat. Stejná textová hodnota může mít jiný význam podle toho, zda jde o vlastnost, atribut, klasifikaci nebo materiálový požadavek.",
  },
  { type: "heading", text: "Typ požadavku Atribut" },
  {
    type: "paragraph",
    text: "Atribut označuje informaci, která je přímo součástí IFC entity. Nejde o běžnou uživatelskou vlastnost v property setu, ale o údaj patřící k základní IFC struktuře objektu.",
  },
  {
    type: "paragraph",
    text: "Typickým příkladem mohou být základní identifikační nebo systémové údaje IFC entity.",
  },
  {
    type: "paragraph",
    text: "U tohoto typu je důležitý zejména sloupec Parametr_hodnoty, který uvádí název požadovaného atributu. Sloupec Požadované_hodnoty následně říká, jaká hodnota se očekává, případně jaké hodnoty jsou povolené.",
  },
  { type: "heading", text: "Typ požadavku Vlastnost" },
  {
    type: "paragraph",
    text: "Vlastnost je nejčastější typ informačního požadavku. Popisuje údaj uložený v property setu (skupině vlastností), quantity setu (skupině výměr) nebo v uživatelsky definované skupině vlastností.",
  },
  {
    type: "paragraph",
    text: "V IFC jsou vlastnosti obvykle sdruženy do skupin. Například dveře mohou mít vlastnosti ve skupině Pset_DoorCommon, stěny ve skupině Pset_WallCommon a projekt může používat i vlastní skupiny vlastností.",
  },
  { type: "paragraph", text: "U typu Vlastnost mají hlavní sloupce tento význam:" },
  {
    type: "table",
    headers: ["Sloupec", "Význam"],
    rows: [
      ["Skupina", "Název property setu, quantity setu nebo vlastní skupiny."],
      ["Parametr_hodnoty", "Název požadované vlastnosti."],
      ["IFC_datový_typ", "Očekávaný datový typ hodnoty, pokud je definovaný."],
      ["Omezení", "Pravidlo, podle kterého se hodnota posuzuje."],
      ["Požadované_hodnoty", "Konkrétní hodnota, seznam hodnot, rozsah nebo jiné pravidlo."],
    ],
  },
  {
    type: "example",
    lines: [
      "Typ_požadavku: Vlastnost",
      "Skupina: Pset_DoorCommon",
      "Parametr_hodnoty: FireRating",
      "Omezení: Výčet",
      "Požadované_hodnoty: EI30;EI45;EI60",
    ],
  },
  {
    type: "paragraph",
    text: "Takový řádek znamená, že pro daný prvek je požadována vlastnost FireRating ve skupině Pset_DoorCommon a její hodnota má být jedna z uvedených možností.",
  },
  { type: "heading", text: "Typ požadavku Součást" },
  {
    type: "paragraph",
    text: "Součást popisuje vazbu mezi objekty. Tento typ požadavku neříká, jakou textovou nebo číselnou hodnotu má prvek obsahovat, ale jak má být zařazen nebo propojen s jiným objektem v modelu.",
  },
  {
    type: "paragraph",
    text: "V logice IDS odpovídá tento požadavek vztahům typu partOf. V IFC jsou takové vazby reprezentovány relacemi, například při zařazení prvku do prostorové struktury.",
  },
  { type: "paragraph", text: "U typu Součást mají hlavní sloupce tento význam:" },
  {
    type: "table",
    headers: ["Sloupec", "Význam"],
    rows: [
      ["Parametr_hodnoty", "Entita souvisejícího objektu."],
      ["Požadované_hodnoty", "Typ IFC vztahu, který má vazbu vyjadřovat."],
    ],
  },
  {
    type: "example",
    lines: [
      "Typ_požadavku: Součást",
      "Parametr_hodnoty: IfcBuildingStorey",
      "Požadované_hodnoty: IFCRELCONTAINEDINSPATIALSTRUCTURE",
    ],
  },
  {
    type: "paragraph",
    text: "Takový požadavek říká, že prvek má být vztažen k podlaží prostřednictvím odpovídající IFC relace.",
  },
  { type: "heading", text: "Typ požadavku Klasifikace" },
  {
    type: "paragraph",
    text: "Klasifikace vyjadřuje požadavek na zatřídění prvku podle klasifikačního systému. Může jít o národní, oborový, projektový nebo firemní klasifikační systém.",
  },
  {
    type: "paragraph",
    text: "Klasifikace pomáhá sjednotit názvosloví, usnadňuje vyhledávání prvků a umožňuje jejich seskupování podle třídicích kódů.",
  },
  { type: "paragraph", text: "U typu Klasifikace mají hlavní sloupce tento význam:" },
  {
    type: "table",
    headers: ["Sloupec", "Význam"],
    rows: [
      ["Parametr_hodnoty", "Název klasifikačního systému."],
      ["Požadované_hodnoty", "Požadovaný klasifikační kód nebo hodnota."],
    ],
  },
  {
    type: "paragraph",
    text: "IFC entita a IFC_predefinedType nejsou v tomto Excelu uváděny jako běžný klasifikační požadavek. Jsou vedeny v samostatných sloupcích, protože určují základní IFC typ prvku.",
  },
  { type: "heading", text: "Typ požadavku Materiál" },
  {
    type: "paragraph",
    text: "Materiál popisuje požadavek na materiálovou informaci prvku. Používá se tam, kde je potřeba určit materiál, materiálovou kategorii nebo pravidlo pro materiálovou skladbu.",
  },
  { type: "paragraph", text: "U typu Materiál mají hlavní sloupce tento význam:" },
  {
    type: "table",
    headers: ["Sloupec", "Význam"],
    rows: [
      ["Parametr_hodnoty", "Kategorie nebo druh materiálové informace."],
      ["Požadované_hodnoty", "Požadovaná hodnota, seznam hodnot nebo jiné omezení."],
    ],
  },
  {
    type: "paragraph",
    text: "Materiálové požadavky jsou samostatným typem proto, že materiál je v IFC zpravidla reprezentován jinou strukturou než běžné vlastnosti v property setech.",
  },
  { type: "heading", text: "Identifikace prvku" },
  {
    type: "paragraph",
    text: "Úvodní sloupce listu POŽADAVKY určují, na jaký prvek nebo typ prvku se požadavek vztahuje.",
  },
  {
    type: "table",
    headers: ["Sloupec", "Význam"],
    rows: [
      ["Třídící_kód", "Kód prvku nebo třídy prvků v primární klasifikaci."],
      ["Třídění_úroveň_1, Třídění_úroveň_2, ...", "Hierarchické zařazení prvku."],
      ["Třídění_<systém>", "Mapování prvku na další klasifikační systém."],
      ["Třídění_AN_<nástroj>", "Mapování na autorský nástroj, například kategorii v modelovacím softwaru."],
      ["IFC_entita", "IFC entita, kterou má prvek v modelu reprezentovat."],
      ["IFC_predefinedType", "Upřesnění IFC entity pomocí predefined type."],
    ],
  },
  {
    type: "paragraph",
    text: "Tyto sloupce odpovídají otázce, čeho se požadavek týká. Sloupce za nimi následně popisují, jaká informace je pro tento prvek požadována.",
  },
  { type: "heading", text: "Sloupec Omezení" },
  {
    type: "paragraph",
    text: "Sloupec Omezení určuje pravidlo, podle kterého se má hodnota posuzovat.",
  },
  {
    type: "table",
    headers: ["Hodnota", "Význam"],
    rows: [
      ["Jednoduchá hodnota", "Hodnota má být vyplněná nebo má odpovídat jedné konkrétní hodnotě."],
      ["Výčet", "Hodnota má být vybrána ze seznamu povolených hodnot."],
      ["Vzor", "Hodnota má odpovídat předepsanému textovému vzoru."],
      ["Ohraničení", "Hodnota má být v určeném rozsahu."],
      ["Délka", "Hodnota má splnit pravidlo pro délku textu nebo hodnoty."],
    ],
  },
  {
    type: "paragraph",
    text: "Pokud je vyplněn sloupec Číselník, povolené hodnoty jsou spravovány na listu ČÍSELNÍKY. Číselníky pomáhají sjednotit zápis hodnot a omezit rozdíly způsobené volným textem.",
  },
  { type: "heading", text: "Sloupec Výskyt" },
  { type: "paragraph", text: "Sloupec Výskyt určuje závaznost požadavku." },
  {
    type: "table",
    headers: ["Hodnota", "Význam"],
    rows: [
      ["Povinný", "Informace má být v modelu uvedena."],
      ["Volitelný", "Informace může být uvedena, ale není povinná."],
      ["Zakázaný", "Informace se pro daný prvek nemá uvádět."],
    ],
  },
  {
    type: "paragraph",
    text: "Hodnota Zakázaný se používá v případech, kdy je potřeba výslovně zabránit použití určité vlastnosti, hodnoty nebo vazby.",
  },
  { type: "heading", text: "Projektové fáze" },
  {
    type: "paragraph",
    text: "Na konci listu POŽADAVKY jsou uvedeny sloupce projektových fází. Každá fáze má vlastní sloupec.",
  },
  {
    type: "table",
    headers: ["Hodnota", "Význam"],
    rows: [
      ["Ano", "Požadavek platí v dané fázi."],
      ["Ne", "Požadavek má určené fáze, ale v této fázi neplatí."],
      ["prázdná buňka", "U požadavku není fáze určena."],
    ],
  },
  {
    type: "paragraph",
    text: "Fáze umožňují rozlišit, kdy má být informace dodána. Některé požadavky mohou být relevantní již v raných stupních projektu, jiné až pro dokumentaci, realizaci, předání nebo provoz.",
  },
  { type: "heading", text: "Přehled listů v souboru" },
  {
    type: "paragraph",
    text: "Excel může obsahovat několik listů. Jejich dostupnost závisí na zvoleném rozsahu exportu.",
  },
  {
    type: "table",
    headers: ["List", "Účel"],
    rows: [
      ["PROJEKT", "Základní informace o projektu, IFC verzi a dokumentaci."],
      ["FÁZE", "Přehled projektových fází použitých v požadavcích."],
      ["POŽADAVKY", "Hlavní tabulka informačních požadavků."],
      ["ČÍSELNÍKY", "Seznamy povolených hodnot pro výčtové požadavky."],
      ["PRVKY", "Přehled prvků, jejich zatřídění, IFC entit a mapování."],
      ["KLASIFIKACE_*", "Přehled klasifikačních systémů použitých v projektu."],
    ],
  },
  { type: "heading", text: "List PROJEKT" },
  {
    type: "paragraph",
    text: "List PROJEKT obsahuje kontext exportu. Uvádí zejména název projektu, autora, popis, použitou IFC specifikaci, odkaz na IFC dokumentaci a Model View Definition.",
  },
  {
    type: "paragraph",
    text: "Tento list slouží k ověření, že požadavky jsou posuzovány vůči správnému projektu a správné verzi IFC.",
  },
  { type: "heading", text: "List FÁZE" },
  {
    type: "paragraph",
    text: "List FÁZE definuje projektové fáze, které se následně používají v listu POŽADAVKY.",
  },
  {
    type: "paragraph",
    text: "Názvy fází v tomto listu odpovídají názvům fázových sloupců v listu POŽADAVKY. Díky tomu je možné zjistit, v jakém období nebo stupni dokumentace je daný požadavek relevantní.",
  },
  { type: "heading", text: "List ČÍSELNÍKY" },
  {
    type: "paragraph",
    text: "List ČÍSELNÍKY obsahuje řízené seznamy povolených hodnot. Používá se zejména pro požadavky typu Výčet.",
  },
  {
    type: "example",
    lines: ["Název číselníku: Požární odolnost", "Hodnoty: EI15;EI30;EI45;EI60;EI90"],
  },
  {
    type: "paragraph",
    text: "Pokud je v listu POŽADAVKY uveden číselník, hodnota požadavku má vycházet z příslušného seznamu. Cílem je zajistit jednotný zápis hodnot napříč projektem.",
  },
  { type: "heading", text: "List PRVKY" },
  {
    type: "paragraph",
    text: "List PRVKY poskytuje přehled prvků z primární klasifikace. Uvádí jejich hierarchické zařazení, IFC entitu, IFC predefined type a případně mapování na další klasifikační systémy nebo autorské nástroje.",
  },
  {
    type: "paragraph",
    text: "Tento list neslouží jako seznam jednotlivých požadavků. Slouží jako kontext a kontrolní přehled prvků, ke kterým se požadavky vztahují.",
  },
  { type: "heading", text: "Listy KLASIFIKACE_*" },
  {
    type: "paragraph",
    text: "Listy s názvem začínajícím KLASIFIKACE_ obsahují přehled klasifikačních systémů použitých v projektu.",
  },
  { type: "paragraph", text: "Obvykle obsahují:" },
  { type: "bullets", items: ["třídicí kód,", "popis,", "úroveň ve stromu klasifikace."] },
  {
    type: "paragraph",
    text: "Tyto listy slouží jako slovník klasifikačních kódů a popisů. Pomáhají porozumět hodnotám použitým v listech POŽADAVKY a PRVKY.",
  },
  { type: "heading", text: "Shrnutí" },
  {
    type: "paragraph",
    text: "Excel je profesionální pracovní přehled informačních požadavků založený na logice IDS. Každý řádek v listu POŽADAVKY určuje:",
  },
  {
    type: "bullets",
    items: [
      "na jaký prvek se požadavek vztahuje,",
      "jaký typ informace je požadován,",
      "jaké pravidlo nebo hodnota se má uplatnit,",
      "zda je požadavek povinný, volitelný nebo zakázaný,",
      "ve kterých projektových fázích požadavek platí.",
    ],
  },
  {
    type: "paragraph",
    text: "Při čtení tabulky je vhodné postupovat od identifikace prvku přes typ požadavku až po hodnotu, omezení a fázi. Tím lze každý řádek interpretovat jako konkrétní pravidlo pro dodání informací v rámci IFC modelu.",
  },
];

const GUIDE_TITLE_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF334155" },
};

const GUIDE_HEADING_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF1F5F9" },
};

const GUIDE_TABLE_HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE2E8F0" },
};

const GUIDE_EXAMPLE_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF8FAFC" },
};

const estimateGuideRowHeight = (text: string): number => {
  const lineCount = Math.max(1, Math.ceil(text.length / 115));
  return Math.min(96, lineCount * 18);
};

const styleMergedGuideRow = (
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  text: string,
  options: {
    font?: Partial<ExcelJS.Font>;
    fill?: ExcelJS.Fill;
    alignment?: Partial<ExcelJS.Alignment>;
    height?: number;
  } = {}
) => {
  sheet.mergeCells(rowNumber, 1, rowNumber, 6);
  const row = sheet.getRow(rowNumber);
  const cell = row.getCell(1);
  cell.value = text;
  cell.font = options.font ?? { size: 10, color: { argb: "FF0F172A" } };
  cell.alignment = options.alignment ?? { vertical: "top", wrapText: true, indent: 1 };
  cell.border = CELL_BORDER;
  if (options.fill) cell.fill = options.fill;
  row.height = options.height ?? estimateGuideRowHeight(text);
};

const createGuideSheet = (workbook: ExcelJS.Workbook) => {
  const sheet = workbook.addWorksheet("NÁVOD");
  sheet.properties.defaultRowHeight = 18;

  let rowNumber = 1;
  const addSpacer = () => {
    sheet.addRow([]);
    sheet.getRow(rowNumber).height = 8;
    rowNumber++;
  };

  GUIDE_BLOCKS.forEach((block) => {
    if (block.type === "title") {
      styleMergedGuideRow(sheet, rowNumber, block.text, {
        font: { bold: true, size: 16, color: { argb: "FFFFFFFF" } },
        fill: GUIDE_TITLE_FILL,
        alignment: { vertical: "middle", horizontal: "left", wrapText: true },
        height: 34,
      });
      rowNumber++;
      addSpacer();
      return;
    }

    if (block.type === "heading") {
      if (rowNumber > 3) {
        addSpacer();
      }
      styleMergedGuideRow(sheet, rowNumber, block.text, {
        font: { bold: true, size: 12, color: { argb: "FF334155" } },
        fill: GUIDE_HEADING_FILL,
        alignment: { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 },
        height: 26,
      });
      rowNumber++;
      return;
    }

    if (block.type === "paragraph") {
      styleMergedGuideRow(sheet, rowNumber, block.text);
      rowNumber++;
      return;
    }

    if (block.type === "bullets") {
      block.items.forEach((item) => {
        styleMergedGuideRow(sheet, rowNumber, `• ${item}`, {
          alignment: { vertical: "top", wrapText: true, indent: 2 },
        });
        rowNumber++;
      });
      return;
    }

    if (block.type === "example") {
      block.lines.forEach((line) => {
        styleMergedGuideRow(sheet, rowNumber, line, {
          font: { italic: true, size: 10, color: { argb: "FF334155" } },
          fill: GUIDE_EXAMPLE_FILL,
          alignment: { vertical: "top", wrapText: true, indent: 1 },
        });
        rowNumber++;
      });
      return;
    }

    if (block.type === "table") {
      const headerRow = sheet.getRow(rowNumber);
      block.headers.forEach((header, index) => {
        const cell = headerRow.getCell(index + 1);
        cell.value = header;
        cell.font = { bold: true, color: { argb: "FF334155" }, size: 10 };
        cell.alignment = HEADER_ALIGNMENT;
        cell.fill = GUIDE_TABLE_HEADER_FILL;
        cell.border = CELL_BORDER;
      });
      headerRow.height = 24;
      rowNumber++;

      block.rows.forEach((cells, index) => {
        const row = sheet.getRow(rowNumber);
        cells.forEach((value, cellIndex) => {
          const cell = row.getCell(cellIndex + 1);
          cell.value = value;
          cell.font = { size: 10, color: { argb: "FF0F172A" } };
          cell.alignment = { vertical: "top", wrapText: true };
          cell.border = CELL_BORDER;
          if (index % 2 === 1) {
            cell.fill = GUIDE_EXAMPLE_FILL;
          }
        });
        row.height = Math.max(22, estimateGuideRowHeight(cells.join(" ")));
        rowNumber++;
      });
      addSpacer();
    }
  });

  finalizeSheet(sheet, [26, 82, 18, 18, 18, 18]);
  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];
};

/**
 * Create Sheet 1: PROJEKT (metadata)
 * Bez ID a časů: Název, Autor, Popis, IFC_specifikace, IFC_dokumentace, Model_View_Definition_MVD. Červená hlavička.
 */
const createProjectSheet = (workbook: ExcelJS.Workbook, project: Project) => {
  const sheet = workbook.addWorksheet("PROJEKT");

  const headers = [
    "Název",
    "Autor",
    "Popis",
    "IFC_specifikace",
    "IFC_dokumentace",
    "Model_View_Definition_MVD",
  ];
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL_PROJEKT;
    cell.font = HEADER_FONT;
    cell.alignment = HEADER_ALIGNMENT;
    cell.border = CELL_BORDER;
  });
  headerRow.height = 28;

  const ifcSchema = project.ifcSchemaVersionDisplay || project.ifcSchemaVersion || "";
  const dataRow = sheet.addRow([
    project.name,
    project.author || "",
    project.description || "",
    ifcSchema,
    project.ifcDocumentationUrl || getIfcDocumentationBaseUrl(normalizeIfcSchemaVersion(project.ifcSchemaVersion)),
    project.modelDefinitionViewMvd || "Reference View",
  ]);
  styleDataRow(dataRow);

  finalizeSheet(sheet, [30, 20, 40, 25, 50, 25]);
};

/**
 * Create Sheet 2: FÁZE (Phases)
 * Bez ID, hlavičky v češtině, oranžová barva.
 */
const createPhasesSheet = (workbook: ExcelJS.Workbook, phases: Phase[]) => {
  const sheet = workbook.addWorksheet("FÁZE");

  const headers = ["Kód", "Název", "Popis"];
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL_POZADAVKY;
    cell.font = HEADER_FONT;
    cell.alignment = HEADER_ALIGNMENT;
    cell.border = CELL_BORDER;
  });
  headerRow.height = 28;

  phases.forEach((phase, index) => {
    const row = sheet.addRow([
      phase.code,
      phase.name,
      phase.description || "",
    ]);
    styleDataRow(row, index % 2 === 1);
  });

  finalizeSheet(sheet, [10, 30, 50]);
};

/**
 * Create Sheet 3: ČÍSELNÍKY (Code Lists)
 * Bez sloupce id, hlavičky v češtině, oranžová barva jako v požadavcích.
 */
const createCodeListsSheet = (workbook: ExcelJS.Workbook, codeLists: CodeList[]) => {
  const sheet = workbook.addWorksheet("ČÍSELNÍKY");

  const headers = ["Název", "Hodnoty", "Poznámka"];
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL_POZADAVKY;
    cell.font = HEADER_FONT;
    cell.alignment = HEADER_ALIGNMENT;
    cell.border = CELL_BORDER;
  });
  headerRow.height = 28;

  codeLists.forEach((codeList, index) => {
    const row = sheet.addRow([
      codeList.name,
      (codeList.values || []).join(";"),
      codeList.note || "",
    ]);
    styleDataRow(row, index % 2 === 1);
  });

  finalizeSheet(sheet, [25, 60, 40]);
};

/**
 * Flatten classification tree to simple rows (Kód, Popis, Úroveň)
 */
const flattenToCodePopisUroven = (nodes: ClassificationNode[]): Array<{ code: string; description: string; level: number }> => {
  const rows: Array<{ code: string; description: string; level: number }> = [];
  nodes.forEach((node) => {
    rows.push({
      code: node.code || "",
      description: node.description || "",
      level: node.level,
    });
    if (node.children && node.children.length > 0) {
      rows.push(...flattenToCodePopisUroven(node.children));
    }
  });
  return rows;
};

/** Sanitize sheet name for Excel (max 31 chars, no \ / * ? : [ ]) */
const sanitizeSheetName = (name: string): string => {
  const sanitized = name.replace(/[\\/*?:\[\]]/g, "_").trim();
  return sanitized.slice(0, 31) || "Klasifikace";
};

/** Prefix pro názvy listů klasifikací. */
const KLASIFIKACE_LIST_PREFIX = "KLASIFIKACE_";

/**
 * Create one sheet per classification system: Kód, Popis, Úroveň.
 * IFC systém se neexportuje (mapování je v PRVKY).
 * Názvy listů: KLASIFIKACE_ + název klasifikace.
 */
const createClassificationSheets = (workbook: ExcelJS.Workbook, entries: ClassificationSystemEntry[]) => {
  const usedNames = new Set<string>();
  const entriesToExport = entries.filter((e) => !e.isIfcSystem && e.nodes && e.nodes.length > 0);

  entriesToExport.forEach((entry) => {
    const baseName = entry.name || entry.sourceName || entry.id;
    let sheetName = sanitizeSheetName(KLASIFIKACE_LIST_PREFIX + baseName);
    let suffix = 0;
    while (usedNames.has(sheetName)) {
      suffix++;
      const base = sheetName.slice(0, 28);
      sheetName = `${base}_${suffix}`.slice(0, 31);
    }
    usedNames.add(sheetName);

    const sheet = workbook.addWorksheet(sheetName);
    const headers = ["Třídící_kód", "Popis", "Úroveň"];
    const headerRow = sheet.addRow(headers);
    const headerFill =
      (entry.systemKind ?? "classification") === "authoring"
        ? HEADER_FILL_AUTORSKE_NASTROJE
        : HEADER_FILL_IDENTIFIKACNI;
    headerRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = HEADER_FONT;
      cell.alignment = HEADER_ALIGNMENT;
      cell.border = CELL_BORDER;
    });
    headerRow.height = 28;

    const rows = flattenToCodePopisUroven(entry.nodes ?? []);
    rows.forEach((r, index) => {
      const row = sheet.addRow([r.code, r.description, r.level]);
      styleDataRow(row, index % 2 === 1);
    });

    finalizeSheet(sheet, [20, 40, 10]);
  });
};

/**
 * Create PRVKY sheet: primární klasifikace s IFC_entita, IFC_predefinedType, mapovanými systémy a popisem objektu.
 * IFC data a metadata objektu (popis, poznámka, příklady) se berou z project.objects.
 */
const createMapovaniSheet = (
  workbook: ExcelJS.Workbook,
  project: Project,
  entries: ClassificationSystemEntry[],
  exportAutorskeNastroje: boolean = false,
  exportCzTranslations: boolean = false
) => {
  const primaryEntry = entries.find((e) => e.isPrimary);
  if (!primaryEntry?.nodes?.length) return;
  const primaryNodes = primaryEntry.nodes;

  const sheet = workbook.addWorksheet("PRVKY");

  // Stejné filtrování a pořadí jako ve POŽADAVKY: další klasifikace (teal) vs autorské nástroje (violet)
  const additionalEntries = (primaryEntry.mappedSystemIds ?? [])
    .map((id) => entries.find((e) => e.id === id))
    .filter((e): e is ClassificationSystemEntry => {
      if (!e) return false;
      if (e.isIfcSystem) return false;
      const kind = e.systemKind ?? "classification";
      return kind === "classification";
    });
  const authoringEntries = exportAutorskeNastroje && (primaryEntry.authoringToolSystemIds ?? []).length
    ? (primaryEntry.authoringToolSystemIds ?? [])
        .map((id) => entries.find((e) => e.id === id))
        .filter((e): e is ClassificationSystemEntry => !!e)
    : [];

  const flattenWithMapping = (
    nodes: ClassificationNode[],
    parentPath: ClassificationNode[] = []
  ): Array<{ node: ClassificationNode; path: ClassificationNode[] }> => {
    const result: Array<{ node: ClassificationNode; path: ClassificationNode[] }> = [];
    nodes.forEach((node) => {
      const path = [...parentPath, node];
      result.push({ node, path });
      if (node.children?.length) {
        result.push(...flattenWithMapping(node.children, path));
      }
    });
    return result;
  };

  const flatAll = flattenWithMapping(primaryNodes);
  const flat = flatAll.filter(({ node }) => !node.children?.length);
  const maxDepth = Math.max(1, ...flat.map(({ path }) => path.length));
  const hierarchyPopisHeaders = Array.from(
    { length: Math.min(maxDepth, 5) },
    (_, i) => `Třídění_úroveň_${i + 1}`
  );

  const headers = [
    "Třídící_kód",
    ...hierarchyPopisHeaders,
    ...additionalEntries.map((e) => `Třídění_${e.name}`),
    ...authoringEntries.map((e) => `Třídění_AN_${e.name}`),
    "IFC_entita",
    ...(exportCzTranslations ? ["IFC_entita_CZ"] : []),
    "IFC_predefinedType",
    ...(exportCzTranslations ? ["IFC_predefinedType_CZ"] : []),
    "Popis",
    "Poznámka",
    "Příklady",
  ];
  const headerRow = sheet.addRow(headers);
  const identifikacniColCount = 1 + hierarchyPopisHeaders.length;
  const dalsiKlasifikaceColCount = additionalEntries.length;
  const autorskeNastrojeColCount = authoringEntries.length;
  const ifcColCount = exportCzTranslations ? 4 : 2;
  styleZdrojHeaderRow(headerRow, identifikacniColCount, dalsiKlasifikaceColCount, autorskeNastrojeColCount, ifcColCount);

  flat.forEach(({ node, path }, index) => {
    const obj = project.objects[node.code ?? ""];
    const ifcEntity = obj?.ifcEntity ?? node.ifcEntity ?? "";
    const predefinedType =
      obj?.predefinedType?.mode === "ENUM"
        ? (obj.predefinedType.value || "NOTDEFINED")
        : (node.predefinedType || (node.code?.includes("::") ? "NOTDEFINED" : ""));
    const hierarchyValues = hierarchyPopisHeaders.map((_, i) =>
      normalizeNotDefined(path[i]?.description ?? "")
    );
    const additionalVals = additionalEntries.map((e) => node.mappedValues?.[e.id] ?? "");
    const authoringVals = authoringEntries.map((e) => node.mappedValues?.[e.id] ?? "");
    const tridiciKodPrvky = node.code?.includes("::") ? "" : (node.code ?? "");
    const row = sheet.addRow([
      tridiciKodPrvky,
      ...hierarchyValues,
      ...additionalVals,
      ...authoringVals,
      ifcEntity,
      ...(exportCzTranslations ? [obj?.ifcEntityCz ?? ""] : []),
      predefinedType,
      ...(exportCzTranslations ? [obj?.predefinedTypeCz ?? ""] : []),
      obj?.popis ?? "",
      obj?.poznamka ?? "",
      obj?.priklady ?? "",
    ]);
    styleDataRow(row, index % 2 === 1);
  });

  const hierarchyWidths = hierarchyPopisHeaders.map(() => 30);
  const widths = [
    20,
    ...hierarchyWidths,
    ...additionalEntries.map(() => 22),
    ...authoringEntries.map(() => 22),
    22,
    ...(exportCzTranslations ? [22] : []),
    22,
    ...(exportCzTranslations ? [22] : []),
    30,
    30,
    30,
  ];
  finalizeSheet(sheet, widths);
};

/** Normalizace pro export: "Není definováno" → "NOTDEFINED" (jednotné označení) */
const normalizeNotDefined = (val: string): string => {
  const s = val?.trim() ?? "";
  return s.toLowerCase() === "není definováno" ? "NOTDEFINED" : s;
};

/**
 * Get codeListId from extensions
 */
const getCodeListId = (extensions?: Record<string, unknown>): string => {
  if (!extensions) return "";
  return (extensions[ENUM_CODELIST_ID_KEY] as string) || "";
};

/**
 * Exclude IFC classification – IFC třídění je už v entitě a predefined type, neexportovat
 */
const excludeIfcClassifications = (
  items: ClassificationRequirement[],
  classificationSystemEntries: ClassificationSystemEntry[]
): ClassificationRequirement[] => {
  return items.filter((cls) => {
    if (!cls.systemEntryId) return true;
    const entry = classificationSystemEntries.find((e) => e.id === cls.systemEntryId);
    return !entry?.isIfcSystem;
  });
};

/**
 * Check if requirement applies to given phase
 */
const hasPhase = (phases?: string[], phaseId?: string): string => {
  if (!phaseId || !phases || phases.length === 0) return "";
  return phases.includes(phaseId) ? "Ano" : "Ne";
};

/**
 * Get code list name by ID
 */
const getCodeListName = (codeListId: string, codeLists: CodeList[]): string => {
  const list = codeLists.find((c) => c.id === codeListId);
  return list?.name || codeListId || "";
};

/**
 * Create Sheet: POŽADAVKY (hlavní tabulka pro kontingenční tabulku a import)
 * Jeden řádek = jeden požadavek. Čitelné názvy sloupců.
 *
 * Skupina: pouze u typu Vlastnost (název Pset/Qto), v budoucnu i skupina materiálů.
 * Parametr_hodnoty: identifikátor, na který se vážou Požadované_hodnoty:
 *   - Atribut: název IFC atributu
 *   - Vlastnost: název vlastnosti
 *   - Součást: entita součásti (IfcWall.WALL)
 *   - Klasifikace: název klasifikačního systému
 *   - Materiál: kategorie materiálu
 * (Alternativní názvy sloupce: Specifikátor, Předmět_požadavku, Identifikátor)
 */
const createZdrojSheet = (
  workbook: ExcelJS.Workbook,
  project: Project,
  classificationSystemEntries: ClassificationSystemEntry[] = [],
  exportAutorskeNastroje: boolean = false,
  exportCzTranslations: boolean = false,
  ciselnikySheetExists: boolean = false
) => {
  const sheet = workbook.addWorksheet("POŽADAVKY");

  const phases = project.phases;
  const phaseHeaders = phases.map((p) => p.name || p.code || p.id);
  const phaseIds = phases.map((p) => p.id);
  const codeLists = project.codeLists || [];

  /** Najde cestu hierarchie pro kód v libovolném klasifikačním systému; fallback pro kódy s tečkou (ASR.KAN.01). */
  const getHierarchyPath = (objectCode: string): ClassificationNode[] | null => {
    const allSources: ClassificationNode[][] = [
      ...classificationSystemEntries.map((e) => e.nodes ?? []).filter((n) => n.length > 0),
      ...(project.classification?.nodes ? [project.classification.nodes] : []),
    ];
    for (const nodes of allSources) {
      const path = getPathToNode(nodes, objectCode);
      if (path && path.length > 0) return path;
    }
    if (objectCode.includes(".") && !objectCode.includes("::")) {
      const parts = objectCode.split(".");
      const path: ClassificationNode[] = [];
      for (let i = 1; i <= parts.length; i++) {
        const parentCode = parts.slice(0, i).join(".");
        let desc = "";
        for (const nodes of allSources) {
          const node = findNodeByCode(nodes, parentCode);
          if (node) {
            desc = node.description || "";
            break;
          }
        }
        path.push({ code: parentCode, description: desc, level: i, children: [] });
      }
      return path.length > 0 ? path : null;
    }
    return null;
  };

  // Jen sloupce popisů nadřazených úrovní (bez kódů – kód je jen Kód_objektu = nejnižší úroveň)
  // Přidáme pouze sloupce pro úrovně, které jsou v datech vyplněné (žádné prázdné sloupce)
  const MAX_HIERARCHY_LEVELS = 5;
  let maxDepthUsed = 0;
  for (const code of Object.keys(project.objects)) {
    const path = getHierarchyPath(code);
    if (path && path.length > 0) {
      maxDepthUsed = Math.max(maxDepthUsed, path.length);
    }
  }
  const hierarchyPopisHeaders = Array.from(
    { length: Math.min(maxDepthUsed, MAX_HIERARCHY_LEVELS) },
    (_, i) => `Třídění_úroveň_${i + 1}`
  );

  // Další klasifikační systémy (Klasifikační systém), ne Autorský nástroj ani IFC (IFC je už v sloupcích IFC_entita a IFC_predefinedType)
  const primaryEntry = classificationSystemEntries.find((e) => e.isPrimary);
  const additionalSystemEntries = (primaryEntry?.mappedSystemIds ?? [])
    .map((id) => classificationSystemEntries.find((e) => e.id === id))
    .filter((e): e is ClassificationSystemEntry => {
      if (!e) return false;
      if (e.isIfcSystem) return false; // IFC už v IFC_entita + IFC_predefinedType
      const kind = e.systemKind ?? "classification";
      return kind === "classification";
    });
  const additionalSystemHeaders = additionalSystemEntries.map((e) => `Třídění_${e.name}`);

  // Třídění autorských nástrojů (např. Kategorie RVT) – pouze když je zaškrtnuto v exportu
  const authoringSystemEntries = exportAutorskeNastroje && primaryEntry?.authoringToolSystemIds?.length
    ? (primaryEntry.authoringToolSystemIds ?? [])
        .map((id) => classificationSystemEntries.find((e) => e.id === id))
        .filter((e): e is ClassificationSystemEntry => !!e)
    : [];
  const authoringSystemHeaders = authoringSystemEntries.map((e) => `Třídění_AN_${e.name}`);

  const headers = [
    "Třídící_kód",
    ...hierarchyPopisHeaders,
    ...additionalSystemHeaders,
    ...authoringSystemHeaders,
    "IFC_entita",
    ...(exportCzTranslations ? ["IFC_entita_CZ"] : []),
    "IFC_predefinedType",
    ...(exportCzTranslations ? ["IFC_predefinedType_CZ"] : []),
    "Typ_požadavku",
    "Skupina",
    ...(exportCzTranslations ? ["Skupina_CZ"] : []),
    "Parametr_hodnoty",
    ...(exportCzTranslations ? ["Parametr_hodnoty_CZ"] : []),
    "IFC_datový_typ",
    "Omezení",
    "Požadované_hodnoty",
    ...(exportCzTranslations ? ["Požadované_hodnoty_CZ"] : []),
    "Jednotka",
    "Číselník",
    "URI",
    "Popis",
    "Poznámka",
    "Příklady",
    "Výskyt",
    ...phaseHeaders,
  ];
  const headerRow = sheet.addRow(headers);
  const identifikacniColCount = 1 + hierarchyPopisHeaders.length; // Kód + hierarchie primární klasifikace
  const dalsiKlasifikaceColCount = additionalSystemHeaders.length; // Další klasifikační systémy
  const autorskeNastrojeColCount = authoringSystemHeaders.length; // Třídění autorských nástrojů
  const ifcColCount = exportCzTranslations ? 4 : 2; // IFC_entita, IFC_entita_CZ, IFC_predefinedType, IFC_predefinedType_CZ
  styleZdrojHeaderRow(headerRow, identifikacniColCount, dalsiKlasifikaceColCount, autorskeNastrojeColCount, ifcColCount);

  const orderedCodes = primaryEntry?.nodes
    ? collectLeaves(primaryEntry.nodes).map((n) => n.code)
    : [];
  const objectCodes = [
    ...orderedCodes.filter((c) => project.objects[c]),
    ...Object.keys(project.objects).filter((c) => !orderedCodes.includes(c)),
  ];

  const occurrenceLabels: Record<string, string> = {
    required: "Povinný",
    optional: "Volitelný",
    prohibited: "Zakázaný",
  };

  const constraintLabels: Record<string, string> = {
    FILLED: "Jednoduchá hodnota",
    ENUM: "Výčet",
    PATTERN: "Vzor",
    RANGE: "Ohraničení",
    LENGTH: "Délka",
  };

  const ciselnikColIndex = headers.indexOf("Číselník") + 1;
  const pozadovaneHodnotyColIndex = headers.indexOf("Požadované_hodnoty") + 1;
  const maxCiselnikRow = 1 + codeLists.length;

  let rowIndex = 0;

  objectCodes.forEach((code) => {
    const obj = project.objects[code];
    if (!obj) return;

    const hierarchyPath = getHierarchyPath(code);
    const hierarchyValues = hierarchyPopisHeaders.map((_, i) =>
      normalizeNotDefined(hierarchyPath?.[i]?.description ?? "")
    );

    const leafNode = primaryEntry ? findNodeByCode(primaryEntry.nodes ?? [], code) : undefined;
    const additionalSystemValues = additionalSystemEntries.map(
      (e) => leafNode?.mappedValues?.[e.id]?.trim() ?? ""
    );
    const authoringSystemValues = authoringSystemEntries.map(
      (e) => leafNode?.mappedValues?.[e.id]?.trim() ?? ""
    );

    const tridiciKod = obj.code?.includes("::") ? "" : (obj.code ?? "");
    const baseCols = [
      tridiciKod,
      ...hierarchyValues,
      ...additionalSystemValues,
      ...authoringSystemValues,
      obj.ifcEntity,
      ...(exportCzTranslations ? [obj.ifcEntityCz ?? ""] : []),
      obj.predefinedType.mode === "ENUM"
        ? (obj.predefinedType.value || "NOTDEFINED")
        : (obj.code?.includes("::") ? "NOTDEFINED" : ""),
      ...(exportCzTranslations ? [obj.predefinedTypeCz ?? ""] : []),
    ];

    const addRow = (
      typ: string,
      skupina: string,
      parametrHodnoty: string,
      dataType: string,
      unit: string,
      occurrence: string,
      constraint: string,
      povoleneHodnoty: string,
      ciselnikName: string,
      uri: string,
      popis: string,
      note: string,
      priklady: string,
      reqPhases?: string[],
      czVals?: { skupinaCz?: string; parametrCz?: string; hodnotyCz?: string }
    ) => {
      const occLabel = occurrenceLabels[occurrence] || occurrence;
      const constraintLabel = constraintLabels[(constraint ?? "FILLED").toUpperCase()] || constraint;
      const phaseVals = phaseIds.map((pid) => hasPhase(reqPhases, pid));
      const useCiselnikFormula =
        constraint === "ENUM" &&
        ciselnikName &&
        codeLists.length > 0 &&
        ciselnikySheetExists;

      const row = sheet.addRow([
        ...baseCols,
        typ,
        skupina,
        ...(exportCzTranslations ? [czVals?.skupinaCz ?? ""] : []),
        parametrHodnoty,
        ...(exportCzTranslations ? [czVals?.parametrCz ?? ""] : []),
        dataType,
        constraintLabel,
        useCiselnikFormula ? "" : povoleneHodnoty,
        ...(exportCzTranslations ? [czVals?.hodnotyCz ?? ""] : []),
        unit,
        ciselnikName,
        uri,
        popis,
        note,
        priklady,
        occLabel,
        ...phaseVals,
      ]);

      if (useCiselnikFormula) {
        const ciselnikColLetter = getColumnLetter(ciselnikColIndex);
        const ciselnikCellRef = `${ciselnikColLetter}${row.number}`;
        const formula = `=IF(${ciselnikCellRef}="","",VLOOKUP(${ciselnikCellRef},ČÍSELNÍKY!$A$2:$B$${maxCiselnikRow},2,FALSE))`;
        row.getCell(pozadovaneHodnotyColIndex).value = { formula };
      }

      styleDataRow(row, rowIndex % 2 === 1);
      rowIndex++;
    };

    obj.requirements.attributes.forEach((attr: AttributeRequirement) => {
      const clId = getCodeListId(attr.extensions);
      addRow(
        "Atribut",
        "",
        attr.attribute || "",
        attr.dataType || "",
        attr.unit || "",
        attr.occurrence || "required",
        attr.constraint,
        (attr.allowedValues || []).join(";") || attr.value || "",
        getCodeListName(clId, codeLists),
        attr.uri || "",
        attr.popis || "",
        attr.note || "",
        attr.priklady || "",
        attr.phases,
        exportCzTranslations ? { parametrCz: attr.attributeCz, hodnotyCz: attr.constraint === "ENUM" && clId ? undefined : attr.valueCz } : undefined
      );
    });

    obj.requirements.properties.forEach((prop: PropertyRequirement) => {
      // Preskočiť nedokončené skupiny s dočasným názvom _NEW_ – nemajú byť v exporte
      if (prop.psetName?.startsWith("_NEW_")) return;
      const clId = getCodeListId(prop.extensions);
      addRow(
        "Vlastnost",
        prop.psetName,
        prop.propertyName || "",
        prop.dataType,
        prop.unit || "",
        prop.occurrence || "required",
        prop.constraint || "",
        (prop.allowedValues || []).join(";") || prop.value || "",
        getCodeListName(clId, codeLists),
        prop.uri || "",
        prop.popis || "",
        prop.note || "",
        prop.priklady || "",
        prop.phases,
        exportCzTranslations ? {
          skupinaCz: prop.psetName?.startsWith("_NEW_") ? undefined : prop.psetNameCz,
          parametrCz: prop.propertyName?.startsWith("_NEW_") ? undefined : prop.propertyNameCz,
          hodnotyCz: prop.constraint === "ENUM" && clId ? undefined : prop.valueCz,
        } : undefined
      );
    });

    obj.requirements.relations.forEach((rel: RelationRequirement) => {
      const soucastEntity = [rel.entityType, rel.entityPredefinedType].filter(Boolean).join(".");
      addRow(
        "Součást",
        "",
        soucastEntity,
        "",
        "",
        rel.occurrence || "required",
        "",
        rel.relationType || "",
        "",
        rel.uri || "",
        rel.popis || "",
        rel.note || "",
        rel.priklady || "",
        rel.phases,
        exportCzTranslations ? { parametrCz: rel.entityTypeCz, hodnotyCz: rel.relationTypeCz } : undefined
      );
    });

    excludeIfcClassifications(obj.requirements.classifications, classificationSystemEntries).forEach(
      (cls: ClassificationRequirement) => {
        const noteWithIdentification = cls.identification
          ? [cls.note, `[Identifikace: ${cls.identification}]`].filter(Boolean).join(" ")
          : (cls.note || "");
        addRow(
          "Klasifikace",
          "",
          cls.system,
          "",
          "",
          cls.occurrence || "required",
          cls.constraint || "",
          cls.value || "",
          "",
          cls.uri || "",
          cls.description || "",
          noteWithIdentification,
          cls.priklady || "",
          cls.phases,
          exportCzTranslations ? { parametrCz: cls.systemCz, hodnotyCz: cls.constraint === "ENUM" ? undefined : cls.valueCz } : undefined
        );
      }
    );

    obj.requirements.materials.forEach((mat: MaterialRequirement) => {
      const clId = getCodeListId(mat.extensions);
      addRow(
        "Materiál",
        "",
        mat.category || "",
        "",
        "",
        mat.occurrence || "required",
        mat.constraint || "",
        mat.value || "",
        getCodeListName(clId, codeLists),
        mat.uri || "",
        mat.popis || "",
        mat.note || "",
        mat.priklady || "",
        mat.phases,
        exportCzTranslations ? { parametrCz: mat.categoryCz, hodnotyCz: mat.constraint === "ENUM" && clId ? undefined : mat.valueCz } : undefined
      );
    });
  });

  // Data validation: dropdown v sloupci Číselník odkazující na ČÍSELNÍKY – při změně se automaticky přepočítá Požadované_hodnoty (VLOOKUP)
  if (ciselnikySheetExists && codeLists.length > 0 && rowIndex > 0) {
    const ciselnikRange = `ČÍSELNÍKY!$A$2:$A$${1 + codeLists.length}`;
    for (let r = 2; r <= rowIndex + 1; r++) {
      const cell = sheet.getCell(r, ciselnikColIndex);
      cell.dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [ciselnikRange],
      };
    }
  }

  const hierarchyWidths = hierarchyPopisHeaders.map(() => 30);
  const additionalWidths = additionalSystemHeaders.map(() => 22);
  const authoringWidths = authoringSystemHeaders.map(() => 22);
  const reqWidths = exportCzTranslations
    ? [18, 22, 15, 22, 12, 25, 22, 25, 22, 15, 25, 30, 22, 12, 22, 25, 30, 30, 30, 10]
    : [18, 15, 12, 25, 25, 15, 25, 30, 12, 22, 25, 30, 30, 30, 10];
  const widths = [
    18,
    ...hierarchyWidths,
    ...additionalWidths,
    ...authoringWidths,
    ...reqWidths,
    ...phaseHeaders.map(() => 10),
  ];
  finalizeSheet(sheet, widths);
};

/**
 * Sheet selection options for selective export
 * zdroj = list POŽADAVKY (hlavní tabulka pro kontingenční tabulku a import)
 * klasifikaceListy = každá klasifikace jako samostatný list (Kód, Popis, Úroveň)
 * mapovani = list PRVKY (primární klasifikace + IFC + mapované systémy + popis objektů)
 */
export interface SheetSelection {
  zdroj: boolean;
  /** Exportovat třídění autorských nástrojů jako další sloupce za primární klasifikací a IFC */
  zdrojExportAutorskeNastroje?: boolean;
  /** Exportovat sloupce překladů CZ (IFC_entita_CZ, Skupina_CZ, atd.) v POŽADAVKY a PRVKY */
  exportCzTranslations?: boolean;
  ciselniky: boolean;
  faze: boolean;
  projekt: boolean;
  /** Každá klasifikace jako samostatný list (Kód, Popis, Úroveň) */
  klasifikaceListy: boolean;
  /** List PRVKY – primární klasifikace s IFC, mapovanými systémy a popisem objektů */
  mapovani: boolean;
}

/**
 * Default selection - hlavní list + doplňky pro pochopení
 */
export const DEFAULT_SHEET_SELECTION: SheetSelection = {
  zdroj: true,
  zdrojExportAutorskeNastroje: false,
  exportCzTranslations: false,
  ciselniky: true,
  faze: true,
  projekt: true,
  klasifikaceListy: true,
  mapovani: false,
};

/**
 * Generate Excel workbook from project with optional sheet selection
 */
export const generateExcelWorkbook = async (
  project: Project,
  selection: SheetSelection = DEFAULT_SHEET_SELECTION
): Promise<ExcelJS.Workbook> => {
  const workbook = new ExcelJS.Workbook();
  const exportProject = withCanonicalIdsForExcel(project);

  // Set workbook properties
  workbook.creator = project.author || "InfoReqApp";
  workbook.lastModifiedBy = project.author || "InfoReqApp";
  workbook.created = new Date(project.createdAt);
  workbook.modified = new Date(project.updatedAt);
  workbook.title = project.name;
  workbook.subject = "BIM Information Requirements";

  // Pořadí listů: NÁVOD, PROJEKT, FÁZE, PRVKY, ČÍSELNÍKY (před POŽADAVKY kvůli odkazům), POŽADAVKY, Klasifikace
  createGuideSheet(workbook);
  if (selection.projekt) {
    createProjectSheet(workbook, project);
  }
  if (selection.faze) {
    createPhasesSheet(workbook, project.phases);
  }
  if (selection.mapovani) {
    createMapovaniSheet(
      workbook,
      project,
      project.classificationSystemEntries || [],
      selection.zdrojExportAutorskeNastroje ?? false,
      selection.exportCzTranslations ?? false
    );
  }
  if (selection.ciselniky) {
    createCodeListsSheet(workbook, project.codeLists || []);
  }
  if (selection.zdroj) {
    createZdrojSheet(
      workbook,
      exportProject,
      project.classificationSystemEntries ?? [],
      selection.zdrojExportAutorskeNastroje ?? false,
      selection.exportCzTranslations ?? false,
      selection.ciselniky ?? false
    );
  }
  if (selection.klasifikaceListy) {
    createClassificationSheets(workbook, project.classificationSystemEntries || []);
  }

  return workbook;
};

/**
 * Export project to Excel file (.xlsx)
 */
export const exportExcelFile = async (
  project: Project,
  selection: SheetSelection = DEFAULT_SHEET_SELECTION
): Promise<void> => {
  const workbook = await generateExcelWorkbook(project, selection);

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();

  // Create blob and download
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;

  // Generate filename
  const sanitizedName = project.name.replace(/[^a-zA-Z0-9_\-ěščřžýáíéůúďťňĚŠČŘŽÝÁÍÉŮÚĎŤŇ ]/gi, "_");
  const timestamp = new Date().toISOString().slice(0, 10);
  link.download = `${sanitizedName}_${timestamp}.xlsx`;

  link.click();
  URL.revokeObjectURL(url);
};

/**
 * Validace dat před exportem – zjistí nevyplněné nebo placeholder hodnoty
 */
export const validateExportData = (project: Project): { valid: boolean; issues: string[] } => {
  const issues: string[] = [];

  for (const [objCode, obj] of Object.entries(project.objects)) {
    const objLabel = obj.description || objCode;

    for (const prop of obj.requirements.properties) {
      if (prop.psetName?.startsWith("_NEW_")) {
        issues.push(
          `Objekt „${objLabel}“: skupina vlastností není vyplněna (vlastnost „${prop.propertyName || "—"}“)`
        );
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
};

/**
 * Get statistics about export content
 */
export const getExportStatistics = (project: Project): {
  zdroj: number;
  phases: number;
  codeLists: number;
  klasifikaceListy: number;
  mapovani: number;
} => {
  const objects = Object.values(project.objects);
  const entries = project.classificationSystemEntries ?? [];
  const classificationsCount = objects.reduce((sum, obj) => {
    const filtered = excludeIfcClassifications(obj.requirements.classifications, entries);
    return sum + filtered.length;
  }, 0);

  const zdrojCount =
    objects.reduce((sum, obj) => sum + obj.requirements.attributes.length, 0) +
    objects.reduce((sum, obj) => sum + obj.requirements.properties.length, 0) +
    objects.reduce((sum, obj) => sum + obj.requirements.relations.length, 0) +
    classificationsCount +
    objects.reduce((sum, obj) => sum + obj.requirements.materials.length, 0);

  const klasifikaceCount = entries.filter((e) => !e.isIfcSystem && e.nodes?.length).length;
  const primaryEntry = entries.find((e) => e.isPrimary);
  const mapovaniCount = primaryEntry?.nodes ? flattenToCodePopisUroven(primaryEntry.nodes).length : 0;

  return {
    zdroj: zdrojCount,
    phases: project.phases.length,
    codeLists: (project.codeLists || []).length,
    klasifikaceListy: klasifikaceCount,
    mapovani: mapovaniCount,
  };
};
