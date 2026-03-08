# Glosář

Jednotná terminologie pro technický popis architektury i pro budoucí uživatelský návod.

---

**Projekt** – Hlavní datová jednotka aplikace: obsahuje metadata (název, autor, popis), verzi IFC schématu, klasifikační systémy, fáze, objekty (kódy) a jejich požadavky, číselníky. Ukládá se v localStorage a lze ho exportovat/importovat jako JSON.

**Objekt (kód)** – Položka v klasifikační struktuře identifikovaná kódem (např. „1.2.3“). Každý objekt má přiřazenou IFC entitu (a volitelně PredefinedType) a sadu požadavků (atributy, vlastnosti, vztahy, klasifikace, materiály). V UI se zobrazuje jako řádek ve stromu klasifikace a má vlastní kartu (ObjectDetail).

**Klasifikace** – Hierarchická struktura kódů (uzlů) s popisy. Může být „čistá“ (jen kódy) nebo propojená s IFC stromem (mapování kódů na IFC entity a PredefinedType). Projekt může obsahovat více klasifikačních systémů (primární a další, včetně IFC systému).

**IFC entita** – Typ objektu ve schématu IFC (např. IfcWall, IfcDoor). V aplikaci se vybírá ze stromu odvozeného z načteného schema indexu; ukládá se jako řetězec (oficiální název) v projektu a v exportu.

**PredefinedType** – Konkrétní podtyp IFC entity (např. u IfcDoor hodnota „DOOR“). Hodnoty závisí na schématu a na entitě; ukládají se v projektu a v exportu jako oficiální řetězec.

**IDS (Information Delivery Specification)** – XML formát pro specifikaci informačních požadavků (buildingSMART). Aplikace umí exportovat IDS z projektu (podle zvolené fáze a filtrů) a importovat IDS do projektu. Atribut `ifcVersion` v IDS odpovídá verzi schématu projektu (IFC4, IFC4X3_ADD2).

**Fáze** – Časové nebo logické fáze projektu (např. „Návrh“, „Realizace“). Každý objekt má přiřazeno, v kterých fázích platí IFC entita a PredefinedType a které požadavky jsou aktivní. Export IDS a zobrazení v UI se filtrují podle zvolené fáze.

**Číselník** – Seznam povolených hodnot pro požadavky (např. pro atribut nebo vlastnost). Ukládá se v projektu (codeLists) a lze ho přiřadit k požadavkům tak, aby UI nabízelo výběr z hodnot.

**Schema index** – Načtený JSON s popisem IFC schématu (entity, PredefinedType, Pset, Qto, property). Generuje se skriptem z XSD a doplňkových zdrojů; načítá se podle verze projektu (IFC4 nebo IFC4X3) a poskytuje se přes useSchema().

**Pset / Qto** – Property set a Quantity set – skupiny vlastností v IFC. V aplikaci se zobrazují a vybírají podle schema indexu; odkazy na dokumentaci závisí na zvolené IFC verzi.
