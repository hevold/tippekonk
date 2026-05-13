# Tippekonk

Privat tippekonkurranse for en liten vennegjeng. VM 2026.

Stack: vanilla HTML/CSS/JS (ES modules), Supabase som backend, football-data.org for kampdata. Ingen build-steg.

## Struktur

```
.
├── index.html           login og registrering
├── dashboard.html       stilling og kommende kamper
├── matches.html         liste over kamper med filter
├── match.html           enkeltkamp, tipping og resultat
├── tournament.html      turneringstipp (vinner, toppscorer osv.)
├── admin.html           legge inn resultater og styre spillere
├── css/style.css
└── js/
    ├── client.js        Supabase-klient og turneringskode
    ├── auth.js          PIN-auth via SHA-256 + salt
    ├── football.js      football-data.org-wrapper med 5-min cache
    ├── scoring.js       poengberegning (testbar)
    ├── index.js         side-spesifikk
    ├── dashboard.js
    ├── matches.js
    ├── match.js
    ├── tournament.js
    └── admin.js
```

## Poeng

Kamptipp: hvert tallfelt gir 3p ved eksakt treff, 1p ved ±1. Første målscorer: 3p ved eksakt navn, case-insensitiv.

Turneringstipp: hvert felt gir 5p ved eksakt treff. `total_goals` gir 5p ved ±5.

## Oppsett

Supabase-tabeller har prefiks `tk_` og RLS av (lukket gruppe, anon-nøkkel har full tilgang). Nøkler er hardkodet i `js/client.js` og `js/football.js`. Endre dem hvis du klonet appen for en annen turnering.

Salt for PIN-hash er hardkodet til `tippekonk-vm2026` i `js/auth.js`. Hvis du endrer den må alle PINs settes på nytt.

Etter første registrering, gjør deg selv til admin:

```sql
UPDATE tk_players SET is_admin = true WHERE name = 'DittNavn';
```

## Kjøre lokalt

Åpne `index.html` direkte i nettleseren, eller server filene med en hvilken som helst statisk server:

```
python3 -m http.server 8080
```

Deretter `http://localhost:8080/`.

## Deploye

Push til GitHub Pages, Netlify eller Vercel som vanlige statiske filer. Ingen miljøvariabler, ingen build.

## Push til GitHub

Repo: `hevold/tippekonk`. Filene ligger her klare med initial commit. Fra Mac-en:

```
cd "/Users/henrikvo/Library/Mobile Documents/com~apple~CloudDocs/Claude Workspace/OUTPUTS/tippekonk"
git push -u origin main
```

Hvis remote ikke er satt opp:

```
git remote add origin https://github.com/hevold/tippekonk.git
git push -u origin main
```

## Sikkerhet

RLS er av på alle `tk_`-tabeller. Hvem som helst med anon-nøkkelen kan lese og skrive. For en lukket vennegjeng er det greit, men ikke del nøkkelen offentlig hvis du er nervøs for at noen tukler med tippene.

PIN hashes med SHA-256 og salt. Det er ikke militær sikkerhet — to spillere med samme PIN får samme hash, og en med tabellen kan brute-force korte PINs. For VM-tipping i en vennegjeng holder det.
