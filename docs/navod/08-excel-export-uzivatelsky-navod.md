# Uživatelský návod k Excel exportu informačních požadavků

Tento Excel představuje přehled alfanumerických požadavků na informace v rámci projektu v tabulkové podobě. Je určen pro předání požadavků na informace, které mají být dodány v digitálním modelu stavby (DiMS) podle standardu IFC.

Hlavním účelem souboru je srozumitelně popsat:

- na jaké prvky modelu se požadavky vztahují,
- jaké informace mají tyto prvky obsahovat,
- jak mají být hodnoty vyplněny nebo omezeny,
- ve kterých projektových fázích požadavky platí.

Excel je pracovní a uživatelsky čitelná forma datového standardu. Navazuje na principy IDS, ale prezentuje je ve formě tabulek, se kterými lze běžně pracovat v Excelu.

## Vazba na IDS a IFC

Struktura požadavků vychází z IDS, tedy `Information Delivery Specification`. IDS je standard buildingSMART pro definování informačních požadavků ve strojově čitelné podobě. Umožňuje popsat, jaké objekty mají být v IFC modelu obsaženy a jaké informace k nim mají být dodány.

V praxi IDS odpovídá na otázky:

- pro jaký typ prvku požadavek platí,
- jakou vlastnost, atribut, materiál, klasifikaci nebo vazbu má prvek obsahovat,
- jaká hodnota je očekávaná,
- zda je informace povinná, volitelná, nebo naopak zakázaná.

Tento Excel používá stejnou logiku, ale převádí ji do přehledné tabulkové podoby. Slouží tedy jako čitelný podklad nad informačními požadavky, které mohou být následně využity i pro tvorbu nebo kontrolu IDS.

Oficiální zdroje k IDS:

- buildingSMART IDS: https://www.buildingsmart.org/standards/bsi-standards/information-delivery-specification-ids/
- GitHub repozitář standardu IDS: https://github.com/buildingSMART/IDS

## Základní princip čtení

Nejdůležitějším listem je `POŽADAVKY`. Každý řádek tohoto listu představuje jeden konkrétní informační požadavek pro určitý typ prvku.

Řádek je vhodné číst jako větu:

```text
Pro daný prvek požadujeme danou informaci, v určité podobě, s daným pravidlem a v určených fázích projektu.
```

První část řádku identifikuje prvek nebo skupinu prvků. Další část popisuje požadovanou informaci. Poslední část určuje platnost požadavku v projektových fázích.

Příklad čtení řádku:

```text
Pro dveře je požadována vlastnost FireRating ve skupině Pset_DoorCommon.
Hodnota musí být vybrána z povoleného seznamu.
Požadavek platí ve fázích označených hodnotou Ano.
```

## Proč se rozlišují typy požadavků

IFC standard neukládá všechny informace jedním způsobem. Některé informace jsou základní součástí IFC entity jako atributy, jiné jsou uloženy jako vlastnosti ve specifických skupinách vlastností, další vyjadřují materiál, klasifikaci nebo vztah mezi prvky.

Proto list `POŽADAVKY` rozlišuje sloupec `Typ_požadavku`. Tento sloupec určuje, jaký druh informace má být v modelu kontrolován a kde se taková informace v IFC logice obvykle nachází.

Rozlišení typů požadavků je důležité pro správnou interpretaci dat. Stejná textová hodnota může mít jiný význam podle toho, zda jde o vlastnost, atribut, klasifikaci nebo materiálový požadavek.

## Typ požadavku `Atribut`

`Atribut` označuje informaci, která je přímo součástí IFC entity. Nejde o běžnou uživatelskou vlastnost v property setu, ale o údaj patřící k základní IFC struktuře objektu.

Typickým příkladem mohou být základní identifikační nebo systémové údaje IFC entity.

U tohoto typu je důležitý zejména sloupec `Parametr_hodnoty`, který uvádí název požadovaného atributu. Sloupec `Požadované_hodnoty` následně říká, jaká hodnota se očekává, případně jaké hodnoty jsou povolené.

## Typ požadavku `Vlastnost`

`Vlastnost` je nejčastější typ informačního požadavku. Popisuje údaj uložený v property setu (skupině vlastností), quantity setu (skupině výměr) nebo v uživatelsky definované skupině vlastností.

V IFC jsou vlastnosti obvykle sdruženy do skupin. Například dveře mohou mít vlastnosti ve skupině `Pset_DoorCommon`, stěny ve skupině `Pset_WallCommon` a projekt může používat i vlastní skupiny vlastností.

U typu `Vlastnost` mají hlavní sloupce tento význam:

