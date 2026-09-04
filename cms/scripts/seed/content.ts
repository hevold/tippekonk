/**
 * Seed content for the fictional local newspaper "Elvebyen Tidende":
 * sections, content types, tags, authors and ~24 articles with rich bodies.
 * Everything here is invented; Elvebyen does not exist.
 */
import type { ArticleStatus, BylineRole, FieldDef } from '@/db/schema';
import type { ContentDoc } from '@/lib/content/types';

import {
  blockquote,
  bold,
  doc,
  factbox,
  h2,
  h3,
  image,
  italic,
  link,
  liveBlogNode,
  ol,
  p,
  pullquote,
  related,
  ul,
  youtube,
  type ImageRef,
} from './doc';

/* -------------------------------------------------------------------------- */
/*  Users, authors, sections, content types, tags                              */
/* -------------------------------------------------------------------------- */

export const DEMO_PASSWORD = 'Elvebyen2026!';

export type UserKey = 'marit' | 'jonas' | 'ingrid' | 'ola';
export type AuthorKey = UserKey | 'ntb';

export const USERS: {
  key: UserKey;
  email: string;
  name: string;
  role: 'admin' | 'editor' | 'journalist' | 'contributor';
  isSuperadmin: boolean;
  title: string;
  bio: string;
  phone: string;
}[] = [
  {
    key: 'marit',
    email: 'redaktor@elvebyen.no',
    name: 'Marit Solheim',
    role: 'admin',
    isSuperadmin: true,
    title: 'Ansvarlig redaktør',
    bio: 'Marit har ledet Elvebyen Tidende siden 2019 og skriver lederartiklene. Tidligere reporter i regionavisen.',
    phone: '900 10 001',
  },
  {
    key: 'jonas',
    email: 'vaktsjef@elvebyen.no',
    name: 'Jonas Berg',
    role: 'editor',
    isSuperadmin: false,
    title: 'Vaktsjef',
    bio: 'Jonas styrer desken og forsiden. Dekker politikk og samferdsel når han ikke redigerer andres saker.',
    phone: '900 10 002',
  },
  {
    key: 'ingrid',
    email: 'journalist@elvebyen.no',
    name: 'Ingrid Haugen',
    role: 'journalist',
    isSuperadmin: false,
    title: 'Journalist',
    bio: 'Ingrid dekker skole, oppvekst og næringsliv i Elvebyen. Har jobbet i avisen siden 2022.',
    phone: '900 10 003',
  },
  {
    key: 'ola',
    email: 'frilans@elvebyen.no',
    name: 'Ola Vik',
    role: 'contributor',
    isSuperadmin: false,
    title: 'Frilansjournalist',
    bio: 'Ola skriver om idrett og friluftsliv på frilansbasis, og er trener for Elvebyen ILs G14-lag.',
    phone: '900 10 004',
  },
];

export const AGENCY_AUTHOR = {
  key: 'ntb' as const,
  name: 'NTB',
  slug: 'ntb',
  title: 'Nyhetsbyrå',
  bio: 'Stoff fra Norsk Telegrambyrå.',
};

export type SectionKey = 'nyheter' | 'sport' | 'kultur' | 'meninger' | 'naeringsliv' | 'debatt';

export const SECTIONS: {
  key: SectionKey;
  name: string;
  slug: string;
  description: string;
  color: string;
  parent?: SectionKey;
  showInMenu: boolean;
}[] = [
  {
    key: 'nyheter',
    name: 'Nyheter',
    slug: 'nyheter',
    description: 'Lokale nyheter fra Elvebyen og omegn.',
    color: '#0b3d91',
    showInMenu: true,
  },
  {
    key: 'sport',
    name: 'Sport',
    slug: 'sport',
    description: 'Idretten i Elvebyen – fra knøttecup til seriespill.',
    color: '#166534',
    showInMenu: true,
  },
  {
    key: 'kultur',
    name: 'Kultur',
    slug: 'kultur',
    description: 'Kulturliv, arrangementer og folk i Elvebyen.',
    color: '#7e22ce',
    showInMenu: true,
  },
  {
    key: 'meninger',
    name: 'Meninger',
    slug: 'meninger',
    description: 'Ledere, kommentarer og debatt.',
    color: '#b91c1c',
    showInMenu: true,
  },
  {
    key: 'naeringsliv',
    name: 'Næringsliv',
    slug: 'naeringsliv',
    description: 'Bedrifter, arbeidsplasser og handel i Elvebyen.',
    color: '#0e7490',
    showInMenu: true,
  },
  {
    key: 'debatt',
    name: 'Debatt',
    slug: 'debatt',
    description: 'Leserinnlegg og debatt.',
    color: '#c2410c',
    parent: 'meninger',
    showInMenu: false,
  },
];

export type ContentTypeKey = 'article' | 'opinion' | 'notice' | 'obituary' | 'event';

export const CONTENT_TYPES: {
  key: ContentTypeKey;
  name: string;
  description: string;
  icon: string;
  template: string;
  isDefault: boolean;
  fields: FieldDef[];
}[] = [
  {
    key: 'article',
    name: 'Artikkel',
    description: 'Vanlig nyhetssak eller reportasje.',
    icon: 'FileText',
    template: 'article',
    isDefault: true,
    fields: [],
  },
  {
    key: 'opinion',
    name: 'Kommentar/Leder',
    description: 'Meningsstoff: leder, kommentar eller debattinnlegg.',
    icon: 'MessageSquareQuote',
    template: 'opinion',
    isDefault: false,
    fields: [
      {
        key: 'standpoint',
        label: 'Standpunkt',
        type: 'select',
        required: true,
        help: 'Vises som merkelapp over tittelen.',
        options: [
          { value: 'leder', label: 'Leder' },
          { value: 'kommentar', label: 'Kommentar' },
          { value: 'debatt', label: 'Debattinnlegg' },
          { value: 'kronikk', label: 'Kronikk' },
        ],
        default: 'kommentar',
        showInList: true,
      },
    ],
  },
  {
    key: 'notice',
    name: 'Notis',
    description: 'Kort melding uten ingress og bilde.',
    icon: 'StickyNote',
    template: 'notice',
    isDefault: false,
    fields: [],
  },
  {
    key: 'obituary',
    name: 'Nekrolog',
    description: 'Minneord med fødsels- og dødsdato.',
    icon: 'Flower2',
    template: 'article',
    isDefault: false,
    fields: [
      { key: 'born', label: 'Født', type: 'date', required: true, showInList: false },
      { key: 'died', label: 'Død', type: 'date', required: true, showInList: false },
    ],
  },
  {
    key: 'event',
    name: 'Arrangement',
    description: 'Konsert, møte eller annet arrangement med tid og sted.',
    icon: 'CalendarDays',
    template: 'article',
    isDefault: false,
    fields: [
      { key: 'startsAt', label: 'Starter', type: 'datetime', required: true, showInList: true },
      { key: 'venue', label: 'Sted', type: 'text', required: true, placeholder: 'F.eks. Elvebyen kulturhus', showInList: true },
      { key: 'ticketUrl', label: 'Billettlenke', type: 'url', required: false, showInList: false },
    ],
  },
];

