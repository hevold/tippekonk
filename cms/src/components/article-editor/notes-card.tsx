'use client';
/**
 * NotesCard ("Notater") — the internal thread on an article: add a note,
 * resolve/reopen. Notes never reach the public site.
 */
import { Check, RotateCcw, Send } from 'lucide-react';
import { useState } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import { formatRelative } from '@/components/ui/format';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { addNoteAction, resolveNoteAction } from '@/server/articles/actions';
import type { EditorNote } from '@/server/articles/queries';

export type NotesCardProps = {
  articleId: string;
  notes: EditorNote[];
  onNotesChange: (notes: EditorNote[]) => void;
  currentUser: { id: string; name: string };
  disabled: boolean;
};

export function NotesCard({ articleId, notes, onNotesChange, currentUser, disabled }: NotesCardProps) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const open = notes.filter((n) => !n.resolvedAt);
  const resolved = notes.filter((n) => n.resolvedAt);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    const res = await addNoteAction({ id: articleId, body });
    setSending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onNotesChange([
      ...notes,
      {
        id: res.data.id,
        body: res.data.body,
        createdAt: new Date(res.data.createdAt),
        resolvedAt: null,
        user: currentUser,
      },
    ]);
    setDraft('');
  }

  async function setResolved(note: EditorNote, value: boolean) {
    const res = await resolveNoteAction({ id: articleId, noteId: note.id, resolved: value });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onNotesChange(
      notes.map((n) =>
        n.id === note.id
          ? { ...n, resolvedAt: res.data.resolvedAt ? new Date(res.data.resolvedAt) : null }
          : n,
      ),
    );
  }

  function renderNote(note: EditorNote) {
    const done = Boolean(note.resolvedAt);
    return (
      <li key={note.id} className={cn('flex gap-2.5', done && 'opacity-70')}>
        <Avatar name={note.user?.name ?? '?'} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-text text-sm font-medium">{note.user?.name ?? t('common.unknown')}</span>
            <time className="text-muted shrink-0 text-xs" dateTime={note.createdAt.toISOString()}>
              {formatRelative(note.createdAt)}
            </time>
          </div>
          <p
            className={cn('text-text mt-0.5 text-sm break-words whitespace-pre-wrap', done && 'line-through')}
          >
            {note.body}
          </p>
        </div>
        {!disabled ? (
          <IconButton
            size="sm"
            label={done ? t('articles.notes.reopen') : t('articles.notes.resolve')}
            onClick={() => setResolved(note, !done)}
          >
            {done ? <RotateCcw /> : <Check />}
          </IconButton>
        ) : null}
      </li>
    );
  }

  return (
    <div className="grid gap-3">
      {open.length === 0 ? (
        <p className="text-muted text-sm">{t('articles.notes.empty')}</p>
      ) : (
        <ul className="grid gap-3">{open.map(renderNote)}</ul>
      )}
      {resolved.length > 0 ? (
        <div className="grid gap-2">
          <Button
            variant="link"
            size="sm"
            className="justify-start"
            onClick={() => setShowResolved((v) => !v)}
            aria-expanded={showResolved}
          >
            {showResolved
              ? t('articles.notes.hideResolved', { count: resolved.length })
              : t('articles.notes.showResolved', { count: resolved.length })}
          </Button>
          {showResolved ? <ul className="grid gap-3">{resolved.map(renderNote)}</ul> : null}
        </div>
      ) : null}
      {!disabled ? (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Textarea
            aria-label={t('articles.notes.newNote')}
            placeholder={t('articles.notes.placeholder')}
            rows={2}
            autoResize
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" leftIcon={<Send />} loading={sending} disabled={!draft.trim()}>
              {t('articles.notes.add')}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