| Sloupec | Význam |
| --- | --- |
| `Skupina` | Název property setu, quantity setu nebo vlastní skupiny. |
| `Parametr_hodnoty` | Název požadované vlastnosti. |
| `IFC_datový_typ` | Očekávaný datový typ hodnoty, pokud je definovaný. |
| `Omezení` | Pravidlo, podle kterého se hodnota posuzuje. |
| `Požadované_hodnoty` | Konkrétní hodnota, seznam hodnot, rozsah nebo jiné pravidlo. |

Příklad:

```text
Typ_požadavku: Vlastnost
Skupina: Pset_DoorCommon
Parametr_hodnoty: FireRating
Omezení: Výčet
Požadované_hodnoty: EI30;EI45;EI60
```

Takový řádek znamená, že pro daný prvek je požadována vlastnost `FireRating` ve skupině `Pset_DoorCommon` a její hodnota má být jedna z uvedených možností.

## Typ požadavku `Součást`

`Součást` popisuje vazbu mezi objekty. Tento typ požadavku neříká, jakou textovou nebo číselnou hodnotu má prvek obsahovat, ale jak má být zařazen nebo propojen s jiným objektem v modelu.

V logice IDS odpovídá tento požadavek vztahům typu `partOf`. V IFC jsou takové vazby reprezentovány relacemi, například při zařazení prvku do prostorové struktury.

U typu `Součást` mají hlavní sloupce tento význam:

| Sloupec | Význam |
| --- | --- |
| `Parametr_hodnoty` | Entita souvisejícího objektu. |
| `Požadované_hodnoty` | Typ IFC vztahu, který má vazbu vyjadřovat. |

Příklad:

```text
Typ_požadavku: Součást
Parametr_hodnoty: IfcBuildingStorey
Požadované_hodnoty: IFCRELCONTAINEDINSPATIALSTRUCTURE
```

Takový požadavek říká, že prvek má být vztažen k podlaží prostřednictvím odpovídající IFC relace.

## Typ požadavku `Klasifikace`

`Klasifikace` vyjadřuje požadavek na zatřídění prvku podle klasifikačního systému. Může jít o národní, oborový, projektový nebo firemní klasifikační systém.

Klasifikace pomáhá sjednotit názvosloví, usnadňuje vyhledávání prvků a umožňuje jejich seskupování podle třídicích kódů.

U typu `Klasifikace` mají hlavní sloupce tento význam:

| Sloupec | Význam |
| --- | --- |
| `Parametr_hodnoty` | Název klasifikačního systému. |
| `Požadované_hodnoty` | Požadovaný klasifikační kód nebo hodnota. |

IFC entita a `IFC_predefinedType` nejsou v tomto Excelu uváděny jako běžný klasifikační požadavek. Jsou vedeny v samostatných sloupcích, protože určují základní IFC typ prvku.

## Typ požadavku `Materiál`

`Materiál` popisuje požadavek na materiálovou informaci prvku. Používá se tam, kde je potřeba určit materiál, materiálovou kategorii nebo pravidlo pro materiálovou skladbu.

U typu `Materiál` mají hlavní sloupce tento význam:

| Sloupec | Význam |
| --- | --- |
| `Parametr_hodnoty` | Kategorie nebo druh materiálové informace. |
| `Požadované_hodnoty` | Požadovaná hodnota, seznam hodnot nebo jiné omezení. |

Materiálové požadavky jsou samostatným typem proto, že materiál je v IFC zpravidla reprezentován jinou strukturou než běžné vlastnosti v property setech.

## Identifikace prvku

Úvodní sloupce listu `POŽADAVKY` určují, na jaký prvek nebo typ prvku se požadavek vztahuje.

| Sloupec | Význam |
| --- | --- |
| `Třídící_kód` | Kód prvku nebo třídy prvků v primární klasifikaci. |
| `Třídění_úroveň_1`, `Třídění_úroveň_2`, ... | Hierarchické zařazení prvku. |
| `Třídění_<systém>` | Mapování prvku na další klasifikační systém. |
| `Třídění_AN_<nástroj>` | Mapování na autorský nástroj, například kategorii v modelovacím softwaru. |
| `IFC_entita` | IFC entita, kterou má prvek v modelu reprezentovat. |
| `IFC_predefinedType` | Upřesnění IFC entity pomocí predefined type. |

Tyto sloupce odpovídají otázce, čeho se požadavek týká. Sloupce za nimi následně popisují, jaká informace je pro tento prvek požadována.

## Sloupec `Omezení`

Sloupec `Omezení` určuje pravidlo, podle kterého se má hodnota posuzovat.

| Hodnota | Význam |
| --- | --- |
| `Jednoduchá hodnota` | Hodnota má být vyplněná nebo má odpovídat jedné konkrétní hodnotě. |
| `Výčet` | Hodnota má být vybrána ze seznamu povolených hodnot. |
| `Vzor` | Hodnota má odpovídat předepsanému textovému vzoru. |
| `Ohraničení` | Hodnota má být v určeném rozsahu. |
| `Délka` | Hodnota má splnit pravidlo pro délku textu nebo hodnoty. |