export const TAGS: { name: string; slug: string; description?: string }[] = [
  { name: 'Kommunestyret', slug: 'kommunestyret', description: 'Saker fra kommunestyret i Elvebyen.' },
  { name: 'Budsjett 2027', slug: 'budsjett-2027' },
  { name: 'Skole', slug: 'skole' },
  { name: 'Samferdsel', slug: 'samferdsel' },
  { name: 'Elvebyen IL', slug: 'elvebyen-il' },
  { name: 'Håndball', slug: 'handball' },
  { name: 'Friluftsliv', slug: 'friluftsliv' },
  { name: 'Elvefestivalen', slug: 'elvefestivalen' },
  { name: 'Kulturhuset', slug: 'kulturhuset' },
  { name: 'Arbeidsplasser', slug: 'arbeidsplasser' },
  { name: 'Bolig', slug: 'bolig' },
  { name: 'Klima og miljø', slug: 'klima-og-miljo' },
  { name: 'Havna', slug: 'havna' },
  { name: 'Flom', slug: 'flom' },
  { name: 'Torget', slug: 'torget' },
  { name: 'Gamlebrua', slug: 'gamlebrua' },
];

/* -------------------------------------------------------------------------- */
/*  Articles                                                                   */
/* -------------------------------------------------------------------------- */

export type BodyContext = {
  /** Article key → uuid, for related articles. */
  ids: Record<string, string>;
  /** Image key → media reference, for image nodes. */
  images: Record<string, ImageRef>;
  liveBlogId: string;
};

export type ArticleSpec = {
  key: string;
  title: string;
  kicker?: string;
  lead: string;
  section: SectionKey | null;
  contentType: ContentTypeKey;
  status: ArticleStatus;
  access?: 'open' | 'plus';
  isBreaking?: boolean;
  isSponsored?: boolean;
  /** Days before "now" for publishedAt (published/unpublished/archived) or updatedAt (others). */
  daysAgo: number;
  /** Hour of day (Europe/Oslo-ish, used as UTC offset for simplicity). */
  hour: number;
  image: string | null;
  featuredCaption?: string;
  tags: string[];
  bylines: { author: AuthorKey; role?: BylineRole }[];
  createdBy: UserKey;
  customFields?: Record<string, unknown>;
  seoDescription?: string;
  /** Extra manual revisions to create (title variants) before the current version. */
  revisionTitles?: string[];
  /** Scheduled publish time offset in days from now (status 'scheduled'). */
  scheduleInDays?: number;
  relatedKeys?: string[];
  body: (ctx: BodyContext) => ContentDoc;
};

const OSLO_TIP = 'tips@elvebyen.no';

