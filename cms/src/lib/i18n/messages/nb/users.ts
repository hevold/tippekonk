/**
 * Norwegian bokmål messages — area: users. Users admin (/admin/brukere),
 * profile (/admin/profil) and notifications (/admin/varsler).
 */
const messages: Record<string, string> = {
  /* Users admin ---------------------------------------------------------- */
  'users.title': 'Brukere',
  'users.description': 'Medlemmer av {site} og hva de har tilgang til.',
  'users.invite': 'Inviter bruker',
  'users.count.one': '{count} bruker',
  'users.count.other': '{count} brukere',
  'users.empty.title': 'Ingen brukere ennå',
  'users.empty.description': 'Inviter kollegene dine, så får de en e-post med lenke for å velge passord.',
  'users.you': 'deg',
  'users.superadmin': 'Superadmin',
  'users.superadminHelp': 'Superadministratorer har full tilgang til alle nettsteder i installasjonen.',
  'users.twoFactorOn': '2FA',

  'users.column.name': 'Navn',
  'users.column.role': 'Rolle',
  'users.column.status': 'Status',
  'users.column.lastLogin': 'Sist innlogget',
  'users.column.actions': 'Handlinger',

  'users.status.active': 'Aktiv',
  'users.status.invited': 'Invitert',
  'users.status.inactive': 'Deaktivert',

  'users.action.changeRole': 'Endre rolle',
  'users.action.deactivate': 'Deaktiver',
  'users.action.reactivate': 'Reaktiver',
  'users.action.remove': 'Fjern fra {site}',
  'users.action.resendInvite': 'Send invitasjon på nytt',
  'users.action.makeSuperadmin': 'Gjør til superadmin',
  'users.action.revokeSuperadmin': 'Fjern superadmin',
  'users.action.menu': 'Handlinger for {name}',

  'users.inviteDialog.title': 'Inviter bruker',
  'users.inviteDialog.description':
    'Brukeren får en e-post med lenke for å velge passord. Lenken er gyldig i 72 timer.',
  'users.inviteDialog.email': 'E-post',
  'users.inviteDialog.name': 'Navn',
  'users.inviteDialog.role': 'Rolle',
  'users.inviteDialog.createAuthor': 'Opprett skribentprofil (byline)',
  'users.inviteDialog.createAuthorHelp': 'Brukeren kan da settes som byline på saker.',
  'users.inviteDialog.submit': 'Send invitasjon',
  'users.inviteDialog.sent': 'Invitasjon sendt til {email}',
  'users.inviteDialog.added': '{email} har fått tilgang',

  'users.roleDialog.title': 'Endre rolle for {name}',
  'users.roleDialog.role': 'Ny rolle',
  'users.roleDialog.submit': 'Lagre rolle',
  'users.roleDialog.saved': 'Rollen er oppdatert',

  'users.role.help.admin': 'Alt, inkludert innstillinger, brukere og integrasjoner.',
  'users.role.help.editor': 'Publiserer, planlegger og redigerer forsiden. Redigerer alle saker.',
  'users.role.help.journalist': 'Skriver og redigerer alle saker, sender til desk. Kan ikke publisere.',
  'users.role.help.contributor': 'Skriver egne utkast. Ser bare sine egne saker.',
  'users.role.help.viewer': 'Kan bare lese i admin.',

  'users.confirm.deactivate.title': 'Deaktivere {name}?',
  'users.confirm.deactivate.description':
    'Brukeren blir logget ut og kan ikke logge inn før kontoen reaktiveres. Innholdet beholdes.',
  'users.confirm.remove.title': 'Fjerne {name} fra {site}?',
  'users.confirm.remove.description':
    'Brukeren mister tilgangen til denne redaksjonen. Saker og bylines beholdes.',
  'users.confirm.superadmin.title': 'Gi {name} superadmin?',
  'users.confirm.superadmin.description':
    'Superadministratorer har full tilgang til alle nettsteder og kan opprette nye.',

  'users.toast.deactivated': '{name} er deaktivert',
  'users.toast.reactivated': '{name} er reaktivert',
  'users.toast.removed': '{name} er fjernet fra redaksjonen',
  'users.toast.inviteResent': 'Invitasjonen er sendt på nytt',
  'users.toast.superadminGranted': '{name} er nå superadmin',
  'users.toast.superadminRevoked': '{name} er ikke lenger superadmin',

  'users.error.alreadyMember': 'Denne e-postadressen er allerede medlem av redaksjonen.',
  'users.error.createFailed': 'Kunne ikke opprette brukeren.',
  'users.error.notMember': 'Brukeren er ikke medlem av denne redaksjonen.',
  'users.error.selfDemote': 'Du kan ikke fjerne din egen administratortilgang.',
  'users.error.selfDeactivate': 'Du kan ikke deaktivere deg selv.',
  'users.error.selfRemove': 'Du kan ikke fjerne deg selv fra redaksjonen.',
  'users.error.lastAdmin': 'Redaksjonen må ha minst én aktiv administrator.',
  'users.error.superadminOnly': 'Bare superadministratorer kan gjøre dette.',
  'users.error.notPending': 'Brukeren har allerede valgt passord.',

  /* Profile ------------------------------------------------------------- */
  'users.profile.title': 'Min profil',
  'users.profile.description': 'Navn, språk, passord og sikkerhet for kontoen din.',
  'users.profile.section.details': 'Om deg',
  'users.profile.section.detailsDescription': 'Navnet vises i bylines og i loggen.',
  'users.profile.name': 'Navn',
  'users.profile.email': 'E-post',
  'users.profile.locale': 'Språk i admin',
  'users.profile.locale.nb': 'Bokmål',
  'users.profile.locale.nn': 'Nynorsk',
  'users.profile.locale.en': 'Engelsk',
  'users.profile.save': 'Lagre',
  'users.profile.saved': 'Profilen er lagret',
  'users.profile.role': 'Rolle i {site}',

  'users.profile.section.password': 'Passord',
  'users.profile.section.passwordDescription':
    'Bytt passord regelmessig. Andre enheter logges ut når du bytter.',
  'users.profile.currentPassword': 'Nåværende passord',
  'users.profile.newPassword': 'Nytt passord',
  'users.profile.newPasswordConfirm': 'Gjenta nytt passord',
  'users.profile.changePassword': 'Bytt passord',
  'users.profile.passwordChanged': 'Passordet er endret',

  'users.profile.section.twoFactor': 'Totrinnsbekreftelse',
  'users.profile.section.twoFactorDescription':
    'Krev en engangskode fra en autentiseringsapp i tillegg til passordet.',
  'users.profile.twoFactor.enabled': 'Påslått',
  'users.profile.twoFactor.disabled': 'Avslått',
  'users.profile.twoFactor.recoveryLeft.one': '{count} gjenopprettingskode igjen',
  'users.profile.twoFactor.recoveryLeft.other': '{count} gjenopprettingskoder igjen',
  'users.profile.twoFactor.enable': 'Slå på',
  'users.profile.twoFactor.disable': 'Slå av',
  'users.profile.twoFactor.setupTitle': 'Slå på totrinnsbekreftelse',
  'users.profile.twoFactor.step1':
    '1. Skann QR-koden i en autentiseringsapp (f.eks. 1Password, Google Authenticator eller Microsoft Authenticator).',
  'users.profile.twoFactor.manualKey': 'Eller skriv inn nøkkelen manuelt:',
  'users.profile.twoFactor.step2':
    '2. Lagre gjenopprettingskodene et trygt sted. Hver kode kan brukes én gang hvis du mister telefonen.',
  'users.profile.twoFactor.step3': '3. Skriv inn koden appen viser nå.',
  'users.profile.twoFactor.code': 'Kode fra appen',
  'users.profile.twoFactor.confirm': 'Bekreft og slå på',
  'users.profile.twoFactor.enabledToast': 'Totrinnsbekreftelse er slått på',
  'users.profile.twoFactor.disableTitle': 'Slå av totrinnsbekreftelse?',
  'users.profile.twoFactor.disableDescription': 'Kontoen din blir mindre sikker. Bekreft med passordet ditt.',
  'users.profile.twoFactor.disabledToast': 'Totrinnsbekreftelse er slått av',
  'users.profile.twoFactor.copyCodes': 'Kopier kodene',
  'users.profile.twoFactor.qrAlt': 'QR-kode for autentiseringsapp',

  'users.profile.section.sessions': 'Aktive økter',
  'users.profile.section.sessionsDescription': 'Enheter der du er logget inn nå.',
  'users.profile.sessions.current': 'Denne enheten',
  'users.profile.sessions.lastSeen': 'Sist aktiv {when}',
  'users.profile.sessions.signedIn': 'Logget inn {when}',
  'users.profile.sessions.revoke': 'Logg ut',
  'users.profile.sessions.revoked': 'Økten er logget ut',
  'users.profile.sessions.logoutEverywhere': 'Logg ut overalt',
  'users.profile.sessions.logoutEverywhereDescription':
    'Alle andre enheter logges ut. Du forblir innlogget her.',
  'users.profile.sessions.loggedOutEverywhere.one': '{count} annen økt er logget ut',
  'users.profile.sessions.loggedOutEverywhere.other': '{count} andre økter er logget ut',
  'users.profile.sessions.none': 'Ingen andre økter',

  'users.profile.error.emailTaken': 'E-postadressen er allerede i bruk.',
  'users.profile.error.wrongPassword': 'Passordet er feil.',
  'users.profile.error.totpAlreadyEnabled': 'Totrinnsbekreftelse er allerede slått på.',
  'users.profile.error.totpNotStarted': 'Start oppsettet på nytt.',
  'users.profile.error.totpCodeInvalid': 'Koden stemmer ikke. Prøv igjen.',
  'users.profile.error.currentSession': 'Bruk «Logg ut» for å avslutte denne økten.',

  /* Notifications ------------------------------------------------------- */
  'users.notifications.title': 'Varsler',
  'users.notifications.description': 'Hendelser som gjelder deg: tildelinger, kommentarer og publiseringer.',
  'users.notifications.markAllRead': 'Merk alle som lest',
  'users.notifications.markedAllRead': 'Alle varsler er merket som lest',
  'users.notifications.unread.one': '{count} ulest',
  'users.notifications.unread.other': '{count} uleste',
  'users.notifications.empty.title': 'Ingen varsler',
  'users.notifications.empty.description':
    'Du får beskjed her når noen tildeler deg en sak eller kommenterer.',
  'users.notifications.delete': 'Slett varsel',
  'users.notifications.deleted': 'Varselet er slettet',
  'users.notifications.open': 'Åpne',
  'users.notifications.unreadLabel': 'Ulest',
};

export default messages;
