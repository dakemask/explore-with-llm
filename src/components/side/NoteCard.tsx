import { Archive, ChevronsDownUp, NotebookPen, Pencil } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Note } from '../../db'
import { useT } from '../../i18n'
import { useAutosize } from '../../lib/hooks'
import { archiveNote, deleteNote, saveNoteText } from '../../lib/notes'
import { Markdown } from '../chat/Markdown'
import { Button, IconButton } from '../ui/Button'

/**
 * The expanded card of a note in the column: the rendered Markdown with an Edit button, or a plain editor
 * (a new, empty note opens in it). Typing saves after a short pause; leaving the editor saves at once. A
 * note that is empty when its editor closes or its card goes away is deleted (it never existed).
 */
export function NoteCard({ note, onCollapse }: { note: Note; onCollapse: () => void }) {
  const t = useT()
  // Local text: IndexedDB writes are async, so binding to the stored note would drop keystrokes.
  const [text, setText] = useState(note.text)
  const [editing, setEditing] = useState(!note.text.trim())
  const latest = useRef({ text, saved: note.text })
  latest.current.text = text

  const flush = () => {
    const { text, saved } = latest.current
    if (text === saved) return
    latest.current.saved = text
    void saveNoteText(note.id, text)
  }
  useEffect(() => {
    const timer = setTimeout(flush, 400)
    return () => clearTimeout(timer)
  }, [text])

  // The card goes away (collapsed, another card expanded, conversation switched): save, or delete if empty.
  // Deferred so a remount right away (StrictMode) doesn't count.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      setTimeout(() => {
        if (mounted.current) return
        if (!latest.current.text.trim()) void deleteNote(note.id)
        else flush()
      })
    }
  }, [note.id])

  const done = () => {
    if (!text.trim()) {
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

  const ref = useRef<HTMLTextAreaElement>(null)
  useAutosize(ref, editing ? text : '', 520)

  return (
    <>
      <header className="flex shrink-0 items-center gap-1 border-b border-border py-2 pr-2 pl-4">
        <div className="flex h-7 min-w-0 flex-1 items-center gap-2 text-[13px] font-medium text-muted">
          <NotebookPen size={14} className="shrink-0 text-mark-note-strong" />
          {t('note.label')}
        </div>
        {text.trim() && (
          <IconButton label={t('note.archive')} size="sm" onClick={archive}>
            <Archive size={15} />
          </IconButton>
        )}
        <IconButton label={t('side.collapse')} size="sm" onClick={onCollapse}>
          <ChevronsDownUp size={15} />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {editing ? (
          <textarea
            ref={ref}
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
            className="block min-h-24 w-full resize-none bg-transparent px-4 pt-3 pb-2 text-[13.5px] leading-relaxed placeholder:text-faint focus:outline-none"
          />
        ) : (
          <div className="px-4 pt-3 pb-1">
            <Markdown text={text} className="prose-compact" />
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