export const ARTICLES: ArticleSpec[] = [
  /* ------------------------------------------------------------------ */
  /*  Nyheter                                                            */
  /* ------------------------------------------------------------------ */
  {
    key: 'budsjett',
    kicker: 'Kommunestyret',
    title: 'Budsjettet vedtatt: Ny svømmehall, men eiendomsskatten øker',
    lead: 'Etter seks timers debatt vedtok kommunestyret i Elvebyen torsdag kveld et budsjett som gir byen ny svømmehall i 2028 – og en eiendomsskatt som øker med 1,2 promille.',
    section: 'nyheter',
    contentType: 'article',
    status: 'published',
    isBreaking: true,
    daysAgo: 0,
    hour: 21,
    image: 'raadhus',
    featuredCaption: 'Kommunestyret i Elvebyen vedtok budsjettet for 2027 med 21 mot 14 stemmer.',
    tags: ['kommunestyret', 'budsjett-2027'],
    bylines: [{ author: 'jonas' }, { author: 'ingrid' }],
    createdBy: 'jonas',
    seoDescription: 'Kommunestyret i Elvebyen vedtok budsjettet for 2027: ny svømmehall i 2028 og økt eiendomsskatt.',
    revisionTitles: ['Kommunestyret behandler budsjettet', 'Budsjettet vedtatt etter seks timers debatt'],
    relatedKeys: ['leder-budsjett', 'svommehall'],
    body: (ctx) =>
      doc(
        p('Klokka 20.42 torsdag kveld kunne ordfører Kari Brekke (Ap) banke gjennom budsjettet for 2027. Vedtaket kom etter en debatt som startet klokka 15, og som til tider ble så opphetet at ordføreren måtte be representantene om å «senke temperaturen og heve nivået».'),
        p(['Flertallet bak budsjettet består av Arbeiderpartiet, Senterpartiet og Kristelig Folkeparti. Høyre, Fremskrittspartiet og Elvebyen Bylist stemte imot. ', bold('21 mot 14'), ' ble resultatet.']),
        liveBlogNode(ctx.liveBlogId),
        h2('Svømmehallen kommer i 2028'),
        p('Det største enkeltprosjektet i budsjettet er en ny svømmehall på Bekkelund, med byggestart høsten 2027 og planlagt åpning i august 2028. Prislappen er 186 millioner kroner, hvorav 40 millioner er forutsatt dekket av spillemidler.'),
        blockquote(
          '– Dette er en investering i folkehelse og i barna våre. Elvebyen har ventet på en svømmehall siden den gamle ble stengt i 2021, og nå kommer den, sa Brekke fra talerstolen.',
        ),
        image(ctx.images.raadhus!, { caption: 'Rådhuset i Elvebyen var fullsatt under budsjettdebatten torsdag.' }),
        h2('Eiendomsskatten øker'),
        p('For å finansiere svømmehallen og økte kostnader i eldreomsorgen øker eiendomsskatten fra 2,8 til 4,0 promille. For en bolig med skattegrunnlag på 3 millioner kroner betyr det om lag 3 600 kroner mer i året.'),
        p('Høyres gruppeleder Erik Nordvik kalte økningen «et løftebrudd».'),
        pullquote('Dette er den største skatteøkningen i Elvebyens historie, og den kommer uten at tjenestene blir bedre.', 'Erik Nordvik (H)'),
        factbox(
          'Dette er hovedpunktene i budsjettet',
          ul([
            'Ny svømmehall på Bekkelund: 186 millioner kroner, ferdig 2028',
            'Eiendomsskatt øker fra 2,8 til 4,0 promille',
            '12 nye årsverk i hjemmetjenesten',
            'Rehabilitering av Gamlebrua: 42 millioner kroner',
            'Kulturhuset får 1,5 millioner mer i driftstilskudd',
            'Ingen kutt i skolebudsjettene, men heller ingen ny skole på Bekkelund',
          ]),
        ),
        h2('Skolen må vente'),
        p([
          'Forslaget om å sette av planleggingsmidler til en ny skole på Bekkelund falt med 17 mot 18 stemmer. Bekkelund skole har ',
          link('sprengt kapasiteten', `/nyheter/bekkelund-skole-sprenger-kapasiteten-vi-underviser-i-gangen`),
          ', og FAU-leder Siri Moen var tydelig skuffet etter møtet.',
        ]),
        p('– Politikerne sier de prioriterer barna, men de bygger svømmehall før de bygger klasserom, sier Moen.'),
        p(['Rådmann Petter Aas sier administrasjonen vil legge fram en ny skolebruksplan i mars. Tips oss på ', link(OSLO_TIP, `mailto:${OSLO_TIP}`), ' hvis du har innspill til saken.']),
        related([ctx.ids.leder_budsjett!, ctx.ids.svommehall!, ctx.ids.skole_elevtall!]),
      ),
  },
  {
    key: 'skole_elevtall',
    kicker: 'Skole',
    title: 'Bekkelund skole sprenger kapasiteten: – Vi underviser i gangen',
    lead: 'Elevtallet ved Bekkelund skole har økt med 23 prosent på tre år. Nå brukes både gangen og musikkrommet som klasserom, og rektor ber kommunen om en løsning før neste skoleår.',
    section: 'nyheter',
    contentType: 'article',
    status: 'published',
    daysAgo: 2,
    hour: 7,
    image: 'skole',
    tags: ['skole', 'kommunestyret'],
    bylines: [{ author: 'ingrid' }],
    createdBy: 'ingrid',
    relatedKeys: ['debatt_skole', 'budsjett'],
    body: (ctx) =>
      doc(
        p('Det er tirsdag morgen, og 7B har mattetime i gangen utenfor lærerværelset. To bord er skjøvet sammen under en tavle på hjul. Hver gang noen skal på do, går de gjennom klasserommet.'),
        p('– Vi gjør det beste ut av det, men det er ikke slik en skole skal være, sier rektor Anne-Lise Fjeld.'),
        h2('Fra 312 til 384 elever'),
        p('Da Bekkelund skole ble bygd i 1994, var den dimensjonert for 320 elever. I dag går det 384 elever på skolen, og prognosene fra kommunen viser at tallet passerer 420 innen 2029. Årsaken er de nye boligfeltene på Bekkelund sør og Furuhaugen.'),
        image(ctx.images.skole!),
        ul([
          '2023: 312 elever',
          '2024: 341 elever',
          '2025: 366 elever',
          '2026: 384 elever',
          'Prognose 2029: 421 elever',
        ]),
        h2('Musikkrommet er blitt klasserom'),
        p('Musikkrommet i kjelleren ble gjort om til klasserom i august. Musikkundervisningen foregår nå i gymsalen, som dermed er opptatt tre timer ekstra i uka.'),
        pullquote('Vi har ikke et eneste rom som står tomt i løpet av en skoledag.', 'Anne-Lise Fjeld, rektor'),
        p('Kommunalsjef for oppvekst, Torbjørn Lie, sier kommunen kjenner situasjonen godt.'),
        blockquote('– Vi jobber med en ny skolebruksplan som skal legges fram i mars. Modulbygg er ett av alternativene på kort sikt, sier Lie.'),
        factbox(
          'Bekkelund skole',
          ul(['Barneskole 1.–7. trinn', 'Bygd 1994, utvidet 2008', 'Dimensjonert for 320 elever', '384 elever skoleåret 2026/27', '31 ansatte']),
        ),
        related([ctx.ids.debatt_skole!, ctx.ids.budsjett!]),
      ),
  },
  {
    key: 'gamlebrua',
    kicker: 'Samferdsel',
    title: 'Gamlebrua stenges i åtte måneder',
    lead: 'Fra 1. november er Gamlebrua stengt for all trafikk. Bilister må kjøre om Nybrua, mens gående og syklende får en midlertidig gangbru.',
    section: 'nyheter',
    contentType: 'article',
    status: 'published',
    daysAgo: 3,
    hour: 12,
    image: 'bro',
    tags: ['samferdsel', 'gamlebrua'],
    bylines: [{ author: 'jonas' }],
    createdBy: 'jonas',
    relatedKeys: ['kommentar_bro'],
    body: (ctx) =>
      doc(
        p('Rehabiliteringen av Gamlebrua fra 1911 starter 1. november og skal etter planen være ferdig til 17. mai 2027. Brua har vært i dårlig stand siden en inspeksjon i 2023 avdekket sprekker i to av bærebjelkene.'),
        image(ctx.images.bro!),
        h2('Slik blir omkjøringen'),
        ol([
          'Biltrafikk ledes over Nybrua via Fabrikkveien.',
          'Bussrute 1 og 3 kjører Fabrikkveien og stopper ikke på Bruplassen.',
          'Gående og syklende bruker en midlertidig gangbru 40 meter nedstrøms.',
          'Utrykningskjøretøy kan bruke gangbrua i nødstilfeller.',
        ]),
        p('Kommunen anslår at omkjøringen gir fem til åtte minutter ekstra reisetid i rushtida.'),
        h2('42 millioner kroner'),
        p('Arbeidet koster 42 millioner kroner og utføres av Brubygg AS fra Lillehammer. Kommunen betaler 30 millioner, mens fylkeskommunen dekker resten.'),
        blockquote('– Vi skjønner at dette er en belastning, men alternativet er en bru vi ikke kan garantere at er trygg, sier teknisk sjef Hanne Stormo.'),
        factbox(
          'Gamlebrua',
          p('Bygd i 1911 som jernbanebru, ombygd til veibru i 1962. 84 meter lang. Fredet av Riksantikvaren i 1998. Daglig trafikk: om lag 4 200 kjøretøy.'),
        ),
        related([ctx.ids.kommentar_bro!, ctx.ids.elbuss!]),
      ),
  },
  {
    key: 'elbuss',
    kicker: 'Kollektivtrafikk',
    title: 'Alle bybussene i Elvebyen kjører på strøm fra nyttår',
    lead: 'De siste sju dieselbussene byttes ut i desember. Dermed blir Elvebyen den første kommunen i fylket med helelektrisk bybussflåte.',
    section: 'nyheter',
    contentType: 'article',
    status: 'published',
    daysAgo: 5,
    hour: 9,
    image: 'buss',
    tags: ['samferdsel', 'klima-og-miljo'],
    bylines: [{ author: 'jonas' }, { author: 'ntb', role: 'other' }],
    createdBy: 'jonas',
    body: (ctx) =>
      doc(
        p('Fylkeskommunen og operatøren Elvebuss AS bekreftet mandag at de siste sju dieselbussene på rutene 1–4 erstattes av elektriske busser fra 1. januar. Totalt 19 elbusser vil da trafikkere bybussrutene.'),
        image(ctx.images.buss!),
        p('– Dette har vi jobbet mot siden 2022. Bussene er stillere, renere og billigere i drift, sier daglig leder Mona Rui i Elvebuss.'),
        h2('Ladeanlegg på busstasjonen'),
        p('Et nytt ladeanlegg med tolv ladepunkter er bygd på busstasjonen. Bussene lades om natta og hurtiglades ved behov i løpet av dagen.'),
        youtube('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Se de nye bussene i drift'),
        factbox(
          'Elbussene i tall',
          ul(['19 elektriske busser fra nyttår', 'Rekkevidde: ca. 300 km per lading', 'Utslippskutt: 620 tonn CO₂ per år', '12 ladepunkter på busstasjonen']),
        ),
        p([italic('Saken er oppdatert med tall fra fylkeskommunen. '), 'Kilde: Fylkeskommunen og NTB.']),
      ),
  },
  {
    key: 'havn_fisk',
    kicker: 'Havna',
    title: 'Havna lever: Åtte båter leverte rekordfangst i august',
    lead: 'Fiskemottaket på Elvebyen havn tok imot 214 tonn i august – det høyeste tallet på tolv år.',
    section: 'nyheter',
    contentType: 'article',
    status: 'published',
    daysAgo: 22,
    hour: 14,
    image: 'havn',
    tags: ['havna', 'arbeidsplasser'],
    bylines: [{ author: 'ingrid' }],
    createdBy: 'ingrid',
    body: (ctx) =>
      doc(
        p('Da mottaket på havna nesten ble lagt ned i 2019, var det få som trodde det skulle bli rekord sju år senere. Men i august leverte de åtte båtene som har Elvebyen som hjemmehavn til sammen 214 tonn sei, hyse og torsk.'),
        image(ctx.images.havn!),
        p('– Det har vært et uvanlig godt år. Seien har stått tett utenfor Skjæret hele sommeren, sier skipper Roald Vangen på «Elvebyværingen».'),
        h2('Ny generasjon'),
        p('Tre av båtene har fått nye eiere under 35 år de siste to årene. Kommunen har bidratt med et rekrutteringsfond på to millioner kroner.'),
        pullquote('Jeg trodde aldri jeg skulle få lov til å leve av fiske i hjembyen min.', 'Mari Vangen (28), skipper'),
        factbox('Fiskemottaket i Elvebyen', p('Etablert 1952. Eies av Elvebyen Fiskarlag. Fem ansatte. Tok imot 1 340 tonn i 2025.')),
      ),
  },
  {
    key: 'parkering',
    kicker: 'Sentrum',
    title: 'Parkeringsavgiften i sentrum dobles fra oktober',
    lead: 'Fra 1. oktober koster det 40 kroner timen å parkere på Torget og i Storgata. Saken er avpublisert i påvente av korrekte tall fra kommunen.',
    section: 'nyheter',
    contentType: 'article',
    status: 'unpublished',
    daysAgo: 11,
    hour: 10,
    image: 'marked',
    tags: ['torget', 'samferdsel'],
    bylines: [{ author: 'ola' }],
    createdBy: 'ola',
    body: () =>
      doc(
        p('Kommunen har vedtatt å øke parkeringsavgiften i sentrum fra 20 til 40 kroner timen. Endringen gjelder fra 1. oktober.'),
        p('Merk: Kommunen har i ettertid opplyst at vedtaket gjelder 30 kroner, ikke 40. Saken er trukket tilbake til tallene er bekreftet.'),
      ),
  },
  {
    key: 'kvernfossen_flom',
    kicker: 'Flomvarsel',
    title: 'Oransje flomvarsel for Elva: Kvernfossen nær rekordnivå',
    lead: 'NVE har sendt ut oransje flomvarsel for Elva etter fem dager med regn. Kommunen ber folk holde seg unna elvebredden.',
    section: 'nyheter',
    contentType: 'article',
    status: 'archived',
    daysAgo: 27,
    hour: 16,
    image: 'elv',
    tags: ['flom', 'klima-og-miljo'],
    bylines: [{ author: 'jonas' }, { author: 'ntb', role: 'other' }],
    createdBy: 'jonas',
    body: (ctx) =>
      doc(
        p('Vannføringen i Elva var søndag ettermiddag 410 kubikkmeter i sekundet ved Kvernfossen, ifølge NVE. Rekorden fra 2014 er 445.'),
        image(ctx.images.elv!),
        p('Kommunens kriseledelse er satt, og beredskapen er hevet. Gangveien langs elva mellom Gamlebrua og Kvernfossen er stengt.'),
        ul(['Hold avstand til elvebredden', 'Flytt verdier opp fra kjellere i flomutsatte områder', 'Ikke kjør gjennom vann på veien']),
        p('Saken ble arkivert da flomvarselet ble opphevet.'),
      ),
  },
  {
    key: 'vann_notis',
    title: 'Vannet stenges i Nedre gate torsdag',
    lead: 'Vannforsyningen i Nedre gate og Bruplassen stenges torsdag klokka 09–14 på grunn av arbeid på hovedledningen.',
    section: 'nyheter',
    contentType: 'notice',
    status: 'draft',
    daysAgo: 1,
    hour: 15,
    image: null,
    tags: [],
    bylines: [{ author: 'jonas' }],
    createdBy: 'jonas',
    body: () =>
      doc(
        p('Elvebyen kommune melder at vannet stenges i Nedre gate 1–37 og på Bruplassen torsdag mellom klokka 09.00 og 14.00. Årsaken er utskifting av en ventil på hovedledningen.'),
        p('Beboere bes tappe opp vann på forhånd. Vannet kan være misfarget en stund etter at det er satt på igjen.'),
      ),
  },
  {
    key: 'svommehall',
    kicker: 'Svømmehallen',
    title: 'Slik blir den nye svømmehallen på Bekkelund',
    lead: 'Et 25-meters basseng, terapibasseng og badeland for de minste. Vi har sett tegningene til svømmehallen som skal stå ferdig i 2028.',
    section: 'nyheter',
    contentType: 'article',
    status: 'draft',
    daysAgo: 0,
    hour: 22,
    image: 'skole',
    tags: ['kommunestyret', 'budsjett-2027'],
    bylines: [{ author: 'ingrid' }],
    createdBy: 'ingrid',
    body: (ctx) =>
      doc(
        p('Tegningene fra arkitektkontoret Nordlys viser en svømmehall på 4 200 kvadratmeter plassert mellom Bekkelund skole og idrettshallen.'),
        h2('Dette får du'),
        ul(['25-meters basseng med åtte baner', 'Terapibasseng på 34 grader', 'Barnebasseng med sklie', 'Badstue og garderober for 200']),
        p('(Utkast – mangler sitater fra prosjektleder og illustrasjoner.)'),
        related([ctx.ids.budsjett!]),
      ),
  },

  /* ------------------------------------------------------------------ */
  /*  Sport                                                              */
  /* ------------------------------------------------------------------ */
  {
    key: 'fotball_seier',
    kicker: 'Fotball',
    title: 'Elvebyen IL snudde kampen på overtid: – Helt vilt',
    lead: 'Elvebyen IL lå under 0–2 med ti minutter igjen. Så scoret Sander Moe tre ganger på elleve minutter, og serieledelsen er tilbake.',
    section: 'sport',
    contentType: 'article',
    status: 'published',
    daysAgo: 1,
    hour: 18,
    image: 'fotball',
    featuredCaption: 'Sander Moe jubler etter sitt tredje mål på Elvebyen stadion lørdag.',
    tags: ['elvebyen-il'],
    bylines: [{ author: 'ola' }, { author: 'ola', role: 'photo' }],
    createdBy: 'ola',
    revisionTitles: ['Elvebyen IL snudde kampen på overtid'],
    body: (ctx) =>
      doc(
        p(['Elvebyen IL – Fjellstad 3–2 (0–1)']),
        p('Det så mørkt ut for hjemmelaget da Fjellstad økte til 2–0 i det 79. minutt. Men Sander Moe hadde andre planer.'),
        image(ctx.images.fotball!),
        h2('Hat-trick på elleve minutter'),
        p('Første mål kom på et hjørnespark i det 81. minutt. Utligningen fire minutter senere var et suserskudd fra 18 meter. Og på overtid, i det 92. minutt, stupte Moe inn vinnermålet etter innlegg fra Ahmed Said.'),
        blockquote('– Helt vilt. Jeg husker nesten ikke det siste målet, bare at det ble helt stille et halvt sekund før alt eksploderte, sier Moe.'),
        pullquote('Dette laget gir seg aldri. Det er det som gjør at vi leder serien.', 'Trener Tove Lund'),
        h2('Tabellen'),
        p('Elvebyen IL har nå 41 poeng etter 19 kamper, tre poeng foran Fjellstad. Neste kamp er borte mot Dalsbygda søndag.'),
        factbox('Kampfakta', ul(['Elvebyen stadion, 1 240 tilskuere', 'Mål: 0–1 Bakke (34), 0–2 Holm (79), 1–2 Moe (81), 2–2 Moe (85), 3–2 Moe (90+2)', 'Gult kort: Said (E), Bakke (F)', 'Dommer: Ali Rezai, Hamar'])),
        related([ctx.ids.handball_jenter!]),
      ),
  },
  {
    key: 'handball_jenter',
    kicker: 'Håndball',
    title: 'Elvebyen J16 til NM-sluttspill for første gang',
    lead: 'Etter 27–24 over Byåsen søndag er Elvebyen ILs jenter 16 klare for NM-sluttspillet i Oslo i november.',
    section: 'sport',
    contentType: 'article',
    status: 'published',
    daysAgo: 7,
    hour: 19,
    image: 'kulturhus',
    tags: ['elvebyen-il', 'handball'],
    bylines: [{ author: 'ola' }],
    createdBy: 'ola',
    body: (ctx) =>
      doc(
        p('Elvebyhallen kokte da sluttsignalet gikk søndag ettermiddag. For første gang i klubbens historie skal et jentelag fra Elvebyen spille sluttspill i NM.'),
        p('– Vi har jobbet for dette i tre år. Jentene fortjener alt, sier trener Nina Solberg.'),
        h2('Snudde etter pause'),
        p('Byåsen ledet 13–11 ved pause, men en 6–0-periode midt i andre omgang avgjorde kampen. Keeper Ida Rustad reddet tolv skudd.'),
        ul(['Toppscorer: Emma Lie, 9 mål', 'Redninger: Ida Rustad, 12', 'Tilskuere: 610']),
        pullquote('Vi skal til Oslo for å vinne kamper, ikke for å se på.', 'Emma Lie'),
        related([ctx.ids.fotball_seier!]),
      ),
  },
  {
    key: 'lysloype',
    kicker: 'Friluftsliv',
    title: 'Storåsen får lysløype – slik blir traseen',
    lead: 'Fem kilometer med LED-lys fra Bekkelund til toppen av Storåsen. Vi har gått traseen med dugnadsgjengen som har jobbet for lysløypa i ti år.',
    section: 'sport',
    contentType: 'article',
    status: 'published',
    access: 'plus',
    daysAgo: 12,
    hour: 8,
    image: 'skog',
    tags: ['friluftsliv', 'elvebyen-il'],
    bylines: [{ author: 'ola' }, { author: 'ola', role: 'photo' }],
    createdBy: 'ola',
    body: (ctx) =>
      doc(
        p('Arne Kvernmo skulle ha vært her i dag. Skigruppas grand old man døde i august, ett år før lysløypa han kjempet for i et tiår blir tent.'),
        p('– Han visste at den kom. Det var det viktigste for ham, sier leder i skigruppa, Bente Aasen.'),
        image(ctx.images.skog!),
        h2('Fem kilometer, 118 lyspunkter'),
        p('Traseen starter ved parkeringsplassen på Bekkelund, følger den gamle skogsbilveien til Myrtjernet og går derfra i slak stigning opp til toppen på 412 meter. Underveis passerer den to gapahuker og den nye varmestua ved Myrtjernet.'),
        ol(['Bekkelund P – Myrtjernet: 2,1 km, slakt', 'Myrtjernet – Storåsen topp: 2,9 km, 190 høydemeter', 'Retur samme vei eller via Furuhaugen (ikke lys)']),
        h2('Slik ble det finansiert'),
        p('Prosjektet koster 4,8 millioner kroner. Spillemidler dekker 1,6 millioner, kommunen 1,2 millioner, sparebankstiftelsen 800 000, og resten er dugnad og gaver.'),
        pullquote('Vi har lagt 3 400 dugnadstimer i denne løypa. Nå skal vi gå på ski i den.', 'Bente Aasen'),
        factbox('Lysløypa på Storåsen', ul(['Lengde: 5,0 km', 'Lyspunkter: 118 LED-armaturer', 'Lys: 06–23 i vintersesongen', 'Åpning: 1. desember'])),
        related([ctx.ids.nekrolog_kvernmo!]),
      ),
  },
  {
    key: 'storaasen_tips',
    kicker: 'Tur',
    title: 'Ti tips til høstturen på Storåsen',
    lead: 'Høsten er den beste tida på Storåsen. Her er ti tips fra folk som går der hver uke.',
    section: 'sport',
    contentType: 'article',
    status: 'draft',
    daysAgo: 4,
    hour: 11,
    image: 'skog',
    tags: ['friluftsliv'],
    bylines: [{ author: 'ola' }],
    createdBy: 'ola',
    body: () =>
      doc(
        p('Utkast – mangler bilder og intervju med turlaget.'),
        ol(['Gå tidlig – parkeringsplassen er full etter klokka 11 i helgene', 'Ta med hodelykt fra oktober', 'Prøv rundturen via Furuhaugen', 'Ta en pause ved Myrtjernet']),
      ),
  },

  /* ------------------------------------------------------------------ */
  /*  Kultur                                                             */
  /* ------------------------------------------------------------------ */
  {
    key: 'elvefestivalen',
    kicker: 'Elvefestivalen',
    title: 'Elvefestivalen solgte 9 000 billetter: – Det største vi har gjort',
    lead: 'Årets Elvefestival satte publikumsrekord med 9 000 solgte billetter over tre dager. Festivalsjefen lover å komme tilbake i 2027 – på samme sted.',
    section: 'kultur',
    contentType: 'article',
    status: 'published',
    daysAgo: 4,
    hour: 10,
    image: 'kulturhus',
    tags: ['elvefestivalen', 'kulturhuset'],
    bylines: [{ author: 'ingrid' }, { author: 'jonas', role: 'photo' }],
    createdBy: 'ingrid',
    body: (ctx) =>
      doc(
        p('Fredag, lørdag og søndag var elveparken fylt til randen. Ifølge festivalsjef Lars Røed ble det solgt 9 012 billetter, mot 6 400 i fjor.'),
        image(ctx.images.kulturhus!, { size: 'wide' }),
        p('– Det største vi har gjort, og det ble gjennomført uten alvorlige hendelser. Det er jeg mest stolt av, sier Røed.'),
        h2('Lokale artister trakk mest'),
        p('Overraskelsen var at den lokale duoen Elvekanten samlet flest folk foran hovedscenen lørdag, foran headlineren fra Oslo.'),
        youtube('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Elvekanten på hovedscenen'),
        h2('Blir i elveparken'),
        p('Naboene har klaget på støy, og festivalen har vurdert å flytte til Bekkelund. Nå er det avgjort: festivalen blir i elveparken i 2027, men med lavere lydnivå etter klokka 23.'),
        blockquote('– Vi har hatt gode møter med naboene og kommunen. Vi tror vi har funnet en løsning alle kan leve med, sier Røed.'),
        factbox('Elvefestivalen 2026', ul(['9 012 solgte billetter', '31 konserter på tre scener', '210 frivillige', 'Omsetning: ca. 11 millioner kroner'])),
      ),
  },
  {
    key: 'bibliotek',
    title: 'Biblioteket holder åpent til klokka 21',
    lead: 'Fra 1. oktober utvider Elvebyen bibliotek åpningstidene til klokka 21 på hverdager. Meråpent bibliotek innføres samtidig for lånere over 18.',
    section: 'kultur',
    contentType: 'notice',
    status: 'published',
    daysAgo: 9,
    hour: 13,
    image: 'bibliotek',
    tags: ['kulturhuset'],
    bylines: [{ author: 'ingrid' }],
    createdBy: 'ingrid',
    body: (ctx) =>
      doc(
        p('Elvebyen bibliotek utvider åpningstidene fra 1. oktober. Biblioteket er da betjent mandag til fredag klokka 09–21 og lørdag 10–15.'),
        p('Samtidig innføres meråpent bibliotek: Lånere over 18 år kan låse seg inn med lånekort og PIN-kode alle dager klokka 07–23.'),
        image(ctx.images.bibliotek!),
        p('– Vi ser at mange studenter og skiftarbeidere ønsker å bruke biblioteket på kveldstid, sier biblioteksjef Guro Sand.'),
      ),
  },
  {
    key: 'kunstutstilling',
    kicker: 'Kunst',
    title: 'Solveig Brattli stiller ut 40 år med Elva',
    lead: 'Elvebyens mest kjente maler åpner lørdag sin største utstilling noensinne i kulturhuset. 60 bilder – alle av den samme elva.',
    section: 'kultur',
    contentType: 'article',
    status: 'in_review',
    daysAgo: 1,
    hour: 16,
    image: 'elv',
    tags: ['kulturhuset'],
    bylines: [{ author: 'ingrid' }],
    createdBy: 'ingrid',
    body: (ctx) =>
      doc(
        p('– Folk spør om jeg ikke blir lei. Men elva er aldri den samme to dager på rad, sier Solveig Brattli (71).'),
        image(ctx.images.elv!),
        h2('Fra 1986 til i dag'),
        p('Det eldste bildet i utstillingen er malt i 1986, fra brygga nedenfor huset der hun fortsatt bor. Det nyeste ble ferdig forrige uke.'),
        pullquote('Jeg maler ikke elva. Jeg maler lyset som treffer den.', 'Solveig Brattli'),
        p('Utstillingen «Elva – 40 år» åpner lørdag klokka 13 og står til 15. november. Gratis inngang.'),
      ),
  },
  {
    key: 'hostmarked',
    kicker: 'Arrangement',
    title: 'Høstmarked og eplefest på Torget',
    lead: 'Lørdag om to uker fylles Torget med lokale produsenter, eplepressing og gratis konsert for barna.',
    section: 'kultur',
    contentType: 'event',
    status: 'scheduled',
    daysAgo: 0,
    hour: 6,
    scheduleInDays: 1,
    image: 'marked',
    tags: ['torget'],
    bylines: [{ author: 'jonas' }],
    createdBy: 'jonas',
    customFields: {
      venue: 'Torget, Elvebyen sentrum',
      ticketUrl: 'https://example.com/hostmarked',
    },
    body: (ctx) =>
      doc(
        p('Elvebyen handelsstand og Bondens marked inviterer til høstmarked på Torget. Ta med egne epler og få dem presset til most – eller kjøp av de 20 produsentene som kommer.'),
        image(ctx.images.marked!),
        ul(['Klokka 10: Markedet åpner', 'Klokka 12: Eplekonkurranse for barn', 'Klokka 13: Konsert med Elvebyen skolekorps', 'Klokka 15: Markedet stenger']),
        p('Gratis inngang. Parkering på Bruplassen.'),
      ),
  },

  /* ------------------------------------------------------------------ */
  /*  Næringsliv                                                         */
  /* ------------------------------------------------------------------ */
  {
    key: 'trevare',
    kicker: 'Næringsliv',
    title: 'Elvebyen Trevare investerer 60 millioner: 25 nye arbeidsplasser',
    lead: 'Byens største private arbeidsgiver bygger ny produksjonshall og ansetter 25 nye. – Vi satser på Elvebyen, sier daglig leder Kristin Haug.',
    section: 'naeringsliv',
    contentType: 'article',
    status: 'published',
    access: 'plus',
    daysAgo: 6,
    hour: 6,
    image: 'fabrikk',
    tags: ['arbeidsplasser'],
    bylines: [{ author: 'ingrid' }],
    createdBy: 'ingrid',
    body: (ctx) =>
      doc(
        p('Nyheten ble sluppet for de 140 ansatte i kantina onsdag morgen. Elvebyen Trevare bygger en ny produksjonshall på 6 000 kvadratmeter og investerer 60 millioner kroner i en ny linje for prefabrikkerte veggelementer.'),
        image(ctx.images.fabrikk!),
        p('– Vi har vurdert Sverige. Men kompetansen er her, og kommunen har stilt opp med tomt og regulering på rekordtid, sier Haug.'),
        h2('Flere lærlinger'),
        p('Av de 25 nye stillingene er åtte lærlingplasser i samarbeid med Elvebyen videregående skole.'),
        pullquote('Vi trenger unge folk som vil lære et fag. Det er de som skal drive dette stedet om tjue år.', 'Kristin Haug'),
        h2('Slik blir hallen'),
        ol(['Byggestart november 2026', 'Ferdig høsten 2027', 'Produksjonsstart januar 2028']),
        factbox('Elvebyen Trevare AS', ul(['Grunnlagt 1948', '140 ansatte', 'Omsetning 2025: 310 millioner kroner', 'Eid av familien Haug'])),
        related([ctx.ids.havn_fisk!]),
      ),
  },
  {
    key: 'torgdagen',
    kicker: 'Handel',
    title: 'Torgdagen trekker folk fra hele regionen',
    lead: 'Første lørdag i måneden er Torget fullt av boder. Handelsstanden anslår at 3 000 mennesker var innom lørdag.',
    section: 'naeringsliv',
    contentType: 'article',
    status: 'published',
    daysAgo: 14,
    hour: 17,
    image: 'marked',
    tags: ['torget'],
    bylines: [{ author: 'ola' }],
    createdBy: 'ola',
    body: (ctx) =>
      doc(
        p('Ostebonden fra Dalsbygda var utsolgt klokka 12. Honningen fra Furuhaugen var borte en time senere.'),
        image(ctx.images.marked!),
        p('– Vi hadde 34 boder, og flere på venteliste. Torgdagen er blitt den viktigste handledagen i måneden for sentrum, sier leder i handelsstanden, Bjørn Eide.'),
        h2('Omsetningen opp 20 prosent'),
        p('Butikkene rundt Torget melder om 20 prosent høyere omsetning på torgdager sammenlignet med en vanlig lørdag.'),
        blockquote('– Folk kommer fra Fjellstad og Dalsbygda. Det er ikke bare markedet, det er hele byen som lever, sier Eide.'),
      ),
  },
  {
    key: 'sponset_bank',
    kicker: 'Annonsørinnhold fra Elvebyen Sparebank',
    title: 'Slik sparer du smart til første bolig',
    lead: 'Drømmer du om egen bolig i Elvebyen? Rådgiverne i Elvebyen Sparebank deler sine beste tips for å komme i gang med sparingen.',
    section: 'naeringsliv',
    contentType: 'article',
    status: 'published',
    isSponsored: true,
    daysAgo: 8,
    hour: 11,
    image: 'raadhus',
    tags: ['bolig'],
    bylines: [{ author: 'ntb', role: 'other' }],
    createdBy: 'jonas',
    body: (ctx) =>
      doc(
        p([bold('Dette er annonsørinnhold produsert av Elvebyen Sparebank. '), 'Redaksjonen i Elvebyen Tidende har ikke vært involvert i produksjonen.']),
        p('Boligprisene i Elvebyen har steget 12 prosent på to år. Da gjelder det å komme tidlig i gang med sparingen, sier rådgiver Petter Solli.'),
        image(ctx.images.raadhus!, { caption: 'Elvebyen Sparebank holder til ved Torget.' }),
        h2('Tre tips fra rådgiveren'),
        ol(['Start med BSU så tidlig som mulig', 'Sett opp fast trekk den dagen lønna kommer', 'Ta en samtale med banken før du begynner å lete']),
        p('Bestill gratis rådgivningstime på bankens nettsider.'),
      ),
  },

  /* ------------------------------------------------------------------ */
  /*  Meninger og debatt                                                 */
  /* ------------------------------------------------------------------ */
  {
    key: 'leder_budsjett',
    kicker: 'Leder',
    title: 'Et budsjett med for mange løfter',
    lead: 'Kommunestyret vedtok torsdag en svømmehall byen har ventet på i fem år. Regningen sendes til huseierne, og skolebarna på Bekkelund må vente enda lenger.',
    section: 'meninger',
    contentType: 'opinion',
    status: 'published',
    daysAgo: 0,
    hour: 23,
    image: 'raadhus',
    tags: ['kommunestyret', 'budsjett-2027'],
    bylines: [{ author: 'marit' }],
    createdBy: 'marit',
    customFields: { standpoint: 'leder' },
    body: (ctx) =>
      doc(
        p('Det er lett å forstå jubelen. Elvebyen har vært uten svømmehall siden 2021, og svømmeopplæringen har foregått med buss til Fjellstad. At kommunestyret nå vedtar en ny hall, er riktig.'),
        p('Men et budsjett er mer enn ett vedtak. Det er en prioritering. Og prioriteringen flertallet gjorde torsdag, er at svømmehall er viktigere enn klasserom.'),
        h2('Regningen'),
        p('Eiendomsskatten øker fra 2,8 til 4,0 promille. Det er den største økningen i kommunens historie. Flertallet kaller det nødvendig. Vi kaller det en konsekvens av å love mer enn man har råd til.'),
        pullquote('Politikerne bygger svømmehall før de bygger klasserom.', 'Siri Moen, FAU-leder'),
        p('Bekkelund skole underviser i gangen. Planleggingsmidlene til en ny skole falt med én stemme. Én. Det bør flertallet tenke på når skolebruksplanen kommer i mars.'),
        p(['Elvebyen Tidende mener: ', bold('Svømmehallen er riktig. Rekkefølgen er feil.')]),
        related([ctx.ids.budsjett!, ctx.ids.skole_elevtall!]),
      ),
  },
  {
    key: 'kommentar_bro',
    kicker: 'Kommentar',
    title: 'Brua som ingen ville betale for',
    lead: 'Gamlebrua har trengt reparasjon siden 2023. At den først stenges nå, forteller mye om hvordan Elvebyen styres.',
    section: 'meninger',
    contentType: 'opinion',
    status: 'published',
    daysAgo: 10,
    hour: 12,
    image: 'bro',
    tags: ['samferdsel', 'gamlebrua'],
    bylines: [{ author: 'jonas' }],
    createdBy: 'jonas',
    customFields: { standpoint: 'kommentar' },
    body: (ctx) =>
      doc(
        p('I 2023 fant inspektørene sprekker i to bærebjelker. I 2024 ble saken utsatt. I 2025 ble den utsatt igjen, fordi fylket og kommunen kranglet om regningen. I 2026 stenger brua i åtte måneder.'),
        p('Tre år. Det er tida det tok å bli enige om hvem som skulle betale for å reparere en bru som 4 200 biler kjører over hver dag.'),
        h2('Et mønster'),
        p('Dette er ikke første gang. Svømmehallen stengte i 2021 og får erstatning i 2028. Bekkelund skole har vært full siden 2024. Elvebyen er flink til å utrede og dårlig til å bestemme.'),
        pullquote('Elvebyen er flink til å utrede og dårlig til å bestemme.'),
        p('Når brua åpner igjen 17. mai, håper jeg noen står på den og tenker: Dette skal vi ikke gjøre igjen.'),
        related([ctx.ids.gamlebrua!]),
      ),
  },
  {
    key: 'debatt_skole',
    kicker: 'Debatt',
    title: 'Vi trenger en ny skole på Bekkelund – nå',
    lead: 'Som foreldre til tre barn på Bekkelund skole er vi lei av å høre at «det kommer en plan». Barna våre går på skolen nå.',
    section: 'debatt',
    contentType: 'opinion',
    status: 'approved',
    daysAgo: 1,
    hour: 9,
    image: 'skole',
    tags: ['skole'],
    bylines: [{ author: 'ola', role: 'other' }],
    createdBy: 'jonas',
    customFields: { standpoint: 'debatt' },
    body: (ctx) =>
      doc(
        p([italic('Av Siri Moen og Tor Moen, foreldre og FAU-medlemmer ved Bekkelund skole')]),
        p('Datteren vår har mattetime i gangen. Sønnen vår har musikk i gymsalen. Den yngste starter neste høst, og vi vet ikke hvor hun skal sitte.'),
        p('Kommunen har visst om veksten på Bekkelund siden reguleringsplanen for Furuhaugen ble vedtatt i 2019. Det er sju år siden.'),
        h2('Vi ber om tre ting'),
        ol(['Modulbygg på plass til skolestart 2027', 'Planleggingsmidler til ny skole i revidert budsjett', 'At politikerne besøker skolen i en vanlig uke – ikke på 17. mai']),
        p('Vi er ikke imot svømmehall. Vi er imot å vente.'),
        related([ctx.ids.skole_elevtall!]),
      ),
  },
  {
    key: 'nekrolog_kvernmo',
    kicker: 'Minneord',
    title: 'Arne Kvernmo (1938–2026)',
    lead: 'Arne Kvernmo døde 14. august, 88 år gammel. Med ham mistet Elvebyen sin fremste ildsjel for skisporten og friluftslivet.',
    section: 'meninger',
    contentType: 'obituary',
    status: 'published',
    daysAgo: 20,
    hour: 8,
    image: 'skog',
    tags: ['friluftsliv', 'elvebyen-il'],
    bylines: [{ author: 'marit' }],
    createdBy: 'marit',
    customFields: { born: '1938-03-02', died: '2026-08-14' },
    body: (ctx) =>
      doc(
        p('Arne ble født på Kvernmo gård ved Kvernfossen i 1938, som den yngste av fem søsken. Han gikk på ski før han kunne lese, pleide han å si, og han sluttet aldri.'),
        p('I 1961 var han med og stiftet skigruppa i Elvebyen IL. Han satt i styret i 44 år, var leder i 19 av dem, og kjørte løypemaskinen selv til han var 82.'),
        image(ctx.images.skog!, { caption: 'Storåsen, der Arne Kvernmo la tusenvis av dugnadstimer.' }),
        h2('Lysløypa'),
        p('De siste ti årene av livet brukte han på én sak: lysløypa på Storåsen. Han skrev søknader, ringte politikere og arrangerte dugnader. Da kommunestyret bevilget pengene i juni, satt han på tilhørerbenken. Han fikk ikke oppleve åpningen.'),
        pullquote('Det er ikke løypa som er viktig. Det er at ungene kommer seg ut.', 'Arne Kvernmo, 2024'),
        p('Arne etterlater seg kona Solveig, tre barn og sju barnebarn – alle på ski. Vi lyser fred over hans minne.'),
        related([ctx.ids.lysloype!]),
      ),
  },
];

