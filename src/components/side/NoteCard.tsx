import { NotebookPen, Pencil } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Note } from '../../db'
import { useT } from '../../i18n'
import { archiveNote, deleteNote, noteFirstLine, saveNoteText, saveNoteTitle } from '../../lib/notes'
import { Markdown } from '../chat/Markdown'
import { Button } from '../ui/Button'
import { CardMenu, NoteMenuItems } from './CardMenu'
import { collapseOnClick, HEADER_CLASS } from './SideColumn'

/**
 * The expanded card of a note in the column: the rendered Markdown with an Edit button, or a plain editor
 * (a new, empty note opens in it), under a title box in the header (empty = the text's first line shows,
 * as its placeholder). Typing saves after a short pause; leaving the editor saves at once. A note with
 * neither text nor title when its editor closes or its card goes away is deleted (it never existed).
 */
export function NoteCard({ note, onCollapse }: { note: Note; onCollapse: () => void }) {
  const t = useT()
  // Local text: IndexedDB writes are async, so binding to the stored note would drop keystrokes.
  const [text, setText] = useState(note.text)
  const [title, setTitle] = useState(note.title ?? '')
  const [editing, setEditing] = useState(!note.text.trim())
  const editor = useRef<HTMLTextAreaElement>(null)
  const latest = useRef({ text, saved: note.text, title, savedTitle: note.title ?? '' })
  latest.current.text = text
  latest.current.title = title
  const empty = () => !latest.current.text.trim() && !latest.current.title.trim()

  const flush = () => {
    const l = latest.current
    if (l.text !== l.saved) {
      l.saved = l.text
      void saveNoteText(note.id, l.text)
    }
    if (l.title !== l.savedTitle) {
      l.savedTitle = l.title
      void saveNoteTitle(note.id, l.title)
    }
  }
  useEffect(() => {
    const timer = setTimeout(flush, 400)
    return () => clearTimeout(timer)
  }, [text, title])

  // The card goes away (collapsed, another card expanded, conversation switched): save, or delete if empty.
  // Deferred so a remount right away (StrictMode) doesn't count.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      setTimeout(() => {
        if (mounted.current) return
        if (empty()) void deleteNote(note.id)
        else flush()
      })
    }
  }, [note.id])

  const done = () => {
    if (empty()) {
      void deleteNote(note.id)
      onCollapse()
      return
    }
    flush()
    setEditing(false)
  }

  const archive = async () => {
    flush()
    onCollapse()
    await archiveNote(note.id)
  }

  return (
    <>
      <header
        {...collapseOnClick(onCollapse)}
        className={HEADER_CLASS}
      >
        <div className="flex h-full min-w-0 flex-1 items-center gap-2">
          <NotebookPen size={13} className="shrink-0 text-node" />
          <input
            value={title}
            aria-label={t('note.titlePlaceholder')}
            placeholder={noteFirstLine(text) || t('note.titlePlaceholder')}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={flush}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter') {
                e.preventDefault()
                if (editing) editor.current?.focus()
                else setEditing(true)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                if (editing) done()
                else {
                  flush()
                  onCollapse()
                }
              }
            }}
            className="h-full min-w-0 flex-1 truncate bg-transparent placeholder:text-faint focus:outline-none"
          />
        </div>
        {(text.trim() || title.trim()) && (
          <CardMenu>
            <NoteMenuItems onArchive={() => void archive()} />
          </CardMenu>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {editing ? (
          // Fills the card (fixed height, like a side question's); its text scrolls inside.
          <textarea
            ref={editor}
            value={text}
            autoFocus
            placeholder={t('note.placeholder')}
            onFocus={(e) => e.currentTarget.setSelectionRange(text.length, text.length)}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape' || e.nativeEvent.isComposing) return
              e.preventDefault()
              done()
            }}
            className="block h-full w-full resize-none bg-transparent [scrollbar-gutter:stable] px-4 pt-3 pb-2 text-[13.5px] leading-relaxed placeholder:text-faint focus:outline-none"
          />
        ) : (
          <div className="px-4 pt-3 pb-1">
            <Markdown text={text} className="prose-compact" breaks />
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 py-2 pr-2 pl-4">
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-faint">{editing ? t('note.hint') : ''}</span>
        {editing ? (
          <Button size="sm" variant="primary" onClick={done}>
            {t('note.done')}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil size={13} />
            {t('note.edit')}
          </Button>
        )}
      </div>
    </>
  )
}
