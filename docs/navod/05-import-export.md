# Import a export

Tato kapitola popisuje, **co můžete importovat a exportovat** a kdy který formát použít.

---

## Menu Import

V horní liště je tlačítko **Import**. Po kliknutí se zobrazí výběr:

- **JSON** – import celého projektu ze souboru JSON (dříve exportovaného z aplikace). Projekt se nahradí nebo sloučí s aktuálním.
- **IDS** – import souboru IDS (Information Delivery Specification, formát buildingSMART). Aplikace soubor zpracuje a **sloučí** požadavky do aktuálního projektu (nebo vytvoří projekt, pokud žádný není). Kódy a entity se mapují podle načteného IFC schématu.
- **Excel** – import Excelu (.xlsx) ve struktuře, kterou aplikace očekává (listy PROJEKT, FÁZE, ČÍSELNÍKY, PRVKY, POŽADAVKY, KLASIFIKACE_* atd.). Slouží k načtení nebo doplnění projektu z tabulky. Viz také [docs/EXCEL_ROUNDTRIP.md](../EXCEL_ROUNDTRIP.md) pro detaily roundtripu.

Po výběru souboru se import spustí; při chybě se zobrazí hláška ve statusu. Úspěšný import obvykle aktualizuje strom a kartu objektu.

---

## Menu Export

V horní liště je tlačítko **Export**. Po kliknutí se zobrazí výběr:

- **JSON** – export **celého projektu** do jednoho souboru JSON. Slouží jako záloha nebo pro předání projektu jinam. Importem JSON lze projekt znovu načíst.
- **IDS** – export požadavků do formátu IDS (XML). Otevře se dialog, kde můžete zvolit **fázi**, podle které se export filtruje, a další možnosti (např. filtr výskytu). Verze IFC v souboru IDS odpovídá **verzi nastavené v údajích projektu** (IFC4 nebo IFC 4.3). Výsledný soubor lze použít v nástrojích podporujících IDS.
- **Excel** – export projektu do Excelu (.xlsx). Otevře se dialog s výběrem **listů** (záložek), které se mají exportovat (PROJEKT, FÁZE, ČÍSELNÍKY, PRVKY, POŽADAVKY, klasifikace atd.). Metadatový list obsahuje verzi IFC a odkaz na dokumentaci. Struktura odpovídá vzoru pro import – viz [docs/EXCEL_ROUNDTRIP.md](../EXCEL_ROUNDTRIP.md).

---

## Kdy co použít

| Potřeba | Formát |
|--------|--------|
| Záloha nebo předání celého projektu | **JSON** (export + později import JSON). |
| Předat požadavky do nástroje podporujícího IDS | **IDS** (export podle fáze a filtrů). |
| Upravit data v tabulce a vrátit je do aplikace | **Excel** (export, úprava v Excelu, import Excel). |
| Načíst existující specifikaci z IDS | **IDS** (import). |
| Načíst projekt z tabulky (např. z přílohy standardu) | **Excel** (import). |

---

## Poznámky k Excelu

- Při **exportu** se používají názvy fází ze seznamu fází projektu; sloupce fází v listu POŽADAVKY odpovídají těmto názvům.
- **Číselníky** se při importu spárují podle názvu; při přejmenování číselníku v Excelu může vazba z požadavků zaniknout.
- Pro spolehlivý **roundtrip** (export → úprava v Excelu → import) je vhodné mít v buňkách vyplněné hodnoty, ne jen vzorce. Více v [docs/EXCEL_ROUNDTRIP.md](../EXCEL_ROUNDTRIP.md).

Další krok: [Fáze, číselníky a verze IFC](06-faze-ciselniky-ifc.md).
