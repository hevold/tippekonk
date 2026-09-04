/**
 * Norwegian bokmål messages — area: media. Library, picker, upload, detail
 * page and the focal point tool.
 */
const messages: Record<string, string> = {
  'media.title': 'Mediearkiv',
  'media.description': 'Bilder, video, lyd og dokumenter som kan brukes i saker.',
  'media.count.one': '{count} fil',
  'media.count.other': '{count} filer',

  'media.kind.image': 'Bilde',
  'media.kind.video': 'Video',
  'media.kind.audio': 'Lyd',
  'media.kind.document': 'Dokument',

  'media.tabs.library': 'Bibliotek',
  'media.tabs.trash': 'Papirkurv',

  'media.search.placeholder': 'Søk i filnavn, alt-tekst, bildetekst, kreditering og stikkord',
  'media.filter.kind': 'Filtrer på type',
  'media.filter.folder': 'Filtrer på mappe',
  'media.filter.allKinds': 'Alle typer',
  'media.filter.allFolders': 'Alle mapper',

  'media.view.label': 'Visning',
  'media.view.grid': 'Rutenett',
  'media.view.list': 'Liste',

  'media.footer.hint': 'Slettede filer havner i papirkurven og kan gjenopprettes derfra:',

  'media.empty.title': 'Ingen filer ennå',
  'media.empty.description': 'Last opp det første bildet, så dukker det opp her.',
  'media.empty.pickerDescription': 'Last opp en fil for å bruke den i saken.',
  'media.empty.searchTitle': 'Ingen treff',
  'media.empty.searchDescription': 'Prøv et annet søkeord, eller nullstill filtrene.',
  'media.empty.trashTitle': 'Papirkurven er tom',
  'media.empty.trashDescription':
    'Filer du legger i papirkurven havner her, og kan gjenopprettes eller slettes permanent.',

  'media.card.select': 'Velg {name}',
  'media.card.noAlt': 'Mangler alternativ tekst',
  'media.card.missingAlt': 'Mangler alt-tekst',

  'media.bulk.selectAll': 'Velg alle på siden',
  'media.bulk.selected.one': '{count} valgt',
  'media.bulk.selected.other': '{count} valgt',
  'media.bulk.trashDone.one': '{count} fil lagt i papirkurven',
  'media.bulk.trashDone.other': '{count} filer lagt i papirkurven',
  'media.bulk.restoreDone.one': '{count} fil gjenopprettet',
  'media.bulk.restoreDone.other': '{count} filer gjenopprettet',
  'media.bulk.destroyDone.one': '{count} fil slettet permanent',
  'media.bulk.destroyDone.other': '{count} filer slettet permanent',

  'media.actions.trash': 'Legg i papirkurv',
  'media.actions.trashDone': 'Filen er lagt i papirkurven',
  'media.actions.restore': 'Gjenopprett',
  'media.actions.restoreDone': 'Filen er gjenopprettet',
  'media.actions.destroy': 'Slett permanent',
  'media.actions.destroyDone': 'Filen er slettet permanent',
  'media.actions.download': 'Last ned original',
  'media.actions.regenerate': 'Generer varianter på nytt',
  'media.actions.regenerateDone': 'Bildevariantene er generert på nytt',

  'media.confirm.trashTitle.one': 'Legge filen i papirkurven?',
  'media.confirm.trashTitle.other': 'Legge {count} filer i papirkurven?',
  'media.confirm.trashDescription':
    'Filen forsvinner fra biblioteket, men kan gjenopprettes fra papirkurven.',
  'media.confirm.trashInUse.one': 'Obs: filen brukes i {count} sak. Saken vil miste bildet der det er brukt.',
  'media.confirm.trashInUse.other':
    'Obs: filene brukes i {count} saker. Sakene vil miste bildene der de er brukt.',
  'media.confirm.destroyTitle.one': 'Slette filen permanent?',
  'media.confirm.destroyTitle.other': 'Slette {count} filer permanent?',
  'media.confirm.destroyDescription':
    'Originalen og alle varianter fjernes fra lagringen. Dette kan ikke angres.',

  'media.upload.button': 'Last opp',
  'media.upload.dialogTitle': 'Last opp filer',
  'media.upload.dropzoneLabel': 'Slipp filer her, eller velg fra datamaskinen',
  'media.upload.dropHint': 'Dra og slipp filer her',
  'media.upload.dropNow': 'Slipp for å laste opp',
  'media.upload.hint': 'JPEG, PNG, WebP, GIF, AVIF (maks 25 MB) · MP4, MP3, PDF (maks 200 MB)',
  'media.upload.choose': 'Velg filer',
  'media.upload.queueLabel': 'Opplastinger',
  'media.upload.progressLabel': 'Laster opp {name}',
  'media.upload.done': 'Lastet opp',
  'media.upload.remove': 'Fjern fra listen',
  'media.upload.success.one': '{count} fil lastet opp',
  'media.upload.success.other': '{count} filer lastet opp',
  'media.upload.error.type': 'Filtypen støttes ikke.',
  'media.upload.error.size': 'Filen er for stor (maks {limit}).',
  'media.upload.error.generic': 'Opplastingen mislyktes. Prøv igjen.',
  'media.upload.errorsSummary.one': '{count} fil kunne ikke lastes opp.',
  'media.upload.errorsSummary.other': '{count} filer kunne ikke lastes opp.',

  'media.picker.title': 'Velg fil',
  'media.picker.titleMany': 'Velg filer',
  'media.picker.tab.library': 'Bibliotek',
  'media.picker.tab.upload': 'Last opp',
  'media.picker.hint': 'Klikk på en fil for å velge den.',
  'media.picker.selectedCount.one': '{count} valgt',
  'media.picker.selectedCount.other': '{count} valgt',
  'media.picker.confirm': 'Velg',
  'media.picker.confirmMany': 'Velg {count} filer',
  'media.picker.loadMore': 'Last inn flere',
  'media.picker.gridLabel': 'Filer i biblioteket',
  'media.picker.detailsLabel': 'Detaljer for valgt fil',
  'media.picker.noneSelected': 'Velg en fil for å se og redigere alt-tekst og kreditering.',
  'media.picker.openDetails': 'Åpne i mediearkivet',

  'media.field.alt': 'Alternativ tekst',
  'media.field.altHelp':
    'Beskriv hva bildet viser, for skjermlesere og søkemotorer. Påkrevd før publisering.',
  'media.field.caption': 'Bildetekst',
  'media.field.credit': 'Fotokreditering',
  'media.field.creditHelp': 'Vises ved bildet, f.eks. «Foto: Kari Nordmann» eller «Foto: NTB».',
  'media.field.creditPlaceholder': 'Foto: …',
  'media.field.license': 'Lisens',
  'media.field.sourceUrl': 'Kilde (URL)',
  'media.field.folder': 'Mappe',
  'media.field.tags': 'Stikkord',
  'media.field.tagsHelp': 'Kommaseparert, f.eks. «rådhus, kommunestyret».',
  'media.field.takenAt': 'Tatt',

  'media.form.saved': 'Metadata lagret',
  'media.form.discard': 'Forkast endringer',
  'media.form.invalidDate': 'Ugyldig dato',

  'media.focal.title': 'Fokuspunkt',
  'media.focal.description':
    'Punktet som alltid skal være synlig når bildet beskjæres i teasere og på forsiden.',
  'media.focal.label': 'Fokuspunkt – klikk i bildet eller bruk piltastene',
  'media.focal.valueText': '{x} % fra venstre, {y} % fra toppen',
  'media.focal.help':
    'Klikk der motivet er viktigst. Piltaster flytter 1 %, Shift + piltast 5 %, Home nullstiller.',
  'media.focal.save': 'Lagre fokuspunkt',
  'media.focal.saved': 'Fokuspunkt lagret',
  'media.focal.reset': 'Sentrer',

  'media.detail.metadata': 'Metadata',
  'media.detail.facts': 'Fakta',
  'media.detail.trashedTitle': 'Filen ligger i papirkurven',
  'media.detail.trashedDescription':
    'Lagt i papirkurven {date}. Gjenopprett den for å redigere eller bruke den igjen.',
  'media.detail.noPlayer': 'Nettleseren kan ikke spille av denne filen.',
  'media.detail.openFile': 'Åpne filen',
  'media.detail.videoHint': 'Video lagres som den er; det lages ingen varianter.',

  'media.facts.kind': 'Type',
  'media.facts.mime': 'Format',
  'media.facts.size': 'Størrelse',
  'media.facts.dimensions': 'Dimensjoner',
  'media.facts.duration': 'Varighet',
  'media.facts.uploaded': 'Lastet opp',
  'media.facts.updated': 'Oppdatert',
  'media.facts.key': 'Lagringsnøkkel',
  'media.facts.dominantColor': 'Dominerende farge',

  'media.variants.title': 'Varianter',
  'media.variants.description.one': '{count} responsiv WebP-variant, generert ved opplasting.',
  'media.variants.description.other': '{count} responsive WebP-varianter, generert ved opplasting.',
  'media.variants.width': 'Bredde',
  'media.variants.format': 'Format',
  'media.variants.original': 'Original',

  'media.usage.title': 'Brukes i',
  'media.usage.none': 'Filen brukes ikke i noen saker.',
  'media.usage.count.one': 'Filen brukes i {count} sak.',
  'media.usage.count.other': 'Filen brukes i {count} saker.',
  'media.usage.where': 'Hvor',
  'media.usage.featured': 'Hovedbilde',
  'media.usage.body': 'I brødteksten',
  'media.usage.untitled': '(uten tittel)',
};

export default messages;
