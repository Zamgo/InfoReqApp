# Návod: Nasazení InfoReqApp na Vercel

Tento návod vás provede nasazením aplikace na Vercel zdarma.

---

## Předpoklady

- Účet na [GitHub](https://github.com)
- Projekt InfoReqApp nahrán na GitHub
- Účet na [Vercel](https://vercel.com) (registrace zdarma přes GitHub)

---

## Krok 1: Registrace na Vercel

1. Otevřete [vercel.com](https://vercel.com)
2. Klikněte na **„Sign Up“**
3. Zvolte **„Continue with GitHub“**
4. Přihlaste se ke svému GitHub účtu a povolte Vercel přístup k repozitářům

---

## Krok 2: Import projektu

1. Po přihlášení klikněte na **„Add New…“** → **„Project“**
2. V seznamu repozitářů najděte **InfoReqApp** (nebo název vašeho repozitáře)
3. Klikněte na **„Import“** vedle projektu

---

## Krok 3: Konfigurace buildu

Vercel by měl automaticky rozpoznat Vite projekt. Zkontrolujte nastavení:

| Nastavení | Hodnota |
|-----------|---------|
| **Framework Preset** | Vite |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |

Pokud něco chybí, nastavte ručně:
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

---

## Krok 4: Nasazení

1. Klikněte na **„Deploy“**
2. Počkejte 1–2 minuty na dokončení buildu
3. Po úspěchu uvidíte zelenou hlášku a odkaz na vaši aplikaci

---

## Krok 5: URL aplikace

- **Produkční URL:** `https://inforeqapp-xxxxx.vercel.app` (nebo podobný název)
- Vercel automaticky přiřadí název podle projektu
- V nastavení projektu můžete přidat vlastní doménu (např. `inforeqapp.cz`)

---

## Automatické nasazení

Po prvním nasazení platí:

- Každý **push na větev `main`** spustí nový deploy
- Každý **push na jinou větev** vytvoří preview URL pro testování
- Historie deployů je v záložce **„Deployments“** v projektu na Vercel

---

## Rychlý checklist

- [ ] Projekt je na GitHubu
- [ ] Registrace na Vercel přes GitHub
- [ ] Import projektu z GitHubu
- [ ] Build Command: `npm run build`
- [ ] Output Directory: `dist`
- [ ] Klik na Deploy

---

## Řešení problémů

### Build selhává

1. Otevřete **Deployments** → vyberte neúspěšný deploy → **„View Build Logs“**
2. Časté příčiny:
   - Chybějící závislosti – zkontrolujte, že `package.json` obsahuje všechny potřebné balíčky
   - Chyba TypeScriptu – spusťte lokálně `npm run build` a opravte chyby

### Aplikace se nenačte (bílá stránka)

- Zkontrolujte konzoli prohlížeče (F12) kvůli chybám
- Ověřte, že build proběhl úspěšně a výstupní složka je `dist`

### Potřebujete přidat environment proměnné

1. V projektu na Vercel: **Settings** → **Environment Variables**
2. Přidejte proměnné (např. API klíče)
3. Spusťte nový deploy

---

## Odkazy

- [Dokumentace Vercel](https://vercel.com/docs)
- [Vercel + Vite](https://vercel.com/guides/deploying-vite-with-vercel)
