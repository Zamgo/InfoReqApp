# Klasifikace a levý panel

Tato kapitola popisuje **levý panel** aplikace: strom klasifikace, **nahrání klasifikace** (TSV/Excel) a správu **klasifikačních systémů**.

---

## Levý panel

V levé části obrazovky je **panel s klasifikací**. Zobrazuje se zde:

- **Strom klasifikace** – hierarchie kódů (uzlů) podle **primárního** klasifikačního systému. Kliknutím na řádek vyberete **objekt**; v pravé části se otevře **karta objektu**. Viz [Karta objektu a požadavky](04-karta-objektu.md).
- Možnost **nahrát soubor** klasifikace (TSV nebo Excel).
- Správa **fází** projektu.
- Správa **číselníků**.
- Správa **klasifikačních systémů** (přidání, úprava, mapování na IFC).

Panel lze **skrýt** nebo **zobrazit** tlačítkem na okraji a **měnit šířku** tažením okraje. Stav (viditelnost, šířka) se ukládá do prohlížeče.

---

## Nahání klasifikace (TSV / Excel)

Klasifikaci přidáte tak, že v levém panelu **nahrajete soubor**:

- **TSV / TXT** – textový soubor s kódy a popisy (např. tabulátorem oddělené sloupce). Aplikace rozliší formát (číselník s úrovněmi nebo jednoduchý seznam).
- **Excel (XLSX)** – list s klasifikací ve struktuře, kterou aplikace očekává (např. sloupce Kód, Popis, Úroveň).

Po nahrání:

- Pokud **projekt ještě neexistuje**, vytvoří se nový projekt a nahraná klasifikace se nastaví jako **primární** systém. Viz [Práce s projektem](02-projekt.md).
- Pokud **projekt už existuje**, přidá se nový klasifikační systém; můžete ho v nastavení systémů označit jako primární nebo ho namapovat na IFC.

Pokud soubor už obsahuje sloupce **IFC entita** / **IFC PredefinedType**, aplikace může automaticky vytvořit **dva systémy**: váš klasifikační a „Třídění dle IFC entit“, včetně mapování mezi nimi. K tomu je potřeba načtené IFC schéma (volba verze v údajích projektu).

Vzorové soubory klasifikace jsou ve složce **Vzorové soubory** v kořeni projektu.

---

## Klasifikační systémy

Projekt může obsahovat **více klasifikačních systémů**:

- **Primární systém** – podle něj se zobrazuje strom v levém panelu a podle něj se vybírají objekty (kódy).
- **Třídění dle IFC entit** – systém odvozený z IFC schématu; slouží k mapování kódů na IFC entity a PredefinedType. Seznam entit vychází ze slovníku (IFC 4.3: bSDD, IFC4: vygenerovaný slovník) – v aplikaci jsou jen výskytové entity vhodné pro klasifikaci. Podrobnosti: [IFC verze a zdroje dat](../architecture/schema-and-version.md).
- **Další systémy** – např. další číselníky nebo „autorské“ systémy (např. kategorie z autorovského nástroje).

V levém panelu je dostupná **správa klasifikačních systémů**: přidání nového systému, úprava názvu, mapování mezi systémy (který kód odpovídá které IFC entitě), označení systému jako „autorský nástroj“ atd. Mapování se pak projeví v kartě objektu – u vybraného kódu se předvyplní IFC entita a typ.

---

## Fáze a číselníky v levém panelu

- **Fáze** – zde můžete přidávat, upravovat a mazat fáze projektu (např. Návrh, Realizace). Fáze pak slouží u objektů a požadavků k tomu, aby bylo jasné, v kterých etapách co platí. Viz [Fáze, číselníky a verze IFC](06-faze-ciselniky-ifc.md).
- **Číselníky** – zde definujete seznamy hodnot (název číselníku, hodnoty oddělené např. středníkem). Číselníky pak přiřadíte k požadavkům v kartě objektu. Viz [Fáze, číselníky a verze IFC](06-faze-ciselniky-ifc.md).

Další krok: [Karta objektu a požadavky](04-karta-objektu.md).
