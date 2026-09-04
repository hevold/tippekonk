/**
 * Norwegian e-mail templates (HTML + plain text) for invitations, password
 * resets and generic notifications. Pure functions: every dynamic value is
 * escaped, so callers may pass user-provided names and titles directly.
 */

export type MailContent = { subject: string; html: string; text: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type LayoutInput = {
  title: string;
  /** Paragraphs of body text (escaped here). */
  paragraphs: string[];
  button?: { label: string; url: string };
  /** Small print below the button (escaped here). */
  footnote?: string;
  /** Sender name shown in the footer, e.g. the site name. */
  sender: string;
};

function layout({ title, paragraphs, button, footnote, sender }: LayoutInput): { html: string; text: string } {
  const paragraphHtml = paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#1b1b19;">${escapeHtml(p)}</p>`)
    .join('\n');
  const buttonHtml = button
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
  <tr>
    <td style="border-radius:6px;background:#1d4ed8;">
      <a href="${escapeHtml(button.url)}" style="display:inline-block;padding:11px 20px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(button.label)}</a>
    </td>
  </tr>
</table>
<p style="margin:0 0 16px;font-size:13px;line-height:20px;color:#67665f;">Hvis knappen ikke virker, kopier denne lenken inn i nettleseren:<br><a href="${escapeHtml(button.url)}" style="color:#1d4ed8;word-break:break-all;">${escapeHtml(button.url)}</a></p>`
    : '';
  const footnoteHtml = footnote
    ? `<p style="margin:0;font-size:13px;line-height:20px;color:#67665f;">${escapeHtml(footnote)}</p>`
    : '';

  const html = `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f6f4;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f6f4;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #e3e2dd;border-radius:8px;">
        <tr>
          <td style="padding:28px 32px 8px;">
            <p style="margin:0 0 20px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#1d4ed8;">Desken</p>
            <h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:600;color:#1b1b19;">${escapeHtml(title)}</h1>
            ${paragraphHtml}
            ${buttonHtml}
            ${footnoteHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid #e3e2dd;">
            <p style="margin:0;font-size:12px;line-height:18px;color:#8d8c84;">Denne e-posten ble sendt fra ${escapeHtml(sender)} via Desken.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const textLines = [title, '', ...paragraphs.flatMap((p) => [p, ''])];
  if (button) textLines.push(`${button.label}: ${button.url}`, '');
  if (footnote) textLines.push(footnote, '');
  textLines.push(`— ${sender} via Desken`);
  return { html, text: textLines.join('\n') };
}

export function inviteEmail(input: {
  name: string;
  siteName: string;
  inviterName: string;
  roleLabel: string;
  link: string;
  expiresHours: number;
}): MailContent {
  const subject = `Du er invitert til ${input.siteName}`;
  const { html, text } = layout({
    title: `Velkommen til ${input.siteName}`,
    paragraphs: [
      `Hei ${input.name},`,
      `${input.inviterName} har invitert deg til redaksjonen i ${input.siteName} som ${input.roleLabel.toLowerCase()}. Klikk på knappen under for å velge passord og komme i gang.`,
    ],
    button: { label: 'Godta invitasjonen', url: input.link },
    footnote: `Lenken er gyldig i ${input.expiresHours} timer. Hvis du ikke venter en invitasjon, kan du se bort fra denne e-posten.`,
    sender: input.siteName,
  });
  return { subject, html, text };
}

export function passwordResetEmail(input: {
  name: string;
  siteName: string;
  link: string;
  expiresMinutes: number;
}): MailContent {
  const subject = 'Tilbakestill passordet ditt';
  const { html, text } = layout({
    title: 'Tilbakestill passordet ditt',
    paragraphs: [
      `Hei ${input.name},`,
      'Vi har mottatt en forespørsel om å tilbakestille passordet til kontoen din i Desken. Klikk på knappen under for å velge et nytt passord.',
    ],
    button: { label: 'Velg nytt passord', url: input.link },
    footnote: `Lenken er gyldig i ${input.expiresMinutes} minutter. Hvis du ikke ba om dette, kan du trygt se bort fra e-posten – passordet ditt er uendret.`,
    sender: input.siteName,
  });
  return { subject, html, text };
}

export function notificationEmail(input: {
  name: string;
  siteName: string;
  title: string;
  body?: string | null;
  link?: string | null;
}): MailContent {
  const paragraphs = [`Hei ${input.name},`];
  if (input.body) paragraphs.push(input.body);
  const { html, text } = layout({
    title: input.title,
    paragraphs,
    button: input.link ? { label: 'Åpne i Desken', url: input.link } : undefined,
    footnote: 'Du får denne e-posten fordi du er medlem av redaksjonen.',
    sender: input.siteName,
  });
  return { subject: input.title, html, text };
}

export function accessGrantedEmail(input: {
  name: string;
  siteName: string;
  inviterName: string;
  roleLabel: string;
  link: string;
}): MailContent {
  const subject = `Du har fått tilgang til ${input.siteName}`;
  const { html, text } = layout({
    title: `Du har fått tilgang til ${input.siteName}`,
    paragraphs: [
      `Hei ${input.name},`,
      `${input.inviterName} har gitt deg tilgang til ${input.siteName} som ${input.roleLabel.toLowerCase()}. Logg inn med brukeren du allerede har.`,
    ],
    button: { label: 'Logg inn', url: input.link },
    sender: input.siteName,
  });
  return { subject, html, text };
}
