# Návod k aplikaci InfoReqApp

Tento návod popisuje **jednoduchým jazykem**, jak aplikace InfoReqApp funguje a co všechno umí. Je určen pro uživatele, kteří chtějí s aplikací pracovat bez nutnosti číst technickou dokumentaci.

---

## Co je InfoReqApp?

**InfoReqApp** je aplikace pro **správu informačních požadavků** v oblasti BIM a IFC. Slouží k tomu, abyste mohli:

- definovat, **jaké informace** mají mít prvky v modelu (stěny, dveře, okna…),
- pracovat s **klasifikačními systémy** a mapovat je na IFC entity,
- připravit výstupy pro další nástroje: **IDS** (Information Delivery Specification) a **Excel** šablony.

Více v článku: [Co je InfoReqApp a k čemu slouží](01-co-je-a-k-cemu.md).

---

## Jak je návod rozdělen

Návod je rozdělen do několika kapitol, které na sebe navazují. Můžete je číst v pořadí nebo přejít rovnou na to, co vás zajímá.

| Kapitola | Obsah |
|----------|--------|
| [Co je InfoReqApp a k čemu slouží](01-co-je-a-k-cemu.md) | Účel aplikace, základní pojmy (projekt, objekt, klasifikace, IFC, IDS). |
| [Práce s projektem](02-projekt.md) | Vytvoření projektu, údaje projektu (název, autor, verze IFC), nastavení, reset. |
| [Klasifikace a levý panel](03-klasifikace.md) | Levý panel, strom klasifikace, nahrání klasifikace (TSV/Excel), klasifikační systémy. |
| [Karta objektu a požadavky](04-karta-objektu.md) | Výběr objektu, IFC entita, záložky (Atributy, Vlastnosti, Součásti, Klasifikace, Materiál), požadavky a fáze. |
| [Import a export](05-import-export.md) | Import a export JSON, IDS a Excel – kdy co použít a jak. |
| [Fáze, číselníky a verze IFC](06-faze-ciselniky-ifc.md) | Fáze projektu, číselníky pro hodnoty požadavků, výběr verze IFC schématu. |

---

## Rychlý start

1. **Spusťte aplikaci** (např. `npm run dev` v kořeni projektu).
2. **Vytvořte nebo načtěte projekt** – buď nahrajte klasifikaci (TSV/Excel) nebo importujte JSON/IDS/Excel z menu **Import**.
3. **V levém panelu** vyberte objekt (řádek ve stromu klasifikace).
4. **V pravé části** v kartě objektu nastavte IFC entitu a přidejte požadavky (atributy, vlastnosti atd.).
5. **Exportujte** výsledek jako IDS nebo Excel z menu **Export**.

Technická dokumentace (architektura, moduly, datové toky) je v [docs/architecture/](../architecture/).
