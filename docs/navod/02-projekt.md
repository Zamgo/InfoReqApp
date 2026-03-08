# Práce s projektem

Tato kapitola popisuje, jak **vytvořit projekt**, jak upravit **údaje projektu**, kde najdete **nastavení** a jak **resetovat** aplikaci.

---

## Kdy vznikne projekt

Projekt vznikne například když:

- **Nahrajete klasifikaci** (TSV nebo Excel) a zatím nemáte žádný projekt – aplikace vytvoří nový projekt a nastaví tuto klasifikaci jako primární. Viz [Klasifikace a levý panel](03-klasifikace.md).
- **Importujete JSON, IDS nebo Excel** z menu **Import** – načte se (nebo sloučí) projekt z vybraného souboru. Viz [Import a export](05-import-export.md).

Po vytvoření se projekt **automaticky ukládá** v prohlížeči (localStorage). Při příštím otevření aplikace se načte poslední uložený projekt.

---

## Údaje projektu

V horní liště je zobrazen **název projektu** (nebo „Nový projekt“, pokud žádný není). Kliknutím na název otevřete dialog **Údaje projektu**.

V dialogu můžete upravit:

- **Název projektu**
- **Autor**
- **Popis**
- **Verze IFC schématu** – výběr mezi IFC4 a IFC 4.3. Od verze závisí načtené IFC schéma (entity, Pset, Qto) a hodnota verze v exportu IDS a odkazech na dokumentaci. Viz [Fáze, číselníky a verze IFC](06-faze-ciselniky-ifc.md).
- **URL dokumentace IFC** – odkaz na dokumentaci buildingSMART; lze předvyplnit podle zvolené verze.

Po uložení se změny projeví v celé aplikaci (nové schema se načte podle verze, export IDS/Excel použije správnou verzi).

---

## Nastavení

Tlačítko **ozubeného kolečka** (ikona nastavení) v horní liště otevře **Nastavení**. Zde lze obvykle měnit:

- režim **překladu** IFC názvů (např. zobrazení českých názvů k entitám),
- **jazyk** pro překlady,
- zobrazení **českých sloupců** v požadavcích (attributeCz, valueCz atd.).

Nastavení se váže k projektu a ukládá se s ním.

---

## Zpět a Vpřed (Undo / Redo)

V horní liště jsou tlačítka **↶ Zpět** a **↷ Vpřed**. Slouží k vrácení změn v projektu (undo/redo). Počet kroků závisí na implementaci; klávesové zkratky bývají Ctrl+Z (zpět) a Ctrl+Y (vpřed).

---

## Reset projektu

Tlačítko **„Reset projektu“** v horní liště **smaže všechna data** v aplikaci (projekt i preference v prohlížeči). Zobrazí se potvrzení – po potvrzení nelze data obnovit. Používejte jen pokud chcete začít úplně znovu.

---

## Export a import projektu (JSON)

- **Export projektu (JSON)** – z menu **Export** → **JSON** stáhnete celý projekt jako jeden soubor JSON. Tím si projekt zálohujete nebo ho předáte jinam.
- **Import projektu (JSON)** – z menu **Import** → **JSON** vyberete soubor JSON; projekt se nahradí nebo sloučí (podle chování aplikace). Viz [Import a export](05-import-export.md).

Další krok: [Klasifikace a levý panel](03-klasifikace.md).
