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

/** The first non-empty line of a note, Markdown markers dropped (its collapsed card's title). */
export function noteTitle(text: string) {
  return plainQuote(text.split('\n').find((l) => l.trim()) ?? '').trim()
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
