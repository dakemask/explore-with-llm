import { nanoid } from 'nanoid'
import { db, type Note, type SideAnchor } from '../db'
import { plainQuote } from './anchor'

/** Starts an (empty) note on a passage of `nodeId`'s reply or message and returns its id. */
export async function createNote(conversationId: string, nodeId: string, target: Note['target'], anchor: SideAnchor) {
  const now = Date.now()
  const note: Note = { id: nanoid(), conversationId, nodeId, target, anchor, text: '', createdAt: now, updatedAt: now }
  await db.notes.add(note)
  return note.id
}

export async function saveNoteText(id: string, text: string) {
  await db.notes.update(id, { text, updatedAt: Date.now() })
}

/** Empty (or blank) removes the title: the first line of the text shows again. */
export async function saveNoteTitle(id: string, title: string) {
  await db.notes
    .where(':id')
    .equals(id)
    .modify((n) => {
      if (title.trim()) n.title = title
      else delete n.title
      n.updatedAt = Date.now()
    })
}

/** A note left empty never existed: it is deleted outright (not archived). */
export async function deleteNote(id: string) {
  await db.notes.delete(id)
}

export async function archiveNote(id: string) {
  await db.notes.update(id, { archived: Date.now() })
}

export async function restoreNote(id: string) {
  await db.notes
    .where(':id')
    .equals(id)
    .modify((n) => {
      delete n.archived
    })
}

/** The first non-empty line of a note's text, Markdown markers dropped (its title when it has none). */
export function noteFirstLine(text: string) {
  return plainQuote(text.split('\n').find((l) => l.trim()) ?? '').trim()
}

/** A note's title: the user's, else its first line. */
export function noteTitle(note: Pick<Note, 'title' | 'text'>) {
  return note.title?.trim() || noteFirstLine(note.text)
}

/** The first few lines of a note as plain text (the marker bar's tip). */
export function noteSnippet(text: string, max = 140) {
  const lines = plainQuote(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' · ')
  return lines.length > max ? lines.slice(0, max) + '…' : lines
}
