# Návod na vytvoření nové verze

Tento návod vám pomůže jednoduše vytvořit novou verzi projektu a nahrát ji na GitHub.

## Postup pro novou verzi

### 1. Zvýšit verzi v package.json

Otevřete soubor `package.json` a změňte číslo verze:
- Pro malé opravy: `1.0.0` → `1.0.1`
- Pro nové funkce: `1.0.0` → `1.1.0`
- Pro velké změny: `1.0.0` → `2.0.0`

### 2. Přidat změny do Gitu

```bash
git add -A
```

### 3. Vytvořit commit

```bash
git commit -m "Verze X.X.X - popis změn"
```

(Nahraďte X.X.X skutečnou verzí a popište, co jste změnili)

### 4. Vytvořit tag

```bash
git tag -a vX.X.X -m "Verze X.X.X"
```

(Nahraďte X.X.X stejnou verzí jako v kroku 1)

### 5. Nahrát na GitHub

```bash
git push origin main
git push origin vX.X.X
```

(První příkaz nahraje změny, druhý nahraje tag)

## Rychlý příklad

Pokud chcete vytvořit verzi 1.0.1:

```bash
# 1. Upravte verzi v package.json na "1.0.1"
# 2. Pak spusťte:
git add -A
git commit -m "Verze 1.0.1 - oprava chyb"
git tag -a v1.0.1 -m "Verze 1.0.1"
git push origin main
git push origin v1.0.1
```

## Důležité poznámky

- **Nikdy necommitujte** soubory v `node_modules/` nebo `dist/` - ty jsou automaticky ignorované
- Před každou verzí zkontrolujte, že projekt funguje: `npm run dev`
- Tagy pomáhají označit konkrétní verze v historii projektu
¨