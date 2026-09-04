/**
 * Norwegian bokmål messages — area: auth. Login, second factor, password
 * recovery, invitations and logout.
 */
const messages: Record<string, string> = {
  'auth.brand': 'Desken',
  'auth.tagline': 'Publiseringssystem for norske redaksjoner',
  'auth.backToLogin': 'Tilbake til innlogging',

  'auth.login.title': 'Logg inn',
  'auth.login.description': 'Logg inn med e-postadressen og passordet ditt.',
  'auth.login.email': 'E-post',
  'auth.login.password': 'Passord',
  'auth.login.remember': 'Husk meg på denne enheten',
  'auth.login.submit': 'Logg inn',
  'auth.login.forgot': 'Glemt passord?',
  'auth.login.invalid': 'Feil e-post eller passord. Prøv igjen.',
  'auth.login.inactive': 'Kontoen din er deaktivert. Kontakt en administrator.',
  'auth.login.rateLimited': 'For mange forsøk. Vent {minutes} minutter før du prøver igjen.',
  'auth.login.resetDone': 'Passordet er endret. Logg inn med det nye passordet.',
  'auth.login.loggedOut': 'Du er logget ut.',
  'auth.login.sessionExpired': 'Økten din er utløpt. Logg inn på nytt.',
  'auth.login.metaTitle': 'Logg inn',

  'auth.twoFactor.title': 'Totrinnsbekreftelse',
  'auth.twoFactor.description':
    'Skriv inn koden fra autentiseringsappen din. Du kan også bruke en av gjenopprettingskodene dine.',
  'auth.twoFactor.code': 'Engangskode',
  'auth.twoFactor.codeHelp': '6 siffer fra appen, eller en gjenopprettingskode (xxxx-xxxx)',
  'auth.twoFactor.codeRequired': 'Skriv inn koden',
  'auth.twoFactor.submit': 'Bekreft',
  'auth.twoFactor.invalid': 'Koden er ikke gyldig. Sjekk at klokken på telefonen er riktig og prøv igjen.',
  'auth.twoFactor.cancel': 'Avbryt og logg ut',
  'auth.twoFactor.signedInAs': 'Logget inn som {email}',

  'auth.forgot.title': 'Glemt passord',
  'auth.forgot.description':
    'Skriv inn e-postadressen din, så sender vi deg en lenke for å velge et nytt passord.',
  'auth.forgot.email': 'E-post',
  'auth.forgot.submit': 'Send lenke',
  'auth.forgot.successTitle': 'Sjekk e-posten din',
  'auth.forgot.success':
    'Hvis {email} er registrert hos oss, har vi sendt en lenke for å tilbakestille passordet. Lenken er gyldig i 60 minutter.',
  'auth.forgot.rateLimited': 'For mange forespørsler. Vent litt før du prøver igjen.',

  'auth.reset.title': 'Velg nytt passord',
  'auth.reset.description': 'Passordet må ha minst 10 tegn, med både bokstaver og tall.',
  'auth.reset.password': 'Nytt passord',
  'auth.reset.passwordConfirm': 'Gjenta passordet',
  'auth.reset.submit': 'Lagre passord',
  'auth.reset.invalid': 'Lenken er ugyldig eller utløpt.',
  'auth.reset.invalidTitle': 'Lenken virker ikke lenger',
  'auth.reset.invalidDescription':
    'Lenker for tilbakestilling er gyldige i 60 minutter og kan bare brukes én gang. Be om en ny lenke.',
  'auth.reset.requestNew': 'Be om ny lenke',

  'auth.invite.title': 'Velkommen til {site}',
  'auth.invite.titleGeneric': 'Velkommen til Desken',
  'auth.invite.description': 'Du er invitert som {role}. Velg navn og passord for å fullføre registreringen.',
  'auth.invite.descriptionGeneric': 'Velg navn og passord for å fullføre registreringen.',
  'auth.invite.email': 'E-post',
  'auth.invite.name': 'Navn',
  'auth.invite.password': 'Passord',
  'auth.invite.passwordConfirm': 'Gjenta passordet',
  'auth.invite.submit': 'Opprett konto',
  'auth.invite.invalid': 'Invitasjonen er ugyldig eller utløpt.',
  'auth.invite.invalidTitle': 'Invitasjonen virker ikke lenger',
  'auth.invite.invalidDescription':
    'Invitasjoner er gyldige i 72 timer. Be den som inviterte deg om å sende en ny invitasjon.',
  'auth.invite.alreadyAccepted': 'Denne invitasjonen er allerede brukt. Logg inn med passordet ditt.',
  'auth.invite.goToLogin': 'Gå til innlogging',

  'auth.error.notMemberOfSite': 'Du er ikke medlem av denne redaksjonen.',
  'auth.passwordRule': 'Minst 10 tegn, med både bokstaver og tall.',
};

export default messages;
