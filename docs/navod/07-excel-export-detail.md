# Detailní návod k exportu do Excelu

Tento dokument popisuje, jak v aplikaci funguje export projektu do souboru Excel (`.xlsx`), jaké listy soubor obsahuje, co se do nich zapisuje a z jakých dat aplikace hodnoty skládá.

Export do Excelu není jen prosté uložení obrazovky do tabulky. Aplikace z aktuálního projektu vytvoří strukturovaný sešit, který má sloužit hlavně ke čtení, kontrole, předání dat a případně k následnému importu zpět do aplikace. Hlavním listem je `POŽADAVKY`; ostatní listy doplňují kontext, ze kterého jsou požadavky složené.

Popis níže se týká projektového exportu z menu `Export` → `Excel`. Samostatné Excel soubory pro překlady, vzorové číselníky nebo vzorové klasifikace jsou jiné pomocné soubory a nejsou součástí tohoto projektového exportu.

## Spuštění exportu

Export se spouští z menu `Export` volbou `Excel`. Po kliknutí se otevře dialog, kde lze vybrat, které listy se mají do souboru zahrnout.

Ve výchozím nastavení se exportují tyto listy:

- `PROJEKT`
- `FÁZE`
- `ČÍSELNÍKY`
- `POŽADAVKY`
- samostatné listy `KLASIFIKACE_*`

List `PRVKY` je ve výchozím nastavení vypnutý a uživatel ho musí zapnout ručně. Stejně tak jsou ve výchozím stavu vypnuté dvě doplňkové volby:

- `Exportovat klasifikaci dle autorských nástrojů`
- `Exportovat překlady CZ (sloupce *_CZ)`

První volba přidává do listů `POŽADAVKY` a `PRVKY` sloupce s mapováním na autorské nástroje, například kategorie z Revitu. Druhá volba přidává české překladové sloupce, například `IFC_entita_CZ`, `Skupina_CZ`, `Parametr_hodnoty_CZ` nebo `Požadované_hodnoty_CZ`.

Pokud je vybraný list `POŽADAVKY`, aplikace před exportem kontroluje, zda některé vlastnosti nemají nevyplněnou skupinu označenou interním placeholderem `_NEW_`. Pokud takové položky najde, zobrazí varování. Export lze přesto potvrdit a dokončit.

Výsledný soubor se stáhne jako:

```text
<název projektu>_<YYYY-MM-DD>.xlsx
```

Nepovolené znaky v názvu projektu se při tvorbě názvu souboru nahrazují podtržítkem. České znaky v názvu souboru jsou povolené.

## Pořadí listů v sešitu

Pokud jsou vybrané všechny dostupné listy, aplikace je vytvoří v tomto pořadí:

1. `PROJEKT`
2. `FÁZE`
3. `PRVKY`
4. `ČÍSELNÍKY`
5. `POŽADAVKY`
6. `KLASIFIKACE_*`

`ČÍSELNÍKY` jsou před listem `POŽADAVKY`, protože list `POŽADAVKY` na ně může odkazovat pomocí vzorců a rozbalovacích seznamů.

## List `PROJEKT`

List `PROJEKT` obsahuje základní metadata projektu. Slouží k tomu, aby bylo z exportu jasné, ke kterému projektu a IFC verzi se data vztahují.

Sloupce:

| Sloupec | Co obsahuje |
| --- | --- |
| `Název` | Název projektu. |
| `Autor` | Autor projektu, pokud je vyplněný. |
| `Popis` | Popis projektu, pokud je vyplněný. |
| `IFC_specifikace` | Zobrazovaná IFC verze projektu; pokud není dostupná, použije se interní IFC verze. |
| `IFC_dokumentace` | URL dokumentace IFC. Pokud není v projektu uložená, aplikace ji dopočítá podle IFC verze. |
| `Model_View_Definition_MVD` | Nastavené MVD; pokud není vyplněné, použije se `Reference View`. |

Do tohoto listu se neexportují interní ID projektu, interní časové značky ani IDS metadata.

## List `FÁZE`

List `FÁZE` obsahuje seznam projektových fází. Slouží jako vysvětlení sloupců fází, které jsou na konci listu `POŽADAVKY`.

Sloupce:

| Sloupec | Co obsahuje |
| --- | --- |
| `Kód` | Kód fáze. |
| `Název` | Název fáze. Tento název se používá jako název sloupce v listu `POŽADAVKY`. |
| `Popis` | Volitelný popis fáze. |

