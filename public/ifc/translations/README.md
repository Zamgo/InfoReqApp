# Překlady (Excel)

Sem se kopírují Excel soubory z **IFC/TRANSLATION** (spusťte `npm run sync:translations` nebo při každém `npm run dev`).

**Soubory podle verze IFC (doporučeno):**
- **IFC_4_3_ADD2_cs.xlsx** – překlady pro IFC 4.3
- **IFC_4_ADD2_TC1_cs.xlsx** – překlady pro IFC 4

**Jednotný soubor (volitelně):** **Preklady.xlsx** – jeden Excel pro všechny verze; v listech použijte volitelný sloupec **IFC_verze** (IFC4 / IFC4X3).

**Struktura listů (v jednom Excelu mohou být listy pro entity, později Pset):**
- **Entity** – sloupce: IFC_entita, Překlad; volitelně IFC_verze
- **PredefinedTypes** – sloupce: IFC_entita, PredefinedType, Překlad; volitelně IFC_verze
- později např. **Pset**