/* -------------------------------------------------------------------------- */
/*  Live blog                                                                  */
/* -------------------------------------------------------------------------- */

export const LIVE_BLOG = {
  title: 'Kommunestyremøtet direkte',
  slug: 'kommunestyremotet-direkte',
  description: 'Vi følger budsjettbehandlingen i kommunestyret minutt for minutt.',
  articleKey: 'budsjett',
  posts: [
    {
      minutesAgo: 400,
      title: 'Møtet er i gang',
      isKeyEvent: false,
      isPinned: false,
      author: 'jonas' as AuthorKey,
      body: () => doc(p('Ordfører Kari Brekke har åpnet møtet. 35 representanter er til stede. Første sak er budsjettet for 2027 – vi følger debatten her.')),
    },
    {
      minutesAgo: 355,
      title: 'Rådmannen: – Vi må øke inntektene',
      isKeyEvent: false,
      isPinned: false,
      author: 'jonas' as AuthorKey,
      body: () => doc(p('Rådmann Petter Aas legger fram budsjettet. Han sier kommunen har hatt merforbruk i eldreomsorgen tre år på rad, og at eiendomsskatten må opp «uansett svømmehall eller ikke».')),
    },
    {
      minutesAgo: 290,
      title: 'Høyre fremmer alternativt budsjett',
      isKeyEvent: true,
      isPinned: false,
      author: 'ingrid' as AuthorKey,
      body: () => doc(p('Erik Nordvik (H) fremmer et alternativt budsjett uten økt eiendomsskatt. Svømmehallen utsettes til 2030 i Høyres forslag.'), p([bold('Nøkkelhendelse: '), 'Alternativt budsjett fra H, FrP og Bylista.'])),
    },
    {
      minutesAgo: 180,
      title: 'Pause',
      isKeyEvent: false,
      isPinned: false,
      author: 'jonas' as AuthorKey,
      body: () => doc(p('Møtet tar pause til klokka 18.30. Representantene spiser pizza på gangen, og FAU fra Bekkelund har møtt opp med plakater.')),
    },
    {
      minutesAgo: 95,
      title: 'Skoleforslaget falt med én stemme',
      isKeyEvent: true,
      isPinned: false,
      author: 'ingrid' as AuthorKey,
      body: () => doc(p('Forslaget om planleggingsmidler til ny skole på Bekkelund falt med 17 mot 18 stemmer. KrF stemte med flertallet.'), p('– Skuffende, sier FAU-leder Siri Moen til Elvebyen Tidende.')),
    },
    {
      minutesAgo: 20,
      title: 'Budsjettet er vedtatt',
      isKeyEvent: true,
      isPinned: true,
      author: 'jonas' as AuthorKey,
      body: () => doc(p([bold('Vedtatt med 21 mot 14 stemmer.'), ' Elvebyen får ny svømmehall i 2028, og eiendomsskatten øker til 4,0 promille. Les hele saken i lenken over.'])),
    },
  ],
};

/** Ensure every content type referenced by an article exists in CONTENT_TYPES. */
export function assertContentIntegrity(): void {
  const typeKeys = new Set(CONTENT_TYPES.map((c) => c.key));
  const sectionKeys = new Set(SECTIONS.map((s) => s.key));
  const tagSlugs = new Set(TAGS.map((t) => t.slug));
  for (const a of ARTICLES) {
    if (!typeKeys.has(a.contentType)) throw new Error(`Article ${a.key}: unknown content type ${a.contentType}`);
    if (a.section && !sectionKeys.has(a.section)) throw new Error(`Article ${a.key}: unknown section ${a.section}`);
    for (const t of a.tags) if (!tagSlugs.has(t)) throw new Error(`Article ${a.key}: unknown tag ${t}`);
  }
}

export { h3 };