Interní ID fází se do Excelu neexportují. Vazba mezi listem `FÁZE` a fázovými sloupci v `POŽADAVKY` je proto čitelná podle názvu fáze. Při ruční úpravě Excelu je důležité názvy fází držet konzistentní.

## List `ČÍSELNÍKY`

List `ČÍSELNÍKY` obsahuje uživatelské číselníky pro výčtové hodnoty. Používá se hlavně pro požadavky s omezením typu výčet.

Sloupce:

| Sloupec | Co obsahuje |
| --- | --- |
| `Název` | Název číselníku. |
| `Hodnoty` | Hodnoty číselníku spojené středníkem `;`. |
| `Poznámka` | Volitelná poznámka k číselníku. |

Na listu `POŽADAVKY` se ve sloupci `Číselník` používá název číselníku. Pokud je list `ČÍSELNÍKY` exportovaný a v projektu existují číselníky, aplikace do sloupce `Číselník` v listu `POŽADAVKY` přidá rozbalovací seznam s názvy číselníků.

U výčtových požadavků, které jsou na číselník navázané, může být ve sloupci `Požadované_hodnoty` vzorec. Ten podle vybraného názvu číselníku dohledá hodnoty z listu `ČÍSELNÍKY`:

```text
=IF(<buňka_číselníku>="","",VLOOKUP(<buňka_číselníku>,ČÍSELNÍKY!$A$2:$B$N,2,FALSE))
```

Pokud list `ČÍSELNÍKY` není součástí exportu, aplikace do `POŽADAVKY` stále zapíše název číselníku, pokud je v projektu na požadavku uložený, ale nevytváří odkazový vzorec ani rozbalovací seznam. Hodnoty se v takovém případě zapisují přímo jako text.

## List `PRVKY`

List `PRVKY` je volitelný. Popisuje prvky z primární klasifikace a jejich mapování na IFC, další klasifikační systémy a případně autorské nástroje.

List vznikne pouze tehdy, když je v projektu dostupná primární klasifikace s uzly. Pokud uživatel list vybere, ale primární klasifikace neexistuje nebo nemá žádné uzly, list se nevytvoří.

Do listu `PRVKY` se exportují pouze koncové uzly primární klasifikace, tedy listy stromu. Neexportují se nadřazené uzly samostatně jako prvky, protože samy nepředstavují konkrétní prvek s požadavky.

Základní sloupce:

| Sloupec | Co obsahuje |
| --- | --- |
| `Třídící_kód` | Kód koncového uzlu primární klasifikace. Pokud kód obsahuje `::`, buňka zůstane prázdná. |
| `Třídění_úroveň_1` až `Třídění_úroveň_5` | Popisy úrovní v cestě primární klasifikace. Exportuje se maximálně pět úrovní. |
| `Třídění_<systém>` | Hodnota mapování na další klasifikační systém. Vzniká pro systémy namapované na primární klasifikaci, které nejsou IFC ani autorský nástroj. |
| `Třídění_AN_<nástroj>` | Hodnota mapování na autorský nástroj. Vzniká jen při zapnuté volbě exportu autorských nástrojů. |
| `IFC_entita` | IFC entita prvku. |
| `IFC_predefinedType` | IFC predefined type prvku. |
| `Popis` | Popis objektu uložený v projektu. |
| `Poznámka` | Poznámka k objektu uložená v projektu. |
| `Příklady` | Příklady k objektu uložené v projektu. |

Při zapnuté volbě překladů CZ se doplní také:

- `IFC_entita_CZ`
- `IFC_predefinedType_CZ`

IFC data se berou primárně z objektu v projektu. Pokud objekt pro daný kód v projektu není nebo nemá hodnotu, export může použít IFC hodnoty uložené přímo na uzlu klasifikace. U `IFC_predefinedType` platí, že pokud je v objektu režim výběru `ENUM`, exportuje se vybraná hodnota; pokud hodnota není vyplněná, použije se `NOTDEFINED`.

Hodnota `Není definováno` v popisech úrovní se při exportu sjednocuje na `NOTDEFINED`.

## List `POŽADAVKY`

List `POŽADAVKY` je hlavní list exportu. Jeden řádek představuje jeden konkrétní požadavek na konkrétní objekt nebo prvek.

Tento list je navržený jako plochá tabulka. Díky tomu se dá filtrovat, analyzovat v kontingenčních tabulkách a použít jako základ pro import zpět do aplikace.

### Identifikace objektu

První část řádku říká, ke kterému objektu se požadavek vztahuje.

Sloupce:

