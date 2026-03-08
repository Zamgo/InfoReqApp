# Překlady a mapování – tři vrstvy

Tento dokument rozlišuje tři související oblasti: (a) zobrazení IFC názvů v UI, (b) CZ sloupce v požadavcích uložené v projektu, (c) budoucí vlastní mapování entit. Při rozšíření překladů nebo mapování tento soubor aktualizujte.

---

## (a) Zobrazení IFC názvů (entity, Pset, Qto, property)

- **Účel:** Zobrazit uživateli překlad nebo doplňkový název k oficiálnímu IFC identifikátoru (např. „IfcWall“ → „Stěna“), přičemž **v datech a v exportu** zůstávají vždy oficiální názvy.
- **Kde žije:** [src/translation/](src/translation/) – TranslationContext, TranslationService, překladače (Auto, bSDD, MyMemory). Režim a jazyk z projektu (`project.translationMode`, `project.translationLanguage`). IFC verze pro bSDD z `project.ifcSchemaVersion` (getBsddUrl).
- **Režimy:** OFF (jen oficiální názvy), AUTO (lokální heuristika/slovník), BSDD (buildingSMART Data Dictionary API). Specifikace: [TRANSLATION_DESIGN.md](TRANSLATION_DESIGN.md).
- **Použití v UI:** Komponenta TranslatedLabel a další místa, kde se zobrazují entity, PredefinedType, Pset, Qto, property – zobrazení je doplňkové k oficiálnímu názvu.

---

## (b) CZ sloupce v požadavcích (uložené v projektu)

- **Účel:** Uživatelské české (nebo jiné jazykové) varianty pro atributy a hodnoty v požadavcích – např. „attributeCz“, „valueCz“ v typech požadavků. Jsou součástí **dat projektu** a exportují se do Excelu.
- **Kde žije:** V typech projektu a objektů (např. v requirements.attributes[].attributeCz, valueCz); ukládají se v localStorage a v exportovaném JSON/Excel. Nejsou řízené TranslationContext – jsou to data zadaná nebo importovaná uživatelem.
- **Rozdíl oproti (a):** (a) = zobrazení oficiálních IFC názvů v UI (entity, Pset, …). (b) = konkrétní sloupce v požadavcích uložené v projektu; mohou být později napojeny na návrhy z mapování (c), ale nejsou nutné pro první krok vlastního mapování.

---

## (c) Budoucí vlastní mapování entit

- **Účel (plánovaný):** Umožnit uživateli nebo systému definovat vlastní zobrazovací názvy (popř. popisy) pro entity, PredefinedType, Pset, property – „naše“ názvosloví nebo mapování kódů na entity. Priorita zobrazení: vlastní mapování → AUTO/BSDD → oficiální název.
- **Stav:** V kódu zatím není vyhrazená vrstva („entity display service“ nebo „mapping registry“). Doporučení z architektury: nejdřív zdokumentovat (tento soubor a schema/overview), po stabilizaci a testování navrhnout strukturu úložiště (např. JSON nebo pole v projektu) a rozhraní, které bere oficiální identifikátor a vrací zobrazený název.
- **Vztah k (a) a (b):** (a) zůstane pro režim OFF/AUTO/BSDD; vlastní mapování bude další zdroj s vyšší prioritou. (b) CZ sloupce v požadavcích mohou být později napojeny na návrhy z mapování (např. doplnění attributeCz z mapování), ale nejsou nutné pro zavedení vrstvy (c).

---

## Shrnutí

| Vrstva | Co to je | Kde žije | Export / data |
|--------|----------|----------|----------------|
| (a) Zobrazení IFC názvů | TranslationContext, režim OFF/AUTO/BSDD | translation/, projekt (režim, jazyk) | Data vždy oficiální; zobrazení jen v UI |
| (b) CZ sloupce v požadavcích | attributeCz, valueCz, … v požadavcích | project.objects[].requirements | Uloženo v projektu a Excelu |
| (c) Vlastní mapování | Budoucí vrstva (entity display / mapping) | Návrh v docs; implementace později | Zobrazení s prioritou nad (a) |

Více o implementaci (a): [TRANSLATION_DESIGN.md](TRANSLATION_DESIGN.md).
