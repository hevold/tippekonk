/**
 * Human-readable bokmål summaries of audit log entries for the dashboard
 * activity feed. Pure: takes an audit row (plus the actor's name) and returns
 * a sentence such as "Ingrid Haugen publiserte «Kommunestyret vedtok
 * budsjettet»". Unknown actions fall back to the stored summary.
 */
import type { ArticleStatus } from '@/db/schema';

export type ActivityEntry = {
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
  data: Record<string, unknown> | null;
};

export type ActivityIcon = 'article' | 'publish' | 'media' | 'taxonomy' | 'user' | 'settings' | 'layout' | 'live' | 'other';

const STATUS_LABEL: Record<ArticleStatus, string> = {
  draft: 'utkast',
  in_review: 'til desk',
  approved: 'godkjent',
  scheduled: 'planlagt',
  published: 'publisert',
  unpublished: 'avpublisert',
  archived: 'arkivert',
};

/** «Title» from summaries like `Opprettet «Tittel»` (the audit writers quote titles consistently). */
export function quotedTitle(summary: string | null): string | null {
  if (!summary) return null;
  const m = /«([^»]*)»/.exec(summary);
  return m ? `«${m[1]}»` : null;
}

function statusLabel(value: unknown): string | null {
  return typeof value === 'string' && value in STATUS_LABEL ? STATUS_LABEL[value as ArticleStatus] : null;
}

/** Icon family for an action, used to pick the glyph in the feed. */
export function activityIcon(action: string): ActivityIcon {
  if (action.startsWith('article.publish') || action === 'article.schedule' || action === 'article.unpublish') return 'publish';
  if (action.startsWith('article.')) return 'article';
  if (action.startsWith('media.')) return 'media';
  if (action.startsWith('section.') || action.startsWith('tag.') || action.startsWith('author.') || action.startsWith('content_type.')) return 'taxonomy';
  if (action.startsWith('user.') || action.startsWith('auth.') || action.startsWith('membership.')) return 'user';
  if (action.startsWith('settings.') || action.startsWith('menu.') || action.startsWith('redirect.')) return 'settings';
  if (action.startsWith('layout.')) return 'layout';
  if (action.startsWith('live.')) return 'live';
  return 'other';
}

/**
 * One sentence per entry. The actor's name is always the subject; when it is
 * unknown (system, scheduler) "Systemet" is used.
 */
export function describeActivity(entry: ActivityEntry, actorName: string | null): string {
  const who = actorName?.trim() || 'Systemet';
  const title = quotedTitle(entry.summary) ?? 'en sak';
  const data = entry.data ?? {};
  switch (entry.action) {
    case 'article.create':
      return `${who} opprettet ${title}`;
    case 'article.save':
      return `${who} lagret ${title}`;
    case 'article.publish':
      return `${who} publiserte ${title}`;
    case 'article.unpublish':
      return `${who} avpubliserte ${title}`;
    case 'article.schedule':
      return `${who} planla publisering av ${title}`;
    case 'article.transition': {
      const to = statusLabel(data.to);
      return to ? `${who} satte ${title} til ${to}` : `${who} endret status på ${title}`;
    }
    case 'article.trash':
      return `${who} la ${title} i papirkurven`;
    case 'article.restore':
      return `${who} gjenopprettet ${title}`;
    case 'article.destroy':
      return `${who} slettet ${title} for godt`;
    case 'article.duplicate':
      return `${who} lagde en kopi av ${title}`;
    case 'article.assign':
    case 'article.plan':
      return `${who} oppdaterte planleggingen for ${title}`;
    case 'article.note':
      return `${who} skrev et notat på ${title}`;
    case 'article.restore_revision':
    case 'article.revision.restore':
      return `${who} gjenopprettet en tidligere versjon av ${title}`;
    case 'article.change_type':
      return `${who} endret innholdstypen på ${title}`;
    case 'article.lock.takeover':
      return `${who} overtok redigeringen av ${title}`;
    case 'media.upload':
      return `${who} lastet opp ${quotedTitle(entry.summary) ?? 'en fil'}`;
    case 'media.update':
      return `${who} oppdaterte ${quotedTitle(entry.summary) ?? 'en fil'} i mediearkivet`;
    case 'media.trash':
    case 'media.delete':
      return `${who} slettet ${quotedTitle(entry.summary) ?? 'en fil'} fra mediearkivet`;
    case 'media.restore':
      return `${who} gjenopprettet ${quotedTitle(entry.summary) ?? 'en fil'} i mediearkivet`;
    case 'section.create':
      return `${who} opprettet seksjonen ${quotedTitle(entry.summary) ?? ''}`.trim();
    case 'section.update':
      return `${who} oppdaterte seksjonen ${quotedTitle(entry.summary) ?? ''}`.trim();
    case 'section.delete':
      return `${who} slettet seksjonen ${quotedTitle(entry.summary) ?? ''}`.trim();
    case 'section.reorder':
      return `${who} endret rekkefølgen på seksjonene`;
    case 'tag.create':
      return `${who} opprettet stikkordet ${quotedTitle(entry.summary) ?? ''}`.trim();
    case 'tag.update':
      return `${who} oppdaterte stikkordet ${quotedTitle(entry.summary) ?? ''}`.trim();
    case 'tag.delete':
      return `${who} slettet stikkordet ${quotedTitle(entry.summary) ?? ''}`.trim();
    case 'tag.merge':
      return `${who} slo sammen stikkord`;
    case 'author.create':
      return `${who} opprettet skribenten ${quotedTitle(entry.summary) ?? ''}`.trim();
    case 'author.update':
      return `${who} oppdaterte skribenten ${quotedTitle(entry.summary) ?? ''}`.trim();
    case 'author.delete':
      return `${who} slettet skribenten ${quotedTitle(entry.summary) ?? ''}`.trim();
    case 'author.reorder':
      return `${who} endret rekkefølgen på skribentene`;
    case 'content_type.create':
      return `${who} opprettet innholdstypen ${quotedTitle(entry.summary) ?? ''}`.trim();
    case 'content_type.update':
      return `${who} oppdaterte innholdstypen ${quotedTitle(entry.summary) ?? ''}`.trim();
    case 'content_type.delete':
      return `${who} slettet innholdstypen ${quotedTitle(entry.summary) ?? ''}`.trim();
    case 'layout.save':
      return `${who} lagret et utkast til forsiden`;
    case 'layout.publish':
      return `${who} publiserte forsiden`;
    case 'live.create':
      return `${who} opprettet direktestudioet ${quotedTitle(entry.summary) ?? ''}`.trim();
    case 'live.post':
    case 'live.post_created':
      return `${who} postet i et direktestudio`;
    case 'live.end':
      return `${who} avsluttet et direktestudio`;
    case 'user.invite':
      return `${who} inviterte en ny bruker`;
    case 'user.update':
    case 'membership.update':
      return `${who} oppdaterte en bruker`;
    case 'user.deactivate':
      return `${who} deaktiverte en bruker`;
    case 'auth.login':
      return `${who} logget inn`;
    case 'settings.update':
      return `${who} endret innstillingene`;
    case 'menu.update':
      return `${who} endret menyene`;
    case 'redirect.create':
      return `${who} opprettet en omdirigering`;
    case 'webhook.create':
    case 'webhook.update':
      return `${who} endret en webhook`;
    case 'api_key.create':
      return `${who} opprettet en API-nøkkel`;
    default:
      return entry.summary ? `${who}: ${entry.summary}` : `${who} utførte ${entry.action}`;
  }
}