| Sloupec | Co obsahuje |
| --- | --- |
| `Třídící_kód` | Kód objektu. Pokud kód obsahuje `::`, exportuje se prázdná hodnota. |
| `Třídění_úroveň_1` až `Třídění_úroveň_5` | Popisy úrovní hierarchie primární klasifikace. Vzniknou jen pro úrovně, které jsou v datech skutečně použité. |
| `Třídění_<systém>` | Mapování objektu na další klasifikační systémy. |
| `Třídění_AN_<nástroj>` | Mapování na autorské nástroje, jen pokud je zapnutá příslušná volba exportu. |
| `IFC_entita` | IFC entita objektu. |
| `IFC_predefinedType` | IFC predefined type objektu. |

Při zapnuté volbě překladů CZ se přidávají také sloupce:

- `IFC_entita_CZ`
- `IFC_predefinedType_CZ`

Pořadí objektů v listu vychází nejdříve z pořadí koncových uzlů primární klasifikace. Objekty, které v primární klasifikaci nejsou nalezené, se doplní za ně.

Hierarchie se hledá v klasifikačních systémech projektu. Pokud se cesta podle kódu nenajde a kód obsahuje tečky, export se pokusí cestu odvodit postupně z částí kódu, například `ASR.KAN.01`.

### Vlastní požadavek

Další část řádku popisuje samotný požadavek.

Sloupce:

| Sloupec | Co obsahuje |
| --- | --- |
| `Typ_požadavku` | Druh požadavku: `Atribut`, `Vlastnost`, `Součást`, `Klasifikace` nebo `Materiál`. |
| `Skupina` | Skupina požadavku. U vlastností je to název Pset/Qto nebo vlastní skupiny. U ostatních typů je většinou prázdná. |
| `Parametr_hodnoty` | Hlavní identifikátor požadavku. Význam se liší podle typu požadavku. |
| `IFC_datový_typ` | Datový typ, pokud ho daný požadavek používá. |
| `Omezení` | Typ omezení převedený do čitelného českého názvu. |
| `Požadované_hodnoty` | Konkrétní hodnota, seznam hodnot nebo vzorec na číselník. |
| `Jednotka` | Jednotka požadavku, pokud existuje. |
| `Číselník` | Název navázaného číselníku, pokud je požadavek výčtový a používá číselník. |
| `URI` | Odkaz nebo URI uložené na požadavku. |
| `Popis` | Popis požadavku. |
| `Poznámka` | Poznámka k požadavku. |
| `Příklady` | Příklady k požadavku. |
| `Výskyt` | Čitelný výskyt požadavku: `Povinný`, `Volitelný` nebo `Zakázaný`. |

Při zapnuté volbě překladů CZ se mezi tyto sloupce doplní:

- `Skupina_CZ`
- `Parametr_hodnoty_CZ`
- `Požadované_hodnoty_CZ`

Hodnoty ve sloupci `Omezení` se převádějí takto:

| Interní hodnota | Hodnota v Excelu |
| --- | --- |
| `FILLED` | `Jednoduchá hodnota` |
| `ENUM` | `Výčet` |
| `PATTERN` | `Vzor` |
| `RANGE` | `Ohraničení` |
| `LENGTH` | `Délka` |

Hodnoty ve sloupci `Výskyt` se převádějí takto:

| Interní hodnota | Hodnota v Excelu |
| --- | --- |
| `required` | `Povinný` |
| `optional` | `Volitelný` |
| `prohibited` | `Zakázaný` |

### Význam `Parametr_hodnoty` podle typu požadavku

Sloupec `Parametr_hodnoty` sjednocuje různé typy požadavků do jedné tabulky. Jeho význam závisí na hodnotě ve sloupci `Typ_požadavku`.

| Typ požadavku | Co je ve sloupci `Skupina` | Co je ve sloupci `Parametr_hodnoty` | Co je ve sloupci `Požadované_hodnoty` |
| --- | --- | --- | --- |
| `Atribut` | Prázdné | Název IFC atributu | Hodnota, povolené hodnoty nebo hodnoty z číselníku. |
| `Vlastnost` | Název Pset/Qto/vlastní skupiny | Název vlastnosti | Hodnota, povolené hodnoty nebo hodnoty z číselníku. |
| `Součást` | Prázdné | Entita součásti, případně s predefined type ve tvaru `IfcEntity.PREDEFINEDTYPE` | Typ IFC vztahu, například `IFCRELAGGREGATES`. |
| `Klasifikace` | Prázdné | Název klasifikačního systému | Hodnota klasifikace. |
| `Materiál` | Prázdné | Kategorie materiálu | Hodnota materiálu. |

