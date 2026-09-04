/**
 * Outgoing e-mail. Uses nodemailer over `SMTP_URL` when configured; without
 * it, messages are printed to the server log in a readable form so a fresh
 * install (and tests) can still exercise invitations and password resets.
 *
 *   await sendMail('kari@avisa.no', 'Emne', html, text);
 *
 * Sending never throws for the console transport; SMTP failures are logged
 * and re-thrown so callers can tell the user the e-mail did not go out.
 */
import nodemailer, { type Transporter } from 'nodemailer';

import { env } from '@/env';

export * from './templates';

type MailMessage = { to: string; subject: string; html: string; text: string };

export type MailTransport = {
  kind: 'smtp' | 'console';
  send(message: MailMessage): Promise<void>;
};

const g = globalThis as unknown as { __deskenMailTransport?: MailTransport | null };

/** Test hook: replace the transport (pass null to restore the default). */
export function setMailTransport(transport: MailTransport | null): void {
  g.__deskenMailTransport = transport;
}

/** Messages captured by the console transport in the current process (tests read these). */
export const sentMailLog: MailMessage[] = [];
const MAX_LOG = 100;

function consoleTransport(): MailTransport {
  return {
    kind: 'console',
    async send(message) {
      sentMailLog.push(message);
      if (sentMailLog.length > MAX_LOG) sentMailLog.shift();
      if (env.NODE_ENV !== 'test') {
        const line = '─'.repeat(60);
        console.info(
          [
            `[email] SMTP_URL er ikke satt – e-posten logges i stedet for å sendes.`,
            line,
            `Til:   ${message.to}`,
            `Fra:   ${env.MAIL_FROM}`,
            `Emne:  ${message.subject}`,
            line,
            message.text,
            line,
          ].join('\n'),
        );
      }
    },
  };
}

function smtpTransport(url: string): MailTransport {
  const transporter: Transporter = nodemailer.createTransport(url);
  return {
    kind: 'smtp',
    async send(message) {
      await transporter.sendMail({
        from: env.MAIL_FROM,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
    },
  };
}

export function getMailTransport(): MailTransport {
  if (g.__deskenMailTransport) return g.__deskenMailTransport;
  const transport = env.SMTP_URL ? smtpTransport(env.SMTP_URL) : consoleTransport();
  g.__deskenMailTransport = transport;
  return transport;
}

/** Strip tags from HTML as a last-resort plain-text fallback. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function sendMail(to: string, subject: string, html: string, text?: string): Promise<void> {
  const transport = getMailTransport();
  try {
    await transport.send({ to, subject, html, text: text ?? htmlToText(html) });
  } catch (err) {
    console.error('[email] Kunne ikke sende e-post', { to, subject }, err);
    throw err;
  }
}
