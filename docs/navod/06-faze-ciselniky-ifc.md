# Fáze, číselníky a verze IFC

Tato kapitola shrnuje **fáze projektu**, **číselníky** a **výběr verze IFC** – kde se nastavují a k čemu slouží.

---

## Fáze

**Fáze** jsou etapy projektu (např. Návrh, Realizace, Údržba). Slouží k tomu, aby u každého objektu a u každého požadavku bylo jasné, **v kterých fázích** platí IFC entita a dané požadavky.

- **Kde se nastavují:** V **levém panelu** – sekce správy fází. Můžete přidávat fáze (kód, název, popis), upravovat je a mazat.
- **Jak se používají:** V **kartě objektu** u každého požadavku (atributy, vlastnosti, součásti, klasifikace, materiál) zaškrtnete **fáze**, ve kterých je požadavek aktivní. V záhlaví karty objektu můžete zvolit **aktuální fázi** pro zobrazení a pro náhled IDS.
- **Export IDS:** Při exportu IDS zvolíte **fázi**; do souboru se vyexportují jen objekty a požadavky platné pro tuto fázi.

Projekt musí mít alespoň jednu fázi; u požadavku musí být vždy alespoň jedna fáze zaškrtnutá. Viz také [Karta objektu a požadavky](04-karta-objektu.md).

---

## Číselníky

**Číselník** je seznam povolených hodnot (např. „Požární odolnost: REI 30; REI 60; REI 90“). Používá se u požadavků typu **Vlastnost**, když má být hodnota omezena na výčet (ENUM).

- **Kde se nastavují:** V **levém panelu** – sekce číselníků. Přidáte číselník (název, hodnoty oddělené středníkem, popř. poznámka), upravíte nebo smažete. Číselníky lze také **importovat** (např. z Excelu).
- **Jak se používají:** V kartě objektu u požadavku **Vlastnost** zvolíte omezení „výčet“ (ENUM) a přiřadíte **číselník**. V UI se pak u hodnoty nabídne výběr z položek číselníku.

Číselníky jsou uloženy v projektu a exportují se do Excelu. Při importu Excelu se číselníky spárují podle názvu. Viz [Import a export](05-import-export.md) a [docs/EXCEL_ROUNDTRIP.md](../EXCEL_ROUNDTRIP.md).

---

## Verze IFC schématu

Aplikace podporuje **dvě verze** IFC schématu: **IFC4** a **IFC 4.3**. Od verze závisí:

- které **entity, Pset a Qto** jsou k dispozici ve výběrech,
- **hodnota verze** v exportovaném souboru IDS,
- **odkazy na dokumentaci** buildingSMART (entity, vlastnosti, Pset) – vedou na správnou verzi dokumentace.

**Kde se nastavuje:** V dialogu **Údaje projektu** (klik na název projektu v horní liště) – pole **„Verze IFC schématu“**. Po uložení se načte příslušné IFC schéma a všechny výběry a exporty používají tuto verzi. Viz [Práce s projektem](02-projekt.md).

Při **importu Excelu** může být verze nastavena podle importovaného souboru (např. IFC4X3). Při **importu IDS** se použije projektová verze pro mapování a sloučení.

---

## Shrnutí odkazů

- [Úvod a obsah návodu](00-uvod.md)
- [Co je InfoReqApp a k čemu slouží](01-co-je-a-k-cemu.md)
- [Práce s projektem](02-projekt.md)
- [Klasifikace a levý panel](03-klasifikace.md)
- [Karta objektu a požadavky](04-karta-objektu.md)
- [Import a export](05-import-export.md)

Technická dokumentace architektury: [docs/architecture/](../architecture/).
