import { NotebookPen } from 'lucide-react'
import { useMemo } from 'react'
import type { ChatNode, Note } from '../../db'
import { useT } from '../../i18n'
import { noteSnippet, noteTitle } from '../../lib/notes'
import type { ColumnItem } from './SideColumn'

/** Highlight ids of notes (`data-threads`) carry this before the note id. */
export const NOTE_PREFIX = 'note:'

/** A note on the active path, as the column shows it. */
export interface NoteItem extends ColumnItem {
  kind: 'note'
  nodeId: string
  note: Note
}

/** The non-archived notes on the nodes of the active path (a hidden node is never on it), in creation order. */
export function useNotes(path: ChatNode[], notes: Note[] | undefined) {
  const t = useT()

  return useMemo(() => {
    const onPath = new Set(path.map((n) => n.id))
    return (notes ?? [])
      .filter((n) => !n.archived && onPath.has(n.nodeId))
      .map((note): NoteItem => {
        const title = noteTitle(note)
        const snippet = noteSnippet(note.text)
        return {
          id: note.id,
          kind: 'note',
          mark: NOTE_PREFIX + note.id,
          nodeId: note.nodeId,
          note,
          title: (
            <span className="flex min-w-0 items-center gap-2">
              <NotebookPen size={13} className="shrink-0 text-node" />
              <span className={title ? 'truncate text-muted' : 'truncate text-faint'}>{title || t('note.new')}</span>
            </span>
          ),
          tip: (note.title?.trim() ? [note.title.trim(), snippet].filter(Boolean).join(' · ') : snippet) || t('note.new'),
        }
      })
  }, [notes, path, t])
}