Požadavky typu `Klasifikace`, které odkazují na IFC klasifikační systém, se do listu `POŽADAVKY` záměrně neexportují jako samostatné klasifikační požadavky. IFC je v exportu reprezentované sloupci `IFC_entita` a `IFC_predefinedType`.

U požadavků typu `Klasifikace` se případná identifikace ukládá do sloupce `Poznámka` jako text ve tvaru:

```text
[Identifikace: ...]
```

### Fázové sloupce

Na konci listu `POŽADAVKY` je jeden sloupec pro každou fázi projektu. Název sloupce odpovídá názvu fáze z listu `FÁZE`.

Hodnoty ve fázových sloupcích:

| Hodnota | Význam |
| --- | --- |
| `Ano` | Požadavek je přiřazený k dané fázi. |
| `Ne` | Požadavek má přiřazené fáze, ale tato fáze mezi nimi není. |
| prázdná buňka | Požadavek nemá v datech uložené žádné přiřazení fází. |

Fázové sloupce tak neříkají jen, zda požadavek platí nebo neplatí. Prázdná buňka znamená, že požadavek nemá informaci o fázích vůbec.

## Listy `KLASIFIKACE_*`

Pokud je zapnutý export klasifikačních listů, aplikace vytvoří samostatný list pro každý ne-IFC klasifikační systém, který má v projektu uzly.

Název listu má tvar:

```text
KLASIFIKACE_<název systému>
```

Názvy listů se upravují podle omezení Excelu: nepovolené znaky se nahrazují podtržítkem a název se zkracuje na maximálně 31 znaků. Pokud by vznikly duplicitní názvy, aplikace přidá číselnou příponu.

Sloupce:

| Sloupec | Co obsahuje |
| --- | --- |
| `Třídící_kód` | Kód uzlu klasifikace. |
| `Popis` | Popis uzlu klasifikace. |
| `Úroveň` | Úroveň uzlu ve stromu. |

Na rozdíl od listu `PRVKY` se zde exportují všechny uzly stromu, nejen koncové listy. List tedy slouží jako přehled celé klasifikace.

IFC klasifikační systém se jako samostatný `KLASIFIKACE_*` list neexportuje. Důvod je stejný jako u požadavků: IFC informace jsou v exportu vedené přes `IFC_entita` a `IFC_predefinedType`.

Autorské klasifikace se jako samostatný `KLASIFIKACE_*` list exportovat mohou, pokud nejsou označené jako IFC a mají uzly. Volba `Exportovat klasifikaci dle autorských nástrojů` ale řídí pouze to, zda se jejich hodnoty objeví jako sloupce v `POŽADAVKY` a `PRVKY`.

## Formátování Excelu

Exportovaný sešit používá jednotné formátování, aby byly datové bloky čitelné:

- první řádek každého listu je hlavička,
- hlavička je tučná, bílá, centrovaná a zalamuje text,
- první řádek je v Excelu zamražený,
- buňky mají tenké světle šedé ohraničení,
- datové řádky se střídají se světle šedým podbarvením,
- sloupce mají nastavené šířky podle očekávaného obsahu.

Barvy hlaviček rozlišují význam částí tabulky:

| Barva / sekce | Význam |
| --- | --- |
| Červená | Metadata projektu. |
| Zelená | Primární třídění a identifikace objektu. |
| Tyrkysová | Další klasifikační systémy. |
| Fialová | Autorské nástroje. |
| Modrá | IFC entita a IFC predefined type. |
| Oranžová | Požadavky, fáze a číselníky. |

## Důležité poznámky pro práci s exportem

- Hlavní datový list je `POŽADAVKY`; ostatní listy vysvětlují, odkud hodnoty pocházejí.
- Interní ID objektů, fází a číselníků se do Excelu neexportují. Pro čitelnost a roundtrip se používají názvy a kódy.
- Fáze v listu `POŽADAVKY` se párují podle názvů fází. Při ručním přejmenování sloupců může být následný import nejednoznačný.
- Číselníky se v požadavcích odkazují podle názvu. Při přejmenování číselníku se může vazba ztratit.
- Výčtové hodnoty oddělené středníkem `;` představují více povolených hodnot v jedné buňce.
- Pokud buňka `Požadované_hodnoty` obsahuje vzorec na číselník, Excel hodnoty dopočítává z listu `ČÍSELNÍKY`.
- Pro spolehlivý export a případný import zpět je vhodné mít vyplněné skupiny vlastností, názvy parametrů, fáze a číselníky bez dočasných placeholderů.
