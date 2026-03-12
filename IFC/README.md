# IFC – zdroje dat

## Zastaralé PredefinedTypes (IFC 4.3)

Soubor **`ifc43_deprecated_predefined_types.csv`** je zdroj pravdy pro zastaralé hodnoty PredefinedType v IFC 4.3.

- Sloupce: `entity`, `enum_name`, `deprecated_value`, `deprecation_version`, `replacement_or_note`
- Při sestavení se sloučí do `public/ifc/deprecated_ifc4x3.json` příkazem:
  ```bash
  npm run build:deprecated
  ```
- Aplikace pak v dropdownu PredefinedType zobrazí u zastaralých hodnot „(zastaralé - bude odstraněno)“ a pod polem poznámku.

## Zastaralé entity

Seznam zastaralých entit a dalších PredefinedTypes se bere z buildingSMART Gherkin pravidel (IFC102) a při `npm run build:deprecated` se zapisuje do `public/ifc/deprecated_ifc4.json` a `deprecated_ifc4x3.json`.
