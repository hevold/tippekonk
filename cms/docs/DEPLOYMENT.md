# Drift og utrulling

Desken er én Node.js-tjeneste (Next.js) pluss en PostgreSQL-database og et
sted å lagre mediefiler. Alt annet er valgfritt.

## Alternativ A: Docker Compose (anbefalt for én server)

```bash
cd cms
cp .env.example .env
# Sett en tilfeldig hemmelighet på minst 32 tegn:
echo "APP_SECRET=$(openssl rand -base64 48)" >> .env
echo "APP_URL=https://www.dinavis.no" >> .env
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" >> .env
docker compose up -d --build
```

Compose starter PostgreSQL 16 og appen. Databasen migreres automatisk ved
oppstart (`AUTO_MIGRATE=true`). Mediefiler lagres i volumet `uploads`
(`/app/data/uploads`). Legg en reverse proxy (Caddy, nginx, Traefik) med TLS
foran port 3000 og sett `TRUST_PROXY=true` (satt i compose).

Første bruker: kjør seed én gang for demoinnhold, eller opprett
administrator direkte:

```bash
# Demoinnhold (Elvebyen Tidende)
docker compose exec app node_modules/.bin/tsx scripts/seed.ts
```

I produksjon anbefales det å seede, logge inn som `redaktor@elvebyen.no`,
opprette egne brukere og et nytt nettsted under *Innstillinger → Nettsteder*,
og deretter slette demonettstedet.

## Alternativ B: Vercel / Node-hosting + administrert Postgres

1. Sett `DATABASE_URL` (Neon, Supabase, RDS, …), `APP_SECRET`, `APP_URL`.
2. Sett `STORAGE_DRIVER=s3` med `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`
   (for R2/MinIO/Scaleway), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` og
   `S3_PUBLIC_URL` (CDN-adresse). Lokal disk er ikke varig på serverløse
   plattformer.
3. Sett `ENABLE_INTERNAL_SCHEDULER=false` og kall `POST /api/cron/tick` med
   `Authorization: Bearer <CRON_SECRET>` hvert minutt fra plattformens cron
   (planlagt publisering og webhooks).
4. Byggkommando `pnpm build`, startkommando `pnpm start`.

## Miljøvariabler

| Variabel | Standard | Beskrivelse |
| --- | --- | --- |
| `DATABASE_URL` | (tom) | PostgreSQL-tilkobling. Tom = innebygd PGlite i `PGLITE_DIR`. |
| `PGLITE_DIR` | `./data/pglite` | Katalog for innebygd database. |
| `AUTO_MIGRATE` | `true` | Kjør migreringer ved oppstart. |
| `APP_SECRET` | – | Påkrevd i produksjon, ≥ 32 tegn. Brukes til kryptering av 2FA-hemmeligheter og tokens. |
| `APP_URL` | `http://localhost:3000` | Offentlig adresse (absolutte lenker, e-post, Secure-cookies). |
| `STORAGE_DRIVER` | `local` | `local` eller `s3`. |
| `UPLOAD_DIR` | `./data/uploads` | Rot for lokal lagring. |
| `S3_*` | – | Bøtte, region, endepunkt, nøkler, offentlig URL. |
| `SMTP_URL` | (tom) | `smtp://bruker:passord@host:587`. Tom = e-post logges til konsollen. |
| `MAIL_FROM` | `Desken <no-reply@localhost>` | Avsender. |
| `ENABLE_INTERNAL_SCHEDULER` | `true` | Intern planlegger (30 s). |
| `CRON_SECRET` | – | Beskytter `/api/cron/tick`. |
| `TRUST_PROXY` | `false` | Stol på `X-Forwarded-*` bak reverse proxy. |
| `LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error`. |

## Flere aviser på én installasjon

Under *Innstillinger → Nettsteder* (superadmin) oppretter du flere
nettsteder. Hvert nettsted har egne domener (`sites.domains`); pek DNS for
alle domener til samme tjeneste. Brukere får medlemskap og rolle per
nettsted og bytter aktivt nettsted øverst i admin.

## Sikkerhet i drift

- Kjør alltid bak TLS. Cookies settes med `Secure` når `APP_URL` er https.
- `APP_SECRET` må være hemmelig og stabil; bytte gjør eksisterende
  2FA-oppsett ugyldige.
- Innlogging er ratebegrenset per prosess. Bak en lastbalanserer med flere
  instanser bør du i tillegg begrense på proxy-nivå.
- Ta jevnlig backup av databasen (`pg_dump`) og mediekatalogen/bøtta.
- `/api/health` svarer 200 når databasen er tilgjengelig – bruk den i
  helsesjekker.
- Opplastinger typesjekkes (ingen SVG), EXIF fjernes og filer serveres med
  riktig `Content-Type` og uforanderlig caching.

## Oppgradering

```bash
git pull
pnpm install --frozen-lockfile
pnpm build
# migreringer kjøres ved oppstart, eller manuelt:
pnpm db:migrate
pnpm start
```

Migreringer ligger i `drizzle/` og kjøres i rekkefølge, idempotent.

## Ekstern cron i stedet for intern planlegger

```
* * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://www.dinavis.no/api/cron/tick
```

Svaret inneholder antall publiserte saker og leverte webhooks.
