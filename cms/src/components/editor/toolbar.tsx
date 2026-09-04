'use client';
/**
 * Sticky editor toolbar: grouped buttons with active states, Norwegian
 * tooltips (with shortcuts), and a contextual second row for tables.
 */
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  Bold,
  Code,
  Globe,
  Heading2,
  Heading3,
  Heading4,
  Highlighter,
  Image,
  Images,
  Info,
  Italic,
  Link,
  List,
  ListOrdered,
  MessageSquareQuote,
  Minus,
  Newspaper,
  Pilcrow,
  Radio,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  TextQuote,
  Trash,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { Tooltip } from '@/components/ui/tooltip';

import { useEditorHost } from './editor-host';
import { shortcutLabel } from './utils';

type ToolbarProps = {
  editor: Editor;
  compact?: boolean;
  onLinkRequest: () => void;
};

type ButtonProps = {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function ToolbarButton({ icon: Icon, label, shortcut, active, disabled, onClick }: ButtonProps) {
  const content = shortcut ? `${label} (${shortcutLabel(shortcut)})` : label;
  return (
    <Tooltip content={content}>
      <button
        type="button"
        className="ed-btn ed-btn-icon"
        aria-label={content}
        aria-pressed={active ?? undefined}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
      >
        <Icon aria-hidden />
      </button>
    </Tooltip>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ed-toolbar-group" role="group" aria-label={label}>
      {children}
    </div>
  );
}

function Sep() {
  return <span className="ed-toolbar-sep" aria-hidden />;
}

export function EditorToolbar({ editor, compact, onLinkRequest }: ToolbarProps) {
  const host = useEditorHost();
  const t = host.t;

  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      paragraph: e.isActive('paragraph'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      h4: e.isActive('heading', { level: 4 }),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      subscript: e.isActive('subscript'),
      superscript: e.isActive('superscript'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      left: e.isActive({ textAlign: 'left' }),
      center: e.isActive({ textAlign: 'center' }),
      right: e.isActive({ textAlign: 'right' }),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      blockquote: e.isActive('blockquote'),
      pullquote: e.isActive('pullquote'),
      factbox: e.isActive('factbox'),
      table: e.isActive('table'),
      editable: e.isEditable,
    }),
  });

  if (!s || !s.editable) return null;

  const chain = () => editor.chain().focus();

  const insertImage = async () => {
    if (!host.onMediaPick) return;
    const media = await host.onMediaPick();
    if (!media) return;
    chain()
      .insertImage({
        mediaId: media.id,
        src: host.mediaUrl(media, 1280),
        alt: media.alt ?? '',
        caption: media.caption ?? '',
        credit: media.credit ?? '',
        width: media.width ?? null,
        height: media.height ?? null,
      })
      .run();
  };

  return (
    <div className="ed-toolbar" role="toolbar" aria-label={t('editor.toolbar.label')}>
      <Group label={t('editor.toolbar.history')}>
        <ToolbarButton
          icon={Undo2}
          label={t('editor.toolbar.undo')}
          shortcut="Mod-Z"
          disabled={!s.canUndo}
          onClick={() => chain().undo().run()}
        />
        <ToolbarButton
          icon={Redo2}
          label={t('editor.toolbar.redo')}
          shortcut="Mod-Shift-Z"
          disabled={!s.canRedo}
          onClick={() => chain().redo().run()}
        />
      </Group>
      <Sep />
      <Group label={t('editor.toolbar.blocks')}>
        <ToolbarButton
          icon={Pilcrow}
          label={t('editor.toolbar.paragraph')}
          shortcut="Mod-Alt-0"
          active={s.paragraph}
          onClick={() => chain().setParagraph().run()}
        />
        <ToolbarButton
          icon={Heading2}
          label={t('editor.toolbar.heading2')}
          shortcut="Mod-Alt-2"
          active={s.h2}
          onClick={() => chain().toggleHeading({ level: 2 }).run()}
        />
        <ToolbarButton
          icon={Heading3}
          label={t('editor.toolbar.heading3')}
          shortcut="Mod-Alt-3"
          active={s.h3}
          onClick={() => chain().toggleHeading({ level: 3 }).run()}
        />
        {!compact ? (
          <ToolbarButton
            icon={Heading4}
            label={t('editor.toolbar.heading4')}
            shortcut="Mod-Alt-4"
            active={s.h4}
            onClick={() => chain().toggleHeading({ level: 4 }).run()}
          />
        ) : null}
      </Group>
      <Sep />
      <Group label={t('editor.toolbar.marks')}>
        <ToolbarButton
          icon={Bold}
          label={t('editor.toolbar.bold')}
          shortcut="Mod-B"
          active={s.bold}
          onClick={() => chain().toggleBold().run()}
        />
        <ToolbarButton
          icon={Italic}
          label={t('editor.toolbar.italic')}
          shortcut="Mod-I"
          active={s.italic}
          onClick={() => chain().toggleItalic().run()}
        />
        <ToolbarButton
          icon={Underline}
          label={t('editor.toolbar.underline')}
          shortcut="Mod-U"
          active={s.underline}
          onClick={() => chain().toggleUnderline().run()}
        />
        <ToolbarButton
          icon={Strikethrough}
          label={t('editor.toolbar.strike')}
          shortcut="Mod-Shift-S"
          active={s.strike}
          onClick={() => chain().toggleStrike().run()}
        />
        <ToolbarButton
          icon={Highlighter}
          label={t('editor.toolbar.highlight')}
          shortcut="Mod-Shift-H"
          active={s.highlight}
          onClick={() => chain().toggleHighlight().run()}
        />
        {!compact ? (
          <>
            <ToolbarButton
              icon={Subscript}
              label={t('editor.toolbar.subscript')}
              shortcut="Mod-,"
              active={s.subscript}
              onClick={() => chain().toggleSubscript().run()}
            />
            <ToolbarButton
              icon={Superscript}
              label={t('editor.toolbar.superscript')}
              shortcut="Mod-."
              active={s.superscript}
              onClick={() => chain().toggleSuperscript().run()}
            />
            <ToolbarButton
              icon={Code}
              label={t('editor.toolbar.code')}
              shortcut="Mod-E"
              active={s.code}
              onClick={() => chain().toggleCode().run()}
            />
          </>
        ) : null}
        <ToolbarButton
          icon={Link}
          label={t('editor.toolbar.link')}
          shortcut="Mod-K"
          active={s.link}
          onClick={onLinkRequest}
        />
        <ToolbarButton
          icon={RemoveFormatting}
          label={t('editor.toolbar.clearFormatting')}
          onClick={() => chain().unsetAllMarks().clearNodes().run()}
        />
      </Group>
      {!compact ? (
        <>
          <Sep />
          <Group label={t('editor.toolbar.align')}>
            <ToolbarButton
              icon={TextAlignStart}
              label={t('editor.toolbar.alignLeft')}
              shortcut="Mod-Shift-L"
              active={s.left}
              onClick={() => chain().setTextAlign('left').run()}
            />
            <ToolbarButton
              icon={TextAlignCenter}
              label={t('editor.toolbar.alignCenter')}
              shortcut="Mod-Shift-E"
              active={s.center}
              onClick={() => chain().setTextAlign('center').run()}
            />
            <ToolbarButton
              icon={TextAlignEnd}
              label={t('editor.toolbar.alignRight')}
              shortcut="Mod-Shift-R"
              active={s.right}
              onClick={() => chain().setTextAlign('right').run()}
            />
          </Group>
        </>
      ) : null}
      <Sep />
      <Group label={t('editor.toolbar.lists')}>
        <ToolbarButton
          icon={List}
          label={t('editor.toolbar.bulletList')}
          shortcut="Mod-Shift-8"
          active={s.bulletList}
          onClick={() => chain().toggleBulletList().run()}
        />
        <ToolbarButton
          icon={ListOrdered}
          label={t('editor.toolbar.orderedList')}
          shortcut="Mod-Shift-7"
          active={s.orderedList}
          onClick={() => chain().toggleOrderedList().run()}
        />
        <ToolbarButton
          icon={TextQuote}
          label={t('editor.toolbar.blockquote')}
          shortcut="Mod-Shift-B"
          active={s.blockquote}
          onClick={() => chain().toggleBlockquote().run()}
        />
      </Group>
      <Sep />
      <Group label={t('editor.toolbar.insert')}>
        {host.onMediaPick ? (
          <ToolbarButton icon={Image} label={t('editor.toolbar.image')} onClick={insertImage} />
        ) : null}
        {!compact ? (
          <>
            <ToolbarButton
              icon={Images}
              label={t('editor.toolbar.gallery')}
              onClick={() => chain().insertGallery().run()}
            />
            <ToolbarButton
              icon={Info}
              label={t('editor.toolbar.factbox')}
              active={s.factbox}
              onClick={() => chain().insertFactbox().run()}
            />
            <ToolbarButton
              icon={MessageSquareQuote}
              label={t('editor.toolbar.pullquote')}
              active={s.pullquote}
              onClick={() => chain().insertPullquote().run()}
            />
          </>
        ) : null}
        <ToolbarButton
          icon={Globe}
          label={t('editor.toolbar.embed')}
          onClick={() => chain().insertEmbed().run()}
        />
        {!compact ? (
          <>
            <ToolbarButton
              icon={Table}
              label={t('editor.toolbar.table')}
              active={s.table}
              onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            />
            <ToolbarButton
              icon={Newspaper}
              label={t('editor.toolbar.related')}
              onClick={() => chain().insertRelatedArticles().run()}
            />
            <ToolbarButton
              icon={Radio}
              label={t('editor.toolbar.liveBlog')}
              onClick={() => chain().insertLiveBlog().run()}
            />
          </>
        ) : null}
        <ToolbarButton
          icon={Minus}
          label={t('editor.toolbar.hr')}
          onClick={() => chain().setHorizontalRule().run()}
        />
      </Group>

      {s.table && !compact ? (
        <div className="ed-toolbar-sub" role="group" aria-label={t('editor.table.label')}>
          <button
            type="button"
            className="ed-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => chain().addRowBefore().run()}
          >
            {t('editor.table.addRowBefore')}
          </button>
          <button
            type="button"
            className="ed-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => chain().addRowAfter().run()}
          >
            {t('editor.table.addRowAfter')}
          </button>
          <button
            type="button"
            className="ed-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => chain().addColumnBefore().run()}
          >
            {t('editor.table.addColumnBefore')}
          </button>
          <button
            type="button"
            className="ed-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => chain().addColumnAfter().run()}
          >
            {t('editor.table.addColumnAfter')}
          </button>
          <button
            type="button"
            className="ed-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => chain().toggleHeaderRow().run()}
          >
            {t('editor.table.toggleHeaderRow')}
          </button>
          <button
            type="button"
            className="ed-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => chain().mergeOrSplit().run()}
          >
            {t('editor.table.mergeOrSplit')}
          </button>
          <button
            type="button"
            className="ed-btn"
            data-variant="danger"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => chain().deleteRow().run()}
          >
            {t('editor.table.deleteRow')}
          </button>
          <button
            type="button"
            className="ed-btn"
            data-variant="danger"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => chain().deleteColumn().run()}
          >
            {t('editor.table.deleteColumn')}
          </button>
          <button
            type="button"
            className="ed-btn"
            data-variant="danger"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => chain().deleteTable().run()}
          >
            <Trash aria-hidden /> {t('editor.table.deleteTable')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
