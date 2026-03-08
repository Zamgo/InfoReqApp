# Co je InfoReqApp a k čemu slouží

Tato kapitola vysvětluje **účel aplikace** a **základní pojmy** jednoduchým jazykem.

---

## Účel aplikace

InfoReqApp slouží k **tvorbě a správě informačních požadavků** pro BIM modely. V praxi to znamená:

- **Definujete**, jaké informace mají mít prvky v IFC modelu (např. stěna má mít tloušťku, materiál, požární odolnost).
- **Propojujete** své klasifikační systémy (kódy, kategorie) s **IFC entitami** (IfcWall, IfcDoor, …).
- **Výstupem** jsou soubory **IDS** nebo **Excel**, které lze použít v dalších nástrojích pro kontrolu nebo výměnu dat.

Aplikace **neupravuje 3D modely** – pracuje jen s popisem požadavků. Data se ukládají v prohlížeči (localStorage) a lze je exportovat nebo importovat.

---

## Základní pojmy

### Projekt

**Projekt** je hlavní „soubor“, se kterým pracujete. Obsahuje:

- údaje o projektu (název, autor, popis),
- verzi IFC schématu (IFC4 nebo IFC 4.3),
- klasifikační systémy a strom kódů,
- **objekty** (ke každému kódu přiřazené požadavky),
- fáze, číselníky a nastavení.

Projekt se ukládá automaticky v prohlížeči. Můžete ho také exportovat do JSON a později znovu načíst. Více: [Práce s projektem](02-projekt.md).

### Objekt (kód)

**Objekt** je jedna položka ve stromu klasifikace – například konkrétní kód „1.2.3“ nebo kategorie. Ke každému objektu můžete:

- přiřadit **IFC entitu** (např. IfcWall, IfcDoor),
- volitelně **PredefinedType** (např. u dveří typ DOOR),
- definovat **požadavky**: atributy, vlastnosti (Pset/Qto), součásti, klasifikace, materiál.

V aplikaci se objekt zobrazuje jako řádek v levém panelu a po kliknutí se otevře **karta objektu** vpravo. Více: [Karta objektu a požadavky](04-karta-objektu.md).

### Klasifikace

**Klasifikace** je hierarchická struktura kódů (uzlů) – třeba číselník nebo kategorie z vašeho systému. Můžete mít více klasifikačních systémů v jednom projektu (např. vlastní číselník + „Třídění dle IFC entit“). Jeden systém je **primární** – podle něj se zobrazuje strom v levém panelu. Více: [Klasifikace a levý panel](03-klasifikace.md).

### IFC entita a PredefinedType

- **IFC entita** je typ prvku ve standardu IFC (např. IfcWall = stěna, IfcDoor = dveře). V aplikaci ji vybíráte ze stromu odvozeného z IFC schématu.
- **PredefinedType** je konkrétní podtyp (např. u IfcDoor hodnota DOOR, NOTDEFINED). Hodnoty závisí na zvolené verzi IFC.

### IDS (Information Delivery Specification)

**IDS** je XML formát od buildingSMART pro specifikaci informačních požadavků. Aplikace umí **exportovat** projekt (nebo jeho část) do souboru IDS a **importovat** IDS do projektu. Verze IFC v IDS odpovídá verzi nastavené v projektu. Více: [Import a export](05-import-export.md).

### Fáze

**Fáze** jsou časové nebo logické etapy (např. Návrh, Realizace). U každého objektu a u požadavků můžete určit, **ve kterých fázích** platí IFC entita a které požadavky jsou aktivní. Při exportu IDS nebo zobrazení v UI můžete filtrovat podle zvolené fáze. Více: [Fáze, číselníky a verze IFC](06-faze-ciselniky-ifc.md).

### Číselník

**Číselník** je seznam povolených hodnot (např. pro vlastnost „Požární odolnost“: REI 30, REI 60, …). Číselníky definujete v projektu a pak je přiřadíte k požadavkům – v UI se pak nabídne výběr z těchto hodnot. Více: [Fáze, číselníky a verze IFC](06-faze-ciselniky-ifc.md).

---

## Co aplikace umí (shrnutí)

- Vytvořit nebo načíst projekt (z klasifikace, JSON, IDS, Excel).
- Spravovat více klasifikačních systémů a mapovat kódy na IFC entity.
- U každého objektu definovat IFC entitu, PredefinedType a požadavky (atributy, vlastnosti, součásti, klasifikace, materiál).
- Pracovat s fázemi a číselníky.
- Exportovat a importovat JSON, IDS a Excel.
- Zobrazovat odkazy na IFC dokumentaci podle zvolené verze (IFC4 / IFC 4.3).

Další krok: [Práce s projektem](02-projekt.md).
