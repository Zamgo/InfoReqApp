# InfoReqApp

Aplikace pro správu informačních požadavků.

## Uživatelský návod (česky)

Návod, jak aplikace funguje a co všechno umí, v jednoduchém jazyce: **[docs/navod/](docs/navod/)**. Začít můžete u [Úvodu](docs/navod/00-uvod.md).

## Dokumentace architektury

Popis modulů, datových toků a citlivých míst: **[docs/architecture/](docs/architecture/)**. Odtud lze odvodit technický popis, údržbu a základ pro uživatelský návod.

- [Přehled architektury](docs/architecture/overview.md)
- [Moduly a závislosti](docs/architecture/modules.md)
- [Datové toky](docs/architecture/data-flows.md)
- [Citlivá místa](docs/architecture/sensitive-areas.md)
- [IFC verze a schéma](docs/architecture/schema-and-version.md)
- [Glosář](docs/architecture/glossary.md)
- [Struktura adresářů a úklid](docs/architecture/structure.md)

**Pravidlo živé dokumentace:** Při větší změně modulu, datového toku nebo citlivého místa aktualizujte příslušný soubor (`modules.md`, `data-flows.md`, `sensitive-areas.md`), aby v dokumentaci zůstalo popsáno, co s čím v aplikaci funguje.

## Instalace

```bash
npm install
```

## Spuštění vývojového serveru

```bash
npm run dev
```

## Sestavení projektu

```bash
npm run build
```

## Verze

Aktuální verze: 1.0.0
