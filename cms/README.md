# Desken

**Desken** er et fleksibelt, moderne publiseringssystem (CMS) for små norske
redaksjoner: lokalaviser, nisjemedier og fagblad. Ett system som forstår
hvordan en norsk redaksjon jobber – fra desken til forsiden.

> Desken is a production-grade CMS for small Norwegian newsrooms, built with
> Next.js 16, PostgreSQL (Drizzle ORM, embedded PGlite for zero-config dev),
> TipTap and Tailwind 4. Norwegian UI, Norwegian full-text search, editorial
> workflow, front-page editing, plus-articles, live blogs, public API and a
> press-ethics (Vær Varsom) checklist built in.

## Hva du får

| Område | Innhold |
| --- | --- |
| **Skriving** | Rik teksteditor (TipTap) med bilder, gallerier, faktabokser, sitater, embeds (YouTube, Vimeo, NRK, X, Instagram …), tabeller og relaterte saker. Autolagring, versjonshistorikk med diff, redigeringslås, konfliktvarsel, ordtelling og lesetid. |
| **Desken** | Arbeidsflyt Utkast → Til gjennomsyn → Godkjent → Planlagt → Publisert → Avpublisert → Arkivert. Roller (admin, redaktør, journalist, frilanser, leser). Notater, tildeling, frister, redaksjonsplan med kalender, varsler. |
| **Forside** | Dra-og-slipp-editor for forside og seksjonsforsider: hero, topplistene, seksjonsstrømmer, mest lest, meninger, direkte, pluss, annonseplasser. Manuell pinning + automatisk utfylling med deduplisering. |
| **Innhold** | Seksjoner (med underseksjoner), stikkord, skribenter (inkl. byråer som NTB), innholdstyper med egendefinerte felt (Artikkel, Kommentar/Leder, Notis, Nekrolog, Arrangement – og dine egne). |
| **Media** | Opplasting med typesniffing, EXIF-fjerning, responsive WebP-varianter, fokuspunkt, bildetekst/kreditering/alt-tekst, mediebibliotek med søk, mapper og papirkurv. Lokal disk eller S3. |
| **Offentlig nettsted** | Rask, tilgjengelig og SEO-klar: tema fra innstillinger, JSON-LD (NewsArticle), Open Graph, RSS per seksjon, sitemap, robots, søk med norsk stemming, pluss-teaser, «Annonsørinnhold»-merking, direktesending med polling, utskriftsstil, personvern og redaksjonelle opplysninger i bunnen (ansvarlig redaktør, utgiver, org.nr, PFU/Vær Varsom). |
| **Presseetikk** | Konfigurerbar sjekkliste før publisering med referanser til Vær Varsom-plakaten (samtidig imøtegåelse 4.14, dekning i tittel 4.4, kreditering 4.10 …). Påkrevde punkter blokkerer publisering. |
| **Integrasjoner** | Offentlig JSON-API (`/api/v1`) med API-nøkler, webhooks med HMAC-signatur og retry, planlagt publisering, ekstern cron-endepunkt. |
| **Drift** | Én installasjon kan drive flere aviser (multi-site). Revisjonslogg, brukeradministrasjon med invitasjoner, passordbytte, 2FA (TOTP) med gjenopprettingskoder. Docker-image og Compose-oppsett. |

## Kom i gang på fem minutter

Krav: Node 22 og pnpm 10.

```bash
cd cms
pnpm install
pnpm db:migrate     # oppretter den innebygde databasen (./data/pglite)
pnpm db:seed        # demoavisen «Elvebyen Tidende» med saker, bilder og brukere
pnpm dev
```

Åpne <http://localhost:3000> for nettstedet og <http://localhost:3000/admin>
for redaksjonsverktøyet. Demobrukere (passord `Elvebyen2026!`):

| E-post | Rolle |
| --- | --- |
| redaktor@elvebyen.no | admin (superadmin) |
| vaktsjef@elvebyen.no | redaktør |
| journalist@elvebyen.no | journalist |
| frilans@elvebyen.no | frilanser |

Ingen database, ingen miljøvariabler og ingen eksterne tjenester er
nødvendig for å prøve Desken. Uten `DATABASE_URL` brukes en innebygd
PostgreSQL (PGlite) lagret under `./data`. For produksjon peker du
`DATABASE_URL` til en vanlig PostgreSQL 14+ – se [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Kommandoer

| Kommando | Gjør |
| --- | --- |
| `pnpm dev` | Utviklingsserver |
| `pnpm build` / `pnpm start` | Produksjonsbygg og -server |
| `pnpm typecheck` | TypeScript |
| `pnpm lint` | ESLint |
| `pnpm test` | Enhetstester og integrasjonstester (Vitest, innebygd Postgres i minnet) |
| `pnpm e2e` | Ende-til-ende-tester (Playwright) mot et ferdig bygg |
| `pnpm check` | typecheck + lint + test |
| `pnpm db:migrate` | Kjør migreringer |
| `pnpm db:seed [--force]` | Demoinnhold |
| `pnpm db:reset --yes` | Slett alt, migrer og seed på nytt |
| `pnpm db:generate` | Lag ny migrering etter endring i `src/db/schema.ts` |

## Dokumentasjon

- [docs/SPEC.md](docs/SPEC.md) – produkt- og teknisk spesifikasjon (kontrakten systemet er bygget etter)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) – arkitektur, datamodell og konvensjoner for utviklere
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) – drift: Docker, PostgreSQL, S3, e-post, cron, sikkerhet

## Teknologi

Next.js 16 (App Router, React 19), TypeScript, Tailwind CSS 4, Radix UI,
TipTap 3, Drizzle ORM, PostgreSQL / PGlite, sharp, Zod 4, Vitest, Playwright.

## Lisens

Se repositoriets lisens. Demoinnholdet om «Elvebyen» er fiktivt.