Pokud je vyplněn sloupec `Číselník`, povolené hodnoty jsou spravovány na listu `ČÍSELNÍKY`. Číselníky pomáhají sjednotit zápis hodnot a omezit rozdíly způsobené volným textem.

## Sloupec `Výskyt`

Sloupec `Výskyt` určuje závaznost požadavku.

| Hodnota | Význam |
| --- | --- |
| `Povinný` | Informace má být v modelu uvedena. |
| `Volitelný` | Informace může být uvedena, ale není povinná. |
| `Zakázaný` | Informace se pro daný prvek nemá uvádět. |

Hodnota `Zakázaný` se používá v případech, kdy je potřeba výslovně zabránit použití určité vlastnosti, hodnoty nebo vazby.

## Projektové fáze

Na konci listu `POŽADAVKY` jsou uvedeny sloupce projektových fází. Každá fáze má vlastní sloupec.

| Hodnota | Význam |
| --- | --- |
| `Ano` | Požadavek platí v dané fázi. |
| `Ne` | Požadavek má určené fáze, ale v této fázi neplatí. |
| prázdná buňka | U požadavku není fáze určena. |

Fáze umožňují rozlišit, kdy má být informace dodána. Některé požadavky mohou být relevantní již v raných stupních projektu, jiné až pro dokumentaci, realizaci, předání nebo provoz.

## Přehled listů v souboru

Excel může obsahovat několik listů. Jejich dostupnost závisí na zvoleném rozsahu exportu.

| List | Účel |
| --- | --- |
| `PROJEKT` | Základní informace o projektu, IFC verzi a dokumentaci. |
| `FÁZE` | Přehled projektových fází použitých v požadavcích. |
| `POŽADAVKY` | Hlavní tabulka informačních požadavků. |
| `ČÍSELNÍKY` | Seznamy povolených hodnot pro výčtové požadavky. |
| `PRVKY` | Přehled prvků, jejich zatřídění, IFC entit a mapování. |
| `KLASIFIKACE_*` | Přehled klasifikačních systémů použitých v projektu. |

## List `PROJEKT`

List `PROJEKT` obsahuje kontext exportu. Uvádí zejména název projektu, autora, popis, použitou IFC specifikaci, odkaz na IFC dokumentaci a Model View Definition.

Tento list slouží k ověření, že požadavky jsou posuzovány vůči správnému projektu a správné verzi IFC.

## List `FÁZE`

List `FÁZE` definuje projektové fáze, které se následně používají v listu `POŽADAVKY`.

Názvy fází v tomto listu odpovídají názvům fázových sloupců v listu `POŽADAVKY`. Díky tomu je možné zjistit, v jakém období nebo stupni dokumentace je daný požadavek relevantní.

## List `ČÍSELNÍKY`

List `ČÍSELNÍKY` obsahuje řízené seznamy povolených hodnot. Používá se zejména pro požadavky typu `Výčet`.

Příklad:

```text
Název číselníku: Požární odolnost
Hodnoty: EI15;EI30;EI45;EI60;EI90
```

Pokud je v listu `POŽADAVKY` uveden číselník, hodnota požadavku má vycházet z příslušného seznamu. Cílem je zajistit jednotný zápis hodnot napříč projektem.

## List `PRVKY`

List `PRVKY` poskytuje přehled prvků z primární klasifikace. Uvádí jejich hierarchické zařazení, IFC entitu, IFC predefined type a případně mapování na další klasifikační systémy nebo autorské nástroje.

Tento list neslouží jako seznam jednotlivých požadavků. Slouží jako kontext a kontrolní přehled prvků, ke kterým se požadavky vztahují.

## Listy `KLASIFIKACE_*`

Listy s názvem začínajícím `KLASIFIKACE_` obsahují přehled klasifikačních systémů použitých v projektu.

Obvykle obsahují:

- třídicí kód,
- popis,
- úroveň ve stromu klasifikace.

Tyto listy slouží jako slovník klasifikačních kódů a popisů. Pomáhají porozumět hodnotám použitým v listech `POŽADAVKY` a `PRVKY`.


## Shrnutí

Excel je profesionální pracovní přehled informačních požadavků založený na logice IDS. Každý řádek v listu `POŽADAVKY` určuje:

- na jaký prvek se požadavek vztahuje,
- jaký typ informace je požadován,
- jaké pravidlo nebo hodnota se má uplatnit,
- zda je požadavek povinný, volitelný nebo zakázaný,
- ve kterých projektových fázích požadavek platí.

Při čtení tabulky je vhodné postupovat od identifikace prvku přes typ požadavku až po hodnotu, omezení a fázi. Tím lze každý řádek interpretovat jako konkrétní pravidlo pro dodání informací v rámci IFC modelu.
