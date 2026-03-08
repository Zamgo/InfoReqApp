# Karta objektu a požadavky

Tato kapitola popisuje **pravou část** obrazovky: co se zobrazí po výběru objektu ve stromu a jak pracovat s **požadavky** (atributy, vlastnosti, součásti, klasifikace, materiál).

---

## Výběr objektu

Když v **levém panelu** kliknete na řádek ve stromu klasifikace, vyberete **objekt** (jeden kód). V pravé části se otevře **karta objektu** pro tento objekt.

V kartě objektu můžete:

- upravit **popis**, **poznámku**, **příklady** (pokud je aplikace zobrazuje),
- nastavit **IFC entitu** a **PredefinedType** (pokud používáte IFC mapování),
- přidávat a upravovat **požadavky** v záložkách (Atributy, Vlastnosti, Součásti, Klasifikace, Materiál),
- zobrazit **náhled IDS** pro daný objekt a zvolenou fázi.

---

## Identifikační údaje a IFC entita

V horní části karty objektu jsou obvykle **identifikační údaje**:

- **Kód** – kód objektu ze stromu (např. 1.2.3).
- **IFC entita** – výběr entity ze schématu (IfcWall, IfcDoor, …). Výběr závisí na **verzi IFC** nastavené v údajích projektu. Viz [Fáze, číselníky a verze IFC](06-faze-ciselniky-ifc.md).
- **PredefinedType** – volitelný podtyp entity (např. DOOR, NOTDEFINED). Možné hodnoty závisí na zvolené entitě a na IFC schématu.

Odkazy u entity a vlastností vedou na **dokumentaci IFC** (buildingSMART) podle zvolené verze.

---

## Záložky požadavků

V kartě objektu jsou záložky podle typu požadavků:

| Záložka      | Obsah |
|-------------|--------|
| **Atributy** | Požadavky na IFC atributy (název atributu, omezení, hodnota, výskyt, fáze). |
| **Vlastnosti** | Požadavky na vlastnosti z Pset/Qto – skupina vlastností, název vlastnosti, datový typ, omezení, hodnota, jednotka, číselník, fáze. |
| **Součásti** | Vztahy „součást“ (např. IFCRELAGGREGATES) – typ vztahu, entita součásti, výskyt, fáze. |
| **Klasifikace** | Požadavky na klasifikaci (systém, hodnota/kód, výskyt, fáze). Může zahrnovat i „autorské“ systémy (ne pro IFC/IDS). |
| **Materiál** | Materiálové požadavky (kategorie, hodnota, výskyt, fáze). |
| **IDS** | Náhled výstupu IDS pro tento objekt a zvolenou fázi (schema, čitelný text, metadata). |

V každé záložce obvykle najdete **tabulku** s řádky požadavků a tlačítka pro **přidat**, **upravit**, **smazat**, **duplikovat do jiných objektů**. Sloupce obsahují např. výskyt (Required/Optional/Prohibited), fáze (ve kterých je požadavek aktivní), hodnoty a odkazy na dokumentaci.

---

## Výskyt a fáze u požadavků

- **Výskyt** – zda je požadavek povinný (Required), volitelný (Optional) nebo zakázaný (Prohibited).
- **Fáze** – u každého požadavku lze zaškrtnout, v **kterých fázích** platí. V záhlaví karty objektu můžete zvolit **aktuální fázi** pro zobrazení a pro náhled IDS; export IDS pak může filtrovat podle zvolené fáze. Viz [Fáze, číselníky a verze IFC](06-faze-ciselniky-ifc.md).

---

## Číselníky u vlastností

U požadavků typu **Vlastnost** můžete nastavit **omezení na výčet (ENUM)** a přiřadit **číselník**. Hodnoty z číselníku se pak v UI nabídnou jako výběr. Číselníky se definují v levém panelu. Viz [Fáze, číselníky a verze IFC](06-faze-ciselniky-ifc.md).

---

## Sekce a použitelnost

Karta objektu může mít sekce jako **Popis/poznámky/příklady**, **Identifikační údaje** a **Požadavky**. V rámci požadavků může být zobrazena i **použitelnost** – přehled, které požadavky platí v kterých fázích (atributy, vlastnosti, součásti, klasifikace, materiál).

---

## Undo/Redo

Změny v kartě objektu (úpravy požadavků, entity atd.) se ukládají do projektu. K vrácení kroků použijte **Zpět / Vpřed** v horní liště. Viz [Práce s projektem](02-projekt.md).

Další krok: [Import a export](05-import-export.md).
